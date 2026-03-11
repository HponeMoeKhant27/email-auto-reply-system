const { ImapFlow } = require('imapflow');
const config = require('./config');
const logger = require('./logger');
const { queue, connection } = require('./queue');

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

  logger.info({ count: messages.length }, 'Found unread messages');

  for (const msg of messages) {
    const messageId = msg.envelope?.messageId;
    const fromAddress = msg.envelope?.from?.[0]?.address;

    if (!fromAddress) {
      logger.warn('Skipping message without from address');
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

    await queue.add('send-auto-reply', {
      to: fromAddress,
      subject: msg.envelope.subject,
      messageId
    });

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

