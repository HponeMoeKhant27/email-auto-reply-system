const { ImapFlow } = require('imapflow');
const config = require('./config');
const logger = require('./logger');
const { queue, connection } = require('./queue');
const { isValidEmail } = require('./emailValidation');

const PROCESSED_SET_KEY = 'email-auto-reply:processed-message-ids';

async function alreadyProcessed(messageId) {
  if (!messageId) return false;
  const exists = await connection.sismember(PROCESSED_SET_KEY, messageId);
  return Boolean(exists);
}

async function markProcessed(messageId) {
  if (!messageId) return;
  await connection.sadd(PROCESSED_SET_KEY, messageId);
}

async function incrementSenderCount(sender) {
  const key = `email-auto-reply:sender:${sender}`;
  const ttlSeconds = Math.ceil(config.perSender.windowMs / 1000);

  const pipeline = connection.multi();
  pipeline.incr(key);
  pipeline.expire(key, ttlSeconds, 'NX');
  const [count] = await pipeline.exec();
  return Number(count[1] || 0);
}

async function pollOnce(client) {
  await client.mailboxOpen(config.imap.mailbox);

  const searchCriteria = { seen: false };
  const messages = [];

  for await (const message of client.fetch(searchCriteria, {
    uid: true,
    envelope: true,
    flags: true,
    source: false
  })) {
    messages.push(message);
  }

  if (!messages.length) {
    logger.debug('No new unread messages found');
    return;
  }

  const maxPerPoll = config.imap.maxMessagesPerPoll;
  const batch = maxPerPoll > 0 ? messages.slice(0, maxPerPoll) : messages;
  if (batch.length < messages.length) {
    logger.info(
      { processed: batch.length, deferred: messages.length - batch.length },
      'Limiting messages per poll; rest will be processed next cycle'
    );
  } else {
    logger.info({ count: batch.length }, 'Found unread messages');
  }

  let enqueuedInBatch = 0;
  for (const msg of batch) {
    const messageId = msg.envelope?.messageId;
    const fromAddress = msg.envelope?.from?.[0]?.address;

    if (!fromAddress) {
      logger.warn('Skipping message without from address');
      continue;
    }

    const fromLower = fromAddress.toLowerCase();
    const isBlocked = config.skipAddresses.some((skip) => fromLower.includes(skip));
    if (isBlocked) {
      logger.debug({ from: fromAddress }, 'Skipping blocked sender (bounce/system address)');
      await client.messageFlagsAdd(msg.uid, ['\\Seen']);
      await markProcessed(messageId);
      continue;
    }
    if (!isValidEmail(fromAddress)) {
      logger.debug({ from: fromAddress }, 'Skipping invalid sender address');
      await client.messageFlagsAdd(msg.uid, ['\\Seen']);
      await markProcessed(messageId);
      continue;
    }

    if (await alreadyProcessed(messageId)) {
      logger.debug({ messageId }, 'Skipping already processed message');
      continue;
    }

    const count = await incrementSenderCount(fromAddress);
    if (count > config.perSender.maxReplies) {
      logger.warn(
        { from: fromAddress, count },
        'Per-sender reply limit exceeded; skipping auto-reply'
      );
      await markProcessed(messageId);
      continue;
    }

    const delayMs = config.queue.jobDelayMs * enqueuedInBatch;
    await queue.add(
      'send-auto-reply',
      {
        to: fromAddress,
        subject: msg.envelope.subject,
        messageId
      },
      delayMs > 0 ? { delay: delayMs } : {}
    );
    enqueuedInBatch += 1;

    await client.messageFlagsAdd(msg.uid, ['\\Seen']);
    await markProcessed(messageId);

    logger.info({ to: fromAddress, messageId }, 'Enqueued auto-reply job');
  }
}

async function startImapPoller() {
  let backoffMs = 5000;

  while (true) {
    const client = new ImapFlow({
      host: config.imap.host,
      port: config.imap.port,
      secure: config.imap.secure,
      auth: config.imap.auth,
      logger: false
    });

    try {
      logger.info('Connecting to IMAP server');
      await client.connect();
      logger.info('Connected to IMAP server');

      while (!client.closed) {
        try {
          await pollOnce(client);
        } catch (err) {
          logger.error({ err }, 'Error while polling mailbox');
        }

        await new Promise((resolve) =>
          setTimeout(resolve, config.imap.pollIntervalMs)
        );
      }
    } catch (err) {
      logger.error({ err }, 'IMAP connection error, will retry');
    } finally {
      try {
        if (!client.closed) {
          await client.logout();
        }
      } catch (err) {
        logger.error({ err }, 'Error during IMAP logout');
      }
    }

    logger.info({ backoffMs }, 'Reconnecting to IMAP after backoff');
    await new Promise((resolve) => setTimeout(resolve, backoffMs));
    backoffMs = Math.min(backoffMs * 2, 300000);
  }
}

module.exports = {
  startImapPoller
};

