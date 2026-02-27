const path = require("path");

/**
 * Load configuration from environment variables.
 * KINDLE_EMAIL is required for sending but not for debug mode.
 */
function loadConfig() {
  return {
    kindleEmail: process.env.KINDLE_EMAIL,
    smtp: {
      host: process.env.SMTP_SERVER || "smtp.gmail.com",
      port: parseInt(process.env.SMTP_PORT || "587", 10),
      secure: false,
      auth: {
        user: process.env.SMTP_USER,
        pass: process.env.SMTP_PASSWORD,
      },
    },
    fromEmail: process.env.FROM_EMAIL || process.env.SMTP_USER,
  };
}

module.exports = { loadConfig };
