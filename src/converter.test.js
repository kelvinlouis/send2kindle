import { describe, it, expect, vi, beforeEach } from 'vitest';
import { execSync } from 'child_process';
import fs from 'fs';
import os from 'os';
import { commandExists } from './utils.js';
import { convertToEpub } from './converter.js';

vi.mock('child_process', () => ({
  execSync: vi.fn(),
}));

vi.mock('fs', () => ({
  default: { writeFileSync: vi.fn(), existsSync: vi.fn() },
  writeFileSync: vi.fn(),
  existsSync: vi.fn(),
}));

vi.mock('os', () => ({
  default: { tmpdir: vi.fn(() => '/tmp') },
  tmpdir: vi.fn(() => '/tmp'),
}));

vi.mock('./utils.js', () => ({
  commandExists: vi.fn(),
  sanitizeFilename: vi.fn((name) => name.replace(/\s+/g, '_')),
  escapeYaml: vi.fn((text) => `"${text || ''}"`),
}));

beforeEach(() => {
  vi.spyOn(console, 'log').mockImplementation(() => {});
});

describe('convertToEpub', () => {
  it('throws when pandoc is not installed', () => {
    commandExists.mockReturnValue(false);
    expect(() => convertToEpub({ htmlContent: '<p>test</p>' })).toThrow('pandoc is not installed');
  });

  it('uses tmpdir in normal mode', () => {
    commandExists.mockReturnValue(true);
    fs.existsSync.mockReturnValue(true);
    convertToEpub({ htmlContent: '<p>test</p>', title: 'Test' });
    const htmlPath = fs.writeFileSync.mock.calls[0][0];
    expect(htmlPath).toMatch(/^\/tmp\//);
  });

  it('uses cwd in debug mode', () => {
    commandExists.mockReturnValue(true);
    fs.existsSync.mockReturnValue(true);
    const cwd = process.cwd();
    convertToEpub({ htmlContent: '<p>test</p>', title: 'Test', debugMode: true });
    const htmlPath = fs.writeFileSync.mock.calls[0][0];
    expect(htmlPath).toMatch(new RegExp(`^${cwd}`));
  });

  it('includes author in HTML and YAML when provided', () => {
    commandExists.mockReturnValue(true);
    fs.existsSync.mockReturnValue(true);
    convertToEpub({
      htmlContent: '<p>test</p>',
      title: 'Test',
      author: 'John Doe',
    });
    const htmlContent = fs.writeFileSync.mock.calls[0][1];
    const yamlContent = fs.writeFileSync.mock.calls[1][1];
    expect(htmlContent).toContain('John Doe');
    expect(yamlContent).toContain('author:');
  });

  it('omits author from HTML and YAML when not provided', () => {
    commandExists.mockReturnValue(true);
    fs.existsSync.mockReturnValue(true);
    convertToEpub({ htmlContent: '<p>test</p>', title: 'Test' });
    const htmlContent = fs.writeFileSync.mock.calls[0][1];
    const yamlContent = fs.writeFileSync.mock.calls[1][1];
    expect(htmlContent).not.toContain('meta name="author"');
    expect(yamlContent).not.toContain('author:');
  });

  it('throws when EPUB file was not created', () => {
    commandExists.mockReturnValue(true);
    fs.existsSync.mockReturnValue(false);
    expect(() => convertToEpub({ htmlContent: '<p>test</p>', title: 'Test' })).toThrow(
      'EPUB file was not created',
    );
  });

  it('calls pandoc with correct arguments', () => {
    commandExists.mockReturnValue(true);
    fs.existsSync.mockReturnValue(true);
    convertToEpub({ htmlContent: '<p>test</p>', title: 'My Title' });
    expect(execSync).toHaveBeenCalledWith(
      expect.stringContaining('pandoc'),
      expect.objectContaining({ encoding: 'utf-8', shell: '/bin/bash' }),
    );
  });

  it('returns the epub path', () => {
    commandExists.mockReturnValue(true);
    fs.existsSync.mockReturnValue(true);
    const result = convertToEpub({ htmlContent: '<p>test</p>', title: 'Test' });
    expect(result).toMatch(/Test\.epub$/);
  });

  it('logs extra paths in debug mode', () => {
    commandExists.mockReturnValue(true);
    fs.existsSync.mockReturnValue(true);
    convertToEpub({ htmlContent: '<p>test</p>', title: 'Test', debugMode: true });
    expect(console.log).toHaveBeenCalledWith(expect.stringContaining('HTML file saved to'));
    expect(console.log).toHaveBeenCalledWith(expect.stringContaining('EPUB file saved to'));
    expect(console.log).toHaveBeenCalledWith(expect.stringContaining('Metadata file saved to'));
  });

  it("uses default title 'Article' when not provided", () => {
    commandExists.mockReturnValue(true);
    fs.existsSync.mockReturnValue(true);
    convertToEpub({ htmlContent: '<p>test</p>' });
    const htmlContent = fs.writeFileSync.mock.calls[0][1];
    expect(htmlContent).toContain('Article');
  });
});
