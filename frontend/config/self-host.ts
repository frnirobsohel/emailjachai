export interface SelfHostEdition {
    name: string
    badge: string
    price: string
    period?: string
    tagline: string
    isPopular: boolean
    ctaLabel: string
    ctaHref: string
    features: string[]
}

export interface DeploymentMethod {
    title: string
    description: string
    badge: string
    command?: string
    docsHref: string
}

export interface SelfHostFeature {
    title: string
    description: string
}

export interface SelfHostFaqItem {
    question: string
    answer: string
}

export const GITHUB_REPO_URL = "https://github.com/frnirobsohel/emailjachai"
export const INSTALL_COMMAND =
    "curl -fsSL https://raw.githubusercontent.com/frnirobsohel/emailjachai/main/deploy/install.sh | bash"

export const SELF_HOST_EDITIONS: SelfHostEdition[] = [
    {
        name: "Community Edition",
        badge: "100% Open Source",
        price: "Free",
        period: "forever",
        tagline: "For individual developers, self-hosters & privacy-first startups",
        isPopular: true,
        ctaLabel: "Deploy with 1 Command",
        ctaHref: "#quick-install",
        features: [
            "Complete source code (Go API, Go Worker, Next.js UI)",
            "1-command automatic installer with auto-SSL",
            "Unlimited verifications on your hardware",
            "Dokploy, Coolify & Docker Compose support",
            "Real-time MX, catch-all & mailbox SMTP pinging",
            "Zero-downtime updates with update & doctor CLI",
            "Community support via GitHub Discussions",
        ],
    },
    {
        name: "Enterprise & Scale",
        badge: "Production Cluster",
        price: "Custom",
        period: "tailored",
        tagline: "For high-volume senders, agencies & enterprise security teams",
        isPopular: false,
        ctaLabel: "Contact Enterprise",
        ctaHref: "/contact",
        features: [
            "Everything in Community Edition",
            "Multi-IP egress pool with round-robin IP rotation",
            "Horizontal multi-worker cluster scaling",
            "Prometheus & Grafana metrics endpoints",
            "Custom architecture & high-throughput tuning",
            "Priority SLA & dedicated onboarding assistance",
            "Custom integrations & white-label advisory",
        ],
    },
]

export const DEPLOYMENT_METHODS: DeploymentMethod[] = [
    {
        title: "1-Command Quick Install",
        description:
            "Run our unified bash installer on any fresh Ubuntu/Debian/Rocky VPS. Automatically configures Caddy SSL, PostgreSQL, Redis, Worker, and Dashboard.",
        badge: "Recommended",
        command: INSTALL_COMMAND,
        docsHref: "https://github.com/frnirobsohel/emailjachai/blob/main/docs/DEPLOYMENT.md",
    },
    {
        title: "Dokploy & Coolify",
        description:
            "Deploy with modern open-source PaaS managers using our pre-built production template with zero server configuration hassle.",
        badge: "1-Click PaaS",
        docsHref: "https://github.com/frnirobsohel/emailjachai/blob/main/docs/DEPLOYMENT.md#2-deploying-via-dokploy--coolify",
    },
    {
        title: "Docker Compose",
        description:
            "Standard multi-container compose stack with volume mounts, environment templates, and zero-downtime rolling update scripts.",
        badge: "DevOps Ready",
        command: "git clone https://github.com/frnirobsohel/emailjachai.git && docker compose -f deploy/docker-compose.prod.yml up -d",
        docsHref: "https://github.com/frnirobsohel/emailjachai/blob/main/docs/DEPLOYMENT.md#3-manual-production-deployment-docker-compose",
    },
]

export const SELF_HOST_FEATURES: SelfHostFeature[] = [
    {
        title: "100% Data Sovereignty",
        description:
            "Your email lists, customer records, and verification traffic never leave your server boundary. Guaranteed GDPR, HIPAA, and privacy compliance.",
    },
    {
        title: "No Per-Verification Fees",
        description:
            "Verify 1,000 or 10,000,000 emails without worrying about credit meters or surprise SaaS bills. The only cost is your server hardware.",
    },
    {
        title: "Zero-Downtime Updater & Doctor",
        description:
            "Ship continuous updates with `./deploy/update.sh` and diagnose database, Redis, and worker health instantly with `./deploy/update.sh --doctor`.",
    },
    {
        title: "NeverBounce / ZeroBounce Accuracy",
        description:
            "State-of-the-art verification engine with RFC 5322 syntax validation, MX priority sorting, catch-all detection, and greylist backoff.",
    },
    {
        title: "Multi-IP Egress Scaling",
        description:
            "Enterprise-ready multi-IP rotation avoids mail provider rate limits by automatically cycling outgoing SMTP connections across assigned IPs.",
    },
    {
        title: "Modern Go & Next.js Architecture",
        description:
            "Blazing fast Go API backend and asynchronous worker queues paired with a sleek, responsive Next.js dashboard.",
    },
]

export const SELF_HOST_FAQ: SelfHostFaqItem[] = [
    {
        question: "Is Email Jachai really 100% free and open source?",
        answer:
            "Yes! The full core platform—including the Go backend, worker verification engine, Next.js frontend, and deployment scripts—is completely open source on GitHub. You can run it on your own servers without paying any license fees.",
    },
    {
        question: "What server specifications do I need?",
        answer:
            "Any Linux VPS (Ubuntu 22.04/24.04 or Debian) with at least 1 vCPU and 2 GB RAM with outbound port 25 open (available on providers like Hetzner, DigitalOcean, Linode, or AWS).",
    },
    {
        question: "How do I update to new releases?",
        answer:
            "Simply run `./deploy/update.sh` inside your deployment folder. It pulls the latest release, applies database migrations safely, and updates containers with zero downtime.",
    },
    {
        question: "Can I scale to multiple workers for high volume?",
        answer:
            "Absolutely! You can scale workers on a single machine with `docker compose up -d --scale worker=8` or distribute workers across multiple servers connecting to a central Redis and Postgres cluster.",
    },
    {
        question: "What is the difference between Community and Enterprise?",
        answer:
            "The Community Edition is 100% free and self-service. Enterprise is for organizations that need multi-IP egress clustering, custom high-throughput architecture, priority SLAs, or custom feature engineering.",
    },
    {
        question: "Can I deploy behind Cloudflare or my own reverse proxy?",
        answer:
            "Yes! Email Jachai includes an automated Caddy configuration for instant SSL, but also easily integrates behind Cloudflare, Nginx, Traefik, Dokploy, or Coolify.",
    },
]
