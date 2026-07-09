import Link from "next/link"
import Image from "next/image"
import { ShieldCheck } from "lucide-react"

interface NavbarProps {
    siteTitle: string
    logoUrl: string
}

export function Navbar({ siteTitle, logoUrl }: NavbarProps) {
    return (
        <header className="fixed top-0 left-0 right-0 z-50 border-b border-white/5 bg-[#030712]/80 backdrop-blur-xl">
            <div className="mx-auto max-w-7xl px-6 h-16 flex items-center justify-between">
                <Link href="/" className="flex items-center gap-2.5 font-bold text-lg tracking-tight text-slate-200">
                    {logoUrl ? (
                        <Image src={logoUrl} alt="Logo" width={28} height={28} className="h-7 w-7 object-contain" />
                    ) : (
                        <ShieldCheck className="h-7 w-7 text-indigo-500 shrink-0" />
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
    )
}
