import { describe, it, expect, vi, beforeEach } from 'vitest';
import { loadConfig } from './config.js';

describe('loadConfig', () => {
  beforeEach(() => {
    vi.unstubAllEnvs();
  });

  it('reads KINDLE_EMAIL from env', () => {
    vi.stubEnv('KINDLE_EMAIL', 'test@kindle.com');
    vi.stubEnv('SMTP_USER', 'user@gmail.com');
    vi.stubEnv('SMTP_PASSWORD', 'pass123');
    const config = loadConfig();
    expect(config.kindleEmail).toBe('test@kindle.com');
  });

  it('uses default SMTP_SERVER when not set', () => {
    delete process.env.SMTP_SERVER;
    const config = loadConfig();
    expect(config.smtp.host).toBe('smtp.gmail.com');
  });

  it('uses custom SMTP_SERVER when set', () => {
    vi.stubEnv('SMTP_SERVER', 'smtp.custom.com');
    const config = loadConfig();
    expect(config.smtp.host).toBe('smtp.custom.com');
  });

  it('uses default SMTP_PORT 587 when not set', () => {
    delete process.env.SMTP_PORT;
    const config = loadConfig();
    expect(config.smtp.port).toBe(587);
  });

  it('parses custom SMTP_PORT', () => {
    vi.stubEnv('SMTP_PORT', '465');
    const config = loadConfig();
    expect(config.smtp.port).toBe(465);
  });

  it('sets secure to false', () => {
    const config = loadConfig();
    expect(config.smtp.secure).toBe(false);
  });

  it('reads SMTP_USER and SMTP_PASSWORD', () => {
    vi.stubEnv('SMTP_USER', 'user@gmail.com');
    vi.stubEnv('SMTP_PASSWORD', 'secret');
    const config = loadConfig();
    expect(config.smtp.auth.user).toBe('user@gmail.com');
    expect(config.smtp.auth.pass).toBe('secret');
  });

  it('uses SMTP_USER as fromEmail when FROM_EMAIL not set', () => {
    delete process.env.FROM_EMAIL;
    vi.stubEnv('SMTP_USER', 'user@gmail.com');
    const config = loadConfig();
    expect(config.fromEmail).toBe('user@gmail.com');
  });

  it('uses FROM_EMAIL when set', () => {
    vi.stubEnv('FROM_EMAIL', 'custom@example.com');
    vi.stubEnv('SMTP_USER', 'user@gmail.com');
    const config = loadConfig();
    expect(config.fromEmail).toBe('custom@example.com');
  });
});
