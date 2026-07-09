export function Features() {
    return (
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
    )
}
