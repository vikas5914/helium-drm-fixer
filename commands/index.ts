import { findChromeWidevinePath, findHeliumVersionPath, findHeliumUserDataDir, getPlatform } from "../lib/paths";
import { copyDir } from "../lib/utils";
import { initLogger, type Logger } from "../lib/logger";
import { downloadAndExtractChrome } from "../lib/chrome-downloader";
import { join, dirname } from "node:path";
import { readFile, writeFile } from "node:fs/promises";
import { execFile } from "node:child_process";
import { promisify } from "node:util";
import ora from "ora";

const execFileAsync = promisify(execFile);
import chalk from "chalk";

export interface FixHeliumDrmOptions {
  verbose?: boolean;
  dryRun?: boolean;
  check?: boolean;
  chromePath?: string;
  heliumPath?: string;
  forceDownload?: boolean;
}

function isPermissionError(error: unknown): boolean {
  return (
    typeof error === "object" &&
    error !== null &&
    "code" in error &&
    (error.code === "EACCES" || error.code === "EPERM")
  );
}

function isRunningAsRoot(): boolean {
  return typeof process.getuid === "function" && process.getuid() === 0;
}

function formatErrorDetails(error: unknown): string {
  if (error instanceof Error) {
    return error.message;
  }

  if (typeof error === "object" && error !== null) {
    const details = ["code", "syscall", "path"]
      .map((key) =>
        key in error
          ? `${key}=${String((error as Record<string, unknown>)[key])}`
          : null
      )
      .filter(Boolean)
      .join(", ");

    if (details) return details;
  }

  return String(error);
}

async function getChromeWidevinePath(
  logger: Logger,
  spinner: ReturnType<typeof ora>,
  options: FixHeliumDrmOptions
): Promise<string> {
  if (options.chromePath) {
    logger.info(`Using custom Chrome path: ${options.chromePath}`);
    spinner.succeed(
      chalk.green(`Using custom Chrome path: ${options.chromePath}`)
    );
    return options.chromePath;
  }

  let chromeWidevinePath = await findChromeWidevinePath();

  if (!chromeWidevinePath) {
    spinner.text = "Chrome not found. Downloading...";
    logger.info("Chrome not found. Downloading...");
    chromeWidevinePath = await downloadAndExtractChrome({
      spinner,
      logger,
      forceDownload: options.forceDownload,
    });
    spinner.succeed(
      chalk.green("Chrome downloaded and extracted successfully")
    );
  } else {
    spinner.succeed(chalk.green(`Found Chrome at: ${chromeWidevinePath}`));
  }

  return chromeWidevinePath;
}

async function getHeliumVersionPath(
  logger: Logger,
  spinner: ReturnType<typeof ora>,
  options: FixHeliumDrmOptions
): Promise<string> {
  if (options.heliumPath) {
    logger.info(`Using custom Helium path: ${options.heliumPath}`);
    spinner.succeed(
      chalk.green(`Using custom Helium path: ${options.heliumPath}`)
    );
    return options.heliumPath;
  }

  const heliumVersionPath = await findHeliumVersionPath();

  if (!heliumVersionPath) {
    spinner.fail(chalk.red("Helium browser not found"));
    console.log(chalk.yellow("\n⚠️  Please install Helium first."));
    console.log(chalk.blue("   Download from: https://helium.is/\n"));
    logger.error("Helium browser not found. Please install Helium first.");
    process.exit(1);
  }

  spinner.succeed(chalk.green(`Found Helium at: ${heliumVersionPath}`));
  logger.info(`Found Helium at: ${heliumVersionPath}`);
  return heliumVersionPath;
}

export async function fixHeliumDrm(options: FixHeliumDrmOptions = {}) {
  const logger = initLogger(options.verbose || false);

  console.log(chalk.bold.cyan("\n🔧 Fixing Helium DRM...\n"));

  const chromeSpinner = ora("Looking for Chrome installation...").start();
  logger.info("Looking for Chrome installation...");

  let chromeWidevinePath: string;
  try {
    chromeWidevinePath = await getChromeWidevinePath(
      logger,
      chromeSpinner,
      options
    );
  } catch (error) {
    chromeSpinner.fail(chalk.red("Failed to find/download Chrome"));
    logger.error("Failed to find/download Chrome", { error });
    process.exit(1);
  }

  const heliumSpinner = ora("Looking for Helium installation...").start();
  logger.info("Looking for Helium installation...");

  const heliumVersionPath = await getHeliumVersionPath(
    logger,
    heliumSpinner,
    options
  );

  let heliumWidevinePath: string;
  const platform = getPlatform();

  if (platform === "linux") {
    // On Linux, Chromium loads WidevineCdm from the user data directory
    // using the component updater format: <user-data>/WidevineCdm/<version>/
    const manifest = JSON.parse(
      await readFile(join(chromeWidevinePath, "manifest.json"), "utf-8")
    );
    const version: string = manifest.version;
    const userDataDir = await findHeliumUserDataDir();

    if (!userDataDir) {
      console.log(chalk.red("\n✗ Could not find Helium user data directory."));
      console.log(chalk.yellow("  Please launch Helium at least once before running this tool.\n"));
      process.exit(1);
    }

    heliumWidevinePath = join(userDataDir, "WidevineCdm", version);
    logger.info(`Using Linux component updater path: ${heliumWidevinePath}`);
  } else {
    heliumWidevinePath = join(heliumVersionPath, "WidevineCdm");
  }

  if (options.check) {
    console.log(chalk.bold.green("\n✅ Check complete. Fix can be applied.\n"));
    logger.info("Check complete. Fix can be applied.");
    return;
  }

  if (options.dryRun) {
    console.log(chalk.bold.yellow("\n🔍 Dry run - no changes made."));
    console.log(chalk.dim(`   Would copy: ${chromeWidevinePath}`));
    console.log(chalk.dim(`   To: ${heliumWidevinePath}\n`));
    logger.info("Dry run complete", {
      source: chromeWidevinePath,
      dest: heliumWidevinePath,
    });
    return;
  }

  const copySpinner = ora(
    "Copying WidevineCdm from Chrome to Helium..."
  ).start();
  logger.info("Copying WidevineCdm from Chrome to Helium...");

  try {
    await copyDir(chromeWidevinePath, heliumWidevinePath);

    // On Linux, write the component updater hint file so Chromium finds the CDM
    if (platform === "linux") {
      const hintFile = join(dirname(heliumWidevinePath), "latest-component-updated-widevine-cdm");
      await writeFile(hintFile, JSON.stringify({ Path: heliumWidevinePath }));
      logger.info(`Wrote hint file: ${hintFile}`);
    }

    copySpinner.succeed(chalk.green("WidevineCdm copied successfully!"));
    logger.info("WidevineCdm copied successfully!");
  } catch (error) {
    copySpinner.fail(chalk.red("Failed to copy WidevineCdm"));
    logger.error("Failed to copy WidevineCdm", { error });

    if (isPermissionError(error) && platform === "darwin" && isRunningAsRoot()) {
      console.log(chalk.yellow("\n⚠️  macOS still denied writing inside Helium.app, even as root."));
      console.log(chalk.dim("   Grant App Management to your terminal app in System Settings > Privacy & Security."));
      console.log(chalk.dim("   Quit and reopen the terminal after granting it, then re-run: sudo bun run cli.ts"));
      console.log(chalk.dim("   If it still fails, grant Full Disk Access to the terminal app too."));
      console.log(chalk.dim(`   ${formatErrorDetails(error)}\n`));
    } else if (isPermissionError(error)) {
      console.log(chalk.yellow("\n⚠️  Helium is installed under /Applications, which requires admin permissions to modify."));
      console.log(chalk.dim("   Re-run with sudo: sudo bun run cli.ts"));
      console.log(chalk.dim(`   ${formatErrorDetails(error)}\n`));
    } else if (options.verbose) {
      console.log(chalk.dim(`\n   ${formatErrorDetails(error)}\n`));
    } else {
      console.log(chalk.dim("\n   Re-run with --verbose to see the underlying filesystem error.\n"));
    }

    process.exit(1);
  }

  if (getPlatform() === "darwin") {
    const signSpinner = ora("Re-signing Helium.app to include WidevineCdm...").start();
    logger.info("Re-signing Helium.app after modifying framework contents...");

    try {
      const heliumAppPath = "/Applications/Helium.app";
      await execFileAsync("xattr", ["-cr", heliumAppPath]);
      await execFileAsync("codesign", ["--force", "--deep", "--sign", "-", heliumAppPath]);
      signSpinner.succeed(chalk.green("Helium.app re-signed successfully"));
      logger.info("Helium.app re-signed successfully");
    } catch (error) {
      signSpinner.fail(chalk.red("Failed to re-sign Helium.app"));
      logger.error("Failed to re-sign Helium.app", { error });
      console.log(chalk.yellow("\n⚠️  You may need to run with sudo, or manually run:"));
      console.log(chalk.dim('   codesign --force --deep --sign - "/Applications/Helium.app"\n'));
    }
  }

  console.log(
    chalk.bold.green("\n✅ Done! Restart Helium browser for DRM to work.\n")
  );
  logger.info("Done! Restart Helium browser for DRM to work.");
}
