import { test, expect, describe } from 'bun:test';
import {
  chunk,
  formatBatchLabel,
  aggregateErrors,
  executeBatches,
  allSucceeded,
  getFailures,
  totalDuration,
  collectData,
  type BatchResult,
} from './batch-executor';

describe('chunk', () => {
  test('should split array into chunks of given size', () => {
    const result = chunk([1, 2, 3, 4, 5], 2);
    expect(result).toEqual([[1, 2], [3, 4], [5]]);
  });

  test('should return single chunk for small arrays', () => {
    const result = chunk([1, 2], 5);
    expect(result).toEqual([[1, 2]]);
  });

  test('should return empty array for empty input', () => {
    const result = chunk([], 3);
    expect(result).toEqual([]);
  });

  test('should handle exact divisible arrays', () => {
    const result = chunk([1, 2, 3, 4], 2);
    expect(result).toEqual([[1, 2], [3, 4]]);
  });

  test('should throw for size < 1', () => {
    expect(() => chunk([1, 2, 3], 0)).toThrow('Chunk size must be at least 1');
    expect(() => chunk([1, 2, 3], -1)).toThrow('Chunk size must be at least 1');
  });
});

describe('formatBatchLabel', () => {
  test('should format single batch without item count', () => {
    const result = formatBatchLabel({
      label: 'Processing',
      batchIndex: 0,
      totalBatches: 1,
    });
    expect(result).toBe('Processing...');
  });

  test('should format single batch with item count', () => {
    const result = formatBatchLabel({
      label: 'Validating',
      batchIndex: 0,
      totalBatches: 1,
      itemCount: 5,
    });
    expect(result).toBe('Validating (5 items)...');
  });

  test('should format single batch with 1 item', () => {
    const result = formatBatchLabel({
      label: 'Validating',
      batchIndex: 0,
      totalBatches: 1,
      itemCount: 1,
    });
    expect(result).toBe('Validating (1 item)...');
  });

  test('should format multiple batches without item count', () => {
    const result = formatBatchLabel({
      label: 'security-scan',
      batchIndex: 1,
      totalBatches: 3,
    });
    expect(result).toBe('security-scan (batch 2/3)...');
  });

  test('should format multiple batches with item count', () => {
    const result = formatBatchLabel({
      label: 'Validating',
      batchIndex: 0,
      totalBatches: 2,
      itemCount: 15,
    });
    expect(result).toBe('Validating (batch 1/2, 15 items)...');
  });
});

describe('aggregateErrors', () => {
  test('should return undefined for no errors', () => {
    const result = aggregateErrors([]);
    expect(result).toBeUndefined();
  });

  test('should return undefined for all undefined errors', () => {
    const result = aggregateErrors([undefined, undefined]);
    expect(result).toBeUndefined();
  });

  test('should return single error as-is', () => {
    const result = aggregateErrors(['Error 1']);
    expect(result).toBe('Error 1');
  });

  test('should deduplicate identical errors with count', () => {
    const result = aggregateErrors(['Timeout', 'Timeout', 'Timeout']);
    expect(result).toBe('Timeout (3 batches)');
  });

  test('should join different errors with semicolon', () => {
    const result = aggregateErrors(['Error 1', 'Error 2']);
    expect(result).toBe('Error 1; Error 2');
  });

  test('should filter undefined and deduplicate', () => {
    const result = aggregateErrors([undefined, 'Error', undefined, 'Error']);
    expect(result).toBe('Error (2 batches)');
  });

  test('should handle mixed unique and duplicate errors', () => {
    const result = aggregateErrors(['A', 'B', 'A']);
    expect(result).toBe('A; B');
  });
});

describe('executeBatches', () => {
  test('should execute all batches and return results', async () => {
    const batches = [1, 2, 3];
    const results = await executeBatches(
      batches,
      async (batch, idx, total) => ({
        success: true,
        data: batch * 2,
      }),
      { concurrency: 2 }
    );

    expect(results).toHaveLength(3);
    expect(results[0]?.data).toBe(2);
    expect(results[1]?.data).toBe(4);
    expect(results[2]?.data).toBe(6);
  });

  test('should pass correct indices to executor', async () => {
    const indices: number[] = [];
    const totals: number[] = [];

    await executeBatches(
      ['a', 'b', 'c'],
      async (_, idx, total) => {
        indices.push(idx);
        totals.push(total);
        return { success: true, data: null };
      },
      { concurrency: 1 }
    );

    expect(indices).toEqual([0, 1, 2]);
    expect(totals).toEqual([3, 3, 3]);
  });

  test('should respect concurrency limit', async () => {
    let maxConcurrent = 0;
    let current = 0;

    await executeBatches(
      [1, 2, 3, 4, 5],
      async () => {
        current++;
        maxConcurrent = Math.max(maxConcurrent, current);
        await new Promise((r) => setTimeout(r, 10));
        current--;
        return { success: true, data: null };
      },
      { concurrency: 2 }
    );

    expect(maxConcurrent).toBeLessThanOrEqual(2);
  });
});

describe('allSucceeded', () => {
  test('should return true if all results succeeded', () => {
    const results: BatchResult<number>[] = [
      { success: true, data: 1 },
      { success: true, data: 2 },
    ];
    expect(allSucceeded(results)).toBe(true);
  });

  test('should return false if any result failed', () => {
    const results: BatchResult<number>[] = [
      { success: true, data: 1 },
      { success: false, data: 0, error: 'Failed' },
    ];
    expect(allSucceeded(results)).toBe(false);
  });

  test('should return true for empty array', () => {
    expect(allSucceeded([])).toBe(true);
  });
});

describe('getFailures', () => {
  test('should return only failed results', () => {
    const results: BatchResult<number>[] = [
      { success: true, data: 1 },
      { success: false, data: 0, error: 'Error 1' },
      { success: true, data: 2 },
      { success: false, data: 0, error: 'Error 2' },
    ];

    const failures = getFailures(results);
    expect(failures).toHaveLength(2);
    expect(failures[0]?.error).toBe('Error 1');
    expect(failures[1]?.error).toBe('Error 2');
  });

  test('should return empty array if all succeeded', () => {
    const results: BatchResult<number>[] = [
      { success: true, data: 1 },
      { success: true, data: 2 },
    ];
    expect(getFailures(results)).toEqual([]);
  });
});

describe('totalDuration', () => {
  test('should sum durations', () => {
    const results: BatchResult<null>[] = [
      { success: true, data: null, duration: 100 },
      { success: true, data: null, duration: 200 },
      { success: false, data: null, duration: 50 },
    ];
    expect(totalDuration(results)).toBe(350);
  });

  test('should handle missing durations', () => {
    const results: BatchResult<null>[] = [
      { success: true, data: null, duration: 100 },
      { success: true, data: null },
    ];
    expect(totalDuration(results)).toBe(100);
  });
});

describe('collectData', () => {
  test('should collect data from successful results', () => {
    const results: BatchResult<number[]>[] = [
      { success: true, data: [1, 2] },
      { success: false, data: [3], error: 'Failed' },
      { success: true, data: [4, 5, 6] },
    ];

    const collected = collectData(results);
    expect(collected).toEqual([1, 2, 4, 5, 6]);
  });

  test('should return empty array if all failed', () => {
    const results: BatchResult<number[]>[] = [
      { success: false, data: [1], error: 'Failed' },
    ];
    expect(collectData(results)).toEqual([]);
  });
});
