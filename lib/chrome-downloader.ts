import { join } from "node:path";
import { mkdir } from "node:fs/promises";
import { getChromeAssetPattern } from "./paths";
import { calculateChecksum, displayProgress, formatError } from "./utils";
import { extractArchive, findWidevineInExtracted } from "./extractor";
import type { GitHubRelease, GitHubAsset, VersionCache } from "./types";
import type { Logger } from "./logger";

const CHROME_REPO = "Bush2021/chrome_installer";
const GITHUB_API_URL = `https://api.github.com/repos/${CHROME_REPO}/releases/latest`;

export interface DownloadOptions {
  forceDownload?: boolean;
  spinner?: { text: string };
  logger: Logger;
}

async function fetchLatestRelease(): Promise<GitHubRelease> {
  const response = await fetch(GITHUB_API_URL);
  if (!response.ok) {
    throw new Error(
      formatError("Failed to fetch latest Chrome release from GitHub", {
        status: response.status,
      })
    );
  }
  return (await response.json()) as GitHubRelease;
}

function findMatchingAsset(release: GitHubRelease): GitHubAsset {
  const assetPattern = getChromeAssetPattern();
  const asset = release.assets?.find((a: GitHubAsset) =>
    assetPattern.test(a.name)
  );

  if (!asset) {
    throw new Error(
      formatError(
        "Could not find Chrome asset matching pattern for your platform/arch",
        {
          platform: process.platform,
          arch: process.arch,
          pattern: assetPattern.source,
        }
      )
    );
  }

  return asset;
}

async function checkCachedVersion(
  exePath: string,
  versionFile: string,
  release: GitHubRelease,
  options: DownloadOptions
): Promise<boolean> {
  const { spinner, logger } = options;

  if (options.forceDownload) {
    return false;
  }

  const existingFile = Bun.file(exePath);
  const versionCacheFile = Bun.file(versionFile);

  if (!(await existingFile.exists()) || !(await versionCacheFile.exists())) {
    return false;
  }

  try {
    const cachedData: VersionCache = await versionCacheFile.json();
    if (cachedData.tag !== release.tag_name || !cachedData.checksum) {
      if (spinner) spinner.text = `New version available: ${release.tag_name}`;
      logger.info(
        `New version available: ${release.tag_name} (cached: ${cachedData.tag})`
      );
      return false;
    }

    const currentChecksum = await calculateChecksum(exePath);
    if (currentChecksum !== cachedData.checksum) {
      if (spinner)
        spinner.text = "Cached file checksum mismatch, re-downloading...";
      logger.warn("Cached file checksum mismatch, re-downloading...");
      return false;
    }

    const assetName = findMatchingAsset(release).name;
    if (spinner)
      spinner.text = `Using cached ${assetName} (${release.tag_name})`;
    logger.info(`Using cached ${assetName} (${release.tag_name})`);
    return true;
  } catch {
    if (spinner) spinner.text = "Version file is corrupted, re-downloading...";
    logger.warn("Version file is corrupted, re-downloading...");
    return false;
  }
}

async function downloadFile(
  url: string,
  destPath: string,
  options: DownloadOptions
): Promise<void> {
  const { logger } = options;

  const response = await fetch(url);
  if (!response.ok) {
    throw new Error(
      formatError("Failed to download Chrome installer", {
        status: response.status,
      })
    );
  }

  const contentLength = Number(response.headers.get("content-length"));
  if (!contentLength) {
    throw new Error("Content-Length header not found in response");
  }

  const reader = response.body!.getReader();
  const chunks: Uint8Array[] = [];
  let downloaded = 0;

  displayProgress({ downloaded, total: contentLength, percentage: 0 });

  while (true) {
    const { done, value } = await reader.read();
    if (done) break;

    chunks.push(value);
    downloaded += value.length;
    const percentage = Math.min(
      100,
      Math.round((downloaded / contentLength) * 100)
    );
    displayProgress({ downloaded, total: contentLength, percentage });
  }

  process.stdout.write("\n");

  const buffer = new Uint8Array(downloaded);
  let offset = 0;
  for (const chunk of chunks) {
    buffer.set(chunk, offset);
    offset += chunk.length;
  }
  await Bun.write(destPath, buffer);
}

export async function downloadAndExtractChrome(
  options: DownloadOptions
): Promise<string> {
  const { spinner, logger } = options;

  logger.info("Chrome not found locally. Downloading from GitHub...");

  let release: GitHubRelease;
  try {
    release = await fetchLatestRelease();
  } catch (error) {
    logger.error("Failed to connect to GitHub API", { error });
    throw new Error(formatError("Failed to connect to GitHub API", { error }));
  }

  const asset = findMatchingAsset(release);

  const tempDir = join(process.env.TEMP || "/tmp", "helium-drm-download");
  await mkdir(tempDir, { recursive: true });

  const exePath = join(tempDir, asset.name);
  const versionFile = join(tempDir, "version.json");

  const useCache = await checkCachedVersion(
    exePath,
    versionFile,
    release,
    options
  );

  if (!useCache) {
    if (spinner)
      spinner.text = `Downloading ${asset.name} (${release.tag_name})...`;
    logger.info(`Downloading ${asset.name} (${release.tag_name})...`);

    try {
      await downloadFile(asset.browser_download_url, exePath, options);
    } catch (error) {
      logger.error("Failed to download Chrome installer", { error });
      throw error;
    }

    const checksum = await calculateChecksum(exePath);

    const cacheData: VersionCache = {
      tag: release.tag_name,
      name: asset.name,
      downloadedAt: Date.now(),
      checksum,
    };
    await Bun.write(versionFile, JSON.stringify(cacheData));
  }

  if (spinner) spinner.text = "Extracting WidevineCdm...";
  logger.info("Extracting WidevineCdm...");

  await extractArchive(exePath, tempDir);

  logger.info("Searching for WidevineCdm in extracted files...");
  const widevinePath = await findWidevineInExtracted(tempDir);

  if (!widevinePath) {
    logger.error("Could not find WidevineCdm in downloaded Chrome");
    throw new Error("Could not find WidevineCdm in downloaded Chrome");
  }

  logger.info("Chrome downloaded and extracted successfully.");
  return widevinePath;
}
