# Send to Kindle

Send web articles and PDF documents directly to your Kindle device via email.

## Features

- 📰 Extract clean article content from any web page using Mozilla Readability
- 📧 Send via SMTP email (works with Gmail, etc.)
- 📖 Automatic conversion to EPUB format (perfect for Kindle)
- 📄 Support for PDF files
- 🐛 Debug mode to save EPUB locally for testing

## Installation

### Prerequisites

1. **Node.js v18+** (for built-in `fetch` support)
   ```bash
   node --version  # Should be v18.0.0 or higher
   ```

2. **pandoc** (for document conversion)
   ```bash
   # Ubuntu/Debian/WSL
   sudo apt install pandoc
   
   # macOS
   brew install pandoc
   
   # Fedora
   sudo dnf install pandoc
   ```

3. **Node.js dependencies**
   ```bash
   cd ~/.config/goose/scripts/send2kindle
   npm install
   ```
   This installs:
   - `@mozilla/readability` - Article extraction
   - `jsdom` - HTML parsing
   - `nodemailer` - Email sending

### SMTP Configuration

The script uses SMTP to send documents to your Kindle email. Configure it using environment variables:

```bash
export SMTP_USER='your-email@gmail.com'
export SMTP_PASSWORD='your-app-password'
```

**For Gmail users:**
1. Enable 2-Factor Authentication on your Google account
2. Create an App Password at https://myaccount.google.com/apppasswords
3. Use the App Password as `SMTP_PASSWORD`

**Optional variables:**
```bash
export SMTP_SERVER='smtp.gmail.com'  # Default
export SMTP_PORT='587'               # Default
export FROM_EMAIL='your-email@gmail.com'  # Defaults to SMTP_USER
```

Add these to your `~/.bashrc` or `~/.zshrc` to make them permanent.

### Amazon Kindle Setup

**Important:** You must add your sender email to Amazon's approved list:

1. Go to https://www.amazon.com/hz/mycd/myx#/home/settings/payment
2. Navigate to "Personal Document Settings"
3. Scroll to "Approved Personal Document E-mail List"
4. Add your `SMTP_USER` email address

Your Kindle email address can be found on the same page under "Send-to-Kindle Email Settings".

## Usage

### Via the helper script

```bash
# Send an article from URL
node ~/.config/goose/scripts/send2kindle/send2kindle.js "https://example.com/article"

# Send a PDF file
node ~/.config/goose/scripts/send2kindle/send2kindle.js "/path/to/document.pdf"

# Debug mode: Save EPUB locally without sending to Kindle
node ~/.config/goose/scripts/send2kindle/send2kindle.js --debug "https://example.com/article"
```

### Via goose recipe

```bash
# Send an article
goose run send2kindle --url "https://example.com/article"

# Send a PDF
goose run send2kindle --file "/path/to/document.pdf"
```

## Debug Mode

Use the `--debug` flag (or `-d`) to create the EPUB file in your current directory without sending it to your Kindle:

```bash
node ~/.config/goose/scripts/send2kindle/send2kindle.js --debug "https://example.com/article"
```

This is useful for:
- Testing article extraction and formatting
- Checking EPUB metadata before sending
- Verifying the article looks correct in your local EPUB reader
- Troubleshooting conversion issues

The EPUB file will be named based on the article title and saved in your current directory.

## How It Works

1. **URL Input:**
   - Fetches the webpage
   - Uses `@mozilla/readability` (same as Firefox Reader View) to extract clean article content
   - Creates HTML with proper metadata (title, author, language)
   - Converts to EPUB using `pandoc` with full metadata support
   - Sends to Kindle via SMTP email (or saves locally in debug mode)

2. **PDF Input:**
   - Validates the file exists
   - Sends directly to Kindle via SMTP email

## Metadata

The script properly sets EPUB metadata to ensure the correct title appears on your Kindle:

- **Title**: Extracted from the article
- **Author**: Extracted from byline or site name
- **Language**: Set to English (en)

If the title shows incorrectly on your Kindle, use debug mode to check the EPUB file locally first.

## Troubleshooting

### "pandoc is not installed"
Install pandoc using your package manager (see Installation section above).

### "SMTP credentials not configured"
Make sure you've exported the environment variables (see SMTP Configuration above).

### "Authentication failed"
For Gmail:
1. Verify 2FA is enabled on your Google account
2. Generate a new App Password at https://myaccount.google.com/apppasswords
3. Make sure you're using the App Password, not your regular password

### "Document not appearing on Kindle"
1. Check that your sender email is in Amazon's approved list
2. Check your spam folder for bounce notifications
3. Some file formats may not be supported (stick with EPUB or PDF)
4. Check your Kindle's "Manage Your Content and Devices" page on Amazon

### "Could not extract meaningful content"
Some websites are difficult to parse. Try:
1. Using debug mode to check what was extracted
2. Reading the article in Firefox Reader View first to verify it's extractable
3. Using a different URL or PDF as input

### Title shows as "article" on Kindle
This has been fixed in the current version. The script now:
- Properly extracts the article title
- Sets multiple metadata fields in the EPUB
- Uses pandoc's metadata options correctly

If you still see this issue, try using debug mode to verify the EPUB locally first.

## Examples

### Send a blog post to Kindle
```bash
node ~/.config/goose/scripts/send2kindle/send2kindle.js "https://blog.example.com/post"
```

### Test article extraction locally
```bash
node ~/.config/goose/scripts/send2kindle/send2kindle.js --debug "https://news.example.com/article"
# Opens the EPUB file in your current directory
# Check it with your local EPUB reader (e.g., Calibre)
```

### Send a research paper
```bash
node ~/.config/goose/scripts/send2kindle/send2kindle.js "~/Downloads/research-paper.pdf"
```

## Technical Details

- Uses Mozilla's Readability algorithm for article extraction
- Supports Node.js v18+ (requires built-in `fetch`)
- EPUB format ensures best compatibility with Kindle
- Proper HTML structure with semantic markup
- Metadata embedded at multiple levels for Kindle recognition
- Debug mode saves files with sanitized, descriptive filenames
