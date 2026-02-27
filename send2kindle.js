#!/usr/bin/env node

const fs = require("fs");
const path = require("path");
const { loadConfig } = require("./src/config");
const { getInputType } = require("./src/utils");
const { extract } = require("./src/extractors");
const { convertToEpub } = require("./src/converter");
const { sendToKindle } = require("./src/mailer");

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
 * Print usage information
 */
function printUsage() {
  console.log(
    "Send to Kindle - Send articles and PDFs to your Kindle device"
  );
  console.log("");
  console.log("Usage: send2kindle [options] <url-or-pdf-path>");
  console.log("");
  console.log("Options:");
  console.log(
    "  --debug, -d   Save EPUB in current directory instead of sending to Kindle"
  );
  console.log("");
  console.log("Examples:");
  console.log("  send2kindle https://example.com/article");
  console.log("  send2kindle /path/to/document.pdf");
  console.log("  send2kindle --debug https://example.com/article");
  console.log("");
  console.log("Required environment variables:");
  console.log("  KINDLE_EMAIL  - Your Kindle email address");
  console.log("  SMTP_USER     - Your email address");
  console.log("  SMTP_PASSWORD - Your email password (or app password)");
  console.log("");
  console.log("Optional environment variables:");
  console.log("  SMTP_SERVER   - SMTP server (default: smtp.gmail.com)");
  console.log("  SMTP_PORT     - SMTP port (default: 587)");
  console.log("  FROM_EMAIL    - From email (default: SMTP_USER)");
}

async function main() {
  const args = parseArgs(process.argv);

  if (!args.input) {
    printUsage();
    process.exit(1);
  }

  const config = loadConfig();
  const inputType = getInputType(args.input);
  let fileToSend;

  if (args.debug) {
    console.log("\u{1F41B} DEBUG MODE: EPUB will be saved to current directory");
    console.log("");
  }

  switch (inputType) {
    case "url":
      console.log("\u{1F517} Input detected: URL");
      const article = await extract(args.input);
      fileToSend = convertToEpub({
        htmlContent: article.content,
        title: article.title,
        author: article.byline || article.siteName,
        debugMode: args.debug,
      });
      break;

    case "pdf":
      console.log("\u{1F4C4} Input detected: PDF file");
      if (!fs.existsSync(args.input)) {
        throw new Error(`PDF file not found: ${args.input}`);
      }
      fileToSend = path.resolve(args.input);
      console.log(`\u2713 PDF file found: ${fileToSend}`);

      if (args.debug) {
        console.log("");
        console.log(
          "\u26A0\uFE0F  Note: Debug mode only applies to URL-based articles."
        );
        console.log("PDF files are ready to send as-is.");
      }
      break;

    case "file":
      console.log("\u{1F4C1} Input detected: File");
      fileToSend = path.resolve(args.input);
      console.log(`\u2713 File found: ${fileToSend}`);

      if (args.debug) {
        console.log("");
        console.log(
          "\u26A0\uFE0F  Note: Debug mode only applies to URL-based articles."
        );
        console.log("Existing files are ready to send as-is.");
      }
      break;

    default:
      throw new Error(
        "Could not determine input type. Input should be a URL (http:// or https://) or a file path."
      );
  }

  if (args.debug && inputType === "url") {
    console.log("");
    console.log("\u2705 Debug mode: EPUB created but NOT sent to Kindle");
    console.log(
      "\u{1F4D6} You can now open the EPUB file with your local reader to verify it."
    );
  } else {
    await sendToKindle(fileToSend, config);
  }
}

main().catch((error) => {
  console.error(`\u274C Error: ${error.message}`);
  process.exit(1);
});
