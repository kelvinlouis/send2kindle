import { describe, it, expect, vi, beforeEach } from 'vitest';
import { execSync } from 'child_process';
import fs from 'fs';
import os from 'os';
import { commandExists, replaceYouTubeEmbeds } from './utils.js';
import { convertToEpub, convertBookToEpub } from './converter.js';

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
  replaceYouTubeEmbeds: vi.fn((html) =>
    html.replace(
      /<iframe[^>]*youtube[^>]*><\/iframe>/g,
      '<p><a href="https://www.youtube.com/watch?v=test">Video (YouTube)</a></p>',
    ),
  ),
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

  it('replaces YouTube iframes before writing HTML', () => {
    commandExists.mockReturnValue(true);
    fs.existsSync.mockReturnValue(true);
    const htmlWithIframe =
      '<p>text</p><iframe src="https://www.youtube.com/embed/abc" title="My Vid"></iframe>';
    convertToEpub({ htmlContent: htmlWithIframe, title: 'Test' });
    expect(replaceYouTubeEmbeds).toHaveBeenCalledWith(htmlWithIframe);
    const writtenHtml = fs.writeFileSync.mock.calls[0][1];
    expect(writtenHtml).not.toContain('<iframe');
  });
});

describe('convertBookToEpub', () => {
  const chapters = [
    { title: 'Chapter One', htmlContent: '<p>First chapter content</p>' },
    { title: 'Chapter Two', htmlContent: '<p>Second chapter content</p>' },
  ];

  it('throws when pandoc is not installed', () => {
    commandExists.mockReturnValue(false);
    expect(() => convertBookToEpub({ chapters, title: 'My Book' })).toThrow(
      'pandoc is not installed',
    );
  });

  it('wraps each chapter with an h1 heading', () => {
    commandExists.mockReturnValue(true);
    fs.existsSync.mockReturnValue(true);
    convertBookToEpub({ chapters, title: 'My Book' });
    const htmlContent = fs.writeFileSync.mock.calls[0][1];
    expect(htmlContent).toContain('<h1>Chapter One</h1>');
    expect(htmlContent).toContain('<h1>Chapter Two</h1>');
  });

  it('includes all chapter content in the HTML', () => {
    commandExists.mockReturnValue(true);
    fs.existsSync.mockReturnValue(true);
    convertBookToEpub({ chapters, title: 'My Book' });
    const htmlContent = fs.writeFileSync.mock.calls[0][1];
    expect(htmlContent).toContain('First chapter content');
    expect(htmlContent).toContain('Second chapter content');
  });

  it('calls pandoc with --epub-chapter-level=1', () => {
    commandExists.mockReturnValue(true);
    fs.existsSync.mockReturnValue(true);
    convertBookToEpub({ chapters, title: 'My Book' });
    const pandocCmd = execSync.mock.calls[0][0];
    expect(pandocCmd).toContain('--epub-chapter-level=1');
  });

  it('uses book title and author in YAML metadata', () => {
    commandExists.mockReturnValue(true);
    fs.existsSync.mockReturnValue(true);
    convertBookToEpub({ chapters, title: 'My Book', author: 'Author Name' });
    const yamlContent = fs.writeFileSync.mock.calls[1][1];
    expect(yamlContent).toContain('"My Book"');
    expect(yamlContent).toContain('author:');
  });

  it('returns the epub path', () => {
    commandExists.mockReturnValue(true);
    fs.existsSync.mockReturnValue(true);
    const result = convertBookToEpub({ chapters, title: 'My Book' });
    expect(result).toMatch(/My_Book\.epub$/);
  });

  it('replaces YouTube iframes in chapter content', () => {
    commandExists.mockReturnValue(true);
    fs.existsSync.mockReturnValue(true);
    const chaptersWithIframe = [
      {
        title: 'Ch1',
        htmlContent: '<iframe src="https://www.youtube.com/embed/abc" title="Vid"></iframe>',
      },
    ];
    convertBookToEpub({ chapters: chaptersWithIframe, title: 'Book' });
    expect(replaceYouTubeEmbeds).toHaveBeenCalled();
    const writtenHtml = fs.writeFileSync.mock.calls[0][1];
    expect(writtenHtml).not.toContain('<iframe');
  });
});
