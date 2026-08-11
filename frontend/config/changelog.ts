export interface ChangelogRelease {
    version: string
    date: string
    title: string
    items: string[]
}

/**
 * Public product changelog for end users (verification, credits, API, limits).
 * Not a GitHub / engineering release log — keep versions simple (v1.0.0, v1.0.1, …).
 */
export const CHANGELOG_RELEASES: ChangelogRelease[] = [
    {
        version: "v1.0.1",
        date: "August 11, 2026",
        title: "Full credit refund on Unknown results",
        items: [
            "Unknown verification results now refund 100% of the credits used (was 80%)",
            "Applies automatically when a bulk verification job finishes",
            "Fairer billing when a mailbox cannot be confirmed as valid or invalid",
        ],
    },
    {
        version: "v1.0.0",
        date: "August 2026",
        title: "First public release",
        items: [
            "Single and bulk email verification with clear result statuses (valid, invalid, catch-all, unknown, and more)",
            "Dashboard to track jobs, credits, and recent activity in real time",
            "REST API with API keys for integrating verification into your own apps",
            "Per-account and public usage rate limits to keep the service stable and fair for everyone",
            "Performance-focused processing for large lists with exportable results",
            "Credit packages, secure checkout, and optional self-host licences",
        ],
    },
]
