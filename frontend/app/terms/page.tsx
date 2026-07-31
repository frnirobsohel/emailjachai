import type { Metadata } from "next"
import { LegalDocument } from "@/components/home/legal-document"
import { getPublicSettings } from "@/lib/services/settings"

export async function generateMetadata(): Promise<Metadata> {
    const settings = await getPublicSettings()
    const siteTitle = settings?.site_title || "EmailJachai Pro"
    return {
        title: "Terms of Service",
        description: `Terms of Service for ${siteTitle}`,
    }
}

export default async function TermsPage() {
    const settings = await getPublicSettings()
    const siteTitle = settings?.site_title || "EmailJachai Pro"
    const logoUrl = settings?.logo_url || settings?.favicon_url || "/logo.svg"

    return (
        <LegalDocument
            siteTitle={siteTitle}
            logoUrl={logoUrl}
            twitterUrl={settings?.twitter_url}
            linkedinUrl={settings?.linkedin_url}
            githubUrl={settings?.github_url}
            title="Terms of Service"
            updatedAt="July 31, 2026"
            intro={`These Terms of Service ("Terms") govern your access to and use of ${siteTitle} (the "Service"). By creating an account or using the Service, you agree to these Terms.`}
            sections={[
                {
                    title: "The Service",
                    paragraphs: [
                        `${siteTitle} provides email verification tools, including single and bulk checks, APIs, dashboards, and related features. Results are based on technical signals available at the time of verification and are provided for informational purposes.`,
                        "We continuously improve accuracy, but no verification system can guarantee 100% correctness for every mailbox or provider.",
                    ],
                },
                {
                    title: "Accounts & Eligibility",
                    paragraphs: [
                        "You must provide accurate registration details and keep your login credentials secure. You are responsible for all activity under your account.",
                        "You may not use the Service if you are legally prohibited from doing so, or if your use would violate applicable laws or third-party rights.",
                    ],
                },
                {
                    title: "Credits, Billing & Plans",
                    paragraphs: [
                        "Paid usage is typically measured in credits or packages purchased through the Service. Credits are consumed when verification jobs or API calls are processed according to your plan.",
                        "Unless otherwise stated for a specific offer (such as a self-hosted lifetime license), purchases are non-refundable once credits or access have been delivered, except where required by law.",
                        "We may update pricing based on infrastructure and operating costs. Changes will not retroactively alter credits you already purchased.",
                    ],
                },
                {
                    title: "Acceptable Use",
                    paragraphs: [
                        "You may use the Service only for lawful email list hygiene, deliverability improvement, and related business purposes.",
                        "You must not use the Service to harass, spam, commit fraud, violate anti-spam laws, probe systems without authorization, reverse engineer the platform beyond what the law allows, or overload our infrastructure.",
                        "We may suspend or terminate accounts that abuse the Service, attempt to bypass security controls, or harm other users.",
                    ],
                },
                {
                    title: "Your Data & Lists",
                    paragraphs: [
                        "You retain ownership of the email lists and files you upload. By uploading data, you confirm you have the right to process those addresses for verification.",
                        "We process uploaded emails to provide verification results and operate the Service. See our Privacy Policy for details on how personal data is handled.",
                    ],
                },
                {
                    title: "Self-Hosted Licenses",
                    paragraphs: [
                        "If you purchase a self-hosted license, you may deploy the software on your own infrastructure under the license terms provided at purchase. Lifetime updates, if included, apply to the licensed product line as described in your order.",
                        "Self-hosted deployments remain your responsibility for security, uptime, backups, and compliance.",
                    ],
                },
                {
                    title: "Intellectual Property",
                    paragraphs: [
                        `The Service, including software, branding, documentation, and design, is owned by ${siteTitle} or its licensors. These Terms do not transfer ownership of our intellectual property to you.`,
                        "You may not copy, resell, or redistribute the hosted Service except as expressly allowed in writing.",
                    ],
                },
                {
                    title: "Disclaimer & Limitation of Liability",
                    paragraphs: [
                        'The Service is provided "as is" and "as available." To the fullest extent permitted by law, we disclaim warranties of merchantability, fitness for a particular purpose, and non-infringement.',
                        "To the fullest extent permitted by law, our total liability for any claim related to the Service is limited to the amount you paid us for the Service in the three months before the claim arose.",
                    ],
                },
                {
                    title: "Termination",
                    paragraphs: [
                        "You may stop using the Service at any time. We may suspend or terminate access if you breach these Terms or if continued operation creates legal or security risk.",
                        "Provisions that by nature should survive (including liability limits, IP ownership, and accrued payment obligations) will survive termination.",
                    ],
                },
                {
                    title: "Changes & Contact",
                    paragraphs: [
                        "We may update these Terms from time to time. Material changes will be reflected on this page with an updated date. Continued use after changes means you accept the revised Terms.",
                        `Questions about these Terms can be sent through the contact options on the ${siteTitle} website.`,
                    ],
                },
            ]}
        />
    )
}
