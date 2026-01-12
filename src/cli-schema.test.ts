import { describe, it, expect } from 'vitest';
import { validateReviewArgs } from './cli-schema';
import { ZodError } from 'zod';

describe('CLI Schema Validation', () => {
  describe('confidence validation', () => {
    it('should accept valid confidence values', () => {
      const result = validateReviewArgs({ confidence: '80' });
      expect(result.confidence).toBe(80);
    });

    it('should accept confidence at boundaries', () => {
      expect(validateReviewArgs({ confidence: '0' }).confidence).toBe(0);
      expect(validateReviewArgs({ confidence: '100' }).confidence).toBe(100);
    });

    it('should handle undefined confidence', () => {
      const result = validateReviewArgs({});
      expect(result.confidence).toBeUndefined();
    });

    it('should reject non-numeric confidence', () => {
      try {
        validateReviewArgs({ confidence: 'abc' });
        expect.fail('Should have thrown ZodError');
      } catch (error) {
        expect(error).toBeInstanceOf(ZodError);
        const zodError = error as ZodError;
        expect(zodError.errors[0]?.message).toContain('Invalid confidence value');
        expect(zodError.errors[0]?.message).toContain('abc');
      }
    });

    it('should reject confidence below 0', () => {
      expect(() => validateReviewArgs({ confidence: '-1' })).toThrow(ZodError);
      expect(() => validateReviewArgs({ confidence: '-1' })).toThrow('Must be between 0-100');
    });

    it('should reject confidence above 100', () => {
      expect(() => validateReviewArgs({ confidence: '150' })).toThrow(ZodError);
      expect(() => validateReviewArgs({ confidence: '150' })).toThrow('Must be between 0-100');
    });

    it('should reject confidence with decimals', () => {
      expect(() => validateReviewArgs({ confidence: '80.5' })).toThrow(ZodError);
    });
  });

  describe('severity validation', () => {
    it('should accept valid severity values', () => {
      const result = validateReviewArgs({ severity: 'critical,high' });
      expect(result.severity).toEqual(['critical', 'high']);
    });

    it('should accept single severity value', () => {
      const result = validateReviewArgs({ severity: 'medium' });
      expect(result.severity).toEqual(['medium']);
    });

    it('should trim whitespace', () => {
      const result = validateReviewArgs({ severity: 'critical, high , medium' });
      expect(result.severity).toEqual(['critical', 'high', 'medium']);
    });

    it('should handle undefined severity', () => {
      const result = validateReviewArgs({});
      expect(result.severity).toBeUndefined();
    });

    it('should reject invalid severity values', () => {
      expect(() => validateReviewArgs({ severity: 'critical,invalid' })).toThrow(ZodError);
      expect(() => validateReviewArgs({ severity: 'critical,invalid' })).toThrow(
        'Invalid severity values: invalid'
      );
    });

    it('should reject all invalid severity values', () => {
      expect(() => validateReviewArgs({ severity: 'foo,bar' })).toThrow(ZodError);
      expect(() => validateReviewArgs({ severity: 'foo,bar' })).toThrow(
        'Invalid severity values: foo, bar'
      );
    });
  });

  describe('boolean flags', () => {
    it('should accept boolean flags', () => {
      const result = validateReviewArgs({
        stream: true,
        verbose: false,
        json: true,
        'skip-validation': false,
      });
      expect(result.stream).toBe(true);
      expect(result.verbose).toBe(false);
      expect(result.json).toBe(true);
      expect(result['skip-validation']).toBe(false);
    });
  });

  describe('string arguments', () => {
    it('should accept string arguments', () => {
      const result = validateReviewArgs({
        base: 'main',
        head: 'feature',
        branch: 'develop',
        agent: 'bug-hunter',
        'exclude-agent': 'security-scan',
        rule: 'code-security',
        'exclude-rule': 'code-bugs',
        executor: 'claude-cli',
      });
      expect(result.base).toBe('main');
      expect(result.head).toBe('feature');
      expect(result.branch).toBe('develop');
      expect(result.agent).toEqual(['bug-hunter']);
      expect(result['exclude-agent']).toEqual(['security-scan']);
      expect(result.rule).toEqual(['code-security']);
      expect(result['exclude-rule']).toEqual(['code-bugs']);
      expect(result.executor).toBe('claude-cli');
    });
  });

  describe('complete validation', () => {
    it('should validate all arguments together', () => {
      const result = validateReviewArgs({
        confidence: '90',
        severity: 'critical,high',
        base: 'main',
        stream: true,
        json: false,
      });
      expect(result.confidence).toBe(90);
      expect(result.severity).toEqual(['critical', 'high']);
      expect(result.base).toBe('main');
      expect(result.stream).toBe(true);
      expect(result.json).toBe(false);
    });
  });
});
