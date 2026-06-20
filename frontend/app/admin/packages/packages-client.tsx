"use client"

import { useState, useEffect } from "react"
import { useForm, useFieldArray } from "react-hook-form"
import { zodResolver } from "@hookform/resolvers/zod"
import * as z from "zod"
import { toast } from "react-hot-toast"
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card"
import { Button } from "@/components/ui/button"
import { Input } from "@/components/ui/input"
import { Badge } from "@/components/ui/badge"
import {
    Table, TableBody, TableCell, TableHead, TableHeader, TableRow
} from "@/components/ui/table"
import {
    Package as PackageIcon, Plus, Edit, Trash2, ToggleLeft, ToggleRight, Check, X, Zap, Loader2
} from "lucide-react"
import { ApiClient } from "@/lib/api-client"
import { cn } from "@/lib/utils"

// ─── Types ──────────────────────────────────────────────────────────────────

type PackageRow = {
    id: number
    name: string
    tagline: string
    price: number
    credits_amount: number
    features: string[]
    status: string
    popular: boolean
}

// ─── Zod Schema ─────────────────────────────────────────────────────────────

const packageSchema = z.object({
    name: z.string().min(1, "Package name is required"),
    tagline: z.string(),
    price: z.number({ message: "Price must be a number" }).min(0, "Price must be ≥ 0"),
    credits_amount: z.number({ message: "Credits must be a number" }).min(1, "Credits must be ≥ 1"),
    features: z.array(z.object({ value: z.string() })).min(1, "At least one feature is required"),
    enabled: z.boolean(),
    popular: z.boolean(),
})

type PackageFormValues = z.infer<typeof packageSchema>

// ─── Component ───────────────────────────────────────────────────────────────

export function PackagesClient({ initialData }: { initialData: PackageRow[] }) {
    const [plans, setPlans] = useState<PackageRow[]>(initialData)
    const [showModal, setShowModal] = useState(false)
    const [editingId, setEditingId] = useState<number | null>(null)
    const [deleteConfirm, setDeleteConfirm] = useState<number | null>(null)
    const [isDeleting, setIsDeleting] = useState(false)

    const form = useForm<PackageFormValues>({
        resolver: zodResolver(packageSchema),
        defaultValues: {
            name: "",
            tagline: "",
            price: 0,
            credits_amount: 0,
            features: [{ value: "" }],
            enabled: true,
            popular: false,
        }
    })

    const { fields, append, remove } = useFieldArray({
        control: form.control,
        name: "features"
    })

    const fetchPackages = async () => {
        try {
            const result = await ApiClient.get<PackageRow[]>('/admin/packages')
            if (result.status === 'success' && result.data) {
                setPlans(result.data)
            }
        } catch (error) {
            toast.error("Failed to refresh packages")
        }
    }

    useEffect(() => {
        fetchPackages();
    }, []);

    const openAdd = () => {
        setEditingId(null)
        form.reset({
            name: "",
            tagline: "",
            price: 0,
            credits_amount: 0,
            features: [{ value: "" }],
            enabled: true,
            popular: false,
        })
        setShowModal(true)
    }

    const openEdit = (plan: PackageRow) => {
        setEditingId(plan.id)
        form.reset({
            name: plan.name,
            tagline: plan.tagline || "",
            price: plan.price,
            credits_amount: plan.credits_amount,
            features: (plan.features || [""]).map(f => ({ value: f })),
            enabled: plan.status === 'active',
            popular: plan.popular || false,
        })
        setShowModal(true)
    }

    const onSubmit = async (values: PackageFormValues) => {
        const endpoint = editingId ? '/admin/packages/update' : '/admin/packages/create'
        const payload = {
            ...(editingId ? { id: editingId } : {}),
            name: values.name,
            tagline: values.tagline,
            price: values.price,
            credits_amount: values.credits_amount,
            features: values.features.map(f => f.value).filter(Boolean),
            enabled: values.enabled,
            popular: values.popular,
        }

        try {
            const result = await ApiClient.post<PackageRow>(endpoint, payload)
            if (result.status === 'success' && result.data) {
                const updatedPkg = result.data
                if (editingId) {
                    setPlans(prev => prev.map(p => p.id === editingId ? updatedPkg : p))
                    toast.success("Package updated successfully")
                } else {
                    setPlans(prev => [updatedPkg, ...prev])
                    toast.success("Package created successfully")
                }
                setShowModal(false)
            } else {
                toast.error(result.message || "Error saving package")
            }
        } catch (error: any) {
            toast.error(error.message || "Error saving package")
        }
    }

    const toggleEnabled = async (plan: PackageRow) => {
        const isActive = plan.status?.toLowerCase() === 'active'
        const toastId = toast.loading(`${isActive ? 'Deactivating' : 'Activating'} package...`)
        try {
            const result = await ApiClient.post<PackageRow>('/admin/packages/update', {
                ...plan,
                features: plan.features,
                enabled: !isActive,
            })
            if (result.status === 'success' && result.data) {
                setPlans(prev => prev.map(p => p.id === plan.id ? result.data! : p))
                toast.success(`Package ${!isActive ? 'activated' : 'deactivated'}`, { id: toastId })
            } else {
                toast.error(result.message || "Failed to toggle status", { id: toastId })
            }
        } catch (error: any) {
            toast.error(error.message || "Connection error occurred", { id: toastId })
        }
    }

    const togglePopular = async (plan: PackageRow) => {
        const toastId = toast.loading("Updating popular status...")
        try {
            const result = await ApiClient.post<PackageRow>('/admin/packages/update', {
                ...plan,
                features: plan.features,
                popular: !plan.popular,
                enabled: plan.status?.toLowerCase() === 'active',
            })
            if (result.status === 'success' && result.data) {
                setPlans(prev => prev.map(p => p.id === plan.id ? result.data! : p))
                toast.success(!plan.popular ? "Marked as popular" : "Removed popular badge", { id: toastId })
            } else {
                toast.error(result.message || "Failed to update", { id: toastId })
            }
        } catch (error: any) {
            toast.error(error.message || "Connection error", { id: toastId })
        }
    }

    const deletePlan = async (id: number) => {
        setIsDeleting(true)
        try {
            const result = await ApiClient.post('/admin/packages/delete', { id })
            if (result.status === 'success') {
                setPlans(prev => prev.filter(p => p.id !== id))
                setDeleteConfirm(null)
                toast.success("Package deleted successfully")
            } else {
                toast.error(result.message || "Failed to delete package")
            }
        } catch (error: any) {
            toast.error(error.message || "Delete failed")
        } finally {
            setIsDeleting(false)
        }
    }

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
                    { label: "Active Packages", value: plans.filter(p => p.status === 'active').length, icon: ToggleRight, color: "text-green-600 bg-green-50" },
                    { label: "Total Credits Range", value: plans.length > 0 ? `${Math.min(...plans.map(p => p.credits_amount)).toLocaleString()} – ${Math.max(...plans.map(p => p.credits_amount)).toLocaleString()}` : '0', icon: Zap, color: "text-amber-600 bg-amber-50" },
                ].map(stat => (
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
                            {plans.length === 0 ? (
                                <TableRow>
                                    <TableCell colSpan={7} className="h-24 text-center text-slate-400">
                                        No packages found. Add one to get started.
                                    </TableCell>
                                </TableRow>
                            ) : plans.map(plan => (
                                <TableRow key={plan.id} className="border-b border-slate-50 hover:bg-slate-50/50">
                                    <TableCell>
                                        <div className="font-semibold text-slate-900">{plan.name}</div>
                                        <div className="text-xs text-slate-400 mt-0.5 truncate max-w-[160px]">{plan.tagline}</div>
                                    </TableCell>
                                    <TableCell className="text-slate-700 font-medium">${plan.price}</TableCell>
                                    <TableCell className="text-slate-700">{(plan.credits_amount || 0).toLocaleString()}</TableCell>
                                    <TableCell>
                                        <div className="flex flex-wrap gap-1">
                                            {plan.features?.slice(0, 2).map(f => (
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
                            <h3 className="font-bold text-slate-900 text-lg">{editingId ? "Edit Package" : "Add Package"}</h3>
                            <button onClick={() => setShowModal(false)} className="text-slate-400 hover:text-slate-600">
                                <X className="h-5 w-5" />
                            </button>
                        </div>

                        <form onSubmit={form.handleSubmit(onSubmit)} className="space-y-3">
                            {/* Name */}
                            <div>
                                <label htmlFor="pkg-name" className="text-xs font-medium text-slate-600 mb-1 block">Package Name</label>
                                <Input id="pkg-name" {...form.register("name")} placeholder="e.g. Professional" className={cn(form.formState.errors.name && "border-red-400")} />
                                {form.formState.errors.name && <p className="text-[10px] text-red-500 mt-0.5">{form.formState.errors.name.message}</p>}
                            </div>

                            {/* Tagline */}
                            <div>
                                <label htmlFor="pkg-tagline" className="text-xs font-medium text-slate-600 mb-1 block">Tagline</label>
                                <Input id="pkg-tagline" {...form.register("tagline")} placeholder="e.g. Perfect for growing businesses" />
                            </div>

                            {/* Price + Credits */}
                            <div className="grid grid-cols-2 gap-3">
                                <div className="space-y-1">
                                    <label htmlFor="pkg-price" className="text-xs font-medium text-slate-600 block">Price (USD)</label>
                                    <Input id="pkg-price" type="number" step="0.01" {...form.register("price", { valueAsNumber: true })} placeholder="49" className={cn(form.formState.errors.price && "border-red-400")} />
                                    {form.formState.errors.price && <p className="text-[10px] text-red-500">{form.formState.errors.price.message}</p>}
                                </div>
                                <div className="space-y-1">
                                    <label htmlFor="pkg-credits" className="text-xs font-medium text-slate-600 block">Credits</label>
                                    <Input id="pkg-credits" type="number" {...form.register("credits_amount", { valueAsNumber: true })} placeholder="5000" className={cn(form.formState.errors.credits_amount && "border-red-400")} />
                                    {form.formState.errors.credits_amount && <p className="text-[10px] text-red-500">{form.formState.errors.credits_amount.message}</p>}
                                </div>
                            </div>

                            {/* Features */}
                            <div>
                                <div className="flex items-center justify-between mb-1">
                                    <label className="text-xs font-medium text-slate-600">Features</label>
                                    <button type="button" onClick={() => append({ value: "" })} className="text-xs text-indigo-600 hover:underline">+ Add feature</button>
                                </div>
                                <div className="space-y-2">
                                    {fields.map((field, idx) => (
                                        <div key={field.id} className="flex gap-2">
                                            <Input
                                                id={`feature-${idx}`}
                                                {...form.register(`features.${idx}.value`)}
                                                placeholder={`Feature ${idx + 1}`}
                                                className="h-8 text-sm"
                                            />
                                            <button type="button" onClick={() => remove(idx)} className="text-slate-400 hover:text-red-500">
                                                <X className="h-4 w-4" />
                                            </button>
                                        </div>
                                    ))}
                                </div>
                                {form.formState.errors.features && <p className="text-[10px] text-red-500 mt-1">At least one feature is required</p>}
                            </div>

                            {/* Checkboxes */}
                            <div className="flex items-center gap-6 pt-1">
                                <label htmlFor="pkg-enabled" className="flex items-center gap-2 cursor-pointer text-sm text-slate-700">
                                    <input id="pkg-enabled" type="checkbox" {...form.register("enabled")} className="rounded" />
                                    Active
                                </label>
                                <label htmlFor="pkg-popular" className="flex items-center gap-2 cursor-pointer text-sm text-slate-700">
                                    <input id="pkg-popular" type="checkbox" {...form.register("popular")} className="rounded" />
                                    Mark as Popular
                                </label>
                            </div>

                            {/* Actions */}
                            <div className="flex gap-2 pt-2">
                                <button
                                    type="button"
                                    onClick={() => setShowModal(false)}
                                    className="flex-1 py-2 text-sm font-medium rounded-lg border border-slate-200 text-slate-600 hover:bg-slate-50 transition-colors"
                                >
                                    Cancel
                                </button>
                                <button
                                    type="submit"
                                    disabled={form.formState.isSubmitting}
                                    className="flex-1 py-2 text-sm font-medium rounded-lg bg-[#0f172b] hover:bg-[#0f172b]/90 text-white transition-colors flex items-center justify-center gap-2 disabled:opacity-60"
                                >
                                    {form.formState.isSubmitting ? <Loader2 className="h-4 w-4 animate-spin" /> : <Check className="h-4 w-4" />}
                                    {form.formState.isSubmitting ? "Saving..." : editingId ? "Save Changes" : "Create Package"}
                                </button>
                            </div>
                        </form>
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
                            <button
                                onClick={() => setDeleteConfirm(null)}
                                disabled={isDeleting}
                                className="flex-1 py-2 text-sm font-medium rounded-lg border border-slate-200 text-slate-600 hover:bg-slate-50 transition-colors disabled:opacity-60"
                            >
                                Cancel
                            </button>
                            <button
                                onClick={() => deletePlan(deleteConfirm)}
                                disabled={isDeleting}
                                className="flex-1 py-2 text-sm font-medium rounded-lg bg-red-600 hover:bg-red-700 text-white transition-colors flex items-center justify-center gap-2 disabled:opacity-60"
                            >
                                {isDeleting ? <Loader2 className="h-4 w-4 animate-spin" /> : <Trash2 className="h-4 w-4" />}
                                {isDeleting ? "Deleting..." : "Delete"}
                            </button>
                        </div>
                    </div>
                </div>
            )}
        </div>
    )
}
