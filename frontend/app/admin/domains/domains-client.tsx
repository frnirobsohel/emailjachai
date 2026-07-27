"use client"

import { useState, useEffect, useCallback, useRef } from "react"
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card"
import { Button } from "@/components/ui/button"
import { Input } from "@/components/ui/input"
import { Label } from "@/components/ui/label"
import { Badge } from "@/components/ui/badge"
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table"
import { SimpleSelect } from "@/components/ui/simple-select"
import { Globe, Plus, Filter, Trash2, Ban, CheckCircle, ShieldAlert, Upload, Loader2 } from "lucide-react"
import { ApiClient } from "@/lib/api-client"
import { cn } from "@/lib/utils"
import { useForm } from "react-hook-form"
import { zodResolver } from "@hookform/resolvers/zod"
import * as z from "zod"
import { toast } from "react-hot-toast"

type DomainType = 'disposable' | 'free' | 'blacklist' | 'spam-trap'

const addDomainSchema = z.object({
    domain: z.string().min(3, "Domain name is required").regex(/^[a-zA-Z0-9][a-zA-Z0-9-]{1,61}[a-zA-Z0-9]\.[a-zA-Z]{2,}$/, "Invalid domain format"),
    type: z.enum(['disposable', 'free', 'blacklist', 'spam-trap'])
})
type AddDomainValues = z.infer<typeof addDomainSchema>

type DomainRow = {
    id: number
    domain: string
    type: DomainType
    excluded: boolean
    created_at: string
}

type Stats = {
    total: number
    disposable: number
    free: number
    blacklist: number
    spam: number
}

export type DomainsResponse = {
    domains: DomainRow[]
    stats: Stats
    total: number
}

export function DomainsClient({ initialData }: { initialData: DomainsResponse | null }) {
    const [domains, setDomains] = useState<DomainRow[]>(initialData?.domains || [])
    const [stats, setStats] = useState<Stats | null>(initialData?.stats || null)
    const [total, setTotal] = useState(initialData?.total || 0)
    const [isLoading, setIsLoading] = useState(false)
    const [isActionLoading, setIsActionLoading] = useState<number | null>(null)
    const [isUploading, setIsUploading] = useState(false)

    const addForm = useForm<AddDomainValues>({
        resolver: zodResolver(addDomainSchema),
        defaultValues: { domain: "", type: "disposable" }
    })

    const [search, setSearch] = useState("")
    const [typeFilter, setTypeFilter] = useState<string>("")
    const [page, setPage] = useState(1)

    const isInitialMount = useRef(true)

    const fileInputRef = useRef<HTMLInputElement>(null)

    const fetchDomains = useCallback(async () => {
        setIsLoading(true)
        try {
            const query = new URLSearchParams({
                page: page.toString(),
                search: search,
                type: typeFilter,
                per_page: "20"
            })
            const res = await ApiClient.get<DomainsResponse>(`/admin/domains?${query.toString()}`)
            if (res.status === 'success' && res.data) {
                setDomains(res.data.domains)
                setStats(res.data.stats)
                setTotal(res.data.total)
            }
        } catch (err) {
            console.error("Fetch domains failed", err)
        } finally {
            setIsLoading(false)
        }
    }, [page, search, typeFilter])

    useEffect(() => {
        if (initialData) {
            setDomains(initialData.domains || [])
            setStats(initialData.stats || null)
            setTotal(initialData.total || 0)
        }
    }, [initialData])

    useEffect(() => {
        if (isInitialMount.current) {
            isInitialMount.current = false
            return
        }
        const timer = setTimeout(() => {
            fetchDomains()
        }, 300)
        return () => clearTimeout(timer)
    }, [fetchDomains])

    const handleAddSubmit = async (values: AddDomainValues) => {
        try {
            const res = await ApiClient.post('/admin/domains/store', values)
            if (res.status === 'success') {
                addForm.reset()
                toast.success("Domain added successfully")
                fetchDomains()
            } else {
                toast.error(res.message || "Failed to add domain")
            }
        } catch (err: any) {
            console.error("Add domain failed", err)
            toast.error(err.message || "An error occurred")
        }
    }

    const handleToggleExcluded = async (id: number) => {
        setIsActionLoading(id)
        try {
            const res = await ApiClient.post<{ excluded: boolean }>('/admin/domains/toggle', { id })
            if (res.status === 'success' && res.data) {
                const newExcluded = res.data.excluded
                setDomains(domains.map(d => d.id === id ? { ...d, excluded: newExcluded } : d))
                toast.success(`Domain ${newExcluded ? 'disabled' : 'enabled'} successfully`)
            } else {
                toast.error(res.message || "Failed to toggle domain status")
            }
        } catch (err: any) {
            console.error("Toggle domain failed", err)
            toast.error(err.message || "An error occurred")
        } finally {
            setIsActionLoading(null)
        }
    }

    const handleDeleteDomain = async (id: number) => {
        if (!confirm("Are you sure you want to delete this domain?")) return
        setIsActionLoading(id)
        try {
            const res = await ApiClient.post('/admin/domains/delete', { id })
            if (res.status === 'success') {
                setDomains(domains.filter(d => d.id !== id))
                if (stats) {
                    setStats({ ...stats, total: stats.total - 1 })
                }
                toast.success("Domain deleted successfully")
            } else {
                toast.error(res.message || "Failed to delete domain")
            }
        } catch (err: any) {
            console.error("Delete domain failed", err)
            toast.error(err.message || "An error occurred")
        } finally {
            setIsActionLoading(null)
        }
    }

    const handleFileUpload = async (event: React.ChangeEvent<HTMLInputElement>) => {
        const file = event.target.files?.[0]
        if (!file) return

        setIsUploading(true)
        const formData = new FormData()
        formData.append('file', file)
        // Default to "disposable" for bulk upload if we want, or keep it generic
        // Since we don't have a specific type selector for upload anymore, we will default to disposable
        // Wait, previously newType was used. Let's use the current form's type value.
        formData.append('type', addForm.getValues("type"))

        try {
            const response = await fetch('/next-api/proxy/admin/domains/upload', {
                method: 'POST',
                body: formData,
            })
            const res = await response.json()
            if (res.status === 'success') {
                toast.success(res.message || 'Upload complete')
                fetchDomains()
            } else {
                toast.error(res.message || 'Upload failed')
            }
        } catch (err: any) {
            console.error("Upload failed", err)
            toast.error(err.message || "Upload failed")
        } finally {
            setIsUploading(false)
            if (fileInputRef.current) fileInputRef.current.value = ''
        }
    }

    return (
        <div className="flex-1 space-y-6">
            <div className="flex items-center justify-between">
                <div>
                    <h2 className="text-2xl font-semibold tracking-tight text-[#0b1f1c] sm:text-3xl">Domain Management</h2>
                    <p className="mt-1 text-sm text-[#5a736c]">Configure domain-based verification policies and blacklists.</p>
                </div>
            </div>

            {/* Stats Overview */}
            <div className="grid gap-4 md:grid-cols-2 lg:grid-cols-5">
                <Card className="border-[#0b1f1c]/10 bg-white/90 shadow-none">
                    <CardHeader className="pb-2">
                        <CardTitle className="text-xs font-semibold uppercase text-[#5a736c]">Total Domains</CardTitle>
                        <div className="text-2xl font-semibold tracking-tight text-[#0b1f1c]">{stats?.total || 0}</div>
                    </CardHeader>
                </Card>
                <Card className="bg-[#0f5c52]/5 border-[#0f5c52]/15 shadow-none">
                    <CardHeader className="pb-2">
                        <CardTitle className="text-xs font-semibold uppercase text-[#0f5c52]">Disposable</CardTitle>
                        <div className="text-2xl font-semibold tracking-tight text-[#0f5c52]">{stats?.disposable || 0}</div>
                    </CardHeader>
                </Card>
                <Card className="bg-emerald-50/50 border-emerald-100 shadow-none">
                    <CardHeader className="pb-2">
                        <CardTitle className="text-xs font-semibold uppercase text-emerald-600">Free Email</CardTitle>
                        <div className="text-2xl font-semibold tracking-tight text-emerald-700">{stats?.free || 0}</div>
                    </CardHeader>
                </Card>
                <Card className="bg-rose-50/50 border-rose-100 shadow-none">
                    <CardHeader className="pb-2">
                        <CardTitle className="text-xs font-semibold uppercase text-rose-600">Blacklist</CardTitle>
                        <div className="text-2xl font-semibold tracking-tight text-rose-700">{stats?.blacklist || 0}</div>
                    </CardHeader>
                </Card>
                <Card className="bg-amber-50/50 border-amber-100 shadow-none">
                    <CardHeader className="pb-2">
                        <CardTitle className="text-xs font-semibold uppercase text-amber-600">Spam Traps</CardTitle>
                        <div className="text-2xl font-semibold tracking-tight text-amber-700">{stats?.spam || 0}</div>
                    </CardHeader>
                </Card>
            </div>

            {/* Add Domain Section */}
            <Card className="border-[#0b1f1c]/10 bg-white/90 shadow-none overflow-hidden">
                <CardHeader className="bg-[#f0f4f2]/60 border-b border-[#0b1f1c]/8">
                    <div className="flex items-center justify-between">
                        <div>
                            <CardTitle className="text-lg font-semibold text-[#0b1f1c] flex items-center gap-2">
                                <Plus className="h-5 w-5 text-[#0f5c52]" />
                                Add New Domain
                            </CardTitle>
                            <CardDescription className="text-[#5a736c]">Manually add or upload a list of domains</CardDescription>
                        </div>
                        <Button
                            variant="outline"
                            size="sm"
                            className="border-[#0f5c52]/30 text-[#0f5c52] hover:bg-[#0f5c52]/10"
                            onClick={() => fileInputRef.current?.click()}
                            disabled={isUploading}
                        >
                            {isUploading ? <Loader2 className="h-4 w-4 animate-spin mr-2" /> : <Upload className="h-4 w-4 mr-2" />}
                            Bulk Upload
                        </Button>
                        <input
                            type="file"
                            className="hidden"
                            ref={fileInputRef}
                            onChange={handleFileUpload}
                            accept=".csv,.txt"
                        />
                    </div>
                </CardHeader>

                <CardContent className="space-y-4 pt-6">
                    <form onSubmit={addForm.handleSubmit(handleAddSubmit)} className="grid gap-4 sm:grid-cols-3">
                        <div className="sm:col-span-1">
                            <Label htmlFor="new-domain" className="sr-only">Add Domain</Label>
                            <Input
                                id="new-domain"
                                placeholder="domain.com"
                                className={cn("border-[#0b1f1c]/10 focus-visible:ring-[#0f5c52]/30", addForm.formState.errors.domain && "border-red-500")}
                                {...addForm.register("domain")}
                            />
                            {addForm.formState.errors.domain && <p className="text-[10px] text-red-500 mt-1">{addForm.formState.errors.domain.message}</p>}
                        </div>
                        <div className="sm:col-span-1">
                            <Label htmlFor="new-type" className="sr-only">Domain Type</Label>
                            <SimpleSelect
                                id="new-type"
                                options={[
                                    { label: 'Disposable Provider', value: 'disposable' },
                                    { label: 'Free Webmail (Gmail/etc)', value: 'free' },
                                    { label: 'Global Blacklist', value: 'blacklist' },
                                    { label: 'Known Spam Trap', value: 'spam-trap' },
                                ]}
                                {...addForm.register("type")}
                            />
                            {addForm.formState.errors.type && <p className="text-[10px] text-red-500 mt-1">{addForm.formState.errors.type.message}</p>}
                        </div>
                        <div className="sm:col-span-1">
                            <Button type="submit" disabled={addForm.formState.isSubmitting} className="w-full border border-[#08352f] bg-[#0f5c52] hover:bg-[#0b4a42] text-white shadow-none">
                                {addForm.formState.isSubmitting ? "Adding..." : "Add Domain"}
                            </Button>
                        </div>
                    </form>
                </CardContent>
            </Card>

            {/* List Section */}
            <Card className="border-[#0b1f1c]/10 bg-white/90 shadow-none">
                <CardHeader className="pb-3 border-b border-[#0b1f1c]/8 bg-[#f0f4f2]/60">
                    <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-4">
                        <CardTitle className="text-lg font-semibold text-[#0b1f1c] flex items-center gap-2">
                            <Globe className="h-5 w-5 text-[#0f5c52]" />
                            Domain Database
                        </CardTitle>
                        <div className="flex items-center gap-3">
                            <div className="relative w-full sm:w-64">
                                <Label htmlFor="domain-search" className="sr-only">Search Domains</Label>
                                <Input
                                    id="domain-search"
                                    name="domainSearch"
                                    placeholder="Search domains..."
                                    value={search}
                                    onChange={(e) => setSearch(e.target.value)}
                                    className="pl-8 h-9 text-sm focus-visible:ring-[#0f5c52]/30"
                                    aria-label="Search domains"
                                />
                                <Filter className="absolute left-2.5 top-2.5 h-4 w-4 text-[#6b857c]" />
                            </div>
                            <Label htmlFor="type-filter" className="sr-only">Filter by Type</Label>
                            <SimpleSelect
                                id="type-filter"
                                name="typeFilter"
                                value={typeFilter}
                                onChange={(e: React.ChangeEvent<HTMLSelectElement>) => setTypeFilter(e.target.value)}
                                options={[
                                    { label: 'All Types', value: '' },
                                    { label: 'Disposable', value: 'disposable' },
                                    { label: 'Free', value: 'free' },
                                    { label: 'Blacklist', value: 'blacklist' },
                                    { label: 'Spam Trap', value: 'spam-trap' },
                                ]}
                                className="h-9 w-36"
                            />
                        </div>
                    </div>
                </CardHeader>
                <CardContent className="p-0">
                    <Table>
                        <TableHeader className="bg-[#f0f4f2]/60">
                            <TableRow className="border-b border-[#0b1f1c]/8">
                                <TableHead className="w-[300px]">Domain</TableHead>
                                <TableHead>Type</TableHead>
                                <TableHead>Status</TableHead>
                                <TableHead>Added On</TableHead>
                                <TableHead className="text-right">Actions</TableHead>
                            </TableRow>
                        </TableHeader>
                        <TableBody className={cn("transition-opacity", isLoading && "opacity-50")}>
                            {domains.length === 0 && isLoading ? (
                                <TableRow>
                                    <TableCell colSpan={5} className="h-32 text-center">
                                        <Loader2 className="h-8 w-8 animate-spin mx-auto text-[#0b1f1c]/20" />
                                    </TableCell>
                                </TableRow>
                            ) : domains.length === 0 ? (
                                <TableRow>
                                    <TableCell colSpan={5} className="h-32 text-center text-[#5a736c]">
                                        No domains found.
                                    </TableCell>
                                </TableRow>
                            ) : domains.map((row) => (
                                <TableRow key={row.id} className="border-b border-[#0b1f1c]/5 hover:bg-[#f0f4f2]/40">
                                    <TableCell className="font-medium text-[#0b1f1c]">{row.domain}</TableCell>
                                    <TableCell>
                                        <div className="flex items-center gap-2">
                                            {renderTypeIcon(row.type)}
                                            <span className="capitalize text-sm text-[#5a736c]">{row.type.replace('-', ' ')}</span>
                                        </div>
                                    </TableCell>
                                    <TableCell>
                                        <Badge
                                            variant="secondary"
                                            className={cn(
                                                "text-[10px] h-5 px-1.5 uppercase font-bold",
                                                row.excluded
                                                    ? "bg-[#0b1f1c]/5 text-[#5a736c] border-[#0b1f1c]/10"
                                                    : "bg-emerald-100 text-emerald-700 border-emerald-200"
                                            )}
                                        >
                                            {row.excluded ? "Inactive" : "Active"}
                                        </Badge>
                                    </TableCell>
                                    <TableCell className="text-xs text-[#5a736c]">
                                        {new Date(row.created_at).toLocaleDateString()}
                                    </TableCell>
                                    <TableCell className="text-right">
                                        <div className="flex items-center justify-end gap-1">
                                            <Button
                                                variant="ghost"
                                                size="icon"
                                                className="h-8 w-8 text-[#5a736c] hover:text-[#0f5c52]"
                                                disabled={isActionLoading === row.id}
                                                onClick={() => handleToggleExcluded(row.id)}
                                                title={row.excluded ? "Enable" : "Disable"}
                                            >
                                                {row.excluded ? <CheckCircle className="h-4 w-4" /> : <Ban className="h-4 w-4" />}
                                            </Button>
                                            <Button
                                                variant="ghost"
                                                size="icon"
                                                className="h-8 w-8 text-[#5a736c] hover:text-rose-600"
                                                disabled={isActionLoading === row.id}
                                                onClick={() => handleDeleteDomain(row.id)}
                                            >
                                                <Trash2 className="h-4 w-4" />
                                            </Button>
                                        </div>
                                    </TableCell>
                                </TableRow>
                            ))}
                        </TableBody>
                    </Table>
                </CardContent>
                <div className="flex items-center justify-between p-4 border-t border-[#0b1f1c]/8 bg-[#f0f4f2]/60">
                    <p className="text-sm text-[#5a736c] font-medium">
                        Showing {domains.length} of {total} domains
                    </p>
                    <div className="flex gap-2">
                        <Button
                            variant="outline"
                            size="sm"
                            disabled={page === 1 || isLoading}
                            onClick={() => setPage(p => p - 1)}
                            className="bg-white border-[#0b1f1c]/10"
                        >
                            Previous
                        </Button>
                        <Button
                            variant="outline"
                            size="sm"
                            disabled={domains.length < 20 || total <= page * 20 || isLoading}
                            onClick={() => setPage(p => p + 1)}
                            className="bg-white border-[#0b1f1c]/10"
                        >
                            Next
                        </Button>
                    </div>
                </div>
            </Card>
        </div>
    )
}

function renderTypeIcon(type: DomainType) {
    switch (type) {
        case 'disposable':
            return <Ban className="h-4 w-4 text-[#0f5c52]" />
        case 'free':
            return <CheckCircle className="h-4 w-4 text-emerald-500" />
        case 'blacklist':
            return <ShieldAlert className="h-4 w-4 text-rose-500" />
        case 'spam-trap':
            return <ShieldAlert className="h-4 w-4 text-amber-500" />
    }
}
