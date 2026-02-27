import { execSync } from 'child_process';
import fs from 'fs';

/**
 * Check if a command exists in PATH
 */
export function commandExists(cmd) {
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
export function getInputType(input) {
  if (input.startsWith('http://') || input.startsWith('https://')) {
    return 'url';
  }
  if (input.toLowerCase().endsWith('.pdf')) {
    return 'pdf';
  }
  if (fs.existsSync(input)) {
    return 'file';
  }
  return 'unknown';
}

/**
 * Sanitize filename to be safe for filesystem
 */
export function sanitizeFilename(name) {
  return name
    .replace(/[<>:"/\\|?*\x00-\x1F]/g, '')
    .replace(/\s+/g, '_')
    .substring(0, 100);
}

/**
 * Escape text for YAML (handle quotes, newlines, etc.)
 */
export function escapeYaml(text) {
  if (!text) return '""';

  text = text
    .replace(/\\/g, '\\\\')
    .replace(/"/g, '\\"')
    .replace(/\n/g, ' ')
    .replace(/\r/g, '')
    .replace(/\t/g, ' ');

  return `"${text}"`;
}
