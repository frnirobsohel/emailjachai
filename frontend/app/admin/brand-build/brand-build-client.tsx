"use client"

import { useState, useEffect } from "react"
import { useRouter } from "next/navigation"
import { Button } from "@/components/ui/button"
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card"
import { Input } from "@/components/ui/input"
import { Palette, Globe, Mail, Share2, Save, Loader2 } from "lucide-react"
import { Label } from "@/components/ui/label"
import { ApiClient } from "@/lib/api-client"
import { useForm } from "react-hook-form"
import { zodResolver } from "@hookform/resolvers/zod"
import * as z from "zod"
import { toast } from "react-hot-toast"
import { cn } from "@/lib/utils"
import { useConfigStore } from "@/stores/config-store"

const httpUrl = z
    .string()
    .max(2048, "URL is too long")
    .refine((v) => {
        if (!v) return true
        try {
            const u = new URL(v)
            return u.protocol === "http:" || u.protocol === "https:"
        } catch {
            return false
        }
    }, "Must be a valid http(s) URL")

const brandSettingsSchema = z.object({
    site_title: z.string().trim().min(1, "Site title is required").max(100, "Site title must be at most 100 characters"),
    site_tagline: z.string().max(200, "Tagline must be at most 200 characters").optional().or(z.literal("")),
    logo_url: httpUrl.optional().or(z.literal("")),
    favicon_url: httpUrl.optional().or(z.literal("")),
    support_email: z
        .string()
        .max(254)
        .refine((value) => value === "" || z.string().email().safeParse(value).success, {
            message: "Must be a valid email address",
        }),
    help_center_url: httpUrl.optional().or(z.literal("")),
    twitter_url: httpUrl.optional().or(z.literal("")),
    linkedin_url: httpUrl.optional().or(z.literal("")),
    github_url: httpUrl.optional().or(z.literal("")),
})

type BrandSettingsValues = z.infer<typeof brandSettingsSchema>

function mapBrandValues(data: Record<string, string>): BrandSettingsValues {
    return {
        site_title: data.site_title || "",
        site_tagline: data.site_tagline || "",
        logo_url: data.logo_url || "",
        favicon_url: data.favicon_url || "",
        support_email: data.support_email || "",
        help_center_url: data.help_center_url || "",
        twitter_url: data.twitter_url || "",
        linkedin_url: data.linkedin_url || "",
        github_url: data.github_url || "",
    }
}

export function BrandBuildClient({ initialData }: { initialData: Record<string, string> }) {
    const router = useRouter()
    const [isRefreshing, setIsRefreshing] = useState(false)

    const form = useForm<BrandSettingsValues>({
        resolver: zodResolver(brandSettingsSchema),
        defaultValues: mapBrandValues(initialData),
    })

    const refreshSettings = async () => {
        setIsRefreshing(true)
        try {
            const result = await ApiClient.get<Record<string, string>>("/admin/settings/brand")
            if (result.status === "success" && result.data) {
                form.reset(mapBrandValues(result.data))
            }
        } catch (error) {
            console.error("Failed to fetch brand settings:", error)
        } finally {
            setIsRefreshing(false)
        }
    }

    // Keep form in sync with SSR props; if SSR missed auth, fill from client fetch (avoids empty→value flicker gap).
    useEffect(() => {
        if (Object.keys(initialData).length > 0) {
            form.reset(mapBrandValues(initialData))
            return
        }
        void refreshSettings()
        // eslint-disable-next-line react-hooks/exhaustive-deps -- hydrate from SSR / one client fallback
    }, [initialData])

    const handleSaveSubmit = async (values: BrandSettingsValues) => {
        try {
            const result = await ApiClient.post("/admin/settings/brand", { settings: values })

            if (result.status === "success") {
                const prev = useConfigStore.getState().settings || {}
                useConfigStore.getState().setSettings({
                    ...prev,
                    site_title: values.site_title,
                    site_tagline: values.site_tagline || "",
                    logo_url: values.logo_url || "",
                    favicon_url: values.favicon_url || "",
                    support_email: values.support_email || "",
                    help_center_url: values.help_center_url || "",
                    twitter_url: values.twitter_url || "",
                    linkedin_url: values.linkedin_url || "",
                    github_url: values.github_url || "",
                })
                toast.success("Brand settings updated successfully.")
                form.reset(values)
                router.refresh()
            } else {
                toast.error(result.message || "Failed to save settings.")
            }
        } catch (error: unknown) {
            toast.error(error instanceof Error ? error.message : "Server error occurred.")
        }
    }

    return (
        <form onSubmit={form.handleSubmit(handleSaveSubmit)} className="flex-1 space-y-4">
            <div className="flex items-center justify-between space-y-2">
                <div>
                    <h2 className="text-2xl font-semibold tracking-tight text-[#0b1f1c] sm:text-3xl">Brand Settings</h2>
                    <p className="mt-1 text-sm text-[#5a736c]">Customize the identity and look of your platform.</p>
                </div>
                <Button
                    type="submit"
                    disabled={form.formState.isSubmitting || isRefreshing}
                    className="border border-[#08352f] bg-[#0f5c52] hover:bg-[#0b4a42] text-white shadow-none min-w-[140px]"
                >
                    {form.formState.isSubmitting ? <Loader2 className="mr-2 h-4 w-4 animate-spin" /> : <Save className="mr-2 h-4 w-4" />}
                    {form.formState.isSubmitting ? "Saving..." : "Save Changes"}
                </Button>
            </div>

            <div className="grid gap-6 md:grid-cols-2">
                <Card className="border-[#0b1f1c]/10 bg-white/90 shadow-none overflow-hidden">
                    <CardHeader className="bg-[#f0f4f2]/60 border-b border-[#0b1f1c]/8">
                        <CardTitle className="flex items-center gap-2 text-lg font-semibold text-[#0b1f1c]">
                            <Globe className="h-5 w-5 text-[#0f5c52]" />
                            General Branding
                        </CardTitle>
                        <CardDescription className="text-[#5a736c]">Configure basic identity settings for your application.</CardDescription>
                    </CardHeader>
                    <CardContent className="space-y-4 pt-6">
                        <div className="space-y-2">
                            <Label htmlFor="site-title" className="text-sm font-medium">Site Title</Label>
                            <Input
                                id="site-title"
                                placeholder="EmailVerifier Pro"
                                className={cn(form.formState.errors.site_title && "border-red-500")}
                                {...form.register("site_title")}
                            />
                            {form.formState.errors.site_title && <p className="text-[10px] text-red-500">{form.formState.errors.site_title.message}</p>}
                        </div>
                        <div className="space-y-2">
                            <Label htmlFor="site-tagline" className="text-sm font-medium">Tagline / Motto</Label>
                            <Input
                                id="site-tagline"
                                placeholder="Verify with confidence"
                                className={cn(form.formState.errors.site_tagline && "border-red-500")}
                                {...form.register("site_tagline")}
                            />
                            {form.formState.errors.site_tagline && <p className="text-[10px] text-red-500">{form.formState.errors.site_tagline.message}</p>}
                        </div>
                        <div className="space-y-2">
                            <Label htmlFor="logo-url" className="text-sm font-medium">Logo URL</Label>
                            <Input
                                id="logo-url"
                                placeholder="https://example.com/logo.png"
                                className={cn(form.formState.errors.logo_url && "border-red-500")}
                                {...form.register("logo_url")}
                            />
                            {form.formState.errors.logo_url && <p className="text-[10px] text-red-500">{form.formState.errors.logo_url.message}</p>}
                            <p className="text-[10px] text-[#6b857c]">Direct link to your brand logo image.</p>
                        </div>
                        <div className="space-y-2">
                            <Label htmlFor="favicon-url" className="text-sm font-medium">Favicon URL</Label>
                            <Input
                                id="favicon-url"
                                placeholder="https://example.com/favicon.ico"
                                className={cn(form.formState.errors.favicon_url && "border-red-500")}
                                {...form.register("favicon_url")}
                            />
                            {form.formState.errors.favicon_url && <p className="text-[10px] text-red-500">{form.formState.errors.favicon_url.message}</p>}
                            <p className="text-[10px] text-[#6b857c]">Direct link to your website favicon.</p>
                        </div>
                    </CardContent>
                </Card>

                <Card className="border-[#0b1f1c]/10 bg-white/90 shadow-none overflow-hidden">
                    <CardHeader className="bg-[#f0f4f2]/60 border-b border-[#0b1f1c]/8">
                        <CardTitle className="flex items-center gap-2 text-lg font-semibold text-[#0b1f1c]">
                            <Palette className="h-5 w-5 text-[#0f5c52]" />
                            Appearance & Theme
                        </CardTitle>
                        <CardDescription className="text-[#5a736c]">Manage the look and feel of the user dashboard.</CardDescription>
                    </CardHeader>
                </Card>

                <Card className="border-[#0b1f1c]/10 bg-white/90 shadow-none overflow-hidden">
                    <CardHeader className="bg-[#f0f4f2]/60 border-b border-[#0b1f1c]/8">
                        <CardTitle className="flex items-center gap-2 text-lg font-semibold text-[#0b1f1c]">
                            <Mail className="h-5 w-5 text-[#0f5c52]" />
                            Contact & Support
                        </CardTitle>
                        <CardDescription className="text-[#5a736c]">How users get in touch with you.</CardDescription>
                    </CardHeader>
                    <CardContent className="space-y-4 pt-6">
                        <div className="space-y-2">
                            <Label htmlFor="support-email" className="text-sm font-medium">Support Email Address</Label>
                            <Input
                                id="support-email"
                                placeholder="support@yourdomain.com"
                                className={cn(form.formState.errors.support_email && "border-red-500")}
                                {...form.register("support_email")}
                            />
                            {form.formState.errors.support_email && <p className="text-[10px] text-red-500">{form.formState.errors.support_email.message}</p>}
                        </div>
                        <div className="space-y-2">
                            <Label htmlFor="help-center-url" className="text-sm font-medium">Help Center URL</Label>
                            <Input
                                id="help-center-url"
                                placeholder="https://docs.yourdomain.com"
                                className={cn(form.formState.errors.help_center_url && "border-red-500")}
                                {...form.register("help_center_url")}
                            />
                            {form.formState.errors.help_center_url && <p className="text-[10px] text-red-500">{form.formState.errors.help_center_url.message}</p>}
                        </div>
                    </CardContent>
                </Card>

                <Card className="border-[#0b1f1c]/10 bg-white/90 shadow-none overflow-hidden">
                    <CardHeader className="bg-[#f0f4f2]/60 border-b border-[#0b1f1c]/8">
                        <CardTitle className="flex items-center gap-2 text-lg font-semibold text-[#0b1f1c]">
                            <Share2 className="h-5 w-5 text-[#0f5c52]" />
                            Social Presence
                        </CardTitle>
                        <CardDescription className="text-[#5a736c]">Configure your social media links for the footer.</CardDescription>
                    </CardHeader>
                    <CardContent className="space-y-4 pt-6">
                        <div className="space-y-2">
                            <Label htmlFor="twitter-url" className="text-sm font-medium">Twitter / X URL</Label>
                            <Input
                                id="twitter-url"
                                placeholder="https://twitter.com/yourhandle"
                                className={cn(form.formState.errors.twitter_url && "border-red-500")}
                                {...form.register("twitter_url")}
                            />
                            {form.formState.errors.twitter_url && <p className="text-[10px] text-red-500">{form.formState.errors.twitter_url.message}</p>}
                        </div>
                        <div className="space-y-2">
                            <Label htmlFor="linkedin-url" className="text-sm font-medium">LinkedIn URL</Label>
                            <Input
                                id="linkedin-url"
                                placeholder="https://linkedin.com/company/yourbrand"
                                className={cn(form.formState.errors.linkedin_url && "border-red-500")}
                                {...form.register("linkedin_url")}
                            />
                            {form.formState.errors.linkedin_url && <p className="text-[10px] text-red-500">{form.formState.errors.linkedin_url.message}</p>}
                        </div>
                        <div className="space-y-2">
                            <Label htmlFor="github-url" className="text-sm font-medium">GitHub URL</Label>
                            <Input
                                id="github-url"
                                placeholder="https://github.com/yourbrand"
                                className={cn(form.formState.errors.github_url && "border-red-500")}
                                {...form.register("github_url")}
                            />
                            {form.formState.errors.github_url && <p className="text-[10px] text-red-500">{form.formState.errors.github_url.message}</p>}
                        </div>
                    </CardContent>
                </Card>
            </div>
        </form>
    )
}
