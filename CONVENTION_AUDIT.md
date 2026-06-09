# EJP Project — Convention Audit Report

> Comparing actual code vs **Next.js App Router**, **Go Standard Layout**, and **ENGINEERING_ARCHITECTURE.md** rules.

---

## ✅ সারসংক্ষেপ (Overall Score)

| Layer | Score | Status |
|-------|-------|--------|
| **Frontend (Next.js)** | 9/10 | ✅ Excellent |
| **Backend (Go)** | 7/10 | ⚠️ Good with issues |
| **Worker (Go)** | 5/10 | ⚠️ Needs refactor |

---

## 1. 🟢 Frontend — Next.js App Router

### ✅ সঠিক যা আছে

| কনভেনশন | অবস্থা | বিবরণ |
|---------|--------|-------|
| App Router ব্যবহার | ✅ | `app/` directory — সঠিক |
| Route Groups | ✅ | `(auth)/`, `(dashboard)/` — সঠিক Next.js convention |
| Private Components | ✅ | `(dashboard)/_components/` — `_` prefix Next.js-এ private folder |
| `layout.tsx` প্রতিটি route group-এ | ✅ | `(auth)/layout.tsx`, `(dashboard)/layout.tsx` আছে |
| `page.tsx` naming | ✅ | সব page file সঠিক নামে |
| `next.config.ts` | ✅ | TypeScript config, `optimizePackageImports` set |
| Security Headers | ✅ | CSP, HSTS, X-Frame-Options সব আছে |
| `next/font/google` | ✅ | Geist font properly loaded |
| `generateMetadata()` | ✅ | Dynamic metadata with revalidate — সঠিক |
| `providers.tsx` আলাদা | ✅ | Client providers separated |
| API Routes naming | ✅ | `app/next-api/` এর ভেতরে সব |
| `lib/` structure | ✅ | `api-client/`, `services/`, `store/`, `constants/`, `helper/` |
| `hooks/` naming | ✅ | `use-admin.ts`, `use-credits.ts` — kebab-case ✅ |
| `types/` আলাদা | ✅ | Global interfaces centralized |

### ⚠️ সমস্যা যা আছে

| সমস্যা | ফাইল | পরামর্শ |
|--------|------|--------|
| ~~**`proxy.ts` root-এ**~~ | ✅ **সংশোধিত** — Next.js 16.2+ এ `middleware` convention deprecated, `proxy.ts` ই সঠিক convention। এটি root-এ থাকাই সঠিক। |
| **`server.js` root-এ** | `frontend/server.js` | ঠিক আছে custom server হলে, কিন্তু doc-এ উল্লেখ নেই |
| `styles/` folder নেই | Architecture বলেছে `styles/` থাকবে | `globals.css` এখন `app/` এ — আলাদা `styles/` নেই |
| ~~**`admin/admin-client.tsx` root-এ**~~ | ✅ **সংশোধিত** — `app/admin/_components/admin-client.tsx`-এ সরানো হয়েছে। |
| ~~**দুটি fetch call `layout.tsx` এ**~~ | ✅ **সংশোধিত** — `lib/services/settings.ts` তৈরি করে `getPublicSettings` utility-তে extract করা হয়েছে। |

---

## 2. ⚠️ Backend — Go (Gin Framework)

### ✅ সঠিক যা আছে

| কনভেনশন | অবস্থা | বিবরণ |
|---------|--------|-------|
| `cmd/api/main.go` structure | ✅ | Go standard layout অনুযায়ী সঠিক |
| `internal/` package | ✅ | সব business logic internal-এ |
| Handler → Service → Repo pattern | ✅ | `handler/`, `service/`, `repo/` আলাদা |
| `pkg/config`, `pkg/logger` | ✅ | Shared packages |
| `internal/api/` এ handler, middleware, request, presenter | ✅ | Architecture অনুযায়ী |
| `gin-gonic/gin` ব্যবহার | ✅ | Architecture-এ specified |
| `redis/go-redis/v9` | ✅ | ✅ |
| `go.uber.org/zap` | ✅ | ✅ |
| `golang-jwt/jwt/v5` | ✅ | ✅ |
| `gorilla/websocket` | ✅ | ✅ |
| `hibiken/asynq` | ✅ | ✅ |
| `miekg/dns` | ✅ | ✅ |
| `go-playground/validator/v10` | ✅ | ✅ |
| `migrations/` folder | ✅ | ✅ |
| `Makefile` | ✅ | ✅ |
| `internal/ws/` WebSocket hub | ✅ | Architecture অনুযায়ী |
| `internal/audit/` | ✅ | Architecture অনুযায়ী |
| `internal/license/` | ✅ | Architecture অনুযায়ী |

### ❌ সমস্যা যা আছে

| সমস্যা | বিবরণ | পরামর্শ |
|--------|-------|--------|
| ~~**`internal/tasks/` নামটা ভুল**~~ | ✅ **সংশোধিত** — `tasks/` নামটা **সঠিক**। এটা Asynq task payload factory (`email:verify`, `webhook:deliver`)। Architecture doc-এ `cron/` ভুল ছিল, সেটা আপডেট করা হয়েছে। |
| ~~**`internal/api/` তে `validator/` নেই**~~ | ✅ **সংশোধিত** — `internal/api/validator/validator.go` তৈরি হয়েছে। Tags: `not_disposable`, `valid_domain`, `ipv4_or_ipv6`, `strong_password`, `user_role` | — |
| ~~**`pkg/` অসম্পূর্ণ**~~ | ✅ **সংশোধিত** — `pkg/security/security.go` (API key, worker key, OTP, rate-limit keys) এবং `pkg/report/report.go` (CSV/NDJSON streaming writers + RowSource interface) তৈরি হয়েছে | — |
| ~~**`.exe` ফাইল committed**~~ | ✅ **সংশোধিত** — `.gitignore`-এ `tmp_*` এবং `backend/*.exe` pattern যোগ করা হয়েছে | — |
| ~~**`internal/helper/` একটু বেশি কাজ করছে কিনা দেখতে হবে**~~ | ✅ **বিশ্লেষণ সম্পন্ন** — `helper/` সঠিক আছে। Security functions (`crypto.go`, `hash.go`, `jwt.go`) `internal/`-এ থাকা যুক্তিসংগত কারণ এগুলো app-specific (JWT_SECRET env-dependent)। `pkg/security/` তে নতুন higher-level utilities যোগ হয়েছে (API key gen, OTP, rate-limit keys) | — |
| ~~**`jackc/pgx/v5` indirect**~~ | ✅ **সংশোধিত** — pgx `indirect` কারণ GORM নিজেই pgx কে under the hood driver হিসেবে ব্যবহার করে। কোডে শুধু GORM আছে — কোনো conflict নেই। `ENGINEERING_ARCHITECTURE.md` আপডেট হয়েছে। | — |

---

## 3. ❌ Worker — Go (সবচেয়ে বেশি সমস্যা)

### ✅ সঠিক যা আছে

| কনভেনশন | অবস্থা |
|---------|--------|
| `cmd/worker/main.go` | ✅ Go standard layout |
| `hibiken/asynq` ব্যবহার | ✅ |
| `internal/engine/` | ✅ Architecture অনুযায়ী |
| Graceful shutdown | ✅ SIGINT/SIGTERM handle করছে |
| Concurrent chunk processing | ✅ goroutine + WaitGroup |

### ❌ বড় সমস্যা

| সমস্যা | বিবরণ | পরামর্শ |
|--------|-------|--------|
| ~~**Worker মনোলিথিক (main.go)**~~ | ✅ **সংশোধিত** — `worker/cmd/worker/main.go` ৪৬১ লাইন থেকে ছোট করে ~৯০ লাইনে নামিয়ে আনা হয়েছে। লজিকগুলো `pkg/config`, `pkg/logger`, `internal/queue`, এবং `internal/reporter`-এ ভাগ করা হয়েছে। | — |
| **Architecture-এর অধিকাংশ folder নেই** | `queue/`, `reporter/`, `reputation/`, `discovery/`, `limiter/`, `helper/` — কোনোটাই তৈরি হয়নি | এগুলো তৈরি করে `main.go` refactor করতে হবে |
| **Struct duplication** | `EmailTaskPayload`, `WebhookDeliverPayload` — backend এর সাথে duplicated | Shared payloads বা worker-এ `internal/tasks/` তৈরি করতে হবে |
| **`.exe` ফাইল committed** | `tmp_worker.exe`, `worker.exe` | `.gitignore` এ add করুন |

---

## 4. ENGINEERING_ARCHITECTURE.md Compliance

| Architecture Rule | Frontend | Backend | Worker |
|-------------------|----------|---------|--------|
| Folder structure match | ✅ 90% | ✅ 80% | ❌ 40% |
| Required packages used | ✅ সব আছে | ✅ সব আছে | ⚠️ `zap` নেই |
| Handler→Service→Repo pattern | N/A | ✅ | N/A |
| Centralized config | ✅ | ✅ | ❌ |
| Structured logging | ✅ | ✅ (zap) | ❌ (std log) |
| `.gitignore` (no exe files) | ✅ | ❌ | ❌ |

---

## 5. অগ্রাধিকার অনুযায়ী সমস্যার তালিকা

### 🔴 তাৎক্ষণিক (Critical)
1. **Worker `main.go` refactor** — ৪৬১ লাইন একটা file-এ, আলাদা package-এ ভাগ করতে হবে
2. **Worker-এ missing folders** — `internal/queue/`, `internal/reporter/` তৈরি করে logic move করতে হবে
3. **`.exe` files `.gitignore`-এ যোগ করুন** — `*.exe`, `tmp_*` add করুন

### 🟡 গুরুত্বপূর্ণ (Important)
4. ~~**Worker-এ `zap` logger**~~ ✅ সংশোধিত ( `pkg/logger` তৈরি এবং `asynqLogger` bridge ইমপ্লিমেন্ট করা হয়েছে)
5. ~~**Worker-এ `pkg/config/`**~~ ✅ সংশোধিত (`pkg/config` তৈরি করে `os.Getenv` centralize করা হয়েছে)
6. ~~**Backend-এ `pkg/security/`, `pkg/report/`**~~ ✅ সংশোধিত
7. ~~**Backend `internal/api/validator/`**~~ ✅ সংশোধিত

### 🟢 Minor
8. ~~**Frontend `proxy.ts`**~~ — ✅ **সংশোধিত**: Next.js 16+ এ `proxy.ts` ই সঠিক convention, root-এ থাকাই ঠিক।
9. ~~**Frontend `layout.tsx`**~~ — ✅ **সংশোধিত**: `getPublicSettings` utility-তে extract করা হয়েছে।
10. ~~**`internal/tasks/` → `cron/`**~~ — ✅ **সংশোধিত**: `tasks/` সঠিক নাম (Asynq convention)। `ENGINEERING_ARCHITECTURE.md` আপডেট করা হয়েছে।
