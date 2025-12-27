import { BrowserFinder } from "@agent-infra/browser-finder";
import { join, dirname } from "node:path";
import { homedir } from "node:os";
import { readdir, stat } from "node:fs/promises";
import { getLogger } from "./logger";

export interface PlatformPaths {
  chromeWidevine: string;
  heliumWidevine: string;
}

export type Platform = "win32" | "darwin" | "linux";

export function getPlatform(): Platform {
  const platform = process.platform;
  if (platform === "win32" || platform === "darwin" || platform === "linux") {
    return platform;
  }
  throw new Error(`Unsupported platform: ${platform}`);
}

export function getArch(): "x64" | "arm64" {
  const arch = process.arch;
  if (arch === "x64" || arch === "arm64") {
    return arch;
  }
  throw new Error(`Unsupported architecture: ${arch}`);
}

/**
 * Find Chrome WidevineCdm path using browser-finder
 */
export async function findChromeWidevinePath(): Promise<string | null> {
  const log = getLogger();

  try {
    const finder = new BrowserFinder();
    const chrome = finder.findBrowser("chrome");

    log.info(`Found Chrome executable at: ${chrome.path}`);

    const platform = getPlatform();
    let widevinePath: string | null = null;

    if (platform === "win32") {
      const chromePath = chrome.path;
      const appPath = dirname(chromePath);

      log.info(`Scanning Chrome Application directory: ${appPath}`);

      const entries = await readdir(appPath, { withFileTypes: true });

      for (const entry of entries) {
        if (entry.isDirectory() && /^\d+\.\d+\.\d+\.\d+$/.test(entry.name)) {
          const versionPath = join(appPath, entry.name, "WidevineCdm");
          log.info(`Checking path: ${versionPath}`);
          try {
            const stats = await stat(versionPath);
            if (stats.isDirectory()) {
              log.info(`✓ Found WidevineCdm at: ${versionPath}`);
              widevinePath = versionPath;
              break;
            }
          } catch {
            log.info(`✗ Path does not exist: ${versionPath}`);
          }
        }
      }
    } else if (platform === "darwin") {
      const chromePath = chrome.path;
      const versionsPath = join(
        dirname(chromePath),
        "..",
        "..",
        "..",
        "Frameworks",
        "Google Chrome Framework.framework",
        "Versions"
      );

      log.info(`Scanning Chrome Versions directory: ${versionsPath}`);

      const entries = await readdir(versionsPath, { withFileTypes: true });

      for (const entry of entries) {
        if (entry.isDirectory() && /^\d+\.\d+\.\d+\.\d+$/.test(entry.name)) {
          const versionWidevine = join(
            versionsPath,
            entry.name,
            "WidevineCdm.plugin"
          );
          log.info(`Checking path: ${versionWidevine}`);
          try {
            const stats = await stat(versionWidevine);
            if (stats.isDirectory()) {
              log.info(`✓ Found WidevineCdm at: ${versionWidevine}`);
              widevinePath = versionWidevine;
              break;
            }
          } catch {
            log.info(`✗ Path does not exist: ${versionWidevine}`);
          }
        }
      }

      if (!widevinePath) {
        const fallbackPath = join(versionsPath, "A", "WidevineCdm.plugin");
        log.info(`Checking fallback path: ${fallbackPath}`);
        try {
          const stats = await stat(fallbackPath);
          if (stats.isDirectory()) {
            log.info(`✓ Found WidevineCdm at: ${fallbackPath}`);
            widevinePath = fallbackPath;
          }
        } catch {
          log.info(`✗ Fallback path does not exist: ${fallbackPath}`);
        }
      }
    } else {
      const chromePath = chrome.path;
      const chromeDir = dirname(chromePath);
      const directPath = join(chromeDir, "WidevineCdm");

      log.info(`Checking direct path: ${directPath}`);

      try {
        const stats = await stat(directPath);
        if (stats.isDirectory()) {
          log.info(`✓ Found WidevineCdm at: ${directPath}`);
          widevinePath = directPath;
        }
      } catch {
        log.info(`✗ Direct path does not exist, scanning for version folders in: ${chromeDir}`);
        const entries = await readdir(chromeDir, { withFileTypes: true });

        for (const entry of entries) {
          if (entry.isDirectory() && /^\d+\.\d+\.\d+\.\d+$/.test(entry.name)) {
            const versionPath = join(chromeDir, entry.name, "WidevineCdm");
            log.info(`Checking path: ${versionPath}`);
            try {
              const stats = await stat(versionPath);
              if (stats.isDirectory()) {
                log.info(`✓ Found WidevineCdm at: ${versionPath}`);
                widevinePath = versionPath;
                break;
              }
            } catch {
              log.info(`✗ Path does not exist: ${versionPath}`);
            }
          }
        }
      }
    }

    return widevinePath;
  } catch {
    return null;
  }
}

/**
 * Find Helium browser WidevineCdm target path
 */
export async function findHeliumVersionPath(): Promise<string | null> {
  const log = getLogger();
  const platform = getPlatform();
  let basePath: string;

  if (platform === "win32") {
    const localAppData =
      process.env.LOCALAPPDATA || join(homedir(), "AppData", "Local");
    basePath = join(localAppData, "imput", "Helium", "Application");
  } else if (platform === "darwin") {
    basePath = join(
      homedir(),
      "Library",
      "Application Support",
      "Helium",
      "Application"
    );
  } else {
    basePath = join(homedir(), ".config", "Helium", "Application");
  }

  log.info(`Checking Helium base path: ${basePath}`);

  try {
    const baseStats = await stat(basePath);
    if (!baseStats.isDirectory()) {
      log.info(`✗ Base path is not a directory: ${basePath}`);
      return null;
    }
  } catch {
    log.info(`✗ Base path does not exist: ${basePath}`);
    return null;
  }

  log.info(`Scanning for Helium version folders in: ${basePath}`);

  const entries = await readdir(basePath, { withFileTypes: true });

  for (const entry of entries) {
    if (entry.isDirectory() && /^\d+\.\d+\.\d+\.\d+$/.test(entry.name)) {
      const versionPath = join(basePath, entry.name);

      log.info(`✓ Found Helium version folder: ${versionPath}`);
      return versionPath;
    }
  }

  log.info(`✗ No valid Helium version folder found`);

  return null;
}

/**
 * Get download asset pattern for Chrome installer
 * Returns a regex pattern to match the correct asset (version is dynamic)
 */
export function getChromeAssetPattern(): RegExp {
  const platform = getPlatform();
  const arch = getArch();

  if (platform === "win32") {
    // Pattern: x64_143.0.7499.170_chrome_installer_uncompressed.exe
    const archPrefix = arch === "arm64" ? "arm64" : "x64";
    return new RegExp(
      `^${archPrefix}_[\\d.]+_chrome_installer_uncompressed\\.exe$`
    );
  }

  // This GitHub repo only has Windows builds
  throw new Error(
    "Chrome download is only supported on Windows. Please install Chrome manually on macOS/Linux."
  );
}
