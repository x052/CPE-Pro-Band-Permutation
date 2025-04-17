# Huawei 5G CPE Pro router (H112-370) Band Permutation Test

A tool for testing all possible LTE band permutations on the Huawei 5G CPE Pro router (H112-370) to determine optimal settings for your location.

## Features

- Automatically test multiple LTE band combinations
- Measure download speed, upload speed, ping, and signal metrics for each combination
- Generate detailed reports with CSV and JSON outputs
- Automatically identify and skip problematic band combinations
- Resume capability for long test sessions
- Detailed progress tracking and time estimates

## Prerequisites

- Node.js 20 or higher
- TypeScript
- Huawei 5G CPE Pro router (H112-370)
- `speedtest-cli` installed on your system
- Administrator access to your router

## Installation

1. Clone this repository:
```bash
git clone https://github.com/x052/CPE-Pro-Band-Permutation.git
cd CPE-Pro-Band-Permutation
```

2. Install dependencies:
```bash
npm install
```

3. Build the project:
```bash
npm run build
```

## Usage

```bash
node dist/band-permutation-test.js --password YOUR_ROUTER_PASSWORD [options]
```

### Command Line Options

```
Options:
  -V, --version                     output the version number
  -p, --password <password>         Router password
  -o, --output <file>               Output file path (default: "results/band-permutation-results.csv")
  -w, --wait-time <seconds>         Wait time between band switch and test (in seconds) (default: "120")
  -s, --stabilize-time <seconds>    Time to wait after login before starting tests (in seconds) (default: "30")
  -r, --retries <number>            Number of retries for failed band switches (default: "2")
  -m, --max-bands <number>          Maximum number of bands to combine (default: "3")
  -l, --limit <number>              Limit number of combinations to test (0 for all) (default: "0")
  --include-bands <list>            Only test combinations including these bands (comma-separated)
  --exclude-bands <list>            Exclude combinations with these bands (comma-separated)
  --headless                        Run browser in headless mode
  --auto                            Include AUTO configuration in testing
  --shuffle                         Randomize the order of combinations
  --resume                          Resume testing from a previous session (default: false)
  --progress-file <file>            Path to progress file for resuming (default: "results/test-progress.json")
  -h, --help                        display help for command
```

### Examples

Test all band combinations with default settings:
```bash
node dist/band-permutation-test.js --password YOUR_ROUTER_PASSWORD
```

Test only combinations including bands 1, 3, and 7:
```bash
node dist/band-permutation-test.js --password YOUR_ROUTER_PASSWORD --include-bands 1,3,7
```

Resume a previous test session:
```bash
node dist/band-permutation-test.js --password YOUR_ROUTER_PASSWORD --resume
```

Limit to combinations of maximum 2 bands:
```bash
node dist/band-permutation-test.js --password YOUR_ROUTER_PASSWORD --max-bands 2
```

## How It Works

This tool:

1. Logs into your Huawei 5G CPE Pro router's web interface
2. Systematically tests different band combinations
3. For each combination:
   - Configures the router to use that band combination
   - Waits for the network to stabilize
   - Measures signal quality (RSRP, RSRQ, SINR)
   - Runs a speed test using speedtest-cli
   - Records all metrics
4. Generates a comprehensive report identifying the best bands for your location

The tool intelligently skips combinations that are likely to fail based on previous results.

## Result Analysis

After testing is complete, the tool will generate:

1. A CSV file with all test results
2. A JSON file with detailed metrics
3. A summary in the console showing:
   - Best download speed configuration
   - Best upload speed configuration
   - Best combined speed configuration
   - Best signal quality configuration
   - Top 5 combinations in each category

## Troubleshooting

- **No Service**: If you see many "No Service" results, try increasing the wait time with `--wait-time`
- **Browser Crashes**: Try running in headless mode with `--headless`
- **Speed Test Failures**: Ensure speedtest-cli is properly installed
- **Router Connection Issues**: Verify you can access your Huawei router at 192.168.8.1 and check your password
- **Incompatible Router**: This tool is specifically designed for the Huawei 5G CPE Pro router (H112-370). Other models may require modifications to the code.

## Security Note

This tool requires administrative access to your router. The password is used only for authentication with your router and is not stored or transmitted elsewhere. All testing is performed locally on your network.

## Contributing

Contributions are welcome! Please feel free to submit a Pull Request.

## License

MIT 