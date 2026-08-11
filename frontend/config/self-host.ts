export interface SelfHostLicense {
    name: string
    price: number
    tagline: string
    isPopular: boolean
    features: string[]
}

export interface SelfHostFeature {
    title: string
    description: string
}

export interface SelfHostFaqItem {
    question: string
    answer: string
}

export const SELF_HOST_PURCHASE_URL =
    "https://frnirobsohel.gumroad.com/l/emailjachaiverificationsaas"

export const SELF_HOST_LICENSES: SelfHostLicense[] = [
    {
        name: "Individual",
        price: 120,
        tagline: "Personal use and privacy-first installs",
        isPopular: false,
        features: [
            "Full source (frontend + backend)",
            "Single personal deployment",
            "Docker Compose setup",
            "Unlimited verifications on your hardware",
            "Lifetime product-line updates",
            "Email support",
        ],
    },
    {
        name: "Business",
        price: 290,
        tagline: "Teams and multi-branch operations",
        isPopular: true,
        features: [
            "Everything in Individual",
            "Multi-branch / team deployments",
            "Admin dashboard and user management",
            "API keys for internal tools",
            "Priority email support",
            "Lifetime product-line updates",
        ],
    },
    {
        name: "SaaS Production",
        price: 450,
        tagline: "Resell as your own hosted product",
        isPopular: false,
        features: [
            "Everything in Business",
            "Commercial SaaS redistribution rights",
            "White-label ready for your customers",
            "Multi-tenant production use",
            "Priority support",
            "Lifetime product-line updates",
        ],
    },
]

export const SELF_HOST_FEATURES: SelfHostFeature[] = [
    {
        title: "Your infrastructure",
        description:
            "Deploy on a VPS or private cloud. Verification traffic and lists stay inside your network boundary.",
    },
    {
        title: "One-time licence",
        description:
            "Pay once. No monthly SaaS fee for the self-host edition — run it as long as your servers do.",
    },
    {
        title: "Lifetime updates",
        description:
            "Licensed builds receive product-line updates without a recurring upgrade tax.",
    },
    {
        title: "Data under your control",
        description:
            "Keep list processing on your stack for stricter privacy, retention, and compliance policies.",
    },
    {
        title: "Capacity you choose",
        description:
            "Scale workers to your hardware. Throughput is limited by your fleet, not a credit meter.",
    },
    {
        title: "Source you can extend",
        description:
            "Adapt branding, integrations, and workflows to match how your organisation already ships.",
    },
]

export const SELF_HOST_FAQ: SelfHostFaqItem[] = [
    {
        question: "What ships with a self-host licence?",
        answer:
            "The EmailJachai Pro codebase (frontend and backend), Docker deployment assets, docs, and lifetime updates for the licensed product line.",
    },
    {
        question: "Which licence fits me?",
        answer:
            "Individual is for personal or privacy-first installs. Business covers teams and multi-branch use. SaaS Production is for offering the platform as your own hosted product.",
    },
    {
        question: "What server do I need?",
        answer:
            "A Linux host with Docker and Docker Compose. Plan on roughly 2 vCPU and 2 GB RAM to start — DigitalOcean, Hetzner, AWS, or similar works.",
    },
    {
        question: "Are verifications metered?",
        answer:
            "No credit meter on self-host. Volume is bounded by your SMTP/DNS capacity and the machines you run.",
    },
    {
        question: "Is support included?",
        answer:
            "Yes. Every licence includes email support. Business and SaaS Production get priority handling.",
    },
    {
        question: "Can I run multiple deployments?",
        answer:
            "Individual covers personal use. Business covers team and multi-branch deployments. SaaS Production allows customer-facing SaaS redistribution under the licence terms.",
    },
]
