import { describe, it, expect, vi, beforeEach } from 'vitest';
import { execSync } from 'child_process';
import fs from 'fs';
import {
  commandExists,
  getInputType,
  sanitizeFilename,
  escapeYaml,
  replaceYouTubeEmbeds,
  fixPictureSources,
} from './utils.js';

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

describe('replaceYouTubeEmbeds', () => {
  it('replaces YouTube iframe with a hyperlink using the title', () => {
    const html =
      '<figure><iframe width="200" height="150" src="https://www.youtube.com/embed/4Nna09dG_c0?feature=oembed" frameborder="0" title="My Video Title"></iframe></figure>';
    const result = replaceYouTubeEmbeds(html);
    expect(result).toBe(
      '<figure><p><a href="https://www.youtube.com/watch?v=4Nna09dG_c0">My Video Title (YouTube)</a></p></figure>',
    );
  });

  it('uses "YouTube Video" as fallback when no title attribute', () => {
    const html = '<iframe src="https://www.youtube.com/embed/abc123"></iframe>';
    const result = replaceYouTubeEmbeds(html);
    expect(result).toBe(
      '<p><a href="https://www.youtube.com/watch?v=abc123">YouTube Video (YouTube)</a></p>',
    );
  });

  it('handles multiple YouTube iframes', () => {
    const html =
      '<iframe src="https://www.youtube.com/embed/aaa" title="First"></iframe>' +
      '<p>Some text</p>' +
      '<iframe src="https://www.youtube.com/embed/bbb" title="Second"></iframe>';
    const result = replaceYouTubeEmbeds(html);
    expect(result).toContain('href="https://www.youtube.com/watch?v=aaa"');
    expect(result).toContain('First (YouTube)');
    expect(result).toContain('href="https://www.youtube.com/watch?v=bbb"');
    expect(result).toContain('Second (YouTube)');
    expect(result).toContain('<p>Some text</p>');
  });

  it('does not modify non-YouTube iframes', () => {
    const html = '<iframe src="https://vimeo.com/embed/12345" title="Vimeo"></iframe>';
    const result = replaceYouTubeEmbeds(html);
    expect(result).toBe(html);
  });

  it('returns html unchanged when no iframes present', () => {
    const html = '<p>Hello world</p>';
    const result = replaceYouTubeEmbeds(html);
    expect(result).toBe(html);
  });

  it('handles www and non-www YouTube URLs', () => {
    const html = '<iframe src="https://youtube.com/embed/xyz789" title="No WWW"></iframe>';
    const result = replaceYouTubeEmbeds(html);
    expect(result).toContain('href="https://www.youtube.com/watch?v=xyz789"');
  });
});

describe('fixPictureSources', () => {
  it('adds src to img when picture has source with srcSet', () => {
    const html =
      '<picture>' +
      '<source srcSet="https://example.com/img-640.jpg 640w, https://example.com/img-1400.jpg 1400w" type="image/webp"/>' +
      '<source srcSet="https://example.com/img-640.jpg 640w, https://example.com/img-1400.jpg 1400w"/>' +
      '<img alt="" width="700" height="382" loading="lazy"/>' +
      '</picture>';
    const result = fixPictureSources(html);
    expect(result).toContain('src="https://example.com/img-640.jpg"');
  });

  it('prefers non-webp source over webp source', () => {
    const html =
      '<picture>' +
      '<source srcSet="https://example.com/webp-640.webp 640w" type="image/webp"/>' +
      '<source srcSet="https://example.com/jpeg-640.jpg 640w"/>' +
      '<img alt="" width="700"/>' +
      '</picture>';
    const result = fixPictureSources(html);
    expect(result).toContain('src="https://example.com/jpeg-640.jpg"');
  });

  it('falls back to webp source when no non-webp source exists', () => {
    const html =
      '<picture>' +
      '<source srcSet="https://example.com/webp-640.webp 640w" type="image/webp"/>' +
      '<img alt="" width="700"/>' +
      '</picture>';
    const result = fixPictureSources(html);
    expect(result).toContain('src="https://example.com/webp-640.webp"');
  });

  it('does not modify img that already has src', () => {
    const html =
      '<picture>' +
      '<source srcSet="https://example.com/new.jpg 640w"/>' +
      '<img src="https://example.com/existing.jpg" alt=""/>' +
      '</picture>';
    const result = fixPictureSources(html);
    expect(result).not.toContain('src="https://example.com/new.jpg"');
    expect(result).toContain('src="https://example.com/existing.jpg"');
  });

  it('handles multiple picture elements', () => {
    const html =
      '<picture>' +
      '<source srcSet="https://example.com/a.jpg 640w"/>' +
      '<img alt="first" width="700"/>' +
      '</picture>' +
      '<p>text</p>' +
      '<picture>' +
      '<source srcSet="https://example.com/b.jpg 640w"/>' +
      '<img alt="second" width="700"/>' +
      '</picture>';
    const result = fixPictureSources(html);
    expect(result).toContain('src="https://example.com/a.jpg"');
    expect(result).toContain('src="https://example.com/b.jpg"');
  });

  it('returns html unchanged when no picture elements', () => {
    const html = '<p>Hello world</p><img src="https://example.com/img.jpg"/>';
    expect(fixPictureSources(html)).toBe(html);
  });

  it('skips picture elements without source srcSet', () => {
    const html = '<picture>' + '<img alt="" width="700"/>' + '</picture>';
    const result = fixPictureSources(html);
    expect(result).not.toContain('src=');
  });
});
