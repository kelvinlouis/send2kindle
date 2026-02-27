import { describe, it, expect, vi, beforeEach } from 'vitest';
import fs from 'fs';
import nodemailer from 'nodemailer';
import { sendToKindle } from './mailer.js';

const mockSendMail = vi.fn();

vi.mock('fs', () => ({
  default: { existsSync: vi.fn(), readFileSync: vi.fn(() => Buffer.from('file-content')) },
  existsSync: vi.fn(),
  readFileSync: vi.fn(() => Buffer.from('file-content')),
}));

vi.mock('nodemailer', () => ({
  default: { createTransport: vi.fn(() => ({ sendMail: mockSendMail })) },
  createTransport: vi.fn(() => ({ sendMail: mockSendMail })),
}));

beforeEach(() => {
  vi.spyOn(console, 'log').mockImplementation(() => {});
  mockSendMail.mockResolvedValue({});
});

function makeConfig(overrides = {}) {
  return {
    kindleEmail: 'kindle@kindle.com',
    smtp: {
      host: 'smtp.gmail.com',
      port: 587,
      secure: false,
      auth: { user: 'user@gmail.com', pass: 'secret' },
    },
    fromEmail: 'user@gmail.com',
    ...overrides,
  };
}

describe('sendToKindle', () => {
  it('throws when kindleEmail is missing', async () => {
    await expect(
      sendToKindle('/file.epub', makeConfig({ kindleEmail: undefined })),
    ).rejects.toThrow('KINDLE_EMAIL is not set');
  });

  it('throws when SMTP user is missing', async () => {
    const config = makeConfig();
    config.smtp.auth.user = undefined;
    await expect(sendToKindle('/file.epub', config)).rejects.toThrow(
      'SMTP credentials not configured',
    );
  });

  it('throws when SMTP password is missing', async () => {
    const config = makeConfig();
    config.smtp.auth.pass = undefined;
    await expect(sendToKindle('/file.epub', config)).rejects.toThrow(
      'SMTP credentials not configured',
    );
  });

  it('throws when file does not exist', async () => {
    fs.existsSync.mockReturnValue(false);
    await expect(sendToKindle('/missing.epub', makeConfig())).rejects.toThrow(
      'File not found: /missing.epub',
    );
  });

  it('sends email successfully', async () => {
    fs.existsSync.mockReturnValue(true);
    await sendToKindle('/path/to/file.epub', makeConfig());
    expect(nodemailer.createTransport).toHaveBeenCalled();
    expect(mockSendMail).toHaveBeenCalledWith(
      expect.objectContaining({
        to: 'kindle@kindle.com',
        from: 'user@gmail.com',
        subject: 'Document for Kindle',
        attachments: expect.arrayContaining([expect.objectContaining({ filename: 'file.epub' })]),
      }),
    );
  });

  it('throws with EAUTH guidance on auth failure', async () => {
    fs.existsSync.mockReturnValue(true);
    const authError = new Error('Invalid login');
    authError.code = 'EAUTH';
    mockSendMail.mockRejectedValue(authError);
    await expect(sendToKindle('/file.epub', makeConfig())).rejects.toThrow(
      'Email authentication failed',
    );
  });

  it('throws generic error for non-EAUTH failures', async () => {
    fs.existsSync.mockReturnValue(true);
    mockSendMail.mockRejectedValue(new Error('Connection timeout'));
    await expect(sendToKindle('/file.epub', makeConfig())).rejects.toThrow(
      'Error sending email: Connection timeout',
    );
  });
});
