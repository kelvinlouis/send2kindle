const { Readability } = require("@mozilla/readability");
const { JSDOM } = require("jsdom");

/**
 * Extract article content from URL using @mozilla/readability
 */
async function extractArticle(url) {
  console.log(`\u{1F4F0} Extracting article from: ${url}`);

  const response = await fetch(url, {
    headers: {
      "User-Agent":
        "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Safari/537.36",
      Accept:
        "text/html,application/xhtml+xml,application/xml;q=0.9,image/webp,*/*;q=0.8",
      "Accept-Language": "en-US,en;q=0.5",
    },
  });

  if (!response.ok) {
    throw new Error(`HTTP error! status: ${response.status}`);
  }

  const html = await response.text();
  const dom = new JSDOM(html, { url });
  const reader = new Readability(dom.window.document);
  const article = reader.parse();

  if (!article || !article.content || article.content.length < 100) {
    throw new Error("Could not extract meaningful content from URL");
  }

  console.log(`\u2713 Extracted article: "${article.title}"`);

  return {
    title: article.title || "Article",
    content: article.content,
    textContent: article.textContent,
    byline: article.byline,
    siteName: article.siteName,
  };
}

module.exports = { extractArticle };
