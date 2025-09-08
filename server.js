const express = require('express');
const axios = require('axios');
const cors = require('cors');
const fs = require('fs');
const path = require('path');

const app = express();
const PORT = process.env.PORT || 3000;

app.use(cors());
app.use(express.json());
app.use(express.static('public'));

const config = JSON.parse(fs.readFileSync('config.json', 'utf8'));

let GITHUB_TOKEN = process.env.GITHUB_TOKEN || config.settings.github.token;
// Handle token format in config (remove GITHUB_TOKEN= prefix if present)
if (GITHUB_TOKEN && GITHUB_TOKEN.startsWith('GITHUB_TOKEN=')) {
  GITHUB_TOKEN = GITHUB_TOKEN.replace('GITHUB_TOKEN=', '');
}

if (!GITHUB_TOKEN) {
  console.warn('Warning: GITHUB_TOKEN not set. API rate limits will apply.');
}

const githubApi = axios.create({
  baseURL: 'https://api.github.com',
  headers: GITHUB_TOKEN ? {
    'Authorization': `token ${GITHUB_TOKEN}`,
    'Accept': 'application/vnd.github.v3+json'
  } : {
    'Accept': 'application/vnd.github.v3+json'
  }
});

async function getRepoStatus(owner, repo, branch) {
  try {
    const [branchData, workflowRuns, checkRuns, statusChecks] = await Promise.all([
      githubApi.get(`/repos/${owner}/${repo}/branches/${branch}`),
      githubApi.get(`/repos/${owner}/${repo}/actions/runs?branch=${branch}&per_page=50`),
      githubApi.get(`/repos/${owner}/${repo}/commits/${branch}/check-runs`),
      githubApi.get(`/repos/${owner}/${repo}/commits/${branch}/status`)
    ]);

    const latestCommit = branchData.data.commit;
    const latestWorkflowRun = workflowRuns.data.workflow_runs[0];
    const checks = checkRuns.data.check_runs;
    const statuses = statusChecks.data.statuses || [];

    // Get detailed job information from multiple recent workflow runs
    const detailedWorkflowJobs = [];
    const recentRuns = workflowRuns.data.workflow_runs.slice(0, 5); // Look at top 5 most recent runs
    
    for (const run of recentRuns) {
      try {
        const jobsResponse = await githubApi.get(`/repos/${owner}/${repo}/actions/runs/${run.id}/jobs`);
        detailedWorkflowJobs.push(...jobsResponse.data.jobs);
      } catch (error) {
        console.error(`Error fetching jobs for run ${run.id}:`, error.message);
      }
    }
    
    console.log(`Jobs for ${owner}/${repo}:${branch}:`, detailedWorkflowJobs.map(j => `${j.name}: ${j.conclusion}`));
    console.log(`Statuses for ${owner}/${repo}:${branch}:`, statuses.map(s => `${s.context}: ${s.state} - ${s.description} - ${s.target_url}`));

    // For failed statuses with gist links, try to fetch the gist content
    const enrichedStatuses = await Promise.all(statuses.map(async (status) => {
      if (status.state === 'failure' && status.target_url && status.target_url.includes('gist.github.com')) {
        try {
          // Extract gist ID from URL
          const gistMatch = status.target_url.match(/gist\.github\.com\/[^\/]+\/([a-f0-9]+)/);
          if (gistMatch) {
            const gistId = gistMatch[1];
            const gistResponse = await githubApi.get(`/gists/${gistId}`);
            const gistFiles = Object.values(gistResponse.data.files);
            if (gistFiles.length > 0) {
              const gistContent = gistFiles[0].content;
              console.log(`Full gist content for ${status.context}:`, gistContent);
              return {
                ...status,
                gistContent: gistContent
              };
            }
          }
        } catch (error) {
          console.error('Error fetching gist:', error.message);
        }
      }
      return status;
    }));

    // Filter test-related checks and statuses
    const testChecks = checks.filter(check => check.name.startsWith('test-run-'));
    // Use enriched statuses with gist content
    const allStatuses = enrichedStatuses;

    const status = {
      repo: `${owner}/${repo}`,
      branch: branch,
      commit: {
        sha: latestCommit.sha.substring(0, 7),
        message: latestCommit.commit.message.split('\n')[0],
        author: latestCommit.commit.author.name,
        date: latestCommit.commit.author.date
      },
      workflow: latestWorkflowRun ? {
        name: latestWorkflowRun.name,
        status: latestWorkflowRun.status,
        conclusion: latestWorkflowRun.conclusion,
        url: latestWorkflowRun.html_url,
        created_at: latestWorkflowRun.created_at,
        updated_at: latestWorkflowRun.updated_at
      } : null,
      checks: checks.map(check => ({
        name: check.name,
        status: check.status,
        conclusion: check.conclusion,
        url: check.html_url,
        started_at: check.started_at,
        completed_at: check.completed_at
      })),
      statuses: statuses.map(status => ({
        context: status.context,
        state: status.state,
        description: status.description,
        target_url: status.target_url,
        created_at: status.created_at,
        updated_at: status.updated_at
      })),
      testChecks: testChecks.map(check => ({
        name: check.name,
        status: check.status,
        conclusion: check.conclusion,
        url: check.html_url,
        started_at: check.started_at,
        completed_at: check.completed_at,
        details_url: check.details_url
      })),
      failedJobs: (() => {
        // First deduplicate all jobs with latest run priority, then filter for failed ones
        const uniqueJobs = new Map();
        detailedWorkflowJobs.forEach(job => {
          const existingJob = uniqueJobs.get(job.name);
          if (!existingJob) {
            uniqueJobs.set(job.name, job);
          } else {
            // Keep existing job since jobs are sorted by most recent first
            // Don't replace - existing job is from more recent run
          }
        });
        // Now filter for only the failed/cancelled jobs
        return Array.from(uniqueJobs.values())
          .filter(job => job.conclusion === 'failure' || job.conclusion === 'cancelled')
          .map(job => ({
            name: job.name,
            conclusion: job.conclusion,
            html_url: job.html_url,
            steps: job.steps ? job.steps.filter(step => step.conclusion === 'failure' || step.conclusion === 'cancelled').map(step => ({
              name: step.name,
              conclusion: step.conclusion,
              number: step.number
            })) : []
          }));
      })(),
      // For failed test jobs, try to get logs
      failedTestJobs: await Promise.all(
        (() => {
          // First deduplicate test jobs with latest run priority, then filter for failed ones
          const uniqueTestJobs = new Map();
          const allTestJobs = detailedWorkflowJobs
            .filter(job => job.name.includes('test-run-') || job.name.includes('Regression Test'));
          
          allTestJobs.forEach(job => {
            const existingJob = uniqueTestJobs.get(job.name);
            if (!existingJob) {
              uniqueTestJobs.set(job.name, job);
            } else {
              // Keep existing job since jobs are sorted by most recent first
              // Don't replace - existing job is from more recent run
            }
          });
          
          // Now filter for only failed test jobs
          const filteredFailedTestJobs = Array.from(uniqueTestJobs.values())
            .filter(job => job.conclusion === 'failure');
          console.log(`Found ${filteredFailedTestJobs.length} failed test jobs for ${owner}/${repo}:${branch}:`, filteredFailedTestJobs.map(j => `${j.name}: ${j.conclusion}`));
          return filteredFailedTestJobs;
        })()
          .map(async (job) => {
            try {
              const logsResponse = await githubApi.get(`/repos/${owner}/${repo}/actions/jobs/${job.id}/logs`);
              console.log(`Got logs for failed job ${job.name}, length: ${logsResponse.data.length}`);
              return {
                name: job.name,
                conclusion: job.conclusion,
                html_url: job.html_url,
                logs: logsResponse.data
              };
            } catch (error) {
              console.error(`Error fetching logs for job ${job.id}:`, error.message);
              return {
                name: job.name,
                conclusion: job.conclusion,
                html_url: job.html_url,
                logs: null
              };
            }
          })
      ),
      allJobs: (() => {
        // Deduplicate jobs by name, prioritizing latest run over success status
        const uniqueJobs = new Map();
        console.log(`DEBUG: Starting deduplication for ${owner}/${repo}:${branch} with ${detailedWorkflowJobs.length} jobs`);
        detailedWorkflowJobs.forEach((job, index) => {
          const existingJob = uniqueJobs.get(job.name);
          if (!existingJob) {
            console.log(`DEBUG: Adding new job ${job.name}: ${job.conclusion}`);
            uniqueJobs.set(job.name, job);
          } else {
            console.log(`DEBUG: Found duplicate job ${job.name}: existing=${existingJob.conclusion}, new=${job.conclusion}`);
            // Always keep the first job encountered since jobs are sorted by most recent first
            console.log(`DEBUG: Keeping existing job ${job.name}: ${existingJob.conclusion} (latest run priority)`);
            // Don't replace - existing job is from more recent run
          }
        });
        const deduplicatedJobs = Array.from(uniqueJobs.values()).map(job => ({
          name: job.name,
          conclusion: job.conclusion,
          html_url: job.html_url
        }));
        console.log(`DEBUG: Final deduplicated jobs for ${owner}/${repo}:${branch}:`, deduplicatedJobs.map(j => `${j.name}: ${j.conclusion}`));
        return deduplicatedJobs;
      })(),
      allStatuses: allStatuses.map(status => ({
        context: status.context,
        state: status.state,
        description: status.description,
        target_url: status.target_url,
        created_at: status.created_at,
        updated_at: status.updated_at,
        gistContent: status.gistContent
      }))
    };

    return status;
  } catch (error) {
    console.error(`Error fetching status for ${owner}/${repo}:`, error.message);
    return {
      repo: `${owner}/${repo}`,
      branch: branch,
      error: error.response?.data?.message || error.message
    };
  }
}

app.get('/api/status', async (req, res) => {
  try {
    const statusPromises = config.repositories
      .filter(repo => repo.enabled)
      .map(repo => getRepoStatus(repo.owner, repo.repo, repo.branch));
    
    const statuses = await Promise.all(statusPromises);
    res.json({
      timestamp: new Date().toISOString(),
      repositories: statuses
    });
  } catch (error) {
    console.error('Error in /api/status:', error);
    res.status(500).json({ error: 'Internal server error' });
  }
});

app.get('/api/config', (req, res) => {
  res.json(config);
});

app.listen(PORT, () => {
  console.log(`Dashboard server running on http://localhost:${PORT}`);
});