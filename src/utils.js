import { execSync } from 'child_process';
import fs from 'fs';

/**
 * Check if a command exists in PATH
 */
export function commandExists(cmd) {
  try {
    execSync(`which ${cmd}`, { stdio: 'ignore' });
    return true;
  } catch {
    return false;
  }
}

/**
 * Determine if input is a URL or file path
 */
export function getInputType(input) {
  if (input.startsWith('http://') || input.startsWith('https://')) {
    return 'url';
  }
  if (input.toLowerCase().endsWith('.pdf')) {
    return 'pdf';
  }
  if (fs.existsSync(input)) {
    return 'file';
  }
  return 'unknown';
}

/**
 * Sanitize filename to be safe for filesystem
 */
export function sanitizeFilename(name) {
  return name
    .replace(/[<>:"/\\|?*\x00-\x1F]/g, '')
    .replace(/\s+/g, '_')
    .substring(0, 100);
}

/**
 * Escape text for YAML (handle quotes, newlines, etc.)
 */
/**
 * Replace YouTube embed iframes with clickable hyperlinks.
 * Kindle devices cannot render iframes, so this converts them to links.
 */
export function replaceYouTubeEmbeds(html) {
  return html.replace(
    /<iframe[^>]*\ssrc="https?:\/\/(?:www\.)?youtube\.com\/embed\/([^"?]+)[^"]*"[^>]*><\/iframe>/gi,
    (match, videoId) => {
      const titleMatch = match.match(/\stitle="([^"]*)"/i);
      const title = titleMatch ? titleMatch[1] : 'YouTube Video';
      return `<p><a href="https://www.youtube.com/watch?v=${videoId}">${title} (YouTube)</a></p>`;
    },
  );
}

/**
 * Fix <picture> elements where the <img> has no src attribute.
 * Extracts the URL from <source srcSet="..."> and adds it as the img's src.
 * Prefers non-webp sources for broader device compatibility (e.g. Kindle).
 */
export function fixPictureSources(html) {
  return html.replace(/<picture>([\s\S]*?)<\/picture>/gi, (match, inner) => {
    if (/<img\b[^>]*?\ssrc\s*=/i.test(inner)) return match;

    const sourceMatch =
      inner.match(/<source(?![^>]*type="image\/webp")[^>]*\bsrcset="([^"]+)"/i) ||
      inner.match(/<source[^>]*\bsrcset="([^"]+)"/i);
    if (!sourceMatch) return match;

    const firstUrl = sourceMatch[1].split(',')[0].trim().split(/\s+/)[0];
    if (!firstUrl) return match;

    return match.replace(/<img\b/i, `<img src="${firstUrl}"`);
  });
}

export function escapeYaml(text) {
  if (!text) return '""';

  text = text
    .replace(/\\/g, '\\\\')
    .replace(/"/g, '\\"')
    .replace(/\n/g, ' ')
    .replace(/\r/g, '')
    .replace(/\t/g, ' ');

  return `"${text}"`;
}
