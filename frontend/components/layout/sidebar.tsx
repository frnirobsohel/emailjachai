"use client"

import { useState, useEffect, HTMLAttributes } from "react"
import Link from "next/link"
import { useRouter, usePathname } from "next/navigation"
import { cn } from "@/lib/utils"
import { useSettings } from "@/lib/settings-context"
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
    Globe,
    Database,
    Menu,
    ChevronLeft,
    Wallet,
    RefreshCw,
    Gauge,
    Cpu,
    ArrowRightLeft,
    ListTodo
} from "lucide-react"
import {
    DropdownMenu,
    DropdownMenuContent,
    DropdownMenuItem,
    DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu"
import { Avatar, AvatarFallback, AvatarImage } from "@/components/ui/avatar"

import { useUIStore } from "@/stores/ui-state"
import { useUserStore } from "@/stores/user-state"
import { resetAllStores } from "@/stores/store-reset"

export function Sidebar({ className }: HTMLAttributes<HTMLDivElement>) {
    const pathname = usePathname()
    const router = useRouter()
    const { isSidebarOpen, isSidebarCollapsed, toggleSidebarCollapse } = useUIStore()
    // Read user directly from Zustand persist store — no local state needed
    const { user, isAuthenticated } = useUserStore()
    const userRole = user?.role || 'user'
    const [openSection, setOpenSection] = useState<"user" | "admin" | "system" | "reseller" | null>(null)
    const [isImpersonating, setIsImpersonating] = useState<boolean>(false)
    const settings = useSettings()
    const siteTitle = settings?.site_title || "EmailJachai Pro"
    const logoUrl = settings?.logo_url

    const handleLogout = async () => {
        try {
            // 1. Reset all in-memory Zustand stores (prevent data leakage between sessions)
            resetAllStores();

            // 2. Clear persisted user state
            useUserStore.getState().clearUser();

            // 3. Clear any legacy localStorage keys
            localStorage.removeItem('sidebar_user');
            localStorage.removeItem('sidebar_role');
            localStorage.removeItem('sidebar_user_synced_at');

            // 4. Invalidate server-side session cookie
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

    useEffect(() => {
        const syncAuthMe = async () => {
            try {
                const meResponse = await fetch('/next-api/auth/me')
                if (meResponse.ok) {
                    const meData = await meResponse.json()
                    if (meData.status === 'success' && meData.data?.user) {
                        const sessionUser = meData.data.user
                        // Always update the store so role is always accurate
                        useUserStore.getState().setUser(
                            {
                                id: String(sessionUser.id),
                                email: sessionUser.email,
                                name: sessionUser.name,
                                role: sessionUser.role || 'user',
                                avatar: sessionUser.avatar,
                            },
                            // token already in cookie, pass empty string to avoid overwriting localStorage
                            ''
                        )
                        if (meData.data.isImpersonating) {
                            setIsImpersonating(true)
                        }
                    }
                } else if (meResponse.status === 401) {
                    handleLogout()
                }
            } catch (error) {
                console.error("Failed to sync session:", error)
            }
        }
        syncAuthMe()
    }, []) // mount-এ একবারই

    // ... keeping existing routes logic ...
    useEffect(() => {
        if (pathname?.startsWith("/admin")) {
            const systemPaths = ["/admin/logs", "/admin/server", "/admin/monitoring", "/admin/job-control", "/admin/cache-control", "/admin/security"]
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
            icon: ListTodo,
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
            icon: Wallet,
            href: "/admin/settings/payment",
            active: pathname === "/admin/settings/payment",
        },
        {
            label: "Update and Licence",
            icon: RefreshCw,
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
            icon: Gauge,
            href: "/admin/monitoring",
            active: pathname === "/admin/monitoring",
        },
        {
            label: "Job Control",
            icon: Cpu,
            href: "/admin/job-control",
            active: pathname === "/admin/job-control",
        },
        {
            label: "Cache Control",
            icon: Database,
            href: "/admin/cache-control",
            active: pathname === "/admin/cache-control",
        },
        {
            label: "Security Shield",
            icon: ShieldCheck,
            href: "/admin/security",
            active: pathname === "/admin/security",
        },
    ]

    const resellerRoutes = [
        {
            label: "Transfer Credits",
            icon: ArrowRightLeft,
            href: "/dashboard/reseller/transfer",
            active: pathname === "/dashboard/reseller/transfer",
        },
    ]


    return (
        <div className={cn("flex flex-col h-screen bg-[#0F172A] text-slate-300", className)}>
            {/* Brand Header */}
            <div className="h-16 flex items-center border-b border-slate-800/50 relative overflow-hidden">
                
                {/* Fixed Logo Container */}
                <div className="w-16 flex-shrink-0 flex items-center justify-center relative z-10 group/header h-full">
                    {/* The Logo (Always visible, but fades out on hover when collapsed) */}
                    <div className={cn("absolute inset-0 flex items-center justify-center transition-opacity duration-200", isSidebarCollapsed ? "group-hover/header:opacity-0" : "opacity-100")}>
                        {logoUrl ? (
                            <img src={logoUrl} alt="Logo" width={24} height={24} className="h-6 w-6 object-contain" />
                        ) : (
                            <ShieldCheck className="h-6 w-6 text-indigo-500" />
                        )}
                    </div>
                    
                    {/* The Expand Button (Visible only on hover in collapsed mode) */}
                    {isSidebarCollapsed && (
                        <button
                            onClick={toggleSidebarCollapse}
                            className="absolute inset-0 flex items-center justify-center opacity-0 group-hover/header:opacity-100 transition-opacity duration-200 focus:outline-none"
                            title="Expand Sidebar"
                        >
                            <div className="h-8 w-8 rounded hover:bg-slate-800 flex items-center justify-center text-slate-400 hover:text-white transition-colors">
                                <ChevronRight className="h-4 w-4" />
                            </div>
                        </button>
                    )}
                </div>

                {/* Shrinking Title & Collapse Button Container */}
                <div className={cn(
                    "flex items-center justify-between overflow-hidden transition-all duration-300 flex-1",
                    isSidebarCollapsed ? "w-0 opacity-0 pr-0" : "w-auto opacity-100 pr-4"
                )}>
                    {/* Site Title */}
                    <span className="text-lg font-bold text-white tracking-tight truncate">
                        {siteTitle}
                    </span>
                    
                    {/* Collapse Button */}
                    <button
                        onClick={toggleSidebarCollapse}
                        className="flex-shrink-0 hover:bg-slate-800 text-slate-400 hover:text-white rounded h-7 w-7 flex items-center justify-center transition-colors focus:outline-none ml-2"
                        title="Collapse Sidebar"
                    >
                        <ChevronLeft className="h-4 w-4" />
                    </button>
                </div>
            </div>

            {/* Scrollable Content */}
            <div className="flex-1 overflow-y-auto py-6 px-3 custom-scrollbar">
                {/* User Area Group */}
                <div className="mb-2">
                    <button
                        onClick={() => {
                            if (isSidebarCollapsed) toggleSidebarCollapse()
                            toggleSection("user")
                        }}
                        className="flex items-center w-full h-8 mb-1 focus:outline-none group overflow-hidden rounded-md hover:bg-slate-800/30 transition-colors"
                        title={isSidebarCollapsed ? "User Area" : undefined}
                    >
                        {/* Fixed Icon Container */}
                        <div className="w-10 flex-shrink-0 flex items-center justify-center">
                            <div className="h-6 w-6 rounded flex items-center justify-center transition-colors bg-slate-800/40 border border-slate-700/50 shadow-sm group-hover:bg-slate-700/50">
                                <User className="h-3.5 w-3.5 text-slate-400 group-hover:text-slate-300 transition-colors" />
                            </div>
                        </div>
                        
                        {/* Shrinking Text Container */}
                        <div className={cn(
                            "flex items-center justify-between overflow-hidden transition-all duration-300 flex-1",
                            isSidebarCollapsed ? "w-0 opacity-0 pr-0" : "w-auto opacity-100 pr-2"
                        )}>
                            <span className="text-xs font-semibold text-slate-500 uppercase tracking-wider group-hover:text-slate-300 transition-colors">User Area</span>
                            {openSection === "user" ? <ChevronDown className="h-3 w-3 text-slate-500" /> : <ChevronRight className="h-3 w-3 text-slate-500" />}
                        </div>
                    </button>

                    {openSection === "user" && (
                        <div className="space-y-0.5 mt-1">
                            {userRoutes.map((route) => (
                                <Link
                                    key={route.href}
                                    href={route.href}
                                    className={cn(
                                        "flex items-center px-3 py-2 text-sm font-medium rounded-md transition-all duration-200 group relative",
                                        route.active
                                            ? "bg-[#0f172b] text-white shadow-sm"
                                            : "text-slate-400 hover:text-white hover:bg-slate-800/50"
                                    )}
                                    title={isSidebarCollapsed ? route.label : undefined}
                                >
                                    <route.icon className={cn(
                                        "mr-3 h-4 w-4 flex-shrink-0 transition-colors",
                                        route.active ? "text-white" : "text-slate-500 group-hover:text-slate-300"
                                    )} />
                                    <span className={cn(
                                        "overflow-hidden whitespace-nowrap transition-all duration-300",
                                        isSidebarCollapsed ? "w-0 opacity-0" : "w-[150px] opacity-100"
                                    )}>
                                        {route.label}
                                    </span>
                                </Link>
                            ))}
                        </div>
                    )}
                </div>

                {/* Reseller Area Group — শুধু reseller role হলে দেখাবে */}
                {userRole === 'reseller' && (
                    <div className="mb-2">
                        <button
                            onClick={() => {
                                if (isSidebarCollapsed) toggleSidebarCollapse()
                                toggleSection("reseller" as any)
                            }}
                            className="flex items-center w-full h-8 mb-1 focus:outline-none group overflow-hidden rounded-md hover:bg-slate-800/30 transition-colors"
                            title={isSidebarCollapsed ? "Reseller Area" : undefined}
                        >
                            {/* Fixed Icon Container */}
                            <div className="w-10 flex-shrink-0 flex items-center justify-center">
                                <div className="h-6 w-6 rounded flex items-center justify-center transition-colors bg-slate-800/40 border border-slate-700/50 shadow-sm group-hover:bg-slate-700/50">
                                    <Package className="h-3.5 w-3.5 text-slate-400 group-hover:text-slate-300 transition-colors" />
                                </div>
                            </div>
                            
                            {/* Shrinking Text Container */}
                            <div className={cn(
                                "flex items-center justify-between overflow-hidden transition-all duration-300 flex-1",
                                isSidebarCollapsed ? "w-0 opacity-0 pr-0" : "w-auto opacity-100 pr-2"
                            )}>
                                <span className="text-xs font-semibold text-slate-500 uppercase tracking-wider group-hover:text-slate-300 transition-colors">Reseller Area</span>
                                {openSection === "reseller" ? <ChevronDown className="h-3 w-3 text-slate-500" /> : <ChevronRight className="h-3 w-3 text-slate-500" />}
                            </div>
                        </button>

                        {openSection === "reseller" && (
                            <div className="space-y-0.5 mt-1">
                                {resellerRoutes.map((route) => (
                                    <Link
                                        key={route.href}
                                        href={route.href}
                                        className={cn(
                                            "flex items-center px-3 py-2 text-sm font-medium rounded-md transition-all duration-200 group relative",
                                            route.active
                                                ? "bg-[#0f172b] text-white shadow-sm"
                                                : "text-slate-400 hover:text-white hover:bg-slate-800/50"
                                        )}
                                        title={isSidebarCollapsed ? route.label : undefined}
                                    >
                                        <route.icon className={cn(
                                            "mr-3 h-4 w-4 flex-shrink-0 transition-colors",
                                            route.active ? "text-white" : "text-slate-500 group-hover:text-slate-300"
                                        )} />
                                        <span className={cn(
                                            "overflow-hidden whitespace-nowrap transition-all duration-300",
                                            isSidebarCollapsed ? "w-0 opacity-0" : "w-[150px] opacity-100"
                                        )}>
                                            {route.label}
                                        </span>
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
                            onClick={() => {
                                if (isSidebarCollapsed) toggleSidebarCollapse()
                                toggleSection("admin")
                            }}
                            className="flex items-center w-full h-8 mb-1 focus:outline-none group overflow-hidden rounded-md hover:bg-slate-800/30 transition-colors"
                            title={isSidebarCollapsed ? "Admin Area" : undefined}
                        >
                            {/* Fixed Icon Container */}
                            <div className="w-10 flex-shrink-0 flex items-center justify-center">
                                <div className="h-6 w-6 rounded flex items-center justify-center transition-colors bg-slate-800/40 border border-slate-700/50 shadow-sm group-hover:bg-slate-700/50">
                                    <ShieldCheck className="h-3.5 w-3.5 text-slate-400 group-hover:text-slate-300 transition-colors" />
                                </div>
                            </div>
                            
                            {/* Shrinking Text Container */}
                            <div className={cn(
                                "flex items-center justify-between overflow-hidden transition-all duration-300 flex-1",
                                isSidebarCollapsed ? "w-0 opacity-0 pr-0" : "w-auto opacity-100 pr-2"
                            )}>
                                <span className="text-xs font-semibold text-slate-500 uppercase tracking-wider group-hover:text-slate-300 transition-colors">Admin Area</span>
                                {openSection === "admin" ? <ChevronDown className="h-3 w-3 text-slate-500" /> : <ChevronRight className="h-3 w-3 text-slate-500" />}
                            </div>
                        </button>

                        {openSection === "admin" && (
                            <div className="space-y-0.5 mt-1">
                                {adminRoutes.map((route) => (
                                    <Link
                                        key={route.href}
                                        href={route.href}
                                        className={cn(
                                            "flex items-center px-3 py-2 text-sm font-medium rounded-md transition-all duration-200 group relative",
                                            route.active
                                                ? "bg-[#0f172b] text-white shadow-sm"
                                                : "text-slate-400 hover:text-white hover:bg-slate-800/50"
                                        )}
                                        title={isSidebarCollapsed ? route.label : undefined}
                                    >
                                        <route.icon className={cn(
                                            "mr-3 h-4 w-4 flex-shrink-0 transition-colors",
                                            route.active ? "text-white" : "text-slate-500 group-hover:text-slate-300"
                                        )} />
                                        <span className={cn(
                                            "overflow-hidden whitespace-nowrap transition-all duration-300",
                                            isSidebarCollapsed ? "w-0 opacity-0" : "w-[150px] opacity-100"
                                        )}>
                                            {route.label}
                                        </span>
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
                            onClick={() => {
                                if (isSidebarCollapsed) toggleSidebarCollapse()
                                toggleSection("system")
                            }}
                            className="flex items-center w-full h-8 mb-1 focus:outline-none group overflow-hidden rounded-md hover:bg-slate-800/30 transition-colors"
                            title={isSidebarCollapsed ? "Worker Area" : undefined}
                        >
                            {/* Fixed Icon Container */}
                            <div className="w-10 flex-shrink-0 flex items-center justify-center">
                                <div className="h-6 w-6 rounded flex items-center justify-center transition-colors bg-slate-800/40 border border-slate-700/50 shadow-sm group-hover:bg-slate-700/50">
                                    <Activity className="h-3.5 w-3.5 text-slate-400 group-hover:text-slate-300 transition-colors" />
                                </div>
                            </div>
                            
                            {/* Shrinking Text Container */}
                            <div className={cn(
                                "flex items-center justify-between overflow-hidden transition-all duration-300 flex-1",
                                isSidebarCollapsed ? "w-0 opacity-0 pr-0" : "w-auto opacity-100 pr-2"
                            )}>
                                <span className="text-xs font-semibold text-slate-500 uppercase tracking-wider group-hover:text-slate-300 transition-colors">Worker Area</span>
                                {openSection === "system" ? <ChevronDown className="h-3 w-3 text-slate-500" /> : <ChevronRight className="h-3 w-3 text-slate-500" />}
                            </div>
                        </button>

                        {openSection === "system" && (
                            <div className="space-y-0.5 mt-1">
                                {systemRoutes.map((route) => (
                                    <Link
                                        key={route.href}
                                        href={route.href}
                                        className={cn(
                                            "flex items-center px-3 py-2 text-sm font-medium rounded-md transition-all duration-200 group relative",
                                            route.active
                                                ? "bg-[#0f172b] text-white shadow-sm"
                                                : "text-slate-400 hover:text-white hover:bg-slate-800/50"
                                        )}
                                        title={isSidebarCollapsed ? route.label : undefined}
                                    >
                                        <route.icon className={cn(
                                            "mr-3 h-4 w-4 flex-shrink-0 transition-colors",
                                            route.active ? "text-white" : "text-slate-500 group-hover:text-slate-300"
                                        )} />
                                        <span className={cn(
                                            "overflow-hidden whitespace-nowrap transition-all duration-300",
                                            isSidebarCollapsed ? "w-0 opacity-0" : "w-[150px] opacity-100"
                                        )}>
                                            {route.label}
                                        </span>
                                    </Link>
                                ))}
                            </div>
                        )}
                    </div>
                )}
            </div>

            {/* Footer / User Profile (ChatGPT Style) */}
            <div className="p-3">
                <DropdownMenu>
                    <DropdownMenuTrigger asChild>
                        <button className="w-full flex items-center hover:bg-slate-800/50 rounded-md transition-colors h-12 relative overflow-hidden focus:outline-none text-left">
                            {/* Fixed Avatar Container */}
                            <div className="w-10 h-12 flex-shrink-0 flex items-center justify-center relative z-10">
                                <Avatar className="h-8 w-8 border border-slate-700">
                                    <AvatarImage src="" alt={user?.name || "User"} />
                                    <AvatarFallback className="bg-slate-800 text-slate-200 text-xs font-medium">
                                        {user?.name ? user.name.split(' ').map(n => n[0]).join('') : "US"}
                                    </AvatarFallback>
                                </Avatar>
                            </div>

                            {/* Shrinking Text Container */}
                            <div className={cn(
                                "flex items-center overflow-hidden transition-all duration-300 flex-1",
                                isSidebarCollapsed ? "w-0 opacity-0 pr-0" : "w-auto opacity-100 pr-2 ml-1"
                            )}>
                                {/* User Info Text */}
                                <div className="flex flex-col min-w-0">
                                    <p className="text-sm font-medium text-white truncate leading-tight">{user?.name || "Loading..."}</p>
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
        </div>
    )
}
