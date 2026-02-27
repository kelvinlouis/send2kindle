/**
 * Check if URL is a Twitter/X.com status URL
 */
export function isTwitterUrl(url) {
  return (url.includes('x.com/') || url.includes('twitter.com/')) && url.includes('/status/');
}

/**
 * Build a lookup: entityMap key → image URL, using entityMap + media_entities
 */
function buildMediaLookup(entityMap, mediaEntities) {
  if (!entityMap || !mediaEntities) return new Map();

  const mediaById = new Map();
  for (const entity of mediaEntities) {
    if (entity.media_id && entity.media_info?.original_img_url) {
      mediaById.set(entity.media_id, entity.media_info.original_img_url);
    }
  }

  const lookup = new Map();
  for (const entry of entityMap) {
    if (entry.value?.type !== 'MEDIA') continue;
    const mediaId = entry.value.data?.mediaItems?.[0]?.mediaId;
    if (mediaId && mediaById.has(mediaId)) {
      lookup.set(String(entry.key), mediaById.get(mediaId));
    }
  }

  return lookup;
}

/**
 * Build a set of entity keys that are DIVIDERs
 */
function buildDividerSet(entityMap) {
  if (!entityMap) return new Set();

  const dividers = new Set();
  for (const entry of entityMap) {
    if (entry.value?.type === 'DIVIDER') {
      dividers.add(String(entry.key));
    }
  }
  return dividers;
}

/**
 * Convert Twitter article blocks to HTML
 */
export function convertArticleBlocksToHtml(blocks, entityMap, mediaEntities, referencedTweets) {
  const mediaLookup = buildMediaLookup(entityMap, mediaEntities);
  const dividerSet = buildDividerSet(entityMap);
  const tweetLookup = referencedTweets || new Map();
  let html = '';

  for (const block of blocks) {
    const text = block.text || '';
    const type = block.type || 'unstyled';

    switch (type) {
      case 'header-one':
        html += `<h1>${text}</h1>\n`;
        break;
      case 'header-two':
        html += `<h2>${text}</h2>\n`;
        break;
      case 'header-three':
        html += `<h3>${text}</h3>\n`;
        break;
      case 'blockquote':
        html += `<blockquote>${text}</blockquote>\n`;
        break;
      case 'code-block':
        html += `<pre><code>${text}</code></pre>\n`;
        break;
      case 'ordered-list-item':
        html += `<li>${text}</li>\n`;
        break;
      case 'unordered-list-item':
        html += `<li>${text}</li>\n`;
        break;
      case 'atomic': {
        const entityKey = String(block.entityRanges?.[0]?.key);
        const imgUrl = mediaLookup.get(entityKey);
        if (imgUrl) {
          html += `<p><img src="${imgUrl}" alt="Article image" style="max-width: 100%;"></p>\n`;
        } else if (dividerSet.has(entityKey)) {
          html += `<hr>\n`;
        } else if (tweetLookup.has(entityKey)) {
          const tweet = tweetLookup.get(entityKey);
          const heading =
            tweet.title ||
            (tweet.text?.length > 100 ? tweet.text.slice(0, 100) + '...' : tweet.text);
          html += `<blockquote style="border-left: 3px solid #1da1f2; padding: 10px 15px; margin: 15px 0;">\n`;
          html += `  <p><strong>${heading}</strong></p>\n`;
          html += `  <p><em>\u2014 ${tweet.author} (@${tweet.handle})</em> \u00b7 <a href="${tweet.url}">View on X</a></p>\n`;
          html += `</blockquote>\n`;
        }
        break;
      }
      case 'unstyled':
      default:
        if (text.trim()) {
          html += `<p>${text}</p>\n`;
        } else {
          html += `<br/>\n`;
        }
        break;
    }
  }

  return html;
}

/**
 * Fetch referenced tweets from entityMap TWEET entries
 * Returns a Map<entityKey, { author, handle, text, title, url }>
 */
export async function fetchReferencedTweets(entityMap) {
  if (!entityMap) return new Map();

  const tweetEntries = entityMap.filter((entry) => entry.value?.type === 'TWEET');
  if (tweetEntries.length === 0) return new Map();

  const results = await Promise.allSettled(
    tweetEntries.map(async (entry) => {
      const tweetId = entry.value.data?.tweetId;
      if (!tweetId) return null;

      const response = await fetch(`https://api.fxtwitter.com/i/status/${tweetId}`, {
        headers: { Accept: 'application/json' },
      });
      if (!response.ok) return null;

      const data = await response.json();
      if (data.code !== 200 || !data.tweet) return null;

      const tweet = data.tweet;
      return {
        key: String(entry.key),
        author: tweet.author?.name || 'Unknown',
        handle: tweet.author?.screen_name || '',
        text: tweet.text || '',
        title: tweet.article?.title,
        url: tweet.url || `https://x.com/i/status/${tweetId}`,
      };
    }),
  );

  const lookup = new Map();
  for (const result of results) {
    if (result.status === 'fulfilled' && result.value) {
      const { key, ...tweetData } = result.value;
      lookup.set(key, tweetData);
    }
  }
  return lookup;
}

/**
 * Extract tweet content using the fxtwitter JSON API
 */
export async function extractTweet(url) {
  console.log(`\u{1F426} Detected Twitter/X.com URL, using fxtwitter API...`);

  const match = url.match(/(?:x\.com|twitter\.com)\/([^\/]+)\/status\/(\d+)/);

  if (!match) {
    throw new Error('Could not parse Twitter URL');
  }

  const [, username, tweetId] = match;
  const apiUrl = `https://api.fxtwitter.com/${username}/status/${tweetId}`;

  console.log(`\u{1F4E1} Fetching from: ${apiUrl}`);

  const response = await fetch(apiUrl, {
    headers: {
      Accept: 'application/json',
    },
  });

  if (!response.ok) {
    throw new Error(`API error! status: ${response.status}`);
  }

  const data = await response.json();

  if (data.code !== 200 || !data.tweet) {
    throw new Error(data.message || 'Tweet not found or has been deleted');
  }

  const tweet = data.tweet;
  const authorName = tweet.author?.name || username;
  const authorHandle = tweet.author?.screen_name || username;

  // Twitter Article
  if (tweet.article && tweet.article.content && tweet.article.content.blocks) {
    console.log(`\u{1F4C4} Detected Twitter Article: "${tweet.article.title}"`);

    const articleTitle = tweet.article.title || `Article by @${authorHandle}`;
    const blocks = tweet.article.content.blocks;
    const entityMap = tweet.article.content.entityMap;
    const mediaEntities = tweet.article.media_entities;

    const referencedTweets = await fetchReferencedTweets(entityMap);
    const articleHtml = convertArticleBlocksToHtml(
      blocks,
      entityMap,
      mediaEntities,
      referencedTweets,
    );

    const plainText = blocks
      .map((block) => block.text || '')
      .filter((text) => text.trim())
      .join('\n\n');

    let coverHtml = '';
    if (tweet.article.cover_media?.media_info?.original_img_url) {
      const coverUrl = tweet.article.cover_media.media_info.original_img_url;
      coverHtml = `<p><img src="${coverUrl}" alt="Cover image" style="max-width: 100%;"></p>\n`;
    }

    console.log(`\u2713 Extracted article: "${articleTitle}" (${blocks.length} blocks)`);

    return {
      title: articleTitle,
      content: coverHtml + articleHtml,
      textContent: plainText,
      byline: authorName,
      siteName: 'Twitter/X',
    };
  }

  // Regular tweet
  const tweetText = tweet.text || '';

  if (!tweetText.trim()) {
    throw new Error('Tweet has no text content');
  }

  const formattedText = tweetText
    .split('\n')
    .map((line) => `<p>${line || '&nbsp;'}</p>`)
    .join('\n');

  let mediaHtml = '';
  if (tweet.media?.photos && tweet.media.photos.length > 0) {
    mediaHtml = '<div class="media">';
    for (const photo of tweet.media.photos) {
      mediaHtml += `<p><img src="${photo.url}" alt="Tweet image" style="max-width: 100%;"></p>`;
    }
    mediaHtml += '</div>';
  }

  let quotedHtml = '';
  if (tweet.quote) {
    const quotedAuthor = tweet.quote.author?.name || 'Unknown';
    const quotedHandle = tweet.quote.author?.screen_name || '';
    const quotedText = tweet.quote.text || '';
    quotedHtml = `
      <blockquote style="border-left: 3px solid #ccc; padding-left: 10px; margin: 10px 0;">
        <p><strong>${quotedAuthor}</strong> (@${quotedHandle}):</p>
        <p>${quotedText}</p>
      </blockquote>
    `;
  }

  const content = `
    ${formattedText}
    ${mediaHtml}
    ${quotedHtml}
  `;

  console.log(`\u2713 Extracted tweet from @${authorHandle}: "${tweetText.substring(0, 50)}..."`);

  return {
    title: `Tweet by @${authorHandle}`,
    content: content,
    textContent: tweetText,
    byline: authorName,
    siteName: 'Twitter/X',
  };
}
