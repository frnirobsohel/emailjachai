"use client"

import { useState } from "react"
import { Check, Copy, Terminal } from "lucide-react"

interface InstallCommandBoxProps {
    command: string
    title?: string
    subtitle?: string
}

export function InstallCommandBox({
    command,
    title = "Deploy on fresh Ubuntu / Debian / Rocky VPS",
    subtitle = "Installs Docker, Caddy auto-SSL, PostgreSQL, Redis, Worker, and API with 1 command",
}: InstallCommandBoxProps) {
    const [copied, setCopied] = useState(false)

    const handleCopy = async () => {
        try {
            await navigator.clipboard.writeText(command)
            setCopied(true)
            setTimeout(() => setCopied(false), 2000)
        } catch {
            // Fallback for non-secure contexts
            const el = document.createElement("textarea")
            el.value = command
            document.body.appendChild(el)
            el.select()
            document.execCommand("copy")
            document.body.removeChild(el)
            setCopied(true)
            setTimeout(() => setCopied(false), 2000)
        }
    }

    return (
        <div className="w-full overflow-hidden rounded-xl border border-[#0f5c52]/20 bg-[#081b18] text-left shadow-2xl">
            {/* Terminal Titlebar */}
            <div className="flex items-center justify-between border-b border-white/10 bg-white/[0.04] px-4 py-2.5 text-xs text-white/60">
                <div className="flex items-center gap-2">
                    <div className="flex gap-1.5">
                        <span className="h-2.5 w-2.5 rounded-full bg-[#ff5f56]/80" />
                        <span className="h-2.5 w-2.5 rounded-full bg-[#ffbd2e]/80" />
                        <span className="h-2.5 w-2.5 rounded-full bg-[#27c93f]/80" />
                    </div>
                    <span className="ml-2 flex items-center gap-1.5 font-mono text-[11px] text-white/50">
                        <Terminal className="h-3 w-3 text-[#14b8a6]" />
                        bash installer
                    </span>
                </div>
                <span className="hidden font-sans text-[11px] text-white/40 sm:inline">
                    Port 25 outbound required
                </span>
            </div>

            {/* Code Body */}
            <div className="p-4 sm:p-5">
                <div className="mb-2">
                    <p className="text-xs font-medium text-white/80">{title}</p>
                    <p className="text-[11px] text-white/40">{subtitle}</p>
                </div>

                <div className="relative mt-3 flex items-center justify-between gap-3 rounded-lg border border-white/10 bg-black/40 p-3 font-mono text-xs sm:text-sm">
                    <div className="flex items-center gap-2 overflow-x-auto text-[#14b8a6]">
                        <span className="select-none text-white/30">$</span>
                        <code className="whitespace-pre text-emerald-300 font-medium">
                            {command}
                        </code>
                    </div>

                    <button
                        type="button"
                        onClick={handleCopy}
                        className="flex shrink-0 items-center gap-1.5 rounded-md border border-white/15 bg-white/10 px-3 py-1.5 text-xs font-medium text-white transition-all hover:bg-white/20 active:scale-95"
                        aria-label="Copy install command"
                    >
                        {copied ? (
                            <>
                                <Check className="h-3.5 w-3.5 text-emerald-400" />
                                <span className="text-emerald-400">Copied!</span>
                            </>
                        ) : (
                            <>
                                <Copy className="h-3.5 w-3.5 text-white/70" />
                                <span>Copy</span>
                            </>
                        )}
                    </button>
                </div>
            </div>
        </div>
    )
}
