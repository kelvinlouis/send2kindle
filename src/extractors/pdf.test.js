import { describe, it, expect, vi, beforeEach } from 'vitest';
import fs from 'fs';
import {
  extractPdf,
  downloadPdf,
  titleFromFilename,
  convertPagesToHtml,
  structNodeToHtml,
  renderTextItems,
  buildFontInfo,
  postProcessHtml,
} from './pdf.js';

vi.mock('fs', () => ({
  default: {
    readFileSync: vi.fn(),
    writeFileSync: vi.fn(),
    mkdtempSync: vi.fn(() => '/tmp/pdf-images-abc'),
    unlinkSync: vi.fn(),
  },
}));

vi.mock('unpdf', () => ({
  getDocumentProxy: vi.fn(),
  extractImages: vi.fn(),
  getMeta: vi.fn(),
}));

vi.mock('sharp', () => ({
  default: vi.fn(() => ({
    png: vi.fn().mockReturnThis(),
    toFile: vi.fn().mockResolvedValue(undefined),
  })),
}));

let getDocumentProxy, extractImages, getMeta;

beforeEach(async () => {
  const unpdf = await import('unpdf');
  getDocumentProxy = unpdf.getDocumentProxy;
  extractImages = unpdf.extractImages;
  getMeta = unpdf.getMeta;
});

describe('titleFromFilename', () => {
  it('converts filename to title by replacing hyphens and removing extension', () => {
    expect(titleFromFilename('/path/to/The-Guide.pdf')).toBe('The Guide');
  });

  it('replaces underscores with spaces', () => {
    expect(titleFromFilename('/path/to/my_document.pdf')).toBe('my document');
  });

  it('handles simple filename', () => {
    expect(titleFromFilename('report.pdf')).toBe('report');
  });
});

describe('buildFontInfo', () => {
  it('detects bold from font name', () => {
    const page = {
      commonObjs: { get: vi.fn((name) => ({ name: 'TimesNewRoman-Bold' })) },
    };
    const styles = { f1: { fontFamily: 'serif' } };
    const info = buildFontInfo(page, styles);
    expect(info.get('f1').bold).toBe(true);
    expect(info.get('f1').italic).toBe(false);
  });

  it('detects italic from font name', () => {
    const page = {
      commonObjs: { get: vi.fn(() => ({ name: 'Helvetica-Italic' })) },
    };
    const styles = { f1: { fontFamily: 'sans-serif' } };
    const info = buildFontInfo(page, styles);
    expect(info.get('f1').italic).toBe(true);
  });

  it('detects monospace from fontFamily', () => {
    const page = {
      commonObjs: { get: vi.fn(() => ({ name: 'Courier' })) },
    };
    const styles = { f1: { fontFamily: 'monospace' } };
    const info = buildFontInfo(page, styles);
    expect(info.get('f1').monospace).toBe(true);
  });

  it('handles missing commonObjs gracefully', () => {
    const page = {
      commonObjs: { get: vi.fn(() => null) },
    };
    const styles = { f1: { fontFamily: 'serif' } };
    const info = buildFontInfo(page, styles);
    expect(info.get('f1').bold).toBe(false);
  });

  it('handles commonObjs.get throwing', () => {
    const page = {
      commonObjs: {
        get: vi.fn(() => {
          throw new Error('not loaded');
        }),
      },
    };
    const styles = { f1: { fontFamily: 'serif' } };
    const info = buildFontInfo(page, styles);
    expect(info.get('f1').bold).toBe(false);
  });
});

describe('renderTextItems', () => {
  it('wraps bold text in <strong>', () => {
    const fontInfo = new Map([['f1', { bold: true, italic: false, monospace: false }]]);
    const items = [{ str: 'Bold text', fontName: 'f1' }];
    expect(renderTextItems(items, fontInfo)).toBe('<strong>Bold text</strong>');
  });

  it('wraps italic text in <em>', () => {
    const fontInfo = new Map([['f1', { bold: false, italic: true, monospace: false }]]);
    const items = [{ str: 'Italic text', fontName: 'f1' }];
    expect(renderTextItems(items, fontInfo)).toBe('<em>Italic text</em>');
  });

  it('wraps monospace text in <code>', () => {
    const fontInfo = new Map([['f1', { bold: false, italic: false, monospace: true }]]);
    const items = [{ str: 'code()', fontName: 'f1' }];
    expect(renderTextItems(items, fontInfo)).toBe('<code>code()</code>');
  });

  it('combines bold and italic', () => {
    const fontInfo = new Map([['f1', { bold: true, italic: true, monospace: false }]]);
    const items = [{ str: 'Bold italic', fontName: 'f1' }];
    expect(renderTextItems(items, fontInfo)).toBe('<strong><em>Bold italic</em></strong>');
  });

  it('concatenates items with different fonts', () => {
    const fontInfo = new Map([
      ['f1', { bold: false, italic: false, monospace: false }],
      ['f2', { bold: true, italic: false, monospace: false }],
    ]);
    const items = [
      { str: 'Normal ', fontName: 'f1' },
      { str: 'bold', fontName: 'f2' },
      { str: ' text', fontName: 'f1' },
    ];
    expect(renderTextItems(items, fontInfo)).toBe('Normal <strong>bold</strong> text');
  });

  it('returns plain text when font has no formatting', () => {
    const fontInfo = new Map([['f1', { bold: false, italic: false, monospace: false }]]);
    const items = [{ str: 'Plain text', fontName: 'f1' }];
    expect(renderTextItems(items, fontInfo)).toBe('Plain text');
  });

  it('inserts space at line breaks (hasEOL)', () => {
    const fontInfo = new Map([['f1', { bold: false, italic: false, monospace: false }]]);
    const items = [
      { str: 'end of line', fontName: 'f1', hasEOL: true },
      { str: 'start of next', fontName: 'f1' },
    ];
    expect(renderTextItems(items, fontInfo)).toBe('end of line start of next');
  });

  it('does not double-space when text already ends with space', () => {
    const fontInfo = new Map([['f1', { bold: false, italic: false, monospace: false }]]);
    const items = [
      { str: 'word ', fontName: 'f1', hasEOL: true },
      { str: 'next', fontName: 'f1' },
    ];
    expect(renderTextItems(items, fontInfo)).toBe('word next');
  });

  it('adds leading space when content node starts with empty hasEOL', () => {
    const fontInfo = new Map([['f1', { bold: false, italic: false, monospace: false }]]);
    // Simulates a content node that begins on a new line (empty hasEOL + text)
    const items = [
      { str: '', fontName: 'f1', hasEOL: true },
      { str: 'continued text', fontName: 'f1' },
    ];
    expect(renderTextItems(items, fontInfo)).toBe(' continued text');
  });

  it('does not insert space after hyphen at EOL (dehyphenation)', () => {
    const fontInfo = new Map([['f1', { bold: false, italic: false, monospace: false }]]);
    const items = [
      { str: 'knowl-', fontName: 'f1', hasEOL: true },
      { str: 'edge', fontName: 'f1' },
    ];
    expect(renderTextItems(items, fontInfo)).toBe('knowl-edge');
  });
});

describe('structNodeToHtml', () => {
  const fontInfo = new Map([
    ['f1', { bold: false, italic: false, monospace: false }],
    ['f2', { bold: true, italic: false, monospace: false }],
    ['f3', { bold: false, italic: false, monospace: true }],
  ]);

  it('converts H1 role to <h1>', () => {
    const textByMcid = new Map([['p1R_mc1', [{ str: 'Title', fontName: 'f1' }]]]);
    const node = {
      role: 'H1',
      children: [{ type: 'content', id: 'p1R_mc1' }],
    };
    expect(structNodeToHtml(node, textByMcid, fontInfo)).toBe('<h1>Title</h1>');
  });

  it('converts P role to <p>', () => {
    const textByMcid = new Map([['p1R_mc2', [{ str: 'A paragraph.', fontName: 'f1' }]]]);
    const node = {
      role: 'P',
      children: [{ type: 'content', id: 'p1R_mc2' }],
    };
    expect(structNodeToHtml(node, textByMcid, fontInfo)).toBe('<p>A paragraph.</p>');
  });

  it('converts list with bullet labels to <ul>', () => {
    const textByMcid = new Map([
      ['p1R_mc10', [{ str: '• ', fontName: 'f1' }]],
      ['p1R_mc11', [{ str: 'First item', fontName: 'f1' }]],
      ['p1R_mc12', [{ str: '• ', fontName: 'f1' }]],
      ['p1R_mc13', [{ str: 'Second item', fontName: 'f1' }]],
    ]);
    const node = {
      role: 'L',
      children: [
        {
          role: 'LI',
          children: [
            { role: 'Lbl', children: [{ type: 'content', id: 'p1R_mc10' }] },
            { role: 'LBody', children: [{ type: 'content', id: 'p1R_mc11' }] },
          ],
        },
        {
          role: 'LI',
          children: [
            { role: 'Lbl', children: [{ type: 'content', id: 'p1R_mc12' }] },
            { role: 'LBody', children: [{ type: 'content', id: 'p1R_mc13' }] },
          ],
        },
      ],
    };
    const html = structNodeToHtml(node, textByMcid, fontInfo);
    expect(html).toContain('<ul>');
    expect(html).toContain('<li>');
    expect(html).toContain('First item');
    expect(html).toContain('Second item');
    expect(html).toContain('</ul>');
  });

  it('converts list with numeric labels to <ol>', () => {
    const textByMcid = new Map([
      ['p1R_mc10', [{ str: '1. ', fontName: 'f1' }]],
      ['p1R_mc11', [{ str: 'Step one', fontName: 'f1' }]],
    ]);
    const node = {
      role: 'L',
      children: [
        {
          role: 'LI',
          children: [
            { role: 'Lbl', children: [{ type: 'content', id: 'p1R_mc10' }] },
            { role: 'LBody', children: [{ type: 'content', id: 'p1R_mc11' }] },
          ],
        },
      ],
    };
    const html = structNodeToHtml(node, textByMcid, fontInfo);
    expect(html).toContain('<ol>');
    expect(html).toContain('Step one');
  });

  it('converts Code role to <pre><code>', () => {
    const textByMcid = new Map([['p1R_mc5', [{ str: 'const x = 1;', fontName: 'f3' }]]]);
    const node = {
      role: 'Code',
      children: [{ type: 'content', id: 'p1R_mc5' }],
    };
    expect(structNodeToHtml(node, textByMcid, fontInfo)).toBe(
      '<pre><code>const x = 1;</code></pre>',
    );
  });

  it('converts BlockQuote role', () => {
    const textByMcid = new Map([['p1R_mc3', [{ str: 'A quote.', fontName: 'f1' }]]]);
    const node = {
      role: 'BlockQuote',
      children: [{ type: 'content', id: 'p1R_mc3' }],
    };
    expect(structNodeToHtml(node, textByMcid, fontInfo)).toBe('<blockquote>A quote.</blockquote>');
  });

  it('converts table structure', () => {
    const textByMcid = new Map([
      ['p1R_mc1', [{ str: 'Header', fontName: 'f2' }]],
      ['p1R_mc2', [{ str: 'Cell', fontName: 'f1' }]],
    ]);
    const node = {
      role: 'Table',
      children: [
        {
          role: 'TR',
          children: [{ role: 'TH', children: [{ type: 'content', id: 'p1R_mc1' }] }],
        },
        {
          role: 'TR',
          children: [{ role: 'TD', children: [{ type: 'content', id: 'p1R_mc2' }] }],
        },
      ],
    };
    const html = structNodeToHtml(node, textByMcid, fontInfo);
    expect(html).toContain('<table>');
    expect(html).toContain('<th>');
    expect(html).toContain('Header');
    expect(html).toContain('<td>');
    expect(html).toContain('Cell');
  });

  it('preserves bold formatting within paragraphs', () => {
    const textByMcid = new Map([
      ['p1R_mc1', [{ str: 'Normal ', fontName: 'f1' }]],
      ['p1R_mc2', [{ str: 'bold', fontName: 'f2' }]],
    ]);
    const node = {
      role: 'P',
      children: [
        { type: 'content', id: 'p1R_mc1' },
        { type: 'content', id: 'p1R_mc2' },
      ],
    };
    const html = structNodeToHtml(node, textByMcid, fontInfo);
    expect(html).toBe('<p>Normal <strong>bold</strong></p>');
  });

  it('passes through grouping elements like Document and Sect', () => {
    const textByMcid = new Map([['p1R_mc1', [{ str: 'Hello', fontName: 'f1' }]]]);
    const node = {
      role: 'Document',
      children: [
        {
          role: 'Sect',
          children: [{ role: 'P', children: [{ type: 'content', id: 'p1R_mc1' }] }],
        },
      ],
    };
    expect(structNodeToHtml(node, textByMcid, fontInfo)).toBe('<p>Hello</p>');
  });

  it('handles missing mcid gracefully', () => {
    const textByMcid = new Map();
    const node = {
      role: 'P',
      children: [{ type: 'content', id: 'p1R_mc999' }],
    };
    expect(structNodeToHtml(node, textByMcid, fontInfo)).toBe('');
  });

  it('unwraps nested <p> inside <p>', () => {
    const textByMcid = new Map([['p1R_mc1', [{ str: 'Chapter 1', fontName: 'f1' }]]]);
    const node = {
      role: 'P',
      children: [{ role: 'P', children: [{ type: 'content', id: 'p1R_mc1' }] }],
    };
    // Should produce <p>Chapter 1</p>, not <p><p>Chapter 1</p></p>
    expect(structNodeToHtml(node, textByMcid, fontInfo)).toBe('<p>Chapter 1</p>');
  });

  it('unwraps <p> inside heading', () => {
    const textByMcid = new Map([['p1R_mc1', [{ str: 'Title', fontName: 'f1' }]]]);
    const node = {
      role: 'H2',
      children: [{ role: 'P', children: [{ type: 'content', id: 'p1R_mc1' }] }],
    };
    // Should produce <h2>Title</h2>, not <h2><p>Title</p></h2>
    expect(structNodeToHtml(node, textByMcid, fontInfo)).toBe('<h2>Title</h2>');
  });

  it('separates table from heading when nested', () => {
    const textByMcid = new Map([
      ['p1R_mc1', [{ str: 'Header', fontName: 'f1' }]],
      ['p1R_mc2', [{ str: 'Cell', fontName: 'f1' }]],
    ]);
    const node = {
      role: 'H2',
      children: [
        {
          role: 'P',
          children: [
            {
              role: 'Table',
              children: [
                {
                  role: 'TR',
                  children: [{ role: 'TH', children: [{ type: 'content', id: 'p1R_mc1' }] }],
                },
                {
                  role: 'TR',
                  children: [{ role: 'TD', children: [{ type: 'content', id: 'p1R_mc2' }] }],
                },
              ],
            },
          ],
        },
      ],
    };
    const html = structNodeToHtml(node, textByMcid, fontInfo);
    // Table should NOT be inside <h2>
    expect(html).not.toContain('<h2><table>');
    expect(html).toContain('<table>');
    expect(html).toContain('Header');
  });

  it('converts TOC/TOCI roles to list', () => {
    const textByMcid = new Map([
      ['p1R_mc1', [{ str: 'Introduction', fontName: 'f1' }]],
      ['p1R_mc2', [{ str: 'Chapter 1', fontName: 'f1' }]],
    ]);
    const node = {
      role: 'TOC',
      children: [
        { role: 'TOCI', children: [{ type: 'content', id: 'p1R_mc1' }] },
        { role: 'TOCI', children: [{ type: 'content', id: 'p1R_mc2' }] },
      ],
    };
    const html = structNodeToHtml(node, textByMcid, fontInfo);
    expect(html).toBe('<ul><li>Introduction</li><li>Chapter 1</li></ul>');
  });

  it('converts mostly-code heading to <pre><code> block', () => {
    const fontInfo2 = new Map([['f3', { bold: false, italic: false, monospace: true }]]);
    const textByMcid = new Map([['p1R_mc1', [{ str: 'name: my-skill', fontName: 'f3' }]]]);
    const node = {
      role: 'H3',
      children: [{ type: 'content', id: 'p1R_mc1' }],
    };
    const html = structNodeToHtml(node, textByMcid, fontInfo2);
    expect(html).toBe('<pre><code>name: my-skill</code></pre>');
  });

  it('converts heading with tree characters to code block', () => {
    const textByMcid = new Map([
      ['p1R_mc1', [{ str: 'project/\n├── src/\n└── README.md', fontName: 'f1' }]],
    ]);
    const node = {
      role: 'H3',
      children: [{ type: 'content', id: 'p1R_mc1' }],
    };
    const html = structNodeToHtml(node, textByMcid, fontInfo);
    expect(html).toBe('<pre><code>project/\n├── src/\n└── README.md</code></pre>');
  });

  it('converts heading starting with markdown # to code block', () => {
    const textByMcid = new Map([
      [
        'p1R_mc1',
        [
          { str: '# Good - specific', fontName: 'f1', hasEOL: true },
          { str: 'description: Does things.', fontName: 'f3', hasEOL: false },
        ],
      ],
    ]);
    const node = {
      role: 'H2',
      children: [{ type: 'content', id: 'p1R_mc1' }],
    };
    const html = structNodeToHtml(node, textByMcid, fontInfo);
    expect(html).toContain('<pre><code>');
    expect(html).not.toContain('<h2>');
  });

  it('converts heading starting with -# markdown syntax to code block', () => {
    const textByMcid = new Map([
      [
        'p1R_mc1',
        [
          { str: '-# Common Issues', fontName: 'f1', hasEOL: true },
          { str: 'Some error info', fontName: 'f1', hasEOL: false },
        ],
      ],
    ]);
    const node = {
      role: 'H4',
      children: [{ type: 'content', id: 'p1R_mc1' }],
    };
    const html = structNodeToHtml(node, textByMcid, fontInfo);
    expect(html).toContain('<pre><code>');
    expect(html).not.toContain('<h4>');
  });

  it('keeps heading when code is minority of content', () => {
    const textByMcid = new Map([
      ['p1R_mc1', [{ str: 'This is a heading with ', fontName: 'f1' }]],
      ['p1R_mc2', [{ str: 'code', fontName: 'f3' }]],
    ]);
    const node = {
      role: 'H3',
      children: [
        { type: 'content', id: 'p1R_mc1' },
        { type: 'content', id: 'p1R_mc2' },
      ],
    };
    const html = structNodeToHtml(node, textByMcid, fontInfo);
    expect(html).toContain('<h3>');
    expect(html).toContain('<code>code</code>');
  });
});

describe('postProcessHtml', () => {
  it('merges adjacent <code> tags', () => {
    const input = '<code>name:</code><code> </code><code>value</code>';
    expect(postProcessHtml(input)).toBe('<code>name: value</code>');
  });

  it('merges adjacent <code> tags with whitespace between', () => {
    const input = '<code>a</code> <code>b</code>';
    expect(postProcessHtml(input)).toBe('<code>a b</code>');
  });

  it('replaces checkmark emoji with text', () => {
    expect(postProcessHtml('✅ Good')).toBe('[OK] Good');
  });

  it('replaces cross emoji with text', () => {
    expect(postProcessHtml('❌ Bad')).toBe('[X] Bad');
  });

  it('replaces lightbulb emoji with Tip:', () => {
    expect(postProcessHtml('💡 hint')).toBe('Tip: hint');
  });

  it('replaces arrow characters', () => {
    expect(postProcessHtml('A → B ← C')).toBe('A -> B <- C');
  });

  it('converts markdown code fences to pre/code blocks', () => {
    const input = '<p>```yaml</p><p>name: my-skill</p><p>version: 1.0</p><p>```</p>';
    const result = postProcessHtml(input);
    expect(result).toContain('<pre><code>');
    expect(result).toContain('name: my-skill');
    expect(result).toContain('version: 1.0');
    expect(result).not.toContain('```');
  });

  it('converts code fences without language identifier', () => {
    const input = '<p>```</p><p>plain code</p><p>```</p>';
    const result = postProcessHtml(input);
    expect(result).toContain('<pre><code>');
    expect(result).toContain('plain code');
    expect(result).not.toContain('```');
  });

  it('converts code fences with leading whitespace', () => {
    const input = '<p> ```bash</p><p> echo hello</p><p> ```</p>';
    const result = postProcessHtml(input);
    expect(result).toContain('<pre><code>');
    expect(result).toContain('echo hello');
  });

  it('converts --- frontmatter paragraphs to code blocks with line breaks', () => {
    const input = '<p> --- <code>name: my-skill description: Does things.</code> ---</p>';
    const result = postProcessHtml(input);
    expect(result).toBe(
      '<pre><code>---\nname: my-skill\ndescription: Does things.\n---</code></pre>',
    );
  });

  it('formats markdown headings after closing --- with line breaks', () => {
    const input =
      '<p> --- <code>name: your-skill</code> description: [--.] ---' +
      ' # Your Skill Name -# Instructions --# Step 1: [First Major Step]</p>';
    const result = postProcessHtml(input);
    expect(result).toBe(
      '<pre><code>---\nname: your-skill\ndescription: [--.]' +
        '\n---\n# Your Skill Name\n-# Instructions\n--# Step 1: [First Major Step]</code></pre>',
    );
  });

  it('converts paragraphs starting with -# to code blocks with line breaks', () => {
    const input =
      '<p> -# Workflow --# Step 1: Create <code>Call MCP tool</code> --# Step 2: Done</p>';
    const result = postProcessHtml(input);
    expect(result).toBe(
      '<pre><code>-# Workflow\n--# Step 1: Create Call MCP tool\n--# Step 2: Done</code></pre>',
    );
  });

  it('converts paragraphs starting with # (no dash) to code blocks', () => {
    const input =
      '<p> # Wrong <code>name: My Cool Skill</code> # Correct <code>name: my-cool-skill</code></p>';
    const result = postProcessHtml(input);
    expect(result).toBe(
      '<pre><code># Wrong\nname: My Cool Skill\n# Correct\nname: my-cool-skill</code></pre>',
    );
  });

  it('formats # paragraph with --- delimiters on separate lines', () => {
    const input =
      '<p> # Wrong <code>name: my-skill</code> description: Does things' +
      ' # Correct --- <code>name: my-skill</code> description: Does things ---</p>';
    const result = postProcessHtml(input);
    expect(result).toContain('# Wrong');
    expect(result).toContain('# Correct');
    expect(result).toMatch(/\n---\n/);
    expect(result).toContain('<pre><code>');
  });

  it('leaves --- paragraph without YAML content unchanged', () => {
    const input = '<p>--- just a separator ---</p>';
    expect(postProcessHtml(input)).toBe('<p>--- just a separator ---</p>');
  });

  it('leaves regular text untouched', () => {
    expect(postProcessHtml('<p>Hello world</p>')).toBe('<p>Hello world</p>');
  });
});

describe('convertPagesToHtml (plain text fallback)', () => {
  it('wraps paragraphs in <p> tags', () => {
    const html = convertPagesToHtml(['First paragraph.\n\nSecond paragraph.'], [[]]);
    expect(html).toContain('<p>First paragraph.</p>');
    expect(html).toContain('<p>Second paragraph.</p>');
  });

  it('joins single newlines within a paragraph into spaces', () => {
    const html = convertPagesToHtml(['Line one\nline two\nline three.'], [[]]);
    expect(html).toContain('<p>Line one line two line three.</p>');
  });

  it('dehyphenates split words across lines', () => {
    const html = convertPagesToHtml(['knowl-\nedge is power'], [[]]);
    expect(html).toContain('knowledge is power');
  });

  it('handles empty pages gracefully', () => {
    const html = convertPagesToHtml(['', 'Some text.'], [[], []]);
    expect(html).toContain('<p>Some text.</p>');
  });

  it('handles empty PDF (no pages)', () => {
    const html = convertPagesToHtml([], []);
    expect(html).toBe('');
  });

  it('inserts image tags after page text', () => {
    const images = [['/tmp/img1.png', '/tmp/img2.png']];
    const html = convertPagesToHtml(['Some text.'], [images[0]]);
    expect(html).toContain('<p>Some text.</p>');
    expect(html).toContain('<img src="/tmp/img1.png"');
    expect(html).toContain('<img src="/tmp/img2.png"');
  });
});

// ── Helper to build a mock page ──
function createMockPage({ textItems = [], styles = {}, structTree = null } = {}) {
  return {
    getTextContent: vi.fn().mockResolvedValue({ items: textItems, styles }),
    getStructTree: vi.fn().mockResolvedValue(structTree),
    getOperatorList: vi.fn().mockResolvedValue({ fnArray: [], argsArray: [] }),
    commonObjs: {
      get: vi.fn((name) => {
        const fontMap = {
          f1: { name: 'Helvetica' },
          f2: { name: 'Helvetica-Bold' },
          f3: { name: 'Courier' },
        };
        return fontMap[name] || null;
      }),
    },
  };
}

describe('extractPdf', () => {
  beforeEach(() => {
    fs.readFileSync.mockReturnValue(Buffer.from('fake-pdf-data'));
    extractImages.mockResolvedValue([]);
    getMeta.mockResolvedValue({
      info: { Title: 'My PDF Title', Author: 'Jane Doe' },
    });
  });

  it('returns correct shape', async () => {
    const mockPage = createMockPage({
      textItems: [{ str: 'Hello', fontName: 'f1', hasEOL: false }],
      styles: { f1: { fontFamily: 'sans-serif' } },
    });
    getDocumentProxy.mockResolvedValue({
      numPages: 1,
      getPage: vi.fn().mockResolvedValue(mockPage),
    });

    const result = await extractPdf('/path/to/doc.pdf');
    expect(result).toHaveProperty('title');
    expect(result).toHaveProperty('content');
    expect(result).toHaveProperty('textContent');
    expect(result).toHaveProperty('byline');
    expect(result).toHaveProperty('siteName');
  });

  it('uses PDF metadata title and author', async () => {
    const mockPage = createMockPage({
      textItems: [{ str: 'Content', fontName: 'f1', hasEOL: false }],
      styles: { f1: { fontFamily: 'sans-serif' } },
    });
    getDocumentProxy.mockResolvedValue({
      numPages: 1,
      getPage: vi.fn().mockResolvedValue(mockPage),
    });

    const result = await extractPdf('/path/to/doc.pdf');
    expect(result.title).toBe('My PDF Title');
    expect(result.byline).toBe('Jane Doe');
  });

  it('falls back to filename-based title', async () => {
    getMeta.mockResolvedValue({ info: {} });
    const mockPage = createMockPage({
      textItems: [{ str: 'Content', fontName: 'f1', hasEOL: false }],
      styles: { f1: { fontFamily: 'sans-serif' } },
    });
    getDocumentProxy.mockResolvedValue({
      numPages: 1,
      getPage: vi.fn().mockResolvedValue(mockPage),
    });

    const result = await extractPdf('/path/to/The-Guide.pdf');
    expect(result.title).toBe('The Guide');
  });

  it('uses struct tree when available for semantic HTML', async () => {
    const mockPage = createMockPage({
      textItems: [
        { type: 'beginMarkedContentProps', id: 'p1R_mc1' },
        { str: 'Heading', fontName: 'f2', hasEOL: false },
        { type: 'endMarkedContent' },
        { type: 'beginMarkedContentProps', id: 'p1R_mc2' },
        { str: 'Body text.', fontName: 'f1', hasEOL: false },
        { type: 'endMarkedContent' },
      ],
      styles: { f1: { fontFamily: 'sans-serif' }, f2: { fontFamily: 'sans-serif' } },
      structTree: {
        role: 'Document',
        children: [
          { role: 'H1', children: [{ type: 'content', id: 'p1R_mc1' }] },
          { role: 'P', children: [{ type: 'content', id: 'p1R_mc2' }] },
        ],
      },
    });
    getDocumentProxy.mockResolvedValue({
      numPages: 1,
      getPage: vi.fn().mockResolvedValue(mockPage),
    });

    const result = await extractPdf('/path/to/doc.pdf');
    expect(result.content).toContain('<h1>');
    expect(result.content).toContain('Heading');
    expect(result.content).toContain('<p>Body text.</p>');
  });

  it('falls back to plain text when struct tree is unavailable', async () => {
    const mockPage = createMockPage({
      textItems: [
        { str: 'Line one.', fontName: 'f1', hasEOL: true },
        { str: '', fontName: 'f1', hasEOL: true },
        { str: 'Line two.', fontName: 'f1', hasEOL: false },
      ],
      styles: { f1: { fontFamily: 'sans-serif' } },
      structTree: null,
    });
    getDocumentProxy.mockResolvedValue({
      numPages: 1,
      getPage: vi.fn().mockResolvedValue(mockPage),
    });

    const result = await extractPdf('/path/to/doc.pdf');
    expect(result.content).toContain('Line one.');
    expect(result.content).toContain('Line two.');
  });

  it('encodes images and inserts <img> tags', async () => {
    const sharp = (await import('sharp')).default;
    const mockPage = createMockPage({
      textItems: [{ str: 'Text', fontName: 'f1', hasEOL: false }],
      styles: { f1: { fontFamily: 'sans-serif' } },
    });
    getDocumentProxy.mockResolvedValue({
      numPages: 1,
      getPage: vi.fn().mockResolvedValue(mockPage),
    });
    extractImages.mockResolvedValueOnce([
      { data: new Uint8ClampedArray(12), width: 2, height: 2, channels: 3, key: 'img1' },
    ]);

    const result = await extractPdf('/path/to/doc.pdf');
    expect(sharp).toHaveBeenCalledWith(expect.any(Uint8ClampedArray), {
      raw: { width: 2, height: 2, channels: 3 },
    });
    expect(result.content).toContain('<img src=');
  });

  it('sets siteName to null', async () => {
    const mockPage = createMockPage({
      textItems: [{ str: 'Content', fontName: 'f1', hasEOL: false }],
      styles: { f1: { fontFamily: 'sans-serif' } },
    });
    getDocumentProxy.mockResolvedValue({
      numPages: 1,
      getPage: vi.fn().mockResolvedValue(mockPage),
    });

    const result = await extractPdf('/path/to/doc.pdf');
    expect(result.siteName).toBeNull();
  });

  it('throws when PDF has no extractable text', async () => {
    const mockPage = createMockPage({ textItems: [], styles: {} });
    getDocumentProxy.mockResolvedValue({
      numPages: 1,
      getPage: vi.fn().mockResolvedValue(mockPage),
    });

    await expect(extractPdf('/path/to/doc.pdf')).rejects.toThrow('no extractable text');
  });
});

describe('downloadPdf', () => {
  beforeEach(() => {
    fs.writeFileSync.mockImplementation(() => {});
  });

  it('downloads PDF and writes to temp file', async () => {
    const mockBuffer = Buffer.from('pdf-data');
    globalThis.fetch = vi.fn().mockResolvedValue({
      ok: true,
      arrayBuffer: () => Promise.resolve(mockBuffer.buffer),
    });

    const tmpPath = await downloadPdf('https://example.com/doc.pdf');
    expect(fetch).toHaveBeenCalledWith(
      'https://example.com/doc.pdf',
      expect.objectContaining({ headers: expect.any(Object) }),
    );
    expect(fs.writeFileSync).toHaveBeenCalled();
    expect(tmpPath).toMatch(/\.pdf$/);
  });

  it('throws on HTTP error', async () => {
    globalThis.fetch = vi.fn().mockResolvedValue({
      ok: false,
      status: 404,
    });

    await expect(downloadPdf('https://example.com/missing.pdf')).rejects.toThrow('404');
  });
});
