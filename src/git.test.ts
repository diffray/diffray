import { test, expect, describe } from 'vitest';
import { isGitRepository, getChangedFiles, getFileStatus, getAllDiffs } from './git.js';

describe('Git Module', () => {
  describe('isGitRepository', () => {
    test('should return true for current directory', async () => {
      const result = await isGitRepository();
      expect(result).toBe(true);
    });
  });

  describe('getChangedFiles', () => {
    test('should return array of strings', async () => {
      const files = await getChangedFiles();
      expect(Array.isArray(files)).toBe(true);
      files.forEach((file) => expect(typeof file).toBe('string'));
    });
  });

  describe('getFileStatus', () => {
    test('should return valid status', async () => {
      const files = await getChangedFiles();
      if (files.length > 0) {
        const firstFile = files[0];
        if (firstFile) {
          const status = await getFileStatus(firstFile);
          expect(['modified', 'added', 'deleted', 'renamed']).toContain(status);
        }
      }
    });
  });

  describe('getAllDiffs', () => {
    test('should return array of GitDiff objects', async () => {
      const diffs = await getAllDiffs();
      expect(Array.isArray(diffs)).toBe(true);

      diffs.forEach((diff) => {
        expect(diff).toHaveProperty('file');
        expect(diff).toHaveProperty('status');
        expect(diff).toHaveProperty('diff');
        expect(diff).toHaveProperty('additions');
        expect(diff).toHaveProperty('deletions');
        expect(typeof diff.file).toBe('string');
        expect(['modified', 'added', 'deleted', 'renamed']).toContain(diff.status);
        expect(typeof diff.diff).toBe('string');
        expect(typeof diff.additions).toBe('number');
        expect(typeof diff.deletions).toBe('number');
        expect(diff.additions).toBeGreaterThanOrEqual(0);
        expect(diff.deletions).toBeGreaterThanOrEqual(0);
      });
    });

    test('should not include null values', async () => {
      const diffs = await getAllDiffs();
      expect(diffs.every((d) => d !== null)).toBe(true);
    });
  });
});
