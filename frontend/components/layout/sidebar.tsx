"use client"

import { useState, useEffect, HTMLAttributes } from "react"
import Link from "next/link"
import { useRouter, usePathname } from "next/navigation"
import { cn } from "@/lib/utils"
import { Button } from "@/components/ui/button"
import { ApiClient } from "@/lib/api-client"
import { useSiteTitle } from "@/lib/useSiteTitle"
import {
    LayoutDashboard,
    MailCheck,
    UploadCloud,
    List,
    CreditCard,
    History,
    Key,
    LogOut,
    ChevronDown,
    ChevronRight,
    ShieldCheck,
    MoreVertical,
    Users,
    Server,
    Palette,
    Package,
    Settings,
    User,
    FileText,
    Terminal,
    ArrowUpCircle,
    Activity,
    Globe
} from "lucide-react"
import {
    DropdownMenu,
    DropdownMenuContent,
    DropdownMenuItem,
    DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu"
import { Avatar, AvatarFallback, AvatarImage } from "@/components/ui/avatar"

export function Sidebar({ className }: HTMLAttributes<HTMLDivElement>) {
    const pathname = usePathname()
    const router = useRouter()
    const [openSection, setOpenSection] = useState<"user" | "admin" | "system" | null>(null)
    const [user, setUser] = useState<{ name: string, email: string, role?: string } | null>(null)
    const [userRole, setUserRole] = useState<string>('user')
    const [isImpersonating, setIsImpersonating] = useState<boolean>(false)
    const [mounted, setMounted] = useState(false)
    const siteTitle = useSiteTitle()

    useEffect(() => {
        setMounted(true)

        // Load cached state immediately if available
        const cachedUser = localStorage.getItem('sidebar_user')
        const cachedRole = localStorage.getItem('sidebar_role')

        if (cachedUser) setUser(JSON.parse(cachedUser))
        if (cachedRole) setUserRole(cachedRole)

        const fetchSettings = async () => {
            try {
                // Sync session from server (Source of Truth)
                const meResponse = await fetch('/next-api/auth/me');
                if (meResponse.ok) {
                    const meData = await meResponse.json();
                    const sessionUser = meData?.data?.user;
                    if (meData.status === 'success' && sessionUser) {
                        setUser(sessionUser);
                        setUserRole(sessionUser.role || 'user');
                        
                        // Persist to localStorage
                        localStorage.setItem('sidebar_user', JSON.stringify(sessionUser))
                        localStorage.setItem('sidebar_role', sessionUser.role || 'user')

                        if (meData.data.isImpersonating) {
                            setIsImpersonating(true)
                        }
                    }
                }

                // Fetch public settings using ApiClient
                const result = await ApiClient.get('/settings/public');
                if (result.status === 'success' && result.data) {
                    const data = result.data as Record<string, string>;
                    if (data.site_title) {
                        document.title = `${data.site_title} - Dashboard`;
                    }
                }
            } catch (error) {
                console.error("Failed to fetch site settings or sync session:", error);
            }
        };
        fetchSettings();
    }, [])

    // ...

    const handleLogout = async () => {
        try {
            setUser(null);
            // Clear local cache on logout
            localStorage.removeItem('sidebar_user')
            localStorage.removeItem('sidebar_role')
            
            const response = await fetch("/next-api/auth/logout", { method: "POST" });
            const result = await response.json();

            if (result.returnedToAdmin) {
                window.location.href = "/admin/users";
            } else {
                window.location.href = "/login";
            }
        } catch (error) {
            console.error("Logout failed:", error);
            window.location.href = "/login";
        }
    }

    // ... keeping existing routes logic ...
    useEffect(() => {
        if (pathname?.startsWith("/admin")) {
            const systemPaths = ["/admin/logs", "/admin/server", "/admin/monitoring", "/admin/job-control"]
            const adminTopPaths = ["/admin", "/admin/users", "/admin/domains", "/admin/brand-build", "/admin/smtp", "/admin/packages", "/admin/settings/payment", "/admin/license"]

            if (systemPaths.includes(pathname)) {
                setOpenSection("system")
            } else if (adminTopPaths.some(p => pathname === p)) {
                setOpenSection("admin")
            } else {
                setOpenSection("admin")
            }
        } else if (pathname?.startsWith("/dashboard")) {
            setOpenSection("user")
        }
    }, [pathname])

    const toggleSection = (section: "user" | "admin" | "system") => {
        setOpenSection(prev => prev === section ? null : section)
    }

    const userRoutes = [
        {
            label: "Dashboard",
            icon: LayoutDashboard,
            href: "/dashboard",
            active: pathname === "/dashboard",
        },
        {
            label: "Single Verify",
            icon: MailCheck,
            href: "/dashboard/single-verify",
            active: pathname === "/dashboard/single-verify",
        },
        {
            label: "Bulk Upload",
            icon: UploadCloud,
            href: "/dashboard/bulk-upload",
            active: pathname === "/dashboard/bulk-upload",
        },
        {
            label: "Jobs",
            icon: List,
            href: "/dashboard/jobs",
            active: pathname === "/dashboard/jobs",
        },
        {
            label: "Buy Credits",
            icon: CreditCard,
            href: "/dashboard/credits",
            active: pathname === "/dashboard/credits",
        },
        {
            label: "Credits History",
            icon: History,
            href: "/dashboard/credits/history",
            active: pathname === "/dashboard/credits/history",
        },
        {
            label: "API Keys",
            icon: Key,
            href: "/dashboard/api-keys",
            active: pathname === "/dashboard/api-keys",
        },
    ]

    const adminRoutes = [
        {
            label: "Dashboard",
            icon: LayoutDashboard,
            href: "/admin",
            active: pathname === "/admin",
        },
        {
            label: "Manage Users",
            icon: Users,
            href: "/admin/users",
            active: pathname === "/admin/users",
        },
        {
            label: "Domain List",
            icon: Globe,
            href: "/admin/domains",
            active: pathname === "/admin/domains",
        },
        {
            label: "Brand Settings",
            icon: Palette,
            href: "/admin/brand-build",
            active: pathname === "/admin/brand-build",
        },
        {
            label: "SMTP Settings",
            icon: Server,
            href: "/admin/smtp",
            active: pathname === "/admin/smtp",
        },
        {
            label: "Package Manage",
            icon: Package,
            href: "/admin/packages",
            active: pathname === "/admin/packages",
        },
        {
            label: "Payment Settings",
            icon: CreditCard,
            href: "/admin/settings/payment",
            active: pathname === "/admin/settings/payment",
        },
        {
            label: "Update and Licence",
            icon: ArrowUpCircle,
            href: "/admin/license",
            active: pathname === "/admin/license",
        },
    ]

    const systemRoutes = [
        {
            label: "Log View",
            icon: FileText,
            href: "/admin/logs",
            active: pathname === "/admin/logs",
        },
        {
            label: "Backend Server",
            icon: Terminal,
            href: "/admin/server",
            active: pathname === "/admin/server",
        },
        {
            label: "Server Monitoring",
            icon: Activity,
            href: "/admin/monitoring",
            active: pathname === "/admin/monitoring",
        },
        {
            label: "Job Control Settings",
            icon: Activity,
            href: "/admin/job-control",
            active: pathname === "/admin/job-control",
        },
    ]

    const resellerRoutes = [
        {
            label: "Transfer Credits",
            icon: ArrowUpCircle,
            href: "/dashboard/reseller/transfer",
            active: pathname === "/dashboard/reseller/transfer",
        },
    ]


    return (
        <div className={cn("flex flex-col h-screen bg-[#0F172A] text-slate-300", className)}>
            {/* Brand Header */}
            <div className="h-16 flex items-center px-6 border-b border-slate-800/50">
                <ShieldCheck className="h-6 w-6 text-indigo-500 mr-2" />
                <span className="text-lg font-bold text-white tracking-tight">{siteTitle}</span>
                <span className="ml-2 px-1 text-[10px] bg-green-500 text-white rounded">LIVE</span>
            </div>

            {/* Scrollable Content */}
            <div className="flex-1 overflow-y-auto py-6 px-3">
                {/* User Area Group */}
                <div className="mb-2">
                    <button
                        onClick={() => toggleSection("user")}
                        className="flex items-center justify-between w-full px-3 py-2 text-xs font-semibold text-slate-500 uppercase tracking-wider hover:text-slate-300 transition-colors focus:outline-none mb-1"
                    >
                        <span>User Area</span>
                        {openSection === "user" ? <ChevronDown className="h-3 w-3" /> : <ChevronRight className="h-3 w-3" />}
                    </button>

                    {openSection === "user" && (
                        <div className="space-y-0.5 ml-2 mt-1">
                            {userRoutes.map((route) => (
                                <Link
                                    key={route.href}
                                    href={route.href}
                                    className={cn(
                                        "flex items-center px-3 py-2 text-sm font-medium rounded-md transition-all duration-200 group",
                                        route.active
                                            ? "bg-[#0f172b] text-white shadow-sm"
                                            : "text-slate-400 hover:text-white hover:bg-slate-800/50"
                                    )}
                                >
                                    <route.icon className={cn(
                                        "mr-3 h-4 w-4 flex-shrink-0 transition-colors",
                                        route.active ? "text-white" : "text-slate-500 group-hover:text-slate-300"
                                    )} />
                                    {route.label}
                                </Link>
                            ))}
                        </div>
                    )}
                </div>

                {/* Reseller Area Group — শুধু reseller role হলে দেখাবে */}
                {userRole === 'reseller' && (
                    <div className="mb-2">
                        <button
                            onClick={() => toggleSection("reseller" as any)}
                            className="flex items-center justify-between w-full px-3 py-2 text-xs font-semibold text-slate-500 uppercase tracking-wider hover:text-slate-300 transition-colors focus:outline-none mb-1"
                        >
                            <span>Reseller Area</span>
                            {openSection === ("reseller" as any) ? <ChevronDown className="h-3 w-3" /> : <ChevronRight className="h-3 w-3" />}
                        </button>

                        {openSection === ("reseller" as any) && (
                            <div className="space-y-0.5 ml-2 mt-1">
                                {resellerRoutes.map((route) => (
                                    <Link
                                        key={route.href}
                                        href={route.href}
                                        className={cn(
                                            "flex items-center px-3 py-2 text-sm font-medium rounded-md transition-all duration-200 group",
                                            route.active
                                                ? "bg-[#0f172b] text-white shadow-sm"
                                                : "text-slate-400 hover:text-white hover:bg-slate-800/50"
                                        )}
                                    >
                                        <route.icon className={cn(
                                            "mr-3 h-4 w-4 flex-shrink-0 transition-colors",
                                            route.active ? "text-white" : "text-slate-500 group-hover:text-slate-300"
                                        )} />
                                        {route.label}
                                    </Link>
                                ))}
                            </div>
                        )}
                    </div>
                )}

                {/* Admin Area Group — শুধু admin role হলে দেখাবে */}
                {userRole === 'admin' && (
                    <div className="mb-2">
                        <button
                            onClick={() => toggleSection("admin")}
                            className="flex items-center justify-between w-full px-3 py-2 text-xs font-semibold text-slate-500 uppercase tracking-wider hover:text-slate-300 transition-colors focus:outline-none mb-1"
                        >
                            <span>Admin Area</span>
                            {openSection === "admin" ? <ChevronDown className="h-3 w-3" /> : <ChevronRight className="h-3 w-3" />}
                        </button>

                        {openSection === "admin" && (
                            <div className="space-y-0.5 ml-2 mt-1">
                                {adminRoutes.map((route) => (
                                    <Link
                                        key={route.href}
                                        href={route.href}
                                        className={cn(
                                            "flex items-center px-3 py-2 text-sm font-medium rounded-md transition-all duration-200 group",
                                            route.active
                                                ? "bg-[#0f172b] text-white shadow-sm"
                                                : "text-slate-400 hover:text-white hover:bg-slate-800/50"
                                        )}
                                    >
                                        <route.icon className={cn(
                                            "mr-3 h-4 w-4 flex-shrink-0 transition-colors",
                                            route.active ? "text-white" : "text-slate-500 group-hover:text-slate-300"
                                        )} />
                                        {route.label}
                                    </Link>
                                ))}
                            </div>
                        )}
                    </div>
                )}

                {/* Worker Area Group — শুধু admin role হলে দেখাবে */}
                {userRole === 'admin' && (
                    <div className="mb-2">
                        <button
                            onClick={() => toggleSection("system")}
                            className="flex items-center justify-between w-full px-3 py-2 text-xs font-semibold text-slate-500 uppercase tracking-wider hover:text-slate-300 transition-colors focus:outline-none mb-1"
                        >
                            <span>Worker Area</span>
                            {openSection === "system" ? <ChevronDown className="h-3 w-3" /> : <ChevronRight className="h-3 w-3" />}
                        </button>

                        {openSection === "system" && (
                            <div className="space-y-0.5 ml-2 mt-1">
                                {systemRoutes.map((route) => (
                                    <Link
                                        key={route.href}
                                        href={route.href}
                                        className={cn(
                                            "flex items-center px-3 py-2 text-sm font-medium rounded-md transition-all duration-200 group",
                                            route.active
                                                ? "bg-[#0f172b] text-white shadow-sm"
                                                : "text-slate-400 hover:text-white hover:bg-slate-800/50"
                                        )}
                                    >
                                        <route.icon className={cn(
                                            "mr-3 h-4 w-4 flex-shrink-0 transition-colors",
                                            route.active ? "text-white" : "text-slate-500 group-hover:text-slate-300"
                                        )} />
                                        {route.label}
                                    </Link>
                                ))}
                            </div>
                        )}
                    </div>
                )}
            </div>

            {/* Footer / User Profile */}
            <div className="p-4 border-t border-slate-800/50 bg-[#0B1120]">
                <div className="flex items-center w-full">
                    <Avatar className="h-9 w-9 border border-slate-700">
                        <AvatarImage src="" alt={user?.name || "User"} />
                        <AvatarFallback className="bg-slate-800 text-slate-200 text-xs">
                            {user?.name ? user.name.split(' ').map(n => n[0]).join('') : "US"}
                        </AvatarFallback>
                    </Avatar>
                    <div className="ml-3 flex-1 overflow-hidden">
                        <p className="text-sm font-medium text-white truncate">{user?.name || "Loading..."}</p>
                        <p className="text-xs text-slate-500 truncate">{user?.email || "please wait"}</p>
                    </div>
                    {mounted && (
                        <DropdownMenu>
                            <DropdownMenuTrigger asChild>
                                <Button variant="ghost" size="icon" className="h-8 w-8 text-slate-400 hover:text-white hover:bg-slate-800">
                                    <MoreVertical className="h-4 w-4" />
                                </Button>
                            </DropdownMenuTrigger>
                            <DropdownMenuContent align="end" className="w-56 bg-slate-900 border-slate-800 text-slate-200">
                                <DropdownMenuItem
                                    onClick={() => router.push("/dashboard/profile")}
                                    className="focus:bg-slate-800 focus:text-white cursor-pointer select-none"
                                >
                                    <User className="mr-2 h-4 w-4" />
                                    <span>Profile Setting</span>
                                </DropdownMenuItem>
                                <DropdownMenuItem
                                    onClick={handleLogout}
                                    className={cn("focus:text-white cursor-pointer select-none", isImpersonating ? "focus:bg-amber-600 bg-amber-500/20 text-amber-500 hover:text-amber-400" : "focus:bg-slate-800")}
                                >
                                    {isImpersonating ? <ShieldCheck className="mr-2 h-4 w-4" /> : <LogOut className="mr-2 h-4 w-4" />}
                                    <span className={isImpersonating ? "font-bold" : ""}>{isImpersonating ? "Return to Admin" : "Log out"}</span>
                                </DropdownMenuItem>
                            </DropdownMenuContent>
                        </DropdownMenu>
                    )}
                </div>
            </div>
        </div>
    )
}
