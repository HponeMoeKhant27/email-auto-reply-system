### Email Auto Reply System

**Goal**: A robust, containerized email auto-reply service built with **Node.js**, **Redis**, **Docker**, and **Docker Compose**. It polls an IMAP inbox, enqueues auto-reply jobs into Redis, and processes them with a rate-limited worker to avoid overload and mass-reply attacks.

This implementation is inspired by the reference project `dfios/email-auto-reply` but redesigned for:

- **Long-term stable operation**
- **Redis-backed queueing and retries**
- **Global and per-sender rate limiting**
- **Containerized deployment**

---

### High-Level Architecture

- **IMAP Poller (`src/imapPoller.js`)**
  - Connects to the IMAP server using `imapflow`.
  - Periodically polls for **unread** messages in a configured mailbox.
  - For each new message:
    - Skips messages already marked as processed (tracked in Redis by `messageId`).
    - Enforces **per-sender limits** using Redis counters to prevent reply storms.
    - Enqueues a `send-auto-reply` job into a Redis-backed queue (BullMQ).
    - Marks the email as `\Seen` and as processed.
  - Runs inside a retry loop with exponential backoff for robust long-term operation.

- **Redis Queue & Worker (`src/queue.js`, `src/worker.js`)**
  - Queue is implemented with **BullMQ** using Redis as the backend.
  - Jobs have retry/backoff settings and are auto-cleaned from Redis.
  - A `Worker` processes `send-auto-reply` jobs:
    - Builds a reply using `src/replyTemplate.js`.
    - Sends email via `nodemailer` and the configured SMTP server.
  - Global **rate limiting** is handled via BullMQ limiter (max jobs per duration).

- **Rate Limiting & Abuse Protection**
  - **Global rate limit**: configured via `QUEUE_RATE_LIMIT_MAX` and `QUEUE_RATE_LIMIT_DURATION_MS`.
  - **Per-sender limit**: Redis counters per sender over a sliding time window:
    - `PER_SENDER_MAX_REPLIES` replies allowed per `PER_SENDER_WINDOW_MS`.
    - When the limit is exceeded, new emails from that sender are marked processed but not replied to.

---

### Configuration

Configuration is centralized in `src/config.js` and primarily driven by environment variables.

Copy `.env.example` to `.env` and fill in your values:

```bash
cp .env.example .env
```

**Required IMAP variables**

- `IMAP_HOST` – IMAP server host
- `IMAP_PORT` – IMAP port (default `993`)
- `IMAP_SECURE` – `true`/`false` for TLS
- `IMAP_USER` – IMAP username
- `IMAP_PASSWORD` – IMAP password
- `IMAP_MAILBOX` – mailbox name (default `INBOX`)
- `IMAP_POLL_INTERVAL_MS` – poll interval in ms (default `30000`)

**Required SMTP variables**

- `SMTP_HOST` – SMTP server host
- `SMTP_PORT` – SMTP port (default `587`)
- `SMTP_SECURE` – `true`/`false` for TLS
- `SMTP_USER` – SMTP username
- `SMTP_PASSWORD` – SMTP password
- `REPLY_FROM` – from address used for replies (e.g. `"Auto Reply <no-reply@example.com>"`)

**Redis & Queue**

- `REDIS_URL` – Redis connection string (default `redis://redis:6379/0` in Docker)
- `QUEUE_NAME` – Queue name (default `email-replies`)
- `QUEUE_CONCURRENCY` – Worker concurrency (default `5`)
- `QUEUE_RATE_LIMIT_MAX` – Max jobs per window (default `30`)
- `QUEUE_RATE_LIMIT_DURATION_MS` – Window size in ms (default `60000`)

**Per-sender Protection**

- `PER_SENDER_MAX_REPLIES` – Max replies per sender per window (default `10`)
- `PER_SENDER_WINDOW_MS` – Window size in ms (default `3600000` – 1 hour)

---

### Running with Docker Compose

Prerequisites:

- Docker
- Docker Compose

Steps:

1. **Copy and edit environment file**

   ```bash
   cp .env.example .env
   # edit .env with your IMAP/SMTP details
   ```

2. **Start services**

   ```bash
   docker-compose up --build
   ```

   This will start:

   - `redis`: Redis 7 instance
   - `app`: Node.js email auto-reply service

3. **Detach (optional)**

   ```bash
   docker-compose up -d --build
   ```

4. **View logs**

   ```bash
   docker-compose logs -f app
   ```

---

### Running Locally (Without Docker)

1. Install Node.js (v18+ recommended).
2. **Start Redis** (required). For example:

   ```bash
   docker run -d -p 6379:6379 --name redis redis:7-alpine
   ```

   Or use a local Redis install (e.g. `brew install redis && brew services start redis`).

3. Install dependencies:

   ```bash
   npm install
   ```

4. Create `.env` and set **REDIS_URL for local use**:

   ```bash
   cp .env.example .env
   # Set REDIS_URL=redis://localhost:6379/0 (not redis://redis:6379/0)
   # Fill in real IMAP_* and SMTP_* values (not example.com placeholders)
   ```

5. Start the app:

   ```bash
   npm start
   # or: npm run dev
   ```

---

### How This Addresses the Original Issues

- **Stability & Long-term Operation**
  - IMAP connection is wrapped in a loop with reconnection and exponential backoff.
  - Queue processor is decoupled from IMAP polling, avoiding blocking or heavy operations in the poll loop.
  - BullMQ and Redis provide durable job storage and retries.

- **Queue Management & Rate Control**
  - All outgoing emails are scheduled as jobs in Redis (BullMQ).
  - Jobs have retry/backoff behavior and are globally rate-limited.
  - Per-sender counters further protect against abuse.

- **Prevention of Mass Reply Attacks**
  - Redis-based per-sender windowed counters block further replies when a sender exceeds `PER_SENDER_MAX_REPLIES` in `PER_SENDER_WINDOW_MS`.
  - Messages from such senders are marked processed but not replied to, preventing loops and spam bursts.

---

### Notes & Extensions

- `src/replyTemplate.js` can be customized for more advanced reply content (HTML, different templates per mailbox, etc.).
- For observability, you can attach a BullMQ UI dashboard to the Redis instance to inspect jobs.
- In production, you may choose to run the IMAP poller and worker in separate containers/services reusing the same queue implementation.

