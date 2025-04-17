import { chromium } from "playwright";
import { monitoringScript } from "./monitoringScript.js";
import { Command } from "commander";
import { promisify } from "util";
import { exec } from "child_process";
import * as fs from "fs";
import * as path from "path";
import { Page } from "playwright";

const execAsync = promisify(exec);

// Available bands based on your router
const AVAILABLE_BANDS = [
  "1", // B1
  "3", // B3
  "7", // B7
  "8", // B8
  "20", // B20
  "28", // B28
  "32", // B32
  "34", // B34
  "38", // B38
  "39", // B39
  "40", // B40
  "41", // B41
  "42", // B42
  "43", // B43
];

interface TestResult {
  timestamp: string;
  band: string;
  bandCombination: string;
  rsrp: string;
  rsrq: string;
  sinr: string;
  enbId: string;
  cellId: string;
  downloadSpeed: number;
  uploadSpeed: number;
  ping: number;
  testDuration: number;
}

// Progress tracking interface
interface TestProgress {
  completedCombinations: string[];
  results: TestResult[];
  lastUpdated: string;
}

// Interface for signal metrics
interface SignalMetrics {
  band: string;
  rsrp: string;
  rsrq: string;
  sinr: string;
  cellId: string;
  enbId: string;
}

// Interface for speedtest-cli results
interface SpeedtestResult {
  download: number;
  upload: number;
  ping: number;
}

// Interface to track failed bands
interface FailureTracking {
  // Hard failed bands (no service) - exclude from all combinations
  noServiceBands: Set<string>;
  // Soft failed bands (had service but speedtest failed) - can be included in combinations, but not together
  speedtestFailedBands: Set<string>;
  // Combinations to skip
  skipCombinations: Set<string>;
}

// Declare global extensions for TypeScript
declare global {
  interface Window {
    addButtons?: () => void;
    ltebandselection?: (band?: string) => void;
  }
}

/**
 * Generate all possible combinations of bands
 * @param maxBands Maximum number of bands to combine
 * @returns Array of band combinations
 */
function generateBandCombinations(maxBands: number = 3): string[] {
  const combinations: string[] = [];

  // Start with single bands (except band 1)
  for (const band of AVAILABLE_BANDS) {
    combinations.push(band);
  }

  // Generate combinations of 2 to maxBands
  for (let size = 2; size <= maxBands; size++) {
    generateCombinationsOfSize([], 0, size, combinations);
  }

  return combinations;
}

/**
 * Helper function for recursive combination generation
 */
function generateCombinationsOfSize(
  current: string[],
  start: number,
  size: number,
  result: string[]
): void {
  if (current.length === size) {
    // Sort bands numerically before adding to ensure unique combinations
    const sortedBands = [...current].sort((a, b) => parseInt(a) - parseInt(b));
    result.push(sortedBands.join("+"));
    return;
  }

  for (let i = start; i < AVAILABLE_BANDS.length; i++) {
    current.push(AVAILABLE_BANDS[i]);
    generateCombinationsOfSize(current, i + 1, size, result);
    current.pop();
  }
}

async function runSpeedtest(
  bands: string[],
  password: string,
  waitTime: number,
  retries: number
): Promise<TestResult> {
  console.log(`Testing band combination: ${bands.join(", ")}`);

  const browser = await chromium.launch({ headless: false });
  const context = await browser.newContext();
  const page = await context.newPage();

  try {
    // Apply band configuration
    await page.goto("http://192.168.8.1/html/home.html");
    await page.waitForLoadState("networkidle");

    // Login (adjust selectors based on your router's interface)
    await page.fill('input[name="password"]', password);
    await page.click('button[type="submit"]');
    await page.waitForLoadState("networkidle");

    // Navigate to band settings page (adjust URL based on your router)
    await page.goto(
      "http://192.168.8.1/html/content.html#settings/settingsModem"
    );
    await page.waitForLoadState("networkidle");

    // Configure bands (this is a simplified example, adjust for your router)
    // Uncheck all bands first
    const checkboxes = await page.$$('input[type="checkbox"]');
    for (const checkbox of checkboxes) {
      await checkbox.uncheck();
    }

    // Check only the bands we want to test
    for (const band of bands) {
      const bandSelector = `input[name="band${band}"]`; // Adjust selector based on your router
      await page.check(bandSelector);
    }

    // Save settings
    await page.click("button#apply");
    await page.waitForLoadState("networkidle");

    // Wait for network to stabilize
    console.log(`Waiting ${waitTime} seconds for network to stabilize...`);
    await new Promise((resolve) => setTimeout(resolve, waitTime * 1000));

    // Run the speed test
    let downloadSpeed = 0;
    let uploadSpeed = 0;
    let ping = 0;
    let rsrp = "";
    let rsrq = "";
    let sinr = "";
    let enbId = "";
    let cellId = "";
    let attempt = 0;

    while (attempt < retries) {
      attempt++;
      console.log(`Speed test attempt ${attempt}/${retries}`);

      try {
        // Navigate to the monitoring page
        await page.goto("http://192.168.8.1/html/content.html#status/status");
        await page.waitForLoadState("networkidle");

        // Execute monitoring script to get signal metrics
        const signalMetrics = (await page.evaluate(
          monitoringScript
        )) as SignalMetrics;
        rsrp = signalMetrics.rsrp;
        rsrq = signalMetrics.rsrq;
        sinr = signalMetrics.sinr;
        enbId = signalMetrics.enbId;
        cellId = signalMetrics.cellId;

        // Run speedtest-cli instead of browser-based test
        const speedTestResult = await runSpeedtestCli();
        downloadSpeed = speedTestResult.download;
        uploadSpeed = speedTestResult.upload;
        ping = speedTestResult.ping;

        // If we got valid results, break the retry loop
        if (downloadSpeed > 0 && uploadSpeed > 0) {
          break;
        }
      } catch (error) {
        console.error(`Attempt ${attempt} failed:`, error);
      }

      // Wait before retrying
      if (attempt < retries) {
        await new Promise((resolve) => setTimeout(resolve, 5000));
      }
    }

    // Create a band combination string
    const bandCombination = bands.join("+");

    // Calculate test duration
    const testDuration = 0; // You may want to calculate this based on start/end times

    return {
      timestamp: new Date().toISOString(),
      band: bands[0] || "", // Primary band
      bandCombination,
      rsrp,
      rsrq,
      sinr,
      enbId,
      cellId,
      downloadSpeed,
      uploadSpeed,
      ping,
      testDuration,
    };
  } finally {
    await browser.close();
  }
}

async function saveResults(results: TestResult[], outputFile: string) {
  // Ensure directory exists
  const dir = path.dirname(outputFile);
  if (!fs.existsSync(dir)) {
    fs.mkdirSync(dir, { recursive: true });
  }

  // Create CSV content
  const headers =
    "timestamp,band,bandCombination,rsrp,rsrq,sinr,enbId,cellId,downloadSpeed,uploadSpeed,ping,testDuration\n";
  const rows = results
    .map((result) => {
      return [
        result.timestamp,
        result.band,
        result.bandCombination,
        result.rsrp,
        result.rsrq,
        result.sinr,
        result.enbId,
        result.cellId,
        result.downloadSpeed,
        result.uploadSpeed,
        result.ping,
        result.testDuration,
      ].join(",");
    })
    .join("\n");

  const csvContent = headers + rows;

  // Write to file
  fs.writeFileSync(outputFile, csvContent, "utf8");
  console.log(`Results saved to ${outputFile}`);

  // Also create a JSON file for more detailed data
  const jsonOutputFile = outputFile.replace(/\.csv$/, ".json");
  fs.writeFileSync(jsonOutputFile, JSON.stringify(results, null, 2), "utf8");
  console.log(`JSON results saved to ${jsonOutputFile}`);

  // Generate summary
  console.log("\n========= TEST SUMMARY =========");
  console.log(`Total combinations tested: ${results.length}`);

  if (results.length > 0) {
    // Find best download
    const bestDownload = results.reduce((prev, current) =>
      prev.downloadSpeed > current.downloadSpeed ? prev : current
    );

    // Find best upload
    const bestUpload = results.reduce((prev, current) =>
      prev.uploadSpeed > current.uploadSpeed ? prev : current
    );

    // Find best combined (sum of download and upload)
    const bestCombined = results.reduce((prev, current) =>
      prev.downloadSpeed + prev.uploadSpeed >
      current.downloadSpeed + current.uploadSpeed
        ? prev
        : current
    );

    // Find best signal quality (highest SINR)
    const bestSignal = results.reduce((prev, current) => {
      const prevSINR = parseFloat(prev.sinr);
      const currentSINR = parseFloat(current.sinr);
      return !isNaN(prevSINR) && !isNaN(currentSINR) && prevSINR > currentSINR
        ? prev
        : current;
    });

    // Find top 5 for download speed
    const top5Download = [...results]
      .sort((a, b) => b.downloadSpeed - a.downloadSpeed)
      .slice(0, 5);

    // Find top 5 for upload speed
    const top5Upload = [...results]
      .sort((a, b) => b.uploadSpeed - a.uploadSpeed)
      .slice(0, 5);

    // Find top 5 for combined speed
    const top5Combined = [...results]
      .sort(
        (a, b) =>
          b.downloadSpeed + b.uploadSpeed - (a.downloadSpeed + a.uploadSpeed)
      )
      .slice(0, 5);

    console.log("\nBest Download Speed:");
    console.log(`Band: ${bestDownload.bandCombination}`);
    console.log(`Download: ${bestDownload.downloadSpeed} Mbps`);
    console.log(`Upload: ${bestDownload.uploadSpeed} Mbps`);
    console.log(
      `SINR: ${bestDownload.sinr}, RSRP: ${bestDownload.rsrp}, RSRQ: ${bestDownload.rsrq}`
    );
    console.log(`ENB ID: ${bestDownload.enbId}`);

    console.log("\nBest Upload Speed:");
    console.log(`Band: ${bestUpload.bandCombination}`);
    console.log(`Upload: ${bestUpload.uploadSpeed} Mbps`);
    console.log(`Download: ${bestUpload.downloadSpeed} Mbps`);
    console.log(
      `SINR: ${bestUpload.sinr}, RSRP: ${bestUpload.rsrp}, RSRQ: ${bestUpload.rsrq}`
    );
    console.log(`ENB ID: ${bestUpload.enbId}`);

    console.log("\nBest Combined Speed:");
    console.log(`Band: ${bestCombined.bandCombination}`);
    console.log(
      `Combined: ${bestCombined.downloadSpeed + bestCombined.uploadSpeed} Mbps`
    );
    console.log(`Download: ${bestCombined.downloadSpeed} Mbps`);
    console.log(`Upload: ${bestCombined.uploadSpeed} Mbps`);
    console.log(
      `SINR: ${bestCombined.sinr}, RSRP: ${bestCombined.rsrp}, RSRQ: ${bestCombined.rsrq}`
    );
    console.log(`ENB ID: ${bestCombined.enbId}`);

    console.log("\nBest Signal Quality:");
    console.log(`Band: ${bestSignal.bandCombination}`);
    console.log(
      `SINR: ${bestSignal.sinr}, RSRP: ${bestSignal.rsrp}, RSRQ: ${bestSignal.rsrq}`
    );
    console.log(`Download: ${bestSignal.downloadSpeed} Mbps`);
    console.log(`Upload: ${bestSignal.uploadSpeed} Mbps`);
    console.log(`ENB ID: ${bestSignal.enbId}`);

    console.log("\nTop 5 Download Speeds:");
    top5Download.forEach((result, index) => {
      console.log(
        `${index + 1}. Band ${result.bandCombination}: ${
          result.downloadSpeed
        } Mbps down, ${result.uploadSpeed} Mbps up`
      );
    });

    console.log("\nTop 5 Upload Speeds:");
    top5Upload.forEach((result, index) => {
      console.log(
        `${index + 1}. Band ${result.bandCombination}: ${
          result.uploadSpeed
        } Mbps up, ${result.downloadSpeed} Mbps down`
      );
    });

    console.log("\nTop 5 Combined Speeds:");
    top5Combined.forEach((result, index) => {
      console.log(
        `${index + 1}. Band ${result.bandCombination}: ${
          result.downloadSpeed + result.uploadSpeed
        } Mbps combined (${result.downloadSpeed} down, ${
          result.uploadSpeed
        } up)`
      );
    });
  }

  console.log("=================================");
}

/**
 * Save current test progress to resume later
 * @param progress Test progress data
 * @param progressFile Path to save progress file
 */
async function saveProgress(
  progress: TestProgress,
  progressFile: string
): Promise<void> {
  // Ensure directory exists
  const dir = path.dirname(progressFile);
  if (!fs.existsSync(dir)) {
    fs.mkdirSync(dir, { recursive: true });
  }

  // Update timestamp
  progress.lastUpdated = new Date().toISOString();

  // Write progress to file
  fs.writeFileSync(progressFile, JSON.stringify(progress, null, 2), "utf8");
  console.log(`Progress saved to ${progressFile}`);
}

/**
 * Load test progress from file
 * @param progressFile Path to progress file
 * @returns Test progress data or null if file doesn't exist
 */
async function loadProgress(
  progressFile: string
): Promise<TestProgress | null> {
  if (!fs.existsSync(progressFile)) {
    return null;
  }

  try {
    const data = fs.readFileSync(progressFile, "utf8");
    const progress = JSON.parse(data) as TestProgress;
    console.log(`Loaded progress from ${progressFile}`);
    console.log(
      `Previously completed: ${progress.completedCombinations.length} combinations`
    );
    console.log(`Last updated: ${progress.lastUpdated}`);
    return progress;
  } catch (error) {
    console.error(`Error loading progress file: ${error}`);
    return null;
  }
}

async function configureBands(page: Page, band: string): Promise<void> {
  console.log(`Configuring bands: ${band}`);

  try {
    // Navigate to band settings page if needed
    await page.goto("http://192.168.8.1/html/mobilenetworksettings.html");
    await page.waitForTimeout(2000);

    // Wait for the settings page to load
    await page.waitForSelector("#network_mode_select", { timeout: 10000 });

    // First set to LTE mode
    await page.selectOption("#network_mode_select", "NETWORK_MODE_LTE");
    await page.waitForTimeout(1000);

    // Click the band selection button or dropdown
    await page.click("#lte_band_select_button");
    await page.waitForTimeout(1000);

    // Check if it's AUTO or specific bands
    if (band === "AUTO") {
      // Select AUTO option
      await page.click("#auto_select_radio");
    } else {
      // Select manual option
      await page.click("#manual_select_radio");

      // Clear existing selections
      const checkboxes = await page.$$(".band_checkbox:checked");
      for (const checkbox of checkboxes) {
        await checkbox.click();
      }

      // Select the requested bands
      const bandArray = band.split("+");
      for (const singleBand of bandArray) {
        const bandCheckbox = await page.$(`#band${singleBand}_checkbox`);
        if (bandCheckbox) {
          await bandCheckbox.click();
        } else {
          console.warn(`Band ${singleBand} checkbox not found`);
        }
      }
    }

    // Apply settings
    await page.click("#apply_button");

    // Wait for confirmation dialog and confirm
    await page.waitForSelector("#confirmation_dialog", { timeout: 5000 });
    await page.click("#confirm_yes_button");

    console.log(`Band configuration for ${band} completed successfully`);
  } catch (error) {
    console.error(`Error configuring bands: ${error}`);
    throw new Error(`Failed to configure bands: ${error}`);
  }
}

async function testBand(page: Page, band: string): Promise<SignalMetrics> {
  console.log(`Testing band: ${band}`);

  try {
    // Navigate to the signal information page
    await page.goto("http://192.168.8.1/html/statistic.html");
    await page.waitForTimeout(3000);

    // Wait for the signal information to load
    await page.waitForSelector("#lte_signal_container", { timeout: 10000 });

    // Extract signal metrics
    const signalMetrics: SignalMetrics = {
      band: await page.evaluate(
        () => document.querySelector("#band_value")?.textContent || ""
      ),
      rsrp: await page.evaluate(
        () => document.querySelector("#rsrp_value")?.textContent || ""
      ),
      rsrq: await page.evaluate(
        () => document.querySelector("#rsrq_value")?.textContent || ""
      ),
      sinr: await page.evaluate(
        () => document.querySelector("#sinr_value")?.textContent || ""
      ),
      cellId: await page.evaluate(
        () => document.querySelector("#cell_id_value")?.textContent || ""
      ),
      enbId: await page.evaluate(
        () => document.querySelector("#enb_id_value")?.textContent || ""
      ),
    };

    console.log(`Signal metrics for band ${band}:`, signalMetrics);
    return signalMetrics;
  } catch (error) {
    console.error(`Error testing band: ${error}`);
    throw new Error(`Failed to test band: ${error}`);
  }
}

/**
 * Run speedtest-cli to measure network performance
 * @returns SpeedtestResult with download, upload speeds and ping
 */
async function runSpeedtestCli(): Promise<SpeedtestResult> {
  try {
    console.log("Running speedtest-cli...");
    const { stdout } = await execAsync("speedtest-cli --json");
    const result = JSON.parse(stdout);

    // Convert from bits/s to Mbps
    const download = result.download / 1000000;
    const upload = result.upload / 1000000;
    const ping = result.ping;

    console.log(
      `Speedtest-cli results: ${download.toFixed(
        2
      )} Mbps down, ${upload.toFixed(2)} Mbps up, ${ping.toFixed(0)} ms ping`
    );

    return {
      download,
      upload,
      ping,
    };
  } catch (error) {
    console.error("Error running speedtest-cli:", error);
    return {
      download: 0,
      upload: 0,
      ping: 0,
    };
  }
}

// Check if array contains any two or more elements from a set
function hasMultipleMatches(array: string[], set: Set<string>): boolean {
  let matchCount = 0;
  for (const item of array) {
    if (set.has(item)) {
      matchCount++;
      if (matchCount >= 2) {
        return true;
      }
    }
  }
  return false;
}

async function main() {
  const program = new Command();

  program
    .name("band-permutation-test")
    .description("Test all possible band permutations with speedtests")
    .version("1.0.0");

  program
    .option("-p, --password <password>", "Router password")
    .option(
      "-o, --output <file>",
      "Output file path",
      "results/band-permutation-results.csv"
    )
    .option(
      "-w, --wait-time <seconds>",
      "Wait time between band switch and test (in seconds)",
      "120"
    )
    .option(
      "-s, --stabilize-time <seconds>",
      "Time to wait after login before starting tests (in seconds)",
      "30"
    )
    .option(
      "-r, --retries <number>",
      "Number of retries for failed band switches",
      "2"
    )
    .option(
      "-m, --max-bands <number>",
      "Maximum number of bands to combine",
      "3"
    )
    .option(
      "-l, --limit <number>",
      "Limit number of combinations to test (0 for all)",
      "0"
    )
    .option(
      "--include-bands <list>",
      "Only test combinations including these bands (comma-separated)"
    )
    .option(
      "--exclude-bands <list>",
      "Exclude combinations with these bands (comma-separated)"
    )
    .option("--headless", "Run browser in headless mode")
    .option("--auto", "Include AUTO configuration in testing")
    .option("--shuffle", "Randomize the order of combinations")
    .option("--resume", "Resume testing from a previous session", false)
    .option(
      "--progress-file <file>",
      "Path to progress file for resuming",
      "results/test-progress.json"
    );

  program.parse(process.argv);
  const options = program.opts();

  // Validate password
  const password = options.password || process.env.PASSWORD;
  if (!password) {
    console.error(
      "Error: Router password is required. Use --password or set PASSWORD environment variable."
    );
    process.exit(1);
  }

  // Parse options
  const waitTime = parseInt(options.waitTime) || 120;
  const stabilizeTime = parseInt(options.stabilizeTime) || 30;
  const retries = parseInt(options.retries) || 2;
  const maxBands = parseInt(options.maxBands) || 3;
  const limit = parseInt(options.limit) || 0;
  const progressFile = options.progressFile || "results/test-progress.json";

  // Initialize or load progress
  let results: TestResult[] = [];
  let completedCombinations: string[] = [];

  // Initialize failure tracking
  const failureTracking: FailureTracking = {
    noServiceBands: new Set<string>(),
    speedtestFailedBands: new Set<string>(),
    skipCombinations: new Set<string>(),
  };

  if (options.resume) {
    console.log("Attempting to resume from previous session...");
    const savedProgress = await loadProgress(progressFile);

    if (savedProgress) {
      results = savedProgress.results;
      completedCombinations = savedProgress.completedCombinations;
      console.log(`Resuming with ${results.length} previous results`);

      // Analyze previous results to identify failed bands
      console.log("Analyzing previous results to identify failed bands...");
      for (const result of results) {
        // Check for no service results (N/A values)
        if (
          result.rsrp === "N/A" &&
          result.rsrq === "N/A" &&
          !result.bandCombination.includes("+")
        ) {
          failureTracking.noServiceBands.add(result.bandCombination);
          console.log(
            `  Identified previous no-service band: ${result.bandCombination}`
          );
        }
        // Check for speedtest failures (has metrics but zero speeds)
        else if (
          result.downloadSpeed <= 0 &&
          result.uploadSpeed <= 0 &&
          result.rsrp !== "N/A" &&
          !result.bandCombination.includes("+")
        ) {
          failureTracking.speedtestFailedBands.add(result.bandCombination);
          console.log(
            `  Identified previous speedtest-failed band: ${result.bandCombination}`
          );
        }
      }
    } else {
      console.log("No saved progress found. Starting fresh test session.");
    }
  }

  // Generate band combinations
  console.log(`Generating combinations with max ${maxBands} bands...`);
  let combinations = generateBandCombinations(maxBands);

  // Add AUTO if requested
  if (options.auto) {
    combinations.push("AUTO");
  }

  // Filter combinations if include/exclude specified
  if (options.includeBands) {
    const includeBands = options.includeBands
      .split(",")
      .map((b: string) => b.trim());
    combinations = combinations.filter((combo) =>
      includeBands.some((band: string) => combo.split("+").includes(band))
    );
  }

  if (options.excludeBands) {
    const excludeBands = options.excludeBands
      .split(",")
      .map((b: string) => b.trim());
    combinations = combinations.filter(
      (combo) =>
        !excludeBands.some((band: string) => combo.split("+").includes(band))
    );
  }

  // Shuffle array if requested
  // if (options.shuffle) {
  //   combinations = combinations.sort(() => Math.random() - 0.5);
  // }

  // Apply limit if specified
  if (limit > 0 && limit < combinations.length) {
    combinations = combinations.slice(0, limit);
  }

  // If resuming, filter out already completed combinations
  if (options.resume && completedCombinations.length > 0) {
    const remainingCombinations = combinations.filter(
      (combo) => !completedCombinations.includes(combo)
    );
    console.log(
      `Filtered out ${
        combinations.length - remainingCombinations.length
      } already completed combinations`
    );
    combinations = remainingCombinations;
  }

  console.log(`Testing ${combinations.length} band combinations`);
  console.log(`Wait time after band switch: ${waitTime} seconds`);

  // Calculate estimated completion time
  const estimatedTimePerTest = waitTime + 120; // Wait time plus approx. test time
  const totalEstimatedTime = combinations.length * estimatedTimePerTest;
  const estimatedHours = Math.floor(totalEstimatedTime / 3600);
  const estimatedMinutes = Math.floor((totalEstimatedTime % 3600) / 60);

  console.log(
    `Estimated time to complete: ${estimatedHours} hours and ${estimatedMinutes} minutes`
  );

  // Print first 10 combinations as preview
  console.log("\nFirst 10 combinations to test:");
  combinations
    .slice(0, 10)
    .forEach((combo, i) => console.log(`${i + 1}. ${combo}`));
  if (combinations.length > 10) {
    console.log(`... and ${combinations.length - 10} more`);
  }
  console.log("");

  const browser = await chromium.launch({
    headless: false, //options.headless,
  });

  try {
    console.log("Opening browser...");
    const context = await browser.newContext({
      ignoreHTTPSErrors: true,
    });
    const page = await context.newPage();

    // Login to router
    console.log("Logging in to router...");
    await page.goto("http://192.168.8.1/html/index.html");
    await page.fill("#login_password", password);
    await page.click("#login_btn");

    // Wait for login to complete - handle different possible URLs
    try {
      await Promise.race([
        page.waitForURL("https://hirouter.net/html/content.html#home", {
          timeout: 10000,
        }),
        page.waitForURL("http://192.168.8.1/html/index.html", {
          timeout: 10000,
        }),
      ]);
      console.log("Login successful");
    } catch (error) {
      console.warn("Login timeout, will continue anyway");
    }

    // Wait for page to load
    console.log(`Waiting ${stabilizeTime} seconds for page to stabilize...`);
    await page.waitForTimeout(stabilizeTime * 1000);

    // Inject monitoring script
    console.log("Injecting monitoring script...");
    await page.evaluate((script: string) => {
      try {
        const scriptElement = document.createElement("script");
        const textNode = document.createTextNode(script);
        scriptElement.appendChild(textNode);
        document.head.appendChild(scriptElement);
        console.log("Script injected successfully");
      } catch (error) {
        console.error("Error injecting script:", error);
      }
    }, monitoringScript);

    // Initialize monitoring UI
    await page.evaluate(() => {
      try {
        if (typeof window.addButtons === "function") {
          window.addButtons();
          console.log("Monitoring UI initialized");
        } else {
          console.error("addButtons function not available");
        }
      } catch (error) {
        console.error("Error initializing UI:", error);
      }
    });

    // Wait for UI to initialize
    console.log("Waiting for monitoring UI to initialize...");
    await page.waitForTimeout(5000);

    // Take screenshot for debugging
    // await page.screenshot({ path: "setup-complete.png" });
    console.log("Setup complete, starting tests...");

    // Initialize progress tracking
    const progress: TestProgress = {
      completedCombinations: [...completedCombinations],
      results: [...results],
      lastUpdated: new Date().toISOString(),
    };

    // Sort combinations to test single bands first
    // This will help us identify failing bands early and skip their combinations
    combinations.sort((a, b) => {
      const aCount = a.split("+").length;
      const bCount = b.split("+").length;
      return aCount - bCount;
    });

    // Run tests for each combination
    for (let comboIndex = 0; comboIndex < combinations.length; comboIndex++) {
      const bandCombo = combinations[comboIndex];

      // Skip combinations that include no-service bands
      const bandComboArray = bandCombo.split("+");
      let shouldSkip = false;

      // Check if this combination includes any no-service bands
      for (const band of bandComboArray) {
        if (failureTracking.noServiceBands.has(band)) {
          shouldSkip = true;
          console.log(
            `Skipping combination ${bandCombo} because band ${band} has no service`
          );
          break;
        }
      }

      // Check if this combination includes multiple speedtest-failed bands
      if (
        hasMultipleMatches(bandComboArray, failureTracking.speedtestFailedBands)
      ) {
        shouldSkip = true;
        console.log(
          `Skipping combination ${bandCombo} because it contains multiple bands with speedtest failures`
        );
      }

      // Skip if already marked for skipping
      if (failureTracking.skipCombinations.has(bandCombo)) {
        console.log(`Skipping previously marked combination: ${bandCombo}`);
        shouldSkip = true;
      }

      if (shouldSkip) {
        // Record the skip in completed combinations so we don't retry on resume
        progress.completedCombinations.push(bandCombo);
        continue;
      }

      console.log(
        `\nTesting combination ${comboIndex + 1}/${
          combinations.length
        }: ${bandCombo} (${progress.completedCombinations.length + 1}/${
          progress.completedCombinations.length + combinations.length
        } total)`
      );

      let success = false;
      let attemptCount = 0;

      // Try to set band with retries
      while (!success && attemptCount <= retries) {
        try {
          if (attemptCount > 0) {
            console.log(`  Retry ${attemptCount}/${retries}...`);
          }

          console.log(`  Setting band to ${bandCombo}...`);
          await page.evaluate((band: string) => {
            if (typeof window.ltebandselection === "function") {
              window.ltebandselection(band);
              return true;
            } else {
              console.error("ltebandselection function not available");
              return false;
            }
          }, bandCombo);

          // Wait for band to change
          console.log(
            `  Waiting ${waitTime} seconds for band change to stabilize...`
          );
          await page.waitForTimeout(waitTime * 1000);

          success = true;
        } catch (error) {
          console.error(`  Error setting band: ${error}`);
          attemptCount++;

          if (attemptCount <= retries) {
            // Refresh page and try again
            await page.reload();
            await page.waitForTimeout(10000);

            // Re-inject the script if needed
            await page.evaluate((script: string) => {
              try {
                const scriptElement = document.createElement("script");
                const textNode = document.createTextNode(script);
                scriptElement.appendChild(textNode);
                document.head.appendChild(scriptElement);
              } catch (error) {
                console.error("Error re-injecting script:", error);
              }
            }, monitoringScript);

            await page.evaluate(() => {
              try {
                if (typeof window.addButtons === "function") {
                  window.addButtons();
                }
              } catch (error) {
                console.error("Error re-initializing UI:", error);
              }
            });

            await page.waitForTimeout(5000);
          }
        }
      }

      if (!success) {
        console.error(
          `  Failed to set band to ${bandCombo} after ${
            retries + 1
          } attempts, skipping...`
        );
        continue;
      }

      // Take screenshot
      const safeBandName = bandCombo.replace(/\+/g, "_");
      // await page.screenshot({ path: `band-${safeBandName}.png` });

      // Check for "No service" message
      const hasNoService = await page.evaluate(() => {
        const pageContent = document.body.innerText;
        return pageContent.includes(
          "No service. Click here to One-click Check"
        );
      });

      if (hasNoService) {
        console.log(`  DETECTED: No service for band combination ${bandCombo}`);

        // If this is a single band, mark it as a no-service band
        if (!bandCombo.includes("+")) {
          console.log(`  Adding band ${bandCombo} to no-service bands list`);
          failureTracking.noServiceBands.add(bandCombo);

          // Mark all combinations containing this band for skipping
          for (const combo of combinations) {
            if (combo.split("+").includes(bandCombo)) {
              failureTracking.skipCombinations.add(combo);
              console.log(
                `  Will skip future combination with no-service band: ${combo}`
              );
            }
          }
        } else {
          // If this is a multi-band combination, just mark this specific combo
          failureTracking.skipCombinations.add(bandCombo);
        }

        // Record the result
        const result: TestResult = {
          timestamp: new Date().toISOString(),
          band: bandCombo,
          bandCombination: bandCombo,
          rsrp: "N/A",
          rsrq: "N/A",
          sinr: "N/A",
          enbId: "N/A",
          cellId: "N/A",
          downloadSpeed: 0,
          uploadSpeed: 0,
          ping: 0,
          testDuration: 0,
        };

        // Add result to the collection
        results.push(result);
        progress.results.push(result);
        progress.completedCombinations.push(bandCombo);

        // Save progress
        await saveResults(results, options.output);
        await saveProgress(progress, progressFile);

        continue;
      }

      // Get signal information
      console.log("  Getting signal information...");
      const signalInfo = await page.evaluate(() => {
        return {
          band: document.getElementById("band")?.innerText || "",
          rsrp: document.getElementById("rsrp")?.innerText || "",
          rsrq: document.getElementById("rsrq")?.innerText || "",
          sinr: document.getElementById("sinr")?.innerText || "",
          cellId: document.getElementById("cell_id")?.innerText || "",
          enbId: document.getElementById("enbid")?.innerText || "",
        };
      });

      console.log("  Signal information:", signalInfo);

      // Run speedtest with speedtest-cli
      console.log("  Running speedtest-cli...");
      const startTime = Date.now();
      let speedTestResult: SpeedtestResult;
      let speedtestFailed = false;
      let isNameResolutionError = false;

      try {
        speedTestResult = await runSpeedtestCli();

        // Check if speedtest failed (no download or upload speed)
        if (speedTestResult.download <= 0 || speedTestResult.upload <= 0) {
          console.log("  Speedtest failed: No download or upload speed");
          speedtestFailed = true;
        }
      } catch (error) {
        console.error("  Speedtest failed with error:", error);
        speedtestFailed = true;

        // Check if it's a name resolution error
        const errorStr = String(error);
        if (errorStr.includes("Temporary failure in name resolution")) {
          console.log("  Detected DNS resolution error in speedtest");
          isNameResolutionError = true;
        }

        speedTestResult = {
          download: 0,
          upload: 0,
          ping: 0,
        };
      }

      const endTime = Date.now();
      const testDuration = (endTime - startTime) / 1000;

      // If speedtest failed and this is a single band, mark it as a speedtest-failed band
      if (speedtestFailed && !bandCombo.includes("+")) {
        console.log(
          `  Adding band ${bandCombo} to speedtest-failed bands list`
        );
        failureTracking.speedtestFailedBands.add(bandCombo);

        // Update skip combinations that would have multiple speedtest-failed bands
        for (const combo of combinations) {
          const comboBands = combo.split("+");
          if (
            hasMultipleMatches(comboBands, failureTracking.speedtestFailedBands)
          ) {
            failureTracking.skipCombinations.add(combo);
            console.log(
              `  Will skip future combination with multiple speedtest-failed bands: ${combo}`
            );
          }
        }
      }

      // Record results
      const result: TestResult = {
        timestamp: new Date().toISOString(),
        band: signalInfo.band,
        bandCombination: bandCombo,
        rsrp: signalInfo.rsrp,
        rsrq: signalInfo.rsrq,
        sinr: signalInfo.sinr,
        enbId: signalInfo.enbId,
        cellId: signalInfo.cellId,
        downloadSpeed: speedTestResult.download,
        uploadSpeed: speedTestResult.upload,
        ping: speedTestResult.ping,
        testDuration,
      };

      // Add result to the collection
      results.push(result);
      progress.results.push(result);
      progress.completedCombinations.push(bandCombo);

      // Log results and speedtest status
      console.log("\n  Test Results:");
      console.log(`  Band Combination: ${bandCombo}`);
      console.log(`  Download: ${speedTestResult.download.toFixed(2)} Mbps`);
      console.log(`  Upload: ${speedTestResult.upload.toFixed(2)} Mbps`);
      console.log(`  Ping: ${speedTestResult.ping.toFixed(0)} ms`);
      console.log(
        `  Speedtest status: ${speedtestFailed ? "Failed" : "Success"}${
          isNameResolutionError ? " (DNS resolution error)" : ""
        }`
      );
      console.log(
        `  RSRP: ${signalInfo.rsrp}, RSRQ: ${signalInfo.rsrq}, SINR: ${signalInfo.sinr}`
      );
      console.log(`  ENB ID: ${signalInfo.enbId}`);
      console.log(`  Test completed in ${testDuration.toFixed(1)} seconds\n`);

      // Save intermediate results and progress after each test
      await saveResults(results, options.output);
      await saveProgress(progress, progressFile);

      // Update remaining time estimate
      const remainingCombinations = combinations.length - comboIndex - 1;
      const remainingTime = remainingCombinations * estimatedTimePerTest;
      const remainingHours = Math.floor(remainingTime / 3600);
      const remainingMinutes = Math.floor((remainingTime % 3600) / 60);
      console.log(
        `Estimated time remaining: ${remainingHours} hours and ${remainingMinutes} minutes\n`
      );

      // Log current failure tracking stats
      console.log(
        `Current status: ${failureTracking.noServiceBands.size} no-service bands, ${failureTracking.speedtestFailedBands.size} speedtest-failed bands`
      );
    }

    // Save final results
    await saveResults(results, options.output);
    console.log("\nPermutation test completed successfully!");
    console.log(`Results saved to ${options.output}`);

    // Clean up progress file if all tests completed
    if (fs.existsSync(progressFile) && combinations.length === 0) {
      fs.unlinkSync(progressFile);
      console.log("Test completed, removed progress file.");
    }
  } catch (error) {
    console.error("Error during permutation test:", error);

    // Save progress even on error
    if (results.length > 0) {
      await saveResults(results, options.output);

      const progress: TestProgress = {
        completedCombinations: completedCombinations,
        results: results,
        lastUpdated: new Date().toISOString(),
      };

      await saveProgress(progress, progressFile);
      console.log(
        "Saved progress before exit due to error. You can resume the test later."
      );
    }
  } finally {
    await browser.close();
  }
}

main().catch(console.error);
