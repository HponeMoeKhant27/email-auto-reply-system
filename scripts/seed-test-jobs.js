#!/usr/bin/env node
/**
 * Enqueue many auto-reply jobs to test the system with "many users" without
 * needing real people to send emails. Requires Redis and the same .env as the app.
 *
 * Usage:
 *   node scripts/seed-test-jobs.js <count> [email1 email2 ...]
 *
 * Examples:
 *   node scripts/seed-test-jobs.js 20
 *     → 20 jobs to test-user-1@example.com, test-user-2@example.com, ...
 *   node scripts/seed-test-jobs.js 5 you@example.com
 *     → 5 jobs, all to you@example.com (for safe testing)
 *   node scripts/seed-test-jobs.js 10 a@x.com b@x.com c@x.com
 *     → 10 jobs, cycling through the 3 addresses
 */

require('dotenv').config();
const config = require('../src/config');
const { queue } = require('../src/queue');
const { isValidEmail } = require('../src/emailValidation');

const count = Math.min(Math.max(1, parseInt(process.argv[2], 10) || 10), 500);
const rawEmails = process.argv.slice(3).filter((a) => a && a.includes('@'));
const customEmails = rawEmails.filter((e) => {
  if (!isValidEmail(e)) {
    console.warn(`Warning: skipping invalid email "${e}" (use a full domain e.g. user@gmail.com, not @.com)`);
    return false;
  }
  return true;
});
if (rawEmails.length > 0 && customEmails.length === 0) {
  console.error('No valid custom emails. Fix addresses and re-run.');
  process.exit(1);
}

function getToAddress(index) {
  if (customEmails.length === 1) return customEmails[0];
  if (customEmails.length > 1) return customEmails[index % customEmails.length];
  return `test-user-${index + 1}@example.com`;
}

async function main() {
  console.log(`Enqueuing ${count} test auto-reply jobs...`);
  const jobDelayMs = config.queue.jobDelayMs || 0;

  for (let i = 0; i < count; i++) {
    const to = getToAddress(i);
    const delayMs = jobDelayMs * i;
    await queue.add(
      'send-auto-reply',
      {
        to,
        subject: `Test message ${i + 1}`,
        messageId: `<test-${Date.now()}-${i}@local>`
      },
      delayMs > 0 ? { delay: delayMs } : {}
    );
  }

  console.log(`Done. ${count} jobs added. Start the app (npm run dev) to process them.`);
  process.exit(0);
}

main().catch((err) => {
  console.error(err);
  process.exit(1);
});
