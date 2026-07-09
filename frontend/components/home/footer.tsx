import Link from "next/link"
import Image from "next/image"
import { ShieldCheck } from "lucide-react"

interface FooterProps {
    siteTitle: string
    logoUrl: string
}

export function Footer({ siteTitle, logoUrl }: FooterProps) {
    return (
        <footer className="border-t border-white/5 bg-[#030712]">
            <div className="mx-auto max-w-7xl px-6 py-12">
                <div className="grid gap-8 md:grid-cols-4">
                    {/* Brand */}
                    <div className="md:col-span-2">
                        <Link href="/" className="flex items-center gap-2.5 font-bold text-lg text-slate-200 mb-4">
                            {logoUrl ? (
                                <Image src={logoUrl} alt="Logo" width={24} height={24} className="h-6 w-6 object-contain" />
                            ) : (
                                <ShieldCheck className="h-6 w-6 text-indigo-500 shrink-0" />
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
    )
}
