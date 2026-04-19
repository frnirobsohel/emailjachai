# EmailJachai Pro - Enterprise Email Verification SaaS

This project is EmailJachai Pro, a high-performance, enterprise-grade Email Verification SaaS designed for horizontal scalability, capable of handling millions of verifications per day. The architecture follows a stateless-worker model with a centralized result authority.

## 🌐 Deployment Overview

- **Main Domain (`yourdomain.com`)**: Next.js Frontend.
- **API Path (`yourdomain.com/api`)**: Core PHP Backend Backend file Structure Linked Laravel file folder structure bt make sure it's not laravel.(Central Authority).
- **Worker Clusters**: Distributed, stateless PHP workers connected via API Key.

Designed for **One-Click Deployment** where the frontend and main API reside within a single domain root.

## 📚 Deployment Guides

- Full Guide: `docs/deployment.md`

---

## 🏗️ System Architecture

The system is split into two primary components:

1.  **Main API Server (Authority)**:
    - Handles User authentication, Job management, and Result storage.
    - Stores final verification data in **NDJSON** format for high-speed streaming.
    - Manages the central Job Queue (File/Redis/SQS).
2.  **Worker Servers (Processing)**:
    - Stateless nodes that fetch jobs from the queue.
    - Perform deep SMTP verification (Syntax, MX, Handshake, Catch-all).
    - **Crucial Rule**: Workers never store results. They push data back to the Main API immediately.

---

## 🔄 Core Workflow

### 1. Job Creation
When a user uploads a list, the **Main Server** performs initial pre-processing:
- **Syntax Check**: Basic regex validation.
- **Role Detection**: Identifies `admin@`, `support@`, etc.
- **Disposable Check**: Flags temporary email providers.
- **Free Provider Detection**: Flags `@gmail.com`, `@yahoo.com`, etc.

The job is then assigned a `jobId` and pushed to the **Queue**.

### 2. Worker Processing
Workers pull chunks of 500–1,000 emails and execute:
- **MX Lookup**: Verifying mail server records.
- **SMTP Handshake**: Real-time connection to remote mail servers.
- **Catch-all Detection**: Identifying servers that accept all mail.

### 3. Result Push (Authority Model)
Workers `POST` results to the Main API in real-time or batches.
- **Endpoint**: `/api/result_push.php`
- **Payload**:
  ```json
  {
    "jobId": "abc-123",
    "email": "user@example.com",
    "status": "deliverable",
    "catch_all": false,
    "score": 95
  }
  ```

---

## 💾 Storage Strategy (NDJSON)

To prevent database bottlenecks, results are stored in **NDJSON (Newline Delimited JSON)** files.
- **Path**: `storage/results/{jobId}.ndjson`
- **Example**:
  ```json
  {"email":"a@test.com","status":"valid"}
  {"email":"b@test.com","status":"invalid"}
  ```
**Benefits**:
- **O(1) Append Speed**: Millions of rows handled without database lag.
- **Streaming Downloads**: Users can download results instantly via partial file reads.
- **Persistence**: Results are safe on the Main Server even if workers go offline.

---

## ⚡ Performance & Scalability

| Nodes | Estimated Capacity | Throughput |
| :--- | :--- | :--- |
| **1 Worker** | 100k - 300k / day | ~10k / hour |
| **10 Workers** | 2M - 3M / day | ~100k / hour |
| **50 Workers** | 10M+ / day | ~400k+ / hour |

*Note: Performance is limited by SMTP latency and target server rate-limits, not CPU/RAM.*

---

## 🔐 Security & Fault Tolerance

- **Authentication**: API Key per user + Rate Limiting.
- **Worker Auth**: Unique tokens for worker-to-main communication.
- **Stateless Workers**: If a worker crashes, the job is automatically retried by another node.
- **Authority Consistency**: The Main Server is the single source of truth for all data.

---

## �️ Tech Stack

- **Frontend**: Next.js (App Router), Tailwind CSS, Recharts.
- **API**: Core PHP (Optimized for speed and low overhead).
- **Storage**: MySQL (Metadata) + NDJSON (Bulk Results).
- **Queue**: File-based (Standard) / Redis or SQS (Enterprise).

---

## 📌 Development Guidelines

> [!IMPORTANT]
> **RULE #1**: Workers **MUST NOT** store verification results locally.
> **RULE #2**: All verification results must be pushed to the Main API immediately.
> **RULE #3**: Follow the NDJSON storage pattern strictly to ensure database performance.

### ✅ Baseline Smoke Checks

```bash
php api/tests/run_smoke.php
cd frontend && npm run lint && npm run build
```

---

## � Roadmap
- [ ] Real-time progress tracking via WebSockets.
- [ ] AI-driven deliverability scoring.
- [ ] Automated subscription billing system.
- [ ] Multi-region worker deployment.

---

## 👨‍💻 Author

**Sohel Akter**
- GitHub: [@frnirobsohel](https://github.com/frnirobsohel)
- Website: [YourWebsite.com](https://yourwebsite.com)

## 📄 License

This project is licensed under the **Proprietary License**. See the [LICENSE](LICENSE) file for details.
