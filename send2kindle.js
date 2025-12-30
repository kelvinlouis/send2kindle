#!/usr/bin/env node

const { Readability } = require('@mozilla/readability');
const { JSDOM } = require('jsdom');
const { execSync } = require('child_process');
const nodemailer = require('nodemailer');
const fs = require('fs');
const path = require('path');
const os = require('os');

// Configuration
const KINDLE_EMAIL = 'kelvin.trash_1ZgshQ@kindle.com';

// SMTP configuration from environment variables
const SMTP_CONFIG = {
  host: process.env.SMTP_SERVER || 'smtp.gmail.com',
  port: parseInt(process.env.SMTP_PORT || '587', 10),
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
    execSync(`which ${cmd}`, { stdio: 'ignore' });
    return true;
  } catch {
    return false;
  }
}

/**
 * Determine if input is a URL or file path
 */
function getInputType(input) {
  if (input.startsWith('http://') || input.startsWith('https://')) {
    return 'url';
  }
  if (input.toLowerCase().endsWith('.pdf')) {
    return 'pdf';
  }
  // Check if it's an existing file
  if (fs.existsSync(input)) {
    return 'file';
  }
  return 'unknown';
}

/**
 * Extract article content from URL using @mozilla/readability
 */
async function extractArticle(url) {
  console.log(`📰 Extracting article from: ${url}`);
  
  try {
    // Fetch the page
    const response = await fetch(url, {
      headers: {
        'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Safari/537.36',
        'Accept': 'text/html,application/xhtml+xml,application/xml;q=0.9,image/webp,*/*;q=0.8',
        'Accept-Language': 'en-US,en;q=0.5',
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
      console.error('❌ Error: Could not extract meaningful content from URL');
      process.exit(1);
    }
    
    console.log(`✓ Extracted article: "${article.title}"`);
    
    return {
      title: article.title || 'Article',
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
 * Convert HTML content to EPUB using pandoc
 */
function convertToEpub(htmlContent, title = 'Article') {
  console.log('📖 Converting to EPUB format...');
  
  if (!commandExists('pandoc')) {
    console.error('❌ Error: pandoc is not installed');
    console.error('Install with your package manager:');
    console.error('  Ubuntu/Debian: sudo apt install pandoc');
    console.error('  macOS: brew install pandoc');
    console.error('  Fedora: sudo dnf install pandoc');
    process.exit(1);
  }
  
  const tmpDir = os.tmpdir();
  const htmlPath = path.join(tmpDir, 'article.html');
  const epubPath = path.join(tmpDir, 'article.epub');
  
  // Wrap content in proper HTML structure
  const fullHtml = `<!DOCTYPE html>
<html>
<head>
  <meta charset="utf-8">
  <title>${title}</title>
</head>
<body>
  <h1>${title}</h1>
  ${htmlContent}
</body>
</html>`;
  
  // Write HTML content to temp file
  fs.writeFileSync(htmlPath, fullHtml, 'utf-8');
  
  try {
    // Convert with pandoc
    execSync(`pandoc "${htmlPath}" -V lang=en -o "${epubPath}" --metadata title="${title.replace(/"/g, '\\"')}"`, {
      encoding: 'utf-8',
    });
    
    if (!fs.existsSync(epubPath)) {
      console.error('❌ Error: EPUB file was not created');
      process.exit(1);
    }
    
    console.log('✓ EPUB created successfully');
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
    console.error('❌ Error: SMTP credentials not configured');
    console.error('Set the following environment variables:');
    console.error('  export SMTP_USER="your-email@gmail.com"');
    console.error('  export SMTP_PASSWORD="your-app-password"');
    console.error('');
    console.error('Optional variables:');
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
    subject: 'Document for Kindle',
    text: 'Please find the attached document.',
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
    console.log('');
    console.log('📱 Your document should appear on your Kindle shortly.');
    console.log('');
    console.log('⚠️  Reminder: Make sure your sender email is in the approved list:');
    console.log('   https://www.amazon.com/hz/mycd/myx#/home/settings/payment');
    console.log('   Go to "Personal Document Settings" → "Approved Personal Document E-mail List"');
  } catch (error) {
    console.error(`❌ Error sending email: ${error.message}`);
    if (error.code === 'EAUTH') {
      console.error('');
      console.error('Authentication failed. For Gmail:');
      console.error('1. Enable 2-Factor Authentication on your Google account');
      console.error('2. Create an App Password: https://myaccount.google.com/apppasswords');
      console.error('3. Use the App Password as SMTP_PASSWORD');
    }
    process.exit(1);
  }
}

/**
 * Main function
 */
async function main() {
  const input = process.argv[2];
  
  if (!input) {
    console.log('Send to Kindle - Send articles and PDFs to your Kindle device');
    console.log('');
    console.log('Usage: send2kindle.js <url-or-pdf-path>');
    console.log('');
    console.log('Examples:');
    console.log('  send2kindle.js https://example.com/article');
    console.log('  send2kindle.js /path/to/document.pdf');
    console.log('');
    console.log('Required environment variables:');
    console.log('  SMTP_USER     - Your email address');
    console.log('  SMTP_PASSWORD - Your email password (or app password)');
    console.log('');
    console.log('Optional environment variables:');
    console.log('  SMTP_SERVER   - SMTP server (default: smtp.gmail.com)');
    console.log('  SMTP_PORT     - SMTP port (default: 587)');
    console.log('  FROM_EMAIL    - From email (default: SMTP_USER)');
    process.exit(1);
  }
  
  const inputType = getInputType(input);
  let fileToSend;
  
  switch (inputType) {
    case 'url':
      console.log('🔗 Input detected: URL');
      const article = await extractArticle(input);
      fileToSend = convertToEpub(article.content, article.title);
      break;
      
    case 'pdf':
      console.log('📄 Input detected: PDF file');
      if (!fs.existsSync(input)) {
        console.error(`❌ Error: PDF file not found: ${input}`);
        process.exit(1);
      }
      fileToSend = path.resolve(input);
      console.log(`✓ PDF file found: ${fileToSend}`);
      break;
      
    case 'file':
      console.log('📁 Input detected: File');
      fileToSend = path.resolve(input);
      console.log(`✓ File found: ${fileToSend}`);
      break;
      
    default:
      console.error('❌ Error: Could not determine input type');
      console.error('Input should be a URL (http:// or https://) or a file path');
      process.exit(1);
  }
  
  await sendToKindle(fileToSend);
}

// Run main function
main().catch((error) => {
  console.error(`❌ Unexpected error: ${error.message}`);
  process.exit(1);
});
