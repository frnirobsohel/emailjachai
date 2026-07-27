"use client"

import Link from "next/link"
import { cn } from "@/lib/utils"
import {
    DropdownMenu,
    DropdownMenuContent,
    DropdownMenuItem,
    DropdownMenuTrigger,
    DropdownMenuSeparator,
} from "@/components/ui/dropdown-menu"
import { Avatar, AvatarFallback, AvatarImage } from "@/components/ui/avatar"
import { Settings, LogOut, ShieldCheck, AlertTriangle } from "lucide-react"

interface SidebarUser {
    id?: string
    name?: string
    email?: string
    role?: string
    avatar?: string
}

interface SidebarProfileProps {
    isCollapsed: boolean
    safeUser: SidebarUser | null
    isImpersonating: boolean
    handleLogout: () => Promise<void>
}

const roleMeta: Record<string, { label: string; className: string }> = {
    admin: { label: "Admin", className: "border-rose-600/20 bg-rose-50 text-rose-700" },
    reseller: { label: "Reseller", className: "border-amber-600/20 bg-amber-50 text-amber-700" },
    user: { label: "User", className: "border-[#0b1f1c]/10 bg-white/70 text-[#5a736c]" },
}

export function SidebarProfile({
    isCollapsed,
    safeUser,
    isImpersonating,
    handleLogout,
}: SidebarProfileProps) {
    const userRole = safeUser?.role || "user"
    const meta = roleMeta[userRole] ?? roleMeta.user
    const initials = safeUser?.name
        ? safeUser.name
              .split(" ")
              .map((n: string) => n[0])
              .join("")
              .toUpperCase()
              .slice(0, 2)
        : "US"

    return (
        <div className="flex-shrink-0">
            {isImpersonating && (
                <div
                    className={cn(
                        "mx-3 mb-2 flex items-center gap-2 rounded-md border border-amber-600/25 bg-amber-50 px-3 py-2",
                        isCollapsed ? "mx-2 justify-center px-0" : ""
                    )}
                >
                    <AlertTriangle className="h-3.5 w-3.5 flex-shrink-0 text-amber-600" />
                    <span
                        className={cn(
                            "overflow-hidden whitespace-nowrap text-xs font-medium text-amber-800",
                            isCollapsed ? "hidden" : ""
                        )}
                    >
                        Impersonating
                    </span>
                </div>
            )}

            <div className="mx-3 mb-2 h-px bg-[#0b1f1c]/12" />

            <div className="p-3 pt-0">
                <DropdownMenu>
                    <DropdownMenuTrigger asChild>
                        <button
                            title={isCollapsed ? `${safeUser?.name || "User"} (${userRole.toUpperCase()})` : undefined}
                            className="group relative flex h-12 w-full items-center overflow-hidden rounded-md text-left transition-colors hover:bg-[#0b1f1c]/5 focus:outline-none"
                        >
                            <div className="relative z-10 flex h-12 w-10 flex-shrink-0 items-center justify-center">
                                <Avatar className="h-8 w-8 border border-[#0b1f1c]/10 ring-1 ring-transparent transition-all group-hover:ring-[#0f5c52]/30">
                                    <AvatarImage src={safeUser?.avatar || ""} alt={safeUser?.name || "User"} />
                                    <AvatarFallback className="bg-[#0f5c52]/15 text-xs font-semibold text-[#0f5c52]">
                                        {initials}
                                    </AvatarFallback>
                                </Avatar>
                            </div>

                            <div
                                className={cn(
                                    "flex flex-1 items-center overflow-hidden",
                                    isCollapsed ? "hidden" : "ml-1 w-auto opacity-100 pr-2"
                                )}
                            >
                                <div className="flex min-w-0 flex-1 flex-col">
                                    <p className="truncate text-sm font-medium leading-tight text-[#0b1f1c]">
                                        {safeUser?.name || "Loading..."}
                                    </p>
                                    <p className="mt-0.5 truncate text-xs leading-tight text-[#6b857c]">
                                        {safeUser?.email || ""}
                                    </p>
                                </div>

                                <span
                                    className={cn(
                                        "ml-2 flex-shrink-0 rounded border px-1.5 py-0.5 text-[10px] font-semibold uppercase tracking-wide",
                                        meta.className
                                    )}
                                >
                                    {meta.label}
                                </span>
                            </div>
                        </button>
                    </DropdownMenuTrigger>

                    <DropdownMenuContent
                        side="top"
                        align="start"
                        sideOffset={8}
                        className="ml-2 w-56 rounded-xl border border-[#0b1f1c]/10 bg-white/95 p-2 shadow-xl backdrop-blur-md"
                    >
                        <div className="mb-1 px-3 py-2">
                            <p className="truncate text-sm font-semibold text-[#0b1f1c]">{safeUser?.name || "User"}</p>
                            <p className="mt-0.5 truncate text-xs text-[#6b857c]">{safeUser?.email || ""}</p>
                        </div>

                        <DropdownMenuSeparator className="my-1 bg-[#0b1f1c]/10" />

                        <DropdownMenuItem
                            asChild
                            className="group flex cursor-pointer items-center rounded-md px-3 py-2 text-sm font-medium text-[#4a635c] outline-none transition-all duration-200 hover:bg-[#0f5c52]/8 hover:text-[#0b1f1c] focus:bg-[#0f5c52]/8 focus:text-[#0b1f1c]"
                        >
                            <Link href="/dashboard/profile" className="flex w-full items-center">
                                <Settings className="mr-3 h-4 w-4 text-[#6b857c] transition-colors group-hover:text-[#0f5c52]" />
                                Profile Settings
                            </Link>
                        </DropdownMenuItem>

                        <DropdownMenuItem
                            onClick={handleLogout}
                            className={cn(
                                "group mt-0.5 flex cursor-pointer items-center rounded-md px-3 py-2 text-sm font-medium outline-none transition-all duration-200",
                                isImpersonating
                                    ? "text-amber-700 hover:bg-amber-50 hover:text-amber-800 focus:bg-amber-50 focus:text-amber-800"
                                    : "text-[#4a635c] hover:bg-rose-50 hover:text-rose-700 focus:bg-rose-50 focus:text-rose-700"
                            )}
                        >
                            {isImpersonating ? (
                                <ShieldCheck className="mr-3 h-4 w-4 text-amber-600" />
                            ) : (
                                <LogOut className="mr-3 h-4 w-4 text-[#6b857c] transition-colors group-hover:text-rose-600" />
                            )}
                            <span>{isImpersonating ? "Return to Admin" : "Log out"}</span>
                        </DropdownMenuItem>
                    </DropdownMenuContent>
                </DropdownMenu>
            </div>
        </div>
    )
}
