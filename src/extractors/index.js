const { isTwitterUrl, extractTweet } = require("./twitter");
const { extractArticle } = require("./article");

/**
 * Extract content from a URL, routing to the appropriate extractor.
 */
async function extract(url) {
  if (isTwitterUrl(url)) {
    return await extractTweet(url);
  }
  return await extractArticle(url);
}

module.exports = { extract };
