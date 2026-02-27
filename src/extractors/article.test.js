import { describe, it, expect, vi, beforeEach } from 'vitest';
import { Readability } from '@mozilla/readability';
import { extractArticle } from './article.js';

const mockParse = vi.fn();

vi.mock('@mozilla/readability', () => ({
  Readability: vi.fn(() => ({ parse: mockParse })),
}));

vi.mock('jsdom', () => ({
  JSDOM: vi.fn(() => ({
    window: { document: {} },
  })),
}));

beforeEach(() => {
  vi.spyOn(console, 'log').mockImplementation(() => {});
  vi.stubGlobal(
    'fetch',
    vi.fn(() =>
      Promise.resolve({
        ok: true,
        text: () => Promise.resolve('<html><body>test</body></html>'),
      }),
    ),
  );
});

describe('extractArticle', () => {
  it('throws on HTTP error', async () => {
    fetch.mockResolvedValue({ ok: false, status: 404 });
    await expect(extractArticle('https://example.com')).rejects.toThrow('HTTP error! status: 404');
  });

  it('throws when article is null', async () => {
    mockParse.mockReturnValue(null);
    await expect(extractArticle('https://example.com')).rejects.toThrow(
      'Could not extract meaningful content',
    );
  });

  it('throws when content is too short (<100 chars)', async () => {
    mockParse.mockReturnValue({
      content: 'short',
      title: 'Test',
      textContent: 'short',
    });
    await expect(extractArticle('https://example.com')).rejects.toThrow(
      'Could not extract meaningful content',
    );
  });

  it('returns article data on success', async () => {
    const longContent = 'x'.repeat(200);
    mockParse.mockReturnValue({
      title: 'My Article',
      content: longContent,
      textContent: longContent,
      byline: 'Author',
      siteName: 'Site',
    });
    const result = await extractArticle('https://example.com');
    expect(result).toEqual({
      title: 'My Article',
      content: longContent,
      textContent: longContent,
      byline: 'Author',
      siteName: 'Site',
    });
  });

  it("uses 'Article' as fallback title", async () => {
    const longContent = 'x'.repeat(200);
    mockParse.mockReturnValue({
      title: null,
      content: longContent,
      textContent: longContent,
      byline: null,
      siteName: null,
    });
    const result = await extractArticle('https://example.com');
    expect(result.title).toBe('Article');
  });
});
