const nodemailer = require('nodemailer');
const config = require('./config');
const logger = require('./logger');
const { createWorker } = require('./queue');
const { buildAutoReply } = require('./replyTemplate');
const { isValidEmail } = require('./emailValidation');

const transporter = nodemailer.createTransport({
  host: config.smtp.host,
  port: config.smtp.port,
  secure: config.smtp.secure,
  auth: config.smtp.auth
});

function isBlockedAddress(email) {
  const lower = (email || '').toLowerCase();
  return config.skipAddresses.some((skip) => lower.includes(skip));
}

async function processJob(job) {
  const { to, subject, messageId } = job.data;
  if (isBlockedAddress(to)) {
    logger.info({ to }, 'Skipping send to blocked address (bounce/system)');
    return;
  }
  if (!isValidEmail(to)) {
    logger.warn({ to }, 'Skipping send to invalid email address (e.g. missing domain label)');
    return;
  }

  const reply = buildAutoReply(subject, null, to);

  const mailOptions = {
    from: config.smtp.from,
    to,
    subject: reply.subject,
    text: reply.text,
    headers: {
      'In-Reply-To': messageId,
      References: messageId
    }
  };

  logger.info({ to, subject }, 'Sending auto-reply email');

  await transporter.sendMail(mailOptions);
}

function startWorker() {
  createWorker(async (job) => {
    try {
      await processJob(job);
    } catch (err) {
      logger.error({ err, jobId: job.id }, 'Error processing auto-reply job');
      throw err;
    }
  });

  logger.info('Worker for auto-reply queue started');
}

module.exports = {
  startWorker
};

