# EJP Testing & Audit Protocol (Standard Operating Procedure)

This document outlines the standard rules, guidelines, and step-by-step procedures to be followed by any AI or Developer when auditing or testing a module in the **EmailJachai-Pro (EJP)** project.

## 1. Core Reference Documents
Before beginning any test, the AI **must** read and understand the following documents to establish the boundaries and rules:
1. `CONVENTION_AUDIT.md` - Overall compliance scores and specific file/folder structure rules.
2. `ENGINEERING_ARCHITECTURE.md` - Tech stack (Next.js, Go, Redis), design patterns, and scaling logic.
3. `HYBRID_CACHE_ARCHITECTURE.md` - Caching strategies and data retention rules.
4. `implementation_plan.md` - (Specifically for Frontend) The "Laravel-like SSR Migration" plan.

---

## 2. Exhaustive 26-Point Testing Checklist

During the audit, the AI must explicitly test and report on the following 26 criteria:

### A. Core Software Integrity
1. **Code Quality:** Cleanliness, TypeScript strictness, and modularity.
2. **Functional Testing:** Do all buttons, forms, and features work as expected?
3. **Data Integrity:** Is the payload properly mapped between Frontend and Backend?
4. **Maintainability & Refactoring:** Is the code easy to read and extend?
5. **Documentation:** Are TSDoc and comments used effectively for complex logic?
6. **Dependency & Package Audit:** Are we strictly using the mandated packages (e.g., Zod, RHF, Zustand)?

### B. Security & Compliance
7. **Security:** Protection against XSS, CSRF, and proper token masking.
8. **Compliance & Privacy:** Are emails and API keys handled securely without logging sensitive data?
9. **Database Audit:** Proper indexing and PostgreSQL partitioning logic verification.
10. **API Consistency:** Strict validation of API inputs and `{ status: 'success' }` output structure.

### C. Performance & Reliability
11. **Performance:** SSR efficiency, client-side rendering speed, and zero layout shift.
12. **Scalability:** Stateless components and decoupled state.
13. **Concurrency:** Real-time WebSockets and race-condition prevention.
14. **Caching Validation:** Are we properly hitting Redis or PostgreSQL partitions instead of external DNS?
15. **User Experience (UX):** Shadcn UI, micro-animations, and loading states.
16. **Compatibility Testing:** Cross-browser responsive design (Tailwind).

### D. Resilience & Error Handling
17. **Failure Recovery:** Graceful fallback if backend goes down.
18. **Error Handling:** Try/catch blocks and user-friendly error banners (Zod).
19. **Timeout & Retry Handling:** Proper timeouts on `fetch` and external API calls.
20. **Accuracy:** Are the deliverability scores and validation logic strictly mapped?

### E. Infrastructure & DevOps (Backend/Worker focus)
21. **Stress Testing:** Can it handle bulk uploads (100k+ records) via chunks?
22. **Observability:** Centralized logs and metrics tracking.
23. **Monitoring:** Real-time system monitoring logic.
24. **Logging:** Standardized `go.uber.org/zap` structured logging.
25. **Backup & Disaster Recovery:** Data replication and safe file storage.
26. **Production Readiness:** Final executable build checks and `.gitignore`.

---

## 3. Step-by-Step Testing Execution Plan

**CRITICAL RULE: Full Vertical Slice Testing (Frontend + Backend + Worker).**
When testing a specific feature or page (e.g., Single Verify or Bulk Upload), the AI **MUST** audit the entire vertical slice simultaneously. This means auditing the Next.js Frontend page, the Go Backend API handler, and the Go Worker Node (background processing/WebSockets) all together in a single comprehensive report. Do not test only the frontend.

When prompted to test a specific area, follow these steps mapping back to the 26 points:

### Step 1: Component Discovery
- Use the `list_dir` and `grep_search` tools to identify all related files across the entire stack.
- **Frontend:** Check `app/(module_name)` and `_components`.
- **Backend:** Check `internal/api/handler`, `internal/service`, and `internal/repo` related to the feature.
- **Worker/Engine:** Check `internal/verifier`, `internal/worker`, or WebSocket hubs related to the feature.

### Step 2: Architecture Validation
- **Frontend:** App router, `fetchServer()`, `react-hook-form` + `zod`, `proxy.ts`.
- **Backend:** `Handler -> Service -> Repo`, `gorilla/websocket`, `asynq`.

### Step 3: Actionable Reporting
- Generate a Markdown report detailing the findings against the 26 points.
- Categorize findings into: ✅ PASS, ⚠️ MINOR VIOLATION, ❌ CRITICAL FAILURE.
- If a minor violation is found, proactively offer to write the refactored code using `replace_file_content`.

---

## 4. Quick AI Prompt for Future Audits
*Copy and paste the following prompt to any AI to instantly initiate a compliant audit:*

> "Please test the **[Insert Module Name]** according to the exhaustive 26-point rules defined in `EJP_TEST_PROTOCOL.md`. First, read this protocol file, then read `CONVENTION_AUDIT.md` and `ENGINEERING_ARCHITECTURE.md`. After reading, audit the directory, check for SSR compliance, Form handling compliance, and Code Quality. Generate a comprehensive report against all 26 criteria, and fix any minor violations."
