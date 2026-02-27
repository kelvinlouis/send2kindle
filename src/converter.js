import { execSync } from 'child_process';
import fs from 'fs';
import path from 'path';
import os from 'os';
import { commandExists, sanitizeFilename, escapeYaml } from './utils.js';

/**
 * Convert HTML content to EPUB using pandoc with YAML metadata block.
 *
 * @param {Object} options
 * @param {string} options.htmlContent - The HTML content to convert
 * @param {string} [options.title="Article"] - Document title
 * @param {string|null} [options.author=null] - Document author
 * @param {boolean} [options.debugMode=false] - Save files to cwd instead of tmpdir
 * @returns {string} Path to the created EPUB file
 */
export function convertToEpub({
  htmlContent,
  title = 'Article',
  author = null,
  debugMode = false,
}) {
  console.log('\u{1F4D6} Converting to EPUB format...');

  if (!commandExists('pandoc')) {
    throw new Error(
      'pandoc is not installed. Install with your package manager:\n' +
        '  Ubuntu/Debian: sudo apt install pandoc\n' +
        '  macOS: brew install pandoc\n' +
        '  Fedora: sudo dnf install pandoc',
    );
  }

  const tmpDir = debugMode ? process.cwd() : os.tmpdir();
  const escapedTitle = escapeYaml(title);
  const safeTitle = sanitizeFilename(title);
  const htmlPath = path.join(tmpDir, `${safeTitle}.html`);
  const epubPath = path.join(tmpDir, `${safeTitle}.epub`);
  const metadataPath = path.join(tmpDir, `${safeTitle}.yaml`);

  const yamlMetadata = `---
title: ${escapedTitle}
${author ? `author: ${escapeYaml(author)}` : ''}
lang: en-US
subject: ${escapedTitle}
---
`;

  const fullHtml = `<!DOCTYPE html>
<html>
<head>
  <meta charset="utf-8">
  <title>${escapedTitle}</title>
  ${author ? `<meta name="author" content="${author}">` : ''}
</head>
<body>
  <h1>${escapedTitle}</h1>
  ${author ? `<p style="font-style: italic;">by ${author}</p>` : ''}
  ${htmlContent}
</body>
</html>`;

  fs.writeFileSync(htmlPath, fullHtml, 'utf-8');
  fs.writeFileSync(metadataPath, yamlMetadata, 'utf-8');

  const pandocCmd = `pandoc "${htmlPath}" -V lang=en -o "${epubPath}" --metadata-file="${metadataPath}"`;

  execSync(pandocCmd, {
    encoding: 'utf-8',
    shell: '/bin/bash',
  });

  if (!fs.existsSync(epubPath)) {
    throw new Error('EPUB file was not created');
  }

  if (debugMode) {
    console.log('\u2713 EPUB created successfully');
    console.log(`\u{1F4C1} HTML file saved to: ${htmlPath}`);
    console.log(`\u{1F4C1} EPUB file saved to: ${epubPath}`);
    console.log(`\u{1F4C1} Metadata file saved to: ${metadataPath}`);
  } else {
    console.log('\u2713 EPUB created successfully');
  }

  return epubPath;
}
