import { findChromeWidevinePath, findHeliumVersionPath } from "../lib/paths";
import { copyDir } from "../lib/utils";
import { initLogger, type Logger } from "../lib/logger";
import { downloadAndExtractChrome } from "../lib/chrome-downloader";
import { join } from "node:path";
import ora from "ora";
import chalk from "chalk";

export interface FixHeliumDrmOptions {
  verbose?: boolean;
  dryRun?: boolean;
  check?: boolean;
  chromePath?: string;
  heliumPath?: string;
  forceDownload?: boolean;
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

  const heliumWidevinePath = join(heliumVersionPath, "WidevineCdm");

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
    copySpinner.succeed(chalk.green("WidevineCdm copied successfully!"));
    logger.info("WidevineCdm copied successfully!");
  } catch (error) {
    copySpinner.fail(chalk.red("Failed to copy WidevineCdm"));
    logger.error("Failed to copy WidevineCdm", { error });
    process.exit(1);
  }

  console.log(
    chalk.bold.green("\n✅ Done! Restart Helium browser for DRM to work.\n")
  );
  logger.info("Done! Restart Helium browser for DRM to work.");
}
