"use client"

import { useState, useEffect } from "react"
import { Button } from "@/components/ui/button"
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card"
import { Input } from "@/components/ui/input"
import { Palette, Globe, Mail, Share2, Save, CheckCircle, XCircle, Loader2 } from "lucide-react"
import { Label } from "@/components/ui/label"
import { Alert, AlertDescription } from "@/components/ui/alert"
import { ApiClient } from "@/lib/api-client"

export default function BrandBuildPage() {
    const [settings, setSettings] = useState<Record<string, string>>({})
    const [isLoading, setIsLoading] = useState(true)
    const [isSaving, setIsSaving] = useState(false)
    const [alert, setAlert] = useState<{ type: 'success' | 'error'; text: string } | null>(null)

    const fetchSettings = async () => {
        try {
            const result = await ApiClient.get('/admin/settings');

            if (result.status === 'success') {
                const payload = result.data;
                if (Array.isArray(payload)) {
                    const mapped: Record<string, string> = {};
                    for (const item of payload) {
                        const row = item as { setting_key?: string; setting_value?: string };
                        if (row.setting_key) mapped[row.setting_key] = row.setting_value ?? "";
                    }
                    setSettings(mapped);
                } else if (payload && typeof payload === "object") {
                    setSettings(payload as Record<string, string>);
                }
            }
        } catch (error) {
            console.error("Failed to fetch settings:", error);
        } finally {
            setIsLoading(false);
        }
    }

    useEffect(() => {
        fetchSettings();
    }, []);

    const handleSave = async () => {
        setIsSaving(true);
        try {
            const result = await ApiClient.post('/admin/settings/update', { settings });

            if (result.status === 'success') {
                setAlert({ type: 'success', text: "Brand settings updated successfully." });
            } else {
                setAlert({ type: 'error', text: result.message || "Failed to save settings." });
            }
        } catch (error) {
            setAlert({ type: 'error', text: "Server error occurred." });
        } finally {
            setIsSaving(false);
            setTimeout(() => setAlert(null), 3000);
        }
    }

    const updateValue = (key: string, value: string) => {
        setSettings(prev => ({ ...prev, [key]: value }));
    }

    return (
        <div className="flex-1 space-y-4">
            <div className="flex items-center justify-between space-y-2">
                <div>
                    <h2 className="text-3xl font-bold tracking-tight">Brand Settings</h2>
                    <p className="text-slate-500 text-sm">Customize the identity and look of your platform.</p>
                </div>
                <Button
                    onClick={handleSave}
                    disabled={isSaving || isLoading}
                    className="bg-[#0f172b] hover:bg-[#0f172b]/90 text-white min-w-[140px]"
                >
                    {isSaving ? <Loader2 className="mr-2 h-4 w-4 animate-spin" /> : <Save className="mr-2 h-4 w-4" />}
                    {isSaving ? 'Saving...' : 'Save Changes'}
                </Button>
            </div>

            {alert && (
                <Alert className={alert.type === 'success' ? 'bg-emerald-50 border-emerald-200 text-emerald-800' : 'bg-red-50 border-red-200 text-red-800'}>
                    {alert.type === 'success' ? <CheckCircle className="h-4 w-4" /> : <XCircle className="h-4 w-4" />}
                    <AlertDescription className="ml-2 font-medium">{alert.text}</AlertDescription>
                </Alert>
            )}

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
                                name="siteTitle"
                                placeholder="EmailVerifier Pro"
                                value={settings.site_title || ""}
                                onChange={(e) => updateValue('site_title', e.target.value)}
                            />
                        </div>
                        <div className="space-y-2">
                            <Label htmlFor="site-tagline" className="text-sm font-medium">Tagline / Motto</Label>
                            <Input
                                id="site-tagline"
                                name="siteTagline"
                                placeholder="Verify with confidence"
                                value={settings.site_tagline || ""}
                                onChange={(e) => updateValue('site_tagline', e.target.value)}
                            />
                        </div>
                        <div className="space-y-2">
                            <Label htmlFor="logo-url" className="text-sm font-medium">Logo URL</Label>
                            <div className="flex items-center gap-4">
                                <Input
                                    id="logo-url"
                                    name="logoUrl"
                                    placeholder="https://example.com/logo.png"
                                    value={settings.logo_url || ""}
                                    onChange={(e) => updateValue('logo_url', e.target.value)}
                                />
                            </div>
                            <p className="text-[10px] text-slate-400">Direct link to your brand logo image.</p>
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
                                    style={{ backgroundColor: settings.primary_color || '#0F172B' }}
                                ></div>
                                <Input
                                    id="primary-color"
                                    name="primaryColor"
                                    className="w-32 font-mono text-center uppercase"
                                    value={settings.primary_color || ""}
                                    onChange={(e) => updateValue('primary_color', e.target.value)}
                                    placeholder="#0F172B"
                                />
                                <p className="text-xs text-slate-400">HEX color code</p>
                            </div>
                        </div>
                        <div className="space-y-2 pt-2">
                            <label className="text-sm font-medium">Navigation Style</label>
                            <div className="grid grid-cols-2 gap-3">
                                <button
                                    onClick={() => updateValue('nav_style', 'dark')}
                                    className={`border rounded-md p-3 transition-all ${settings.nav_style === 'dark' ? "bg-slate-100 border-indigo-200 ring-1 ring-indigo-500" : "hover:bg-slate-50"}`}
                                >
                                    <p className="text-xs font-bold text-center">Dark Sidebar</p>
                                </button>
                                <button
                                    onClick={() => updateValue('nav_style', 'light')}
                                    className={`border rounded-md p-3 transition-all ${settings.nav_style === 'light' ? "bg-slate-100 border-indigo-200 ring-1 ring-indigo-500" : "hover:bg-slate-50"}`}
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
                                name="supportEmail"
                                placeholder="support@yourdomain.com"
                                value={settings.support_email || ""}
                                onChange={(e) => updateValue('support_email', e.target.value)}
                            />
                        </div>
                        <div className="space-y-2">
                            <Label htmlFor="help-center-url" className="text-sm font-medium">Help Center URL</Label>
                            <Input
                                id="help-center-url"
                                name="helpCenterUrl"
                                placeholder="https://docs.yourdomain.com"
                                value={settings.help_center_url || ""}
                                onChange={(e) => updateValue('help_center_url', e.target.value)}
                            />
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
                                name="twitterUrl"
                                placeholder="https://twitter.com/yourhandle"
                                value={settings.twitter_url || ""}
                                onChange={(e) => updateValue('twitter_url', e.target.value)}
                            />
                        </div>
                        <div className="space-y-2">
                            <Label htmlFor="linkedin-url" className="text-sm font-medium">LinkedIn URL</Label>
                            <Input
                                id="linkedin-url"
                                name="linkedinUrl"
                                placeholder="https://linkedin.com/company/yourbrand"
                                value={settings.linkedin_url || ""}
                                onChange={(e) => updateValue('linkedin_url', e.target.value)}
                            />
                        </div>
                        <div className="space-y-2">
                            <Label htmlFor="github-url" className="text-sm font-medium">GitHub URL</Label>
                            <Input
                                id="github-url"
                                name="githubUrl"
                                placeholder="https://github.com/yourbrand"
                                value={settings.github_url || ""}
                                onChange={(e) => updateValue('github_url', e.target.value)}
                            />
                        </div>
                    </CardContent>
                </Card>
            </div>
        </div>
    )
}
