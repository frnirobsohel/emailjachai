"use client"

import { useState, useEffect } from "react"
import { Card, CardContent, CardDescription, CardHeader, CardTitle, CardFooter } from "@/components/ui/card"
import { Input } from "@/components/ui/input"
import { Button } from "@/components/ui/button"
import { Label } from "@/components/ui/label"
import { Avatar, AvatarFallback, AvatarImage } from "@/components/ui/avatar"
import { ApiClient } from "@/lib/api-client"
import { User, Lock, Save, Loader2, Webhook, Copy, RefreshCw, Check, X } from "lucide-react"
import { useForm } from "react-hook-form"
import { zodResolver } from "@hookform/resolvers/zod"
import * as z from "zod"
import { toast } from "react-hot-toast"

const nameSchema = z.object({
    name: z.string().min(1, "Name is required").max(100, "Name is too long"),
})

const passwordSchema = z.object({
    current_password: z.string().min(1, "Current password is required"),
    new_password: z.string()
        .min(8, "Password must be at least 8 characters")
        .regex(/[A-Z]/, "Password must contain at least one uppercase letter")
        .regex(/[a-z]/, "Password must contain at least one lowercase letter")
        .regex(/[0-9]/, "Password must contain at least one number"),
    confirm_password: z.string().min(1, "Confirm your password"),
}).refine((data) => data.new_password === data.confirm_password, {
    message: "Passwords do not match",
    path: ["confirm_password"],
})

const webhookSchema = z.object({
    webhook_url: z.string().trim().refine(
        (v) => v === "" || /^https:\/\//i.test(v),
        "Webhook URL must start with https://"
    ),
})

export interface ProfileUser {
    id: number
    name: string
    email: string
    role: string
    status?: string
    created_at?: string
}

export interface WebhookSettings {
    webhook_url: string
    has_secret: boolean
}

function formatMemberSince(iso?: string): string {
    if (!iso) return "—"
    const d = new Date(iso)
    if (Number.isNaN(d.getTime())) return "—"
    return d.toLocaleDateString(undefined, { year: "numeric", month: "short", day: "numeric" })
}

function patchSidebarName(name: string) {
    if (typeof window === "undefined") return
    try {
        const cachedUser = localStorage.getItem("sidebar_user")
        if (cachedUser) {
            const parsed = JSON.parse(cachedUser) as Record<string, unknown>
            parsed.name = name
            localStorage.setItem("sidebar_user", JSON.stringify(parsed))
        }
        window.dispatchEvent(new CustomEvent("ejp:profile-updated", { detail: { name } }))
    } catch {
        // ignore cache parse errors
    }
}

export function ProfileClient({
    initialProfile,
    initialWebhook,
}: {
    initialProfile: ProfileUser | null
    initialWebhook?: WebhookSettings | null
}) {
    const [user, setUser] = useState<ProfileUser | null>(initialProfile)
    const [isRefreshing, setIsRefreshing] = useState(false)
    const [webhookURL, setWebhookURL] = useState(initialWebhook?.webhook_url || "")
    const [hasSecret, setHasSecret] = useState(Boolean(initialWebhook?.has_secret))
    const [revealedSecret, setRevealedSecret] = useState<string | null>(null)
    const [copied, setCopied] = useState(false)

    const nameForm = useForm<z.infer<typeof nameSchema>>({
        resolver: zodResolver(nameSchema),
        defaultValues: { name: initialProfile?.name || "" },
    })

    const passwordForm = useForm<z.infer<typeof passwordSchema>>({
        resolver: zodResolver(passwordSchema),
        defaultValues: { current_password: "", new_password: "", confirm_password: "" },
    })

    const webhookForm = useForm<z.infer<typeof webhookSchema>>({
        resolver: zodResolver(webhookSchema),
        defaultValues: { webhook_url: initialWebhook?.webhook_url || "" },
    })

    useEffect(() => {
        const refresh = async () => {
            // Soft refresh only — keep SSR content visible (no full-page loading flash)
            setIsRefreshing(true)
            try {
                const [meResult, whResult] = await Promise.all([
                    ApiClient.get<ProfileUser | { user?: ProfileUser }>("/auth/me"),
                    ApiClient.get<WebhookSettings>("/user/webhook"),
                ])
                if (meResult.status === "success" && meResult.data) {
                    const profile =
                        "user" in meResult.data && meResult.data.user
                            ? meResult.data.user
                            : (meResult.data as ProfileUser)
                    setUser(profile)
                    nameForm.reset({ name: profile.name })
                }
                if (whResult.status === "success" && whResult.data) {
                    setWebhookURL(whResult.data.webhook_url || "")
                    setHasSecret(Boolean(whResult.data.has_secret))
                    webhookForm.reset({ webhook_url: whResult.data.webhook_url || "" })
                }
            } catch (error) {
                console.error("Failed to refresh profile:", error)
            } finally {
                setIsRefreshing(false)
            }
        }
        void refresh()
        // eslint-disable-next-line react-hooks/exhaustive-deps -- mount soft-refresh
    }, [])

    const onUpdateName = async (values: z.infer<typeof nameSchema>) => {
        try {
            const result = await ApiClient.post("/auth/profile/update", { name: values.name })
            if (result.status === "success") {
                toast.success("Profile name updated successfully!")
                setUser((prev) => (prev ? { ...prev, name: values.name } : null))
                patchSidebarName(values.name)
            } else {
                toast.error(result.message || "Failed to update profile")
            }
        } catch (error: unknown) {
            toast.error(error instanceof Error ? error.message : "An unexpected error occurred")
        }
    }

    const onChangePassword = async (values: z.infer<typeof passwordSchema>) => {
        try {
            const result = await ApiClient.post("/auth/profile/update", {
                current_password: values.current_password,
                new_password: values.new_password,
            })
            if (result.status === "success") {
                toast.success("Password changed successfully!")
                passwordForm.reset()
            } else {
                toast.error(result.message || "Failed to change password")
            }
        } catch (error: unknown) {
            toast.error(error instanceof Error ? error.message : "An unexpected error occurred")
        }
    }

    const saveWebhook = async (url: string, regenerateSecret: boolean) => {
        try {
            const result = await ApiClient.post<{
                webhook_url?: string
                has_secret?: boolean
                webhook_secret?: string
            }>("/user/webhook", {
                webhook_url: url,
                regenerate_secret: regenerateSecret,
            })
            if (result.status === "success") {
                const data = result.data
                const nextURL = data?.webhook_url ?? url
                setWebhookURL(nextURL)
                setHasSecret(Boolean(data?.has_secret ?? (nextURL !== "")))
                webhookForm.reset({ webhook_url: nextURL })
                if (data?.webhook_secret) {
                    setRevealedSecret(data.webhook_secret)
                    toast.success("Webhook saved. Copy the new signing secret now — it won’t be shown again.")
                } else if (nextURL === "") {
                    setRevealedSecret(null)
                    toast.success("Webhook cleared.")
                } else {
                    toast.success("Webhook URL updated.")
                }
            } else {
                toast.error(result.message || "Failed to update webhook")
            }
        } catch (error: unknown) {
            toast.error(error instanceof Error ? error.message : "Failed to update webhook")
        }
    }

    const onSaveWebhook = async (values: z.infer<typeof webhookSchema>) => {
        await saveWebhook(values.webhook_url.trim(), false)
    }

    const onRegenerateSecret = async () => {
        const url = webhookForm.getValues("webhook_url").trim() || webhookURL
        if (!url) {
            toast.error("Set an HTTPS webhook URL first.")
            return
        }
        await saveWebhook(url, true)
    }

    const onClearWebhook = async () => {
        await saveWebhook("", false)
    }

    const copySecret = async () => {
        if (!revealedSecret) return
        await navigator.clipboard.writeText(revealedSecret)
        setCopied(true)
        toast.success("Secret copied")
        setTimeout(() => setCopied(false), 2000)
    }

    const statusLabel = (user?.status || "Active").toLowerCase() === "suspended" ? "Suspended" : "Active"
    const statusClass =
        statusLabel === "Suspended"
            ? "bg-amber-100 text-amber-800"
            : "bg-emerald-100 text-emerald-700"

    return (
        <div className="flex-1 space-y-4">
            <div className="flex items-center justify-between space-y-2">
                <div>
                    <h2 className="text-2xl font-semibold tracking-tight text-[#0b1f1c] sm:text-3xl">Profile Settings</h2>
                    <p className="mt-1 text-sm text-[#5a736c]">
                        Manage your account, password, and job completion webhooks.
                        {isRefreshing ? " Refreshing…" : ""}
                    </p>
                </div>
            </div>

            <div className="grid grid-cols-1 md:grid-cols-3 gap-6">
                <div className="md:col-span-1 space-y-6">
                    <Card className="shadow-none border-[#0b1f1c]/10 overflow-hidden">
                        <CardHeader className="text-center bg-[#f0f4f2]/60 border-b border-[#0b1f1c]/8 pb-8">
                            <div className="mx-auto pb-4 pt-4">
                                <Avatar className="h-24 w-24 border-4 border-white shadow-md">
                                    <AvatarImage src="" />
                                    <AvatarFallback className="text-2xl font-bold bg-[#0f5c52] text-white">
                                        {user?.name?.split(" ").map((n) => n[0]).join("") || "??"}
                                    </AvatarFallback>
                                </Avatar>
                            </div>
                            <CardTitle className="text-xl text-[#0b1f1c]">{user?.name}</CardTitle>
                            <CardDescription className="font-medium text-[#5a736c]">{user?.email}</CardDescription>
                            <div className="mt-4 flex justify-center">
                                <div className="px-3 py-1 rounded-full text-[10px] font-bold uppercase tracking-widest bg-[#0f5c52]/10 text-[#0f5c52] border border-[#0f5c52]/20">
                                    {user?.role || "User"} Account
                                </div>
                            </div>
                        </CardHeader>
                        <CardContent className="pt-6">
                            <ul className="space-y-4 text-sm">
                                <li className="flex items-center justify-between">
                                    <span className="text-[#5a736c]">Member Since</span>
                                    <span className="font-medium text-[#0b1f1c]">{formatMemberSince(user?.created_at)}</span>
                                </li>
                                <li className="flex items-center justify-between">
                                    <span className="text-[#5a736c]">Status</span>
                                    <span className={`inline-flex items-center px-2 py-0.5 rounded-full text-xs font-semibold ${statusClass}`}>
                                        {statusLabel}
                                    </span>
                                </li>
                            </ul>
                        </CardContent>
                    </Card>
                </div>

                <div className="md:col-span-2 space-y-6">
                    <Card className="shadow-none border-[#0b1f1c]/10 overflow-hidden">
                        <form onSubmit={nameForm.handleSubmit(onUpdateName)}>
                            <CardHeader className="bg-[#f0f4f2]/60 border-b border-[#0b1f1c]/8">
                                <CardTitle className="flex items-center gap-2 text-lg text-[#0b1f1c]">
                                    <User className="h-5 w-5 text-[#0f5c52]" />
                                    Account Details
                                </CardTitle>
                                <CardDescription className="text-[#5a736c]">Update your display name. Email cannot be changed.</CardDescription>
                            </CardHeader>
                            <CardContent className="space-y-4 pt-6">
                                <div className="space-y-2">
                                    <Label htmlFor="usr-name" className="text-[#0b1f1c]">Full Name</Label>
                                    <Input
                                        id="usr-name"
                                        placeholder="Full Name"
                                        className={`focus-visible:ring-[#0f5c52]/30 ${nameForm.formState.errors.name ? "border-red-400" : ""}`}
                                        {...nameForm.register("name")}
                                    />
                                    {nameForm.formState.errors.name && (
                                        <p className="text-xs text-red-500">{nameForm.formState.errors.name.message}</p>
                                    )}
                                </div>
                                <div className="space-y-2">
                                    <Label htmlFor="usr-email" className="text-[#0b1f1c]">Email Address</Label>
                                    <Input
                                        id="usr-email"
                                        value={user?.email || ""}
                                        disabled
                                        className="bg-[#f0f4f2]/60 opacity-80 cursor-not-allowed border-dashed"
                                    />
                                    <p className="text-[10px] text-[#5a736c]">Your registered email address cannot be changed.</p>
                                </div>
                            </CardContent>
                            <CardFooter className="border-t border-[#0b1f1c]/8 pt-4 pb-4 bg-[#f0f4f2]/30">
                                <Button
                                    type="submit"
                                    disabled={nameForm.formState.isSubmitting}
                                    className="border border-[#08352f] bg-[#0f5c52] hover:bg-[#0b4a42] text-white min-w-[140px]"
                                >
                                    {nameForm.formState.isSubmitting ? <Loader2 className="mr-2 h-4 w-4 animate-spin" /> : <Save className="mr-2 h-4 w-4" />}
                                    {nameForm.formState.isSubmitting ? "Saving..." : "Update Name"}
                                </Button>
                            </CardFooter>
                        </form>
                    </Card>

                    <Card className="shadow-none border-[#0b1f1c]/10 overflow-hidden">
                        <form onSubmit={passwordForm.handleSubmit(onChangePassword)}>
                            <CardHeader className="bg-[#f0f4f2]/60 border-b border-[#0b1f1c]/8">
                                <CardTitle className="flex items-center gap-2 text-lg text-[#0b1f1c]">
                                    <Lock className="h-5 w-5 text-[#0f5c52]" />
                                    Security & Password
                                </CardTitle>
                                <CardDescription className="text-[#5a736c]">
                                    Use at least 8 characters with uppercase, lowercase, and a number.
                                </CardDescription>
                            </CardHeader>
                            <CardContent className="space-y-4 pt-6">
                                <div className="space-y-2">
                                    <Label htmlFor="cur-pass" className="text-[#0b1f1c]">Current Password</Label>
                                    <Input
                                        id="cur-pass"
                                        type="password"
                                        autoComplete="current-password"
                                        placeholder="Enter current password"
                                        className={`focus-visible:ring-[#0f5c52]/30 ${passwordForm.formState.errors.current_password ? "border-red-400" : ""}`}
                                        {...passwordForm.register("current_password")}
                                    />
                                    {passwordForm.formState.errors.current_password && (
                                        <p className="text-xs text-red-500">{passwordForm.formState.errors.current_password.message}</p>
                                    )}
                                </div>
                                <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                                    <div className="space-y-2">
                                        <Label htmlFor="new-pass" className="text-[#0b1f1c]">New Password</Label>
                                        <Input
                                            id="new-pass"
                                            type="password"
                                            autoComplete="new-password"
                                            placeholder="Enter new password"
                                            className={`focus-visible:ring-[#0f5c52]/30 ${passwordForm.formState.errors.new_password ? "border-red-400" : ""}`}
                                            {...passwordForm.register("new_password")}
                                        />
                                        {passwordForm.formState.errors.new_password && (
                                            <p className="text-xs text-red-500">{passwordForm.formState.errors.new_password.message}</p>
                                        )}
                                    </div>
                                    <div className="space-y-2">
                                        <Label htmlFor="conf-pass" className="text-[#0b1f1c]">Confirm Password</Label>
                                        <Input
                                            id="conf-pass"
                                            type="password"
                                            autoComplete="new-password"
                                            placeholder="Confirm new password"
                                            className={`focus-visible:ring-[#0f5c52]/30 ${passwordForm.formState.errors.confirm_password ? "border-red-400" : ""}`}
                                            {...passwordForm.register("confirm_password")}
                                        />
                                        {passwordForm.formState.errors.confirm_password && (
                                            <p className="text-xs text-red-500">{passwordForm.formState.errors.confirm_password.message}</p>
                                        )}
                                    </div>
                                </div>
                            </CardContent>
                            <CardFooter className="border-t border-[#0b1f1c]/8 pt-4 pb-4 bg-[#f0f4f2]/30">
                                <Button
                                    type="submit"
                                    disabled={passwordForm.formState.isSubmitting}
                                    className="border border-[#08352f] bg-[#0f5c52] hover:bg-[#0b4a42] text-white min-w-[140px]"
                                >
                                    {passwordForm.formState.isSubmitting ? <Loader2 className="mr-2 h-4 w-4 animate-spin" /> : <Lock className="mr-2 h-4 w-4" />}
                                    {passwordForm.formState.isSubmitting ? "Updating..." : "Update Password"}
                                </Button>
                            </CardFooter>
                        </form>
                    </Card>

                    <Card className="shadow-none border-[#0b1f1c]/10 overflow-hidden">
                        <form onSubmit={webhookForm.handleSubmit(onSaveWebhook)}>
                            <CardHeader className="bg-[#f0f4f2]/60 border-b border-[#0b1f1c]/8">
                                <CardTitle className="flex items-center gap-2 text-lg text-[#0b1f1c]">
                                    <Webhook className="h-5 w-5 text-[#0f5c52]" />
                                    Job Webhooks
                                </CardTitle>
                                <CardDescription className="text-[#5a736c]">
                                    HTTPS endpoint for job.started / job.completed events. Signed with X-EJP-Signature.
                                </CardDescription>
                            </CardHeader>
                            <CardContent className="space-y-4 pt-6">
                                <div className="space-y-2">
                                    <Label htmlFor="webhook-url" className="text-[#0b1f1c]">Webhook URL</Label>
                                    <Input
                                        id="webhook-url"
                                        placeholder="https://example.com/hooks/ejp"
                                        className={`focus-visible:ring-[#0f5c52]/30 ${webhookForm.formState.errors.webhook_url ? "border-red-400" : ""}`}
                                        {...webhookForm.register("webhook_url")}
                                    />
                                    {webhookForm.formState.errors.webhook_url && (
                                        <p className="text-xs text-red-500">{webhookForm.formState.errors.webhook_url.message}</p>
                                    )}
                                    <p className="text-[10px] text-[#5a736c]">
                                        HTTPS only. Private/local addresses are blocked. Leave empty and save to disable.
                                    </p>
                                </div>

                                <div className="rounded-lg border border-[#0b1f1c]/10 bg-[#f0f4f2]/40 px-3 py-2 text-sm flex items-center justify-between gap-3">
                                    <span className="text-[#5a736c]">
                                        Signing secret:{" "}
                                        <span className="font-semibold text-[#0b1f1c]">
                                            {hasSecret ? "Configured (hidden)" : "Not set"}
                                        </span>
                                    </span>
                                    <Button
                                        type="button"
                                        variant="outline"
                                        size="sm"
                                        disabled={webhookForm.formState.isSubmitting || !webhookForm.watch("webhook_url")}
                                        onClick={() => void onRegenerateSecret()}
                                        className="border-[#0b1f1c]/10"
                                    >
                                        <RefreshCw className="mr-1.5 h-3.5 w-3.5" />
                                        Regenerate
                                    </Button>
                                </div>

                                {revealedSecret && (
                                    <div className="rounded-xl border border-emerald-200 bg-emerald-50/70 p-3 space-y-2">
                                        <div className="flex items-center justify-between gap-2">
                                            <p className="text-xs font-semibold text-emerald-900">
                                                New secret (shown once) — store it securely
                                            </p>
                                            <button
                                                type="button"
                                                className="text-emerald-700 hover:text-emerald-900"
                                                onClick={() => setRevealedSecret(null)}
                                                aria-label="Dismiss secret"
                                            >
                                                <X className="h-4 w-4" />
                                            </button>
                                        </div>
                                        <div className="flex flex-col sm:flex-row gap-2">
                                            <code className="flex-1 break-all rounded-lg bg-white px-3 py-2 text-xs font-mono border border-emerald-100">
                                                {revealedSecret}
                                            </code>
                                            <Button type="button" variant="outline" onClick={() => void copySecret()} className="border-emerald-300">
                                                {copied ? <Check className="mr-1.5 h-4 w-4 text-emerald-600" /> : <Copy className="mr-1.5 h-4 w-4" />}
                                                {copied ? "Copied" : "Copy"}
                                            </Button>
                                        </div>
                                    </div>
                                )}
                            </CardContent>
                            <CardFooter className="border-t border-[#0b1f1c]/8 pt-4 pb-4 bg-[#f0f4f2]/30 flex flex-wrap gap-2">
                                <Button
                                    type="submit"
                                    disabled={webhookForm.formState.isSubmitting}
                                    className="border border-[#08352f] bg-[#0f5c52] hover:bg-[#0b4a42] text-white min-w-[140px]"
                                >
                                    {webhookForm.formState.isSubmitting ? <Loader2 className="mr-2 h-4 w-4 animate-spin" /> : <Save className="mr-2 h-4 w-4" />}
                                    {webhookForm.formState.isSubmitting ? "Saving..." : "Save Webhook"}
                                </Button>
                                {(webhookURL || hasSecret) && (
                                    <Button
                                        type="button"
                                        variant="outline"
                                        disabled={webhookForm.formState.isSubmitting}
                                        onClick={() => void onClearWebhook()}
                                        className="border-[#0b1f1c]/10 text-rose-700 hover:bg-rose-50"
                                    >
                                        Clear Webhook
                                    </Button>
                                )}
                            </CardFooter>
                        </form>
                    </Card>
                </div>
            </div>
        </div>
    )
}
