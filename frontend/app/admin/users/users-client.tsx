"use client"

import { useState, useEffect, useCallback } from "react"
import { useForm } from "react-hook-form"
import { zodResolver } from "@hookform/resolvers/zod"
import { z } from "zod"
import toast from "react-hot-toast"
import { Button } from "@/components/ui/button"
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card"
import { Input } from "@/components/ui/input"
import {
    Table,
    TableBody,
    TableCell,
    TableHead,
    TableHeader,
    TableRow
} from "@/components/ui/table"
import { Badge } from "@/components/ui/badge"
import {
    UserPlus,
    MoreHorizontal,
    Edit,
    Ban,
    Trash2,
    Mail,
    ShieldCheck,
    Users,
    UserCog,
    Store,
    FlaskConical,
    LogIn,
    KeyRound,
    Copy,
    CheckCheck,
    CreditCard,
    AlertTriangle,
    RefreshCcw,
    Plus,
    Minus,
    Filter,
    UserX
} from "lucide-react"
import {
    DropdownMenu,
    DropdownMenuContent,
    DropdownMenuItem,
    DropdownMenuTrigger,
    DropdownMenuSub,
    DropdownMenuSubTrigger,
    DropdownMenuSubContent,
    DropdownMenuPortal,
} from "@/components/ui/dropdown-menu"
import { ApiClient } from "@/lib/api-client"
import { SimpleSelect } from "@/components/ui/simple-select"
import { useUsersStore } from "@/stores/users-store"

type Role = "admin" | "manager" | "reseller" | "user" | "demo"

interface User {
    id: number
    name: string
    email: string
    plan: string
    status: "Active" | "Suspended" | "Inactive"
    role: Role
    credits: number
    joined: string
}

export type ApiUser = {
    id: number
    name: string
    email: string
    role: Role
    status: string
    credits: number
    created_at: string
}

const normalizeStatus = (status: string): "Active" | "Suspended" | "Inactive" => {
    const s = (status || "").toLowerCase()
    if (s === "suspended") return "Suspended"
    if (s === "inactive") return "Inactive"
    return "Active"
}

const normalizeUser = (u: ApiUser): User => ({
    id: Number(u.id),
    name: u.name,
    email: u.email,
    plan: "Basic",
    status: normalizeStatus(u.status),
    role: u.role || "user",
    credits: Number(u.credits || 0),
    joined: u.created_at ? new Date(u.created_at).toLocaleDateString() : "-",
})

const roleMeta: Record<Role, { label: string; color: string; icon: React.ElementType }> = {
    admin: { label: "Admin", color: "bg-violet-100 text-violet-700 ring-violet-200", icon: ShieldCheck },
    manager: { label: "Manager", color: "bg-blue-100   text-blue-700   ring-blue-200", icon: UserCog },
    reseller: { label: "Reseller", color: "bg-amber-100  text-amber-700  ring-amber-200", icon: Store },
    user: { label: "User", color: "bg-slate-100  text-slate-700  ring-slate-200", icon: Users },
    demo: { label: "Demo", color: "bg-green-100  text-green-700  ring-green-200", icon: FlaskConical },
}

const roles: Role[] = ["admin", "manager", "reseller", "user", "demo"]

const addUserSchema = z.object({
    name: z.string().min(2, "Name is required"),
    email: z.string().email("Invalid email"),
    password: z.string().min(6, "Password min 6 characters"),
    role: z.enum(["admin", "manager", "reseller", "user", "demo"]),
    credits: z.number().min(0, "Credits cannot be negative")
})
type AddUserValues = z.infer<typeof addUserSchema>

const editUserSchema = z.object({
    id: z.number(),
    name: z.string().min(2, "Name is required"),
    email: z.string().email("Invalid email"),
    role: z.enum(["admin", "manager", "reseller", "user", "demo"])
})
type EditUserValues = z.infer<typeof editUserSchema>

const adjustCreditsSchema = z.object({
    id: z.number(),
    amount: z.number(),
    amountPaid: z.number().min(0, "Amount paid cannot be negative")
})
type AdjustCreditsValues = z.infer<typeof adjustCreditsSchema>
export function ManageUsersClient({ initialData }: { initialData: ApiUser[] }) {
    const { users: storeUsers, setUsers } = useUsersStore()

    // Normalize store users to local User type for display
    const users = storeUsers.map(normalizeUser)

    const [isLoading, setIsLoading] = useState(false)
    const [searchTerm, setSearchTerm] = useState("")
    const [roleFilter, setRoleFilter] = useState<Role | null>(null)
    const [loginAsTarget, setLoginAsTarget] = useState<User | null>(null)
    const [adjustCreditsTarget, setAdjustCreditsTarget] = useState<User | null>(null)
    const [copiedId, setCopiedId] = useState<number | null>(null)

    const [isAddModalOpen, setIsAddModalOpen] = useState(false)
    const [editUserTarget, setEditUserTarget] = useState<User | null>(null)

    const addForm = useForm<AddUserValues>({
        resolver: zodResolver(addUserSchema),
        defaultValues: { name: "", email: "", password: "", role: "user", credits: 0 }
    })

    const editForm = useForm<EditUserValues>({
        resolver: zodResolver(editUserSchema),
        defaultValues: { id: 0, name: "", email: "", role: "user" }
    })

    const adjustCreditsForm = useForm<AdjustCreditsValues>({
        resolver: zodResolver(adjustCreditsSchema),
        defaultValues: { id: 0, amount: 0, amountPaid: 0 }
    })

    const handleAddSubmit = async (values: AddUserValues) => {
        try {
            const data = await ApiClient.post('/admin/users/create', values);
            if (data.status === 'success') {
                setIsAddModalOpen(false);
                addForm.reset();
                toast.success("User created successfully!");
                fetchUsers();
            } else {
                toast.error(data.message || "Failed to create user");
            }
        } catch (error: unknown) {
            console.error("Add user failed:", error);
            toast.error(error instanceof Error ? error.message : "An error occurred");
        }
    }

    const handleEditSubmit = async (values: EditUserValues) => {
        try {
            const data = await ApiClient.post('/admin/users/edit', values);
            if (data.status === 'success') {
                setEditUserTarget(null);
                toast.success("User updated successfully!");
                fetchUsers();
            } else {
                toast.error(data.message || "Failed to update user");
            }
        } catch (error: unknown) {
            console.error("Edit user failed:", error);
            toast.error(error instanceof Error ? error.message : "An error occurred");
        }
    }

    const handleAdjustCreditsSubmit = async (values: AdjustCreditsValues) => {
        const success = await performAction({
            action: 'adjust_credits',
            user_id: values.id,
            amount: values.amount,
            amount_paid: values.amountPaid
        });
        if (success) {
            setAdjustCreditsTarget(null);
            toast.success("Credits adjusted successfully!");
        }
    }

    const fetchUsers = useCallback(async () => {
        try {
            const data = await ApiClient.get('/admin/users');
            if (data.status === 'success') {
                const rows = (data.data as ApiUser[]) || [];
                setUsers(rows);
            }
        } catch (error) {
            console.error("Failed to fetch users:", error);
        } finally {
            setIsLoading(false);
        }
    }, [setUsers]);

    useEffect(() => {
        if (initialData && initialData.length > 0) {
            setUsers(initialData);
        }
    }, [initialData, setUsers]);

    // Always silent-refetch on mount so soft-nav / Router Cache cannot serve stale user rows
    useEffect(() => {
        void fetchUsers();
    }, [fetchUsers]);

    const performAction = async (actionData: unknown) => {
        try {
            const result = await ApiClient.post('/admin/users/action', actionData);

            if (result.status === 'success') {
                fetchUsers();
                return true;
            }
            toast.error(result.message);
            return false;
        } catch (error) {
            console.error("Action failed:", error);
            toast.error("Action failed");
            return false;
        }
    }

    const deleteUser = async (id: number) => {
        if (!confirm("Are you sure you want to delete this user? This action cannot be undone.")) return;
        try {
            const result = await ApiClient.post('/admin/users/action', { action: 'delete', user_id: id });
            if (result.status === 'success') {
                toast.success("User deleted successfully!");
                fetchUsers();
            } else {
                toast.error(result.message);
            }
        } catch (error) {
            console.error("Delete failed:", error);
            toast.error("Failed to delete user");
        }
    }

    const copyUserId = (id: number) => {
        navigator.clipboard.writeText(String(id))
        setCopiedId(id)
        setTimeout(() => setCopiedId(null), 2000)
    }

    const filtered = users.filter(user => {
        const name = user.name || "";
        const email = user.email || "";
        const matchSearch =
            name.toLowerCase().includes(searchTerm.toLowerCase()) ||
            email.toLowerCase().includes(searchTerm.toLowerCase())
        const matchRole = !roleFilter || user.role === roleFilter
        return matchSearch && matchRole
    })

    return (
        <div className="flex-1 space-y-4">
            {/* Header */}
            <div className="flex items-center justify-between">
                <div>
                    <h2 className="text-2xl font-semibold tracking-tight text-[#0b1f1c] sm:text-3xl">Manage Users</h2>
                </div>
                <div className="flex gap-2">
                    <Button
                        variant="outline"
                        onClick={() => { setIsLoading(true); fetchUsers(); }}
                        className="border-[#0b1f1c]/10 text-[#5a736c]"
                    >
                        <RefreshCcw className={`mr-2 h-4 w-4 ${isLoading ? 'animate-spin' : ''}`} /> Refresh
                    </Button>
                    <Button className="border border-[#08352f] bg-[#0f5c52] hover:bg-[#0b4a42] text-white shadow-none" onClick={() => setIsAddModalOpen(true)}>
                        <UserPlus className="mr-2 h-4 w-4" /> Add User
                    </Button>
                </div>
            </div>

            {/* Summary Cards */}
            <div className="grid gap-4 md:grid-cols-2 lg:grid-cols-4">
                <Card className="border-[#0b1f1c]/10 bg-white/90 shadow-none">
                    <CardHeader className="flex flex-row items-center justify-between pb-2">
                        <CardTitle className="text-sm font-medium text-[#5a736c]">Total Users</CardTitle>
                        <Users className="h-4 w-4 text-[#0f5c52]" />
                    </CardHeader>
                    <CardContent>
                        <div className="text-2xl font-semibold tracking-tight text-[#0b1f1c]">{users.length}</div>
                    </CardContent>
                </Card>
                <Card className="border-[#0b1f1c]/10 bg-white/90 shadow-none">
                    <CardHeader className="flex flex-row items-center justify-between pb-2">
                        <CardTitle className="text-sm font-medium text-[#5a736c]">Inactive Users</CardTitle>
                        <UserX className="h-4 w-4 text-amber-500" />
                    </CardHeader>
                    <CardContent>
                        <div className="text-2xl font-semibold tracking-tight text-[#0b1f1c]">{users.filter(u => u.status === 'Inactive').length}</div>
                    </CardContent>
                </Card>
                <Card className="border-[#0b1f1c]/10 bg-white/90 shadow-none">
                    <CardHeader className="flex flex-row items-center justify-between pb-2">
                        <CardTitle className="text-sm font-medium text-[#5a736c]">Suspended</CardTitle>
                        <Ban className="h-4 w-4 text-rose-500" />
                    </CardHeader>
                    <CardContent>
                        <div className="text-2xl font-semibold tracking-tight text-[#0b1f1c]">{users.filter(u => u.status === 'Suspended').length}</div>
                    </CardContent>
                </Card>
                <Card className="border-[#0b1f1c]/10 bg-white/90 shadow-none">
                    <CardHeader className="flex flex-row items-center justify-between pb-2">
                        <CardTitle className="text-sm font-medium text-[#5a736c]">Paid Members</CardTitle>
                        <CreditCard className="h-4 w-4 text-emerald-500" />
                    </CardHeader>
                    <CardContent>
                        <div className="text-2xl font-semibold tracking-tight text-[#0b1f1c]">{users.filter(u => u.credits > 100 || (u.role && u.role !== 'user' && u.role !== 'demo')).length}</div>
                        <p className="text-xs text-[#6b857c] font-normal">Credits &gt; 100 or higher role</p>
                    </CardContent>
                </Card>
            </div>

            {/* User Table */}
            <Card className="border-[#0b1f1c]/10 bg-white/90 shadow-none overflow-hidden">
                <CardHeader className="bg-[#f0f4f2]/60 border-b border-[#0b1f1c]/8">
                    <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-4">
                        <div>
                            <CardTitle className="text-lg font-semibold text-[#0b1f1c]">User Directory</CardTitle>
                            <CardDescription className="text-[#5a736c]">View and manage all registered users and their roles.</CardDescription>
                        </div>
                        <div className="flex items-center gap-2">
                            <div className="relative w-full sm:w-48">
                                <Filter className="absolute left-2.5 top-2.5 h-3.5 w-3.5 text-[#6b857c]" />
                                <Input
                                    id="user-search"
                                    name="search"
                                    aria-label="Search users"
                                    placeholder="Search users..."
                                    className="pl-8 h-8 text-xs focus-visible:ring-[#0f5c52]/30"
                                    value={searchTerm}
                                    onChange={(e) => setSearchTerm(e.target.value)}
                                />
                            </div>
                            <div className="w-32">
                                <SimpleSelect
                                    value={roleFilter || "all"}
                                    onChange={(e) => setRoleFilter(e.target.value === "all" ? null : e.target.value as Role)}
                                    options={[
                                        { label: "All Roles", value: "all" },
                                        ...roles.map(r => ({ label: roleMeta[r].label, value: r }))
                                    ]}
                                    className="h-8 text-xs border-[#0b1f1c]/10 focus:ring-[#0f5c52]/30"
                                />
                            </div>
                        </div>
                    </div>
                </CardHeader>

                <CardContent className="p-0">
                    <Table>
                        <TableHeader className="bg-[#f0f4f2]/60">
                            <TableRow className="border-b border-[#0b1f1c]/8 hover:bg-transparent">
                                <TableHead className="font-semibold text-[#0b1f1c]">User</TableHead>
                                <TableHead className="font-semibold text-[#0b1f1c]">Role</TableHead>
                                <TableHead className="font-semibold text-[#0b1f1c]">Plan</TableHead>
                                <TableHead className="font-semibold text-[#0b1f1c] text-center">Credits</TableHead>
                                <TableHead className="font-semibold text-[#0b1f1c]">Status</TableHead>
                                <TableHead className="font-semibold text-[#0b1f1c]">Joined</TableHead>
                                <TableHead className="font-semibold text-[#0b1f1c] text-right">Actions</TableHead>
                            </TableRow>
                        </TableHeader>
                        <TableBody>
                            {isLoading && users.length === 0 ? (
                                [1, 2, 3, 4, 5].map(i => (
                                    <TableRow key={i} className="hover:bg-transparent border-b border-[#0b1f1c]/5">
                                        <TableCell>
                                            <div className="flex items-center gap-3">
                                                <div className="h-8 w-8 rounded-full bg-[#0b1f1c]/5 animate-pulse flex-shrink-0"></div>
                                                <div className="space-y-2">
                                                    <div className="h-3 w-24 bg-[#0b1f1c]/5 animate-pulse rounded"></div>
                                                    <div className="h-2 w-32 bg-[#0b1f1c]/5 animate-pulse rounded"></div>
                                                </div>
                                            </div>
                                        </TableCell>
                                        <TableCell><div className="h-5 w-16 bg-[#0b1f1c]/5 animate-pulse rounded-full"></div></TableCell>
                                        <TableCell><div className="h-4 w-20 bg-[#0b1f1c]/5 animate-pulse rounded"></div></TableCell>
                                        <TableCell className="text-center"><div className="h-5 w-12 bg-[#0b1f1c]/5 animate-pulse rounded mx-auto"></div></TableCell>
                                        <TableCell><div className="h-5 w-16 bg-[#0b1f1c]/5 animate-pulse rounded-full"></div></TableCell>
                                        <TableCell><div className="h-4 w-24 bg-[#0b1f1c]/5 animate-pulse rounded"></div></TableCell>
                                        <TableCell className="text-right"><div className="h-8 w-8 bg-[#0b1f1c]/5 animate-pulse rounded ml-auto"></div></TableCell>
                                    </TableRow>
                                ))
                            ) : (
                                filtered.map((user) => {
                                    const { label, color, icon: RoleIcon } = roleMeta[user.role]
                                    return (
                                        <TableRow key={user.id} className="border-b border-[#0b1f1c]/5 hover:bg-[#f0f4f2]/40 group transition-colors">
                                            {/* User */}
                                            <TableCell>
                                                <div className="flex items-center gap-3">
                                                    <div className="h-8 w-8 rounded-full bg-[#0f5c52]/10 flex items-center justify-center font-bold text-[#0f5c52] text-xs flex-shrink-0 uppercase">
                                                        {user.name.charAt(0)}
                                                    </div>
                                                    <div className="flex flex-col">
                                                        <span className="font-medium text-[#0b1f1c] text-sm">{user.name}</span>
                                                        <span className="text-xs text-[#5a736c]">{user.email}</span>
                                                    </div>
                                                </div>
                                            </TableCell>

                                            {/* Role */}
                                            <TableCell>
                                                <Badge
                                                    variant="secondary"
                                                    className={`flex items-center gap-1 w-fit font-semibold shadow-none ring-1 ring-inset ${color}`}
                                                >
                                                    <RoleIcon className="h-3 w-3" />
                                                    {label}
                                                </Badge>
                                            </TableCell>

                                            {/* Plan */}
                                            <TableCell className="text-[#5a736c] font-medium text-sm">
                                                {user.plan}
                                            </TableCell>

                                            {/* Credits */}
                                            <TableCell className="text-center">
                                                <Badge variant="outline" className="font-bold text-[#0f5c52] bg-[#0f5c52]/10 border-[#0f5c52]/20">
                                                    {user.credits?.toLocaleString()}
                                                </Badge>
                                            </TableCell>

                                            {/* Status */}
                                            <TableCell>
                                                <Badge variant="secondary" className={
                                                    user.status === "Active"
                                                        ? "bg-emerald-100 text-emerald-700 ring-1 ring-inset ring-emerald-600/20 shadow-none font-medium"
                                                        : user.status === "Inactive"
                                                            ? "bg-amber-100 text-amber-700 ring-1 ring-inset ring-amber-600/20 shadow-none font-medium"
                                                            : "bg-rose-100 text-rose-700 ring-1 ring-inset ring-rose-600/20 shadow-none font-medium"
                                                }>
                                                    {user.status}
                                                </Badge>
                                            </TableCell>

                                            {/* Joined */}
                                            <TableCell className="text-[#5a736c] text-sm">{user.joined}</TableCell>

                                            {/* Actions */}
                                            <TableCell className="text-right">
                                                <DropdownMenu>
                                                    <DropdownMenuTrigger asChild>
                                                        <Button variant="ghost" size="icon" className="h-8 w-8 text-[#5a736c] hover:text-[#0f5c52] hover:bg-[#0f5c52]/10">
                                                            <MoreHorizontal className="h-4 w-4" />
                                                        </Button>
                                                    </DropdownMenuTrigger>
                                                    <DropdownMenuContent
                                                        align="end"
                                                        className="w-52 bg-white border border-[#0b1f1c]/10 shadow-lg rounded-lg py-1"
                                                    >
                                                        {/* Header: name+email left, Login right */}
                                                        <div className="flex items-center justify-between px-2 py-2 border-b border-[#0b1f1c]/8 mb-1 gap-2">
                                                            <div className="min-w-0">
                                                                <p className="text-xs font-semibold text-[#0b1f1c] truncate">{user.name}</p>
                                                                <p className="text-[10px] text-[#6b857c] truncate">{user.email}</p>
                                                            </div>
                                                            <button
                                                                title="Login as User"
                                                                onClick={() => setLoginAsTarget(user)}
                                                                className="p-1.5 rounded-md text-[#0f5c52] hover:bg-[#0f5c52]/10 transition-colors flex-shrink-0"
                                                            >
                                                                <LogIn className="h-3.5 w-3.5" />
                                                            </button>
                                                        </div>

                                                        <DropdownMenuItem className="cursor-pointer mx-1 rounded-md focus:bg-[#f0f4f2]/60">
                                                            <span className="flex items-center w-full cursor-pointer" onClick={() => {
                                                                setEditUserTarget(user);
                                                                editForm.reset({
                                                                    id: user.id,
                                                                    name: user.name,
                                                                    email: user.email,
                                                                    role: user.role
                                                                });
                                                            }}>
                                                                <Edit className="mr-2 h-4 w-4 text-[#6b857c]" /> Edit Profile
                                                            </span>
                                                        </DropdownMenuItem>
                                                        <DropdownMenuItem className="cursor-pointer mx-1 rounded-md focus:bg-[#f0f4f2]/60">
                                                            <Mail className="mr-2 h-4 w-4 text-[#6b857c]" /> Email User
                                                        </DropdownMenuItem>

                                                        {/* More actions submenu */}
                                                        <DropdownMenuSub>
                                                            <DropdownMenuSubTrigger className="cursor-pointer mx-1 rounded-md focus:bg-[#f0f4f2]/60 data-[state=open]:bg-[#f0f4f2]/60">
                                                                <MoreHorizontal className="mr-2 h-4 w-4 text-[#6b857c]" /> More Actions
                                                            </DropdownMenuSubTrigger>
                                                            <DropdownMenuPortal>
                                                                <DropdownMenuSubContent className="w-44 bg-white border border-[#0b1f1c]/10 shadow-lg rounded-lg py-1">
                                                                    <DropdownMenuItem className="cursor-pointer mx-1 rounded-md focus:bg-[#f0f4f2]/60">
                                                                        <KeyRound className="mr-2 h-4 w-4 text-[#6b857c]" /> Reset Password
                                                                    </DropdownMenuItem>
                                                                    <DropdownMenuItem
                                                                        className="cursor-pointer mx-1 rounded-md focus:bg-[#f0f4f2]/60"
                                                                        onClick={() => {
                                                                            setAdjustCreditsTarget(user);
                                                                            adjustCreditsForm.reset({ id: user.id, amount: 0, amountPaid: 0 });
                                                                        }}
                                                                    >
                                                                        <CreditCard className="mr-2 h-4 w-4 text-[#6b857c]" /> Adjust Credits
                                                                    </DropdownMenuItem>
                                                                    <DropdownMenuItem
                                                                        className="cursor-pointer mx-1 rounded-md focus:bg-[#f0f4f2]/60"
                                                                        onClick={() => copyUserId(user.id)}
                                                                    >
                                                                        {copiedId === user.id
                                                                            ? <CheckCheck className="mr-2 h-4 w-4 text-emerald-500" />
                                                                            : <Copy className="mr-2 h-4 w-4 text-[#6b857c]" />}
                                                                        {copiedId === user.id ? "Copied!" : "Copy User ID"}
                                                                    </DropdownMenuItem>
                                                                </DropdownMenuSubContent>
                                                            </DropdownMenuPortal>
                                                        </DropdownMenuSub>

                                                        {/* Change Role submenu */}
                                                        <DropdownMenuSub>
                                                            <DropdownMenuSubTrigger className="cursor-pointer mx-1 rounded-md focus:bg-[#f0f4f2]/60 data-[state=open]:bg-[#f0f4f2]/60">
                                                                <UserCog className="mr-2 h-4 w-4 text-[#6b857c]" /> Change Role
                                                            </DropdownMenuSubTrigger>
                                                            <DropdownMenuPortal>
                                                                <DropdownMenuSubContent className="w-40 bg-white border border-[#0b1f1c]/10 shadow-lg rounded-lg py-1">
                                                                    {roles.map(r => {
                                                                        const { label: rLabel, icon: RIcon } = roleMeta[r]
                                                                        return (
                                                                            <DropdownMenuItem
                                                                                key={r}
                                                                                className={`cursor-pointer mx-1 rounded-md focus:bg-[#f0f4f2]/60 ${user.role === r ? "font-bold text-[#0f5c52]" : ""}`}
                                                                                onClick={() => performAction({ action: 'update_role', user_id: user.id, role: r })}
                                                                            >
                                                                                <RIcon className="mr-2 h-3.5 w-3.5" />
                                                                                {rLabel}
                                                                                {user.role === r && <span className="ml-auto text-[#0f5c52] text-xs">✓</span>}
                                                                            </DropdownMenuItem>
                                                                        )
                                                                    })}
                                                                </DropdownMenuSubContent>
                                                            </DropdownMenuPortal>
                                                        </DropdownMenuSub>
                                                        <DropdownMenuSub>
                                                            <DropdownMenuSubTrigger className="cursor-pointer mx-1 rounded-md focus:bg-[#f0f4f2]/60 data-[state=open]:bg-[#f0f4f2]/60">
                                                                <AlertTriangle className="mr-2 h-4 w-4 text-[#6b857c]" /> Danger Zone
                                                            </DropdownMenuSubTrigger>
                                                            <DropdownMenuPortal>
                                                                <DropdownMenuSubContent className="w-44 bg-white border border-[#0b1f1c]/10 shadow-lg rounded-lg py-1">
                                                                    <DropdownMenuItem
                                                                        className={`cursor-pointer mx-1 rounded-md ${user.status === "Active"
                                                                            ? "text-amber-600 focus:text-amber-600 focus:bg-amber-50"
                                                                            : "text-emerald-600 focus:text-emerald-600 focus:bg-emerald-50"
                                                                            }`}
                                                                        onClick={() => performAction({
                                                                            action: 'toggle_status',
                                                                            user_id: user.id,
                                                                            status: user.status === "Active" ? "Suspended" : "Active"
                                                                        })}
                                                                    >
                                                                        {user.status === "Active"
                                                                            ? <><Ban className="mr-2 h-4 w-4" /> Suspend Account</>
                                                                            : user.status === "Inactive"
                                                                                ? <><CheckCheck className="mr-2 h-4 w-4" /> Activate Account</>
                                                                                : <><CheckCheck className="mr-2 h-4 w-4" /> Reopen Account</>}
                                                                    </DropdownMenuItem>
                                                                    <DropdownMenuItem
                                                                        className="cursor-pointer mx-1 rounded-md text-rose-600 focus:text-rose-600 focus:bg-rose-50"
                                                                        onClick={() => deleteUser(user.id)}
                                                                    >
                                                                        <Trash2 className="mr-2 h-4 w-4" /> Delete User
                                                                    </DropdownMenuItem>
                                                                </DropdownMenuSubContent>
                                                            </DropdownMenuPortal>
                                                        </DropdownMenuSub>
                                                    </DropdownMenuContent>
                                                </DropdownMenu>
                                            </TableCell>

                                        </TableRow>
                                    )
                                })
                            )}
                            {(!isLoading && filtered.length === 0 && users.length > 0) && (
                                <TableRow>
                                    <TableCell colSpan={7} className="text-center py-10 text-[#6b857c]">
                                        No users found matching your search or filter.
                                    </TableCell>
                                </TableRow>
                            )}
                        </TableBody>
                    </Table>
                </CardContent>

                <div className="flex items-center justify-between p-4 border-t border-[#0b1f1c]/8 bg-[#f0f4f2]/60">
                    <p className="text-sm text-[#5a736c]">Showing {filtered.length} of {users.length} users</p>
                    <div className="flex gap-2">
                        <Button variant="outline" size="sm" disabled className="border-[#0b1f1c]/10 text-[#5a736c]">Previous</Button>
                        <Button variant="outline" size="sm" disabled className="border-[#0b1f1c]/10 text-[#5a736c]">Next</Button>
                    </div>
                </div>
            </Card>

            {/* Login As User Confirmation Modal */}
            {loginAsTarget && (
                <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/40 backdrop-blur-sm">
                    <div className="bg-white rounded-xl shadow-2xl border border-slate-200 w-full max-w-sm mx-4 p-6 space-y-4">
                        <div className="flex items-center gap-3">
                            <div className="p-2 bg-[#0f5c52]/10 rounded-lg">
                                <LogIn className="h-5 w-5 text-[#0f5c52]" />
                            </div>
                            <div>
                                <h3 className="font-bold text-[#0b1f1c] text-base">Login as User</h3>
                                <p className="text-xs text-[#5a736c]">Admin impersonation</p>
                            </div>
                        </div>

                        <div className="p-3 rounded-lg bg-amber-50 border border-amber-100 flex items-start gap-2">
                            <AlertTriangle className="h-4 w-4 text-amber-600 flex-shrink-0 mt-px" />
                            <p className="text-xs text-amber-700">
                                You are about to log in as <strong>{loginAsTarget.name}</strong> ({loginAsTarget.email}). All actions you take will be performed on their account.
                            </p>
                        </div>

                        <div className="flex gap-2 pt-1">
                            <button
                                onClick={() => setLoginAsTarget(null)}
                                className="flex-1 py-2 text-sm font-medium rounded-lg border border-[#0b1f1c]/10 text-[#5a736c] hover:bg-[#f0f4f2]/60 transition-colors"
                            >
                                Cancel
                            </button>
                            <button
                                onClick={async () => { if (!loginAsTarget) return; try { const response = await fetch('/next-api/auth/impersonate', { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ user_id: loginAsTarget.id }) }); const result = await response.json(); if (result.status === 'success') { localStorage.removeItem('sidebar_user'); localStorage.removeItem('sidebar_role'); localStorage.removeItem('sidebar_user_synced_at'); window.location.href = '/dashboard'; } else { toast.error(result.message || 'Failed to login as user'); } } catch (err) { console.error('Impersonation failed', err); toast.error('An error occurred during impersonation.'); } finally { setLoginAsTarget(null); } }}
                                className="flex-1 py-2 text-sm font-medium rounded-lg border border-[#08352f] bg-[#0f5c52] hover:bg-[#0b4a42] text-white shadow-none transition-colors flex items-center justify-center gap-2"
                            >
                                <LogIn className="h-4 w-4" /> Confirm Login
                            </button>
                        </div>
                    </div>
                </div>
            )}

            {/* Adjust Credits Modal */}
            {adjustCreditsTarget && (
                <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/40 backdrop-blur-sm">
                    <div className="bg-white rounded-xl shadow-2xl border border-slate-200 w-full max-w-sm mx-4 p-6 space-y-4">
                        <div className="flex items-center gap-3">
                            <div className="p-2 bg-[#0f5c52]/10 rounded-lg">
                                <CreditCard className="h-5 w-5 text-[#0f5c52]" />
                            </div>
                            <div>
                                <h3 className="font-bold text-[#0b1f1c] text-base">Adjust Credits</h3>
                                <p className="text-xs text-[#5a736c]">Manage user balance</p>
                            </div>
                        </div>

                        <div className="space-y-2">
                            <div className="flex justify-between items-center text-sm">
                                <span className="text-[#5a736c]">User:</span>
                                <span className="font-medium text-[#0b1f1c]">{adjustCreditsTarget.name}</span>
                            </div>
                            <div className="flex justify-between items-center text-sm">
                                <span className="text-[#5a736c]">Current Balance:</span>
                                <span className="font-bold text-[#0b1f1c]">{adjustCreditsTarget.credits.toLocaleString()}</span>
                            </div>
                        </div>

                        <form onSubmit={adjustCreditsForm.handleSubmit(handleAdjustCreditsSubmit)}>
                            <div className="space-y-4">
                                <div>
                                    <label htmlFor="credit-amount" className="text-xs font-semibold text-[#5a736c] mb-1 block">Credits to Add/Deduct</label>
                                    <div className="flex items-center gap-2">
                                        <button
                                            type="button"
                                            onClick={() => adjustCreditsForm.setValue("amount", (adjustCreditsForm.getValues("amount") || 0) - 1000)}
                                            className="p-2 bg-[#0b1f1c]/5 hover:bg-[#0b1f1c]/10 rounded-lg transition-colors"
                                        >
                                            <Minus className="h-4 w-4 text-[#5a736c]" />
                                        </button>
                                        <div className="flex-1">
                                            <Input
                                                id="credit-amount"
                                                type="number"
                                                className="text-center font-bold text-lg h-12"
                                                {...adjustCreditsForm.register("amount", { valueAsNumber: true })}
                                            />
                                            {adjustCreditsForm.formState.errors.amount && <p className="text-[10px] text-red-500 mt-1 text-center">{adjustCreditsForm.formState.errors.amount.message}</p>}
                                        </div>
                                        <button
                                            type="button"
                                            onClick={() => adjustCreditsForm.setValue("amount", (adjustCreditsForm.getValues("amount") || 0) + 1000)}
                                            className="p-2 bg-[#0f5c52]/10 hover:bg-[#0f5c52]/20 rounded-lg transition-colors text-[#0f5c52]"
                                        >
                                            <Plus className="h-4 w-4" />
                                        </button>
                                    </div>
                                </div>

                                <div>
                                    <label htmlFor="manual_price" className="text-xs font-semibold text-[#5a736c] mb-1 block">Price Paid (track as revenue)</label>
                                    <div className="relative">
                                        <div className="absolute left-3 top-2.5 text-[#6b857c] text-sm">$</div>
                                        <Input
                                            type="number"
                                            placeholder="0.00"
                                            className="pl-7"
                                            id="manual_price"
                                            step="0.01"
                                            {...adjustCreditsForm.register("amountPaid", { valueAsNumber: true })}
                                        />
                                    </div>
                                    {adjustCreditsForm.formState.errors.amountPaid && <p className="text-[10px] text-red-500 mt-1">{adjustCreditsForm.formState.errors.amountPaid.message}</p>}
                                </div>
                            </div>
                            <p className="text-[10px] text-center text-[#6b857c] mt-4 mb-2">Total revenue will be updated if price is greater than 0.</p>

                            <div className="flex gap-2 pt-1">
                                <button
                                    type="button"
                                    onClick={() => setAdjustCreditsTarget(null)}
                                    className="flex-1 py-2 text-sm font-medium rounded-lg border border-[#0b1f1c]/10 text-[#5a736c] hover:bg-[#f0f4f2]/60 transition-colors"
                                >
                                    Cancel
                                </button>
                                <button
                                    type="submit"
                                    disabled={adjustCreditsForm.formState.isSubmitting}
                                className="flex-1 py-2 text-sm font-medium rounded-lg border border-[#08352f] bg-[#0f5c52] hover:bg-[#0b4a42] text-white shadow-none transition-colors"
                            >
                                {adjustCreditsForm.formState.isSubmitting ? "Updating..." : "Update Balance"}
                                </button>
                            </div>
                        </form>
                    </div>
                </div>
            )}

            {/* Add User Modal */}
            {isAddModalOpen && (
                <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/40 backdrop-blur-sm">
                    <div className="bg-white rounded-xl shadow-2xl border border-[#0b1f1c]/10 w-full max-w-md mx-4 p-6 space-y-4">
                        <div className="flex items-center gap-3">
                            <div className="p-2 bg-[#0f5c52]/10 rounded-lg">
                                <UserPlus className="h-5 w-5 text-[#0f5c52]" />
                            </div>
                            <div>
                                <h3 className="font-bold text-[#0b1f1c] text-base">Add New User</h3>
                                <p className="text-xs text-[#5a736c]">Create a user record manually</p>
                            </div>
                        </div>

                        <form onSubmit={addForm.handleSubmit(handleAddSubmit)} className="space-y-3">
                            <div>
                                <label className="text-xs font-semibold text-[#5a736c] mb-1 block font-medium">Full Name</label>
                                <Input
                                    placeholder="e.g. John Doe"
                                    {...addForm.register("name")}
                                />
                                {addForm.formState.errors.name && <p className="text-[10px] text-red-500 mt-1">{addForm.formState.errors.name.message}</p>}
                            </div>
                            <div>
                                <label className="text-xs font-semibold text-[#5a736c] mb-1 block font-medium">Email Address</label>
                                <Input
                                    type="email"
                                    placeholder="john@example.com"
                                    {...addForm.register("email")}
                                />
                                {addForm.formState.errors.email && <p className="text-[10px] text-red-500 mt-1">{addForm.formState.errors.email.message}</p>}
                            </div>
                            <div>
                                <label className="text-xs font-semibold text-[#5a736c] mb-1 block font-medium">Password</label>
                                <Input
                                    type="password"
                                    placeholder="Min 6 characters"
                                    {...addForm.register("password")}
                                />
                                {addForm.formState.errors.password && <p className="text-[10px] text-red-500 mt-1">{addForm.formState.errors.password.message}</p>}
                            </div>
                            <div className="grid grid-cols-2 gap-3">
                                <div>
                                    <label className="text-xs font-semibold text-[#5a736c] mb-1 block font-medium">Role</label>
                                    <SimpleSelect
                                        value={addForm.watch("role")}
                                        onChange={(e) => addForm.setValue("role", e.target.value as Role)}
                                        options={roles.map(r => ({ label: roleMeta[r].label, value: r }))}
                                        className="h-10 text-xs border-[#0b1f1c]/10 focus:ring-[#0f5c52]/30"
                                    />
                                    {addForm.formState.errors.role && <p className="text-[10px] text-red-500 mt-1">{addForm.formState.errors.role.message}</p>}
                                </div>
                                <div>
                                    <label className="text-xs font-semibold text-[#5a736c] mb-1 block font-medium">Initial Credits</label>
                                    <Input
                                        type="number"
                                        placeholder="0"
                                        {...addForm.register("credits", { valueAsNumber: true })}
                                    />
                                    {addForm.formState.errors.credits && <p className="text-[10px] text-red-500 mt-1">{addForm.formState.errors.credits.message}</p>}
                                </div>
                            </div>
                            <div className="flex gap-2 pt-2">
                                <button
                                    type="button"
                                    onClick={() => { setIsAddModalOpen(false); addForm.reset(); }}
                                    className="flex-1 py-2 text-sm font-medium rounded-lg border border-[#0b1f1c]/10 text-[#5a736c] hover:bg-[#f0f4f2]/60 transition-colors"
                                >
                                    Cancel
                                </button>
                                <button
                                    type="submit"
                                    disabled={addForm.formState.isSubmitting}
                                    className="flex-1 py-2 text-sm font-medium rounded-lg border border-[#08352f] bg-[#0f5c52] hover:bg-[#0b4a42] text-white shadow-none disabled:opacity-50 disabled:cursor-not-allowed transition-colors"
                                >
                                    {addForm.formState.isSubmitting ? "Creating..." : "Create User"}
                                </button>
                            </div>
                        </form>
                    </div>
                </div>
            )}

            {/* Edit User Modal */}
            {editUserTarget && (
                <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/40 backdrop-blur-sm">
                    <div className="bg-white rounded-xl shadow-2xl border border-[#0b1f1c]/10 w-full max-w-md mx-4 p-6 space-y-4">
                        <div className="flex items-center gap-3">
                            <div className="p-2 bg-[#0f5c52]/10 rounded-lg">
                                <Edit className="h-5 w-5 text-[#0f5c52]" />
                            </div>
                            <div>
                                <h3 className="font-bold text-[#0b1f1c] text-base">Edit User Profile</h3>
                                <p className="text-xs text-[#5a736c]">Update account details</p>
                            </div>
                        </div>

                        <form onSubmit={editForm.handleSubmit(handleEditSubmit)} className="space-y-3">
                            <div>
                                <label className="text-xs font-semibold text-[#5a736c] mb-1 block font-medium">Full Name</label>
                                <Input
                                    {...editForm.register("name")}
                                />
                                {editForm.formState.errors.name && <p className="text-[10px] text-red-500 mt-1">{editForm.formState.errors.name.message}</p>}
                            </div>
                            <div>
                                <label className="text-xs font-semibold text-[#5a736c] mb-1 block font-medium">Email Address</label>
                                <Input
                                    type="email"
                                    {...editForm.register("email")}
                                />
                                {editForm.formState.errors.email && <p className="text-[10px] text-red-500 mt-1">{editForm.formState.errors.email.message}</p>}
                            </div>
                            <div>
                                <label className="text-xs font-semibold text-[#5a736c] mb-1 block font-medium">Role</label>
                                <SimpleSelect
                                    value={editForm.watch("role")}
                                    onChange={(e) => editForm.setValue("role", e.target.value as Role)}
                                    options={roles.map(r => ({ label: roleMeta[r].label, value: r }))}
                                    className="h-10 text-xs border-[#0b1f1c]/10 focus:ring-[#0f5c52]/30"
                                />
                                {editForm.formState.errors.role && <p className="text-[10px] text-red-500 mt-1">{editForm.formState.errors.role.message}</p>}
                            </div>
                            <div className="flex gap-2 pt-2">
                                <button
                                    type="button"
                                    onClick={() => setEditUserTarget(null)}
                                    className="flex-1 py-2 text-sm font-medium rounded-lg border border-[#0b1f1c]/10 text-[#5a736c] hover:bg-[#f0f4f2]/60 transition-colors"
                                >
                                    Cancel
                                </button>
                                <button
                                    type="submit"
                                    disabled={editForm.formState.isSubmitting}
                                    className="flex-1 py-2 text-sm font-medium rounded-lg border border-[#08352f] bg-[#0f5c52] hover:bg-[#0b4a42] text-white shadow-none disabled:opacity-50 disabled:cursor-not-allowed transition-colors"
                                >
                                    {editForm.formState.isSubmitting ? "Saving..." : "Save Changes"}
                                </button>
                            </div>
                        </form>
                    </div>
                </div>
            )}
        </div>
    )
}

