import { describe, it, expect } from 'vitest';
import { tryExtractFromNextData, markdownToHtml } from './next-data.js';

describe('markdownToHtml', () => {
  it('converts paragraphs separated by blank lines', () => {
    const md = 'First paragraph.\n\nSecond paragraph.';
    expect(markdownToHtml(md)).toBe('<p>First paragraph.</p>\n<p>Second paragraph.</p>');
  });

  it('converts headings h1 through h6', () => {
    expect(markdownToHtml('# Heading 1')).toBe('<h1>Heading 1</h1>');
    expect(markdownToHtml('## Heading 2')).toBe('<h2>Heading 2</h2>');
    expect(markdownToHtml('### Heading 3')).toBe('<h3>Heading 3</h3>');
    expect(markdownToHtml('#### Heading 4')).toBe('<h4>Heading 4</h4>');
    expect(markdownToHtml('##### Heading 5')).toBe('<h5>Heading 5</h5>');
    expect(markdownToHtml('###### Heading 6')).toBe('<h6>Heading 6</h6>');
  });

  it('converts bold text', () => {
    expect(markdownToHtml('This is **bold** text.')).toBe(
      '<p>This is <strong>bold</strong> text.</p>',
    );
  });

  it('converts italic text', () => {
    expect(markdownToHtml('This is *italic* text.')).toBe('<p>This is <em>italic</em> text.</p>');
  });

  it('converts links', () => {
    expect(markdownToHtml('Visit [Stripe](https://stripe.com).')).toBe(
      '<p>Visit <a href="https://stripe.com">Stripe</a>.</p>',
    );
  });

  it('converts images', () => {
    expect(markdownToHtml('![Alt text](/images/photo.png)')).toBe(
      '<img src="/images/photo.png" alt="Alt text">',
    );
  });

  it('converts blockquotes', () => {
    expect(markdownToHtml('> A quoted line')).toBe('<blockquote><p>A quoted line</p></blockquote>');
  });

  it('handles mixed content', () => {
    const md = '### Why?\n\nThis is **important**.\n\n> A quote\n\nMore text.';
    const html = markdownToHtml(md);
    expect(html).toContain('<h3>Why?</h3>');
    expect(html).toContain('<p>This is <strong>important</strong>.</p>');
    expect(html).toContain('<blockquote><p>A quote</p></blockquote>');
    expect(html).toContain('<p>More text.</p>');
  });

  it('returns empty string for empty input', () => {
    expect(markdownToHtml('')).toBe('');
  });
});

describe('tryExtractFromNextData', () => {
  const buildHtmlWithNextData = (data) =>
    `<html><body><script id="__NEXT_DATA__" type="application/json">${JSON.stringify(data)}</script></body></html>`;

  it('extracts article from __NEXT_DATA__ with postData.content', () => {
    const html = buildHtmlWithNextData({
      props: {
        pageProps: {
          postData: {
            title: 'My Article',
            content: 'This is the article body with enough content to pass validation.',
            authors: ['Jane Doe'],
          },
        },
      },
    });

    const result = tryExtractFromNextData(html);
    expect(result).not.toBeNull();
    expect(result.title).toBe('My Article');
    expect(result.content).toContain('This is the article body');
    expect(result.byline).toBe('Jane Doe');
  });

  it('returns null when no __NEXT_DATA__ script exists', () => {
    const html = '<html><body><p>Hello</p></body></html>';
    expect(tryExtractFromNextData(html)).toBeNull();
  });

  it('returns null when __NEXT_DATA__ has no postData', () => {
    const html = buildHtmlWithNextData({
      props: { pageProps: { someOtherData: {} } },
    });
    expect(tryExtractFromNextData(html)).toBeNull();
  });

  it('returns null when postData has no content', () => {
    const html = buildHtmlWithNextData({
      props: {
        pageProps: {
          postData: { title: 'No Body', content: '' },
        },
      },
    });
    expect(tryExtractFromNextData(html)).toBeNull();
  });

  it('returns null when __NEXT_DATA__ JSON is malformed', () => {
    const html =
      '<html><body><script id="__NEXT_DATA__" type="application/json">{bad json</script></body></html>';
    expect(tryExtractFromNextData(html)).toBeNull();
  });

  it('joins multiple authors with comma', () => {
    const html = buildHtmlWithNextData({
      props: {
        pageProps: {
          postData: {
            title: 'Team Post',
            content: 'Written by a team of engineers working together.',
            authors: ['Alice', 'Bob'],
          },
        },
      },
    });

    const result = tryExtractFromNextData(html);
    expect(result.byline).toBe('Alice, Bob');
  });

  it('handles missing authors gracefully', () => {
    const html = buildHtmlWithNextData({
      props: {
        pageProps: {
          postData: {
            title: 'Anonymous Post',
            content: 'Content without any author attribution present.',
          },
        },
      },
    });

    const result = tryExtractFromNextData(html);
    expect(result.byline).toBeNull();
  });

  it('converts markdown content to HTML', () => {
    const html = buildHtmlWithNextData({
      props: {
        pageProps: {
          postData: {
            title: 'Markdown Post',
            content: '### Heading\n\nA paragraph with **bold**.',
            authors: ['Writer'],
          },
        },
      },
    });

    const result = tryExtractFromNextData(html);
    expect(result.content).toContain('<h3>Heading</h3>');
    expect(result.content).toContain('<strong>bold</strong>');
  });

  it('resolves relative image URLs to absolute using baseUrl', () => {
    const html = buildHtmlWithNextData({
      props: {
        pageProps: {
          postData: {
            title: 'Image Post',
            content: '![Screenshot](/images/photo.png)\n\nSome text.',
            authors: ['Author'],
          },
        },
      },
    });

    const result = tryExtractFromNextData(html, 'https://stripe.dev/blog/my-post');
    expect(result.content).toContain('src="https://stripe.dev/images/photo.png"');
  });

  it('leaves absolute image URLs unchanged', () => {
    const html = buildHtmlWithNextData({
      props: {
        pageProps: {
          postData: {
            title: 'Image Post',
            content: '![Screenshot](https://cdn.example.com/photo.png)',
            authors: ['Author'],
          },
        },
      },
    });

    const result = tryExtractFromNextData(html, 'https://stripe.dev/blog/my-post');
    expect(result.content).toContain('src="https://cdn.example.com/photo.png"');
  });

  it('resolves relative link URLs to absolute using baseUrl', () => {
    const html = buildHtmlWithNextData({
      props: {
        pageProps: {
          postData: {
            title: 'Link Post',
            content: 'Read [part 2](/blog/part-2).',
            authors: ['Author'],
          },
        },
      },
    });

    const result = tryExtractFromNextData(html, 'https://stripe.dev/blog/my-post');
    expect(result.content).toContain('href="https://stripe.dev/blog/part-2"');
  });
});
