import { BrowserFinder } from "@agent-infra/browser-finder";
import { join, dirname } from "node:path";
import { homedir } from "node:os";
import { readdir, stat, realpath } from "node:fs/promises";
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
            "Libraries",
            "WidevineCdm"
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
    } else {
      const chromePath = chrome.path;
      let chromeDir = dirname(chromePath);

      // On Linux, chrome.path is often a wrapper script in /usr/bin.
      // Try resolving symlinks to find the real Chrome install directory.
      try {
        const resolved = await realpath(chromePath);
        if (resolved !== chromePath) {
          chromeDir = dirname(resolved);
          log.info(`Resolved Chrome symlink to: ${chromeDir}`);
        }
      } catch {
        // ignore - continue with original path
      }

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

      // Fallback: check well-known Linux Chrome installation directories
      if (!widevinePath) {
        const knownPaths = [
          "/opt/google/chrome/WidevineCdm",
          "/opt/google/chrome-beta/WidevineCdm",
          "/usr/lib/chromium/WidevineCdm",
          "/usr/lib/chromium-browser/WidevineCdm",
        ];
        for (const knownPath of knownPaths) {
          log.info(`Checking known Chrome path: ${knownPath}`);
          try {
            const stats = await stat(knownPath);
            if (stats.isDirectory()) {
              log.info(`✓ Found WidevineCdm at: ${knownPath}`);
              widevinePath = knownPath;
              break;
            }
          } catch {
            log.info(`✗ Path does not exist: ${knownPath}`);
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
      "/Applications",
      "Helium.app",
      "Contents",
      "Frameworks",
      "Helium Framework.framework",
      "Versions"
    );
  } else {
    // Linux: check system package installations first
    const systemInstall = await findHeliumLinuxInstall(log);
    if (systemInstall) return systemInstall;

    // Fall back to user config path with version subdirectories
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
      const versionPath =
        platform === "darwin"
          ? join(basePath, entry.name, "Libraries")
          : join(basePath, entry.name);

      log.info(`✓ Found Helium version folder: ${versionPath}`);
      return versionPath;
    }
  }

  log.info(`✗ No valid Helium version folder found`);

  return null;
}

/**
 * Find Helium's user data directory on Linux.
 * Chromium loads WidevineCdm from the user data dir using the component updater format.
 */
export async function findHeliumUserDataDir(): Promise<string | null> {
  const log = getLogger();
  const candidates = [
    join(homedir(), ".config", "net.imput.helium"),
    join(homedir(), ".config", "Helium"),
    join(homedir(), ".config", "helium"),
  ];

  for (const dir of candidates) {
    log.info(`Checking Helium user data dir: ${dir}`);
    try {
      const stats = await stat(dir);
      if (stats.isDirectory()) {
        log.info(`✓ Found Helium user data dir: ${dir}`);
        return dir;
      }
    } catch {
      log.info(`✗ Path does not exist: ${dir}`);
    }
  }

  return null;
}

/**
 * Find Helium system installation on Linux.
 * Handles flat directory layouts (e.g. /opt/helium-browser-bin/) used by
 * distro packages where there are no version subdirectories.
 */
async function findHeliumLinuxInstall(
  log: ReturnType<typeof getLogger>
): Promise<string | null> {
  const candidates: string[] = [];

  // Try resolving the helium-browser binary symlink to find the install dir
  for (const binPath of ["/usr/bin/helium-browser", "/usr/bin/helium"]) {
    try {
      const resolved = await realpath(binPath);
      const dir = dirname(resolved);
      if (!candidates.includes(dir)) {
        candidates.push(dir);
      }
    } catch {
      // not found
    }
  }

  // Known system package locations
  if (!candidates.includes("/opt/helium-browser-bin")) {
    candidates.push("/opt/helium-browser-bin");
  }

  for (const candidate of candidates) {
    log.info(`Checking Linux Helium system path: ${candidate}`);
    try {
      const stats = await stat(candidate);
      if (!stats.isDirectory()) continue;

      // Verify this is a Helium installation by checking for the helium binary
      try {
        await stat(join(candidate, "helium"));
        log.info(`✓ Found Helium system installation: ${candidate}`);
        return candidate;
      } catch {
        log.info(`✗ No helium binary in: ${candidate}`);
      }
    } catch {
      log.info(`✗ Path does not exist: ${candidate}`);
    }
  }

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
