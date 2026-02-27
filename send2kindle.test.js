import { describe, it, expect, vi, beforeEach } from 'vitest';
import fs from 'fs';
import path from 'path';
import { loadConfig } from './src/config.js';
import { getInputType } from './src/utils.js';
import { extract } from './src/extractors/index.js';
import { convertToEpub } from './src/converter.js';
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
});
