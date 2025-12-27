import { readdir, rm, mkdir, cp } from 'node:fs/promises';
import { join } from 'node:path';
import { createHash } from 'node:crypto';
import type { DownloadProgress } from './types';

/**
 * Recursively copy a directory using fs.promises.cp (Node.js 16.7.0+)
 */
export async function copyDir(src: string, dest: string): Promise<void> {
  await rm(dest, { recursive: true, force: true });
  await cp(src, dest, { recursive: true, force: true, verbatimSymlinks: true });
}

/**
 * Calculate SHA-256 checksum of a file
 */
export async function calculateChecksum(filePath: string): Promise<string> {
  const file = Bun.file(filePath);
  const buffer = await file.arrayBuffer();
  const hash = createHash('sha256');
  hash.update(Buffer.from(buffer));
  return hash.digest('hex');
}

/**
 * Display download progress in a single line
 */
export function displayProgress(progress: DownloadProgress): void {
  const { downloaded, total, percentage } = progress;
  const downloadedMB = (downloaded / (1024 * 1024)).toFixed(1);
  const totalMB = (total / (1024 * 1024)).toFixed(1);
  const barLength = 30;
  const filledLength = Math.floor((percentage / 100) * barLength);
  const emptyLength = barLength - filledLength;
  const bar = '█'.repeat(filledLength) + '░'.repeat(emptyLength);
  
  process.stdout.write(`\r  Downloading: [${bar}] ${percentage}% (${downloadedMB} MB / ${totalMB} MB)`);
}

/**
 * Format download progress string
 */
export function formatProgress(downloaded: number, total: number): string {
  const downloadedMB = (downloaded / (1024 * 1024)).toFixed(1);
  const totalMB = (total / (1024 * 1024)).toFixed(1);
  const percentage = total > 0 ? Math.min(100, Math.round((downloaded / total) * 100)) : 0;
  return `${downloadedMB} MB / ${totalMB} MB (${percentage}%)`;
}

/**
 * Clean up temporary directory
 */
export async function cleanupTemp(tempDir: string): Promise<void> {
  try {
    await rm(tempDir, { recursive: true, force: true });
  } catch (error) {
    // Ignore cleanup errors
  }
}

/**
 * Format error message with context
 */
export function formatError(message: string, context?: Record<string, unknown>): string {
  let error = message;
  if (context) {
    const details = Object.entries(context)
      .map(([key, value]) => `${key}=${value}`)
      .join(', ');
    error += ` (${details})`;
  }
  return error;
}
