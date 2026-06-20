"use client"

import { useState, useEffect } from "react"
import { Button } from "@/components/ui/button"
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card"
import { Input } from "@/components/ui/input"
import { Palette, Globe, Mail, Share2, Save, CheckCircle, XCircle, Loader2 } from "lucide-react"
import { Label } from "@/components/ui/label"
import { Alert, AlertDescription } from "@/components/ui/alert"
import { ApiClient } from "@/lib/api-client"
import { useForm } from "react-hook-form"
import { zodResolver } from "@hookform/resolvers/zod"
import * as z from "zod"
import { toast } from "react-hot-toast"
import { cn } from "@/lib/utils"

const brandSettingsSchema = z.object({
    site_title: z.string().min(1, "Site title is required").optional().or(z.literal("")),
    site_tagline: z.string().optional().or(z.literal("")),
    logo_url: z.string().url("Must be a valid URL").optional().or(z.literal("")),
    favicon_url: z.string().url("Must be a valid URL").optional().or(z.literal("")),
    primary_color: z.string().regex(/^#([A-Fa-f0-9]{6}|[A-Fa-f0-9]{3})$/, "Must be a valid HEX color code").optional().or(z.literal("")),
    nav_style: z.enum(['dark', 'light']).optional().or(z.literal("")),
    support_email: z.string().email("Must be a valid email address").optional().or(z.literal("")),
    help_center_url: z.string().url("Must be a valid URL").optional().or(z.literal("")),
    twitter_url: z.string().url("Must be a valid URL").optional().or(z.literal("")),
    linkedin_url: z.string().url("Must be a valid URL").optional().or(z.literal("")),
    github_url: z.string().url("Must be a valid URL").optional().or(z.literal("")),
})

type BrandSettingsValues = z.infer<typeof brandSettingsSchema>

export function BrandBuildClient({ initialData }: { initialData: Record<string, string> }) {
    const [isLoading, setIsLoading] = useState(false)

    const form = useForm<BrandSettingsValues>({
        resolver: zodResolver(brandSettingsSchema),
        defaultValues: {
            site_title: initialData.site_title || "",
            site_tagline: initialData.site_tagline || "",
            logo_url: initialData.logo_url || "",
            favicon_url: initialData.favicon_url || "",
            primary_color: initialData.primary_color || "#0F172B",
            nav_style: (initialData.nav_style as 'dark' | 'light') || "dark",
            support_email: initialData.support_email || "",
            help_center_url: initialData.help_center_url || "",
            twitter_url: initialData.twitter_url || "",
            linkedin_url: initialData.linkedin_url || "",
            github_url: initialData.github_url || "",
        }
    })

    const fetchSettings = async () => {
        setIsLoading(true);
        try {
            const result = await ApiClient.get('/admin/settings');
            if (result.status === 'success') {
                const payload = result.data;
                const mapped: Record<string, string> = {};
                if (Array.isArray(payload)) {
                    for (const item of payload) {
                        if (item.setting_key) {
                            mapped[item.setting_key] = item.setting_value ?? "";
                        }
                    }
                } else if (payload && typeof payload === "object") {
                    Object.assign(mapped, payload);
                }
                form.reset({
                    site_title: mapped.site_title || "",
                    site_tagline: mapped.site_tagline || "",
                    logo_url: mapped.logo_url || "",
                    favicon_url: mapped.favicon_url || "",
                    primary_color: mapped.primary_color || "#0F172B",
                    nav_style: (mapped.nav_style as 'dark' | 'light') || "dark",
                    support_email: mapped.support_email || "",
                    help_center_url: mapped.help_center_url || "",
                    twitter_url: mapped.twitter_url || "",
                    linkedin_url: mapped.linkedin_url || "",
                    github_url: mapped.github_url || "",
                });
            }
        } catch (error) {
            console.error("Failed to fetch brand settings:", error);
        } finally {
            setIsLoading(false);
        }
    };

    useEffect(() => {
        fetchSettings();
    }, []);

    const handleSaveSubmit = async (values: BrandSettingsValues) => {
        try {
            // Clean up empty strings to not fail backend logic or keep them if intended.
            // Our backend accepts string maps, so we send the values directly
            const result = await ApiClient.post('/admin/settings/update', { settings: values });

            if (result.status === 'success') {
                toast.success("Brand settings updated successfully.");
            } else {
                toast.error(result.message || "Failed to save settings.");
            }
        } catch (error: any) {
            toast.error(error.message || "Server error occurred.");
        }
    }

    return (
        <form onSubmit={form.handleSubmit(handleSaveSubmit)} className="flex-1 space-y-4">
            <div className="flex items-center justify-between space-y-2">
                <div>
                    <h2 className="text-3xl font-bold tracking-tight">Brand Settings</h2>
                    <p className="text-slate-500 text-sm">Customize the identity and look of your platform.</p>
                </div>
                <Button
                    type="submit"
                    disabled={form.formState.isSubmitting || isLoading}
                    className="bg-[#0f172b] hover:bg-[#0f172b]/90 text-white min-w-[140px]"
                >
                    {form.formState.isSubmitting ? <Loader2 className="mr-2 h-4 w-4 animate-spin" /> : <Save className="mr-2 h-4 w-4" />}
                    {form.formState.isSubmitting ? 'Saving...' : 'Save Changes'}
                </Button>
            </div>

            <div className="grid gap-6 md:grid-cols-2">
                {/* General Branding */}
                <Card className="shadow-sm border-indigo-100 overflow-hidden">
                    <CardHeader className="bg-slate-50/50 border-b border-indigo-50/50">
                        <CardTitle className="flex items-center gap-2 text-lg font-semibold text-slate-900">
                            <Globe className="h-5 w-5 text-slate-500" />
                            General Branding
                        </CardTitle>
                        <CardDescription>Configure basic identity settings for your application.</CardDescription>
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
                            <div className="flex items-center gap-4">
                                <Input
                                    id="logo-url"
                                    placeholder="https://example.com/logo.png"
                                    className={cn(form.formState.errors.logo_url && "border-red-500")}
                                    {...form.register("logo_url")}
                                />
                            </div>
                            {form.formState.errors.logo_url && <p className="text-[10px] text-red-500">{form.formState.errors.logo_url.message}</p>}
                            <p className="text-[10px] text-slate-400">Direct link to your brand logo image.</p>
                        </div>
                        <div className="space-y-2">
                            <Label htmlFor="favicon-url" className="text-sm font-medium">Favicon URL</Label>
                            <div className="flex items-center gap-4">
                                <Input
                                    id="favicon-url"
                                    placeholder="https://example.com/favicon.ico"
                                    className={cn(form.formState.errors.favicon_url && "border-red-500")}
                                    {...form.register("favicon_url")}
                                />
                            </div>
                            {form.formState.errors.favicon_url && <p className="text-[10px] text-red-500">{form.formState.errors.favicon_url.message}</p>}
                            <p className="text-[10px] text-slate-400">Direct link to your website favicon.</p>
                        </div>
                    </CardContent>
                </Card>

                {/* Appearance & Theme */}
                <Card className="shadow-sm border-indigo-100 overflow-hidden">
                    <CardHeader className="bg-slate-50/50 border-b border-indigo-50/50">
                        <CardTitle className="flex items-center gap-2 text-lg font-semibold text-slate-900">
                            <Palette className="h-5 w-5 text-slate-500" />
                            Appearance & Theme
                        </CardTitle>
                        <CardDescription>Manage the look and feel of the user dashboard.</CardDescription>
                    </CardHeader>
                    <CardContent className="space-y-4 pt-6">
                        <div className="space-y-2">
                            <Label htmlFor="primary-color" className="text-sm font-medium">Primary Brand Color</Label>
                            <div className="flex gap-3 items-center">
                                <div
                                    className="h-10 w-10 rounded-md border border-slate-200"
                                    style={{ backgroundColor: form.watch('primary_color') || '#0F172B' }}
                                ></div>
                                <Input
                                    id="primary-color"
                                    className={cn("w-32 font-mono text-center uppercase", form.formState.errors.primary_color && "border-red-500")}
                                    placeholder="#0F172B"
                                    {...form.register("primary_color")}
                                />
                                <p className="text-xs text-slate-400">HEX color code</p>
                            </div>
                            {form.formState.errors.primary_color && <p className="text-[10px] text-red-500">{form.formState.errors.primary_color.message}</p>}
                        </div>
                        <div className="space-y-2 pt-2">
                            <label className="text-sm font-medium">Navigation Style</label>
                            <div className="grid grid-cols-2 gap-3">
                                <button
                                    type="button"
                                    onClick={() => form.setValue('nav_style', 'dark')}
                                    className={`border rounded-md p-3 transition-all ${form.watch('nav_style') === 'dark' ? "bg-slate-100 border-indigo-200 ring-1 ring-indigo-500" : "hover:bg-slate-50"}`}
                                >
                                    <p className="text-xs font-bold text-center">Dark Sidebar</p>
                                </button>
                                <button
                                    type="button"
                                    onClick={() => form.setValue('nav_style', 'light')}
                                    className={`border rounded-md p-3 transition-all ${form.watch('nav_style') === 'light' ? "bg-slate-100 border-indigo-200 ring-1 ring-indigo-500" : "hover:bg-slate-50"}`}
                                >
                                    <p className="text-xs font-bold text-center">Light Sidebar</p>
                                </button>
                            </div>
                        </div>
                    </CardContent>
                </Card>

                {/* Contact & Support */}
                <Card className="shadow-sm border-indigo-100 overflow-hidden">
                    <CardHeader className="bg-slate-50/50 border-b border-indigo-50/50">
                        <CardTitle className="flex items-center gap-2 text-lg font-semibold text-slate-900">
                            <Mail className="h-5 w-5 text-slate-500" />
                            Contact & Support
                        </CardTitle>
                        <CardDescription>How users get in touch with you.</CardDescription>
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

                {/* Social Presence */}
                <Card className="shadow-sm border-indigo-100 overflow-hidden">
                    <CardHeader className="bg-slate-50/50 border-b border-indigo-50/50">
                        <CardTitle className="flex items-center gap-2 text-lg font-semibold text-slate-900">
                            <Share2 className="h-5 w-5 text-slate-500" />
                            Social Presence
                        </CardTitle>
                        <CardDescription>Configure your social media links for the footer.</CardDescription>
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
