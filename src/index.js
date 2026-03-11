const logger = require('./logger');
const { startImapPoller } = require('./imapPoller');
const { startWorker } = require('./worker');

async function main() {
  logger.info('Starting Email Auto Reply System');

  startWorker();
  await startImapPoller();
}

main().catch((err) => {
  // Top-level guard for unexpected failures; process manager / container restarts will bring it back.
  // Log and exit with non-zero code.
  // eslint-disable-next-line no-console
  console.error('Fatal error in main process', err);
  process.exit(1);
});

