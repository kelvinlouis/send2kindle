const nodemailer = require("nodemailer");
const fs = require("fs");
const path = require("path");

/**
 * Send a file to Kindle via email.
 *
 * @param {string} filePath - Path to the file to send
 * @param {Object} config - Configuration from loadConfig()
 * @param {string} config.kindleEmail - Kindle email address
 * @param {Object} config.smtp - SMTP configuration for nodemailer
 * @param {string} config.fromEmail - Sender email address
 */
async function sendToKindle(filePath, config) {
  const { kindleEmail, smtp, fromEmail } = config;

  if (!kindleEmail) {
    throw new Error(
      "KINDLE_EMAIL is not set. Set it in your environment:\n" +
        '  export KINDLE_EMAIL="your-kindle-email@kindle.com"\n\n' +
        "Find your Kindle email at:\n" +
        "  https://www.amazon.com/hz/mycd/myx#/home/settings/payment"
    );
  }

  if (!smtp.auth.user || !smtp.auth.pass) {
    throw new Error(
      "SMTP credentials not configured. Set the following environment variables:\n" +
        '  export SMTP_USER="your-email@gmail.com"\n' +
        '  export SMTP_PASSWORD="your-app-password"\n\n' +
        "Optional variables:\n" +
        '  export SMTP_SERVER="smtp.gmail.com" (default)\n' +
        '  export SMTP_PORT="587" (default)\n' +
        '  export FROM_EMAIL="your-email@gmail.com"'
    );
  }

  if (!fs.existsSync(filePath)) {
    throw new Error(`File not found: ${filePath}`);
  }

  console.log(`\u{1F4E7} Sending to Kindle: ${kindleEmail}`);

  const fileName = path.basename(filePath);
  const fileContent = fs.readFileSync(filePath);

  const transporter = nodemailer.createTransport(smtp);

  const mailOptions = {
    from: fromEmail,
    to: kindleEmail,
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
  } catch (error) {
    if (error.code === "EAUTH") {
      throw new Error(
        `Email authentication failed: ${error.message}\n\n` +
          "For Gmail:\n" +
          "1. Enable 2-Factor Authentication on your Google account\n" +
          "2. Create an App Password: https://myaccount.google.com/apppasswords\n" +
          "3. Use the App Password as SMTP_PASSWORD"
      );
    }
    throw new Error(`Error sending email: ${error.message}`);
  }

  console.log(`\u2705 Successfully sent "${fileName}" to ${kindleEmail}`);
  console.log("");
  console.log("\u{1F4F1} Your document should appear on your Kindle shortly.");
  console.log("");
  console.log(
    "\u26A0\uFE0F  Reminder: Make sure your sender email is in the approved list:"
  );
  console.log(
    "   https://www.amazon.com/hz/mycd/myx#/home/settings/payment"
  );
  console.log(
    '   Go to "Personal Document Settings" \u2192 "Approved Personal Document E-mail List"'
  );
}

module.exports = { sendToKindle };
