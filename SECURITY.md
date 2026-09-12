# Security Policy

The EmailJachai-Pro team takes security vulnerabilities seriously. We appreciate your efforts to responsibly disclose your findings.

---

## Supported Versions

We actively provide security patches for the following versions of EmailJachai-Pro:

| Version | Supported          |
| ------- | ------------------ |
| 1.0.x   | :white_check_mark: |
| < 1.0   | :x:                |

---

## Reporting a Vulnerability

If you believe you have discovered a security vulnerability in EmailJachai-Pro, please report it via private email rather than filing a public issue.

### How to Report

1. Send an email to: **[fr.nirobsohel@gmail.com](mailto:fr.nirobsohel@gmail.com)**
2. Include the subject line: `[SECURITY] Potential vulnerability in EmailJachai-Pro`
3. Please provide as much details as possible:
   - Type of vulnerability (e.g., SSRF in SMTP verifier, SQL injection, unauthorized API bypass, rate-limit evasion).
   - Step-by-step instructions to reproduce the issue.
   - Proof of concept (PoC) code or payload, if available.
   - Any impact assessment or recommended mitigation.

### Response Timeline

- **Initial Acknowledgment:** Within 48 hours of receipt.
- **Triage & Status Update:** Within 5 business days with an assessment of the report.
- **Fix & Disclosure:** We will coordinate a patch and an appropriate disclosure timeline with you before releasing public details.

### Security Best Practices When Deploying

When running EmailJachai-Pro in production:
- **Egress Network Filtering**: Ensure SMTP probe workers cannot access cloud metadata endpoints (e.g., `169.254.169.254`) or internal private IP ranges (`10.0.0.0/8`, `172.16.0.0/12`, `192.168.0.0/16`).
- **Secrets Management**: Never commit `.env` files. Change default secrets (`JWT_SECRET`, `WORKER_API_KEY`, database passwords) before exposing the API.
- **HTTPS & WSS**: Always terminate TLS in front of the Next.js frontend and Go backend reverse proxy.
