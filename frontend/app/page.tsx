import Link from "next/link"
import { Metadata } from "next"
import { FAQAccordion } from "@/components/home/faq-accordion"
import { HomeEmailVerifier } from "@/components/home/home-email-verifier"

type PackageRow = {
    id: number
    name: string
    tagline: string
    price: number
    credits_amount: number
    features: string[]
    status: string
    popular: boolean
}

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
        headers: {
            'Authorization': `Bearer ${process.env.ADMIN_API_KEY || ''}`
        },
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

  return (
    <div className="flex min-h-screen flex-col bg-[#030712] text-slate-200 overflow-x-hidden selection:bg-indigo-500/30">
      {/* ─── NAVBAR ─── */}
      <header className="fixed top-0 left-0 right-0 z-50 border-b border-white/5 bg-[#030712]/80 backdrop-blur-xl">
        <div className="mx-auto max-w-7xl px-6 h-16 flex items-center justify-between">
          <Link href="/" className="flex items-center gap-2.5 font-bold text-lg tracking-tight text-slate-200">
            {logoUrl ? (
              <img src={logoUrl} alt="Logo" className="h-7 w-7 object-contain" />
            ) : (
              <div className="h-8 w-8 rounded-lg bg-gradient-to-br from-indigo-500 to-purple-600 flex items-center justify-center shadow-lg shadow-indigo-500/25">
                <svg className="h-4 w-4 text-slate-200" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2.5}><path strokeLinecap="round" strokeLinejoin="round" d="M3 8l7.89 5.26a2 2 0 002.22 0L21 8M5 19h14a2 2 0 002-2V7a2 2 0 00-2-2H5a2 2 0 00-2 2v10a2 2 0 002 2z" /></svg>
              </div>
            )}
            {siteTitle}
          </Link>
          <nav className="flex items-center gap-2">
            <Link href="#features" className="hidden md:inline-flex px-4 py-2 text-sm text-slate-400 hover:text-slate-200 transition-colors">Features</Link>
            <Link href="#pricing" className="hidden md:inline-flex px-4 py-2 text-sm text-slate-400 hover:text-slate-200 transition-colors">Pricing</Link>
            <Link href="#support" className="hidden md:inline-flex px-4 py-2 text-sm text-slate-400 hover:text-slate-200 transition-colors">Support</Link>
            <Link href="/login" className="px-4 py-2 text-sm font-medium text-slate-300 hover:text-slate-200 transition-colors">Login</Link>
            <Link href="/register" className="px-5 py-2.5 text-sm font-semibold rounded-xl bg-slate-200 text-slate-900 shadow-lg shadow-white/5 transition-all hover:-translate-y-0.5 hover:bg-slate-300">
              Get Started
            </Link>
          </nav>
        </div>
      </header>

      <main className="flex-1">
        {/* ─── HERO SECTION ─── */}
        <section className="relative pt-24 pb-16 md:pt-32 md:pb-24 overflow-hidden">
          {/* Background Effects */}
          <div className="absolute inset-0">
            <div className="absolute top-1/4 left-1/2 -translate-x-1/2 w-[800px] h-[600px] bg-gradient-to-r from-indigo-500/20 via-purple-500/15 to-pink-500/10 rounded-full blur-[120px]" />
            <div className="absolute top-0 left-0 w-full h-full bg-[radial-gradient(ellipse_at_top,_var(--tw-gradient-stops))] from-indigo-900/20 via-transparent to-transparent" />
            {/* Grid Pattern */}
            <div className="absolute inset-0 bg-[linear-gradient(rgba(255,255,255,0.02)_1px,transparent_1px),linear-gradient(90deg,rgba(255,255,255,0.02)_1px,transparent_1px)] bg-[size:64px_64px]" />
          </div>

          <div className="relative z-10 mx-auto max-w-4xl px-6 text-center">
            {/* Badge */}
            <div className="inline-flex items-center gap-2 px-4 py-1.5 rounded-full border border-indigo-500/30 bg-indigo-500/10 text-indigo-300 text-xs font-medium mb-8 backdrop-blur-sm">
              <span className="h-1.5 w-1.5 rounded-full bg-indigo-400 animate-pulse" />
              Enterprise-Grade Email Verification
            </div>

            {/* Title */}
            <h1 className="text-4xl sm:text-5xl md:text-6xl font-bold tracking-tight leading-[1.1] mb-6 text-slate-200">
              {siteTagline}
            </h1>

            {/* Subtitle */}
            <p className="text-base md:text-lg text-slate-400 max-w-2xl mx-auto mb-10 leading-relaxed">
              Clean your email lists, improve deliverability, and protect your sender reputation with real-time SMTP verification.
            </p>

            {/* Email Verify Input */}
            <div className="mt-8">
                <HomeEmailVerifier />
            </div>

            {/* Stats */}
            <div className="grid grid-cols-3 gap-6 mt-16 max-w-lg mx-auto">
              <div>
                <div className="text-2xl md:text-3xl font-bold bg-gradient-to-r from-indigo-400 to-purple-400 bg-clip-text text-transparent">99.2%</div>
                <div className="text-xs text-slate-500 mt-1">Accuracy Rate</div>
              </div>
              <div>
                <div className="text-2xl md:text-3xl font-bold bg-gradient-to-r from-purple-400 to-pink-400 bg-clip-text text-transparent">50M+</div>
                <div className="text-xs text-slate-500 mt-1">Emails Verified</div>
              </div>
              <div>
                <div className="text-2xl md:text-3xl font-bold bg-gradient-to-r from-pink-400 to-rose-400 bg-clip-text text-transparent">500ms</div>
                <div className="text-xs text-slate-500 mt-1">Avg Response</div>
              </div>
            </div>
          </div>
        </section>

        {/* ─── HOW IT WORKS / FEATURES ─── */}
        <section id="features" className="relative py-20 md:py-32 border-t border-white/5 bg-gradient-to-b from-[#030712] via-indigo-950/20 to-[#030712]">
          <div className="relative z-10 mx-auto max-w-7xl px-6">
            <div className="text-center mb-20">
              <div className="inline-flex items-center gap-2 px-3 py-1 rounded-full border border-white/10 bg-white/[0.03] text-slate-300 text-xs font-medium mb-6">
                Features
              </div>
              <h2 className="text-3xl md:text-4xl font-bold tracking-tight mb-4">
                Multi-Layer Email Verification
              </h2>
              <p className="text-base text-slate-400 max-w-2xl mx-auto">
                Our system runs multiple checks to ensure every email in your list is valid, safe, and deliverable.
              </p>
            </div>

            <div className="grid gap-6 sm:grid-cols-2 lg:grid-cols-4">
              {/* Card 1 */}
              <div className="group p-6 rounded-2xl border border-white/5 bg-white/[0.02] hover:bg-white/[0.04] transition-all duration-300">
                <div className="h-10 w-10 rounded-lg bg-indigo-500/10 border border-indigo-500/20 flex items-center justify-center mb-5">
                  <svg className="h-5 w-5 text-indigo-400" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={1.5}><path strokeLinecap="round" strokeLinejoin="round" d="M17.25 6.75L22.5 12l-5.25 5.25m-10.5 0L1.5 12l5.25-5.25m7.5-3l-4.5 16.5" /></svg>
                </div>
                <h3 className="text-base font-semibold mb-2">Syntax Check</h3>
                <p className="text-sm text-slate-400 leading-relaxed">Validates email format against RFC 5322 standards to catch typos and invalid patterns instantly.</p>
              </div>

              {/* Card 2 */}
              <div className="group p-6 rounded-2xl border border-white/5 bg-white/[0.02] hover:bg-white/[0.04] transition-all duration-300">
                <div className="h-10 w-10 rounded-lg bg-indigo-500/10 border border-indigo-500/20 flex items-center justify-center mb-5">
                  <svg className="h-5 w-5 text-indigo-400" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={1.5}><path strokeLinecap="round" strokeLinejoin="round" d="M5.25 14.25h13.5m-13.5 0a3 3 0 01-3-3m3 3a3 3 0 100 6h13.5a3 3 0 100-6m-16.5-3a3 3 0 013-3h13.5a3 3 0 013 3m-19.5 0a4.5 4.5 0 01.9-2.7L5.737 5.1a3.375 3.375 0 012.7-1.35h7.126c1.062 0 2.062.5 2.7 1.35l2.587 3.45a4.5 4.5 0 01.9 2.7" /></svg>
                </div>
                <h3 className="text-base font-semibold mb-2">MX Record Lookup</h3>
                <p className="text-sm text-slate-400 leading-relaxed">Checks if the domain has valid mail exchange records configured and resolves DNS properly.</p>
              </div>

              {/* Card 3 */}
              <div className="group p-6 rounded-2xl border border-white/5 bg-white/[0.02] hover:bg-white/[0.04] transition-all duration-300">
                <div className="h-10 w-10 rounded-lg bg-indigo-500/10 border border-indigo-500/20 flex items-center justify-center mb-5">
                  <svg className="h-5 w-5 text-indigo-400" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={1.5}><path strokeLinecap="round" strokeLinejoin="round" d="M7.5 21L3 16.5m0 0L7.5 12M3 16.5h13.5m0-13.5L21 7.5m0 0L16.5 12M21 7.5H7.5" /></svg>
                </div>
                <h3 className="text-base font-semibold mb-2">SMTP Verification</h3>
                <p className="text-sm text-slate-400 leading-relaxed">Connects to the mail server and verifies if the specific mailbox exists without sending an email.</p>
              </div>

              {/* Card 4 */}
              <div className="group p-6 rounded-2xl border border-white/5 bg-white/[0.02] hover:bg-white/[0.04] transition-all duration-300">
                <div className="h-10 w-10 rounded-lg bg-indigo-500/10 border border-indigo-500/20 flex items-center justify-center mb-5">
                  <svg className="h-5 w-5 text-indigo-400" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={1.5}><path strokeLinecap="round" strokeLinejoin="round" d="M12 9v3.75m-9.303 3.376c-.866 1.5.217 3.374 1.948 3.374h14.71c1.73 0 2.813-1.874 1.948-3.374L13.949 3.378c-.866-1.5-3.032-1.5-3.898 0L2.697 16.126zM12 15.75h.007v.008H12v-.008z" /></svg>
                </div>
                <h3 className="text-base font-semibold mb-2">Risk Detection</h3>
                <p className="text-sm text-slate-400 leading-relaxed">Identifies disposable emails, spam traps, role-based accounts, catch-all domains, and blacklisted addresses.</p>
              </div>

              {/* Card 5 */}
              <div className="group p-6 rounded-2xl border border-white/5 bg-white/[0.02] hover:bg-white/[0.04] transition-all duration-300">
                <div className="h-10 w-10 rounded-lg bg-indigo-500/10 border border-indigo-500/20 flex items-center justify-center mb-5">
                  <svg className="h-5 w-5 text-indigo-400" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={1.5}><path strokeLinecap="round" strokeLinejoin="round" d="M9 12.75L11.25 15 15 9.75m-3-7.036A11.959 11.959 0 013.598 6 11.99 11.99 0 003 9.749c0 5.592 3.824 10.29 9 11.623 5.176-1.332 9-6.03 9-11.622 0-1.31-.21-2.571-.598-3.751h-.152c-3.196 0-6.1-1.248-8.25-3.285z" /></svg>
                </div>
                <h3 className="text-base font-semibold mb-2">Spam Trap Detection</h3>
                <p className="text-sm text-slate-400 leading-relaxed">Advanced algorithms detect known spam traps and honeypots to protect your sender score.</p>
              </div>

              {/* Card 6 */}
              <div className="group p-6 rounded-2xl border border-white/5 bg-white/[0.02] hover:bg-white/[0.04] transition-all duration-300">
                <div className="h-10 w-10 rounded-lg bg-indigo-500/10 border border-indigo-500/20 flex items-center justify-center mb-5">
                  <svg className="h-5 w-5 text-indigo-400" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={1.5}><path strokeLinecap="round" strokeLinejoin="round" d="M3.75 13.5l10.5-11.25L12 10.5h8.25L9.75 21.75 12 13.5H3.75z" /></svg>
                </div>
                <h3 className="text-base font-semibold mb-2">Bulk Processing</h3>
                <p className="text-sm text-slate-400 leading-relaxed">Upload CSV files with millions of emails and verify them all at blazing speed with parallel workers.</p>
              </div>

              {/* Card 7 */}
              <div className="group p-6 rounded-2xl border border-white/5 bg-white/[0.02] hover:bg-white/[0.04] transition-all duration-300">
                <div className="h-10 w-10 rounded-lg bg-indigo-500/10 border border-indigo-500/20 flex items-center justify-center mb-5">
                  <svg className="h-5 w-5 text-indigo-400" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={1.5}><path strokeLinecap="round" strokeLinejoin="round" d="M11.42 15.17l-5.384 3.173 1.627-5.99-4.66-3.84 6.09-.29L11.42 2.4l2.327 5.823 6.09.29-4.66 3.84 1.627 5.99-5.384-3.173z" /></svg>
                </div>
                <h3 className="text-base font-semibold mb-2">Catch-All Detection</h3>
                <p className="text-sm text-slate-400 leading-relaxed">Identifies domains that accept all emails regardless of the recipient, flagging uncertain deliverability.</p>
              </div>

              {/* Card 8 */}
              <div className="group p-6 rounded-2xl border border-white/5 bg-white/[0.02] hover:bg-white/[0.04] transition-all duration-300">
                <div className="h-10 w-10 rounded-lg bg-indigo-500/10 border border-indigo-500/20 flex items-center justify-center mb-5">
                  <svg className="h-5 w-5 text-indigo-400" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={1.5}><path strokeLinecap="round" strokeLinejoin="round" d="M15.75 5.25a3 3 0 013 3m3 0a6 6 0 01-7.029 5.912c-.563-.097-1.159.026-1.563.43L10.5 17.25H8.25v2.25H6v2.25H2.25v-2.818c0-.597.237-1.17.659-1.591l6.499-6.499c.404-.404.527-1 .43-1.563A6 6 0 1121.75 8.25z" /></svg>
                </div>
                <h3 className="text-base font-semibold mb-2">REST API Access</h3>
                <p className="text-sm text-slate-400 leading-relaxed">Integrate email verification into your app with our developer-friendly API. Full documentation included.</p>
              </div>
            </div>
          </div>
        </section>

        {/* ─── PRICING SECTION ─── */}
        <section id="pricing" className="relative py-20 md:py-32 border-t border-white/5 bg-slate-900/20">
          <div className="relative z-10 mx-auto max-w-5xl px-6">
            <div className="text-center mb-16">
              <div className="inline-flex items-center gap-2 px-3 py-1 rounded-full border border-white/10 bg-white/[0.03] text-slate-300 text-xs font-medium mb-6">
                Pricing
              </div>
              <h2 className="text-3xl md:text-4xl font-bold tracking-tight mb-4">
                Pay Only for What You Use
              </h2>
              <p className="text-base text-slate-400 max-w-xl mx-auto">
                No monthly fees, no hidden charges. Buy credits and verify emails at your own pace.
              </p>
            </div>

            <div className="grid gap-6 md:grid-cols-3">
              {packages.map(pkg => (
                <div key={pkg.id} className={`relative p-8 rounded-2xl border transition-colors ${pkg.popular ? 'border-indigo-500/30 bg-indigo-500/[0.03]' : 'border-white/5 bg-white/[0.01] hover:bg-white/[0.03]'}`}>
                  {pkg.popular && (
                    <div className="absolute -top-3 left-1/2 -translate-x-1/2 px-3 py-1 rounded-full bg-indigo-500 text-[10px] font-bold text-slate-200 tracking-wider uppercase">
                      Most Popular
                    </div>
                  )}
                  <h3 className={`text-base font-medium mb-2 ${pkg.popular ? 'text-indigo-300' : 'text-slate-300'}`}>{pkg.name}</h3>
                  <div className="flex items-baseline gap-1 mb-1">
                    <span className="text-4xl font-bold text-slate-200">${pkg.price}</span>
                  </div>
                  <p className="text-sm text-slate-500 mb-8">{pkg.credits_amount.toLocaleString()} credits</p>
                  
                  <ul className="space-y-4 mb-8">
                    {pkg.features?.map((feature, idx) => (
                      <li key={idx} className={`flex items-center gap-3 text-sm ${pkg.popular ? 'text-slate-300' : 'text-slate-400'}`}>
                        <svg className="h-4 w-4 text-indigo-400 flex-shrink-0" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2.5}><path strokeLinecap="round" strokeLinejoin="round" d="M4.5 12.75l6 6 9-13.5" /></svg>
                        {feature}
                      </li>
                    ))}
                  </ul>
                  
                  <Link href="/register" className={`block w-full text-center py-2.5 rounded-xl text-sm font-medium transition-colors ${pkg.popular ? 'bg-indigo-600 hover:bg-indigo-500 text-slate-200' : 'border border-white/10 hover:bg-white/5 text-slate-200'}`}>
                    Get Started
                  </Link>
                </div>
              ))}
            </div>
          </div>
        </section>

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
                <div className="p-6 sm:p-8 rounded-2xl border border-white/5 bg-white/[0.01]">
                  <form className="space-y-4">
                    <div className="grid gap-4 sm:grid-cols-2">
                      <div>
                        <label htmlFor="contact-name" className="block text-sm font-medium text-slate-400 mb-1.5">Name</label>
                        <input
                          id="contact-name"
                          type="text"
                          placeholder="Your name"
                          className="w-full px-4 py-2.5 rounded-xl bg-white/[0.03] border border-white/10 text-slate-200 placeholder:text-slate-600 focus:outline-none focus:border-indigo-500/50 text-sm transition-colors"
                        />
                      </div>
                      <div>
                        <label htmlFor="contact-email" className="block text-sm font-medium text-slate-400 mb-1.5">Email</label>
                        <input
                          id="contact-email"
                          type="email"
                          placeholder="you@example.com"
                          className="w-full px-4 py-2.5 rounded-xl bg-white/[0.03] border border-white/10 text-slate-200 placeholder:text-slate-600 focus:outline-none focus:border-indigo-500/50 text-sm transition-colors"
                        />
                      </div>
                    </div>
                    <div>
                      <label htmlFor="contact-subject" className="block text-sm font-medium text-slate-400 mb-1.5">Subject</label>
                      <input
                        id="contact-subject"
                        type="text"
                        placeholder="How can we help?"
                        className="w-full px-4 py-2.5 rounded-xl bg-white/[0.03] border border-white/10 text-slate-200 placeholder:text-slate-600 focus:outline-none focus:border-indigo-500/50 text-sm transition-colors"
                      />
                    </div>
                    <div>
                      <label htmlFor="contact-message" className="block text-sm font-medium text-slate-400 mb-1.5">Message</label>
                      <textarea
                        id="contact-message"
                        rows={4}
                        placeholder="Tell us more..."
                        className="w-full px-4 py-2.5 rounded-xl bg-white/[0.03] border border-white/10 text-slate-200 placeholder:text-slate-600 focus:outline-none focus:border-indigo-500/50 text-sm transition-colors resize-none"
                      />
                    </div>
                    <button
                      type="submit"
                      className="w-full py-3 rounded-xl bg-indigo-600 hover:bg-indigo-500 text-sm font-medium text-slate-200 transition-colors"
                    >
                      Send Message
                    </button>
                  </form>
                </div>
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
      <footer className="border-t border-white/5 bg-[#030712]">
        <div className="mx-auto max-w-7xl px-6 py-12">
          <div className="grid gap-8 md:grid-cols-4">
            {/* Brand */}
            <div className="md:col-span-2">
              <Link href="/" className="flex items-center gap-2.5 font-bold text-lg text-slate-200 mb-4">
                {logoUrl ? (
                  <img src={logoUrl} alt="Logo" className="h-6 w-6 object-contain" />
                ) : (
                  <div className="h-6 w-6 rounded-md bg-indigo-500 flex items-center justify-center">
                    <svg className="h-3 w-3 text-slate-200" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2.5}><path strokeLinecap="round" strokeLinejoin="round" d="M3 8l7.89 5.26a2 2 0 002.22 0L21 8M5 19h14a2 2 0 002-2V7a2 2 0 00-2-2H5a2 2 0 00-2 2v10a2 2 0 002 2z" /></svg>
                  </div>
                )}
                {siteTitle}
              </Link>
              <p className="text-sm text-slate-500 max-w-sm leading-relaxed mb-6">
                Enterprise-grade email verification platform. Protect your sender reputation and improve email deliverability.
              </p>
              <div className="space-y-2">
                <div className="flex items-start gap-2 text-slate-500">
                  <svg className="h-4 w-4 mt-0.5 flex-shrink-0" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}><path strokeLinecap="round" strokeLinejoin="round" d="M15 10.5a3 3 0 11-6 0 3 3 0 016 0z" /><path strokeLinecap="round" strokeLinejoin="round" d="M19.5 10.5c0 7.142-7.5 11.25-7.5 11.25S4.5 17.642 4.5 10.5a7.5 7.5 0 1115 0z" /></svg>
                  <span className="text-sm">Chowgacha, Jessore, Khulna 7410 - Bangladesh</span>
                </div>
              </div>

              <div className="flex items-center gap-4 mt-6">
                <a href="#" className="text-slate-500 hover:text-slate-200 transition-colors" title="LinkedIn">
                  <svg className="h-5 w-5" fill="currentColor" viewBox="0 0 24 24"><path d="M19 0h-14c-2.761 0-5 2.239-5 5v14c0 2.761 2.239 5 5 5h14c2.762 0 5-2.239 5-5v-14c0-2.761-2.238-5-5-5zm-11 19h-3v-11h3v11zm-1.5-12.268c-.966 0-1.75-.79-1.75-1.764s.784-1.764 1.75-1.764 1.75.79 1.75 1.764-.783 1.764-1.75 1.764zm13.5 12.268h-3v-5.604c0-3.368-4-3.113-4 0v5.604h-3v-11h3v1.765c1.396-2.586 7-2.777 7 2.476v6.759z"/></svg>
                </a>
                <a href="#" className="text-slate-500 hover:text-slate-200 transition-colors" title="X (Twitter)">
                  <svg className="h-5 w-5" fill="currentColor" viewBox="0 0 24 24"><path d="M18.244 2.25h3.308l-7.227 8.26 8.502 11.24H16.17l-5.214-6.817L4.99 21.75H1.68l7.73-8.835L1.254 2.25H8.08l4.713 6.231zm-1.161 17.52h1.833L7.084 4.126H5.117z"/></svg>
                </a>
                <a href="#" className="text-slate-500 hover:text-slate-200 transition-colors" title="YouTube">
                  <svg className="h-5 w-5" fill="currentColor" viewBox="0 0 24 24"><path d="M23.498 6.186a3.016 3.016 0 0 0-2.122-2.136C19.505 3.545 12 3.545 12 3.545s-7.505 0-9.377.505A3.017 3.017 0 0 0 .502 6.186C0 8.07 0 12 0 12s0 3.93.502 5.814a3.016 3.016 0 0 0 2.122 2.136c1.871.505 9.376.505 9.376.505s7.505 0 9.377-.505a3.015 3.015 0 0 0 2.122-2.136C24 15.93 24 12 24 12s0-3.93-.502-5.814zM9.545 15.568V8.432L15.818 12l-6.273 3.568z"/></svg>
                </a>
                <a href="#" className="text-slate-500 hover:text-slate-200 transition-colors" title="Facebook">
                  <svg className="h-5 w-5" fill="currentColor" viewBox="0 0 24 24"><path d="M9 8h-3v4h3v12h5v-12h3.642l.358-4h-4v-1.667c0-.955.192-1.333 1.115-1.333h2.885v-5h-3.808c-3.596 0-5.192 1.583-5.192 4.615v3.385z"/></svg>
                </a>
              </div>
            </div>

            {/* Links */}
            <div>
              <h4 className="text-sm font-medium text-slate-200 mb-4">Product</h4>
              <ul className="space-y-3">
                <li><Link href="#features" className="text-sm text-slate-500 hover:text-slate-200 transition-colors">Features</Link></li>
                <li><Link href="#pricing" className="text-sm text-slate-500 hover:text-slate-200 transition-colors">Pricing</Link></li>
                <li><Link href="#support" className="text-sm text-slate-500 hover:text-slate-200 transition-colors">FAQ</Link></li>
                <li><Link href="/register" className="text-sm text-slate-500 hover:text-slate-200 transition-colors">Get Started</Link></li>
              </ul>
            </div>

            <div>
              <h4 className="text-sm font-medium text-slate-200 mb-4">Legal</h4>
              <ul className="space-y-3">
                <li><Link href="#" className="text-sm text-slate-500 hover:text-slate-200 transition-colors">Terms of Service</Link></li>
                <li><Link href="#" className="text-sm text-slate-500 hover:text-slate-200 transition-colors">Privacy Policy</Link></li>
                <li><Link href="#support" className="text-sm text-slate-500 hover:text-slate-200 transition-colors">Contact</Link></li>
              </ul>
            </div>
          </div>

          <div className="h-px bg-white/5 my-8" />
          <p className="text-xs text-slate-600">© {new Date().getFullYear()} {siteTitle}. All rights reserved.</p>
        </div>
      </footer>
    </div>
  )
}
