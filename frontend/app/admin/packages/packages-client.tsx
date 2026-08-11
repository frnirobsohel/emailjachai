"use client"

import { useState } from "react"
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
    Package as PackageIcon, Plus, Edit, Trash2, ToggleLeft, ToggleRight, Check, X, Zap, Loader2, Eye, EyeOff
} from "lucide-react"
import { ApiClient } from "@/lib/api-client"
import { cn } from "@/lib/utils"

// ─── Types ──────────────────────────────────────────────────────────────────

export type PackageRow = {
    id: number
    name: string
    tagline: string
    description?: string
    price: number
    offer_price?: number
    credits_amount: number
    features: string[]
    status: string
    popular: boolean
    is_public: boolean
}

// ─── Zod Schema ─────────────────────────────────────────────────────────────

const packageSchema = z.object({
    name: z.string().trim().min(1, "Package name is required").max(100, "Name max 100 characters"),
    tagline: z.string().max(255, "Tagline max 255 characters"),
    price: z.number({ message: "Price must be a number" }).min(0, "Price must be ≥ 0").max(999999.99, "Price too high"),
    offer_price: z.number({ message: "Offer price must be a number" }).min(0, "Offer must be ≥ 0").max(999999.99, "Offer too high"),
    credits_amount: z.number({ message: "Credits must be a number" }).int().min(1, "Credits must be ≥ 1").max(10_000_000, "Credits too high"),
    features: z.array(z.object({
        value: z.string().max(200, "Feature max 200 characters"),
    })).min(1, "At least one feature is required").max(20, "Max 20 features")
        .superRefine((arr, ctx) => {
            const filled = arr.map(f => f.value.trim()).filter(Boolean)
            if (filled.length === 0) {
                ctx.addIssue({ code: z.ZodIssueCode.custom, message: "At least one non-empty feature is required" })
            }
        }),
    enabled: z.boolean(),
    popular: z.boolean(),
    is_public: z.boolean(),
}).superRefine((values, ctx) => {
    if (values.offer_price > 0 && (values.price <= 0 || values.offer_price >= values.price)) {
        ctx.addIssue({
            code: z.ZodIssueCode.custom,
            path: ["offer_price"],
            message: "Offer must be greater than 0 and less than regular price",
        })
    }
})

type PackageFormValues = z.infer<typeof packageSchema>

const defaultFormValues: PackageFormValues = {
    name: "",
    tagline: "",
    price: 0,
    offer_price: 0,
    credits_amount: 1,
    features: [{ value: "" }],
    enabled: true,
    popular: false,
    is_public: true,
}

// ─── Component ───────────────────────────────────────────────────────────────

export function PackagesClient({ initialData }: { initialData: PackageRow[] }) {
    const [plans, setPlans] = useState<PackageRow[]>(initialData)
    const [showModal, setShowModal] = useState(false)
    const [editingId, setEditingId] = useState<number | null>(null)
    const [deleteConfirm, setDeleteConfirm] = useState<number | null>(null)
    const [isDeleting, setIsDeleting] = useState(false)

    const form = useForm<PackageFormValues>({
        resolver: zodResolver(packageSchema),
        defaultValues: defaultFormValues,
    })

    const { fields, append, remove } = useFieldArray({
        control: form.control,
        name: "features"
    })

    const openAdd = () => {
        setEditingId(null)
        form.reset(defaultFormValues)
        setShowModal(true)
    }

    const openEdit = (plan: PackageRow) => {
        setEditingId(plan.id)
        form.reset({
            name: plan.name,
            tagline: plan.tagline || "",
            price: plan.price,
            offer_price: plan.offer_price ?? 0,
            credits_amount: plan.credits_amount,
            features: (plan.features?.length ? plan.features : [""]).map(f => ({ value: f })),
            enabled: plan.status === 'active',
            popular: plan.popular || false,
            is_public: plan.is_public ?? true,
        })
        setShowModal(true)
    }

    const onSubmit = async (values: PackageFormValues) => {
        const endpoint = editingId ? '/admin/packages/update' : '/admin/packages/create'
        const features = values.features.map(f => f.value.trim()).filter(Boolean)
        const payload = {
            ...(editingId ? { id: editingId } : {}),
            name: values.name.trim(),
            tagline: values.tagline.trim(),
            price: Math.round(values.price * 100) / 100,
            offer_price: Math.round((values.offer_price || 0) * 100) / 100,
            credits_amount: values.credits_amount,
            features,
            enabled: values.enabled,
            popular: values.popular,
            is_public: values.is_public,
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
                // If another package was demoted from popular, refresh popular flags from list response shape
                if (values.popular) {
                    setPlans(prev => prev.map(p =>
                        p.id === updatedPkg.id ? updatedPkg : { ...p, popular: false }
                    ))
                }
                setShowModal(false)
            } else {
                toast.error(result.message || "Error saving package")
            }
        } catch (error: unknown) {
            toast.error(error instanceof Error ? error.message : "Error saving package")
        }
    }

    const updatePackageFlags = async (
        plan: PackageRow,
        patch: Partial<{ enabled: boolean; popular: boolean; is_public: boolean }>,
        loadingMsg: string,
        successMsg: string,
    ) => {
        const toastId = toast.loading(loadingMsg)
        try {
            const result = await ApiClient.post<PackageRow>('/admin/packages/update', {
                id: plan.id,
                name: plan.name,
                tagline: plan.tagline,
                price: plan.price,
                offer_price: plan.offer_price ?? 0,
                credits_amount: plan.credits_amount,
                features: plan.features,
                enabled: patch.enabled ?? (plan.status?.toLowerCase() === 'active'),
                popular: patch.popular ?? plan.popular,
                is_public: patch.is_public ?? plan.is_public,
            })
            if (result.status === 'success' && result.data) {
                const updated = result.data
                setPlans(prev => prev.map(p => {
                    if (p.id === plan.id) return updated
                    if (updated.popular && p.popular) return { ...p, popular: false }
                    return p
                }))
                toast.success(successMsg, { id: toastId })
            } else {
                toast.error(result.message || "Failed to update", { id: toastId })
            }
        } catch (error: unknown) {
            toast.error(error instanceof Error ? error.message : "Connection error", { id: toastId })
        }
    }

    const toggleEnabled = async (plan: PackageRow) => {
        const isActive = plan.status?.toLowerCase() === 'active'
        await updatePackageFlags(
            plan,
            { enabled: !isActive },
            `${isActive ? 'Deactivating' : 'Activating'} package...`,
            `Package ${!isActive ? 'activated' : 'deactivated'}`,
        )
    }

    const togglePopular = async (plan: PackageRow) => {
        await updatePackageFlags(
            plan,
            { popular: !plan.popular },
            "Updating popular status...",
            !plan.popular ? "Marked as popular" : "Removed popular badge",
        )
    }

    const togglePublic = async (plan: PackageRow) => {
        const next = !(plan.is_public ?? true)
        await updatePackageFlags(
            plan,
            { is_public: next },
            next ? "Making public..." : "Hiding from storefront...",
            next ? "Visible on Buy Credits" : "Hidden from Buy Credits",
        )
    }

    const deletePlan = async (id: number) => {
        setIsDeleting(true)
        try {
            const result = await ApiClient.post('/admin/packages/delete', { id })
            if (result.status === 'success') {
                setPlans(prev => prev.filter(p => p.id !== id))
                setDeleteConfirm(null)
                toast.success("Package removed from catalog")
            } else {
                toast.error(result.message || "Failed to delete package")
            }
        } catch (error: unknown) {
            toast.error(error instanceof Error ? error.message : "Delete failed")
        } finally {
            setIsDeleting(false)
        }
    }

    const storefrontVisible = plans.filter(p => p.status === 'active' && (p.is_public ?? true)).length

    return (
        <div className="flex-1 space-y-4">
            {/* Header */}
            <div className="flex items-center justify-between">
                <div>
                    <h2 className="text-2xl font-semibold tracking-tight text-[#0b1f1c] sm:text-3xl">Package Management</h2>
                    <p className="mt-1 text-sm text-[#5a736c]">Active and Public packages appear on Buy Credits. Both flags are required.</p>
                </div>
                <Button onClick={openAdd} className="border border-[#08352f] bg-[#0f5c52] hover:bg-[#0b4a42] text-white shadow-none">
                    <Plus className="mr-2 h-4 w-4" /> Add Package
                </Button>
            </div>

            {/* Summary stats */}
            <div className="grid grid-cols-2 gap-4 sm:grid-cols-4">
                {[
                    { label: "Total Packages", value: plans.length, icon: PackageIcon, color: "text-[#0f5c52] bg-[#0f5c52]/10" },
                    { label: "Active", value: plans.filter(p => p.status === 'active').length, icon: ToggleRight, color: "text-emerald-600 bg-emerald-50" },
                    { label: "On Storefront", value: storefrontVisible, icon: Eye, color: "text-sky-600 bg-sky-50" },
                    { label: "Credits Range", value: plans.length > 0 ? `${Math.min(...plans.map(p => p.credits_amount)).toLocaleString()} – ${Math.max(...plans.map(p => p.credits_amount)).toLocaleString()}` : '0', icon: Zap, color: "text-amber-600 bg-amber-50" },
                ].map(stat => (
                    <Card key={stat.label} className="border-[#0b1f1c]/10 bg-white/90 shadow-none">
                        <CardContent className="p-4 flex items-center gap-4">
                            <div className={`p-2.5 rounded-lg ${stat.color}`}>
                                <stat.icon className="h-5 w-5" />
                            </div>
                            <div>
                                <p className="text-xs text-[#5a736c]">{stat.label}</p>
                                <p className="text-xl font-semibold tracking-tight text-[#0b1f1c]">{stat.value}</p>
                            </div>
                        </CardContent>
                    </Card>
                ))}
            </div>

            {/* Package Table */}
            <Card className="border-[#0b1f1c]/10 bg-white/90 shadow-none overflow-hidden">
                <CardHeader className="bg-[#f0f4f2]/60 border-b border-[#0b1f1c]/8">
                    <CardTitle className="text-lg font-semibold text-[#0b1f1c]">All Packages</CardTitle>
                    <CardDescription className="text-[#5a736c]">Storefront needs Active + Public. Popular is limited to one package.</CardDescription>
                </CardHeader>
                <CardContent className="p-0">
                    <Table>
                        <TableHeader className="bg-[#f0f4f2]/60">
                            <TableRow className="border-b border-[#0b1f1c]/8 hover:bg-transparent">
                                <TableHead className="font-semibold text-[#0b1f1c]">Name</TableHead>
                                <TableHead className="font-semibold text-[#0b1f1c]">Price</TableHead>
                                <TableHead className="font-semibold text-[#0b1f1c]">Credits</TableHead>
                                <TableHead className="font-semibold text-[#0b1f1c]">Features</TableHead>
                                <TableHead className="font-semibold text-[#0b1f1c]">Popular</TableHead>
                                <TableHead className="font-semibold text-[#0b1f1c]">Status</TableHead>
                                <TableHead className="font-semibold text-[#0b1f1c]">Public</TableHead>
                                <TableHead className="font-semibold text-[#0b1f1c] text-right">Actions</TableHead>
                            </TableRow>
                        </TableHeader>
                        <TableBody>
                            {plans.length === 0 ? (
                                <TableRow>
                                    <TableCell colSpan={8} className="h-24 text-center text-[#6b857c]">
                                        No packages found. Add one to get started.
                                    </TableCell>
                                </TableRow>
                            ) : plans.map(plan => (
                                <TableRow key={plan.id} className="border-b border-[#0b1f1c]/5 hover:bg-[#f0f4f2]/40">
                                    <TableCell>
                                        <div className="font-semibold text-[#0b1f1c]">{plan.name}</div>
                                        <div className="text-xs text-[#6b857c] mt-0.5 truncate max-w-[160px]">{plan.tagline}</div>
                                    </TableCell>
                                    <TableCell className="text-[#5a736c] font-medium">
                                        {(plan.offer_price ?? 0) > 0 && (plan.offer_price ?? 0) < plan.price ? (
                                            <div className="space-y-0.5">
                                                <div>${Number(plan.offer_price).toFixed(2)}</div>
                                                <div className="text-xs text-[#6b857c] line-through">
                                                    ${Number(plan.price).toFixed(2)}
                                                </div>
                                            </div>
                                        ) : (
                                            <>${Number(plan.price).toFixed(2)}</>
                                        )}
                                    </TableCell>
                                    <TableCell className="text-[#5a736c]">{(plan.credits_amount || 0).toLocaleString()}</TableCell>
                                    <TableCell>
                                        <div className="flex flex-wrap gap-1">
                                            {plan.features?.slice(0, 2).map(f => (
                                                <span key={f} className="text-[10px] bg-[#0b1f1c]/5 text-[#5a736c] px-1.5 py-0.5 rounded">{f}</span>
                                            ))}
                                            {(plan.features?.length || 0) > 2 && (
                                                <span className="text-[10px] bg-[#0b1f1c]/5 text-[#5a736c] px-1.5 py-0.5 rounded">+{(plan.features?.length || 0) - 2} more</span>
                                            )}
                                        </div>
                                    </TableCell>
                                    <TableCell>
                                        <button type="button" onClick={() => void togglePopular(plan)}>
                                            {plan.popular
                                                ? <Badge className="bg-amber-100 text-amber-700 ring-1 ring-amber-200 shadow-none hover:bg-amber-200 cursor-pointer"><Zap className="h-3 w-3 mr-1" />Popular</Badge>
                                                : <span className="text-xs text-[#6b857c] hover:text-amber-500 cursor-pointer transition-colors">Set popular</span>}
                                        </button>
                                    </TableCell>
                                    <TableCell>
                                        <button type="button" onClick={() => void toggleEnabled(plan)} className="flex items-center gap-1.5 group">
                                            {plan.status?.toLowerCase() === 'active'
                                                ? <><ToggleRight className="h-5 w-5 text-emerald-500 group-hover:text-emerald-600" /><span className="text-xs text-emerald-600 font-medium">Active</span></>
                                                : <><ToggleLeft className="h-5 w-5 text-[#6b857c] group-hover:text-[#5a736c]" /><span className="text-xs text-[#6b857c]">Inactive</span></>}
                                        </button>
                                    </TableCell>
                                    <TableCell>
                                        <button type="button" onClick={() => void togglePublic(plan)} className="flex items-center gap-1.5 group">
                                            {(plan.is_public ?? true)
                                                ? <><Eye className="h-4 w-4 text-[#0f5c52]" /><span className="text-xs text-[#0f5c52] font-medium">Visible</span></>
                                                : <><EyeOff className="h-4 w-4 text-[#6b857c]" /><span className="text-xs text-[#6b857c]">Hidden</span></>}
                                        </button>
                                    </TableCell>
                                    <TableCell className="text-right">
                                        <div className="flex items-center justify-end gap-1">
                                            <Button
                                                variant="ghost" size="icon"
                                                className="h-8 w-8 text-[#5a736c] hover:text-[#0f5c52] hover:bg-[#0f5c52]/10"
                                                onClick={() => openEdit(plan)}
                                            >
                                                <Edit className="h-4 w-4" />
                                            </Button>
                                            <Button
                                                variant="ghost" size="icon"
                                                className="h-8 w-8 text-[#5a736c] hover:text-rose-600 hover:bg-rose-50"
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
                    <div className="bg-white rounded-xl shadow-2xl border border-[#0b1f1c]/10 w-full max-w-md mx-4 p-6 space-y-4 max-h-[90vh] overflow-y-auto">
                        <div className="flex items-center justify-between">
                            <h3 className="font-bold text-[#0b1f1c] text-lg">{editingId ? "Edit Package" : "Add Package"}</h3>
                            <button type="button" onClick={() => setShowModal(false)} className="text-[#6b857c] hover:text-[#5a736c]">
                                <X className="h-5 w-5" />
                            </button>
                        </div>

                        <form onSubmit={form.handleSubmit(onSubmit)} className="space-y-3">
                            <div>
                                <label htmlFor="pkg-name" className="text-xs font-medium text-[#5a736c] mb-1 block">Package Name</label>
                                <Input id="pkg-name" {...form.register("name")} placeholder="e.g. Professional" maxLength={100} className={cn(form.formState.errors.name && "border-red-400")} />
                                {form.formState.errors.name && <p className="text-[10px] text-red-500 mt-0.5">{form.formState.errors.name.message}</p>}
                            </div>

                            <div>
                                <label htmlFor="pkg-tagline" className="text-xs font-medium text-[#5a736c] mb-1 block">Tagline</label>
                                <Input id="pkg-tagline" {...form.register("tagline")} placeholder="e.g. Perfect for growing businesses" maxLength={255} />
                                {form.formState.errors.tagline && <p className="text-[10px] text-red-500 mt-0.5">{form.formState.errors.tagline.message}</p>}
                            </div>

                            <div className="grid grid-cols-2 gap-3">
                                <div className="space-y-1">
                                    <label htmlFor="pkg-price" className="text-xs font-medium text-[#5a736c] block">Regular price (USD)</label>
                                    <Input id="pkg-price" type="number" step="0.01" min={0} max={999999.99} {...form.register("price", { valueAsNumber: true })} placeholder="49" className={cn(form.formState.errors.price && "border-red-400")} />
                                    {form.formState.errors.price && <p className="text-[10px] text-red-500">{form.formState.errors.price.message}</p>}
                                </div>
                                <div className="space-y-1">
                                    <label htmlFor="pkg-offer" className="text-xs font-medium text-[#5a736c] block">Offer price (USD)</label>
                                    <Input id="pkg-offer" type="number" step="0.01" min={0} max={999999.99} {...form.register("offer_price", { valueAsNumber: true })} placeholder="0 = no offer" className={cn(form.formState.errors.offer_price && "border-red-400")} />
                                    {form.formState.errors.offer_price && <p className="text-[10px] text-red-500">{form.formState.errors.offer_price.message}</p>}
                                </div>
                            </div>
                            <p className="text-[10px] text-[#6b857c] -mt-1">
                                Leave offer at 0 to clear. When set, customers pay the offer price and see regular as struck-through.
                            </p>
                            <div className="space-y-1">
                                <label htmlFor="pkg-credits" className="text-xs font-medium text-[#5a736c] block">Credits</label>
                                <Input id="pkg-credits" type="number" min={1} max={10_000_000} {...form.register("credits_amount", { valueAsNumber: true })} placeholder="5000" className={cn(form.formState.errors.credits_amount && "border-red-400")} />
                                {form.formState.errors.credits_amount && <p className="text-[10px] text-red-500">{form.formState.errors.credits_amount.message}</p>}
                            </div>

                            <div>
                                <div className="flex items-center justify-between mb-1">
                                    <label className="text-xs font-medium text-[#5a736c]">Features</label>
                                    <button
                                        type="button"
                                        onClick={() => { if (fields.length < 20) append({ value: "" }) }}
                                        className="text-xs text-[#0f5c52] hover:underline"
                                    >
                                        + Add feature
                                    </button>
                                </div>
                                <div className="space-y-2">
                                    {fields.map((field, idx) => (
                                        <div key={field.id} className="flex gap-2">
                                            <Input
                                                id={`feature-${idx}`}
                                                {...form.register(`features.${idx}.value`)}
                                                placeholder={`Feature ${idx + 1}`}
                                                maxLength={200}
                                                className="h-8 text-sm"
                                            />
                                            <button type="button" onClick={() => remove(idx)} className="text-[#6b857c] hover:text-red-500" disabled={fields.length <= 1}>
                                                <X className="h-4 w-4" />
                                            </button>
                                        </div>
                                    ))}
                                </div>
                                {form.formState.errors.features && (
                                    <p className="text-[10px] text-red-500 mt-1">
                                        {form.formState.errors.features.message || form.formState.errors.features.root?.message || "At least one feature is required"}
                                    </p>
                                )}
                            </div>

                            <div className="flex flex-wrap items-center gap-x-6 gap-y-2 pt-1">
                                <label htmlFor="pkg-enabled" className="flex items-center gap-2 cursor-pointer text-sm text-[#0b1f1c]">
                                    <input id="pkg-enabled" type="checkbox" {...form.register("enabled")} className="rounded" />
                                    Active
                                </label>
                                <label htmlFor="pkg-public" className="flex items-center gap-2 cursor-pointer text-sm text-[#0b1f1c]">
                                    <input id="pkg-public" type="checkbox" {...form.register("is_public")} className="rounded" />
                                    Public (Buy Credits)
                                </label>
                                <label htmlFor="pkg-popular" className="flex items-center gap-2 cursor-pointer text-sm text-[#0b1f1c]">
                                    <input id="pkg-popular" type="checkbox" {...form.register("popular")} className="rounded" />
                                    Mark as Popular
                                </label>
                            </div>

                            <div className="flex gap-2 pt-2">
                                <button
                                    type="button"
                                    onClick={() => setShowModal(false)}
                                    className="flex-1 py-2 text-sm font-medium rounded-lg border border-[#0b1f1c]/10 text-[#5a736c] hover:bg-[#f0f4f2]/60 transition-colors"
                                >
                                    Cancel
                                </button>
                                <button
                                    type="submit"
                                    disabled={form.formState.isSubmitting}
                                    className="flex-1 py-2 text-sm font-medium rounded-lg border border-[#08352f] bg-[#0f5c52] hover:bg-[#0b4a42] text-white shadow-none transition-colors flex items-center justify-center gap-2 disabled:opacity-60"
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
                    <div className="bg-white rounded-xl shadow-2xl border border-[#0b1f1c]/10 w-full max-w-sm mx-4 p-6 space-y-4">
                        <div className="flex items-center gap-3">
                            <div className="p-2 bg-rose-50 rounded-lg"><Trash2 className="h-5 w-5 text-rose-600" /></div>
                            <div>
                                <h3 className="font-bold text-[#0b1f1c]">Remove Package</h3>
                                <p className="text-xs text-[#5a736c]">Removes it from the catalog. Past orders stay intact.</p>
                            </div>
                        </div>
                        <p className="text-sm text-[#5a736c]">
                            Remove <strong>{plans.find(p => p.id === deleteConfirm)?.name}</strong> from Buy Credits? Soft-deleted packages no longer appear for users.
                        </p>
                        <div className="flex gap-2">
                            <button
                                type="button"
                                onClick={() => setDeleteConfirm(null)}
                                disabled={isDeleting}
                                className="flex-1 py-2 text-sm font-medium rounded-lg border border-[#0b1f1c]/10 text-[#5a736c] hover:bg-[#f0f4f2]/60 transition-colors disabled:opacity-60"
                            >
                                Cancel
                            </button>
                            <button
                                type="button"
                                onClick={() => void deletePlan(deleteConfirm)}
                                disabled={isDeleting}
                                className="flex-1 py-2 text-sm font-medium rounded-lg bg-red-600 hover:bg-red-700 text-white transition-colors flex items-center justify-center gap-2 disabled:opacity-60"
                            >
                                {isDeleting ? <Loader2 className="h-4 w-4 animate-spin" /> : <Trash2 className="h-4 w-4" />}
                                {isDeleting ? "Removing..." : "Remove"}
                            </button>
                        </div>
                    </div>
                </div>
            )}
        </div>
    )
}
