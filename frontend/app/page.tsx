import Link from "next/link"
import { Button } from "@/components/common/button"
import { CheckCircle2, Zap, Shield, Globe } from "lucide-react"

const API_BASE_URL = process.env.API_BASE_URL || 'http://localhost:8000/api/v1'

export default async function Home() {
  let siteTitle = "EmailJachai Pro"
  let siteTagline = "Verify Emails with Precision"
  let logoUrl = ""

  try {
    const res = await fetch(`${API_BASE_URL}/settings/public`, { next: { revalidate: 60 } })
    const json = await res.json()
    if (json.status === 'success' && json.data) {
      siteTitle = json.data.site_title || siteTitle
      siteTagline = json.data.site_tagline || siteTagline
      logoUrl = json.data.logo_url || ""
    }
  } catch {}

  return (
    <div className="flex min-h-screen flex-col">
      <header className="px-4 lg:px-6 h-14 flex items-center border-b bg-white dark:bg-slate-950">
        <Link className="flex items-center justify-center font-bold text-lg text-slate-900 dark:text-white" href="#">
          {logoUrl ? (
             <img src={logoUrl} alt="Logo" className="mr-2 h-6 w-6 object-contain" />
          ) : (
             <Globe className="mr-2 h-5 w-5 text-indigo-600 dark:text-indigo-400" />
          )}
          {siteTitle}
        </Link>
        <nav className="ml-auto flex gap-4 sm:gap-6">
          <Link className="text-sm font-medium hover:underline underline-offset-4" href="/login">
            Login
          </Link>
          <Link className="text-sm font-medium hover:underline underline-offset-4" href="/register">
            Register
          </Link>
        </nav>
      </header>
      <main className="flex-1">
        <section className="w-full py-12 md:py-24 lg:py-32 xl:py-48 bg-slate-900 text-slate-50">
          <div className="container px-4 md:px-6">
            <div className="flex flex-col items-center space-y-4 text-center">
              <div className="space-y-2">
                <h1 className="text-3xl font-bold tracking-tighter sm:text-4xl md:text-5xl lg:text-6xl/none">
                  {siteTagline}
                </h1>
                <p className="mx-auto max-w-[700px] text-slate-400 md:text-xl">
                  Clean your email lists, improve deliverability, and protect your sender reputation with our enterprise-grade verification system.
                </p>
              </div>
              <div className="space-x-4">
                <Button asChild className="bg-white text-slate-900 hover:bg-slate-200">
                  <Link href="/register">Get Started</Link>
                </Button>
                <Button variant="outline" className="text-white border-white hover:bg-slate-800 hover:text-white">
                  <Link href="/login">Login</Link>
                </Button>
              </div>
            </div>
          </div>
        </section>
        <section className="w-full py-12 md:py-24 lg:py-32 bg-slate-50 dark:bg-slate-900">
          <div className="container px-4 md:px-6">
            <div className="grid gap-10 sm:grid-cols-2 lg:grid-cols-3">
              <div className="flex flex-col items-center space-y-2 border-slate-200 p-4 rounded-lg bg-white dark:bg-slate-950 shadow-sm">
                <div className="p-2 bg-slate-100 dark:bg-slate-800 rounded-full">
                  <CheckCircle2 className="h-6 w-6 text-green-500" />
                </div>
                <h2 className="text-xl font-bold">99% Accuracy</h2>
                <p className="text-center text-slate-500 dark:text-slate-400">
                  Our multi-step verification process ensures the highest accuracy in the industry.
                </p>
              </div>
              <div className="flex flex-col items-center space-y-2 border-slate-200 p-4 rounded-lg bg-white dark:bg-slate-950 shadow-sm">
                <div className="p-2 bg-slate-100 dark:bg-slate-800 rounded-full">
                  <Zap className="h-6 w-6 text-yellow-500" />
                </div>
                <h2 className="text-xl font-bold">High Speed</h2>
                <p className="text-center text-slate-500 dark:text-slate-400">
                  Process millions of emails in minutes with our distributed backend architecture.
                </p>
              </div>
              <div className="flex flex-col items-center space-y-2 border-slate-200 p-4 rounded-lg bg-white dark:bg-slate-950 shadow-sm">
                <div className="p-2 bg-slate-100 dark:bg-slate-800 rounded-full">
                  <Shield className="h-6 w-6 text-blue-500" />
                </div>
                <h2 className="text-xl font-bold">Secure & Private</h2>
                <p className="text-center text-slate-500 dark:text-slate-400">
                  Your data is encrypted and processed securely. We never share your lists.
                </p>
              </div>
            </div>
          </div>
        </section>
      </main>
      <footer className="flex flex-col gap-2 sm:flex-row py-6 w-full shrink-0 items-center px-4 md:px-6 border-t">
        <p className="text-xs text-slate-500 dark:text-slate-400">© 2024 {siteTitle}. All rights reserved.</p>
        <nav className="sm:ml-auto flex gap-4 sm:gap-6">
          <Link className="text-xs hover:underline underline-offset-4" href="#">
            Terms of Service
          </Link>
          <Link className="text-xs hover:underline underline-offset-4" href="#">
            Privacy
          </Link>
        </nav>
      </footer>
    </div>
  )
}
