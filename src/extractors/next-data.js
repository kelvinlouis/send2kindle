const NEXT_DATA_REGEX = /<script id="__NEXT_DATA__" type="application\/json">(.+?)<\/script>/s;

/**
 * Convert simple markdown to HTML.
 * Handles: headings, paragraphs, bold, italic, links, images, blockquotes.
 */
export function markdownToHtml(markdown) {
  if (!markdown) return '';

  const blocks = markdown.trim().split(/\n{2,}/);

  return blocks
    .map((block) => {
      const trimmed = block.trim();
      if (!trimmed) return '';

      const headingMatch = trimmed.match(/^(#{1,6})\s+(.+)$/);
      if (headingMatch) {
        const level = headingMatch[1].length;
        return `<h${level}>${convertInline(headingMatch[2])}</h${level}>`;
      }

      if (trimmed.startsWith('![')) {
        const imgMatch = trimmed.match(/^!\[([^\]]*)\]\(([^)]+)\)$/);
        if (imgMatch) {
          return `<img src="${imgMatch[2]}" alt="${imgMatch[1]}">`;
        }
      }

      if (trimmed.startsWith('> ')) {
        const quoteContent = trimmed.replace(/^> /gm, '');
        return `<blockquote><p>${convertInline(quoteContent)}</p></blockquote>`;
      }

      return `<p>${convertInline(trimmed)}</p>`;
    })
    .filter(Boolean)
    .join('\n');
}

function convertInline(text) {
  return (
    text
      // images inline
      .replace(/!\[([^\]]*)\]\(([^)]+)\)/g, '<img src="$2" alt="$1">')
      // links
      .replace(/\[([^\]]+)\]\(([^)]+)\)/g, '<a href="$2">$1</a>')
      // bold
      .replace(/\*\*(.+?)\*\*/g, '<strong>$1</strong>')
      // italic
      .replace(/\*(.+?)\*/g, '<em>$1</em>')
      // inline code
      .replace(/`([^`]+)`/g, '<code>$1</code>')
  );
}

function resolveUrls(html, baseUrl) {
  if (!baseUrl) return html;
  let origin;
  try {
    origin = new URL(baseUrl).origin;
  } catch {
    return html;
  }
  return html
    .replace(/src="(\/[^"]+)"/g, `src="${origin}$1"`)
    .replace(/href="(\/[^"]+)"/g, `href="${origin}$1"`);
}

/**
 * Try to extract article content from Next.js __NEXT_DATA__ JSON embedded in HTML.
 * Returns the standard extractor shape or null if not found/applicable.
 * @param {string} html - Raw page HTML
 * @param {string} [baseUrl] - Source URL, used to resolve relative image/link paths
 */
export function tryExtractFromNextData(html, baseUrl) {
  const match = html.match(NEXT_DATA_REGEX);
  if (!match) return null;

  let data;
  try {
    data = JSON.parse(match[1]);
  } catch {
    return null;
  }

  const postData = data?.props?.pageProps?.postData;
  if (!postData?.content) return null;

  const authors = postData.authors;
  const byline = Array.isArray(authors) && authors.length > 0 ? authors.join(', ') : null;

  return {
    title: postData.title || 'Article',
    content: resolveUrls(markdownToHtml(postData.content), baseUrl),
    textContent: postData.content,
    byline,
    siteName: null,
  };
}
