# Enterprise Verification Gaps — Backlog (do later)

**Status:** Deferred — not blocking current go-live  
**Date:** August 23, 2026  
**Context:** Phase 3 (G2/G6/G9/G10/G11/G13) already lands industry-standard SMTP verification. Gaps below are what separates mid-tier honest SMTP from top enterprise tools (ZeroBounce Verify+, Allegrow, BounceBan-style).

**Current baseline (done):**
- Syntax → domain policy → MX / Null MX → SMTP RCPT → catch-all random probe
- Greylist 1× retry (~8s), STARTTLS, HELO FQDN
- M365/Yahoo force `catch_all` (no false `valid`)
- Single/public (backend) ↔ bulk (worker) classification parity
- `IsSafeToSend` = valid + deliverable + not catch-all

---

## Priority table

| ID | Gap | Sev | Why it matters | Effort (rough) |
|----|-----|-----|----------------|----------------|
| E1 | Multi-IP / proxy pool + stronger anti-greylist | HIGH | Same-IP retry often stays greylisted; ZB/MV rotate egress | L |
| E2 | SEG fingerprint (Proofpoint, Mimecast, Barracuda, Cisco) | HIGH | Enterprise MX often masks directory → false catch-all/unknown | M |
| E3 | Catch-all Phase-2 resolve (optional heuristic / secondary pass) | HIGH | SMTP alone cannot resolve accept-all; top tools reclassify 20–40% | L |
| E4 | Live DNSBL + SPF / DKIM / DMARC posture checks | MEDIUM | Spec lists them; engine does not fully run them today | M |
| E5 | Disposable / spam-trap / blacklist list freshness pipeline | MEDIUM | Stale lists → miss new temp domains and traps | M |
| E6 | Shared verify package (kill backend↔worker mirror drift) | MEDIUM | Parity is manual today; one package = one source of truth | M |
| E7 | Provider-aware retry policy (Yahoo/AOL/M365/Gmail budgets) | LOW | One-size 8s backoff is weaker than per-provider schedules | S–M |
| E8 | Result confidence score (0–100 continuous, not only status buckets) | LOW | Helps UI/API consumers threshold catch-all vs send | S |

---

## E1 — Multi-IP / proxy pool + anti-greylist

**Problem:** One egress IP + one retry loses to greylist and rate blocks. Enterprise verifiers retry from another IP / region.

**Do later:**
- [ ] Outbound proxy or dedicated IP pool config (worker + backend)
- [ ] On 4xx / timeout / disconnect: retry from next egress before `unknown`
- [ ] Cap concurrent probes per egress IP; health-check bad proxies
- [ ] Metrics: greylist hit rate, retry success rate per IP

**Touch:** `worker/internal/engine/smtp.go`, `backend/internal/verifier/smtp.go`, deploy/env, possibly new `pkg/egress`

---

## E2 — SEG fingerprinting

**Problem:** Proofpoint / Mimecast / Barracuda / Cisco / Defender often accept or defer RCPT without confirming the mailbox.

**Do later:**
- [ ] Detect SEG from MX host patterns / banners (extend `isKnownAcceptAllProvider` style lists)
- [ ] Map known SEG → status policy (`catch_all` / `unknown` / `risky`) — never false `valid`
- [ ] Optional: SEG-specific probe sequence (port, HELO, delay) without claiming mailbox proof
- [ ] Unit tests for MX host → SEG class

**Touch:** shared classify helper, MX policy tables, both SMTP engines

---

## E3 — Catch-all Phase-2 resolve (optional)

**Problem:** Random-probe `catch_all` is honest but leaves a large B2B bucket unresolved. Top tools add a second phase (heuristics / activity / identity — **not** “send real mail” unless product explicitly allows it).

**Do later:**
- [ ] Product decision: credit cost, latency SLA, and whether Phase-2 is opt-in
- [ ] Keep Phase-1 SMTP labels unchanged; Phase-2 only reclassifies `catch_all` / `unknown`
- [ ] Never promote to `valid` without a defined, testable signal
- [ ] UI/API: show `phase` / `confidence` so users know SMTP vs resolved

**Note:** Prefer honest `catch_all` over fake `valid`. Phase-2 is a product feature, not a free accuracy claim.

---

## E4 — DNSBL + SPF / DKIM / DMARC

**Problem:** `EMAIL_VERIFICATION_SAAS_SPEC.md` describes posture + blacklist checks; domain DB flags exist, but live DNSBL / auth-record checks are incomplete vs the 10-point UI story.

**Do later:**
- [ ] Lookup SPF / DMARC (and DKIM selector discovery if feasible) on domain
- [ ] Optional DNSBL query for MX / domain (timeout-bounded, cache results)
- [ ] Surface as `checks` in single-verify JSON — do **not** flip `valid`→`invalid` on missing SPF alone
- [ ] Keep spam-trap / blacklist domain table as hard invalid path

**Touch:** verifier DNS layer, single-verify response shape, frontend checks grid

---

## E5 — List freshness pipeline

**Problem:** Disposable / spam-trap accuracy depends on list quality, not SMTP.

**Do later:**
- [ ] Scheduled import/update job for disposable + trap domains
- [ ] Admin UI already supports domain types — add source, version, last_synced_at
- [ ] Alert when list age > N days
- [ ] Tests: sample known disposable domains still classify

---

## E6 — Shared verify package (parity hard-guarantee)

**Problem:** Backend and worker duplicate SMTP/classify logic; audit says “must stay mirrored.”

**Do later:**
- [ ] Extract classify + probe disposition + mailbox syntax into one Go module (e.g. `pkg/verify` or internal shared)
- [ ] Backend + worker import same package
- [ ] Single test suite for disposition / catch-all / accept-all providers
- [ ] Delete duplicated copies after cutover

---

## E7 — Provider-aware retry

**Problem:** Fixed 8s single retry is better than none, weaker than provider-tuned schedules.

**Do later:**
- [ ] Per-provider backoff table (free mail stricter RPS already exists — extend for retry count/delay)
- [ ] Respect deadline; never block job workers unbounded
- [ ] Document env knobs next to `SMTP_VERIFY_TIMEOUT_SEC` / domain RPS

---

## E8 — Continuous confidence score

**Problem:** Status buckets are good; a 0–100 confidence helps API consumers and UI risk thresholds.

**Do later:**
- [ ] Map signals → confidence (SMTP accept + catch-all reject = high; SEG/catch-all = mid; timeout = low)
- [ ] Keep `status` canonical; `score` / `confidence` secondary
- [ ] Document that score is not a bounce-rate guarantee

---

## Accuracy expectations (do not overclaim)

| Case | Expectation |
|------|-------------|
| Clear 250 / 550 SMTP | ~95–99% agreement with peer SMTP tools |
| Catch-all / SEG | Label honestly; do not claim mailbox proof |
| Marketing “99% overall” | Avoid — peers mean definitive labels only |
| Safe to send | Only `IsSafeToSend` / equivalent |

After E1–E3, catch-all/SEG **resolution rate** can improve; **honesty** must stay the default.

---

## Suggested order when you pick this up

1. **E6** (shared package) — makes E1/E2/E7 safer  
2. **E2** then **E1** — fewer false valids + fewer greylist unknowns  
3. **E4** + **E5** — product completeness vs spec/UI  
4. **E3** — only after product rules for credits/SLA  
5. **E7** / **E8** — polish  

---

## Related docs

- `PRODUCTION_READINESS_AUDIT.md` — Phase 1–3 done; this file = Phase 4 backlog  
- `EMAIL_VERIFICATION_SAAS_SPEC.md` — target feature surface (SPF/DKIM/DMARC, 10-point checks)  
- `docs/BULK_UPLOAD_PIPELINE.md` — bulk path / domain policy skip rules  

**When implementing:** keep backend single/public and worker bulk on the **same** classification rules; add tests before claiming accuracy gains.
