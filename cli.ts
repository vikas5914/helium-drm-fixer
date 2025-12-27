#!/usr/bin/env bun
import { Command } from "commander";
import { fixHeliumDrm } from "./commands/index";

const program = new Command();

program
  .name("fix-helium-drm")
  .description(
    "Fix DRM issues in Helium browser by copying WidevineCdm from Chrome"
  )
  .version("1.0.0")
  .option("--check", "Check if fix is needed without applying changes")
  .option("--dry-run", "Show what would be done without making changes")
  .option("--verbose", "Enable verbose logging")
  .option("--debug", "Enable debug logging (alias for --verbose)")
  .option("--chrome-path <path>", "Custom Chrome WidevineCdm path")
  .option("--helium-path <path>", "Custom Helium WidevineCdm path")
  .option("--force-download", "Force re-download Chrome even if cached")
  .action(async (options) => {
    try {
      await fixHeliumDrm({
        verbose: options.verbose || options.debug,
        check: options.check,
        dryRun: options.dryRun,
        chromePath: options.chromePath,
        heliumPath: options.heliumPath,
        forceDownload: options.forceDownload,
      });
    } catch (error) {
      console.error("Error:", error);
      process.exit(1);
    }
  });

program.parse();
