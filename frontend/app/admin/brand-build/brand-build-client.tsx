"use client"

import { useState, useEffect } from "react"
import { useRouter } from "next/navigation"
import { Button } from "@/components/ui/button"
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card"
import { Input } from "@/components/ui/input"
import { Textarea } from "@/components/ui/textarea"
import { Palette, Globe, Mail, Share2, Save, Loader2, Code, Search, Plus, Trash2, Edit3, Check, Sparkles, FileText, ShieldAlert } from "lucide-react"
import { Label } from "@/components/ui/label"
import { Switch } from "@/components/ui/switch"
import { ApiClient } from "@/lib/api-client"
import { useForm } from "react-hook-form"
import { zodResolver } from "@hookform/resolvers/zod"
import * as z from "zod"
import { toast } from "react-hot-toast"
import { cn } from "@/lib/utils"
import { useConfigStore } from "@/stores/config-store"

export interface HeadScriptItem {
    id: string
    name: string
    code: string
    enabled: boolean
}

const httpUrl = z
    .string()
    .max(2048, "URL is too long")
    .refine((v) => {
        if (!v) return true
        try {
            const u = new URL(v)
            return u.protocol === "https:"
        } catch {
            return false
        }
    }, "Must be a valid https URL")

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
    youtube_url: httpUrl.optional().or(z.literal("")),
    facebook_url: httpUrl.optional().or(z.literal("")),
    google_site_verification: z.string().optional().or(z.literal("")),
    site_base_url: httpUrl.optional().or(z.literal("")),
    custom_robots_txt: z.string().optional().or(z.literal("")),
    use_custom_robots: z.boolean().optional(),
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
        youtube_url: data.youtube_url || "",
        facebook_url: data.facebook_url || "",
        google_site_verification: data.google_site_verification || "",
        site_base_url: data.site_base_url || "",
        custom_robots_txt: data.custom_robots_txt || "",
        use_custom_robots: data.use_custom_robots === "1" || data.use_custom_robots === "true",
    }
}

const PRESETS = [
    {
        name: "Facebook Pixel",
        code: `<script>\n!function(f,b,e,v,n,t,s)\n{if(f.fbq)return;n=f.fbq=function(){n.callMethod?\nn.callMethod.apply(n,arguments):n.queue.push(arguments)};\nif(!f._fbq)f._fbq=n;n.push=n;n.loaded=!0;n.version='2.0';\nn.queue=[];t=b.createElement(e);t.async=!0;\nt.src=v;s=b.getElementsByTagName(e)[0];\ns.parentNode.insertBefore(t,s)}(window, document,'script',\n'https://connect.facebook.net/en_US/fbevents.js');\nfbq('init', 'YOUR_PIXEL_ID');\nfbq('track', 'PageView');\n</script>`,
    },
    {
        name: "Google Tag Manager",
        code: `<script>(function(w,d,s,l,i){w[l]=w[l]||[];w[l].push({'gtm.start':\nnew Date().getTime(),event:'gtm.js'});var f=d.getElementsByTagName(s)[0],\nj=d.createElement(s),dl=l!='dataLayer'?'&l='+l:'';j.async=true;j.src=\n'https://www.googletagmanager.com/gtm.js?id='+i+dl;f.parentNode.insertBefore(j,f);\n})(window,document,'script','dataLayer','GTM-XXXXXXX');</script>`,
    },
    {
        name: "Google Search Console",
        code: `<meta name="google-site-verification" content="YOUR_VERIFICATION_CODE_HERE" />`,
    },
    {
        name: "TikTok Pixel",
        code: `<script>\n!function (w, d, t) { w.TiktokAnalyticsObject=t;var ttq=w[t]=w[t]||[];ttq.methods=["page","track","identify","instances","debug","on","off","once","ready","alias","group","enableCookie","addConsent"],ttq.setAndDefer=function(t,e){t[e]=function(){t.push([e].concat(Array.prototype.slice.call(arguments,0)))}};for(var i=0;i<ttq.methods.length;i++)ttq.setAndDefer(ttq,ttq.methods[i]);ttq.instance=function(t){for(var e=ttq.methods[t]||[],n=0;n<ttq.methods.length;n++)ttq.setAndDefer(e,ttq.methods[n]);return e},ttq.load=function(e,n){var i="https://analytics.tiktok.com/i18n/pixel/events.js";ttq._i=ttq._i||{},ttq._i[e]=[],ttq._i[e]._u=i,ttq._t=ttq._t||{},ttq._t[e]=+new Date,ttq._o=ttq._o||{},ttq._o[e]=n||{};var o=document.createElement("script");o.type="text/javascript",o.async=!0,o.src=i+"?sdkid="+e+"&lib="+t;var a=document.getElementsByTagName("script")[0];a.parentNode.insertBefore(o,a)}; ttq.load('YOUR_PIXEL_ID'); ttq.page(); }(window, document, 'ttq');\n</script>`,
    },
]

export function BrandBuildClient({ initialData }: { initialData: Record<string, string> }) {
    const router = useRouter()
    const [isRefreshing, setIsRefreshing] = useState(false)
    const [headScripts, setHeadScripts] = useState<HeadScriptItem[]>([])
    const [isAddingScript, setIsAddingScript] = useState(false)
    const [editingScriptId, setEditingScriptId] = useState<string | null>(null)
    const [scriptName, setScriptName] = useState("")
    const [scriptCode, setScriptCode] = useState("")

    const form = useForm<BrandSettingsValues>({
        resolver: zodResolver(brandSettingsSchema),
        defaultValues: mapBrandValues(initialData),
    })

    // Hydrate Head Scripts state from initialData or API fetch
    useEffect(() => {
        if (initialData.head_scripts_json) {
            try {
                const parsed = JSON.parse(initialData.head_scripts_json)
                if (Array.isArray(parsed)) setHeadScripts(parsed)
            } catch {
                setHeadScripts([])
            }
        }
    }, [initialData])

    const refreshSettings = async () => {
        setIsRefreshing(true)
        try {
            const result = await ApiClient.get<Record<string, string>>("/admin/settings/brand")
            if (result.status === "success" && result.data) {
                form.reset(mapBrandValues(result.data))
                if (result.data.head_scripts_json) {
                    try {
                        const parsed = JSON.parse(result.data.head_scripts_json)
                        if (Array.isArray(parsed)) setHeadScripts(parsed)
                    } catch {
                        setHeadScripts([])
                    }
                }
            }
        } catch (error) {
            console.error("Failed to fetch brand settings:", error)
        } finally {
            setIsRefreshing(false)
        }
    }

    useEffect(() => {
        if (Object.keys(initialData).length > 0) {
            form.reset(mapBrandValues(initialData))
            return
        }
        void refreshSettings()
        // eslint-disable-next-line react-hooks/exhaustive-deps
    }, [initialData])

    const handleSaveScript = () => {
        if (!scriptName.trim()) {
            toast.error("Please enter a script name.")
            return
        }
        if (!scriptCode.trim()) {
            toast.error("Please enter script HTML/JavaScript code.")
            return
        }

        if (editingScriptId) {
            setHeadScripts((prev) =>
                prev.map((s) => (s.id === editingScriptId ? { ...s, name: scriptName.trim(), code: scriptCode } : s))
            )
            toast.success("Script updated.")
        } else {
            const newScript: HeadScriptItem = {
                id: Date.now().toString(),
                name: scriptName.trim(),
                code: scriptCode,
                enabled: true,
            }
            setHeadScripts((prev) => [...prev, newScript])
            toast.success("Script added.")
        }

        setScriptName("")
        setScriptCode("")
        setIsAddingScript(false)
        setEditingScriptId(null)
    }

    const handleToggleScript = (id: string) => {
        setHeadScripts((prev) => prev.map((s) => (s.id === id ? { ...s, enabled: !s.enabled } : s)))
    }

    const handleDeleteScript = (id: string) => {
        setHeadScripts((prev) => prev.filter((s) => s.id !== id))
        toast.success("Script removed.")
    }

    const handleEditScript = (script: HeadScriptItem) => {
        setEditingScriptId(script.id)
        setScriptName(script.name)
        setScriptCode(script.code)
        setIsAddingScript(true)
    }

    const applyPreset = (preset: { name: string; code: string }) => {
        setScriptName(preset.name)
        setScriptCode(preset.code)
    }

    const handleSaveSubmit = async (values: BrandSettingsValues) => {
        try {
            const payload = {
                ...values,
                use_custom_robots: values.use_custom_robots ? "1" : "0",
                head_scripts_json: JSON.stringify(headScripts),
            }

            const result = await ApiClient.post("/admin/settings/brand", { settings: payload })

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
                    youtube_url: values.youtube_url || "",
                    facebook_url: values.facebook_url || "",
                    google_site_verification: values.google_site_verification || "",
                    site_base_url: values.site_base_url || "",
                    custom_robots_txt: values.custom_robots_txt || "",
                    use_custom_robots: values.use_custom_robots ? "1" : "0",
                    head_scripts_json: JSON.stringify(headScripts),
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
        <form onSubmit={form.handleSubmit(handleSaveSubmit)} className="flex-1 space-y-6">
            <div className="flex items-center justify-between space-y-2">
                <div>
                    <h2 className="text-2xl font-semibold tracking-tight text-[#0b1f1c] sm:text-3xl">Brand & Head Scripts Settings</h2>
                    <p className="mt-1 text-sm text-[#5a736c]">Customize identity, SEO meta, custom head scripts, and robots.txt.</p>
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
                {/* General Branding */}
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
                                placeholder="EmailJachai Pro"
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
                            <p className="text-[10px] text-[#6b857c]">HTTPS direct link to your brand logo image.</p>
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
                            <p className="text-[10px] text-[#6b857c]">HTTPS direct link to your website favicon.</p>
                        </div>
                    </CardContent>
                </Card>

                {/* Contact & Support */}
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
                            <p className="text-[10px] text-[#6b857c]">Home page contact form messages are delivered to this address.</p>
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
                            <Label htmlFor="youtube-url" className="text-sm font-medium">YouTube URL</Label>
                            <Input
                                id="youtube-url"
                                placeholder="https://youtube.com/@yourbrand"
                                className={cn(form.formState.errors.youtube_url && "border-red-500")}
                                {...form.register("youtube_url")}
                            />
                            {form.formState.errors.youtube_url && <p className="text-[10px] text-red-500">{form.formState.errors.youtube_url.message}</p>}
                        </div>
                        <div className="space-y-2">
                            <Label htmlFor="facebook-url" className="text-sm font-medium">Facebook URL</Label>
                            <Input
                                id="facebook-url"
                                placeholder="https://facebook.com/yourbrand"
                                className={cn(form.formState.errors.facebook_url && "border-red-500")}
                                {...form.register("facebook_url")}
                            />
                            {form.formState.errors.facebook_url && <p className="text-[10px] text-red-500">{form.formState.errors.facebook_url.message}</p>}
                        </div>
                    </CardContent>
                </Card>
            </div>

            {/* Custom Head Scripts Manager */}
            <Card className="border-[#0b1f1c]/10 bg-white/90 shadow-none overflow-hidden">
                <CardHeader className="bg-[#f0f4f2]/60 border-b border-[#0b1f1c]/8 flex flex-row items-center justify-between">
                    <div>
                        <CardTitle className="flex items-center gap-2 text-lg font-semibold text-[#0b1f1c]">
                            <Code className="h-5 w-5 text-[#0f5c52]" />
                            Custom Head Scripts (Facebook Pixel, Analytics, Tracking)
                        </CardTitle>
                        <CardDescription className="text-[#5a736c]">
                            Add any custom &lt;script&gt; or &lt;meta&gt; tags to inject into the &lt;head&gt; of all pages automatically.
                        </CardDescription>
                    </div>
                    {!isAddingScript && (
                        <Button
                            type="button"
                            onClick={() => {
                                setIsAddingScript(true)
                                setEditingScriptId(null)
                                setScriptName("")
                                setScriptCode("")
                            }}
                            className="bg-[#0f5c52] hover:bg-[#0b4a42] text-white text-xs h-9"
                        >
                            <Plus className="mr-1.5 h-3.5 w-3.5" />
                            Add Script
                        </Button>
                    )}
                </CardHeader>
                <CardContent className="space-y-6 pt-6">
                    {/* Add/Edit Script Modal / Form Box */}
                    {isAddingScript && (
                        <div className="rounded-xl border border-[#0f5c52]/30 bg-[#f0f4f2]/40 p-5 space-y-4">
                            <div className="flex items-center justify-between">
                                <h4 className="font-semibold text-sm text-[#0b1f1c]">
                                    {editingScriptId ? "Edit Head Script" : "Add New Head Script"}
                                </h4>
                                <Button
                                    type="button"
                                    variant="ghost"
                                    size="sm"
                                    onClick={() => {
                                        setIsAddingScript(false)
                                        setEditingScriptId(null)
                                    }}
                                    className="text-xs text-[#5a736c] hover:text-[#0b1f1c]"
                                >
                                    Cancel
                                </Button>
                            </div>

                            {/* Preset Buttons */}
                            <div className="space-y-1.5">
                                <Label className="text-xs text-[#5a736c] flex items-center gap-1">
                                    <Sparkles className="h-3 w-3 text-[#0f5c52]" /> Quick Presets (Click to fill template):
                                </Label>
                                <div className="flex flex-wrap gap-2">
                                    {PRESETS.map((preset) => (
                                        <button
                                            key={preset.name}
                                            type="button"
                                            onClick={() => applyPreset(preset)}
                                            className="px-2.5 py-1 text-xs rounded-lg border border-[#0f5c52]/20 bg-white text-[#0f5c52] hover:bg-[#0f5c52] hover:text-white transition-colors font-medium"
                                        >
                                            + {preset.name}
                                        </button>
                                    ))}
                                </div>
                            </div>

                            <div className="space-y-2">
                                <Label htmlFor="script-name" className="text-sm font-medium">Script Name / Tag</Label>
                                <Input
                                    id="script-name"
                                    placeholder="e.g. Facebook Pixel, Google Analytics, Hotjar"
                                    value={scriptName}
                                    onChange={(e) => setScriptName(e.target.value)}
                                    className="bg-white"
                                />
                            </div>

                            <div className="space-y-2">
                                <Label htmlFor="script-code" className="text-sm font-medium">
                                    Script Code (Include &lt;script&gt; or &lt;meta&gt; tags)
                                </Label>
                                <Textarea
                                    id="script-code"
                                    rows={6}
                                    placeholder="<script>...your code...</script>"
                                    value={scriptCode}
                                    onChange={(e) => setScriptCode(e.target.value)}
                                    className="font-mono text-xs bg-[#0b1f1c] text-[#7ee787] border-0 focus-visible:ring-1 focus-visible:ring-[#0f5c52]"
                                />
                            </div>

                            <div className="flex justify-end gap-2 pt-2">
                                <Button
                                    type="button"
                                    onClick={handleSaveScript}
                                    className="bg-[#0f5c52] hover:bg-[#0b4a42] text-white text-xs h-9 min-w-[100px]"
                                >
                                    <Check className="mr-1.5 h-3.5 w-3.5" />
                                    {editingScriptId ? "Update Script" : "Add to List"}
                                </Button>
                            </div>
                        </div>
                    )}

                    {/* Scripts List */}
                    {headScripts.length === 0 ? (
                        <div className="text-center py-8 border border-dashed border-gray-200 rounded-xl">
                            <Code className="mx-auto h-8 w-8 text-[#5a736c]/50 mb-2" />
                            <p className="text-sm text-[#5a736c]">No custom head scripts added yet.</p>
                            <p className="text-xs text-[#6b857c] mt-1">Click "Add Script" to inject Facebook Pixel, Google Analytics, or third-party tags.</p>
                        </div>
                    ) : (
                        <div className="space-y-3">
                            {headScripts.map((script) => (
                                <div
                                    key={script.id}
                                    className="flex items-center justify-between p-4 rounded-xl border border-gray-100 bg-gray-50/50 hover:border-[#0f5c52]/20 transition-all"
                                >
                                    <div className="flex items-center gap-3">
                                        <Switch
                                            checked={script.enabled}
                                            onCheckedChange={() => handleToggleScript(script.id)}
                                            className={script.enabled ? "bg-[#0f5c52]" : "bg-gray-300"}
                                        />
                                        <div>
                                            <div className="flex items-center gap-2">
                                                <h5 className="font-semibold text-sm text-[#0b1f1c]">{script.name}</h5>
                                                <span
                                                    className={cn(
                                                        "text-[10px] px-2 py-0.5 rounded-full font-medium",
                                                        script.enabled ? "bg-emerald-100 text-emerald-700" : "bg-gray-200 text-gray-600"
                                                    )}
                                                >
                                                    {script.enabled ? "Active" : "Disabled"}
                                                </span>
                                            </div>
                                            <p className="text-xs font-mono text-gray-500 max-w-md truncate mt-0.5">
                                                {script.code.substring(0, 70)}...
                                            </p>
                                        </div>
                                    </div>

                                    <div className="flex items-center gap-1">
                                        <Button
                                            type="button"
                                            variant="ghost"
                                            size="sm"
                                            onClick={() => handleEditScript(script)}
                                            className="h-8 w-8 p-0 text-gray-600 hover:text-[#0f5c52]"
                                        >
                                            <Edit3 className="h-4 w-4" />
                                        </Button>
                                        <Button
                                            type="button"
                                            variant="ghost"
                                            size="sm"
                                            onClick={() => handleDeleteScript(script.id)}
                                            className="h-8 w-8 p-0 text-gray-600 hover:text-red-600"
                                        >
                                            <Trash2 className="h-4 w-4" />
                                        </Button>
                                    </div>
                                </div>
                            ))}
                        </div>
                    )}
                </CardContent>
            </Card>

            {/* Custom Robots.txt Editor */}
            <Card className="border-[#0b1f1c]/10 bg-white/90 shadow-none overflow-hidden">
                <CardHeader className="bg-[#f0f4f2]/60 border-b border-[#0b1f1c]/8 flex flex-row items-center justify-between">
                    <div>
                        <CardTitle className="flex items-center gap-2 text-lg font-semibold text-[#0b1f1c]">
                            <FileText className="h-5 w-5 text-[#0f5c52]" />
                            robots.txt Editor
                        </CardTitle>
                        <CardDescription className="text-[#5a736c]">
                            Enable custom rules for web crawlers, search engines, and AI bots.
                        </CardDescription>
                    </div>
                    <div className="flex items-center gap-2">
                        <Label htmlFor="use-custom-robots" className="text-xs text-[#5a736c] font-medium cursor-pointer">
                            Use Custom robots.txt
                        </Label>
                        <Switch
                            id="use-custom-robots"
                            checked={form.watch("use_custom_robots")}
                            onCheckedChange={(checked) => form.setValue("use_custom_robots", checked)}
                            className={form.watch("use_custom_robots") ? "bg-[#0f5c52]" : "bg-gray-300"}
                        />
                    </div>
                </CardHeader>
                <CardContent className="space-y-4 pt-6">
                    {form.watch("use_custom_robots") ? (
                        <div className="space-y-2">
                            <Label htmlFor="custom-robots-txt" className="text-sm font-medium">Custom robots.txt Rules</Label>
                            <Textarea
                                id="custom-robots-txt"
                                rows={8}
                                placeholder={`User-agent: *\nAllow: /\nDisallow: /admin/\nDisallow: /dashboard/\n\nSitemap: https://emailjachai.pro/sitemap.xml`}
                                {...form.register("custom_robots_txt")}
                                className="font-mono text-xs bg-[#0b1f1c] text-[#7ee787] border-0 focus-visible:ring-1 focus-visible:ring-[#0f5c52]"
                            />
                            <p className="text-[10px] text-[#6b857c]">
                                Note: These custom rules will override standard default robots.txt crawling instructions.
                            </p>
                        </div>
                    ) : (
                        <div className="p-4 rounded-xl bg-gray-50 border border-gray-200 flex items-start gap-3">
                            <ShieldAlert className="h-5 w-5 text-[#0f5c52] shrink-0 mt-0.5" />
                            <div className="text-xs text-gray-600 leading-relaxed">
                                <p className="font-semibold text-gray-800 mb-0.5">Default System Rules Active</p>
                                Standard SEO rules allow all major search engines to index public landing pages, while blocking access to <code>/admin/</code> and <code>/dashboard/</code>. Turn on "Use Custom robots.txt" switch above to write your own custom rules.
                            </div>
                        </div>
                    )}
                </CardContent>
            </Card>
        </form>
    )
}
