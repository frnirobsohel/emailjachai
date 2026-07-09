"use client"

import { useState, useEffect, useMemo, useRef } from "react"
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card"
import {
    Server, RefreshCcw, Power, Activity, Plus, Copy, Check, Trash2, Settings2,
    ShieldCheck, Zap, Clock, Database, Globe, Signal, MoreVertical, Search, Eye, EyeOff, Lock, AlertCircle, Loader2
} from "lucide-react"
import { Button } from "@/components/ui/button"
import { Input } from "@/components/ui/input"
import { Badge } from "@/components/ui/badge"
import { Label } from "@/components/ui/label"
import { Progress } from "@/components/ui/progress"
import { Separator } from "@/components/ui/separator"
import {
    Table, TableBody, TableCell, TableHead, TableHeader, TableRow,
} from "@/components/ui/table"
import { useForm } from "react-hook-form"
import { zodResolver } from "@hookform/resolvers/zod"
import * as z from "zod"
import { toast } from "react-hot-toast"
import { ApiClient } from "@/lib/api-client"
import { useServerStore } from "@/stores/server-store"
import { useServerWebSocket } from "@/hooks/use-server-web-socket"

export interface ServerNode {
    id: number
    name: string
    address: string
    port: string
    status: string
    ping: string
    runningTime: string
    emailsVerified: number
    currentJob: string
    ipReputation: 'Good' | 'Medium' | 'Low' | 'Blacklist' | 'Band' | 'None'
    workerCount: number
    config: {
        dailyLimit: number
        rateLimit: number
        chunkSize: number
        enabled: boolean
    }
}

type ServerConfigUpdate = Pick<ServerNode["config"], "dailyLimit" | "rateLimit">

const addServerSchema = z.object({
    name: z.string().min(1, "Display name is required"),
    ip: z.string().min(1, "IP/Domain is required"),
    port: z.string().min(1, "Invalid port")
})

const manageServerSchema = z.object({
    rateLimit: z.union([z.string(), z.number()]),
    dailyLimit: z.union([z.string(), z.number()])
})

const rotateKeySchema = z.object({
    password: z.string().min(1, "Password is required")
})

export function ServerClient({ initialData }: { initialData: ServerNode[] }) {
    const servers = useServerStore(state => state.servers)
    const setServers = useServerStore(state => state.setServers)
    
    // Connect to WebSocket to receive real-time server_list_update events
    useServerWebSocket()
    
    const [isLoading, setIsLoading] = useState(false)
    const [workerKey, setWorkerKey] = useState("")
    const [isKeyLoading, setIsKeyLoading] = useState(false)
    const [copied, setCopied] = useState(false)
    const [showAddForm, setShowAddForm] = useState(false)
    const [showApiKey, setShowApiKey] = useState(false)
    const [showRegenerateModal, setShowRegenerateModal] = useState(false)
    const [manageServer, setManageServer] = useState<ServerNode | null>(null)
    const [searchTerm, setSearchTerm] = useState("")
    
    // Inline confirmation state for delete
    const [confirmDeleteId, setConfirmDeleteId] = useState<number | null>(null)
    const deleteTimerRef = useRef<NodeJS.Timeout | null>(null)

    const addForm = useForm<z.infer<typeof addServerSchema>>({
        resolver: zodResolver(addServerSchema),
        defaultValues: { name: "", ip: "", port: "8080" }
    })

    const manageForm = useForm<z.infer<typeof manageServerSchema>>({
        resolver: zodResolver(manageServerSchema)
    })

    const rotateForm = useForm<z.infer<typeof rotateKeySchema>>({
        resolver: zodResolver(rotateKeySchema),
        defaultValues: { password: "" }
    })

    const isFirstMount = useRef(true)

    useEffect(() => {
        if (initialData && initialData.length > 0) {
            setServers(initialData)
        }
    }, [initialData])

    useEffect(() => {
        if (isFirstMount.current) {
            isFirstMount.current = false;
            return;
        }
        fetchServers();
    }, []);

    useEffect(() => {
        if (manageServer) {
            manageForm.reset({
                rateLimit: manageServer.config.rateLimit,
                dailyLimit: manageServer.config.dailyLimit
            })
            setConfirmDeleteId(null)
            if (deleteTimerRef.current) clearTimeout(deleteTimerRef.current)
        }
    }, [manageServer, manageForm])

    const filteredServers = useMemo(() => {
        const query = searchTerm.trim().toLowerCase()
        if (!query) {
            return servers
        }

        return servers.filter((server) => {
            const haystack = [
                server.name,
                server.address,
                `${server.address}:${server.port}`,
                server.status,
                server.currentJob,
                server.ipReputation,
            ].join(" ").toLowerCase()
            return haystack.includes(query)
        })
    }, [servers, searchTerm])

    const fetchServers = async () => {
        try {
            const result = await ApiClient.get<ServerNode[]>('/admin/server/list');
            if (result.status === 'success') {
                const data = Array.isArray(result.data) ? result.data : [];
                setServers(data);
            }
            setWorkerKey("");
        } catch (error) {
            console.error("Failed to fetch servers:", error);
        } finally {
            setIsLoading(false);
        }
    }

    const onAddServer = async (values: z.infer<typeof addServerSchema>) => {
        try {
            const portNum = parseInt(values.port as string, 10);
            if (isNaN(portNum) || portNum < 1 || portNum > 65535) {
                toast.error("Port must be between 1 and 65535");
                return;
            }

            const result = await ApiClient.post('/admin/server/add', {
                server_name: values.name.trim(),
                ip_address: values.ip.trim(),
                port: portNum,
            });

            if (result.status === 'success') {
                toast.success("Worker server added successfully");
                setShowAddForm(false);
                addForm.reset();
                fetchServers();
            } else {
                toast.error(result.message || "Failed to add server");
            }
        } catch (error: any) {
            toast.error(error.message || "Error adding server");
        }
    }

    const handleToggleServer = async (id: number, enable: boolean) => {
        try {
            const result = await ApiClient.post('/admin/server/toggle', {
                id,
                enabled: enable
            });

            if (result.status === 'success') {
                toast.success(enable ? "Server enabled" : "Server disabled");
                fetchServers();
            } else {
                toast.error(result.message || "Failed to toggle server status");
            }
        } catch (error: any) {
            toast.error(error.message || "Error toggling server status");
        }
    }

    const handleDeleteClick = (id: number) => {
        if (confirmDeleteId !== id) {
            setConfirmDeleteId(id)
            if (deleteTimerRef.current) clearTimeout(deleteTimerRef.current)
            deleteTimerRef.current = setTimeout(() => {
                setConfirmDeleteId(null)
            }, 3000)
            return
        }

        doDeleteServer(id)
    }

    const doDeleteServer = async (id: number) => {
        if (deleteTimerRef.current) clearTimeout(deleteTimerRef.current)
        setConfirmDeleteId(null)
        setManageServer(null)
        
        const toastId = toast.loading("Deleting server...")
        try {
            const result = await ApiClient.post('/admin/server/delete', { id });

            if (result.status === 'success') {
                toast.success("Server deleted successfully", { id: toastId });
                fetchServers();
            } else {
                toast.error(result.message || "Failed to delete server", { id: toastId });
            }
        } catch (error: any) {
            toast.error(error.message || "Error deleting server", { id: toastId });
        }
    }

    const fetchWorkerKey = async (reveal = false) => {
        setIsKeyLoading(true);
        try {
            const result = await ApiClient.get<{ worker_key?: string | null }>(`/admin/server/worker-key${reveal ? '?reveal=1' : ''}`);
            if (result.status === 'success') {
                const data = result.data || {};
                if (reveal) {
                    setWorkerKey(data.worker_key || "");
                    setShowApiKey(true);
                }
                return data.worker_key || "";
            }
        } catch (error: any) {
            toast.error(error.message || "Failed to fetch worker key");
        } finally {
            setIsKeyLoading(false);
        }
        return "";
    }

    const toggleReveal = async () => {
        if (showApiKey) {
            setShowApiKey(false);
            return;
        }

        if (workerKey) {
            setShowApiKey(true);
            return;
        }

        await fetchWorkerKey(true);
    };

    const onRotateKey = async (values: z.infer<typeof rotateKeySchema>) => {
        try {
            const result = await ApiClient.post<{ worker_key?: string }>('/admin/server/worker-key/rotate', {
                password: values.password
            });

            if (result.status === 'success') {
                const data = result.data || {};
                setWorkerKey(data.worker_key || "");
                setShowApiKey(true);
                setShowRegenerateModal(false);
                rotateForm.reset();
                setCopied(false);
                toast.success("Worker key rotated successfully.");
            } else {
                toast.error(result.message || "Failed to rotate worker key.");
            }
        } catch (error: any) {
            toast.error(error.message || "Failed to rotate worker key.");
        }
    }

    const copyToClipboard = async () => {
        let keyToCopy = workerKey;
        if (!keyToCopy) {
            try {
                keyToCopy = await fetchWorkerKey(true);
                if (keyToCopy) {
                    setWorkerKey(keyToCopy);
                }
            } catch (e) { console.error(e); }
        }

        if (!keyToCopy) {
            toast.error("Please reveal the key first or check your connection.");
            return;
        }
        navigator.clipboard.writeText(keyToCopy)
        setCopied(true)
        setTimeout(() => setCopied(false), 2000)
    }

    const onUpdateConfig = async (values: z.infer<typeof manageServerSchema>) => {
        if (!manageServer) return;

        try {
            const result = await ApiClient.post('/admin/server/update', {
                id: manageServer.id,
                config: {
                    rateLimit: parseInt(values.rateLimit as string, 10),
                    dailyLimit: parseInt(values.dailyLimit as string, 10)
                }
            });

            if (result.status === 'success') {
                setManageServer(null);
                fetchServers();
                toast.success("Settings updated successfully.");
            } else {
                toast.error(result.message || "Failed to update settings.");
            }
        } catch (error: any) {
            toast.error(error.message || "Error updating server configuration.");
        }
    }

    return (
        <div className="flex-1 space-y-4">
            {/* Header Section */}
            <div className="flex flex-col md:flex-row md:items-center justify-between gap-4">
                <div>
                    <h2 className="text-3xl font-bold tracking-tight text-slate-900">Worker Servers</h2>
                    <p className="text-slate-500 text-sm">Centrally manage and monitor your distributed verification infrastructure.</p>
                </div>
                <div className="flex items-center gap-3">
                    <Button
                        onClick={() => {
                            setShowAddForm(true);
                            addForm.reset();
                        }}
                        className="bg-[#0f172b] hover:bg-[#0f172b]/90 text-white shadow-sm transition-all active:scale-95"
                    >
                        <Plus className="mr-2 h-4 w-4" /> Add New Server
                    </Button>
                </div>
            </div>

            {/* Manage Server Modal */}
            {manageServer && (
                <div className="fixed inset-0 z-[100] flex items-center justify-center p-4 bg-slate-900/40 backdrop-blur-sm animate-in fade-in duration-200">
                    <div className="w-full max-w-md animate-in zoom-in-95 slide-in-from-bottom-4 duration-300">
                        <Card className="shadow-2xl border-indigo-100 overflow-hidden">
                            <CardHeader className="bg-slate-50/50 border-b border-indigo-50/50">
                                <div className="flex items-center justify-between">
                                    <div>
                                        <CardTitle className="text-xl font-bold text-slate-900">Manage Server</CardTitle>
                                        <CardDescription>{manageServer.name}</CardDescription>
                                    </div>
                                    <Button variant="ghost" size="icon" onClick={() => setManageServer(null)} className="h-8 w-8 text-slate-400">
                                        <Plus className="h-5 w-5 rotate-45" />
                                    </Button>
                                </div>
                            </CardHeader>
                            <CardContent className="space-y-6 pt-6">
                                <form onSubmit={manageForm.handleSubmit(onUpdateConfig)} className="space-y-4">
                                    <div className="space-y-4">
                                        <div className="space-y-2">
                                            <Label htmlFor="manage-rate" className="text-xs font-bold text-slate-500 uppercase">Rate Limit (per min)</Label>
                                            <Input 
                                                id="manage-rate" 
                                                type="number" 
                                                className={`focus-visible:ring-indigo-500 font-medium ${manageForm.formState.errors.rateLimit ? 'border-red-400' : 'border-indigo-50'}`} 
                                                {...manageForm.register("rateLimit")} 
                                            />
                                            {manageForm.formState.errors.rateLimit && <p className="text-xs text-red-500">{manageForm.formState.errors.rateLimit.message}</p>}
                                        </div>
                                        <div className="space-y-2">
                                            <Label htmlFor="manage-daily" className="text-xs font-bold text-slate-500 uppercase">Daily Verification Limit</Label>
                                            <Input 
                                                id="manage-daily" 
                                                type="number" 
                                                className={`focus-visible:ring-indigo-500 font-medium ${manageForm.formState.errors.dailyLimit ? 'border-red-400' : 'border-indigo-50'}`} 
                                                {...manageForm.register("dailyLimit")} 
                                            />
                                            {manageForm.formState.errors.dailyLimit && <p className="text-xs text-red-500">{manageForm.formState.errors.dailyLimit.message}</p>}
                                        </div>
                                    </div>

                                    <div className="flex flex-col gap-3 pt-4 border-t border-slate-100">
                                        <Button
                                            type="submit"
                                            disabled={manageForm.formState.isSubmitting}
                                            className="w-full bg-indigo-600 hover:bg-indigo-700 text-white font-bold uppercase tracking-widest shadow-lg shadow-indigo-100/50"
                                        >
                                            {manageForm.formState.isSubmitting ? <Loader2 className="h-4 w-4 animate-spin" /> : "Save Changes"}
                                        </Button>

                                        <div className="flex items-center justify-between pt-2">
                                            <span className="text-sm font-semibold text-slate-700">Server Status</span>
                                            <Button
                                                type="button"
                                                onClick={() => { handleToggleServer(manageServer.id, !manageServer.config.enabled); setManageServer(null); }}
                                                variant={manageServer.config.enabled ? "destructive" : "default"}
                                                size="sm"
                                                className={`h-9 px-6 font-bold uppercase tracking-wider ${!manageServer.config.enabled ? "bg-indigo-600 hover:bg-indigo-700" : "bg-slate-900"}`}
                                            >
                                                {manageServer.config.enabled ? "Disable Node" : "Enable Node"}
                                            </Button>
                                        </div>
                                        <div className="flex items-center justify-between mt-2 pt-4 border-t border-slate-50">
                                            <div>
                                                <p className="text-xs font-bold text-red-600">Danger Zone</p>
                                                <p className="text-[10px] text-slate-500">Irreversible action</p>
                                            </div>
                                            <Button
                                                type="button"
                                                onClick={() => handleDeleteClick(manageServer.id)}
                                                variant="ghost"
                                                size="sm"
                                                className={`h-9 font-bold uppercase tracking-wider transition-all ${
                                                    confirmDeleteId === manageServer.id 
                                                        ? "bg-red-600 text-white hover:bg-red-700 hover:text-white" 
                                                        : "text-red-500 hover:text-red-600 hover:bg-red-50"
                                                }`}
                                            >
                                                <Trash2 className="h-4 w-4 mr-2" /> {confirmDeleteId === manageServer.id ? "Confirm Delete" : "Delete Server"}
                                            </Button>
                                        </div>
                                    </div>
                                </form>
                            </CardContent>
                        </Card>
                    </div>
                </div>
            )}

            {/* Worker API Key Card */}
            <Card className="shadow-sm border-indigo-100 overflow-hidden relative">
                <div className="absolute top-0 right-0 p-8 opacity-[0.03] pointer-events-none">
                    <ShieldCheck className="h-32 w-32 text-indigo-900" />
                </div>
                <CardContent className="p-4">
                    <div className="flex flex-col lg:flex-row lg:items-center justify-between gap-4">
                        <div className="flex items-center gap-2 flex-1">
                            <div className="p-1.5 bg-indigo-50 rounded-lg border border-indigo-100/50 flex-shrink-0">
                                <ShieldCheck className="h-5 w-5 text-indigo-600" />
                            </div>
                            <div className="flex flex-col sm:flex-row sm:items-center gap-x-3 gap-y-1">
                                <span className="text-sm font-semibold text-slate-900 whitespace-nowrap">Universal API Key</span>
                                <span className="hidden sm:block h-3 w-[1px] bg-slate-200" />
                                <span className="text-xs text-slate-500 italic">Required for all backend worker servers to communicate with this dashboard.</span>
                            </div>
                        </div>

                        <div className="flex items-center gap-3 bg-slate-50/50 p-2 rounded-lg border border-indigo-50/50 min-w-[320px] lg:min-w-[400px]">
                            <code className="flex-1 font-mono text-xs text-slate-700 bg-transparent truncate select-all px-2">
                                {showApiKey ? (workerKey || (isKeyLoading ? "Loading..." : "Unavailable")) : "••••••••••••••••••••••••••••••••••••••••"}
                            </code>
                            <div className="flex items-center gap-1">
                                <Button
                                    variant="ghost"
                                    size="icon"
                                    onClick={() => { void toggleReveal(); }}
                                    disabled={isKeyLoading}
                                    className="h-8 w-8 text-slate-400 hover:text-indigo-600 hover:bg-indigo-50"
                                    title={showApiKey ? "Hide Key" : "Reveal Key"}
                                >
                                    {showApiKey ? <EyeOff className="h-4 w-4" /> : <Eye className="h-4 w-4" />}
                                </Button>
                                <Separator orientation="vertical" className="h-5 bg-indigo-100" />
                                <Button
                                    variant="ghost"
                                    size="icon"
                                    onClick={() => {
                                        setShowRegenerateModal(true);
                                        rotateForm.reset();
                                    }}
                                    className="h-8 w-8 text-slate-400 hover:text-amber-600 hover:bg-amber-50"
                                    title="Regenerate Key"
                                >
                                    <RefreshCcw className="h-4 w-4" />
                                </Button>
                                <Separator orientation="vertical" className="h-5 bg-indigo-100" />
                                <Button
                                    variant="ghost"
                                    size="sm"
                                    onClick={() => { void copyToClipboard(); }}
                                    disabled={isKeyLoading}
                                    className="h-8 text-indigo-600 hover:text-indigo-700 hover:bg-indigo-50 font-semibold px-3"
                                >
                                    {copied ? <Check className="h-4 w-4" /> : <Copy className="h-4 w-4" />}
                                    <span className="ml-2 text-xs">{copied ? "Copied" : "Copy"}</span>
                                </Button>
                            </div>
                        </div>
                    </div>
                </CardContent>
            </Card>

            {/* Add Server Modal (Popup) */}
            {showAddForm && (
                <div className="fixed inset-0 z-[100] flex items-center justify-center p-4 bg-slate-900/40 backdrop-blur-sm animate-in fade-in duration-200">
                    <div className="w-full max-w-lg animate-in zoom-in-95 slide-in-from-bottom-4 duration-300">
                        <Card className="shadow-2xl border-indigo-100 overflow-hidden">
                            <CardHeader className="bg-slate-50/50 border-b border-indigo-50/50">
                                <CardTitle className="text-xl font-bold text-slate-900">Add New Worker</CardTitle>
                                <CardDescription>Register a new backend node to your verification fleet.</CardDescription>
                            </CardHeader>
                            <CardContent className="space-y-4 pt-6">
                                <form onSubmit={addForm.handleSubmit(onAddServer)}>
                                    <div className="space-y-4">
                                        <div className="space-y-2">
                                            <Label htmlFor="server-name" className="text-sm font-semibold text-slate-700">Display Name</Label>
                                            <Input
                                                id="server-name" placeholder="e.g. Primary Node - US"
                                                className={`focus-visible:ring-indigo-500 ${addForm.formState.errors.name ? 'border-red-400' : 'border-indigo-50'}`}
                                                {...addForm.register("name")}
                                            />
                                            {addForm.formState.errors.name && <p className="text-xs text-red-500">{addForm.formState.errors.name.message}</p>}
                                            <p className="text-[11px] text-slate-500">Use the same value in the worker's `WORKER_SERVER_NAME` setting, or keep the machine hostname.</p>
                                        </div>
                                        <div className="grid grid-cols-1 sm:grid-cols-4 gap-4">
                                            <div className="sm:col-span-3 space-y-2">
                                                <Label htmlFor="server-address" className="text-sm font-semibold text-slate-700">IP or Domain</Label>
                                                <Input
                                                    id="server-address" placeholder="123.45.67.89"
                                                    className={`focus-visible:ring-indigo-500 ${addForm.formState.errors.ip ? 'border-red-400' : 'border-indigo-50'}`}
                                                    {...addForm.register("ip")}
                                                />
                                                {addForm.formState.errors.ip && <p className="text-xs text-red-500">{addForm.formState.errors.ip.message}</p>}
                                            </div>
                                            <div className="space-y-2">
                                                <Label htmlFor="server-port" className="text-sm font-semibold text-slate-700">Port</Label>
                                                <Input
                                                    id="server-port" placeholder="8080"
                                                    className={`focus-visible:ring-indigo-500 ${addForm.formState.errors.port ? 'border-red-400' : 'border-indigo-50'}`}
                                                    {...addForm.register("port")}
                                                />
                                                {addForm.formState.errors.port && <p className="text-xs text-red-500">{addForm.formState.errors.port.message}</p>}
                                            </div>
                                        </div>
                                    </div>
                                    <div className="flex justify-end gap-3 pt-4 border-t border-slate-100 mt-6">
                                        <Button type="button" variant="outline" onClick={() => setShowAddForm(false)} className="px-6">Cancel</Button>
                                        <Button
                                            type="submit"
                                            disabled={addForm.formState.isSubmitting}
                                            className="bg-[#0f172b] hover:bg-[#0f172b]/90 text-white px-6 font-bold"
                                        >
                                            {addForm.formState.isSubmitting ? <Loader2 className="h-4 w-4 animate-spin" /> : "Connect Server"}
                                        </Button>
                                    </div>
                                </form>
                            </CardContent>
                        </Card>
                    </div>
                </div>
            )}

            {/* Regenerate Worker Key Modal */}
            {showRegenerateModal && (
                <div className="fixed inset-0 z-[110] flex items-center justify-center p-4 bg-slate-900/60 backdrop-blur-md animate-in fade-in duration-200">
                    <div className="w-full max-w-md animate-in zoom-in-95 slide-in-from-bottom-4 duration-300">
                        <Card className="shadow-2xl border-indigo-100 overflow-hidden">
                            <CardHeader className="bg-amber-50/50 border-b border-amber-100/50">
                                <CardTitle className="text-xl font-bold text-slate-900 flex items-center gap-2">
                                    <Lock className="h-5 w-5 text-amber-600" />
                                    Security Verification
                                </CardTitle>
                                <CardDescription>Please enter your administrator password to regenerate the universal API key for all backend worker servers.</CardDescription>
                            </CardHeader>
                            <CardContent className="space-y-4 pt-6">
                                <form onSubmit={rotateForm.handleSubmit(onRotateKey)}>
                                    <div className="space-y-2">
                                        <Label htmlFor="admin-password" className="font-semibold text-slate-700">Admin Password</Label>
                                        <Input
                                            id="admin-password"
                                            type="password"
                                            placeholder="Enter password..."
                                            className={`focus-visible:ring-indigo-500 ${rotateForm.formState.errors.password ? 'border-red-400' : 'border-indigo-50'}`}
                                            {...rotateForm.register("password")}
                                        />
                                        {rotateForm.formState.errors.password && <p className="text-xs text-red-500 flex items-center gap-1"><AlertCircle className="h-3 w-3" />{rotateForm.formState.errors.password.message}</p>}
                                        <p className="text-[10px] text-amber-600 bg-amber-50 p-2 rounded border border-amber-100 italic mt-2">
                                            Warning: Regenerating this API key will immediately disconnect all backend worker servers until they are updated with the new key.
                                        </p>
                                    </div>
                                    <div className="flex justify-end gap-3 pt-4 border-t border-slate-100 mt-4">
                                        <Button type="button" variant="outline" onClick={() => setShowRegenerateModal(false)} className="px-6">Cancel</Button>
                                        <Button
                                            type="submit"
                                            disabled={rotateForm.formState.isSubmitting}
                                            className="bg-[#0f172b] hover:bg-[#0f172b]/90 text-white px-6 font-bold"
                                        >
                                            {rotateForm.formState.isSubmitting ? <Loader2 className="h-4 w-4 animate-spin mr-2" /> : null}
                                            {rotateForm.formState.isSubmitting ? "Regenerating..." : "Regenerate Key"}
                                        </Button>
                                    </div>
                                </form>
                            </CardContent>
                        </Card>
                    </div>
                </div>
            )}

            {/* Servers List View */}
            <Card className="shadow-sm border-indigo-100 overflow-hidden">
                <div className="p-4 border-b border-indigo-50/50 bg-slate-50/50 flex flex-col md:flex-row md:items-center justify-between gap-4">
                    <div className="relative max-w-sm w-full">
                        <Search className="absolute left-2.5 top-2.5 h-4 w-4 text-slate-400" />
                        <Input
                            id="server-search"
                            name="serverSearch"
                            aria-label="Search servers"
                            placeholder="Search servers..."
                            value={searchTerm}
                            onChange={(e) => setSearchTerm(e.target.value)}
                            className="pl-9 h-9 text-sm bg-white focus-visible:ring-indigo-500 border-indigo-50"
                        />
                    </div>
                    <div className="flex items-center gap-2">
                        <Badge variant="outline" className="bg-white text-slate-600 font-medium border-indigo-50">
                            Total Server: {filteredServers.length}
                        </Badge>
                        <Badge variant="outline" className="bg-green-50 text-green-700 border-green-100 font-medium">
                            Online: {filteredServers.filter(s => s.status === "active").length}
                        </Badge>
                    </div>
                </div>
                <div className="overflow-x-auto">
                    <Table>
                        <TableHeader>
                            <TableRow className="bg-slate-50/50 hover:bg-slate-50/50 border-b border-indigo-50/50">
                                <TableHead className="w-[300px] font-semibold text-slate-900">Server Node</TableHead>
                                <TableHead className="w-[100px] font-semibold text-slate-900 text-center">Status</TableHead>
                                <TableHead className="w-[180px] font-semibold text-slate-900">Capacity Usage</TableHead>
                                <TableHead className="min-w-[150px] font-semibold text-slate-900">Current Activity</TableHead>
                                <TableHead className="w-[150px] font-semibold text-slate-900 text-center">IP Reputation</TableHead>
                                <TableHead className="w-[120px] font-semibold text-slate-900 text-center">Worker Count</TableHead>
                                <TableHead className="w-[280px] font-semibold text-slate-900 text-right">Settings & Actions</TableHead>
                            </TableRow>
                        </TableHeader>
                        <TableBody>
                            {filteredServers.map((server) => {
                                const dailyLimit = Math.max(1, server.config?.dailyLimit || 50000)
                                const usagePercent = Math.min(100, Math.round(((server.emailsVerified || 0) / dailyLimit) * 100))

                                return (
                                <TableRow key={server.id} className="group hover:bg-slate-50/30 transition-colors border-b border-slate-50">
                                    <TableCell>
                                        <div className="flex items-start gap-3">
                                            <div className="mt-1 p-2 bg-slate-100 rounded-lg text-slate-600 group-hover:bg-indigo-50 group-hover:text-indigo-600 transition-all duration-300 border border-transparent group-hover:border-indigo-100">
                                                <Server className="h-4 w-4" />
                                            </div>
                                            <div>
                                                <p className="font-semibold text-slate-900 group-hover:text-indigo-700 transition-colors">{server.name}</p>
                                                <div className="flex items-center text-[10px] text-slate-500 gap-2 mt-0.5">
                                                    <span className="flex items-center gap-1 font-mono uppercase bg-slate-100 px-1 rounded border border-slate-200/50">
                                                        <Globe className="h-2.5 w-2.5 text-slate-400" /> {server.address}:{server.port}
                                                    </span>
                                                    <Separator orientation="vertical" className="h-3 bg-slate-200" />
                                                    <span className="flex items-center gap-1 font-medium"><Clock className="h-2.5 w-2.5 text-slate-400" /> {server.runningTime}</span>
                                                </div>
                                            </div>
                                        </div>
                                    </TableCell>
                                    <TableCell className="text-center">
                                        <div className="flex flex-col items-center gap-1">
                                            <Badge variant={server.status === "active" ? "default" : "secondary"}
                                                className={server.status === "active" ? "bg-green-100 text-green-700 hover:bg-green-100 border-green-200" : "bg-slate-100 text-slate-600 border-slate-200"}>
                                                <div className={`h-1.5 w-1.5 rounded-full mr-1.5 ${server.status === "active" ? "bg-green-500 animate-pulse" : "bg-slate-400"}`} />
                                                {server.status === "active" ? "Active" : "Offline"}
                                            </Badge>
                                            {server.status === "active" && (
                                                <span className="text-[10px] text-slate-400 font-medium flex items-center gap-1">
                                                    <Signal className="h-2.5 w-2.5" /> {server.ping}
                                                </span>
                                            )}
                                        </div>
                                    </TableCell>
                                    <TableCell>
                                        <div className="space-y-1.5">
                                            <div className="flex justify-between items-center text-[11px]">
                                                <div className="flex items-center gap-1.5">
                                                    <Database className="h-3 w-3 text-indigo-500" />
                                                    <span className="text-slate-700 font-bold">{(server.emailsVerified || 0).toLocaleString()}</span>
                                                </div>
                                                <span className="font-bold text-indigo-600">
                                                    {usagePercent}%
                                                </span>
                                            </div>
                                            <Progress value={usagePercent} className="h-1.5 bg-slate-100 rounded-full overflow-hidden" />
                                            <p className="text-[9px] text-slate-400 text-right uppercase tracking-wider font-bold">Limit: {(server.config?.dailyLimit || 50000).toLocaleString()}</p>
                                        </div>
                                    </TableCell>
                                    <TableCell>
                                        <div className="flex items-center gap-2 max-w-[220px] bg-slate-50/50 p-2 rounded border border-slate-100 group-hover:border-indigo-50 group-hover:bg-indigo-50/10 transition-all">
                                            <Zap className={`h-3.5 w-3.5 flex-shrink-0 ${server.status === "active" ? "text-amber-500 animate-pulse" : "text-slate-300"}`} />
                                            <div className="overflow-hidden">
                                                <p className="text-[10px] font-bold text-slate-700 truncate uppercase tracking-tighter">
                                                    {server.status === "active" ? "Processing" : "Idle"}
                                                </p>
                                                <p className="text-[10px] text-slate-500 truncate italic">
                                                    {server.status === "active" ? server.currentJob : "--"}
                                                </p>
                                            </div>
                                        </div>
                                    </TableCell>
                                    <TableCell className="text-center">
                                        {server.status === 'active' ? (
                                            <Badge variant="outline" className={`
                                                ${server.ipReputation === 'Good' ? 'bg-green-50 text-green-700 border-green-200' :
                                                    server.ipReputation === 'Medium' ? 'bg-amber-50 text-amber-700 border-amber-200' :
                                                        server.ipReputation === 'Low' ? 'bg-orange-50 text-orange-700 border-orange-200' :
                                                            server.ipReputation === 'Blacklist' ? 'bg-red-50 text-red-700 border-red-200' :
                                                                'bg-slate-50 text-slate-600 border-slate-200'}
                                                font-bold text-[10px] uppercase
                                            `}>
                                                {server.ipReputation}
                                            </Badge>
                                        ) : (
                                            <span className="text-[10px] text-slate-400 font-bold uppercase">None</span>
                                        )}
                                    </TableCell>
                                    <TableCell className="text-center">
                                        <div className="flex flex-col items-center">
                                            <span className={`text-sm font-bold ${server.status === 'active' ? 'text-slate-700' : 'text-slate-300'}`}>
                                                {server.status === 'active' ? server.workerCount : 0}
                                            </span>
                                        </div>
                                    </TableCell>
                                    <TableCell className="text-right">
                                        <Button
                                            onClick={() => setManageServer(server)}
                                            variant="ghost"
                                            size="icon"
                                            className="h-8 w-8 text-slate-400 hover:text-indigo-600 hover:bg-indigo-50"
                                            title="Manage Server"
                                        >
                                            <Settings2 className="h-4 w-4" />
                                        </Button>
                                    </TableCell>
                                </TableRow>
                                )
                            })}
                            {!isLoading && filteredServers.length === 0 && (
                                <TableRow>
                                    <TableCell colSpan={7} className="py-10 text-center text-sm text-slate-500">
                                        No servers matched your search.
                                    </TableCell>
                                </TableRow>
                            )}
                        </TableBody>
                    </Table>
                </div>
                <div className="p-4 bg-slate-50/50 border-t border-indigo-50/50 flex items-center justify-between">
                    <p className="text-[11px] text-slate-500 flex items-center gap-2 font-medium">
                        <Activity className="h-3 w-3 text-indigo-500" /> System heartbeats active
                    </p>
                    <div className="flex items-center gap-1">
                        <div className="h-2 w-2 rounded-full bg-green-500 shadow-[0_0_8px_rgba(34,197,94,0.4)]" />
                        <span className="text-[10px] font-bold text-slate-500 uppercase tracking-wider">Nodes Synced</span>
                    </div>
                </div>
            </Card>
        </div>
    )
}
