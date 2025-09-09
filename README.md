# Infix Test Status Dashboard

A web-based dashboard for monitoring CI/CD status checks across multiple GitHub repositories and branches, optimized for embedded displays and small screens.

## Features

- **Individual Test Step Visibility**: See detailed build and test steps (Build Infix x86_64, Regression Tests, etc.) instead of just summary counts
- **Multi-Repository Monitoring**: Monitor multiple repositories and branches simultaneously
- **Real-time Status Updates**: Live GitHub Actions workflow status with auto-refresh
- **Embedded Display Optimized**: Specifically designed for 800x480 displays (Raspberry Pi touchscreens)
- **Responsive Grid Layout**: 2x2 grid for small screens, expandable for larger displays
- **Light/Dark Theme Toggle**: Light theme default with toggle option (🌙/☀️)
- **Clean Interface**: Hidden scrollbars with maintained scroll functionality
- **Large, Readable Fonts**: Optimized text sizes for small screen visibility
- **Configurable Refresh**: Customizable auto-refresh intervals

## Display Optimization

### Small Screens (800x480)
- **2x2 grid layout** showing up to 4 repositories
- **Large fonts** (16px+ for test steps) for easy reading
- **Individual test step display** with status indicators
- **Hidden scrollbars** while maintaining scroll functionality
- **Compact but readable** card design

### Larger Screens
- **Expandable grid** (3+ columns on wider displays)
- **Scalable font sizes** that adapt to screen size
- **Flexible layout** that grows with available space

## Setup

1. **Install dependencies:**
   ```bash
   npm install
   ```

2. **Set up GitHub token** (recommended to avoid API rate limits):
   ```bash
   export GITHUB_TOKEN=your_github_personal_access_token
   ```

3. **Configure repositories** in `config.json`:
   ```json
   {
     "repositories": [
       {
         "name": "Infix",
         "owner": "kernelkit",
         "repo": "infix",
         "branch": "main",
         "enabled": true
       }
     ],
     "settings": {
       "refreshInterval": 300,
       "display": {
         "itemsPerPage": 4,
         "resolution": "800x480"
       }
     }
   }
   ```

4. **Start the server:**
   ```bash
   npm start
   ```

5. **Access the dashboard:**
   - Local: http://localhost:3000
   - Network: http://[your-ip]:3000

## Configuration

### Repository Configuration
- `name`: Display name for the repository
- `owner`: GitHub username or organization  
- `repo`: Repository name
- `branch`: Branch to monitor (e.g., "main", "develop")
- `enabled`: Whether to include this repository in monitoring

### Settings Options
- `refreshInterval`: Auto-refresh interval in seconds (default: 300)
- `display.itemsPerPage`: Number of repositories to display (default: 4 for 800x480)
- `display.resolution`: Target resolution (default: "800x480")

## Test Step Display

The dashboard shows individual build and test steps with status indicators:

- ✅ **Build Infix x86_64** - Build job status
- ✅ **Build Infix AArch64** - Architecture-specific builds  
- ✅ **Regression Test x86_64** - Test execution status
- ✅ **eldermonta** - Custom test systems
- ✅ **styrmonta** - Additional test environments

## API Endpoints

- `GET /api/status` - Returns status for all configured repositories
- `GET /api/config` - Returns current configuration

## Status Indicators

- 🟢 **Green Dot**: Test/build step passed
- 🔴 **Red Dot**: Test/build step failed  
- 🟡 **Yellow Dot**: Test/build step in progress
- 🟣 **Purple Dot**: Error or unknown status

## Theme Toggle

- **Default**: Light theme (☀️ icon)
- **Toggle**: Click sun/moon icon to switch themes
- **Persistence**: Theme choice saved in browser localStorage

## Raspberry Pi Deployment

Perfect for Raspberry Pi with 800x480 touchscreen displays:

1. **Install Node.js on Pi:**
   ```bash
   curl -fsSL https://deb.nodesource.com/setup_18.x | sudo -E bash -
   sudo apt-get install -y nodejs
   ```

2. **Clone and setup:**
   ```bash
   git clone [your-repo-url]
   cd test-system-status
   npm install
   ```

3. **Configure for autostart** (optional):
   ```bash
   # Add to ~/.bashrc or create systemd service
   cd /path/to/test-system-status && npm start
   ```

4. **Open in fullscreen browser** for kiosk mode

## Adding New Repositories

1. **Edit `config.json`**
2. **Add new repository object:**
   ```json
   {
     "name": "My Project",
     "owner": "myorg", 
     "repo": "my-project",
     "branch": "main",
     "enabled": true
   }
   ```
3. **Restart server or wait for auto-refresh**

## Troubleshooting

### Network Issues
- **ETIMEDOUT errors**: Check internet connectivity and GitHub API access
- **Rate limiting**: Ensure GITHUB_TOKEN is set properly

### Display Issues  
- **Text too small**: Modify font sizes in `public/style.css` media queries
- **Layout problems**: Adjust grid settings in CSS for your specific resolution

### API Issues
- **No data loading**: Verify repository names and GitHub token permissions
- **Slow updates**: Adjust `refreshInterval` in config.json

## Development

The project structure:
- `server.js` - Express server and GitHub API integration
- `public/index.html` - Main dashboard interface
- `public/style.css` - Responsive styling with media queries
- `public/script.js` - Frontend JavaScript and theme management
- `config.json` - Repository and settings configuration

## License

MIT License - See LICENSE file for details