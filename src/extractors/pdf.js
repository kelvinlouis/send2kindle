import fs from 'fs';
import path from 'path';
import os from 'os';
import { getDocumentProxy, extractImages, getMeta } from 'unpdf';
import sharp from 'sharp';

const USER_AGENT =
  'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Safari/537.36';

// Emoji replacements for Kindle compatibility (renders ? for unsupported chars)
const EMOJI_MAP = [
  [/✅/g, '[OK]'],
  [/❌/g, '[X]'],
  [/💡/g, 'Tip:'],
  [/⚠️?/g, 'Warning:'],
  [/📝/g, ''],
  [/🔑/g, ''],
  [/⭐/g, '*'],
  [/🚀/g, ''],
  [/📌/g, ''],
  [/📋/g, ''],
  [/🔗/g, ''],
  [/➡️?/g, '->'],
  [/→/g, '->'],
  [/←/g, '<-'],
];

/**
 * Post-process HTML content for Kindle compatibility.
 * - Merge adjacent <code> tags into single runs
 * - Replace emojis that Kindle can't render
 */
export function postProcessHtml(html) {
  let result = html;
  // Merge adjacent <code>...</code><code>...</code> into single <code> elements
  result = result.replace(/<\/code>(\s*)<code>/g, '$1');
  // Replace emojis
  for (const [pattern, replacement] of EMOJI_MAP) {
    result = result.replace(pattern, replacement);
  }

  // Convert markdown code fences: <p>```lang</p>...<p>```</p> → <pre><code>
  result = result.replace(/<p>\s*```\w*\s*<\/p>([\s\S]*?)<p>\s*```\s*<\/p>/g, (_, inner) => {
    const lines = [];
    inner.replace(/<p>([\s\S]*?)<\/p>/g, (__, content) => {
      lines.push(content.replace(/<[^>]+>/g, '').trim());
    });
    return `<pre><code>${lines.join('\n')}</code></pre>`;
  });

  // Convert paragraphs starting with markdown heading syntax (#, -#, --#) to code blocks
  result = result.replace(/<p>\s*(-*#\s[\s\S]*?)<\/p>/g, (_, inner) => {
    const text = inner.replace(/<[^>]+>/g, '');
    const formatted = text
      .replace(/\s*---\s*/g, '\n---\n')
      .replace(/\s+(?=-*#\s)/g, '\n')
      .replace(/\s+(?=[a-zA-Z][\w-]*:\s)/g, '\n')
      .trim();
    return `<pre><code>${formatted}</code></pre>`;
  });

  // Convert YAML frontmatter paragraphs: <p>--- key: val ... ---</p> → <pre><code>
  result = result.replace(/<p>\s*(---[\s\S]*?)<\/p>/g, (match, inner) => {
    const text = inner.replace(/<[^>]+>/g, '');
    if (/\w+:\s/.test(text)) {
      const formatted = text
        .replace(/\s*---\s*/g, '\n---\n')
        .replace(/\s+(?=-*#\s)/g, '\n')
        .replace(/\s+(?=[a-zA-Z][\w-]*:\s)/g, '\n')
        .trim();
      return `<pre><code>${formatted}</code></pre>`;
    }
    return match;
  });

  return result;
}

/**
 * Derive a human-readable title from a PDF filename.
 * Strips extension and replaces hyphens/underscores with spaces.
 */
export function titleFromFilename(pdfPath) {
  const base = path.basename(pdfPath, path.extname(pdfPath));
  return base.replace(/[-_]/g, ' ');
}

// ── Font analysis ──

/**
 * Build a map of fontName → { bold, italic, monospace } by inspecting
 * real font names from page.commonObjs and fontFamily from styles.
 */
export function buildFontInfo(page, styles) {
  const info = new Map();
  for (const [fontName, style] of Object.entries(styles)) {
    let bold = false;
    let italic = false;
    const monospace = style.fontFamily === 'monospace';

    try {
      const fontObj = page.commonObjs.get(fontName);
      if (fontObj?.name) {
        bold = /bold/i.test(fontObj.name);
        italic = /italic|oblique/i.test(fontObj.name);
      }
    } catch {
      // Font not loaded — leave bold/italic as false
    }

    info.set(fontName, { bold, italic, monospace });
  }
  return info;
}

// ── Text rendering with inline formatting ──

/**
 * Render an array of text items to HTML with bold/italic/code wrapping.
 * Inserts spaces at line breaks (hasEOL) since PDF line breaks within a
 * paragraph are just word wrapping, not semantic breaks.
 */
export function renderTextItems(items, fontInfo) {
  const parts = [];
  // Track if we've seen a line break that needs a space before the next text
  let pendingSpace = false;
  for (let i = 0; i < items.length; i++) {
    const item = items[i];
    let text = item.str;
    if (!text) {
      if (item.hasEOL) pendingSpace = true;
      continue;
    }
    // Insert deferred space from a previous line break
    if (pendingSpace) {
      if (parts.length > 0) {
        const last = parts[parts.length - 1];
        if (!last.endsWith(' ') && !last.endsWith('-')) {
          parts.push(' ');
        }
      } else if (!text.startsWith(' ')) {
        // Content node starts with a line break — add leading space so
        // concatenation with the previous sibling content node is spaced.
        parts.push(' ');
      }
      pendingSpace = false;
    }
    const font = fontInfo.get(item.fontName);
    if (font) {
      if (font.monospace) text = `<code>${text}</code>`;
      if (font.italic) text = `<em>${text}</em>`;
      if (font.bold) text = `<strong>${text}</strong>`;
    }
    parts.push(text);
    // Insert space at line breaks if the text doesn't already end with whitespace
    if (item.hasEOL && !item.str.endsWith(' ') && !item.str.endsWith('-')) {
      parts.push(' ');
    }
  }
  return parts.join('');
}

// ── Struct tree → HTML ──

/**
 * Build a map from marked content ID → array of text items.
 * Handles nested marked content groups using a stack.
 * IDs are strings like "p9R_mc70" used directly as keys.
 */
function buildTextByMcid(items) {
  const map = new Map();
  const idStack = [];

  for (const item of items) {
    if (item.type === 'beginMarkedContentProps' || item.type === 'beginMarkedContent') {
      idStack.push(item.id);
      if (item.id != null && !map.has(item.id)) {
        map.set(item.id, []);
      }
    } else if (item.type === 'endMarkedContent') {
      idStack.pop();
    } else if (item.str != null) {
      // Find the nearest non-null ID in the stack
      for (let i = idStack.length - 1; i >= 0; i--) {
        if (idStack[i] != null && map.has(idStack[i])) {
          map.get(idStack[i]).push(item);
          break;
        }
      }
    }
  }

  return map;
}

/**
 * Detect whether a list (L role) is ordered based on its first label.
 */
function isOrderedList(node, textByMcid) {
  for (const child of node.children || []) {
    if (child.role === 'LI') {
      for (const liChild of child.children || []) {
        if (liChild.role === 'Lbl') {
          const text = getNodeText(liChild, textByMcid);
          return /^\s*\d/.test(text) || /^\s*[a-zA-Z]\)/.test(text);
        }
      }
    }
  }
  return false;
}

/**
 * Get raw text from a struct node (for heuristics like list type detection).
 */
function getNodeText(node, textByMcid) {
  if (node.type === 'content') {
    const items = textByMcid.get(node.id) || [];
    return items.map((i) => i.str).join('');
  }
  return (node.children || []).map((c) => getNodeText(c, textByMcid)).join('');
}

/**
 * Get raw text from a leaf content node without formatting.
 * Preserves line breaks (hasEOL → newline) for code blocks.
 */
function getLeafText(node, textByMcid) {
  if (node.type === 'content') {
    const items = textByMcid.get(node.id) || [];
    return items.map((i) => (i.str || '') + (i.hasEOL ? '\n' : '')).join('');
  }
  return (node.children || []).map((c) => getLeafText(c, textByMcid)).join('');
}

/**
 * Recursively convert a struct tree node to HTML.
 */
export function structNodeToHtml(node, textByMcid, fontInfo) {
  // Leaf content node — resolve text via marked content ID
  if (node.type === 'content') {
    const items = textByMcid.get(node.id) || [];
    return renderTextItems(items, fontInfo);
  }

  // Embedded object — skip
  if (node.type === 'object') return '';

  // For Code blocks, use raw text (no inline <code> wrapping from font detection)
  if (node.role === 'Code') {
    const text = getLeafText(node, textByMcid);
    return text ? `<pre><code>${text}</code></pre>` : '';
  }

  const childHtml = (node.children || [])
    .map((child) => structNodeToHtml(child, textByMcid, fontInfo))
    .join('');

  // Skip empty nodes
  if (!childHtml) return '';

  // Strip <p> wrappers from children when parent is P or a heading
  // to avoid invalid nesting like <p><p>...</p></p> or <h2><p>...</p></h2>
  const isHeading = /^H[1-6]?$/.test(node.role);
  const unwrapped = node.role === 'P' || isHeading ? childHtml.replace(/<\/?p>/g, '') : childHtml;

  // For headings, separate out block elements (tables, lists) that can't nest inside <h*>
  if (isHeading) {
    const blockPattern = /<(table|ul|ol|blockquote|pre)[\s>]/i;
    if (blockPattern.test(unwrapped)) {
      // Return the heading text before the block, then the block element after
      const parts = unwrapped.split(
        /(<(?:table|ul|ol|blockquote|pre)[\s\S]*?<\/(?:table|ul|ol|blockquote|pre)>)/i,
      );
      const tag = node.role === 'H' ? 'h1' : node.role.toLowerCase();
      const inlineParts = parts.filter((_, i) => i % 2 === 0).join('');
      const blockParts = parts.filter((_, i) => i % 2 === 1).join('');
      const heading = inlineParts.trim() ? `<${tag}>${inlineParts}</${tag}>` : '';
      return heading + blockParts;
    }

    // Detect headings that are actually code blocks:
    // 1. Mostly <code> content (>50% by text length)
    // 2. Contains tree drawing characters (file trees)
    const plainText = unwrapped.replace(/<[^>]+>/g, '');
    const codeLen = (unwrapped.match(/<code>[\s\S]*?<\/code>/g) || []).reduce(
      (sum, m) => sum + m.length - 13,
      0,
    );
    const hasTreeChars = /[├└│─┌┐┘┬┴┤┼]/.test(plainText);
    const hasMarkdownHeading = /^\s*-*#\s/.test(plainText);
    const isCodeBlock =
      (plainText.length > 0 && codeLen / plainText.length > 0.5) ||
      hasTreeChars ||
      hasMarkdownHeading;
    if (isCodeBlock) {
      // Use getLeafText to preserve line breaks (hasEOL → \n) for code blocks
      const text = getLeafText(node, textByMcid);
      return text ? `<pre><code>${text}</code></pre>` : '';
    }
  }

  switch (node.role) {
    case 'H':
    case 'H1':
      return `<h1>${unwrapped}</h1>`;
    case 'H2':
      return `<h2>${unwrapped}</h2>`;
    case 'H3':
      return `<h3>${unwrapped}</h3>`;
    case 'H4':
      return `<h4>${unwrapped}</h4>`;
    case 'H5':
      return `<h5>${unwrapped}</h5>`;
    case 'H6':
      return `<h6>${unwrapped}</h6>`;
    case 'P':
      return `<p>${unwrapped}</p>`;
    case 'L': {
      const tag = isOrderedList(node, textByMcid) ? 'ol' : 'ul';
      return `<${tag}>${childHtml}</${tag}>`;
    }
    case 'LI':
      return `<li>${childHtml}</li>`;
    case 'Lbl':
      return ''; // Skip labels — HTML generates list markers
    case 'LBody':
      return childHtml;
    case 'Code':
      return `<pre><code>${childHtml}</code></pre>`;
    case 'BlockQuote':
      return `<blockquote>${childHtml}</blockquote>`;
    case 'Table':
      return `<table>${childHtml}</table>`;
    case 'THead':
      return `<thead>${childHtml}</thead>`;
    case 'TBody':
      return `<tbody>${childHtml}</tbody>`;
    case 'TFoot':
      return `<tfoot>${childHtml}</tfoot>`;
    case 'TR':
      return `<tr>${childHtml}</tr>`;
    case 'TH':
      return `<th>${childHtml}</th>`;
    case 'TD':
      return `<td>${childHtml}</td>`;
    case 'TOC':
      return `<ul>${childHtml}</ul>`;
    case 'TOCI':
      return `<li>${childHtml}</li>`;
    // Grouping / inline elements — pass through
    // (includes Reference, Link, Span, Sect, Art, Document, etc.)
    default:
      return childHtml;
  }
}

// ── Plain text fallback ──

/**
 * Convert raw page texts and image paths into HTML (fallback for untagged PDFs).
 * - Splits on double-newlines for paragraph boundaries
 * - Dehyphenates split words (e.g. "knowl-\nedge" → "knowledge")
 * - Joins single newlines into spaces
 * - Inserts <img> tags for each page's images after the page text
 */
export function convertPagesToHtml(pages, imagesByPage) {
  const parts = [];

  for (let i = 0; i < pages.length; i++) {
    const text = pages[i];
    if (text.trim()) {
      const paragraphs = text.split(/\n\n+/);
      for (const para of paragraphs) {
        const trimmed = para.trim();
        if (!trimmed) continue;
        const dehyphenated = trimmed.replace(/-\n/g, '');
        const joined = dehyphenated.replace(/\n/g, ' ');
        parts.push(`<p>${joined}</p>`);
      }
    }

    const images = imagesByPage[i] || [];
    for (const imgPath of images) {
      parts.push(`<img src="${imgPath}" alt="" />`);
    }
  }

  return parts.join('\n');
}

// ── Page-level extraction ──

/**
 * Reconstruct plain text from getTextContent items (replacement for extractText).
 */
function textContentToPlain(items) {
  return items
    .filter((item) => item.str != null)
    .map((item) => item.str + (item.hasEOL ? '\n' : ''))
    .join('');
}

/**
 * Extract structured HTML from a single page using the struct tree + marked content.
 * Returns HTML string, or null if the page has no struct tree.
 */
async function extractPageStructured(page) {
  const structTree = await page.getStructTree();
  if (!structTree) return null;

  const textContent = await page.getTextContent({ includeMarkedContent: true });

  // Resolve fonts via operator list (needed for commonObjs to be populated)
  try {
    await page.getOperatorList();
  } catch {
    // Non-critical — font detection will fall back to no bold/italic
  }

  const fontInfo = buildFontInfo(page, textContent.styles);
  const textByMcid = buildTextByMcid(textContent.items);

  const html = structNodeToHtml(structTree, textByMcid, fontInfo);
  return html || null;
}

/**
 * Extract content from a page as font-aware plain text (fallback for untagged PDFs).
 */
async function extractPagePlain(page) {
  const textContent = await page.getTextContent();
  return textContentToPlain(textContent.items);
}

/**
 * Encode extracted raw image data to PNG files using sharp.
 * Returns array of file paths for the encoded images.
 */
async function encodeImages(rawImages, tmpDir, pageIndex, offset) {
  const paths = [];
  for (let i = 0; i < rawImages.length; i++) {
    const img = rawImages[i];
    const imgPath = path.join(tmpDir, `page${pageIndex + 1}_img${offset + i + 1}.png`);
    await sharp(img.data, {
      raw: { width: img.width, height: img.height, channels: img.channels },
    })
      .png()
      .toFile(imgPath);
    paths.push(imgPath);
  }
  return paths;
}

/**
 * Extract text and images from a local PDF file.
 * Uses struct tree for tagged PDFs (preserves headings, lists, code, bold, etc.)
 * Falls back to plain text for untagged PDFs.
 * Returns the standard extractor shape: { title, content, textContent, byline, siteName }
 */
export async function extractPdf(pdfPath) {
  console.log(`📄 Extracting PDF: ${pdfPath}`);

  const data = new Uint8Array(fs.readFileSync(pdfPath));
  const pdf = await getDocumentProxy(data);
  const metaResult = await getMeta(pdf);

  const htmlParts = [];
  const plainTexts = [];
  const tmpDir = fs.mkdtempSync(path.join(os.tmpdir(), 'pdf-images-'));
  let totalImages = 0;
  let usedStructTree = false;

  for (let i = 0; i < pdf.numPages; i++) {
    const page = await pdf.getPage(i + 1);

    // Try structured extraction first, fall back to plain text
    const structuredHtml = await extractPageStructured(page);
    if (structuredHtml) {
      htmlParts.push(structuredHtml);
      usedStructTree = true;
    } else {
      const plainText = await extractPagePlain(page);
      plainTexts.push(plainText);
    }

    // Extract and encode images
    const rawImages = await extractImages(pdf, i + 1);
    const encoded = await encodeImages(rawImages, tmpDir, i, totalImages);
    totalImages += rawImages.length;
    for (const imgPath of encoded) {
      htmlParts.push(`<img src="${imgPath}" alt="" />`);
    }
  }

  // Build final content — strip page artifacts
  let content;
  if (usedStructTree) {
    content = htmlParts
      .join('\n')
      // Strip standalone page number paragraphs (<p> 2</p>)
      .replace(/<p>\s*\d+\s*<\/p>/g, '')
      // Strip decorative chapter divider pages (<p>Chapter 1</p><p> Title</p>)
      .replace(/<p>\s*Chapter\s+\d+\s*<\/p>\s*<p>[^<]*<\/p>/g, '')
      // Strip remaining standalone "Chapter N" paragraphs
      .replace(/<p>\s*Chapter\s+\d+\s*<\/p>/g, '');
  } else {
    // All pages fell through to plain text
    content = convertPagesToHtml(
      plainTexts,
      plainTexts.map(() => []),
    );
    if (htmlParts.length > 0) {
      content += '\n' + htmlParts.join('\n');
    }
  }

  // Post-process: merge <code> tags, replace emojis for Kindle
  content = postProcessHtml(content);

  const textContent = plainTexts.join('\n\n');
  const allEmpty = !content.trim() && !textContent.trim();
  if (allEmpty) {
    throw new Error(
      'PDF has no extractable text (possibly scanned/image-only). Use --raw to send as-is.',
    );
  }

  const title = metaResult.info?.Title || titleFromFilename(pdfPath);
  const byline = metaResult.info?.Author || null;

  console.log(
    `✓ Extracted PDF: "${title}" (${pdf.numPages} pages, ${totalImages} images${usedStructTree ? ', tagged' : ''})`,
  );

  return { title, content, textContent, byline, siteName: null };
}

/**
 * Download a PDF from a URL to a temp file.
 * Returns the path to the temp file.
 */
export async function downloadPdf(url) {
  console.log(`⬇️  Downloading PDF: ${url}`);

  const response = await fetch(url, {
    headers: {
      'User-Agent': USER_AGENT,
      Accept: 'application/pdf,*/*',
    },
  });

  if (!response.ok) {
    throw new Error(`Failed to download PDF: HTTP ${response.status}`);
  }

  const buffer = Buffer.from(await response.arrayBuffer());
  const filename = path.basename(new URL(url).pathname) || 'download.pdf';
  const tmpPath = path.join(os.tmpdir(), filename);
  fs.writeFileSync(tmpPath, buffer);

  console.log(`✓ Downloaded PDF to: ${tmpPath}`);
  return tmpPath;
}
