export interface ActiveOffer {
    badge: string
    title: string
    description: string
    highlights?: string[]
    validFrom?: string
    validUntil: string
    ctaLabel: string
    ctaHref: string
    isExternal?: boolean
    isHighlighted?: boolean
}

export interface UpcomingOffer {
    title: string
    description: string
    dateLabel: string
}

/** Launch month window: Aug 11 → Sep 11, 2026 (1 month from publish day). */
export const ACTIVE_OFFERS: ActiveOffer[] = [
    {
        badge: "Launch Special",
        title: "Launch Special Offer — 1 Million Email Verification Credits",
        description:
            "Special launch offer for the first month of Email Jachai. Limited availability — only the first 30 customers can claim this deal.",
        highlights: [
            "1,000,000 email verification credits",
            "Only $114",
            "First 30 customers only",
            "Valid throughout the launch month",
        ],
        validFrom: "August 11, 2026",
        validUntil: "September 11, 2026",
        ctaLabel: "Claim offer",
        ctaHref: "/register",
        isHighlighted: true,
    },
    {
        badge: "Active",
        title: "Self-host licences from $120",
        description:
            "Individual, Business, or SaaS Production — one-time payment with lifetime product-line updates. Run verification on your own servers.",
        validUntil: "Available now",
        ctaLabel: "View licences",
        ctaHref: "/self-host",
    },
]

export const UPCOMING_OFFERS: UpcomingOffer[] = [
    {
        title: "Black Friday credit bundle",
        description:
            "A limited weekend bundle with a steep credit discount. Window: November 28–30, 2026.",
        dateLabel: "November 28, 2026",
    },
    {
        title: "Year-end mega pack",
        description:
            "Largest credit pack of the year at seasonal pricing. December 26–31, 2026 only.",
        dateLabel: "December 26, 2026",
    },
    {
        title: "Self-host major upgrade window",
        description:
            "Discounted upgrade path for existing licence holders when the next major self-host line ships.",
        dateLabel: "Announced with release",
    },
]
