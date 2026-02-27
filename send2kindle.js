#!/usr/bin/env node

const { Readability } = require("@mozilla/readability");
const { JSDOM } = require("jsdom");
const { execSync } = require("child_process");
const nodemailer = require("nodemailer");
const fs = require("fs");
const path = require("path");
const os = require("os");

// Configuration
const KINDLE_EMAIL = "kelvin.trash_1ZgshQ@kindle.com";

// SMTP configuration from environment variables
const SMTP_CONFIG = {
  host: process.env.SMTP_SERVER || "smtp.gmail.com",
  port: parseInt(process.env.SMTP_PORT || "587", 10),
  secure: false, // true for 465, false for other ports
  auth: {
    user: process.env.SMTP_USER,
    pass: process.env.SMTP_PASSWORD,
  },
};

const FROM_EMAIL = process.env.FROM_EMAIL || process.env.SMTP_USER;

/**
 * Check if a command exists in PATH
 */
function commandExists(cmd) {
  try {
    execSync(`which ${cmd}`, { stdio: "ignore" });
    return true;
  } catch {
    return false;
  }
}

/**
 * Determine if input is a URL or file path
 */
function getInputType(input) {
  if (input.startsWith("http://") || input.startsWith("https://")) {
    return "url";
  }
  if (input.toLowerCase().endsWith(".pdf")) {
    return "pdf";
  }
  // Check if it's an existing file
  if (fs.existsSync(input)) {
    return "file";
  }
  return "unknown";
}

/**
 * Check if URL is a Twitter/X.com status URL
 */
function isTwitterUrl(url) {
  return (url.includes('x.com/') || url.includes('twitter.com/')) && 
         url.includes('/status/');
}

/**
 * Convert Twitter article blocks to HTML
 */
function convertArticleBlocksToHtml(blocks) {
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
      case 'atomic':
        // Atomic blocks are usually media - skip for now or handle specially
        break;
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
 * Extract tweet content using the fxtwitter JSON API
 */
async function extractTweetFromApi(url) {
  console.log(`🐦 Detected Twitter/X.com URL, using fxtwitter API...`);
  
  // Parse username and tweet ID from URL
  // Matches: x.com/username/status/123 or twitter.com/username/status/123
  const match = url.match(/(?:x\.com|twitter\.com)\/([^\/]+)\/status\/(\d+)/);
  
  if (!match) {
    throw new Error("Could not parse Twitter URL");
  }
  
  const [, username, tweetId] = match;
  const apiUrl = `https://api.fxtwitter.com/${username}/status/${tweetId}`;
  
  console.log(`📡 Fetching from: ${apiUrl}`);
  
  const response = await fetch(apiUrl, {
    headers: {
      "Accept": "application/json",
    },
  });
  
  if (!response.ok) {
    throw new Error(`API error! status: ${response.status}`);
  }
  
  const data = await response.json();
  
  if (data.code !== 200 || !data.tweet) {
    throw new Error(data.message || "Tweet not found or has been deleted");
  }
  
  const tweet = data.tweet;
  const authorName = tweet.author?.name || username;
  const authorHandle = tweet.author?.screen_name || username;
  
  // Check if this is an article tweet
  if (tweet.article && tweet.article.content && tweet.article.content.blocks) {
    console.log(`📄 Detected Twitter Article: "${tweet.article.title}"`);
    
    const articleTitle = tweet.article.title || `Article by @${authorHandle}`;
    const blocks = tweet.article.content.blocks;
    
    // Convert blocks to HTML
    const articleHtml = convertArticleBlocksToHtml(blocks);
    
    // Extract plain text for textContent
    const plainText = blocks
      .map(block => block.text || '')
      .filter(text => text.trim())
      .join('\n\n');
    
    // Add cover image if available
    let coverHtml = '';
    if (tweet.article.cover_media?.media_info?.original_img_url) {
      const coverUrl = tweet.article.cover_media.media_info.original_img_url;
      coverHtml = `<p><img src="${coverUrl}" alt="Cover image" style="max-width: 100%;"></p>\n`;
    }
    
    console.log(`✓ Extracted article: "${articleTitle}" (${blocks.length} blocks)`);
    
    return {
      title: articleTitle,
      content: coverHtml + articleHtml,
      textContent: plainText,
      byline: authorName,
      siteName: "Twitter/X",
    };
  }
  
  // Regular tweet (not an article)
  const tweetText = tweet.text || "";
  
  if (!tweetText.trim()) {
    throw new Error("Tweet has no text content");
  }
  
  // Format the tweet text as HTML (preserve line breaks)
  const formattedText = tweetText
    .split('\n')
    .map(line => `<p>${line || '&nbsp;'}</p>`)
    .join('\n');
  
  // Build media section if there are images/videos
  let mediaHtml = '';
  if (tweet.media?.photos && tweet.media.photos.length > 0) {
    mediaHtml = '<div class="media">';
    for (const photo of tweet.media.photos) {
      mediaHtml += `<p><img src="${photo.url}" alt="Tweet image" style="max-width: 100%;"></p>`;
    }
    mediaHtml += '</div>';
  }
  
  // Include quoted tweet if present
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
  
  console.log(`✓ Extracted tweet from @${authorHandle}: "${tweetText.substring(0, 50)}..."`);
  
  return {
    title: `Tweet by @${authorHandle}`,
    content: content,
    textContent: tweetText,
    byline: authorName,
    siteName: "Twitter/X",
  };
}

/**
 * Extract article content from URL using @mozilla/readability
 */
async function extractArticle(url) {
  console.log(`📰 Extracting article from: ${url}`);

  try {
    // Check if it's a Twitter/X.com URL - use fxtwitter API instead
    if (isTwitterUrl(url)) {
      return await extractTweetFromApi(url);
    }

    // Fetch the page (for non-Twitter URLs)
    const response = await fetch(url, {
      headers: {
        "User-Agent":
          "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Safari/537.36",
        Accept:
          "text/html,application/xhtml+xml,application/xml;q=0.9,image/webp,*/*;q=0.8",
        "Accept-Language": "en-US,en;q=0.5",
      },
    });

    if (!response.ok) {
      throw new Error(`HTTP error! status: ${response.status}`);
    }

    const html = await response.text();

    // Parse with JSDOM
    const dom = new JSDOM(html, { url });

    // Extract with Readability
    const reader = new Readability(dom.window.document);
    const article = reader.parse();

    if (!article || !article.content || article.content.length < 100) {
      console.error("❌ Error: Could not extract meaningful content from URL");
      process.exit(1);
    }

    console.log(`✓ Extracted article: "${article.title}"`);

    return {
      title: article.title || "Article",
      content: article.content,
      textContent: article.textContent,
      byline: article.byline,
      siteName: article.siteName,
    };
  } catch (error) {
    console.error(`❌ Error extracting article: ${error.message}`);
    process.exit(1);
  }
}

/**
 * Sanitize filename to be safe for filesystem
 */
function sanitizeFilename(name) {
  return name
    .replace(/[<>:"/\\|?*\x00-\x1F]/g, "") // Remove invalid characters
    .replace(/\s+/g, "_") // Replace spaces with underscores
    .substring(0, 100); // Limit length
}

/**
 * Escape text for YAML (handle quotes, newlines, etc.)
 */
function escapeYaml(text) {
  if (!text) return '""';

  // Replace problematic characters
  text = text
    .replace(/\\/g, "\\\\") // Escape backslashes
    .replace(/"/g, '\\"') // Escape quotes
    .replace(/\n/g, " ") // Replace newlines with spaces
    .replace(/\r/g, "") // Remove carriage returns
    .replace(/\t/g, " "); // Replace tabs with spaces

  // Always quote the string to be safe
  return `"${text}"`;
}

/**
 * Convert HTML content to EPUB using pandoc with YAML metadata block
 */
function convertToEpub(
  htmlContent,
  title = "Article",
  author = null,
  debugMode = false
) {
  console.log("📖 Converting to EPUB format...");

  if (!commandExists("pandoc")) {
    console.error("❌ Error: pandoc is not installed");
    console.error("Install with your package manager:");
    console.error("  Ubuntu/Debian: sudo apt install pandoc");
    console.error("  macOS: brew install pandoc");
    console.error("  Fedora: sudo dnf install pandoc");
    process.exit(1);
  }

  const tmpDir = debugMode ? process.cwd() : os.tmpdir();
  const escapedTitle = escapeYaml(title);
  const safeTitle = sanitizeFilename(title);
  const htmlPath = path.join(tmpDir, `${safeTitle}.html`);
  const epubPath = path.join(tmpDir, `${safeTitle}.epub`);
  const metadataPath = path.join(tmpDir, `${safeTitle}.yaml`);

  // Create YAML metadata block
  const yamlMetadata = `---
title: ${escapedTitle}
${author ? `author: ${escapeYaml(author)}` : ""}
lang: en-US
subject: ${escapedTitle}
---
`;

  // Wrap content with YAML metadata block and proper HTML structure
  const fullHtml = `<!DOCTYPE html>
<html>
<head>
  <meta charset="utf-8">
  <title>${escapedTitle}</title>
  ${author ? `<meta name="author" content="${author}">` : ""}
</head>
<body>
  <h1>${escapedTitle}</h1>
  ${author ? `<p style="font-style: italic;">by ${author}</p>` : ""}
  ${htmlContent}
</body>
</html>`;

  // Write HTML content to temp file
  fs.writeFileSync(htmlPath, fullHtml, "utf-8");
  fs.writeFileSync(metadataPath, yamlMetadata, "utf-8");

  try {
    // Simple pandoc command - metadata comes from YAML block
    const pandocCmd = `pandoc "${htmlPath}" -V lang=en -o "${epubPath}" --metadata-file="${metadataPath}"`;

    // Convert with pandoc
    execSync(pandocCmd, {
      encoding: "utf-8",
      shell: "/bin/bash",
    });

    if (!fs.existsSync(epubPath)) {
      console.error("❌ Error: EPUB file was not created");
      process.exit(1);
    }

    if (debugMode) {
      console.log("✓ EPUB created successfully");
      console.log(`📁 HTML file saved to: ${htmlPath}`);
      console.log(`📁 EPUB file saved to: ${epubPath}`);
      console.log(`📁 Metadata file saved to: ${metadataPath}`);
    } else {
      console.log("✓ EPUB created successfully");
    }

    return epubPath;
  } catch (error) {
    console.error(`❌ Error converting to EPUB: ${error.message}`);
    process.exit(1);
  }
}

/**
 * Send file to Kindle via email
 */
async function sendToKindle(filePath) {
  console.log(`📧 Sending to Kindle: ${KINDLE_EMAIL}`);

  // Validate SMTP configuration
  if (!SMTP_CONFIG.auth.user || !SMTP_CONFIG.auth.pass) {
    console.error("❌ Error: SMTP credentials not configured");
    console.error("Set the following environment variables:");
    console.error('  export SMTP_USER="your-email@gmail.com"');
    console.error('  export SMTP_PASSWORD="your-app-password"');
    console.error("");
    console.error("Optional variables:");
    console.error('  export SMTP_SERVER="smtp.gmail.com" (default)');
    console.error('  export SMTP_PORT="587" (default)');
    console.error('  export FROM_EMAIL="your-email@gmail.com"');
    process.exit(1);
  }

  // Verify file exists
  if (!fs.existsSync(filePath)) {
    console.error(`❌ Error: File not found: ${filePath}`);
    process.exit(1);
  }

  const fileName = path.basename(filePath);
  const fileContent = fs.readFileSync(filePath);

  // Create transporter
  const transporter = nodemailer.createTransport(SMTP_CONFIG);

  // Email options
  const mailOptions = {
    from: FROM_EMAIL,
    to: KINDLE_EMAIL,
    subject: "Document for Kindle",
    text: "Please find the attached document.",
    attachments: [
      {
        filename: fileName,
        content: fileContent,
      },
    ],
  };

  try {
    await transporter.sendMail(mailOptions);
    console.log(`✅ Successfully sent "${fileName}" to ${KINDLE_EMAIL}`);
    console.log("");
    console.log("📱 Your document should appear on your Kindle shortly.");
    console.log("");
    console.log(
      "⚠️  Reminder: Make sure your sender email is in the approved list:"
    );
    console.log("   https://www.amazon.com/hz/mycd/myx#/home/settings/payment");
    console.log(
      '   Go to "Personal Document Settings" → "Approved Personal Document E-mail List"'
    );
  } catch (error) {
    console.error(`❌ Error sending email: ${error.message}`);
    if (error.code === "EAUTH") {
      console.error("");
      console.error("Authentication failed. For Gmail:");
      console.error("1. Enable 2-Factor Authentication on your Google account");
      console.error(
        "2. Create an App Password: https://myaccount.google.com/apppasswords"
      );
      console.error("3. Use the App Password as SMTP_PASSWORD");
    }
    process.exit(1);
  }
}

/**
 * Parse command line arguments
 */
function parseArgs(args) {
  const result = {
    debug: false,
    input: null,
  };

  for (let i = 2; i < args.length; i++) {
    const arg = args[i];
    if (arg === "--debug" || arg === "-d") {
      result.debug = true;
    } else if (!arg.startsWith("-")) {
      result.input = arg;
    }
  }

  return result;
}

/**
 * Main function
 */
async function main() {
  const args = parseArgs(process.argv);

  if (!args.input) {
    console.log(
      "Send to Kindle - Send articles and PDFs to your Kindle device"
    );
    console.log("");
    console.log("Usage: send2kindle.js [options] <url-or-pdf-path>");
    console.log("");
    console.log("Options:");
    console.log(
      "  --debug, -d   Save EPUB in current directory instead of sending to Kindle"
    );
    console.log("");
    console.log("Examples:");
    console.log("  send2kindle.js https://example.com/article");
    console.log("  send2kindle.js /path/to/document.pdf");
    console.log("  send2kindle.js --debug https://example.com/article");
    console.log("");
    console.log("Required environment variables (not needed in debug mode):");
    console.log("  SMTP_USER     - Your email address");
    console.log("  SMTP_PASSWORD - Your email password (or app password)");
    console.log("");
    console.log("Optional environment variables:");
    console.log("  SMTP_SERVER   - SMTP server (default: smtp.gmail.com)");
    console.log("  SMTP_PORT     - SMTP port (default: 587)");
    console.log("  FROM_EMAIL    - From email (default: SMTP_USER)");
    process.exit(1);
  }

  const inputType = getInputType(args.input);
  let fileToSend;

  if (args.debug) {
    console.log("🐛 DEBUG MODE: EPUB will be saved to current directory");
    console.log("");
  }

  switch (inputType) {
    case "url":
      console.log("🔗 Input detected: URL");
      const article = await extractArticle(args.input);
      fileToSend = convertToEpub(
        article.content,
        article.title,
        article.byline || article.siteName,
        args.debug
      );
      break;

    case "pdf":
      console.log("📄 Input detected: PDF file");
      if (!fs.existsSync(args.input)) {
        console.error(`❌ Error: PDF file not found: ${args.input}`);
        process.exit(1);
      }
      fileToSend = path.resolve(args.input);
      console.log(`✓ PDF file found: ${fileToSend}`);

      if (args.debug) {
        console.log("");
        console.log("⚠️  Note: Debug mode only applies to URL-based articles.");
        console.log("PDF files are ready to send as-is.");
      }
      break;

    case "file":
      console.log("📁 Input detected: File");
      fileToSend = path.resolve(args.input);
      console.log(`✓ File found: ${fileToSend}`);

      if (args.debug) {
        console.log("");
        console.log("⚠️  Note: Debug mode only applies to URL-based articles.");
        console.log("Existing files are ready to send as-is.");
      }
      break;

    default:
      console.error("❌ Error: Could not determine input type");
      console.error(
        "Input should be a URL (http:// or https://) or a file path"
      );
      process.exit(1);
  }

  if (args.debug && inputType === "url") {
    console.log("");
    console.log("✅ Debug mode: EPUB created but NOT sent to Kindle");
    console.log(
      "📖 You can now open the EPUB file with your local reader to verify it."
    );
  } else {
    await sendToKindle(fileToSend);
  }
}

// Run main function
main().catch((error) => {
  console.error(`❌ Unexpected error: ${error.message}`);
  process.exit(1);
});
