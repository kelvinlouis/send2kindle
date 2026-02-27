import { isTwitterUrl, extractTweet } from './twitter.js';
import { extractArticle } from './article.js';

/**
 * Extract content from a URL, routing to the appropriate extractor.
 */
export async function extract(url) {
  if (isTwitterUrl(url)) {
    return await extractTweet(url);
  }
  return await extractArticle(url);
}
