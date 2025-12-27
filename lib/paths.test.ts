import { describe, it, expect } from 'bun:test';
import { getPlatform, getArch, getChromeAssetPattern } from './paths';

describe('paths', () => {
  describe('getPlatform', () => {
    it('should return the current platform', () => {
      const platform = getPlatform();
      expect(['win32', 'darwin', 'linux']).toContain(platform);
    });

    it('should throw error for unsupported platform', () => {
      // Mock process.platform to an unsupported value
      const originalPlatform = process.platform;
      Object.defineProperty(process, 'platform', {
        value: 'freebsd',
        writable: true,
      });

      expect(() => getPlatform()).toThrow('Unsupported platform: freebsd');

      // Restore original platform
      Object.defineProperty(process, 'platform', {
        value: originalPlatform,
        writable: true,
      });
    });
  });

  describe('getArch', () => {
    it('should return the current architecture', () => {
      const arch = getArch();
      expect(['x64', 'arm64']).toContain(arch);
    });

    it('should throw error for unsupported architecture', () => {
      // Mock process.arch to an unsupported value
      const originalArch = process.arch;
      Object.defineProperty(process, 'arch', {
        value: 'ia32',
        writable: true,
      });

      expect(() => getArch()).toThrow('Unsupported architecture: ia32');

      // Restore original arch
      Object.defineProperty(process, 'arch', {
        value: originalArch,
        writable: true,
      });
    });
  });

  describe('getChromeAssetPattern', () => {
    it('should return a regex pattern', () => {
      const pattern = getChromeAssetPattern();
      expect(pattern).toBeInstanceOf(RegExp);
    });

    it('should match Windows x64 asset names', () => {
      const originalPlatform = process.platform;
      const originalArch = process.arch;

      Object.defineProperty(process, 'platform', { value: 'win32', writable: true });
      Object.defineProperty(process, 'arch', { value: 'x64', writable: true });

      const pattern = getChromeAssetPattern();
      expect(pattern.test('x64_143.0.7499.170_chrome_installer_uncompressed.exe')).toBe(true);
      expect(pattern.test('arm64_143.0.7499.170_chrome_installer_uncompressed.exe')).toBe(false);

      Object.defineProperty(process, 'platform', { value: originalPlatform, writable: true });
      Object.defineProperty(process, 'arch', { value: originalArch, writable: true });
    });

    it('should match Windows arm64 asset names', () => {
      const originalPlatform = process.platform;
      const originalArch = process.arch;

      Object.defineProperty(process, 'platform', { value: 'win32', writable: true });
      Object.defineProperty(process, 'arch', { value: 'arm64', writable: true });

      const pattern = getChromeAssetPattern();
      expect(pattern.test('arm64_143.0.7499.170_chrome_installer_uncompressed.exe')).toBe(true);
      expect(pattern.test('x64_143.0.7499.170_chrome_installer_uncompressed.exe')).toBe(false);

      Object.defineProperty(process, 'platform', { value: originalPlatform, writable: true });
      Object.defineProperty(process, 'arch', { value: originalArch, writable: true });
    });

    it('should throw error for non-Windows platforms', () => {
      const originalPlatform = process.platform;
      Object.defineProperty(process, 'platform', { value: 'darwin', writable: true });

      expect(() => getChromeAssetPattern()).toThrow('Chrome download is only supported on Windows');

      Object.defineProperty(process, 'platform', { value: originalPlatform, writable: true });
    });
  });
});
