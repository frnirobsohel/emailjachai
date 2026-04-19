"use client"

import { useState, useMemo, useEffect } from "react"
import { Button } from "@/components/ui/button"
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card"
import { Input } from "@/components/ui/input"
import { Settings, Save, Beaker, FileText, CheckCircle, XCircle, Loader2 } from "lucide-react"
import { Textarea } from "@/components/ui/textarea"
import { SimpleSelect } from "@/components/ui/simple-select"
import { Alert, AlertDescription } from "@/components/ui/alert"
import { ApiClient } from "@/lib/api-client"

type TemplatesKey = 'register' | 'forgot' | 'buy_credits' | 'job_completed' | 'transaction' | 'credit_assigned' | 'account_banned'

type SmtpSettings = {
    host: string
    port: string
    encryption: 'none' | 'ssl' | 'tls'
    username: string
    password: string
    has_password?: boolean
    daily_limit: string
}

type Template = { subject: string; body: string }
type ApiTemplateRow = { template_name: string; subject: string; body: string }

const DEFAULT_TEMPLATES: Record<TemplatesKey, Template> = {
    register: {
        subject: 'Welcome to Email Verification SaaS',
        body: 'Hi {{name}},\n\nThanks for registering. Verify your email by clicking this link: {{verification_link}}\n\nRegards,\nTeam',
    },
    forgot: {
        subject: 'Password reset instructions',
        body: 'Hi {{name}},\n\nReset your password using this link: {{reset_link}}\n\nRegards,\nTeam',
    },
    buy_credits: {
        subject: 'Credit purchase confirmation',
        body: 'Hi {{name}},\n\nWe received your purchase of {{credits}} credits. Order: {{order_id}}\n\nThanks!',
    },
    job_completed: {
        subject: 'Your verification job is complete',
        body: 'Hi {{name}},\n\nJob {{job_id}} has completed. Download results here: {{download_link}}\n\nRegards,\nTeam',
    },
    transaction: {
        subject: 'Transaction notification',
        body: 'Hi {{name}},\n\nYour transaction {{txn_id}} has been processed. Amount: {{amount}}\n\nRegards,\nTeam',
    },
    credit_assigned: {
        subject: 'Credits Assigned',
        body: 'Hi {{name}},\n\nAdmin has assigned {{credits}} credits to your account.\n\nRegards,\nTeam',
    },
    account_banned: {
        subject: 'Account Suspended',
        body: 'Hi {{name}},\n\nYour account has been suspended by the administrator.\n\nRegards,\nTeam',
    },
}

export default function SmtpSettingsPage() {
    const [settings, setSettings] = useState<SmtpSettings>({
        host: "",
        port: "587",
        encryption: "tls",
        username: "",
        password: "",
        daily_limit: "5000"
    })

    const [selectedTpl, setSelectedTpl] = useState<TemplatesKey>('register')
    const [templates, setTemplates] = useState<Record<TemplatesKey, Template>>(DEFAULT_TEMPLATES)
    const [alert, setAlert] = useState<{ type: 'success' | 'error' | 'info'; text: string } | null>(null)
    const [isFetching, setIsFetching] = useState(false)
    const [isSavingSettings, setIsSavingSettings] = useState(false)
    const [isSavingTemplate, setIsSavingTemplate] = useState(false)
    const [hasStoredPassword, setHasStoredPassword] = useState(false)

    const fetchData = async () => {
        setIsFetching(true);
        try {
            // Fetch SMTP Settings
            const smtpData = await ApiClient.get('/admin/smtp/settings');
            if (smtpData.status === 'success' && smtpData.data) {
                const smtpResponse = smtpData.data as SmtpSettings;
                setSettings({
                    host: smtpResponse.host || "",
                    port: smtpResponse.port || "587",
                    encryption: smtpResponse.encryption || "tls",
                    username: smtpResponse.username || "",
                    password: "",
                    daily_limit: smtpResponse.daily_limit || "5000"
                });
                setHasStoredPassword(Boolean(smtpResponse.has_password));
            }

            // Fetch Templates
            const tplData = await ApiClient.get('/admin/smtp/templates');
            if (tplData.status === 'success' && tplData.data) {
                const rows = tplData.data as ApiTemplateRow[];
                if (Array.isArray(rows)) {
                    const mapped = { ...DEFAULT_TEMPLATES };
                    for (const row of rows) {
                        const key = row.template_name as TemplatesKey;
                        if (mapped[key]) {
                            mapped[key] = {
                                subject: row.subject || mapped[key].subject,
                                body: row.body || mapped[key].body
                            };
                        }
                    }
                    setTemplates(mapped);
                }
            }
        } catch (error) {
            console.error("Failed to fetch data:", error);
        } finally {
            setIsFetching(false);
        }
    }

    useEffect(() => {
        fetchData();
    }, []);

    const currentTemplate = useMemo(() => templates[selectedTpl] || { subject: "", body: "" }, [templates, selectedTpl])

    function onChange<K extends keyof SmtpSettings>(key: K, value: SmtpSettings[K]) {
        setSettings(prev => ({ ...prev, [key]: value }))
    }

    const handleSaveSettings = async () => {
        setIsSavingSettings(true);
        try {
            const result = await ApiClient.post('/admin/smtp/settings', settings);

            if (result.status === 'success') {
                setHasStoredPassword(hasStoredPassword || settings.password.trim() !== "");
                setSettings(prev => ({ ...prev, password: "" }));
                setAlert({ type: 'success', text: "SMTP settings saved successfully." });
            } else {
                setAlert({ type: 'error', text: result.message || "Failed to save settings." });
            }
        } catch (error) {
            setAlert({ type: 'error', text: "Server error occurred." });
        } finally {
            setIsSavingSettings(false);
            setTimeout(() => setAlert(null), 3000);
        }
    }

    const handleTestConnection = () => {
        setAlert({ type: 'info', text: "Testing SMTP connection..." })
        setTimeout(() => {
            setAlert({ type: 'success', text: "Connection successful (simulated)." })
            setTimeout(() => setAlert(null), 3000)
        }, 1500)
    }

    const handleSaveTemplate = async () => {
        setIsSavingTemplate(true);
        try {
            const result = await ApiClient.post('/admin/smtp/templates', {
                template_name: selectedTpl, // Use template_name as per DB schema, though backend handles both
                subject: templates[selectedTpl].subject,
                body: templates[selectedTpl].body
            });

            if (result.status === 'success') {
                setAlert({ type: 'success', text: "Template saved successfully." });
            } else {
                setAlert({ type: 'error', text: result.message || "Failed to save template." });
            }
        } catch (error) {
            setAlert({ type: 'error', text: "Server error occurred." });
        } finally {
            setIsSavingTemplate(false);
            setTimeout(() => setAlert(null), 3000);
        }
    }

    const eventLabels: Record<TemplatesKey, string> = {
        register: 'User Registration',
        forgot: 'Forgot Password',
        buy_credits: 'Credit Purchase',
        job_completed: 'Job Completed',
        transaction: 'Transaction Notification',
        credit_assigned: 'Admin Assigned Credits',
        account_banned: 'Account Banned/Suspended'
    }

    return (
        <div className="flex-1 space-y-6">
            <div className="flex items-center justify-between space-y-2">
                <div>
                    <h2 className="text-3xl font-bold tracking-tight">SMTP Settings</h2>
                    <p className="text-muted-foreground">Configure email delivery and edit templates for user and system events.</p>
                </div>
            </div>

            {alert && (
                <Alert variant={alert.type === 'error' ? 'destructive' : 'default'} className={alert.type === 'success' ? 'bg-emerald-50 border-emerald-200 text-emerald-800' : ''}>
                    {alert.type === 'success' && <CheckCircle className="h-4 w-4" />}
                    {alert.type === 'error' && <XCircle className="h-4 w-4" />}
                    {alert.type === 'info' && <Beaker className="h-4 w-4" />}
                    <AlertDescription className="ml-2">{alert.text}</AlertDescription>
                </Alert>
            )}



            <div className="grid gap-6 lg:grid-cols-2">
                {/* SMTP Settings */}
                <Card className="border-indigo-100 shadow-sm overflow-hidden">
                    <CardHeader className="bg-slate-50/50 border-b border-indigo-50/50">
                        <CardTitle className="flex items-center gap-2">
                            <div className="p-2 bg-indigo-50 rounded-full border border-indigo-100">
                                <Settings className="h-5 w-5 text-indigo-600" />
                            </div>
                            SMTP Configuration
                        </CardTitle>
                        <CardDescription>Set your mailer credentials and sender identity</CardDescription>
                    </CardHeader>
                    <CardContent className="space-y-4 pt-6">
                        <div className="grid gap-4 sm:grid-cols-2">
                            <div className="space-y-2">
                                <label htmlFor="daily_limit" className="text-sm font-medium">Daily Send Limit</label>
                                <Input id="daily_limit" name="daily_limit" type="number" value={settings.daily_limit} onChange={(e) => onChange('daily_limit', e.target.value)} />
                            </div>
                            <div className="space-y-2">
                                <label htmlFor="host" className="text-sm font-medium">Host</label>
                                <Input id="host" name="host" value={settings.host} onChange={(e) => onChange('host', e.target.value)} />
                            </div>
                            <div className="space-y-2">
                                <label htmlFor="port" className="text-sm font-medium">Port</label>
                                <Input id="port" name="port" value={settings.port} onChange={(e) => onChange('port', e.target.value)} />
                            </div>
                            <div className="space-y-2">
                                <label className="text-sm font-medium">Encryption</label>
                                <SimpleSelect
                                    value={settings.encryption}
                                    onChange={(e) => onChange('encryption', e.target.value as SmtpSettings['encryption'])}
                                    options={[
                                        { label: 'None', value: 'none' },
                                        { label: 'SSL', value: 'ssl' },
                                        { label: 'TLS', value: 'tls' }
                                    ]}
                                />
                            </div>
                            <div className="space-y-2">
                                <label htmlFor="username" className="text-sm font-medium">Username</label>
                                <Input id="username" name="username" value={settings.username} autoComplete="off" onChange={(e) => onChange('username', e.target.value)} />
                            </div>
                            <div className="space-y-2">
                                <label htmlFor="password" className="text-sm font-medium">Password</label>
                                <Input id="password" name="password" type="password" value={settings.password} onChange={(e) => onChange('password', e.target.value)} autoComplete="new-password" />
                                <p className="text-xs text-slate-500">
                                    {hasStoredPassword ? 'Leave blank to keep the existing SMTP password.' : 'Enter the SMTP password to store it securely.'}
                                </p>
                            </div>
                        </div>
                        <div className="pt-4 flex items-center gap-2">
                            <Button
                                onClick={handleSaveSettings}
                                disabled={isFetching || isSavingSettings}
                                className="bg-[#0f172b] hover:bg-[#0f172b]/90 text-white shadow-sm min-w-[140px]"
                            >
                                {isSavingSettings ? <Loader2 className="mr-2 h-4 w-4 animate-spin" /> : <Save className="mr-2 h-4 w-4" />}
                                {isSavingSettings ? 'Saving...' : 'Save Settings'}
                            </Button>
                            <Button
                                variant="outline"
                                onClick={handleTestConnection}
                                disabled={isSavingSettings}
                                className="text-slate-700 hover:bg-slate-50 border-slate-200 min-w-[150px]"
                            >
                                <Settings className="mr-2 h-4 w-4" /> Test Connection
                            </Button>
                        </div>
                    </CardContent>
                </Card>

                {/* Templates */}
                <Card className="border-indigo-100 shadow-sm overflow-hidden">
                    <CardHeader className="bg-slate-50/50 border-b border-indigo-50/50">
                        <CardTitle className="flex items-center gap-2">
                            <div className="p-2 bg-indigo-50 rounded-full border border-indigo-100">
                                <FileText className="h-5 w-5 text-indigo-600" />
                            </div>
                            Templates
                        </CardTitle>
                        <CardDescription>
                            Use placeholders like {'{{name}}'}, {'{{verification_link}}'}, {'{{credits}}'}.
                        </CardDescription>
                    </CardHeader>
                    <CardContent className="space-y-4 pt-6">
                        <div className="grid gap-4">
                            <div className="grid md:grid-cols-[1fr_2fr] gap-4">
                                <div className="space-y-2">
                                    <label className="text-sm font-medium">Select Template</label>
                                    <SimpleSelect
                                        value={selectedTpl}
                                        onChange={(e) => setSelectedTpl(e.target.value as TemplatesKey)}
                                        options={(Object.keys(DEFAULT_TEMPLATES) as TemplatesKey[]).map(key => ({
                                            label: eventLabels[key],
                                            value: key
                                        }))}
                                    />
                                </div>
                                <div className="space-y-2">
                                    <label className="text-sm font-medium">Subject</label>
                                    <Input
                                        value={currentTemplate.subject}
                                        onChange={(e) => setTemplates(prev => ({ ...prev, [selectedTpl]: { ...prev[selectedTpl], subject: e.target.value } }))}
                                    />
                                </div>
                            </div>
                            <div className="space-y-2">
                                <label className="text-sm font-medium">Body</label>
                                <Textarea
                                    rows={12}
                                    value={currentTemplate.body}
                                    onChange={(e) => setTemplates(prev => ({ ...prev, [selectedTpl]: { ...prev[selectedTpl], body: e.target.value } }))}
                                    className="font-mono text-xs"
                                />
                            </div>
                            <div className="flex gap-2 pt-2">
                                <Button
                                    onClick={handleSaveTemplate}
                                    disabled={isSavingTemplate}
                                    className="bg-[#0f172b] hover:bg-[#0f172b]/90 text-white min-w-[140px]"
                                >
                                    {isSavingTemplate ? <Loader2 className="mr-2 h-4 w-4 animate-spin" /> : <Save className="mr-2 h-4 w-4" />}
                                    {isSavingTemplate ? "Saving..." : "Save Template"}
                                </Button>
                            </div>
                        </div>
                    </CardContent>
                </Card>
            </div>
        </div >
    )
}
