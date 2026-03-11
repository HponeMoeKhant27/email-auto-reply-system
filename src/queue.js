const { Queue, Worker } = require('bullmq');
const IORedis = require('ioredis');
const config = require('./config');
const logger = require('./logger');

const connection = new IORedis(config.redis.url, {
  maxRetriesPerRequest: null,
  enableReadyCheck: false
});

const queue = new Queue(config.queue.name, {
  connection,
  defaultJobOptions: {
    attempts: 5,
    backoff: {
      type: 'exponential',
      delay: 1000
    },
    removeOnComplete: 1000,
    removeOnFail: 1000
  }
});

const createWorker = (processor) => {
  const worker = new Worker(config.queue.name, processor, {
    connection,
    concurrency: config.queue.concurrency,
    limiter: config.queue.limiter
  });

  worker.on('completed', (job) => {
    logger.info({ jobId: job.id }, 'Job completed');
  });

  worker.on('failed', (job, err) => {
    logger.error({ jobId: job?.id, err }, 'Job failed');
  });

  worker.on('error', (err) => {
    logger.error({ err }, 'Worker error');
  });

  return worker;
};

module.exports = {
  queue,
  createWorker,
  connection
};

