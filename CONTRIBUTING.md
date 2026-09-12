# Contributing to EmailJachai-Pro

Thank you for your interest in contributing to **EmailJachai-Pro**! We are building an enterprise-grade, distributed email verification and deliverability SaaS, and we welcome contributions from developers of all skill levels.

---

## 📜 Table of Contents

- [Code of Conduct](#-code-of-conduct)
- [How Can I Contribute?](#-how-can-i-contribute)
  - [Reporting Bugs](#reporting-bugs)
  - [Suggesting Features](#suggesting-features)
  - [Submitting Pull Requests](#submitting-pull-requests)
- [Development Workflow](#-development-workflow)
  - [Branch Naming](#branch-naming)
  - [Commit Message Conventions](#commit-message-conventions)
- [Coding Standards](#-coding-standards)
  - [Backend & Worker (Go)](#backend--worker-go)
  - [Frontend (Next.js / TypeScript)](#frontend-nextjs--typescript)
- [Running Tests](#-running-tests)

---

## 🤝 Code of Conduct

By participating in this project, you agree to abide by our [Code of Conduct](CODE_OF_CONDUCT.md). Please report any unacceptable behavior to [fr.nirobsohel@gmail.com](mailto:fr.nirobsohel@gmail.com).

---

## 💡 How Can I Contribute?

### Reporting Bugs

Before creating a bug report, please check existing issues to ensure the problem has not already been reported.

When creating an issue, please use the [Bug Report Template](.github/ISSUE_TEMPLATE/bug_report.md) and provide:
- A clear, descriptive title.
- Steps to reproduce the problem.
- Expected behavior vs. actual behavior.
- Relevant log output or error stack traces.
- Your environment details (OS, Go version, Node.js version, Docker version).

> **Note:** If you find a security-sensitive issue or vulnerability, please **do not** open a public issue. Follow our [Security Policy](SECURITY.md).

### Suggesting Features

Feature suggestions and architecture improvements are welcome! Please open an issue using the [Feature Request Template](.github/ISSUE_TEMPLATE/feature_request.md) describing:
- The problem your feature solves or the value it brings.
- A clear description of the proposed solution.
- Any alternative solutions or trade-offs you considered.

---

## 🚀 Development Workflow

1. **Fork** the repository on GitHub.
2. **Clone** your fork locally:
   ```bash
   git clone https://github.com/<your-username>/emailjachai.git
   cd emailjachai
   ```
3. **Set upstream remote**:
   ```bash
   git remote add upstream https://github.com/frnirobsohel/emailjachai.git
   ```
4. **Create a branch** for your change:
   ```bash
   git checkout -b feat/your-feature-name
   ```
5. **Make your modifications** and ensure all tests pass.
6. **Commit** your changes following our commit conventions.
7. **Push** to your fork:
   ```bash
   git push origin feat/your-feature-name
   ```
8. **Submit a Pull Request** against the `main` branch of `frnirobsohel/emailjachai`.

### Branch Naming

Use descriptive branch prefixes:
- `feat/` — New feature or functionality
- `fix/` — Bug fix
- `docs/` — Documentation updates
- `refactor/` — Code refactoring without behavioral changes
- `perf/` — Performance optimization
- `test/` — Adding or fixing test suites
- `chore/` — Tooling, dependency, or build changes

### Commit Message Conventions

We follow [Conventional Commits](https://www.conventionalcommits.org/):

```text
<type>(<scope>): <short summary>

[optional body]

[optional footer(s)]
```

**Examples:**
- `feat(worker): add timeout fallback for greylisted smtp servers`
- `fix(backend): correct credit deduction logic in batch endpoint`
- `docs(readme): add docker compose smoke testing instructions`

---

## 📐 Coding Standards

### Backend & Worker (Go)
- Ensure all Go code is formatted with `gofmt` or `goimports`.
- Follow idiomatic Go guidelines ([Effective Go](https://go.dev/doc/effective_go)).
- Handle all errors explicitly; avoid silent error discards.
- Avoid memory allocations in tight loops inside high-throughput worker routines.
- Run `go vet ./...` before submitting changes.

### Frontend (Next.js / TypeScript)
- Use TypeScript with strict type annotations; avoid `any`.
- Keep components modular, reusable, and accessible (WCAG compliant).
- Use Tailwind CSS and follow existing UI design tokens.
- Run `npm run lint` inside `frontend/` to ensure no ESLint errors.

---

## 🧪 Running Tests

Ensure all automated tests pass before opening a pull request:

```bash
# Backend tests
cd backend && go test ./...

# Worker tests
cd worker && go test ./...

# Frontend tests & linting
cd frontend && npm test -- --run && npm run lint
```

---

## 📬 Questions or Need Help?

Feel free to open an issue for discussion or reach out to the project maintainer:
- **Maintainer**: Sohel Akter ([fr.nirobsohel@gmail.com](mailto:fr.nirobsohel@gmail.com))
- **LinkedIn**: [https://www.linkedin.com/in/freelancernirobsohel/](https://www.linkedin.com/in/freelancernirobsohel/)
