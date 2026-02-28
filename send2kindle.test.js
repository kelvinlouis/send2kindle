import { describe, it, expect, vi, beforeEach } from 'vitest';
import fs from 'fs';
import path from 'path';
import { loadConfig } from './src/config.js';
import { getInputType } from './src/utils.js';
import { extract } from './src/extractors/index.js';
import { convertToEpub, convertBookToEpub } from './src/converter.js';
import { sendToKindle } from './src/mailer.js';
import { parseArgs, printUsage, main } from './send2kindle.js';

vi.mock('fs', () => ({
  default: { existsSync: vi.fn() },
  existsSync: vi.fn(),
}));

vi.mock('./src/config.js', () => ({
  loadConfig: vi.fn(() => ({ kindleEmail: 'k@kindle.com', smtp: {}, fromEmail: 'u@g.com' })),
}));

vi.mock('./src/utils.js', () => ({
  getInputType: vi.fn(),
}));

vi.mock('./src/extractors/index.js', () => ({
  extract: vi.fn(),
}));

vi.mock('./src/converter.js', () => ({
  convertToEpub: vi.fn(() => '/tmp/test.epub'),
  convertBookToEpub: vi.fn(() => '/tmp/book.epub'),
}));

vi.mock('./src/mailer.js', () => ({
  sendToKindle: vi.fn(),
}));

beforeEach(() => {
  vi.spyOn(console, 'log').mockImplementation(() => {});
  vi.spyOn(console, 'error').mockImplementation(() => {});
  vi.spyOn(process, 'exit').mockImplementation(() => {
    throw new Error('process.exit called');
  });
});

describe('parseArgs', () => {
  it('parses --debug flag', () => {
    const result = parseArgs([null, null, '--debug', 'https://example.com']);
    expect(result.debug).toBe(true);
    expect(result.input).toBe('https://example.com');
  });

  it('parses -d flag', () => {
    const result = parseArgs([null, null, '-d', 'https://example.com']);
    expect(result.debug).toBe(true);
    expect(result.input).toBe('https://example.com');
  });

  it('parses input without flags', () => {
    const result = parseArgs([null, null, 'https://example.com']);
    expect(result.debug).toBe(false);
    expect(result.input).toBe('https://example.com');
  });

  it('ignores unknown flags starting with -', () => {
    const result = parseArgs([null, null, '--unknown', 'https://example.com']);
    expect(result.debug).toBe(false);
    expect(result.input).toBe('https://example.com');
  });

  it('returns null input when no args', () => {
    const result = parseArgs([null, null]);
    expect(result.input).toBeNull();
    expect(result.debug).toBe(false);
  });

  it('collects multiple non-flag arguments into inputs array', () => {
    const result = parseArgs([null, null, 'https://a.com', 'https://b.com', 'https://c.com']);
    expect(result.inputs).toEqual(['https://a.com', 'https://b.com', 'https://c.com']);
    expect(result.input).toBe('https://a.com');
  });

  it('parses --book flag with title value', () => {
    const result = parseArgs([null, null, '--book', 'My Book Title', 'https://a.com']);
    expect(result.book).toBe('My Book Title');
    expect(result.inputs).toEqual(['https://a.com']);
  });

  it('parses -b shorthand for --book', () => {
    const result = parseArgs([null, null, '-b', 'My Book', 'https://a.com']);
    expect(result.book).toBe('My Book');
  });

  it('parses --author flag with value', () => {
    const result = parseArgs([null, null, '--author', 'John Doe', 'https://a.com']);
    expect(result.author).toBe('John Doe');
  });

  it('parses -a shorthand for --author', () => {
    const result = parseArgs([null, null, '-a', 'Jane Doe', 'https://a.com']);
    expect(result.author).toBe('Jane Doe');
  });

  it('parses all flags together', () => {
    const result = parseArgs([
      null,
      null,
      '--debug',
      '--book',
      'My Book',
      '--author',
      'Author',
      'https://a.com',
      'https://b.com',
    ]);
    expect(result.debug).toBe(true);
    expect(result.book).toBe('My Book');
    expect(result.author).toBe('Author');
    expect(result.inputs).toEqual(['https://a.com', 'https://b.com']);
  });

  it('returns null book and author when not provided', () => {
    const result = parseArgs([null, null, 'https://a.com']);
    expect(result.book).toBeNull();
    expect(result.author).toBeNull();
  });
});

describe('printUsage', () => {
  it('prints usage info', () => {
    printUsage();
    expect(console.log).toHaveBeenCalled();
  });
});

describe('main', () => {
  it('exits when no input is provided', async () => {
    process.argv = ['node', 'send2kindle.js'];
    await expect(main()).rejects.toThrow('process.exit called');
    expect(process.exit).toHaveBeenCalledWith(1);
  });

  it('handles URL input', async () => {
    process.argv = ['node', 'send2kindle.js', 'https://example.com'];
    getInputType.mockReturnValue('url');
    extract.mockResolvedValue({
      content: '<p>test</p>',
      title: 'Test',
      byline: 'Author',
      siteName: 'Site',
    });
    convertToEpub.mockReturnValue('/tmp/test.epub');
    sendToKindle.mockResolvedValue(undefined);

    await main();
    expect(extract).toHaveBeenCalledWith('https://example.com');
    expect(convertToEpub).toHaveBeenCalledWith(
      expect.objectContaining({
        title: 'Test',
        author: 'Author',
        debugMode: false,
      }),
    );
    expect(sendToKindle).toHaveBeenCalled();
  });

  it('uses siteName when byline is missing', async () => {
    process.argv = ['node', 'send2kindle.js', 'https://example.com'];
    getInputType.mockReturnValue('url');
    extract.mockResolvedValue({
      content: '<p>test</p>',
      title: 'Test',
      byline: null,
      siteName: 'MySite',
    });
    convertToEpub.mockReturnValue('/tmp/test.epub');
    sendToKindle.mockResolvedValue(undefined);

    await main();
    expect(convertToEpub).toHaveBeenCalledWith(expect.objectContaining({ author: 'MySite' }));
  });

  it('handles PDF input', async () => {
    process.argv = ['node', 'send2kindle.js', '/path/file.pdf'];
    getInputType.mockReturnValue('pdf');
    fs.existsSync.mockReturnValue(true);
    sendToKindle.mockResolvedValue(undefined);

    await main();
    expect(sendToKindle).toHaveBeenCalledWith(path.resolve('/path/file.pdf'), expect.any(Object));
  });

  it('throws when PDF does not exist', async () => {
    process.argv = ['node', 'send2kindle.js', '/missing.pdf'];
    getInputType.mockReturnValue('pdf');
    fs.existsSync.mockReturnValue(false);

    await expect(main()).rejects.toThrow('PDF file not found');
  });

  it('handles file input', async () => {
    process.argv = ['node', 'send2kindle.js', '/path/file.epub'];
    getInputType.mockReturnValue('file');
    sendToKindle.mockResolvedValue(undefined);

    await main();
    expect(sendToKindle).toHaveBeenCalledWith(path.resolve('/path/file.epub'), expect.any(Object));
  });

  it('throws on unknown input type', async () => {
    process.argv = ['node', 'send2kindle.js', 'garbage'];
    getInputType.mockReturnValue('unknown');

    await expect(main()).rejects.toThrow('Could not determine input type');
  });

  it('skips sendToKindle in debug+url mode', async () => {
    process.argv = ['node', 'send2kindle.js', '--debug', 'https://example.com'];
    getInputType.mockReturnValue('url');
    extract.mockResolvedValue({
      content: '<p>test</p>',
      title: 'Test',
      byline: 'Author',
    });
    convertToEpub.mockReturnValue('/tmp/test.epub');

    await main();
    expect(sendToKindle).not.toHaveBeenCalled();
  });

  it('still sends in debug+pdf mode', async () => {
    process.argv = ['node', 'send2kindle.js', '--debug', '/path/file.pdf'];
    getInputType.mockReturnValue('pdf');
    fs.existsSync.mockReturnValue(true);
    sendToKindle.mockResolvedValue(undefined);

    await main();
    expect(sendToKindle).toHaveBeenCalled();
  });

  it('still sends in debug+file mode', async () => {
    process.argv = ['node', 'send2kindle.js', '-d', '/path/file.epub'];
    getInputType.mockReturnValue('file');
    sendToKindle.mockResolvedValue(undefined);

    await main();
    expect(sendToKindle).toHaveBeenCalled();
  });

  it('extracts each URL and calls convertBookToEpub in book mode', async () => {
    process.argv = [
      'node',
      'send2kindle.js',
      '--book',
      'My Book',
      '--author',
      'Author',
      'https://a.com',
      'https://b.com',
    ];
    getInputType.mockReturnValue('url');
    extract
      .mockResolvedValueOnce({ content: '<p>ch1</p>', title: 'Ch1', byline: 'A', siteName: 'S' })
      .mockResolvedValueOnce({ content: '<p>ch2</p>', title: 'Ch2', byline: 'A', siteName: 'S' });
    convertBookToEpub.mockReturnValue('/tmp/book.epub');
    sendToKindle.mockResolvedValue(undefined);

    await main();

    expect(extract).toHaveBeenCalledWith('https://a.com');
    expect(extract).toHaveBeenCalledWith('https://b.com');
    expect(convertBookToEpub).toHaveBeenCalledWith({
      chapters: [
        { title: 'Ch1', htmlContent: '<p>ch1</p>' },
        { title: 'Ch2', htmlContent: '<p>ch2</p>' },
      ],
      title: 'My Book',
      author: 'Author',
      debugMode: false,
    });
    expect(sendToKindle).toHaveBeenCalledWith('/tmp/book.epub', expect.any(Object));
  });

  it('uses first article byline as author when --author not provided in book mode', async () => {
    process.argv = [
      'node',
      'send2kindle.js',
      '--book',
      'My Book',
      'https://a.com',
      'https://b.com',
    ];
    getInputType.mockReturnValue('url');
    extract
      .mockResolvedValueOnce({ content: '<p>ch1</p>', title: 'Ch1', byline: 'Parker Lewis' })
      .mockResolvedValueOnce({ content: '<p>ch2</p>', title: 'Ch2', byline: 'Parker Lewis' });
    convertBookToEpub.mockReturnValue('/tmp/book.epub');
    sendToKindle.mockResolvedValue(undefined);

    await main();

    expect(convertBookToEpub).toHaveBeenCalledWith(
      expect.objectContaining({ author: 'Parker Lewis' }),
    );
  });

  it('errors when --book is used with non-URL inputs', async () => {
    process.argv = ['node', 'send2kindle.js', '--book', 'My Book', '/path/file.pdf'];
    getInputType.mockReturnValue('pdf');

    await expect(main()).rejects.toThrow('Book mode only supports URLs');
  });

  it('errors when --book is used with fewer than 2 URLs', async () => {
    process.argv = ['node', 'send2kindle.js', '--book', 'My Book', 'https://a.com'];
    getInputType.mockReturnValue('url');

    await expect(main()).rejects.toThrow('Book mode requires at least 2 URLs');
  });

  it('skips sendToKindle in debug+book mode', async () => {
    process.argv = [
      'node',
      'send2kindle.js',
      '--debug',
      '--book',
      'My Book',
      'https://a.com',
      'https://b.com',
    ];
    getInputType.mockReturnValue('url');
    extract
      .mockResolvedValueOnce({ content: '<p>ch1</p>', title: 'Ch1', byline: 'A' })
      .mockResolvedValueOnce({ content: '<p>ch2</p>', title: 'Ch2', byline: 'A' });
    convertBookToEpub.mockReturnValue('/tmp/book.epub');

    await main();
    expect(sendToKindle).not.toHaveBeenCalled();
  });
});
