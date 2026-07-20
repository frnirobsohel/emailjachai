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
    admin:    { label: "Admin",    className: "bg-rose-500/15 text-rose-400 border-rose-500/20" },
    reseller: { label: "Reseller", className: "bg-amber-500/15 text-amber-400 border-amber-500/20" },
    user:     { label: "User",     className: "bg-slate-700/60 text-slate-400 border-slate-600/30" },
}

export function SidebarProfile({
    isCollapsed,
    safeUser,
    isImpersonating,
    handleLogout
}: SidebarProfileProps) {
    const userRole = safeUser?.role || 'user'
    const meta = roleMeta[userRole] ?? roleMeta.user
    const initials = safeUser?.name
        ? safeUser.name.split(' ').map((n: string) => n[0]).join('').toUpperCase().slice(0, 2)
        : "US"

    return (
        <div className="flex-shrink-0">
            {/* Impersonation Warning Banner */}
            {isImpersonating && (
                <div className={cn(
                    "mx-3 mb-2 flex items-center gap-2 rounded-md border border-amber-500/30 bg-amber-500/10 px-3 py-2",
                    isCollapsed ? "justify-center px-0 mx-2" : ""
                )}>
                    <AlertTriangle className="h-3.5 w-3.5 flex-shrink-0 text-amber-400" />
                    <span className={cn(
                        "text-xs font-medium text-amber-300 whitespace-nowrap overflow-hidden",
                        isCollapsed ? "hidden" : ""
                    )}>
                        Impersonating
                    </span>
                </div>
            )}

            {/* Divider */}
            <div className="mx-3 h-px bg-slate-800/60 mb-2" />

            {/* Profile Dropdown */}
            <div className="p-3 pt-0">
                <DropdownMenu>
                    <DropdownMenuTrigger asChild>
                        <button 
                            title={isCollapsed ? `${safeUser?.name || "User"} (${userRole.toUpperCase()})` : undefined}
                            className="w-full flex items-center hover:bg-slate-800/50 rounded-md transition-colors h-12 relative overflow-hidden focus:outline-none text-left group"
                        >
                            {/* Avatar */}
                            <div className="w-10 h-12 flex-shrink-0 flex items-center justify-center relative z-10">
                                <Avatar className="h-8 w-8 border border-slate-700 ring-1 ring-transparent group-hover:ring-slate-600 transition-all">
                                    <AvatarImage src={safeUser?.avatar || ""} alt={safeUser?.name || "User"} />
                                    <AvatarFallback className="bg-slate-800 text-slate-200 text-xs font-semibold">
                                        {initials}
                                    </AvatarFallback>
                                </Avatar>
                            </div>

                            {/* Name + Role — hidden when collapsed */}
                            <div className={cn(
                                "flex items-center overflow-hidden flex-1",
                                isCollapsed ? "hidden" : "w-auto opacity-100 pr-2 ml-1"
                            )}>
                                <div className="flex flex-col min-w-0 flex-1">
                                    <p className="text-sm font-medium text-white truncate leading-tight">
                                        {safeUser?.name || "Loading..."}
                                    </p>
                                    <p className="text-xs text-slate-500 truncate leading-tight mt-0.5">
                                        {safeUser?.email || ""}
                                    </p>
                                </div>

                                {/* Role badge */}
                                <span className={cn(
                                    "ml-2 flex-shrink-0 text-[10px] font-semibold px-1.5 py-0.5 rounded border tracking-wide uppercase",
                                    meta.className
                                )}>
                                    {meta.label}
                                </span>
                            </div>
                        </button>
                    </DropdownMenuTrigger>

                    <DropdownMenuContent
                        side="top"
                        align="start"
                        sideOffset={8}
                        className="w-56 bg-[#0F172A] border border-slate-800/60 shadow-2xl rounded-xl p-2 ml-2"
                    >
                        {/* User info header inside dropdown */}
                        <div className="px-3 py-2 mb-1">
                            <p className="text-sm font-semibold text-white truncate">{safeUser?.name || "User"}</p>
                            <p className="text-xs text-slate-500 truncate mt-0.5">{safeUser?.email || ""}</p>
                        </div>

                        <DropdownMenuSeparator className="bg-slate-800/60 my-1" />

                        <DropdownMenuItem asChild className="group flex items-center px-3 py-2 text-sm font-medium rounded-md transition-all duration-200 text-slate-400 hover:text-white hover:bg-slate-800/50 focus:bg-slate-800/50 focus:text-white cursor-pointer outline-none">
                            <Link href="/dashboard/profile" className="flex items-center w-full">
                                <Settings className="mr-3 h-4 w-4 text-slate-500 group-hover:text-slate-300 transition-colors" />
                                Profile Settings
                            </Link>
                        </DropdownMenuItem>

                        <DropdownMenuItem
                            onClick={handleLogout}
                            className={cn(
                                "group flex items-center px-3 py-2 text-sm font-medium rounded-md transition-all duration-200 cursor-pointer outline-none mt-0.5",
                                isImpersonating
                                    ? "text-amber-400 hover:text-amber-300 hover:bg-amber-500/10 focus:bg-amber-500/10 focus:text-amber-300"
                                    : "text-slate-400 hover:text-rose-400 hover:bg-rose-500/10 focus:bg-rose-500/10 focus:text-rose-400"
                            )}
                        >
                            {isImpersonating
                                ? <ShieldCheck className="mr-3 h-4 w-4 text-amber-400" />
                                : <LogOut className="mr-3 h-4 w-4 text-slate-500 group-hover:text-rose-400 transition-colors" />
                            }
                            <span>{isImpersonating ? "Return to Admin" : "Log out"}</span>
                        </DropdownMenuItem>
                    </DropdownMenuContent>
                </DropdownMenu>
            </div>
        </div>
    )
}
