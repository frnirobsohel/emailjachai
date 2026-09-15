# Email Jachai — Production Architecture

This document describes the high-level architecture, pipeline flows, and component interactions of Email Jachai.

---

## 1. System Components

```
                ┌────────────────────────────────────────┐
                │          Caddy Reverse Proxy           │
                │        (Auto SSL / HTTP/2 & 3)         │
                └───────────────────┬────────────────────┘
                                    │
                  ┌─────────────────┴─────────────────┐
                  │                                   │
                  ▼                                   ▼
        ┌──────────────────┐               ┌──────────────────┐
        │  Next.js App     │               │  Go REST API     │
        │  (Frontend UI)   │               │  (ejp-backend)   │
        └──────────────────┘               └─────────┬────────┘
                                                     │
                             ┌───────────────────────┴───────────────────────┐
                             │                                               │
                             ▼                                               ▼
                   ┌───────────────────┐                           ┌───────────────────┐
                   │    PostgreSQL     │                           │   Redis Broker    │
                   │ (Data & Results)  │                           │  & Domain Stats   │
                   └───────────────────┘                           └─────────┬─────────┘
                                                                             │
                                                                             ▼
                                                                   ┌───────────────────┐
                                                                   │    Go Workers     │
                                                                   │   (ejp-worker)    │
                                                                   │ (SMTP / Multi-IP) │
                                                                   └───────────────────┘
```

---

## 2. Core Flows

### A. Instant Single Verification (Interactive Fast-Path)
1. User or API client submits an email to `/api/v1/jobs/verify-single`.
2. **Cache Check**: If the email was verified recently, returns in `< 1ms` directly from cache.
3. **Non-Blocking Fast-Path**: Syntax check, disposable email check, and DNS MX lookups execute without locking any SMTP connection semaphores. Invalid or disposable addresses return in `< 2ms`.
4. **Bounded Timeout**: If live SMTP probing is required, it runs with a 20-second bounded deadline (`SINGLE_VERIFY_TIMEOUT_SEC`) to prevent HTTP gateway timeouts.
5. Credits are atomically deducted and results are broadcast via WebSocket to the user's dashboard.

### B. High-Volume Bulk Verification (Chunk Streaming)
1. User uploads a file with 1,000 to 1,000,000+ emails.
2. `streamBulkSourceEmailsFiltered`: The backend reads the file line-by-line via streaming, filtering syntax in a single pass to minimize memory usage.
3. Emails are grouped into chunks (e.g. 100 emails per chunk) and dispatched into priority queues in Redis (`critical`, `default`, `low`).
4. Workers process chunks concurrently using domain-aware throttling (`worker/internal/scheduler`).
5. Destination mail servers are protected from rate-bans via Redis domain intelligence and cooldown gates.
6. When a job completes, a webhook notification is automatically dispatched with exponential backoff retries (`worker/internal/retry`).

### C. Multi-IP Egress Pool
- When verifying enterprise volumes, workers rotate outgoing TCP connections on port 25 across multiple assigned IP addresses (`worker/internal/egress`).
- If an individual IP experiences temporary greylisting (`421`), it is cooled down individually while other IPs in the pool continue processing.
