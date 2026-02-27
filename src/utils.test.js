import { describe, it, expect, vi, beforeEach } from 'vitest';
import { execSync } from 'child_process';
import fs from 'fs';
import { commandExists, getInputType, sanitizeFilename, escapeYaml } from './utils.js';

vi.mock('child_process', () => ({
  execSync: vi.fn(),
}));

vi.mock('fs', () => ({
  default: { existsSync: vi.fn() },
  existsSync: vi.fn(),
}));

describe('commandExists', () => {
  it('returns true when command is found', () => {
    execSync.mockReturnValue(undefined);
    expect(commandExists('pandoc')).toBe(true);
    expect(execSync).toHaveBeenCalledWith('which pandoc', { stdio: 'ignore' });
  });

  it('returns false when command is not found', () => {
    execSync.mockImplementation(() => {
      throw new Error('not found');
    });
    expect(commandExists('pandoc')).toBe(false);
  });
});

describe('getInputType', () => {
  it("returns 'url' for http URLs", () => {
    expect(getInputType('http://example.com')).toBe('url');
  });

  it("returns 'url' for https URLs", () => {
    expect(getInputType('https://example.com/article')).toBe('url');
  });

  it("returns 'pdf' for .pdf files", () => {
    expect(getInputType('/path/to/file.pdf')).toBe('pdf');
  });

  it("returns 'pdf' for .PDF files (case insensitive)", () => {
    expect(getInputType('/path/to/file.PDF')).toBe('pdf');
  });

  it("returns 'file' when path exists on disk", () => {
    fs.existsSync.mockReturnValue(true);
    expect(getInputType('/path/to/file.epub')).toBe('file');
  });

  it("returns 'unknown' when path does not exist", () => {
    fs.existsSync.mockReturnValue(false);
    expect(getInputType('/no/such/file.epub')).toBe('unknown');
  });
});

describe('sanitizeFilename', () => {
  it('removes unsafe characters', () => {
    expect(sanitizeFilename('file<>:"/\\|?*name')).toBe('filename');
  });

  it('replaces whitespace with underscores', () => {
    expect(sanitizeFilename('hello world  foo')).toBe('hello_world_foo');
  });

  it('truncates to 100 characters', () => {
    const long = 'a'.repeat(200);
    expect(sanitizeFilename(long)).toHaveLength(100);
  });

  it('removes control characters', () => {
    expect(sanitizeFilename('abc\x00\x01\x1Fdef')).toBe('abcdef');
  });
});

describe('escapeYaml', () => {
  it('returns empty quoted string for null', () => {
    expect(escapeYaml(null)).toBe('""');
  });

  it('returns empty quoted string for undefined', () => {
    expect(escapeYaml(undefined)).toBe('""');
  });

  it('returns empty quoted string for empty string', () => {
    expect(escapeYaml('')).toBe('""');
  });

  it('escapes backslashes', () => {
    expect(escapeYaml('a\\b')).toBe('"a\\\\b"');
  });

  it('escapes double quotes', () => {
    expect(escapeYaml('say "hello"')).toBe('"say \\"hello\\""');
  });

  it('replaces newlines and carriage returns', () => {
    expect(escapeYaml('line1\nline2\rline3')).toBe('"line1 line2line3"');
  });

  it('replaces tabs with spaces', () => {
    expect(escapeYaml('col1\tcol2')).toBe('"col1 col2"');
  });

  it('wraps plain text in quotes', () => {
    expect(escapeYaml('Hello World')).toBe('"Hello World"');
  });
});
