"use client"

import { useState, useEffect } from "react"
import { Button } from "@/components/common/button"
import { Card, CardContent, CardDescription, CardHeader, CardTitle, CardFooter } from "@/components/common/card"
import { Input } from "@/components/common/input"
import { Key, Copy, Trash2, Plus, CheckCircle2, AlertTriangle, Loader2 } from "lucide-react"
import { cn } from "@/lib/utils"
import { CreditBadge } from "@/app/(dashboard)/_components/credit-badge"
import {
    Table,
    TableBody,
    TableCell,
    TableHead,
    TableHeader,
    TableRow
} from "@/components/common/table"

interface ApiKey {
    id: number;
    name: string;
    key: string;
    key_masked: string;
    created: string;
    status: string;
}

import { ApiClient } from "@/lib/api-client"

export default function ApiKeysPage() {
    const [keys, setKeys] = useState<ApiKey[]>([])
    const [isLoading, setIsLoading] = useState(true)
    const [isCreating, setIsCreating] = useState(false)
    const [newKeyName, setNewKeyName] = useState("")
    const [justCopied, setJustCopied] = useState<number | null>(null)
    const [latestCreatedKey, setLatestCreatedKey] = useState<{ id: number; name: string; api_key: string } | null>(null)

    const fetchKeys = async () => {
        try {
            const data = await ApiClient.get('/user/keys');
            if (data.status === 'success') {
                setKeys(data.data as ApiKey[]);
            }
        } catch (error) {
            console.error("Failed to fetch keys:", error);
        } finally {
            setIsLoading(false);
        }
    }

    useEffect(() => {
        fetchKeys();
    }, []);

    const handleCreateKey = async () => {
        if (!newKeyName || isCreating) return
        setIsCreating(true)

        try {
            const data = await ApiClient.post('/user/keys/create', { name: newKeyName });

            if (data.status === 'success') {
                const created = data.data as { id: number; name: string; api_key: string } | undefined
                if (created?.api_key) {
                    setLatestCreatedKey(created)
                }
                setNewKeyName("");
                fetchKeys();
            }
        } catch (error) {
            console.error("Failed to create key:", error);
        } finally {
            setIsCreating(false)
        }
    }

    const handleDeleteKey = async (id: number) => {
        if (!confirm("Are you sure you want to revoke this API key?")) return;

        try {
            const data = await ApiClient.post('/user/keys/revoke', { id });

            if (data.status === 'success') {
                fetchKeys();
            }
        } catch (error) {
            console.error("Failed to delete key:", error);
        }
    }

    const copyToClipboard = async (id: number, currentKey?: string) => {
        const textToCopy = currentKey;
        if (!textToCopy) {
            alert("For security, existing API keys cannot be viewed again. Copy the key right after creating it.")
            return
        }

        if (textToCopy) {
            navigator.clipboard.writeText(textToCopy);
            setJustCopied(id);
            setTimeout(() => setJustCopied(null), 2000);
        }
    }

    return (
        <div className="flex-1 space-y-4">
            <div className="flex items-center justify-between space-y-2">
                <h2 className="text-3xl font-bold tracking-tight">API Keys</h2>
                <CreditBadge />
            </div>

            <div className="grid gap-4 md:grid-cols-2">
                <Card className="flex flex-col">
                    <CardHeader>
                        <CardTitle>Create New Key</CardTitle>
                        <CardDescription>Generate a new API key to access our services programmatically.</CardDescription>
                    </CardHeader>
                    <CardContent className="space-y-4 flex-1">
                        <div className="space-y-2">
                            <label className="text-sm font-medium">Key Name</label>
                            <Input
                                placeholder="e.g. My Website API"
                                value={newKeyName}
                                onChange={(e) => setNewKeyName(e.target.value)}
                                disabled={isCreating}
                            />
                        </div>
                    </CardContent>
                    <CardFooter>
                        <Button
                            className="w-full bg-[#0f172b] hover:bg-[#0f172b]/90 text-white"
                            onClick={handleCreateKey}
                            disabled={!newKeyName || isCreating}
                        >
                            {isCreating ? <Loader2 className="mr-2 h-4 w-4 animate-spin" /> : <Plus className="mr-2 h-4 w-4" />}
                            Generate API Key
                        </Button>
                    </CardFooter>
                </Card>

                <Card className="bg-amber-50 dark:bg-amber-900/10 border-amber-200 dark:border-amber-900/30 flex flex-col">
                    <CardHeader className="pb-2">
                        <CardTitle className="flex items-center text-amber-800 dark:text-amber-200 text-lg">
                            <AlertTriangle className="mr-2 h-5 w-5" />
                            Security Warning
                        </CardTitle>
                    </CardHeader>
                    <CardContent className="text-sm text-amber-700 dark:text-amber-300">
                        Never share your API keys or expose them in client-side code (browsers). Use them only on your server. If a key is compromised, delete it immediately and generate a new one.
                    </CardContent>
                </Card>
            </div>

            {latestCreatedKey && (
                <Card className="border-green-200 bg-green-50/70 shadow-sm">
                    <CardHeader className="pb-3">
                        <CardTitle className="text-base text-green-900">Copy Your New API Key Now</CardTitle>
                        <CardDescription className="text-green-800/80">
                            This is the only time the full key will be shown.
                        </CardDescription>
                    </CardHeader>
                    <CardContent className="flex flex-col gap-3 md:flex-row md:items-center">
                        <code className="flex-1 rounded bg-white px-3 py-2 text-xs font-mono text-slate-800 break-all border border-green-100">
                            {latestCreatedKey.api_key}
                        </code>
                        <Button
                            variant="outline"
                            onClick={() => copyToClipboard(latestCreatedKey.id, latestCreatedKey.api_key)}
                            className="border-green-300 bg-white text-green-700 hover:bg-green-100"
                        >
                            <Copy className="mr-2 h-4 w-4" />
                            Copy Key
                        </Button>
                    </CardContent>
                </Card>
            )}

            <Card className="shadow-sm border-indigo-100 overflow-hidden">
                <CardHeader className="bg-slate-50/50 border-b border-indigo-50/50">
                    <CardTitle className="text-lg font-semibold text-slate-900">Your API Keys</CardTitle>
                    <CardDescription>Manage your existing keys and monitor their usage.</CardDescription>
                </CardHeader>
                <CardContent className="p-0">
                    <Table>
                        <TableHeader className="bg-slate-50">
                            <TableRow className="border-b border-slate-100 hover:bg-transparent">
                                <TableHead>Name</TableHead>
                                <TableHead>API Key</TableHead>
                                <TableHead>Created</TableHead>
                                <TableHead className="text-right">Actions</TableHead>
                            </TableRow>
                        </TableHeader>
                        <TableBody>
                            {isLoading ? (
                                <TableRow>
                                    <TableCell colSpan={4} className="text-center py-8">
                                        <Loader2 className="h-6 w-6 animate-spin mx-auto text-slate-400" />
                                    </TableCell>
                                </TableRow>
                            ) : keys.map((key) => (
                                <TableRow key={key.id} className="border-b border-slate-50 hover:bg-slate-50/50">
                                    <TableCell className="font-medium text-slate-900">{key.name}</TableCell>
                                    <TableCell>
                                        <code className="bg-slate-100 dark:bg-slate-800 px-2 py-1 rounded text-xs font-mono">
                                            {key.key_masked}
                                        </code>
                                    </TableCell>
                                    <TableCell className="text-[11px] text-slate-500">{key.created}</TableCell>
                                    <TableCell className="text-right">
                                        <div className="flex justify-end gap-2">
                                            <Button
                                                variant="ghost"
                                                size="sm"
                                                onClick={() => copyToClipboard(key.id, key.key)}
                                                className={cn(
                                                    justCopied === key.id ? "text-green-600 hover:text-green-700 hover:bg-green-50" : "text-indigo-600 hover:text-indigo-700 hover:bg-indigo-50"
                                                )}
                                                title="Copy to clipboard"
                                            >
                                                {justCopied === key.id ? <CheckCircle2 className="h-4 w-4" /> : <Copy className="h-4 w-4" />}
                                            </Button>
                                            <Button
                                                variant="ghost"
                                                size="sm"
                                                onClick={() => handleDeleteKey(key.id)}
                                                className="text-red-500 hover:text-red-600 hover:bg-red-50"
                                                title="Delete key"
                                            >
                                                <Trash2 className="h-4 w-4" />
                                            </Button>
                                        </div>
                                    </TableCell>
                                </TableRow>
                            ))}
                            {keys.length === 0 && !isLoading && (
                                <TableRow>
                                    <TableCell colSpan={4} className="text-center py-8 text-slate-500">
                                        No API keys found. Create one to get started.
                                    </TableCell>
                                </TableRow>
                            )}
                        </TableBody>
                    </Table>
                </CardContent>
            </Card>
        </div>
    )
}
