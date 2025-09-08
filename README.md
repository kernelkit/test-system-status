# Repository Status Dashboard

A web-based dashboard for monitoring CI/CD status checks across multiple GitHub repositories and branches.

## Features

- Monitor multiple repositories and branches
- Real-time status updates for GitHub Actions workflows
- Display detailed check results and failure information
- Configurable refresh intervals
- Responsive design optimized for small screens
- Dark theme interface

## Setup

1. Install dependencies:
   ```bash
   npm install
   ```

2. Set up GitHub token (optional but recommended to avoid rate limits):
   ```bash
   export GITHUB_TOKEN=your_github_token_here
   ```

3. Configure repositories in `config.json`:
   ```json
   {
     "repositories": [
       {
         "name": "Your Repo",
         "owner": "username",
         "repo": "repository-name",
         "branch": "main",
         "enabled": true
       }
     ]
   }
   ```

4. Start the server:
   ```bash
   npm start
   ```

5. Open http://localhost:3000 in your browser

## Configuration

### Repository Configuration
- `name`: Display name for the repository
- `owner`: GitHub username or organization
- `repo`: Repository name
- `branch`: Branch to monitor
- `enabled`: Whether to include this repository in monitoring

### Settings
- `refreshInterval`: Auto-refresh interval in seconds (default: 300)
- `display.itemsPerPage`: Number of repositories to display (default: 6)
- `display.resolution`: Target resolution (default: "800x480")

## API Endpoints

- `GET /api/status` - Returns status for all configured repositories
- `GET /api/config` - Returns current configuration

## Status Indicators

- 🟢 **Green**: All checks passed
- 🔴 **Red**: One or more checks failed
- 🟡 **Yellow**: Checks are still running
- 🟣 **Purple**: Error accessing repository data

## Adding New Repositories

1. Edit `config.json`
2. Add a new repository object to the `repositories` array
3. Restart the server or wait for the next refresh

Example:
```json
{
  "name": "My New Project",
  "owner": "myorg",
  "repo": "my-project",
  "branch": "develop",
  "enabled": true
}
```
