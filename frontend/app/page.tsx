import Link from "next/link"
import { Metadata } from "next"
import { FAQAccordion } from "@/components/home/faq-accordion"
import { ContactForm } from "@/components/home/contact-form"
import { Navbar } from "@/components/home/navbar"
import { Hero } from "@/components/home/hero"
import { Features } from "@/components/home/features"
import { Pricing, type PackageRow } from "@/components/home/pricing"
import { FutureVision } from "@/components/home/future-vision"
import { Footer } from "@/components/home/footer"
import { getPublicSettings } from "@/lib/services/settings"

const API_BASE_URL = process.env.API_BASE_URL || 'http://localhost:8000/api/v1'

export async function generateMetadata(): Promise<Metadata> {
  let title = "EmailJachai Pro"
  let tagline = "Professional Email Verification Platform"

  const settings = await getPublicSettings()
  if (settings) {
    title = settings.site_title || title
    tagline = settings.site_tagline || tagline
  }

  return {
    title: `${title} — ${tagline}`,
    description: tagline,
    keywords: ["email verification", "email verifier", "bounce rate reduction", "smtp check", "mx record lookup", "email list cleaning", "disposable email checker"],
    openGraph: {
      title: `${title} — ${tagline}`,
      description: tagline,
      type: "website",
      url: "https://emailjachai.pro",
      siteName: title,
      images: [
        {
          url: "https://emailjachai.pro/dashboard-preview.png",
          width: 1200,
          height: 630,
          alt: `${title} - ${tagline}`,
        }
      ]
    },
    twitter: {
      card: "summary_large_image",
      title: `${title} — ${tagline}`,
      description: tagline,
      images: ["https://emailjachai.pro/dashboard-preview.png"],
    },
    robots: {
      index: true,
      follow: true,
      nocache: true,
      googleBot: {
        index: true,
        follow: true,
        noimageindex: false,
        'max-video-preview': -1,
        'max-image-preview': 'large',
        'max-snippet': -1,
      },
    },
  }
}

export default async function Home() {
  let siteTitle = "EmailJachai Pro"
  let siteTagline = "Verify Emails with Precision"
  let logoUrl = "/logo.svg"
  let twitterUrl = ""
  let linkedinUrl = ""
  let youtubeUrl = ""
  let facebookUrl = ""
  let supportConfigured = false

  let packages: PackageRow[] = []

  const settings = await getPublicSettings()
  if (settings) {
    siteTitle = settings.site_title || siteTitle
    siteTagline = settings.site_tagline || siteTagline
    logoUrl = settings.logo_url || settings.favicon_url || "/logo.svg"
    twitterUrl = settings.twitter_url || ""
    linkedinUrl = settings.linkedin_url || ""
    youtubeUrl = settings.youtube_url || ""
    facebookUrl = settings.facebook_url || ""
    supportConfigured = Boolean(settings.support_email?.trim())
  }

  try {
    const res = await fetch(`${API_BASE_URL}/packages/list`, {
      signal: AbortSignal.timeout(2500),
      next: { revalidate: 60 },
    })
    const json = await res.json()
    if (json.status === "success" && Array.isArray(json.data)) {
      packages = json.data.filter((p: PackageRow) => p.status === "active")
    }
  } catch {}

  // Fallback packages if API fails or returns none
  if (packages.length === 0) {
    packages = [
        {
            id: 1, name: "Starter", tagline: "1,000 credits", price: 5, credits_amount: 1000,
            features: ["Single & Bulk Verification", "CSV Export", "API Access"],
            status: "active", popular: false
        },
        {
            id: 2, name: "Professional", tagline: "10,000 credits", price: 25, credits_amount: 10000,
            features: ["Everything in Starter", "Webhook Integration", "Real-time Dashboard"],
            status: "active", popular: true
        },
        {
            id: 3, name: "Enterprise", tagline: "100,000 credits", price: 99, credits_amount: 100000,
            features: ["Everything in Pro", "White-label Option", "Dedicated Worker Nodes"],
            status: "active", popular: false
        }
    ]
  }

  const jsonLd = {
    "@context": "https://schema.org",
    "@type": "SoftwareApplication",
    "name": siteTitle,
    "operatingSystem": "All",
    "applicationCategory": "BusinessApplication",
    "description": siteTagline,
    "offers": {
      "@type": "AggregateOffer",
      "priceCurrency": "USD",
      "lowPrice": "5",
      "highPrice": "99",
      "offerCount": "3"
    }
  }

  return (
    <div className="flex min-h-screen flex-col overflow-x-hidden bg-[#f0f4f2] text-[#0b1f1c] selection:bg-[#0f5c52]/20">
      <script
        type="application/ld+json"
        dangerouslySetInnerHTML={{ __html: JSON.stringify(jsonLd) }}
      />

      <Navbar siteTitle={siteTitle} logoUrl={logoUrl} />

      <main className="flex-1">
        <Hero siteTagline={siteTagline} />
        <Features />
        <Pricing packages={packages} />
        <FutureVision />

        <section id="support" className="relative bg-[#eef3f0] py-16 md:py-28">
          <div className="mx-auto max-w-7xl px-4 sm:px-6">
            <div className="mx-auto mb-10 max-w-xl text-center md:mb-12">
              <div className="mb-5 inline-flex items-center gap-2 rounded-full border border-[#0b1f1c]/10 bg-white/70 px-3 py-1 text-xs font-medium text-[#3d564f]">
                Help Center
              </div>
              <h2 className="mb-3 text-[1.65rem] font-semibold tracking-tight text-[#0b1f1c] sm:text-3xl md:text-4xl">
                Support & FAQ
              </h2>
              <p className="text-sm leading-relaxed text-[#4a635c] sm:text-base">
                Have questions or need a custom plan? Browse our FAQs or send us a message directly.
              </p>
            </div>

            <div className="grid grid-cols-1 items-start gap-8 lg:grid-cols-2 lg:gap-14">
              <FAQAccordion />
              <ContactForm supportConfigured={supportConfigured} />
            </div>
          </div>
        </section>

        <section className="relative bg-[#0f5c52] py-14 md:py-24">
          <div className="mx-auto max-w-3xl px-4 text-center sm:px-6">
            <div className="mb-5 inline-flex items-center gap-2 rounded-full border border-white/25 bg-white/10 px-3 py-1 text-xs font-medium text-white/90">
              Get Started
            </div>
            <h2 className="mb-3 text-[1.65rem] font-semibold tracking-tight text-white sm:text-3xl md:text-4xl">
              Ready to Clean Your Email Lists?
            </h2>
            <p className="mb-8 text-sm text-white/75 sm:text-base">
              Join thousands of marketers who trust our platform. Start verifying emails for free today.
            </p>
            <div className="flex flex-col justify-center gap-3 sm:flex-row">
              <Link
                href="/register"
                className="rounded-md border border-[#0b1f1c]/25 bg-white px-6 py-3 text-sm font-semibold text-[#0b1f1c] transition-colors hover:bg-[#e8f2ef]"
              >
                Start free — 100 credits
              </Link>
              <Link
                href="#pricing"
                className="rounded-md border border-white/50 px-6 py-3 text-sm font-medium text-white transition-colors hover:bg-white/10"
              >
                View pricing
              </Link>
            </div>
          </div>
        </section>
      </main>

      <Footer
        siteTitle={siteTitle}
        logoUrl={logoUrl}
        twitterUrl={twitterUrl}
        linkedinUrl={linkedinUrl}
        youtubeUrl={youtubeUrl}
        facebookUrl={facebookUrl}
      />
    </div>
  )
}
