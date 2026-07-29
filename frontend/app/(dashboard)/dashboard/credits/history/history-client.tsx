"use client"

import { useState, useEffect, useCallback } from "react"
import { Button } from "@/components/ui/button"
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card"
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table"
import { Badge } from "@/components/ui/badge"
import { Wallet, CreditCard, RefreshCcw, Loader2 } from "lucide-react"

export interface Transaction {
    id: string;
    date: string;
    amount: string;
    type: string;
    status: string;
    cost: string;
    package: string;
    description: string;
}

import { ApiClient } from "@/lib/api-client"
import { withTimeZoneQuery } from "@/lib/timezone"

interface CreditsHistoryProps {
    initialStats: {
        credits_remaining: string;
        total_purchased: string;
        total_refunds: string;
    };
    initialTransactions: Transaction[];
    initialTotal: number;
}

export function CreditsHistoryClient({ initialStats, initialTransactions, initialTotal }: CreditsHistoryProps) {
    const [stats, setStats] = useState(initialStats)
    const [transactions, setTransactions] = useState<Transaction[]>(initialTransactions)
    const [isLoading, setIsLoading] = useState(false)
    const [total, setTotal] = useState(initialTotal)
    const [offset, setOffset] = useState(0)
    const limit = 10

    const fetchData = useCallback(async (silent = false) => {
        if (!silent) setIsLoading(true);
        try {
            // Fetch Stats
            const statsData = await ApiClient.get(withTimeZoneQuery('/dashboard/stats'));
            if (statsData.status === 'success') {
                const statsResponse = statsData.data as { credits_remaining: string, total_purchased: string, total_refunds: string };
                setStats(statsResponse);
            }

            // Fetch Transactions
            const txnsData = await ApiClient.get(withTimeZoneQuery(`/dashboard/history?limit=${limit}&offset=${offset}`));
            if (txnsData.status === 'success') {
                const txnsResponse = txnsData.data as { transactions: Transaction[], total: number };
                setTransactions(txnsResponse.transactions);
                setTotal(txnsResponse.total);
            }
        } catch (error) {
            console.error("Failed to fetch data:", error);
        } finally {
            if (!silent) setIsLoading(false);
        }
    }, [offset]);

    useEffect(() => {
        if (initialTransactions) {
            setTransactions(initialTransactions)
            setStats(initialStats)
            setTotal(initialTotal)
        }
    }, [initialTransactions, initialStats, initialTotal]);

    // Always refetch on mount / offset so soft-nav / RSC cache cannot show stale usage rows
    useEffect(() => {
        void fetchData(true)
    }, [fetchData]);

    useEffect(() => {
        const onFocus = () => {
            void fetchData(true)
        }
        window.addEventListener("focus", onFocus)
        return () => window.removeEventListener("focus", onFocus)
    }, [fetchData]);

    return (
        <div className="flex-1 space-y-4">
            <div className="flex items-center justify-between space-y-2">
                <div>
                    <h2 className="text-2xl font-semibold tracking-tight text-[#0b1f1c] sm:text-3xl">Credits History</h2>
                    <p className="mt-1 text-sm text-[#5a736c] max-w-2xl">
                        View your credit purchase and usage history.
                    </p>
                </div>
            </div>

            <div className="grid gap-4 md:grid-cols-3">
                <Card className="border-[#0b1f1c]/10 bg-white/90 shadow-none overflow-hidden">
                    <CardHeader className="flex flex-row items-center justify-between space-y-0 pb-2">
                        <CardTitle className="text-sm font-medium text-[#5a736c]">
                            Credits Remaining
                        </CardTitle>
                        <div className="h-8 w-8 rounded-lg flex items-center justify-center bg-[#0f5c52]/10 text-[#0f5c52]">
                            <Wallet className="h-4 w-4" />
                        </div>
                    </CardHeader>
                    <CardContent>
                        <div className="text-2xl font-bold text-[#0b1f1c]">{stats.credits_remaining}</div>
                        <p className="text-xs text-muted-foreground mt-1">Available to use</p>
                    </CardContent>
                </Card>
                <Card className="border-[#0b1f1c]/10 bg-white/90 shadow-none overflow-hidden">
                    <CardHeader className="flex flex-row items-center justify-between space-y-0 pb-2">
                        <CardTitle className="text-sm font-medium text-[#5a736c]">
                            Total Credits Purchased
                        </CardTitle>
                        <div className="h-8 w-8 rounded-lg flex items-center justify-center bg-emerald-100 text-emerald-600">
                            <CreditCard className="h-4 w-4" />
                        </div>
                    </CardHeader>
                    <CardContent>
                        <div className="text-2xl font-bold text-[#0b1f1c]">{stats.total_purchased}</div>
                        <p className="text-xs text-muted-foreground mt-1">Lifetime purchases</p>
                    </CardContent>
                </Card>
                <Card className="border-[#0b1f1c]/10 bg-white/90 shadow-none overflow-hidden">
                    <CardHeader className="flex flex-row items-center justify-between space-y-0 pb-2">
                        <CardTitle className="text-sm font-medium text-[#5a736c]">
                            Refunds
                        </CardTitle>
                        <div className="h-8 w-8 rounded-lg flex items-center justify-center bg-amber-100 text-amber-600">
                            <RefreshCcw className="h-4 w-4" />
                        </div>
                    </CardHeader>
                    <CardContent>
                        <div className="text-2xl font-bold text-[#0b1f1c]">{stats.total_refunds}</div>
                        <p className="text-xs text-muted-foreground mt-1">Total refunded credits</p>
                    </CardContent>
                </Card>
            </div>

            <Card className="border-[#0b1f1c]/10 bg-white/90 shadow-none overflow-hidden">
                <CardHeader className="bg-[#f0f4f2]/60 border-b border-[#0b1f1c]/8">
                    <CardTitle className="text-lg font-semibold text-[#0b1f1c]">Recent Transactions</CardTitle>
                    <CardDescription className="text-[#5a736c]">A list of your recent credit changes.</CardDescription>
                </CardHeader>
                <CardContent className="p-0">
                    <Table>
                        <TableHeader className="bg-slate-50">
                            <TableRow className="border-b border-slate-100 hover:bg-transparent">
                                <TableHead className="w-[150px]">Transaction ID</TableHead>
                                <TableHead>Date</TableHead>
                                <TableHead>Type</TableHead>
                                <TableHead>Description</TableHead>
                                <TableHead>Change</TableHead>
                                <TableHead>Cost</TableHead>
                                <TableHead>Status</TableHead>
                            </TableRow>
                        </TableHeader>
                        <TableBody>
                            {isLoading ? (
                                <TableRow>
                                    <TableCell colSpan={7} className="text-center py-10">
                                        <Loader2 className="h-8 w-8 animate-spin mx-auto text-slate-300" />
                                    </TableCell>
                                </TableRow>
                            ) : transactions.map((txn) => (
                                <TableRow key={txn.id} className="border-b border-slate-50 hover:bg-slate-50/50">
                                    <TableCell className="font-medium text-slate-700">{txn.id}</TableCell>
                                    <TableCell className="text-[11px] text-slate-500 whitespace-nowrap">{txn.date}</TableCell>
                                    <TableCell>
                                        <Badge 
                                            variant="secondary" 
                                            className={
                                                txn.type === 'Purchase' ? 'bg-[#0f5c52]/10 text-[#0f5c52] hover:bg-[#0f5c52]/10 ring-1 ring-inset ring-[#0f5c52]/20 shadow-none font-medium text-[10px]' :
                                                txn.type === 'Refund' ? 'bg-green-50 text-green-700 hover:bg-green-50 ring-1 ring-inset ring-green-600/20 shadow-none font-medium text-[10px]' :
                                                txn.type === 'Transfer In' ? 'bg-emerald-50 text-emerald-700 hover:bg-emerald-50 ring-1 ring-inset ring-emerald-600/20 shadow-none font-medium text-[10px]' :
                                                txn.type === 'Transfer Out' ? 'bg-amber-50 text-amber-700 hover:bg-amber-50 ring-1 ring-inset ring-amber-600/20 shadow-none font-medium text-[10px]' :
                                                txn.type === 'Adjustment' ? 'bg-sky-50 text-sky-700 hover:bg-sky-50 ring-1 ring-inset ring-sky-600/20 shadow-none font-medium text-[10px]' :
                                                txn.type === 'Usage' ? 'bg-red-50 text-red-700 hover:bg-red-50 ring-1 ring-inset ring-red-600/20 shadow-none font-medium text-[10px]' :
                                                'bg-slate-50 text-slate-700 hover:bg-slate-50 ring-1 ring-inset ring-slate-600/20 shadow-none font-medium text-[10px]'
                                            }
                                        >
                                            {txn.type}
                                        </Badge>
                                    </TableCell>
                                    <TableCell className="text-xs text-slate-600 max-w-[200px] truncate" title={txn.description}>
                                        {txn.description}
                                    </TableCell>
                                    <TableCell className={`font-semibold text-xs ${
                                        txn.amount.startsWith('+') ? 'text-green-600' : 
                                        txn.amount.startsWith('-') ? 'text-red-500' : 
                                        'text-slate-500'
                                    }`}>
                                        {txn.amount}
                                    </TableCell>
                                    <TableCell className="text-slate-500 text-xs">{txn.cost}</TableCell>
                                    <TableCell>
                                        <Badge variant="outline" className={
                                            txn.status === 'Success' ? 'bg-green-50 text-green-700 border-green-200 ring-1 ring-inset ring-green-600/20 shadow-none text-[10px]' :
                                                txn.status === 'Pending' ? 'bg-amber-50 text-amber-700 border-amber-200 ring-1 ring-inset ring-amber-600/20 shadow-none text-[10px]' :
                                                    'bg-red-50 text-red-700 border-red-200 ring-1 ring-inset ring-red-600/20 shadow-none text-[10px]'
                                        }>
                                            {txn.status}
                                        </Badge>
                                    </TableCell>
                                </TableRow>
                            ))}
                            {!isLoading && transactions.length === 0 && (
                                <TableRow>
                                    <TableCell colSpan={7} className="text-center py-10 text-slate-500">
                                        No transactions found.
                                    </TableCell>
                                </TableRow>
                            )}
                        </TableBody>
                    </Table>
                </CardContent>
                {!isLoading && transactions.length > 0 && (
                    <div className="flex items-center justify-between p-4 border-t border-[#0b1f1c]/8 bg-[#f0f4f2]/30">
                        <p className="text-sm text-[#5a736c]">Showing {offset + 1} to {Math.min(offset + limit, total)} of {total} transactions</p>
                        <div className="flex gap-2">
                            <Button
                                variant="outline"
                                size="sm"
                                disabled={offset === 0}
                                onClick={() => setOffset(Math.max(0, offset - limit))}
                                className="border-[#0b1f1c]/10 hover:bg-white text-[#0b1f1c]"
                            >
                                Previous
                            </Button>
                            <Button
                                variant="outline"
                                size="sm"
                                disabled={offset + limit >= total}
                                onClick={() => setOffset(offset + limit)}
                                className="border-[#0b1f1c]/10 hover:bg-white text-[#0b1f1c]"
                            >
                                Next
                            </Button>
                        </div>
                    </div>
                )}
            </Card>
        </div>
    )
}
