"use client"

import { useState, useEffect } from "react"
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/common/card"
import { Button } from "@/components/common/button"
import { Input } from "@/components/common/input"
import { Badge } from "@/components/common/badge"
import {
    Table, TableBody, TableCell, TableHead, TableHeader, TableRow
} from "@/components/common/table"
import {
    Package as PackageIcon, Plus, Edit, Trash2, ToggleLeft, ToggleRight, Check, X, Zap
} from "lucide-react"
import { ApiClient } from "@/lib/api-client"

export function PackagesClient({ initialData }: { initialData: any[] }) {
    const [plans, setPlans] = useState<any[]>(initialData)
    const [isLoading, setIsLoading] = useState(false)
    const [showModal, setShowModal] = useState(false)
    const [editingPlan, setEditingPlan] = useState<any | null>(null)
    const [form, setForm] = useState<any>({ name: "", tagline: "", price: 0, credits_amount: 0, features: [""], enabled: true, popular: false })
    const [deleteConfirm, setDeleteConfirm] = useState<number | null>(null)

    const fetchPackages = async () => {
        try {
            const result = await ApiClient.get('/admin/packages');
            if (result.status === 'success') {
                setPlans(result.data as any[]);
            }
        } catch (error) {
            console.error("Failed to fetch packages:", error);
        } finally {
            setIsLoading(false);
        }
    }

    useEffect(() => {
        // fetchPackages(); // Handled by SSR initialData
    }, []);

    const openAdd = () => {
        setEditingPlan(null)
        setForm({ name: "", tagline: "", price: 0, credits_amount: 0, features: [""], enabled: true, popular: false })
        setShowModal(true)
    }

    const openEdit = (plan: any) => {
        setEditingPlan(plan)
        setForm({
            id: plan.id,
            name: plan.name,
            tagline: plan.tagline || "",
            price: plan.price,
            credits_amount: plan.credits_amount,
            features: plan.features || [""],
            enabled: plan.status === 'active',
            popular: plan.popular || false
        })
        setShowModal(true)
    }

    const saveForm = async () => {
        if (!form.name.trim()) return
        setIsLoading(true);
        try {
            const endpoint = form.id ? '/admin/packages/update' : '/admin/packages/create';

            const payload = {
                ...form,
                enabled: form.enabled
            };

            const result = await ApiClient.post(endpoint, payload);

            if (result.status === 'success') {
                setShowModal(false);
                fetchPackages();
            } else {
                alert(result.message || "Error saving package");
            }
        } catch (error) {
            alert("Error saving package");
        } finally {
            setIsLoading(false);
        }
    }

    const toggleEnabled = async (plan: any) => {
        try {
            const isActive = plan.status && plan.status.toLowerCase() === 'active';

            const result = await ApiClient.post('/admin/packages/update', {
                ...plan,
                enabled: !isActive
            });

            if (result.status === 'success') {
                fetchPackages();
            } else {
                alert(result.message || "Failed to toggle status");
            }
        } catch (error) {
            console.error("Toggle error:", error);
            alert("Connection error occurred while toggling status.");
        }
    }

    const togglePopular = async (plan: any) => {
        try {
            const result = await ApiClient.post('/admin/packages/update', {
                ...plan,
                popular: !plan.popular,
                enabled: plan.status && plan.status.toLowerCase() === 'active'
            });

            if (result.status === 'success') {
                fetchPackages();
            }
        } catch (error) {
            console.error("Toggle error:", error);
        }
    }

    const deletePlan = async (id: number) => {
        try {
            const result = await ApiClient.post('/admin/packages/delete', { id });

            if (result.status === 'success') {
                fetchPackages();
                setDeleteConfirm(null);
            }
        } catch (error) {
            console.error("Delete error:", error);
        }
    }

    const updateFeature = (idx: number, val: string) => {
        setForm((f: any) => ({ ...f, features: f.features.map((ft: any, i: any) => i === idx ? val : ft) }))
    }

    const addFeature = () => setForm((f: any) => ({ ...f, features: [...f.features, ""] }))
    const removeFeature = (idx: number) => setForm((f: any) => ({ ...f, features: f.features.filter((_: any, i: any) => i !== idx) }))

    return (
        <div className="flex-1 space-y-4">
            {/* Header */}
            <div className="flex items-center justify-between">
                <div>
                    <h2 className="text-3xl font-bold tracking-tight text-slate-900">Package Management</h2>
                    <p className="text-slate-500 text-sm mt-1">Control the credit packages shown to users on the Buy Credits page.</p>
                </div>
                <Button onClick={openAdd} className="bg-[#0f172b] hover:bg-[#0f172b]/90 text-white shadow-sm">
                    <Plus className="mr-2 h-4 w-4" /> Add Package
                </Button>
            </div>

            {/* Summary stats */}
            <div className="grid grid-cols-3 gap-4">
                {[
                    { label: "Total Packages", value: plans.length, icon: PackageIcon, color: "text-indigo-600 bg-indigo-50" },
                    { label: "Active Packages", value: plans.filter((p: any) => p.status === 'active').length, icon: ToggleRight, color: "text-green-600 bg-green-50" },
                    { label: "Total Credits Range", value: plans.length > 0 ? `${Math.min(...plans.map((p: any) => p.credits_amount)).toLocaleString()} – ${Math.max(...plans.map((p: any) => p.credits_amount)).toLocaleString()}` : '0', icon: Zap, color: "text-amber-600 bg-amber-50" },
                ].map((stat: any) => (
                    <Card key={stat.label} className="shadow-sm border-indigo-50">
                        <CardContent className="p-4 flex items-center gap-4">
                            <div className={`p-2.5 rounded-lg ${stat.color}`}>
                                <stat.icon className="h-5 w-5" />
                            </div>
                            <div>
                                <p className="text-xs text-slate-500">{stat.label}</p>
                                <p className="text-xl font-bold text-slate-900">{stat.value}</p>
                            </div>
                        </CardContent>
                    </Card>
                ))}
            </div>

            {/* Package Table */}
            <Card className="shadow-sm border-indigo-100 overflow-hidden">
                <CardHeader className="bg-slate-50/50 border-b border-indigo-50/50">
                    <CardTitle className="text-lg font-semibold text-slate-900">All Packages</CardTitle>
                    <CardDescription>These packages appear on the user-facing "Buy Credits" page.</CardDescription>
                </CardHeader>
                <CardContent className="p-0">
                    <Table>
                        <TableHeader className="bg-slate-50">
                            <TableRow className="border-b border-slate-100 hover:bg-transparent">
                                <TableHead className="font-semibold text-slate-900">Name</TableHead>
                                <TableHead className="font-semibold text-slate-900">Price</TableHead>
                                <TableHead className="font-semibold text-slate-900">Credits</TableHead>
                                <TableHead className="font-semibold text-slate-900">Features</TableHead>
                                <TableHead className="font-semibold text-slate-900">Popular</TableHead>
                                <TableHead className="font-semibold text-slate-900">Status</TableHead>
                                <TableHead className="font-semibold text-slate-900 text-right">Actions</TableHead>
                            </TableRow>
                        </TableHeader>
                        <TableBody>
                            {plans.map(plan => (
                                <TableRow key={plan.id} className="border-b border-slate-50 hover:bg-slate-50/50">
                                    <TableCell>
                                        <div className="font-semibold text-slate-900">{plan.name}</div>
                                        <div className="text-xs text-slate-400 mt-0.5 truncate max-w-[160px]">{plan.tagline}</div>
                                    </TableCell>
                                    <TableCell className="text-slate-700 font-medium">${plan.price}</TableCell>
                                    <TableCell className="text-slate-700">{(plan.credits_amount || 0).toLocaleString()}</TableCell>
                                    <TableCell>
                                        <div className="flex flex-wrap gap-1">
                                            {plan.features?.slice(0, 2).map((f: any) => (
                                                <span key={f} className="text-[10px] bg-slate-100 text-slate-600 px-1.5 py-0.5 rounded">{f}</span>
                                            ))}
                                            {(plan.features?.length || 0) > 2 && (
                                                <span className="text-[10px] bg-slate-100 text-slate-500 px-1.5 py-0.5 rounded">+{(plan.features?.length || 0) - 2} more</span>
                                            )}
                                        </div>
                                    </TableCell>
                                    <TableCell>
                                        <button onClick={() => togglePopular(plan)}>
                                            {plan.popular
                                                ? <Badge className="bg-amber-100 text-amber-700 ring-1 ring-amber-200 shadow-none hover:bg-amber-200 cursor-pointer"><Zap className="h-3 w-3 mr-1" />Popular</Badge>
                                                : <span className="text-xs text-slate-400 hover:text-amber-500 cursor-pointer transition-colors">Set popular</span>}
                                        </button>
                                    </TableCell>
                                    <TableCell>
                                        <button onClick={() => toggleEnabled(plan)} className="flex items-center gap-1.5 group">
                                            {plan.status?.toLowerCase() === 'active'
                                                ? <><ToggleRight className="h-5 w-5 text-green-500 group-hover:text-green-600" /><span className="text-xs text-green-600 font-medium">Active</span></>
                                                : <><ToggleLeft className="h-5 w-5 text-slate-400 group-hover:text-slate-500" /><span className="text-xs text-slate-400">Inactive</span></>}
                                        </button>
                                    </TableCell>
                                    <TableCell className="text-right">
                                        <div className="flex items-center justify-end gap-1">
                                            <Button
                                                variant="ghost" size="icon"
                                                className="h-8 w-8 text-slate-500 hover:text-indigo-600 hover:bg-indigo-50"
                                                onClick={() => openEdit(plan)}
                                            >
                                                <Edit className="h-4 w-4" />
                                            </Button>
                                            <Button
                                                variant="ghost" size="icon"
                                                className="h-8 w-8 text-slate-500 hover:text-red-600 hover:bg-red-50"
                                                onClick={() => setDeleteConfirm(plan.id)}
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
            </Card>

            {/* Add/Edit Modal */}
            {showModal && (
                <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/40 backdrop-blur-sm">
                    <div className="bg-white rounded-xl shadow-2xl border border-slate-200 w-full max-w-md mx-4 p-6 space-y-4 max-h-[90vh] overflow-y-auto">
                        <div className="flex items-center justify-between">
                            <h3 className="font-bold text-slate-900 text-lg">{editingPlan ? "Edit Package" : "Add Package"}</h3>
                            <button onClick={() => setShowModal(false)} className="text-slate-400 hover:text-slate-600">
                                <X className="h-5 w-5" />
                            </button>
                        </div>

                        <div className="space-y-3">
                            <div>
                                <label htmlFor="package-name" className="text-xs font-medium text-slate-600 mb-1 block">Package Name</label>
                                <Input id="package-name" name="packageName" value={form.name} onChange={(e: any) => setForm((f: any) => ({ ...f, name: e.target.value }))} placeholder="e.g. Professional" />
                            </div>
                            <div>
                                <label htmlFor="package-tagline" className="text-xs font-medium text-slate-600 mb-1 block">Tagline</label>
                                <Input id="package-tagline" name="tagline" value={form.tagline} onChange={(e: any) => setForm((f: any) => ({ ...f, tagline: e.target.value }))} placeholder="e.g. Perfect for growing businesses" />
                            </div>
                            <div className="grid grid-cols-2 gap-3">
                                <div className="space-y-1">
                                    <label htmlFor="package-price" className="text-xs font-medium text-slate-600 mb-1 block">Price (USD)</label>
                                    <Input id="package-price" name="price" type="number" value={form.price} onChange={(e: any) => setForm((f: any) => ({ ...f, price: Number(e.target.value) }))} placeholder="49" />
                                </div>
                                <div className="space-y-1">
                                    <label htmlFor="package-credits" className="text-xs font-medium text-slate-600 mb-1 block">Credits</label>
                                    <Input id="package-credits" name="creditsAmount" type="number" value={form.credits_amount} onChange={(e: any) => setForm((f: any) => ({ ...f, credits_amount: Number(e.target.value) }))} placeholder="5000" />
                                </div>
                            </div>

                            <div>
                                <div className="flex items-center justify-between mb-1">
                                    <label className="text-xs font-medium text-slate-600">Features</label>
                                    <button onClick={addFeature} className="text-xs text-indigo-600 hover:underline">+ Add feature</button>
                                </div>
                                <div className="space-y-2">
                                    {form.features?.map((ft: any, idx: number) => (
                                        <div key={idx} className="flex gap-2">
                                            <Input
                                                id={`feature-${idx}`}
                                                name={`feature-${idx}`}
                                                value={ft}
                                                onChange={(e: any) => updateFeature(idx, e.target.value)}
                                                placeholder={`Feature ${idx + 1}`}
                                                className="h-8 text-sm"
                                            />
                                            <button onClick={() => removeFeature(idx)} className="text-slate-400 hover:text-red-500">
                                                <X className="h-4 w-4" />
                                            </button>
                                        </div>
                                    ))}
                                </div>
                            </div>

                            <div className="flex items-center gap-6 pt-1">
                                <label htmlFor="package-enabled" className="flex items-center gap-2 cursor-pointer text-sm text-slate-700">
                                    <input id="package-enabled" name="enabled" type="checkbox" checked={form.enabled} onChange={(e: any) => setForm((f: any) => ({ ...f, enabled: e.target.checked }))} className="rounded" />
                                    Active
                                </label>
                                <label htmlFor="package-popular" className="flex items-center gap-2 cursor-pointer text-sm text-slate-700">
                                    <input id="package-popular" name="popular" type="checkbox" checked={form.popular || false} onChange={(e: any) => setForm((f: any) => ({ ...f, popular: e.target.checked }))} className="rounded" />
                                    Mark as Popular
                                </label>
                            </div>
                        </div>

                        <div className="flex gap-2 pt-2">
                            <button onClick={() => setShowModal(false)} className="flex-1 py-2 text-sm font-medium rounded-lg border border-slate-200 text-slate-600 hover:bg-slate-50 transition-colors">
                                Cancel
                            </button>
                            <button onClick={saveForm} className="flex-1 py-2 text-sm font-medium rounded-lg bg-[#0f172b] hover:bg-[#0f172b]/90 text-white transition-colors flex items-center justify-center gap-2">
                                <Check className="h-4 w-4" /> {editingPlan ? "Save Changes" : "Create Package"}
                            </button>
                        </div>
                    </div>
                </div>
            )}

            {/* Delete Confirm Modal */}
            {deleteConfirm !== null && (
                <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/40 backdrop-blur-sm">
                    <div className="bg-white rounded-xl shadow-2xl border border-slate-200 w-full max-w-sm mx-4 p-6 space-y-4">
                        <div className="flex items-center gap-3">
                            <div className="p-2 bg-red-50 rounded-lg"><Trash2 className="h-5 w-5 text-red-600" /></div>
                            <div>
                                <h3 className="font-bold text-slate-900">Delete Package</h3>
                                <p className="text-xs text-slate-500">This cannot be undone.</p>
                            </div>
                        </div>
                        <p className="text-sm text-slate-600">
                            Are you sure you want to delete <strong>{plans.find(p => p.id === deleteConfirm)?.name}</strong>? Users will no longer see it.
                        </p>
                        <div className="flex gap-2">
                            <button onClick={() => setDeleteConfirm(null)} className="flex-1 py-2 text-sm font-medium rounded-lg border border-slate-200 text-slate-600 hover:bg-slate-50 transition-colors">
                                Cancel
                            </button>
                            <button onClick={() => deletePlan(deleteConfirm)} className="flex-1 py-2 text-sm font-medium rounded-lg bg-red-600 hover:bg-red-700 text-white transition-colors">
                                Delete
                            </button>
                        </div>
                    </div>
                </div>
            )}
        </div>
    )
}
