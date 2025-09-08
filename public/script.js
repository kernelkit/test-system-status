let refreshInterval;
let config;

async function fetchConfig() {
    try {
        const response = await fetch('/api/config');
        config = await response.json();
        return config;
    } catch (error) {
        console.error('Error fetching config:', error);
        return null;
    }
}

async function fetchRepositoryStatus() {
    try {
        const response = await fetch('/api/status');
        const data = await response.json();
        return data;
    } catch (error) {
        console.error('Error fetching repository status:', error);
        return null;
    }
}

function getStatusClass(status, conclusion) {
    if (status === 'completed') {
        return conclusion === 'success' ? 'success' : 'failure';
    }
    if (status === 'in_progress' || status === 'queued') {
        return 'pending';
    }
    return 'error';
}

function getStatusClassFromState(state) {
    switch (state) {
        case 'success':
            return 'success';
        case 'failure':
        case 'error':
            return 'failure';
        case 'pending':
            return 'pending';
        default:
            return 'error';
    }
}

function formatDate(dateString) {
    if (!dateString) return '--';
    const date = new Date(dateString);
    const now = new Date();
    const diffMinutes = Math.floor((now - date) / (1000 * 60));
    
    if (diffMinutes < 1) return 'just now';
    if (diffMinutes < 60) return `${diffMinutes}m ago`;
    if (diffMinutes < 1440) return `${Math.floor(diffMinutes / 60)}h ago`;
    return date.toLocaleDateString();
}

function createRepositoryCard(repo) {
    const hasError = repo.error;
    
    if (hasError) {
        return `
            <div class="repo-card error">
                <div class="repo-header">
                    <div class="repo-title">${repo.repo}</div>
                    <div class="branch-badge">${repo.branch}</div>
                </div>
                <div class="error-message">${repo.error}</div>
            </div>
        `;
    }

    // Determine overall status
    const workflowStatus = repo.workflow ? 
        getStatusClass(repo.workflow.status, repo.workflow.conclusion) : 'error';
    
    const failedChecks = repo.checks ? 
        repo.checks.filter(check => getStatusClass(check.status, check.conclusion) === 'failure') : [];
    
    const failedStatuses = repo.statuses ? 
        repo.statuses.filter(status => status.state === 'failure' || status.state === 'error') : [];
    
    const pendingStatuses = repo.statuses ? 
        repo.statuses.filter(status => status.state === 'pending') : [];
    
    // Determine overall status considering all checks and statuses
    let overallStatus = workflowStatus;
    if (failedChecks.length > 0 || failedStatuses.length > 0) {
        overallStatus = 'failure';
    } else if (pendingStatuses.length > 0 || workflowStatus === 'pending') {
        overallStatus = 'pending';
    } else if (workflowStatus === 'success' && repo.statuses && repo.statuses.length > 0) {
        // Check if all statuses are successful
        const allStatusesSuccess = repo.statuses.every(status => status.state === 'success');
        overallStatus = allStatusesSuccess ? 'success' : 'pending';
    }
    const cardClass = overallStatus === 'failure' ? 'repo-card failed' : 'repo-card';

    // Process test jobs - only include build and test jobs, filter out everything else
    const testJobs = (repo.allJobs || []).filter(job => 
        job.name.includes('test-run-') || 
        job.name.includes('Regression Test') ||
        job.name.includes('Build infix') ||
        job.name.includes('build-') // Include build jobs (build-x86_64, build-aarch64, etc.)
    );
    
    const testStatuses = (repo.allStatuses || []);
    
    // Count test results
    const testResults = {
        passed: 0,
        failed: 0,
        pending: 0,
        cancelled: 0
    };
    
    // Get failed test jobs with logs
    const failedTestJobs = repo.failedTestJobs || [];
    const failedTestJobsMap = new Map(failedTestJobs.map(job => [job.name, job.logs]));
    
    const allTests = [...testJobs.map(job => ({
        name: job.name.replace(/.*\/ /, ''), // Clean job name
        status: job.conclusion === 'success' ? 'passed' : 
               job.conclusion === 'failure' ? 'failed' : 
               job.conclusion === 'cancelled' ? 'cancelled' : 'pending',
        type: 'job',
        logs: failedTestJobsMap.get(job.name) || null
    })), ...testStatuses.map(status => ({
        name: status.context,
        status: status.state === 'success' ? 'passed' : 
               status.state === 'failure' || status.state === 'error' ? 'failed' : 'pending',
        type: 'status',
        description: status.description,
        gistContent: status.gistContent || null
    }))];
    
    // Count results
    allTests.forEach(test => {
        testResults[test.status]++;
    });
    
    const totalTests = allTests.length;
    
    // Create test summary
    const testSummaryHtml = totalTests > 0 ? `
        <div class="test-summary">
            <div class="test-counts">
                ${testResults.passed > 0 ? `<span class="count-item passed">${testResults.passed} passed</span>` : ''}
                ${testResults.failed > 0 ? `<span class="count-item failed">${testResults.failed} failed</span>` : ''}
                ${testResults.pending > 0 ? `<span class="count-item pending">${testResults.pending} pending</span>` : ''}
                ${testResults.cancelled > 0 ? `<span class="count-item cancelled">${testResults.cancelled} cancelled</span>` : ''}
            </div>
        </div>
    ` : '';
    
    // Parse failed test details from descriptions, gist content, or job logs
    function parseFailedTests(description, testName, gistContent, jobLogs) {
        // First try to parse from gist content if available (@ael-bot tests)
        if (gistContent) {
            console.log(`Parsing gist content for ${testName}, content length: ${gistContent.length}`);
            // Look for various test failure patterns in markdown gist content
            const patterns = [
                // Look for red circles (failed tests) in exact gist format
                /-\s*:red_circle:\s*:\s*(\d{4}-[a-zA-Z0-9_-]+\.(py|sh|yaml))/g,
                // Look for FAIL: patterns in plain text
                /FAIL:\s*(\d{4}-[a-zA-Z0-9_-]+\.(py|sh))/g
            ];
            
            let allFailedFiles = [];
            
            patterns.forEach(pattern => {
                let match;
                while ((match = pattern.exec(gistContent)) !== null) {
                    allFailedFiles.push(match[1]); // Extract the captured filename group
                }
                pattern.lastIndex = 0; // Reset regex state for next use
            });
            
            console.log(`Raw failed files found for ${testName}:`, allFailedFiles);
            
            // Remove duplicates and filter out obvious non-test files
            allFailedFiles = [...new Set(allFailedFiles)].filter(file => 
                file.length > 0 && 
                !file.includes('|') && 
                !file.includes('#') &&
                !file.includes(':') &&
                (file.includes('test') || file.match(/^\d{4}/))
            );
            
            console.log(`Parsed failed tests for ${testName}:`, allFailedFiles);
            
            if (allFailedFiles.length > 0) {
                // Clean up the file names by removing number prefix and file extension
                const cleanedFiles = allFailedFiles.map(file => {
                    // Remove number prefix (e.g., "0003-" -> "")
                    let cleaned = file.replace(/^\d{4}-/, '');
                    // Remove file extension (.py, .sh, .yaml)
                    cleaned = cleaned.replace(/\.(py|sh|yaml)$/, '');
                    return cleaned;
                }).filter(file => file !== 'all'); // Filter out 'all' since it just indicates any test failed
                
                return {
                    testSystem: testName,
                    failedFiles: cleanedFiles
                };
            }
        }
        
        // Try to parse from GitHub Actions job logs (@github-actions tests)
        if (jobLogs) {
            console.log(`Parsing job logs for ${testName}`);
            
            // Method 1: Look for 9PM test framework failures
            // Find all "Starting test" lines and "not ok" lines, then match them up
            const startingTestLines = [];
            const notOkLines = [];
            
            const lines = jobLogs.split('\n');
            lines.forEach((line, index) => {
                const startMatch = line.match(/Starting test (\d{4}-[a-zA-Z0-9_-]+\.py)/);
                if (startMatch) {
                    startingTestLines.push({ index, file: startMatch[1] });
                }
                
                if (line.includes('not ok ')) {
                    notOkLines.push({ index, line });
                }
            });
            
            // Match "not ok" lines to their corresponding test files
            let failedFiles = [];
            notOkLines.forEach(notOk => {
                // Find the most recent "Starting test" line before this "not ok"
                let correspondingTest = null;
                for (let i = startingTestLines.length - 1; i >= 0; i--) {
                    if (startingTestLines[i].index < notOk.index) {
                        correspondingTest = startingTestLines[i];
                        break;
                    }
                }
                if (correspondingTest) {
                    failedFiles.push(correspondingTest.file);
                }
            });
            
            // Method 2: Fallback to other patterns for different test formats
            const fallbackPatterns = [
                /FAILED\s+([^\s]+\.py::[^\s]+)/g,
                /FAIL:\s*(\d{4}-[a-zA-Z0-9_-]+\.(py|sh))/g,
                /ERROR.*?(\d{4}-[a-zA-Z0-9_-]+\.(py|sh))/g,
                /(\d{4}-[a-zA-Z0-9_-]+\.(py|sh)).*?AssertionError/g
            ];
            
            fallbackPatterns.forEach(pattern => {
                const matches = [...(jobLogs.match(pattern) || [])];
                const cleanMatches = matches.map(match => {
                    const fileMatch = match.match(/(\d{4}-[a-zA-Z0-9_-]+\.(py|sh))/);
                    return fileMatch ? fileMatch[1] : null;
                }).filter(Boolean);
                failedFiles.push(...cleanMatches);
            });
            
            // Remove duplicates
            failedFiles = [...new Set(failedFiles)];
            
            console.log(`Parsed failed tests from job logs for ${testName}:`, failedFiles);
            
            if (failedFiles.length > 0) {
                // Clean up the file names by removing number prefix and file extension
                const cleanedFiles = failedFiles.map(file => {
                    // Remove number prefix (e.g., "0003-" -> "")
                    let cleaned = file.replace(/^\d{4}-/, '');
                    // Remove file extension (.py, .sh, .yaml)
                    cleaned = cleaned.replace(/\.(py|sh|yaml)$/, '');
                    return cleaned;
                }).filter(file => file !== 'all'); // Filter out 'all' since it just indicates any test failed
                
                return {
                    testSystem: testName,
                    failedFiles: cleanedFiles
                };
            }
        }
        
        // Fallback to description parsing
        if (!description) return null;
        
        const testFilePattern = /(\d{4}-[a-zA-Z-]+\.(py|sh)|\w+\.py|\w+\.sh)/g;
        const failedTestFiles = [...(description.match(testFilePattern) || [])];
        
        if (failedTestFiles.length > 0) {
            // Clean up the file names by removing number prefix and file extension
            const cleanedFiles = failedTestFiles.map(file => {
                // Remove number prefix (e.g., "0003-" -> "")
                let cleaned = file.replace(/^\d{4}-/, '');
                // Remove file extension (.py, .sh, .yaml)
                cleaned = cleaned.replace(/\.(py|sh|yaml)$/, '');
                return cleaned;
            }).filter(file => file !== 'all'); // Filter out 'all' since it just indicates any test failed
            
            return {
                testSystem: testName,
                failedFiles: cleanedFiles
            };
        }
        
        return null;
    }

    // Show ALL test systems with their status
    const allTestsDetailHtml = allTests.length > 0 ? allTests.map(test => {
        console.log(`Processing test: ${test.name}, has gistContent: ${!!test.gistContent}`);
        const parsedFailures = parseFailedTests(test.description, test.name, test.gistContent, test.logs);
        const statusDot = test.status === 'failed' ? 'failure' : 
                         test.status === 'passed' ? 'success' : 
                         test.status === 'pending' ? 'pending' : 'error';
        
        if (test.status === 'failed' && parsedFailures && parsedFailures.failedFiles.length > 0) {
            return `
                <div class="test-detail ${test.status}">
                    <div class="status-dot ${statusDot}"></div>
                    <div class="test-info">
                        <div class="test-name">${parsedFailures.testSystem} failed tests:</div>
                        <div class="failed-test-files">${parsedFailures.failedFiles.join(', ')}</div>
                    </div>
                </div>
            `;
        } else {
            return `
                <div class="test-detail ${test.status}">
                    <div class="status-dot ${statusDot}"></div>
                    <div class="test-info">
                        <div class="test-name">${test.name}</div>
                        ${test.status === 'failed' && test.description ? `<div class="test-description">${test.description}</div>` : ''}
                    </div>
                </div>
            `;
        }
    }).join('') : '';
    
    const failedTestsHtml = allTestsDetailHtml;
    
    const allTestsHtml = testSummaryHtml + failedTestsHtml;

    // Show detailed info if there are failures or pending
    const failedChecksHtml = failedChecks.length > 0 ? 
        failedChecks.map(check => `
            <div class="check-item failed">
                <div class="status-dot failure"></div>
                <span>${check.name}</span>
            </div>
        `).join('') : '';

    const failedStatusesHtml = failedStatuses.length > 0 ? 
        failedStatuses.map(status => `
            <div class="check-item failed">
                <div class="status-dot failure"></div>
                <span>${status.context}</span>
            </div>
        `).join('') : '';

    const pendingStatusesHtml = pendingStatuses.length > 0 ? 
        pendingStatuses.map(status => `
            <div class="check-item">
                <div class="status-dot pending"></div>
                <span>${status.context}</span>
            </div>
        `).join('') : '';

    const allFailuresHtml = failedChecksHtml + failedStatusesHtml;
    const allPendingHtml = pendingStatusesHtml;

    return `
        <div class="${cardClass}">
            <div class="repo-header">
                <div class="repo-title">${repo.repo}</div>
                <div class="branch-badge">${repo.branch}</div>
            </div>
            
            <div class="commit-info-minimal">
                ${repo.commit.sha} • ${formatDate(repo.commit.date)}
            </div>
            
            <div class="checks-list">
                ${allTestsHtml || `<div class="status-summary"><div class="status-dot ${overallStatus}"></div><span>No tests found</span></div>`}
            </div>
        </div>
    `;
}

function updateDashboard(data) {
    console.log('updateDashboard called with data:', data);
    const repositoriesContainer = document.getElementById('repositories');
    
    if (!data || !data.repositories) {
        repositoriesContainer.innerHTML = '<div class="loading">Error loading data</div>';
        return;
    }

    const cardsHtml = data.repositories.map(repo => createRepositoryCard(repo)).join('');
    repositoriesContainer.innerHTML = cardsHtml;
    
    document.getElementById('last-updated').textContent = 
        `Last updated: ${formatDate(data.timestamp)}`;
}

async function refreshData() {
    const refreshBtn = document.getElementById('refresh-btn');
    refreshBtn.style.opacity = '0.5';
    refreshBtn.disabled = true;
    
    try {
        const data = await fetchRepositoryStatus();
        updateDashboard(data);
    } catch (error) {
        console.error('Error refreshing data:', error);
    } finally {
        refreshBtn.style.opacity = '1';
        refreshBtn.disabled = false;
    }
}

function startAutoRefresh() {
    if (refreshInterval) {
        clearInterval(refreshInterval);
    }
    
    const intervalMs = (config?.settings?.refreshInterval || 300) * 1000;
    refreshInterval = setInterval(refreshData, intervalMs);
}

async function init() {
    await fetchConfig();
    await refreshData();
    startAutoRefresh();
}

document.addEventListener('DOMContentLoaded', init);

window.refreshData = refreshData;