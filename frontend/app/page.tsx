import Link from "next/link"
import { Metadata } from "next"
import { FAQAccordion } from "@/components/home/faq-accordion"
import { ContactForm } from "@/components/home/contact-form"
import { Navbar } from "@/components/home/navbar"
import { Hero } from "@/components/home/hero"
import { Features } from "@/components/home/features"
import { Pricing, type PackageRow } from "@/components/home/pricing"
import { Footer } from "@/components/home/footer"

const API_BASE_URL = process.env.API_BASE_URL || 'http://localhost:8000/api/v1'

export async function generateMetadata(): Promise<Metadata> {
  let title = "EmailJachai Pro"
  let tagline = "Professional Email Verification Platform"

  try {
    const res = await fetch(`${API_BASE_URL}/settings/public`, { next: { revalidate: 60 } })
    const json = await res.json()
    if (json.status === 'success' && json.data) {
      title = json.data.site_title || title
      tagline = json.data.site_tagline || tagline
    }
  } catch {}

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
  let logoUrl = ""

  let packages: PackageRow[] = []

  try {
    const res = await fetch(`${API_BASE_URL}/settings/public`, { next: { revalidate: 60 } })
    const json = await res.json()
    if (json.status === 'success' && json.data) {
      siteTitle = json.data.site_title || siteTitle
      siteTagline = json.data.site_tagline || siteTagline
      logoUrl = json.data.logo_url || ""
    }
  } catch {}

  try {
    const res = await fetch(`${API_BASE_URL}/packages/list`, { 
        next: { revalidate: 60 } 
    })
    const json = await res.json()
    if (json.status === 'success' && Array.isArray(json.data)) {
        packages = json.data.filter((p: PackageRow) => p.status === 'active')
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
    <div className="flex min-h-screen flex-col bg-[#030712] text-slate-200 overflow-x-hidden selection:bg-indigo-500/30">
      {/* JSON-LD Structured Data for AI & Search Engine Crawlers */}
      <script
        type="application/ld+json"
        dangerouslySetInnerHTML={{ __html: JSON.stringify(jsonLd) }}
      />

      {/* ─── NAVBAR ─── */}
      <Navbar siteTitle={siteTitle} logoUrl={logoUrl} />

      <main className="flex-1">
        {/* ─── HERO SECTION ─── */}
        <Hero siteTagline={siteTagline} />

        {/* ─── HOW IT WORKS / FEATURES ─── */}
        <Features />

        {/* ─── PRICING SECTION ─── */}
        <Pricing packages={packages} />

        {/* ─── FAQ & CONTACT SECTION ─── */}
        <section id="support" className="relative py-20 md:py-32 border-t border-white/5 bg-gradient-to-b from-[#030712] via-purple-950/20 to-[#030712]">
          <div className="relative z-10 mx-auto max-w-7xl px-6">
            
            <div className="text-center mb-16">
              <div className="inline-flex items-center gap-2 px-3 py-1 rounded-full border border-white/10 bg-white/[0.03] text-slate-300 text-xs font-medium mb-6">
                Help Center
              </div>
              <h2 className="text-3xl md:text-4xl font-bold tracking-tight mb-4">
                Support & FAQ
              </h2>
              <p className="text-base text-slate-400 max-w-xl mx-auto">
                Have questions or need a custom plan? Browse our FAQs or send us a message directly.
              </p>
            </div>

            <div className="grid grid-cols-1 lg:grid-cols-2 gap-8 lg:gap-10 items-start">
              
              {/* FAQ Column */}
              <div>
                <FAQAccordion />
              </div>

              {/* Contact Column */}
              <div>
                <ContactForm />
              </div>

            </div>
          </div>
        </section>

        {/* ─── CTA SECTION ─── */}
        <section className="relative py-24 md:py-32 border-t border-white/5 bg-gradient-to-br from-indigo-900/20 via-[#030712] to-purple-900/20">
          <div className="relative z-10 mx-auto max-w-2xl px-6 text-center">
            <div className="inline-flex items-center gap-2 px-3 py-1 rounded-full border border-white/10 bg-white/[0.03] text-slate-300 text-xs font-medium mb-6">
              Get Started
            </div>
            <h2 className="text-3xl md:text-4xl font-bold tracking-tight mb-4">
              Ready to Clean Your Email Lists?
            </h2>
            <p className="text-base text-slate-400 mb-8">
              Join thousands of marketers who trust our platform. Start verifying emails for free today.
            </p>
            <div className="flex flex-col sm:flex-row gap-4 justify-center">
              <Link href="/register" className="px-6 py-3 rounded-xl bg-slate-200 text-slate-900 font-medium hover:bg-slate-300 transition-colors text-sm">
                Start Free — 100 Credits
              </Link>
              <Link href="#features" className="px-6 py-3 rounded-xl border border-white/10 text-slate-200 font-medium hover:bg-white/5 transition-colors text-sm">
                Learn More
              </Link>
            </div>
          </div>
        </section>
      </main>

      {/* ─── FOOTER ─── */}
      <Footer siteTitle={siteTitle} logoUrl={logoUrl} />
    </div>
  )
}
