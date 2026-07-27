import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card"
import { Button } from "@/components/ui/button"
import Link from "next/link"
import { ArrowRight, Mail, Upload, List, Activity, Zap, Coins } from "lucide-react"

export function QuickActions() {
    return (
        <Card className="col-span-1 flex h-full flex-col overflow-hidden border-[#0b1f1c]/10 bg-white/90 shadow-none lg:col-span-3">
            <CardHeader className="border-b border-[#0b1f1c]/8 bg-[#f0f4f2]/60 p-4">
                <CardTitle className="text-lg font-semibold text-[#0b1f1c]">Quick Actions</CardTitle>
                <CardDescription className="text-[#5a736c]">Common tasks</CardDescription>
            </CardHeader>
            <CardContent className="flex flex-1 flex-col space-y-3 p-4">
                <div className="grid grid-cols-2 gap-3">
                    <Button
                        className="flex h-auto flex-col items-center justify-center gap-1.5 border border-[#08352f] bg-[#0f5c52] py-3 text-white shadow-none hover:bg-[#0b4a42]"
                        asChild
                    >
                        <Link href="/dashboard/single-verify">
                            <Mail className="mb-0.5 h-5 w-5" />
                            <span className="text-xs font-semibold">Single</span>
                        </Link>
                    </Button>
                    <Button
                        variant="outline"
                        className="flex h-auto flex-col items-center justify-center gap-1.5 border-[#0b1f1c]/15 bg-white py-3 text-[#0b1f1c] hover:border-[#0f5c52] hover:bg-[#0f5c52]/5 hover:text-[#0f5c52]"
                        asChild
                    >
                        <Link href="/dashboard/bulk-upload">
                            <Upload className="mb-0.5 h-5 w-5" />
                            <span className="text-xs font-semibold">Bulk</span>
                        </Link>
                    </Button>
                </div>

                <Button
                    variant="outline"
                    className="group h-10 w-full justify-between border-[#0b1f1c]/15 text-xs font-medium hover:border-amber-300 hover:bg-amber-50/50 hover:text-amber-700"
                    asChild
                >
                    <Link href="/dashboard/credits">
                        <span className="flex items-center text-[#4a635c] transition-colors group-hover:text-amber-700">
                            <Coins className="mr-2 h-3.5 w-3.5 text-amber-600" /> Buy / Top-up Credits
                        </span>
                        <ArrowRight className="h-3.5 w-3.5 text-[#8aa099] transition-colors group-hover:text-amber-700" />
                    </Link>
                </Button>

                <Button
                    variant="outline"
                    className="group h-10 w-full justify-between border-[#0b1f1c]/15 text-xs font-medium hover:border-[#0f5c52]/40 hover:bg-[#0f5c52]/5"
                    asChild
                >
                    <Link href="/dashboard/jobs">
                        <span className="flex items-center text-[#4a635c] transition-colors group-hover:text-[#0f5c52]">
                            <List className="mr-2 h-3.5 w-3.5" /> View All Jobs
                        </span>
                        <ArrowRight className="h-3.5 w-3.5 text-[#8aa099] transition-colors group-hover:text-[#0f5c52]" />
                    </Link>
                </Button>

                <div className="mt-auto pt-1">
                    <Link href="/dashboard/api-keys" className="block">
                        <div className="group relative overflow-hidden rounded-md border border-[#08352f]/40 bg-[#0b1f1c] text-white transition-colors hover:bg-[#0f2a26]">
                            <div className="relative z-10 p-4">
                                <div className="mb-1.5 flex items-center gap-2">
                                    <div className="rounded-md bg-[#0f5c52]/25 p-1 ring-1 ring-[#2dd4bf]/30">
                                        <Zap className="h-3 w-3 text-[#7dd3c7]" />
                                    </div>
                                    <p className="text-[10px] font-bold uppercase tracking-widest text-[#7dd3c7]">
                                        Tip
                                    </p>
                                </div>
                                <p className="mb-1 text-sm font-semibold">Connect via API</p>
                                <p className="mb-3 max-w-[90%] text-[10px] leading-relaxed text-[#8aa099]">
                                    Integrate email verification into your app with our REST API.
                                </p>
                                <div className="flex items-center gap-1 text-[10px] font-bold text-[#7dd3c7] transition-all group-hover:translate-x-0.5 group-hover:text-white">
                                    Get API Keys <ArrowRight className="h-2.5 w-2.5" />
                                </div>
                            </div>
                            <Activity className="absolute -right-5 -bottom-5 h-20 w-20 rotate-12 text-white opacity-[0.04]" />
                        </div>
                    </Link>
                </div>
            </CardContent>
        </Card>
    )
}
