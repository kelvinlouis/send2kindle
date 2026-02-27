import { describe, it, expect, vi } from 'vitest';
import { isTwitterUrl, extractTweet } from './twitter.js';
import { extractArticle } from './article.js';
import { extract } from './index.js';

vi.mock('./twitter.js', () => ({
  isTwitterUrl: vi.fn(),
  extractTweet: vi.fn(),
}));

vi.mock('./article.js', () => ({
  extractArticle: vi.fn(),
}));

describe('extract', () => {
  it('routes Twitter URLs to extractTweet', async () => {
    isTwitterUrl.mockReturnValue(true);
    extractTweet.mockResolvedValue({ title: 'Tweet' });
    const result = await extract('https://x.com/user/status/123');
    expect(extractTweet).toHaveBeenCalledWith('https://x.com/user/status/123');
    expect(result).toEqual({ title: 'Tweet' });
  });

  it('routes non-Twitter URLs to extractArticle', async () => {
    isTwitterUrl.mockReturnValue(false);
    extractArticle.mockResolvedValue({ title: 'Article' });
    const result = await extract('https://example.com/article');
    expect(extractArticle).toHaveBeenCalledWith('https://example.com/article');
    expect(result).toEqual({ title: 'Article' });
  });
});
