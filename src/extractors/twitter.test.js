import { describe, it, expect, vi, beforeEach } from 'vitest';
import { isTwitterUrl, extractTweet, convertArticleBlocksToHtml } from './twitter.js';

beforeEach(() => {
  vi.spyOn(console, 'log').mockImplementation(() => {});
  vi.stubGlobal('fetch', vi.fn());
});

describe('isTwitterUrl', () => {
  it('returns true for x.com status URLs', () => {
    expect(isTwitterUrl('https://x.com/user/status/123')).toBe(true);
  });

  it('returns true for twitter.com status URLs', () => {
    expect(isTwitterUrl('https://twitter.com/user/status/123')).toBe(true);
  });

  it('returns false for non-twitter URLs', () => {
    expect(isTwitterUrl('https://example.com/article')).toBe(false);
  });

  it('returns false for twitter URLs without /status/', () => {
    expect(isTwitterUrl('https://x.com/user')).toBe(false);
  });

  it('returns false for twitter.com profile without status', () => {
    expect(isTwitterUrl('https://twitter.com/user/likes')).toBe(false);
  });
});

describe('convertArticleBlocksToHtml', () => {
  it('resolves atomic blocks to inline images via entityMap and mediaEntities', () => {
    const blocks = [
      { type: 'unstyled', text: 'Before image', entityRanges: [], inlineStyleRanges: [] },
      {
        type: 'atomic',
        text: ' ',
        entityRanges: [{ key: 1, length: 1, offset: 0 }],
        data: {},
      },
      { type: 'unstyled', text: 'After image', entityRanges: [], inlineStyleRanges: [] },
    ];
    const entityMap = [
      {
        key: '1',
        value: {
          type: 'MEDIA',
          data: { mediaItems: [{ mediaId: '111222333' }] },
          mutability: 'Immutable',
        },
      },
    ];
    const mediaEntities = [
      {
        media_id: '111222333',
        media_info: { original_img_url: 'https://pbs.twimg.com/media/test-image.png' },
      },
    ];

    const html = convertArticleBlocksToHtml(blocks, entityMap, mediaEntities);
    expect(html).toContain('<p>Before image</p>');
    expect(html).toContain(
      '<img src="https://pbs.twimg.com/media/test-image.png" alt="Article image"',
    );
    expect(html).toContain('<p>After image</p>');
  });

  it('skips atomic blocks when entityMap or mediaEntities are missing', () => {
    const blocks = [
      {
        type: 'atomic',
        text: ' ',
        entityRanges: [{ key: 1, length: 1, offset: 0 }],
        data: {},
      },
    ];
    const html = convertArticleBlocksToHtml(blocks);
    expect(html).not.toContain('<img');
  });

  it('skips atomic blocks when media entity has no matching mediaId', () => {
    const blocks = [
      {
        type: 'atomic',
        text: ' ',
        entityRanges: [{ key: 1, length: 1, offset: 0 }],
        data: {},
      },
    ];
    const entityMap = [
      {
        key: '1',
        value: {
          type: 'MEDIA',
          data: { mediaItems: [{ mediaId: '999' }] },
          mutability: 'Immutable',
        },
      },
    ];
    const mediaEntities = [
      {
        media_id: '000',
        media_info: { original_img_url: 'https://pbs.twimg.com/media/other.png' },
      },
    ];

    const html = convertArticleBlocksToHtml(blocks, entityMap, mediaEntities);
    expect(html).not.toContain('<img');
  });

  it('resolves multiple atomic blocks to their respective images', () => {
    const blocks = [
      {
        type: 'atomic',
        text: ' ',
        entityRanges: [{ key: 1, length: 1, offset: 0 }],
        data: {},
      },
      {
        type: 'atomic',
        text: ' ',
        entityRanges: [{ key: 2, length: 1, offset: 0 }],
        data: {},
      },
    ];
    const entityMap = [
      {
        key: '1',
        value: { type: 'MEDIA', data: { mediaItems: [{ mediaId: 'aaa' }] } },
      },
      {
        key: '2',
        value: { type: 'MEDIA', data: { mediaItems: [{ mediaId: 'bbb' }] } },
      },
    ];
    const mediaEntities = [
      { media_id: 'aaa', media_info: { original_img_url: 'https://img.com/first.png' } },
      { media_id: 'bbb', media_info: { original_img_url: 'https://img.com/second.png' } },
    ];

    const html = convertArticleBlocksToHtml(blocks, entityMap, mediaEntities);
    expect(html).toContain('https://img.com/first.png');
    expect(html).toContain('https://img.com/second.png');
  });
});

describe('extractTweet', () => {
  function mockFetchResponse(data, ok = true) {
    fetch.mockResolvedValue({
      ok,
      status: ok ? 200 : 500,
      json: () => Promise.resolve(data),
    });
  }

  it('throws when URL cannot be parsed', async () => {
    await expect(extractTweet('https://example.com/bad')).rejects.toThrow(
      'Could not parse Twitter URL',
    );
  });

  it('throws on API HTTP error', async () => {
    fetch.mockResolvedValue({ ok: false, status: 500 });
    await expect(extractTweet('https://x.com/user/status/123')).rejects.toThrow(
      'API error! status: 500',
    );
  });

  it('throws when API returns non-200 code', async () => {
    mockFetchResponse({ code: 404, message: 'Tweet not found' });
    await expect(extractTweet('https://x.com/user/status/123')).rejects.toThrow('Tweet not found');
  });

  it('throws with default message when code != 200 and no message', async () => {
    mockFetchResponse({ code: 404 });
    await expect(extractTweet('https://x.com/user/status/123')).rejects.toThrow(
      'Tweet not found or has been deleted',
    );
  });

  describe('Twitter Article', () => {
    it('extracts article with cover image', async () => {
      mockFetchResponse({
        code: 200,
        tweet: {
          author: { name: 'John', screen_name: 'john' },
          article: {
            title: 'My Article',
            content: {
              blocks: [
                { type: 'header-one', text: 'Heading' },
                { type: 'unstyled', text: 'Paragraph text' },
              ],
            },
            cover_media: {
              media_info: {
                original_img_url: 'https://img.com/cover.jpg',
              },
            },
          },
        },
      });
      const result = await extractTweet('https://x.com/john/status/123');
      expect(result.title).toBe('My Article');
      expect(result.content).toContain('cover.jpg');
      expect(result.content).toContain('<h1>Heading</h1>');
      expect(result.content).toContain('<p>Paragraph text</p>');
      expect(result.byline).toBe('John');
      expect(result.siteName).toBe('Twitter/X');
    });

    it('extracts article without cover image', async () => {
      mockFetchResponse({
        code: 200,
        tweet: {
          author: { name: 'Jane', screen_name: 'jane' },
          article: {
            title: 'No Cover',
            content: {
              blocks: [{ type: 'unstyled', text: 'Some text' }],
            },
          },
        },
      });
      const result = await extractTweet('https://x.com/jane/status/456');
      expect(result.content).not.toContain('<img');
      expect(result.title).toBe('No Cover');
    });

    it('falls back to handle-based title when article has no title', async () => {
      mockFetchResponse({
        code: 200,
        tweet: {
          author: { name: 'Jane', screen_name: 'jane' },
          article: {
            content: {
              blocks: [{ type: 'unstyled', text: 'Content' }],
            },
          },
        },
      });
      const result = await extractTweet('https://x.com/jane/status/456');
      expect(result.title).toBe('Article by @jane');
    });

    it('handles all block types', async () => {
      mockFetchResponse({
        code: 200,
        tweet: {
          author: { name: 'Dev', screen_name: 'dev' },
          article: {
            title: 'Block Test',
            content: {
              blocks: [
                { type: 'header-one', text: 'H1' },
                { type: 'header-two', text: 'H2' },
                { type: 'header-three', text: 'H3' },
                { type: 'blockquote', text: 'Quote' },
                { type: 'code-block', text: 'code()' },
                { type: 'ordered-list-item', text: 'Item 1' },
                { type: 'unordered-list-item', text: 'Bullet' },
                { type: 'atomic' },
                { type: 'unstyled', text: '' },
                { type: 'unstyled', text: 'Normal paragraph' },
              ],
            },
          },
        },
      });
      const result = await extractTweet('https://x.com/dev/status/789');
      expect(result.content).toContain('<h1>H1</h1>');
      expect(result.content).toContain('<h2>H2</h2>');
      expect(result.content).toContain('<h3>H3</h3>');
      expect(result.content).toContain('<blockquote>Quote</blockquote>');
      expect(result.content).toContain('<pre><code>code()</code></pre>');
      expect(result.content).toContain('<li>Item 1</li>');
      expect(result.content).toContain('<li>Bullet</li>');
      expect(result.content).toContain('<br/>');
      expect(result.content).toContain('<p>Normal paragraph</p>');
    });

    it('embeds inline images from article media_entities', async () => {
      mockFetchResponse({
        code: 200,
        tweet: {
          author: { name: 'Ray', screen_name: 'ray' },
          article: {
            title: 'Article With Images',
            content: {
              blocks: [
                { type: 'unstyled', text: 'Intro text', entityRanges: [] },
                {
                  type: 'atomic',
                  text: ' ',
                  entityRanges: [{ key: 1, length: 1, offset: 0 }],
                  data: {},
                },
                { type: 'unstyled', text: 'More text', entityRanges: [] },
                {
                  type: 'atomic',
                  text: ' ',
                  entityRanges: [{ key: 2, length: 1, offset: 0 }],
                  data: {},
                },
              ],
              entityMap: [
                {
                  key: '1',
                  value: {
                    type: 'MEDIA',
                    data: { mediaItems: [{ mediaId: '100' }] },
                    mutability: 'Immutable',
                  },
                },
                {
                  key: '2',
                  value: {
                    type: 'MEDIA',
                    data: { mediaItems: [{ mediaId: '200' }] },
                    mutability: 'Immutable',
                  },
                },
              ],
            },
            media_entities: [
              {
                media_id: '100',
                media_info: { original_img_url: 'https://pbs.twimg.com/media/chart1.png' },
              },
              {
                media_id: '200',
                media_info: { original_img_url: 'https://pbs.twimg.com/media/chart2.png' },
              },
            ],
            cover_media: {
              media_info: { original_img_url: 'https://pbs.twimg.com/media/cover.jpg' },
            },
          },
        },
      });
      const result = await extractTweet('https://x.com/ray/status/999');
      expect(result.content).toContain('https://pbs.twimg.com/media/cover.jpg');
      expect(result.content).toContain('https://pbs.twimg.com/media/chart1.png');
      expect(result.content).toContain('https://pbs.twimg.com/media/chart2.png');
      expect(result.content).toContain('<p>Intro text</p>');
      expect(result.content).toContain('<p>More text</p>');
    });
  });

  describe('Regular tweet', () => {
    it('extracts basic tweet text', async () => {
      mockFetchResponse({
        code: 200,
        tweet: {
          author: { name: 'Alice', screen_name: 'alice' },
          text: 'Hello world!',
        },
      });
      const result = await extractTweet('https://x.com/alice/status/111');
      expect(result.title).toBe('Tweet by @alice');
      expect(result.content).toContain('Hello world!');
      expect(result.textContent).toBe('Hello world!');
      expect(result.byline).toBe('Alice');
    });

    it('throws when tweet has no text', async () => {
      mockFetchResponse({
        code: 200,
        tweet: {
          author: { name: 'Bob', screen_name: 'bob' },
          text: '',
        },
      });
      await expect(extractTweet('https://x.com/bob/status/222')).rejects.toThrow(
        'Tweet has no text content',
      );
    });

    it('throws when tweet text is whitespace-only', async () => {
      mockFetchResponse({
        code: 200,
        tweet: {
          author: { name: 'Bob', screen_name: 'bob' },
          text: '   ',
        },
      });
      await expect(extractTweet('https://x.com/bob/status/222')).rejects.toThrow(
        'Tweet has no text content',
      );
    });

    it('includes media photos when present', async () => {
      mockFetchResponse({
        code: 200,
        tweet: {
          author: { name: 'Carl', screen_name: 'carl' },
          text: 'Check this out',
          media: {
            photos: [{ url: 'https://img.com/1.jpg' }, { url: 'https://img.com/2.jpg' }],
          },
        },
      });
      const result = await extractTweet('https://x.com/carl/status/333');
      expect(result.content).toContain('https://img.com/1.jpg');
      expect(result.content).toContain('https://img.com/2.jpg');
      expect(result.content).toContain('class="media"');
    });

    it('omits media section when no photos', async () => {
      mockFetchResponse({
        code: 200,
        tweet: {
          author: { name: 'Dave', screen_name: 'dave' },
          text: 'No pics',
        },
      });
      const result = await extractTweet('https://x.com/dave/status/444');
      expect(result.content).not.toContain('class="media"');
    });

    it('includes quoted tweet when present', async () => {
      mockFetchResponse({
        code: 200,
        tweet: {
          author: { name: 'Eve', screen_name: 'eve' },
          text: 'Quoting this',
          quote: {
            author: { name: 'Frank', screen_name: 'frank' },
            text: 'Original text',
          },
        },
      });
      const result = await extractTweet('https://x.com/eve/status/555');
      expect(result.content).toContain('Frank');
      expect(result.content).toContain('@frank');
      expect(result.content).toContain('Original text');
      expect(result.content).toContain('<blockquote');
    });

    it('omits quoted section when no quote', async () => {
      mockFetchResponse({
        code: 200,
        tweet: {
          author: { name: 'Grace', screen_name: 'grace' },
          text: 'Solo tweet',
        },
      });
      const result = await extractTweet('https://x.com/grace/status/666');
      expect(result.content).not.toContain('<blockquote');
    });

    it('falls back to username when author info is missing', async () => {
      mockFetchResponse({
        code: 200,
        tweet: {
          text: 'Hello',
        },
      });
      const result = await extractTweet('https://x.com/anon/status/777');
      expect(result.title).toBe('Tweet by @anon');
      expect(result.byline).toBe('anon');
    });
  });
});
