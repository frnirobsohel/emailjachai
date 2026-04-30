"use client"

import { useState, useEffect, useCallback, useRef } from "react"
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/common/card"
import { Button } from "@/components/common/button"
import { Input } from "@/components/common/input"
import { Label } from "@/components/common/label"
import { Badge } from "@/components/common/badge"
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/common/table"
import { SimpleSelect } from "@/components/common/simple-select"
import { Globe, Plus, Filter, Trash2, Ban, CheckCircle, ShieldAlert, Upload, Loader2 } from "lucide-react"
import { ApiClient } from "@/lib/api-client"
import { cn } from "@/lib/utils"

type DomainType = 'disposable' | 'free' | 'blacklist' | 'spam-trap'

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

type DomainsResponse = {
    domains: DomainRow[]
    stats: Stats
    total: number
}

export default function DomainsPage() {
    const [domains, setDomains] = useState<DomainRow[]>([])
    const [stats, setStats] = useState<Stats | null>(null)
    const [isLoading, setIsLoading] = useState(true)
    const [isActionLoading, setIsActionLoading] = useState<number | null>(null)
    const [isUploading, setIsUploading] = useState(false)

    // Form states
    const [newDomain, setNewDomain] = useState("")
    const [newType, setNewType] = useState<DomainType>('disposable')
    const [search, setSearch] = useState("")
    const [typeFilter, setTypeFilter] = useState<string>("")
    const [page, setPage] = useState(1)
    const [total, setTotal] = useState(0)

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
        const timer = setTimeout(() => {
            fetchDomains()
        }, 300)
        return () => clearTimeout(timer)
    }, [fetchDomains])

    const handleAddDomain = async (e: React.FormEvent) => {
        e.preventDefault()
        if (!newDomain.trim()) return

        try {
            const res = await ApiClient.post('/admin/domains/store', {
                domain: newDomain,
                type: newType
            })
            if (res.status === 'success') {
                setNewDomain("")
                fetchDomains()
            }
        } catch (err) {
            console.error("Add domain failed", err)
        }
    }

    const handleToggleExcluded = async (id: number) => {
        setIsActionLoading(id)
        try {
            const res = await ApiClient.post<{ excluded: boolean }>('/admin/domains/toggle', { id })
            if (res.status === 'success' && res.data) {
                const newExcluded = res.data.excluded
                setDomains(domains.map(d => d.id === id ? { ...d, excluded: newExcluded } : d))
            }
        } catch (err) {
            console.error("Toggle domain failed", err)
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
            }
        } catch (err) {
            console.error("Delete domain failed", err)
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
        formData.append('type', newType)

        try {
            const response = await fetch('/next-api/proxy/admin/domains/upload', {
                method: 'POST',
                body: formData,
            })
            const res = await response.json()
            if (res.status === 'success') {
                alert(res.message || 'Upload complete')
                fetchDomains()
            } else {
                alert(res.message || 'Upload failed')
            }
        } catch (err) {
            console.error("Upload failed", err)
        } finally {
            setIsUploading(false)
            if (fileInputRef.current) fileInputRef.current.value = ''
        }
    }

    return (
        <div className="flex-1 space-y-6">
            <div className="flex items-center justify-between">
                <div>
                    <h2 className="text-3xl font-bold tracking-tight">Domain Management</h2>
                    <p className="text-slate-500">Configure domain-based verification policies and blacklists.</p>
                </div>
            </div>

            {/* Stats Overview */}
            <div className="grid gap-4 md:grid-cols-2 lg:grid-cols-5">
                <Card className="bg-slate-50/50 border-slate-200">
                    <CardHeader className="pb-2">
                        <CardTitle className="text-xs font-semibold uppercase text-slate-500">Total Domains</CardTitle>
                        <div className="text-2xl font-bold">{stats?.total || 0}</div>
                    </CardHeader>
                </Card>
                <Card className="bg-blue-50/50 border-blue-100">
                    <CardHeader className="pb-2">
                        <CardTitle className="text-xs font-semibold uppercase text-blue-600">Disposable</CardTitle>
                        <div className="text-2xl font-bold text-blue-700">{stats?.disposable || 0}</div>
                    </CardHeader>
                </Card>
                <Card className="bg-green-50/50 border-green-100">
                    <CardHeader className="pb-2">
                        <CardTitle className="text-xs font-semibold uppercase text-green-600">Free Email</CardTitle>
                        <div className="text-2xl font-bold text-green-700">{stats?.free || 0}</div>
                    </CardHeader>
                </Card>
                <Card className="bg-red-50/50 border-red-100">
                    <CardHeader className="pb-2">
                        <CardTitle className="text-xs font-semibold uppercase text-red-600">Blacklist</CardTitle>
                        <div className="text-2xl font-bold text-red-700">{stats?.blacklist || 0}</div>
                    </CardHeader>
                </Card>
                <Card className="bg-amber-50/50 border-amber-100">
                    <CardHeader className="pb-2">
                        <CardTitle className="text-xs font-semibold uppercase text-amber-600">Spam Traps</CardTitle>
                        <div className="text-2xl font-bold text-amber-700">{stats?.spam || 0}</div>
                    </CardHeader>
                </Card>
            </div>

            {/* Add Domain Section */}
            <Card className="border-indigo-100 shadow-sm overflow-hidden">
                <CardHeader className="bg-slate-50/50 border-b border-indigo-50/50">
                    <div className="flex items-center justify-between">
                        <div>
                            <CardTitle className="text-lg font-semibold flex items-center gap-2">
                                <Plus className="h-5 w-5 text-indigo-500" />
                                Add New Domain
                            </CardTitle>
                            <CardDescription>Manually add or upload a list of domains</CardDescription>
                        </div>
                        <Button
                            variant="outline"
                            size="sm"
                            className="border-indigo-200 text-indigo-600 hover:bg-indigo-50"
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
                    <form onSubmit={handleAddDomain} className="grid gap-4 sm:grid-cols-3">
                        <div className="sm:col-span-1">
                            <Label htmlFor="new-domain" className="sr-only">Add Domain</Label>
                            <Input
                                id="new-domain"
                                name="newDomain"
                                placeholder="domain.com"
                                value={newDomain}
                                onChange={(e) => setNewDomain(e.target.value)}
                                className="border-indigo-50 focus-visible:ring-indigo-500"
                            />
                        </div>
                        <div className="sm:col-span-1">
                            <Label htmlFor="new-type" className="sr-only">Domain Type</Label>
                            <SimpleSelect
                                id="new-type"
                                name="newType"
                                value={newType}
                                onChange={(e: React.ChangeEvent<HTMLSelectElement>) => setNewType(e.target.value as DomainType)}
                                options={[
                                    { label: 'Disposable Provider', value: 'disposable' },
                                    { label: 'Free Webmail (Gmail/etc)', value: 'free' },
                                    { label: 'Global Blacklist', value: 'blacklist' },
                                    { label: 'Known Spam Trap', value: 'spam-trap' },
                                ]}
                            />
                        </div>
                        <Button type="submit" className="bg-[#0f172b] hover:bg-[#0f172b]/90 text-white shadow-sm">
                            Add Domain
                        </Button>
                    </form>
                </CardContent>
            </Card>

            {/* List Section */}
            <Card className="border-slate-200 shadow-sm">
                <CardHeader className="pb-3 border-b border-slate-100 bg-slate-50/30">
                    <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-4">
                        <CardTitle className="text-lg font-semibold flex items-center gap-2">
                            <Globe className="h-5 w-5 text-slate-500" />
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
                                    className="pl-8 h-9 text-sm"
                                    aria-label="Search domains"
                                />
                                <Filter className="absolute left-2.5 top-2.5 h-4 w-4 text-slate-400" />
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
                        <TableHeader className="bg-slate-50/50">
                            <TableRow className="border-b border-slate-100">
                                <TableHead className="w-[300px]">Domain</TableHead>
                                <TableHead>Type</TableHead>
                                <TableHead>Status</TableHead>
                                <TableHead>Added On</TableHead>
                                <TableHead className="text-right">Actions</TableHead>
                            </TableRow>
                        </TableHeader>
                        <TableBody>
                            {isLoading ? (
                                <TableRow>
                                    <TableCell colSpan={5} className="h-32 text-center">
                                        <Loader2 className="h-8 w-8 animate-spin mx-auto text-slate-300" />
                                    </TableCell>
                                </TableRow>
                            ) : domains.length === 0 ? (
                                <TableRow>
                                    <TableCell colSpan={5} className="h-32 text-center text-slate-500">
                                        No domains found.
                                    </TableCell>
                                </TableRow>
                            ) : domains.map((row) => (
                                <TableRow key={row.id} className="border-b border-slate-50 hover:bg-slate-50/30">
                                    <TableCell className="font-medium text-slate-900">{row.domain}</TableCell>
                                    <TableCell>
                                        <div className="flex items-center gap-2">
                                            {renderTypeIcon(row.type)}
                                            <span className="capitalize text-sm text-slate-600">{row.type.replace('-', ' ')}</span>
                                        </div>
                                    </TableCell>
                                    <TableCell>
                                        <Badge
                                            variant="secondary"
                                            className={cn(
                                                "text-[10px] h-5 px-1.5 uppercase font-bold",
                                                row.excluded
                                                    ? "bg-slate-100 text-slate-500 border-slate-200"
                                                    : "bg-green-100 text-green-700 border-green-200"
                                            )}
                                        >
                                            {row.excluded ? "Inactive" : "Active"}
                                        </Badge>
                                    </TableCell>
                                    <TableCell className="text-xs text-slate-500">
                                        {new Date(row.created_at).toLocaleDateString()}
                                    </TableCell>
                                    <TableCell className="text-right">
                                        <div className="flex items-center justify-end gap-1">
                                            <Button
                                                variant="ghost"
                                                size="icon"
                                                className="h-8 w-8 text-slate-500 hover:text-indigo-600"
                                                disabled={isActionLoading === row.id}
                                                onClick={() => handleToggleExcluded(row.id)}
                                                title={row.excluded ? "Enable" : "Disable"}
                                            >
                                                {row.excluded ? <CheckCircle className="h-4 w-4" /> : <Ban className="h-4 w-4" />}
                                            </Button>
                                            <Button
                                                variant="ghost"
                                                size="icon"
                                                className="h-8 w-8 text-slate-500 hover:text-red-600"
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
                <div className="flex items-center justify-between p-4 border-t border-slate-100 bg-slate-50/30">
                    <p className="text-sm text-slate-500 font-medium">
                        Showing {domains.length} of {total} domains
                    </p>
                    <div className="flex gap-2">
                        <Button
                            variant="outline"
                            size="sm"
                            disabled={page === 1 || isLoading}
                            onClick={() => setPage(p => p - 1)}
                            className="bg-white border-slate-200"
                        >
                            Previous
                        </Button>
                        <Button
                            variant="outline"
                            size="sm"
                            disabled={domains.length < 20 || total <= page * 20 || isLoading}
                            onClick={() => setPage(p => p + 1)}
                            className="bg-white border-slate-200"
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
            return <Ban className="h-4 w-4 text-blue-500" />
        case 'free':
            return <CheckCircle className="h-4 w-4 text-green-500" />
        case 'blacklist':
            return <ShieldAlert className="h-4 w-4 text-red-500" />
        case 'spam-trap':
            return <ShieldAlert className="h-4 w-4 text-amber-500" />
    }
}
