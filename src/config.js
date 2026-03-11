require('dotenv').config();

const requiredEnv = (key) => {
  const value = process.env[key];
  if (!value) {
    throw new Error(`Missing required environment variable: ${key}`);
  }
  return value;
};

const config = {
  env: process.env.NODE_ENV || 'production',
  imap: {
    host: requiredEnv('IMAP_HOST'),
    port: Number(process.env.IMAP_PORT || 993),
    secure: process.env.IMAP_SECURE !== 'false',
    auth: {
      user: requiredEnv('IMAP_USER'),
      pass: requiredEnv('IMAP_PASSWORD')
    },
    mailbox: process.env.IMAP_MAILBOX || 'INBOX',
    pollIntervalMs: Number(process.env.IMAP_POLL_INTERVAL_MS || 30000),
    maxMessagesPerPoll: Number(process.env.IMAP_MAX_MESSAGES_PER_POLL || 50)
  },
  smtp: {
    host: requiredEnv('SMTP_HOST'),
    port: Number(process.env.SMTP_PORT || 587),
    secure: process.env.SMTP_SECURE === 'true',
    auth: {
      user: requiredEnv('SMTP_USER'),
      pass: requiredEnv('SMTP_PASSWORD')
    },
    from: requiredEnv('REPLY_FROM')
  },
  redis: {
    url: process.env.REDIS_URL || 'redis://redis:6379/0'
  },
  queue: {
    name: process.env.QUEUE_NAME || 'email-replies',
    concurrency: Number(process.env.QUEUE_CONCURRENCY || 5),
    limiter: {
      // Global rate limit: max X jobs per Y ms
      max: Number(process.env.QUEUE_RATE_LIMIT_MAX || 30),
      duration: Number(process.env.QUEUE_RATE_LIMIT_DURATION_MS || 60000)
    },
    // Stagger jobs: delay (ms) added per job in a batch (0 = no delay). Reduces SMTP burst.
    jobDelayMs: Number(process.env.QUEUE_JOB_DELAY_MS || 0)
  },
  perSender: {
    maxReplies: Number(process.env.PER_SENDER_MAX_REPLIES || 10),
    windowMs: Number(process.env.PER_SENDER_WINDOW_MS || 3600000)
  },
  // Addresses we never auto-reply to (bounce/system). Comma-separated, case-insensitive substring match.
  skipAddresses: (process.env.REPLY_SKIP_ADDRESSES || 'mailer-daemon@,postmaster@')
    .split(',')
    .map((s) => s.trim().toLowerCase())
    .filter(Boolean)
};

module.exports = config;
