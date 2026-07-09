"use client"

import Link from "next/link"
import { cn } from "@/lib/utils"
import {
    DropdownMenu,
    DropdownMenuContent,
    DropdownMenuItem,
    DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu"
import { Avatar, AvatarFallback, AvatarImage } from "@/components/ui/avatar"
import { Settings, LogOut, ShieldCheck } from "lucide-react"

interface SidebarProfileProps {
    isCollapsed: boolean
    safeUser: any
    isImpersonating: boolean
    handleLogout: () => Promise<void>
}

export function SidebarProfile({
    isCollapsed,
    safeUser,
    isImpersonating,
    handleLogout
}: SidebarProfileProps) {
    const userRole = safeUser?.role || 'user'

    return (
        <div className="p-3">
            <DropdownMenu>
                <DropdownMenuTrigger asChild>
                    <button className="w-full flex items-center hover:bg-slate-800/50 rounded-md transition-colors h-12 relative overflow-hidden focus:outline-none text-left">
                        {/* Fixed Avatar Container */}
                        <div className="w-10 h-12 flex-shrink-0 flex items-center justify-center relative z-10">
                            <Avatar className="h-8 w-8 border border-slate-700">
                                <AvatarImage src="" alt={safeUser?.name || "User"} />
                                <AvatarFallback className="bg-slate-800 text-slate-200 text-xs font-medium">
                                    {safeUser?.name ? safeUser.name.split(' ').map((n: string) => n[0]).join('') : "US"}
                                </AvatarFallback>
                            </Avatar>
                        </div>

                        {/* Shrinking Text Container */}
                        <div className={cn(
                            "flex items-center overflow-hidden transition-all duration-300 flex-1",
                            isCollapsed ? "w-0 opacity-0 pr-0" : "w-auto opacity-100 pr-2 ml-1"
                        )}>
                            {/* User Info Text */}
                            <div className="flex flex-col min-w-0">
                                <p className="text-sm font-medium text-white truncate leading-tight">{safeUser?.name || "Loading..."}</p>
                                <p className="text-xs text-slate-400 truncate leading-tight mt-0.5">{userRole === 'admin' ? 'Administrator' : userRole === 'reseller' ? 'Reseller' : 'User'}</p>
                            </div>
                        </div>
                    </button>
                </DropdownMenuTrigger>
                
                <DropdownMenuContent side="top" align="start" sideOffset={8} className="w-56 bg-[#0F172A] border border-slate-800/50 shadow-2xl rounded-xl p-2 ml-2">
                    <DropdownMenuItem asChild className="group flex items-center px-3 py-2 text-sm font-medium rounded-md transition-all duration-200 text-slate-400 hover:text-white hover:bg-slate-800/50 focus:bg-slate-800/50 focus:text-white cursor-pointer mb-1 outline-none">
                        <Link href="/dashboard/profile" className="flex items-center w-full">
                            <Settings className="mr-3 h-4 w-4 text-slate-500 group-hover:text-slate-300 transition-colors" />
                            Profile Settings
                        </Link>
                    </DropdownMenuItem>
                    
                    <DropdownMenuItem
                        onClick={handleLogout}
                        className={cn(
                            "group flex items-center px-3 py-2 text-sm font-medium rounded-md transition-all duration-200 cursor-pointer outline-none",
                            isImpersonating 
                                ? "text-amber-500 hover:text-amber-400 hover:bg-amber-500/10 focus:bg-amber-500/10 focus:text-amber-400" 
                                : "text-slate-400 hover:text-rose-400 hover:bg-rose-500/10 focus:bg-rose-500/10 focus:text-rose-400"
                        )}
                    >
                        {isImpersonating ? <ShieldCheck className="mr-3 h-4 w-4" /> : <LogOut className={cn("mr-3 h-4 w-4 transition-colors", isImpersonating ? "" : "text-slate-500 group-hover:text-rose-400")} />}
                        <span>{isImpersonating ? "Return to Admin" : "Log out"}</span>
                    </DropdownMenuItem>
                </DropdownMenuContent>
            </DropdownMenu>
        </div>
    )
}
