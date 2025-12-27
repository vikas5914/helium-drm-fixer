import { describe, it, expect, beforeEach, afterEach } from 'bun:test';
import { mkdir, rm, writeFile } from 'node:fs/promises';
import { join } from 'node:path';
import { copyDir, calculateChecksum, formatError } from './utils';
import { tmpdir } from 'node:os';

describe('utils', () => {
  let tempDir: string;
  let srcDir: string;
  let destDir: string;

  beforeEach(async () => {
    tempDir = join(tmpdir(), `helium-drm-test-${Date.now()}`);
    srcDir = join(tempDir, 'src');
    destDir = join(tempDir, 'dest');
    await mkdir(srcDir, { recursive: true });
    await mkdir(destDir, { recursive: true });
  });

  afterEach(async () => {
    try {
      await rm(tempDir, { recursive: true, force: true });
    } catch {
      // Ignore cleanup errors
    }
  });

  describe('copyDir', () => {
    it('should copy files from source to destination', async () => {
      // Create test file
      const testFile = join(srcDir, 'test.txt');
      await writeFile(testFile, 'Hello, World!');

      await copyDir(srcDir, destDir);

      // Verify file was copied
      const copiedFile = Bun.file(join(destDir, 'test.txt'));
      expect(await copiedFile.exists()).toBe(true);
      expect(await copiedFile.text()).toBe('Hello, World!');
    });

    it('should copy nested directories', async () => {
      // Create nested structure
      const nestedDir = join(srcDir, 'nested', 'dir');
      await mkdir(nestedDir, { recursive: true });
      const testFile = join(nestedDir, 'test.txt');
      await writeFile(testFile, 'Nested content');

      await copyDir(srcDir, destDir);

      // Verify nested file was copied
      const copiedFile = Bun.file(join(destDir, 'nested', 'dir', 'test.txt'));
      expect(await copiedFile.exists()).toBe(true);
      expect(await copiedFile.text()).toBe('Nested content');
    });

    it('should overwrite existing files', async () => {
      // Create initial file
      const testFile = join(destDir, 'test.txt');
      await writeFile(testFile, 'Old content');

      // Create source file with different content
      const srcFile = join(srcDir, 'test.txt');
      await writeFile(srcFile, 'New content');

      await copyDir(srcDir, destDir);

      // Verify file was overwritten
      const copiedFile = Bun.file(join(destDir, 'test.txt'));
      expect(await copiedFile.text()).toBe('New content');
    });
  });

  describe('calculateChecksum', () => {
    it('should calculate SHA-256 checksum of a file', async () => {
      const testFile = join(srcDir, 'test.txt');
      await writeFile(testFile, 'Hello, World!');

      const checksum = await calculateChecksum(testFile);

      expect(checksum).toBe('dffd6021bb2bd5b0af676290809ec3a53191dd81c7f70a4b28688a362182986f');
    });

    it('should return different checksums for different content', async () => {
      const file1 = join(srcDir, 'file1.txt');
      const file2 = join(srcDir, 'file2.txt');
      await writeFile(file1, 'Content 1');
      await writeFile(file2, 'Content 2');

      const checksum1 = await calculateChecksum(file1);
      const checksum2 = await calculateChecksum(file2);

      expect(checksum1).not.toBe(checksum2);
    });

    it('should return same checksum for identical content', async () => {
      const file1 = join(srcDir, 'file1.txt');
      const file2 = join(srcDir, 'file2.txt');
      await writeFile(file1, 'Same content');
      await writeFile(file2, 'Same content');

      const checksum1 = await calculateChecksum(file1);
      const checksum2 = await calculateChecksum(file2);

      expect(checksum1).toBe(checksum2);
    });
  });

  describe('formatError', () => {
    it('should format error without context', () => {
      const error = formatError('Test error');
      expect(error).toBe('Test error');
    });

    it('should format error with context', () => {
      const error = formatError('Test error', { key: 'value', number: 42 });
      expect(error).toBe('Test error (key=value, number=42)');
    });

    it('should handle undefined values in context', () => {
      const error = formatError('Test error', { key: 'value', undefined: undefined });
      expect(error).toBe('Test error (key=value, undefined=undefined)');
    });

    it('should handle objects in context', () => {
      const error = formatError('Test error', { obj: { nested: 'value' } });
      expect(error).toBe('Test error (obj=[object Object])');
    });
  });
});
