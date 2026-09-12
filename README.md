<div align="center">

# ✉️ Email Jachai

### *High-Performance, Distributed Email Verification & Deliverability SaaS Platform*

[![License: MIT](https://img.shields.io/badge/License-MIT-blue.svg?style=for-the-badge)](LICENSE)
[![Go Version](https://img.shields.io/badge/Go-1.22+-00ADD8?style=for-the-badge&logo=go&logoColor=white)](https://golang.org)
[![Next.js](https://img.shields.io/badge/Next.js-14+-000000?style=for-the-badge&logo=nextdotjs&logoColor=white)](https://nextjs.org)
[![Docker](https://img.shields.io/badge/Docker-Ready-2496ED?style=for-the-badge&logo=docker&logoColor=white)](https://www.docker.com)
[![PostgreSQL](https://img.shields.io/badge/PostgreSQL-16+-4169E1?style=for-the-badge&logo=postgresql&logoColor=white)](https://www.postgresql.org)
[![Redis](https://img.shields.io/badge/Redis-7+-DC382D?style=for-the-badge&logo=redis&logoColor=white)](https://redis.io)

---

**Email Jachai** is a modern, enterprise-grade, distributed email verification platform designed to clean mailing lists, eliminate bounce rates, protect sender reputation, and scale to millions of email verifications with sub-second single checks and high-throughput background bulk processing.

[Features](#-key-features) • [Architecture](#%EF%B8%8F-system-architecture) • [Quick Start](#-quick-start-with-docker-compose) • [Manual Setup](#%EF%B8%8F-local-development-setup) • [Configuration](#%EF%B8%8F-environment-variables) • [Contributing](CONTRIBUTING.md) • [License](LICENSE)

</div>

---

> [!TIP]
> ### 🛠️ Need Help with VPS / Server Installation?
> **If you are not able to install or configure Email Jachai on your VPS or server, you can hire the owner/developer who built this platform for complete setup, deployment, and customization support.**  
> 
> 📩 **Direct Email:** [fr.nirobsohel@gmail.com](mailto:fr.nirobsohel@gmail.com)  
> 💬 **LinkedIn:** [Sohel Akter](https://www.linkedin.com/in/freelancernirobsohel/)  
> 📺 **YouTube:** [@frnirobsohel](https://www.youtube.com/@frnirobsohel)

---

## ⚡ Key Features

- **Multi-Stage Deep Verification Pipeline**:
  - **Syntax & Format Validation**: RFC 5322 regex checks, length constraints, illegal character detection.
  - **DNS & MX Record Lookup**: Ultra-fast concurrent DNS resolution with fallback logic.
  - **Disposable & Temporary Domain Detection**: Cached detection of 30,000+ throwaway and burner email providers.
  - **Role-Based Account Detection**: Identifies generic addresses like `admin@`, `support@`, `billing@`, and `info@`.
  - **Smart SMTP Handshake**: Performs non-intrusive `HELO`/`EHLO` $\to$ `MAIL FROM` $\to$ `RCPT TO` probes without sending actual emails.
  - **Catch-All / Accept-All Domain Detection**: Employs random string probing to identify servers that deceptively accept any mailbox.
  - **Greylisting & Transient Error Handling**: Automatic retry policies for delayed server responses.
- **Distributed Worker Swarm**:
  - Worker cluster managed via Redis and Asynq with failover handover, automatic worker node registration, heartbeat monitoring, and crash watchdogs.
- **High-Throughput Bulk Processing**:
  - Streamed parsing for massive CSV and TXT files, chunked queue execution, and downloadable structured reports.
- **Real-Time Progress Streaming**:
  - Instant UI feedback via WebSockets and Server-Sent Events (SSE) during both single verification and long-running bulk jobs.
- **Role-Based Access Control (RBAC)**:
  - Supports Guest/Public users, Registered Users, VIP/Enterprise clients, Resellers (credit transfers & sub-accounts), and Super Admins.
- **Modern Responsive Dashboard**:
  - Clean, dark-mode ready Next.js 14 interface with interactive charts, audit logs, credit usage analytics, and API key management.

---

## 🏗️ System Architecture

```mermaid
graph TD
    Client[Browser / Client API] -->|HTTPS / WSS| Frontend[Frontend BFF - Next.js 14]
    Frontend -->|REST / WebSocket| Backend[Backend API - Go Gin]
    Backend -->|Auth, Jobs, Ledger| Postgres[(PostgreSQL 16)]
    Backend -->|Enqueue Tasks| Redis[(Redis 7 - Asynq Queues)]
    
    subgraph Worker Cluster [Distributed Worker Cluster]
        Worker1[Go Worker Node 1]
        Worker2[Go Worker Node 2]
        WorkerN[Go Worker Node N]
    end
    
    Redis --> Worker1
    Redis --> Worker2
    Redis --> WorkerN
    
    Worker1 -->|DNS / MX / SMTP Probes| ExternalMail[Target Mail Servers]
    Worker2 -->|DNS / MX / SMTP Probes| ExternalMail
    WorkerN -->|DNS / MX / SMTP Probes| ExternalMail

    Worker1 -->|Report Batch Results| Backend
    Worker2 -->|Report Batch Results| Backend
    WorkerN -->|Report Batch Results| Backend
```

---

## 🚀 Quick Start with Docker Compose

The fastest way to spin up the complete environment (Postgres, Redis, Backend API, Worker, and Next.js Frontend) is using Docker Compose:

### 1. Clone the repository
```bash
git clone https://github.com/frnirobsohel/emailjachai.git
cd emailjachai
```

### 2. Prepare environment files
```bash
cp backend/.env.example backend/.env
cp frontend/.env.example frontend/.env
cp worker/.env.example worker/.env
```

### 3. Launch the stack
```bash
docker compose up --build
```

The services will become available at:
- **Frontend Dashboard**: [http://localhost:3000](http://localhost:3000)
- **Backend REST API**: [http://localhost:8000](http://localhost:8000)
- **PostgreSQL**: `localhost:5432`
- **Redis**: `localhost:6379`

---

## 🛠️ Local Development Setup

If you prefer to run services individually on your host machine:

### Prerequisites
- [Go 1.22+](https://golang.org/dl/)
- [Node.js 20+ & npm](https://nodejs.org/)
- [PostgreSQL 16+](https://www.postgresql.org/)
- [Redis 7+](https://redis.io/)

### 1. Backend Service (Go)
```bash
cd backend
cp .env.example .env
# Edit .env with your PostgreSQL and Redis connection strings
go mod download
go run ./cmd/api
```
The API server starts on `:8000`.

### 2. Background Worker (Go)
```bash
cd worker
cp .env.example .env
# Ensure Redis and API connection details match backend
go mod download
go run ./cmd/worker
```

### 3. Frontend Web App (Next.js)
```bash
cd frontend
cp .env.example .env
npm install
npm run dev
```
The application will run on [http://localhost:3000](http://localhost:3000).

---

## ⚙️ Environment Variables

### Backend (`backend/.env`)
| Variable | Description | Default / Example |
| :--- | :--- | :--- |
| `PORT` | API listening port | `8000` |
| `GO_ENV` | Environment (`development` / `production`) | `development` |
| `DATABASE_URL` | PostgreSQL connection string | `postgres://ejp:ejp@localhost:5432/ejp?sslmode=disable` |
| `REDIS_URL` | Redis connection string | `redis://localhost:6379/0` |
| `JWT_SECRET` | Secret key used for signing JWT tokens | `<strong-random-secret>` |
| `WORKER_API_KEY` | Shared secret for worker-to-backend internal reporting | `<worker-auth-secret>` |
| `FRONTEND_URL` | Allowed frontend URL for CORS | `http://localhost:3000` |
| `SMTP_VERIFY_TIMEOUT_SEC` | Timeout in seconds for SMTP handshakes | `135` |

### Worker (`worker/.env`)
| Variable | Description | Default / Example |
| :--- | :--- | :--- |
| `REDIS_URL` | Redis connection for Asynq job consumption | `redis://localhost:6379/0` |
| `API_BASE_URL` | Backend internal API endpoint | `http://localhost:8000/api/v1/internal` |
| `WORKER_API_KEY` | Shared internal API key | `<worker-auth-secret>` |
| `WORKER_SERVER_NAME` | Unique name/hostname for this worker instance | `worker-node-1` |
| `SMTP_VERIFY_TIMEOUT_SEC` | SMTP handshake socket timeout in seconds | `135` |

### Frontend (`frontend/.env`)
| Variable | Description | Default / Example |
| :--- | :--- | :--- |
| `API_BASE_URL` | Backend API URL for server-side requests | `http://localhost:8000/api/v1` |
| `NEXT_PUBLIC_WS_URL` | WebSocket endpoint for browser connections | `ws://localhost:8000/api/v1/ws` |
| `JWT_SECRET` | Secret used to decrypt/verify session cookies | `<matching-backend-jwt-secret>` |

---

## 🧪 Testing

### Backend & Worker Tests (Go)
```bash
# Run backend tests
cd backend && go test -v ./...

# Run worker tests
cd worker && go test -v ./...
```

### Frontend Tests & Linting (Next.js)
```bash
cd frontend
npm run lint
npm test
```

---

## 🔒 Security & Vulnerability Reporting

Security is paramount for an email verification tool handling network-level SMTP interactions. If you discover a security vulnerability, please review our [SECURITY.md](SECURITY.md) and report it privately to `fr.nirobsohel@gmail.com`. Please **do not** open public issues for sensitive security bugs.

---

## 🤝 Contributing

We welcome contributions from the community! Please check out [CONTRIBUTING.md](CONTRIBUTING.md) for details on our code of conduct, development guidelines, and pull request workflow.

1. Fork the Project
2. Create your Feature Branch (`git checkout -b feat/amazing-feature`)
3. Commit your Changes (`git commit -m 'feat: add amazing feature'`)
4. Push to the Branch (`git push origin feat/amazing-feature`)
5. Open a Pull Request

---

## 📄 License

This project is licensed under the **MIT License** — see the [LICENSE](LICENSE) file for details.

---

<div align="center">

Made with ❤️ by [Sohel Akter](https://github.com/frnirobsohel)

[![LinkedIn](https://img.shields.io/badge/LinkedIn-Profile-0A66C2?style=flat&logo=linkedin)](https://www.linkedin.com/in/freelancernirobsohel/)
[![YouTube](https://img.shields.io/badge/YouTube-Channel-FF0000?style=flat&logo=youtube)](https://www.youtube.com/@frnirobsohel)

</div>
