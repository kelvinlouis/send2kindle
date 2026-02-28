#!/usr/bin/env node

import fs from 'fs';
import path from 'path';
import { fileURLToPath } from 'url';
import { loadConfig } from './src/config.js';
import { getInputType } from './src/utils.js';
import { extract } from './src/extractors/index.js';
import { convertToEpub, convertBookToEpub } from './src/converter.js';
import { sendToKindle } from './src/mailer.js';

/**
 * Parse command line arguments
 */
export function parseArgs(args) {
  const result = {
    debug: false,
    input: null,
    inputs: [],
    book: null,
    author: null,
  };

  for (let i = 2; i < args.length; i++) {
    const arg = args[i];
    if (arg === '--debug' || arg === '-d') {
      result.debug = true;
    } else if ((arg === '--book' || arg === '-b') && i + 1 < args.length) {
      result.book = args[++i];
    } else if ((arg === '--author' || arg === '-a') && i + 1 < args.length) {
      result.author = args[++i];
    } else if (!arg.startsWith('-')) {
      result.inputs.push(arg);
    }
  }

  result.input = result.inputs[0] || null;

  return result;
}

/**
 * Print usage information
 */
export function printUsage() {
  console.log('Send to Kindle - Send articles and PDFs to your Kindle device');
  console.log('');
  console.log('Usage: send2kindle [options] <url-or-pdf-path>');
  console.log('       send2kindle --book "Title" [--author "Name"] <url1> <url2> [url3...]');
  console.log('');
  console.log('Options:');
  console.log('  --debug, -d            Save EPUB in current directory instead of sending');
  console.log('  --book, -b <title>     Combine multiple URLs into one book with chapters');
  console.log('  --author, -a <name>    Set the book author (optional, defaults to first article)');
  console.log('');
  console.log('Examples:');
  console.log('  send2kindle https://example.com/article');
  console.log('  send2kindle /path/to/document.pdf');
  console.log('  send2kindle --debug https://example.com/article');
  console.log('  send2kindle --book "My Book" https://example.com/ch1 https://example.com/ch2');
  console.log('  send2kindle -b "My Book" -a "Author" url1 url2 url3');
  console.log('');
  console.log('Required environment variables:');
  console.log('  KINDLE_EMAIL  - Your Kindle email address');
  console.log('  SMTP_USER     - Your email address');
  console.log('  SMTP_PASSWORD - Your email password (or app password)');
  console.log('');
  console.log('Optional environment variables:');
  console.log('  SMTP_SERVER   - SMTP server (default: smtp.gmail.com)');
  console.log('  SMTP_PORT     - SMTP port (default: 587)');
  console.log('  FROM_EMAIL    - From email (default: SMTP_USER)');
}

async function handleBookMode(args, config) {
  for (const url of args.inputs) {
    if (getInputType(url) !== 'url') {
      throw new Error('Book mode only supports URLs as inputs');
    }
  }
  if (args.inputs.length < 2) {
    throw new Error('Book mode requires at least 2 URLs');
  }

  console.log(`\u{1F4DA} Book mode: "${args.book}" (${args.inputs.length} chapters)`);

  const articles = [];
  for (const url of args.inputs) {
    articles.push(await extract(url));
  }

  const chapters = articles.map((a) => ({ title: a.title, htmlContent: a.content }));
  const author = args.author || articles[0]?.byline || articles[0]?.siteName || null;

  return convertBookToEpub({
    chapters,
    title: args.book,
    author,
    debugMode: args.debug,
  });
}

export async function main() {
  const args = parseArgs(process.argv);

  if (!args.input) {
    printUsage();
    process.exit(1);
  }

  const config = loadConfig();

  if (args.debug) {
    console.log('\u{1F41B} DEBUG MODE: EPUB will be saved to current directory');
    console.log('');
  }

  if (args.book) {
    const fileToSend = await handleBookMode(args, config);
    if (args.debug) {
      console.log('');
      console.log('\u2705 Debug mode: EPUB created but NOT sent to Kindle');
      console.log('\u{1F4D6} You can now open the EPUB file with your local reader to verify it.');
    } else {
      await sendToKindle(fileToSend, config);
    }
    return;
  }

  const inputType = getInputType(args.input);
  let fileToSend;

  switch (inputType) {
    case 'url':
      console.log('\u{1F517} Input detected: URL');
      const article = await extract(args.input);
      fileToSend = convertToEpub({
        htmlContent: article.content,
        title: article.title,
        author: article.byline || article.siteName,
        debugMode: args.debug,
      });
      break;

    case 'pdf':
      console.log('\u{1F4C4} Input detected: PDF file');
      if (!fs.existsSync(args.input)) {
        throw new Error(`PDF file not found: ${args.input}`);
      }
      fileToSend = path.resolve(args.input);
      console.log(`\u2713 PDF file found: ${fileToSend}`);

      if (args.debug) {
        console.log('');
        console.log('\u26A0\uFE0F  Note: Debug mode only applies to URL-based articles.');
        console.log('PDF files are ready to send as-is.');
      }
      break;

    case 'file':
      console.log('\u{1F4C1} Input detected: File');
      fileToSend = path.resolve(args.input);
      console.log(`\u2713 File found: ${fileToSend}`);

      if (args.debug) {
        console.log('');
        console.log('\u26A0\uFE0F  Note: Debug mode only applies to URL-based articles.');
        console.log('Existing files are ready to send as-is.');
      }
      break;

    default:
      throw new Error(
        'Could not determine input type. Input should be a URL (http:// or https://) or a file path.',
      );
  }

  if (args.debug && inputType === 'url') {
    console.log('');
    console.log('\u2705 Debug mode: EPUB created but NOT sent to Kindle');
    console.log('\u{1F4D6} You can now open the EPUB file with your local reader to verify it.');
  } else {
    await sendToKindle(fileToSend, config);
  }
}

const __filename = fileURLToPath(import.meta.url);
const __argv1 = (() => {
  try {
    return fs.realpathSync(process.argv[1]);
  } catch {
    return process.argv[1];
  }
})();
if (__argv1 === __filename) {
  main().catch((error) => {
    console.error(`\u274C Error: ${error.message}`);
    process.exit(1);
  });
}
