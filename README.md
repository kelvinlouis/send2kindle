# send2kindle

A CLI tool that extracts web articles, converts them to EPUB, and sends them to your Kindle device via email.

## Features

- Extract articles from any URL using Mozilla's Readability
- Extract tweets and Twitter/X articles via the fxtwitter API
- Convert to EPUB format via pandoc
- Send PDFs and other files directly to Kindle
- Debug mode to preview EPUBs locally before sending

## Prerequisites

- **Node.js** 18+ (uses built-in `fetch`)
- **pandoc** — for HTML-to-EPUB conversion

Install pandoc with your package manager:

```bash
# Ubuntu/Debian
sudo apt install pandoc

# macOS
brew install pandoc

# Fedora
sudo dnf install pandoc
```

## Installation

```bash
# Install globally from npm
npm install -g send2kindle

# Or run directly with npx
npx send2kindle https://example.com/article
```

## Configuration

Set the following environment variables (e.g. in your `.bashrc` or `.zshrc`):

### Required

| Variable        | Description                                            |
| --------------- | ------------------------------------------------------ |
| `KINDLE_EMAIL`  | Your Kindle email address (e.g. `yourname@kindle.com`) |
| `SMTP_USER`     | Your email address for sending                         |
| `SMTP_PASSWORD` | Your email password or app password                    |

### Optional

| Variable      | Default              | Description          |
| ------------- | -------------------- | -------------------- |
| `SMTP_SERVER` | `smtp.gmail.com`     | SMTP server hostname |
| `SMTP_PORT`   | `587`                | SMTP server port     |
| `FROM_EMAIL`  | Value of `SMTP_USER` | Sender email address |

### Example setup

```bash
export KINDLE_EMAIL="yourname@kindle.com"
export SMTP_USER="you@gmail.com"
export SMTP_PASSWORD="abcd-efgh-ijkl-mnop"  # Gmail app password
```

## Usage

```bash
# Send a web article to Kindle
send2kindle https://example.com/some-article

# Send a PDF to Kindle
send2kindle /path/to/document.pdf

# Send a tweet or Twitter/X article
send2kindle https://x.com/username/status/123456789

# Debug mode: create EPUB locally without sending
send2kindle --debug https://example.com/some-article
send2kindle -d https://example.com/some-article
```

### Debug mode

Use `--debug` (or `-d`) to save the EPUB to your current directory instead of emailing it. This is useful for previewing the output before sending. No email credentials or `KINDLE_EMAIL` are required in debug mode.

## Kindle email delivery

Amazon Kindle devices can receive documents via email. To set this up:

1. **Find your Kindle email** — Go to [Amazon device settings](https://www.amazon.com/hz/mycd/myx#/home/settings/payment) and look under "Personal Document Settings" for your Send-to-Kindle email address.

2. **Add your sender email to the approved list** — In the same settings page, under "Approved Personal Document E-mail List", add the email address you'll be sending from (your `SMTP_USER` / `FROM_EMAIL`).

### Gmail setup

If using Gmail as your SMTP provider:

1. Enable 2-Factor Authentication on your Google account
2. Create an App Password at https://myaccount.google.com/apppasswords
3. Use the App Password as your `SMTP_PASSWORD`

## For AI agents

See [`AGENTS.md`](./AGENTS.md) for project conventions, commands, and architecture details.

## License

MIT
