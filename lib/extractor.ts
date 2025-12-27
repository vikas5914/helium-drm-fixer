import { readdir, stat } from "node:fs/promises";
import { join } from "node:path";
import { getLogger } from "./logger";

export async function findWidevineInExtracted(
  baseDir: string
): Promise<string | null> {
  const log = getLogger();
  log.info(`Starting WidevineCdm search in: ${baseDir}`);

  async function searchDir(dir: string, depth: number = 0): Promise<string | null> {
    const indent = "  ".repeat(depth);
    
    try {
      const stats = await stat(dir);
      if (!stats.isDirectory()) {
        log.info(`${indent}✗ Not a directory: ${dir}`);
        return null;
      }
    } catch {
      log.info(`${indent}✗ Path does not exist: ${dir}`);
      return null;
    }

    log.info(`${indent}Scanning directory: ${dir}`);
    const entries = await readdir(dir, { withFileTypes: true });
    log.info(`${indent}Found ${entries.length} entries`);

    for (const entry of entries) {
      const fullPath = join(dir, entry.name);

      if (entry.isDirectory()) {
        if (
          entry.name === "WidevineCdm" ||
          entry.name === "WidevineCdm.plugin"
        ) {
          log.info(`${indent}✓ Found WidevineCdm at: ${fullPath}`);
          return fullPath;
        }
        
        const result = await searchDir(fullPath, depth + 1);
        if (result) return result;
      }
    }

    return null;
  }

  const result = await searchDir(baseDir);
  if (!result) {
    log.info(`✗ WidevineCdm not found in: ${baseDir}`);
  }
  return result;
}

export async function extractArchive(
  archivePath: string,
  destDir: string
): Promise<void> {
  const { unpack } = require("7zip-min");

  await new Promise<void>((resolve, reject) => {
    unpack(archivePath, destDir, (err: Error | null) => {
      if (err) reject(err);
      else resolve();
    });
  });
}
