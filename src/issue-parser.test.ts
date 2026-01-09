import { test, expect, describe } from 'bun:test';
import { parseIssues } from './issue-parser';

describe('parseIssues', () => {
  describe('valid JSON array', () => {
    test('should parse simple JSON array', () => {
      const input = JSON.stringify([
        {
          file: 'src/app.ts',
          lineStart: 10,
          lineEnd: 15,
          severity: 'high',
          category: 'bug',
          shortDescription: 'Null pointer exception',
          fullDescription: 'Variable may be null',
          suggestion: 'Add null check',
          agent: 'bugs',
        },
      ]);

      const issues = parseIssues(input);

      expect(issues).toHaveLength(1);
      expect(issues[0]).toEqual({
        file: 'src/app.ts',
        lineStart: 10,
        lineEnd: 15,
        severity: 'high',
        category: 'bug',
        shortDescription: 'Null pointer exception',
        fullDescription: 'Variable may be null',
        suggestion: 'Add null check',
        agent: 'bugs',
      });
    });

    test('should parse multiple issues', () => {
      const input = JSON.stringify([
        {
          file: 'src/a.ts',
          lineStart: 1,
          severity: 'low',
          category: 'style',
          shortDescription: 'Issue 1',
        },
        {
          file: 'src/b.ts',
          lineStart: 2,
          severity: 'medium',
          category: 'quality',
          shortDescription: 'Issue 2',
        },
      ]);

      const issues = parseIssues(input, 'test-agent');

      expect(issues).toHaveLength(2);
      expect(issues[0]?.file).toBe('src/a.ts');
      expect(issues[0]?.agent).toBe('test-agent');
      expect(issues[1]?.file).toBe('src/b.ts');
      expect(issues[1]?.agent).toBe('test-agent');
    });

    test('should handle empty array', () => {
      const issues = parseIssues('[]');
      expect(issues).toHaveLength(0);
    });
  });

  describe('alternative field names', () => {
    test('should accept "line" instead of "lineStart"', () => {
      const input = JSON.stringify([
        {
          file: 'src/app.ts',
          line: 42,
          severity: 'high',
          category: 'bug',
          shortDescription: 'Test',
        },
      ]);

      const issues = parseIssues(input);

      expect(issues[0]?.lineStart).toBe(42);
      expect(issues[0]?.lineEnd).toBe(42);
    });

    test('should accept "short" instead of "shortDescription"', () => {
      const input = JSON.stringify([
        {
          file: 'src/app.ts',
          lineStart: 1,
          severity: 'medium',
          category: 'quality',
          short: 'Short desc',
        },
      ]);

      const issues = parseIssues(input);

      expect(issues[0]?.shortDescription).toBe('Short desc');
    });

    test('should accept "message" instead of "shortDescription"', () => {
      const input = JSON.stringify([
        {
          file: 'src/app.ts',
          lineStart: 1,
          severity: 'medium',
          category: 'quality',
          message: 'Message desc',
        },
      ]);

      const issues = parseIssues(input);

      expect(issues[0]?.shortDescription).toBe('Message desc');
    });

    test('should accept "description" instead of "fullDescription"', () => {
      const input = JSON.stringify([
        {
          file: 'src/app.ts',
          lineStart: 1,
          severity: 'medium',
          category: 'quality',
          shortDescription: 'Short',
          description: 'Full description here',
        },
      ]);

      const issues = parseIssues(input);

      expect(issues[0]?.fullDescription).toBe('Full description here');
    });
  });

  describe('Claude CLI envelope format', () => {
    test('should extract issues from Claude CLI result envelope', () => {
      const claudeOutput = JSON.stringify({
        type: 'result',
        result: JSON.stringify([
          {
            file: 'src/app.ts',
            lineStart: 10,
            severity: 'high',
            category: 'security',
            shortDescription: 'SQL injection',
          },
        ]),
      });

      const issues = parseIssues(claudeOutput);

      expect(issues).toHaveLength(1);
      expect(issues[0]?.shortDescription).toBe('SQL injection');
    });

    test('should handle Claude CLI result with markdown code block', () => {
      const claudeOutput = JSON.stringify({
        type: 'result',
        result:
          '```json\n' +
          JSON.stringify([
            {
              file: 'src/app.ts',
              lineStart: 5,
              severity: 'medium',
              category: 'performance',
              shortDescription: 'N+1 query',
            },
          ]) +
          '\n```',
      });

      const issues = parseIssues(claudeOutput);

      expect(issues).toHaveLength(1);
      expect(issues[0]?.shortDescription).toBe('N+1 query');
    });

    test('should handle Claude CLI result with <json> XML tags', () => {
      const claudeOutput = JSON.stringify({
        type: 'result',
        result:
          'Here is my analysis:\n\n<json>\n' +
          JSON.stringify([
            {
              file: 'src/app.ts',
              lineStart: 5,
              severity: 'high',
              category: 'security',
              shortDescription: 'XSS vulnerability',
            },
          ]) +
          '\n</json>',
      });

      const issues = parseIssues(claudeOutput);

      expect(issues).toHaveLength(1);
      expect(issues[0]?.shortDescription).toBe('XSS vulnerability');
    });

    test('should prefer <json> tags over markdown code blocks', () => {
      const claudeOutput = JSON.stringify({
        type: 'result',
        result:
          '```diff\n-old\n+new\n```\n\nHere are the issues:\n\n<json>\n' +
          JSON.stringify([
            {
              file: 'src/app.ts',
              lineStart: 10,
              severity: 'medium',
              category: 'bug',
              shortDescription: 'From XML tags',
            },
          ]) +
          '\n</json>',
      });

      const issues = parseIssues(claudeOutput);

      expect(issues).toHaveLength(1);
      expect(issues[0]?.shortDescription).toBe('From XML tags');
    });
  });

  describe('JSON extraction from text', () => {
    test('should extract JSON array from text with prefix', () => {
      const input = `Here are the issues I found:
[{"file": "src/app.ts", "lineStart": 1, "severity": "low", "category": "style", "shortDescription": "Test"}]`;

      const issues = parseIssues(input);

      expect(issues).toHaveLength(1);
      expect(issues[0]?.file).toBe('src/app.ts');
    });

    test('should extract JSON array from text with suffix', () => {
      const input = `[{"file": "src/app.ts", "lineStart": 1, "severity": "low", "category": "style", "shortDescription": "Test"}]

That's all the issues I found.`;

      const issues = parseIssues(input);

      expect(issues).toHaveLength(1);
    });

    test('should extract JSON array from markdown code block', () => {
      const input = `\`\`\`json
[{"file": "src/app.ts", "lineStart": 1, "severity": "low", "category": "style", "shortDescription": "Test"}]
\`\`\``;

      const issues = parseIssues(input);

      expect(issues).toHaveLength(1);
    });
  });

  describe('object with issues property', () => {
    test('should extract issues from object with issues array', () => {
      const input = JSON.stringify({
        issues: [
          {
            file: 'src/app.ts',
            lineStart: 1,
            severity: 'high',
            category: 'bug',
            shortDescription: 'Found a bug',
          },
        ],
      });

      const issues = parseIssues(input);

      expect(issues).toHaveLength(1);
      expect(issues[0]?.shortDescription).toBe('Found a bug');
    });
  });

  describe('filtering invalid issues', () => {
    test('should filter out issues without file', () => {
      const input = JSON.stringify([
        { lineStart: 1, severity: 'high', category: 'bug', shortDescription: 'No file' },
        { file: 'src/app.ts', lineStart: 1, severity: 'high', category: 'bug', shortDescription: 'Has file' },
      ]);

      const issues = parseIssues(input);

      expect(issues).toHaveLength(1);
      expect(issues[0]?.shortDescription).toBe('Has file');
    });

    test('should filter out issues without shortDescription', () => {
      const input = JSON.stringify([
        { file: 'src/app.ts', lineStart: 1, severity: 'high', category: 'bug' },
        { file: 'src/app.ts', lineStart: 1, severity: 'high', category: 'bug', shortDescription: 'Has desc' },
      ]);

      const issues = parseIssues(input);

      expect(issues).toHaveLength(1);
      expect(issues[0]?.shortDescription).toBe('Has desc');
    });

    test('should filter out issues with lineStart <= 0', () => {
      const input = JSON.stringify([
        { file: 'src/app.ts', lineStart: 0, severity: 'high', category: 'bug', shortDescription: 'Line 0' },
        { file: 'src/app.ts', lineStart: -1, severity: 'high', category: 'bug', shortDescription: 'Negative' },
        { file: 'src/app.ts', lineStart: 1, severity: 'high', category: 'bug', shortDescription: 'Valid' },
      ]);

      const issues = parseIssues(input);

      expect(issues).toHaveLength(1);
      expect(issues[0]?.shortDescription).toBe('Valid');
    });
  });

  describe('default values', () => {
    test('should use default severity "medium"', () => {
      const input = JSON.stringify([
        { file: 'src/app.ts', lineStart: 1, category: 'bug', shortDescription: 'Test' },
      ]);

      const issues = parseIssues(input);

      expect(issues[0]?.severity).toBe('medium');
    });

    test('should use default category "quality"', () => {
      const input = JSON.stringify([
        { file: 'src/app.ts', lineStart: 1, severity: 'high', shortDescription: 'Test' },
      ]);

      const issues = parseIssues(input);

      expect(issues[0]?.category).toBe('quality');
    });

    test('should use default agent "unknown" when not provided', () => {
      const input = JSON.stringify([
        { file: 'src/app.ts', lineStart: 1, severity: 'high', category: 'bug', shortDescription: 'Test' },
      ]);

      const issues = parseIssues(input);

      expect(issues[0]?.agent).toBe('unknown');
    });

    test('should use provided agent parameter', () => {
      const input = JSON.stringify([
        { file: 'src/app.ts', lineStart: 1, severity: 'high', category: 'bug', shortDescription: 'Test' },
      ]);

      const issues = parseIssues(input, 'security-agent');

      expect(issues[0]?.agent).toBe('security-agent');
    });
  });

  describe('error handling', () => {
    test('should return empty array for invalid JSON', () => {
      const issues = parseIssues('not valid json');
      expect(issues).toHaveLength(0);
    });

    test('should return empty array for non-array JSON', () => {
      const issues = parseIssues('{"key": "value"}');
      expect(issues).toHaveLength(0);
    });

    test('should return empty array for empty string', () => {
      const issues = parseIssues('');
      expect(issues).toHaveLength(0);
    });

    test('should return empty array for null-ish values in array', () => {
      const input = JSON.stringify([null, undefined, {}]);
      const issues = parseIssues(input);
      expect(issues).toHaveLength(0);
    });
  });

  describe('string line number parsing', () => {
    test('should parse "lineStart": "42" string number format', () => {
      const input = JSON.stringify([
        {
          file: 'src/test.ts',
          lineStart: '42',
          lineEnd: '45',
          severity: 'medium',
          shortDescription: 'Test issue',
        },
      ]);
      const issues = parseIssues(input);
      expect(issues).toHaveLength(1);
      expect(issues[0]!.lineStart).toBe(42);
      expect(issues[0]!.lineEnd).toBe(45);
    });

    test('should parse "line": "137" string number format', () => {
      const input = JSON.stringify([
        {
          file: 'src/test.go',
          line: '137',
          severity: 'high',
          issue: 'Race condition in cache access',
        },
      ]);
      const issues = parseIssues(input);
      expect(issues).toHaveLength(1);
      expect(issues[0]!.lineStart).toBe(137);
      expect(issues[0]!.lineEnd).toBe(137);
    });
  });
});
