"use client"

import { useState, useMemo, useEffect, useRef } from "react"
import { Button } from "@/components/ui/button"
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card"
import { Input } from "@/components/ui/input"
import { Settings, Save, Beaker, FileText, CheckCircle, XCircle, Loader2 } from "lucide-react"
import { Textarea } from "@/components/ui/textarea"
import { SimpleSelect } from "@/components/ui/simple-select"
import { Alert, AlertDescription } from "@/components/ui/alert"
import { Switch } from "@/components/ui/switch"
import { ApiClient } from "@/lib/api-client"
import { useForm } from "react-hook-form"
import { zodResolver } from "@hookform/resolvers/zod"
import * as z from "zod"
import { toast } from "react-hot-toast"
import { cn } from "@/lib/utils"

export const smtpSettingsSchema = z.object({
    host: z.string().optional().or(z.literal("")),
    port: z.string().optional().or(z.literal("")),
    encryption: z.enum(['none', 'ssl', 'tls']).optional(),
    username: z.string().optional().or(z.literal("")),
    password: z.string().optional().or(z.literal("")),
    daily_limit: z.string().optional().or(z.literal("")),
    is_active: z.boolean().optional(),
})

export const templateSchema = z.object({
    subject: z.string().min(1, "Subject is required"),
    body: z.string().min(1, "Body is required"),
    is_active: z.boolean().optional(),
})

export type TemplatesKey = 'register' | 'forgot' | 'buy_credits' | 'job_completed' | 'transaction' | 'credit_assigned' | 'account_banned'

export type SmtpSettings = {
    host: string
    port: string
    encryption: 'none' | 'ssl' | 'tls'
    username: string
    password: string
    has_password?: boolean
    daily_limit: string
    is_active?: boolean
}

export type Template = { subject: string; body: string; is_active?: boolean }
export type ApiTemplateRow = { template_name: string; subject: string; body: string; is_active: boolean }

export const DEFAULT_TEMPLATES: Record<TemplatesKey, Template> = {
    register: {
        subject: 'Welcome to Email Verification SaaS',
        body: 'Hi {{name}},\n\nThanks for registering. Verify your email by clicking this link: {{verification_link}}\n\nRegards,\nTeam',
        is_active: true,
    },
    forgot: {
        subject: 'Password reset instructions',
        body: 'Hi {{name}},\n\nReset your password using this link: {{reset_link}}\n\nRegards,\nTeam',
        is_active: true,
    },
    buy_credits: {
        subject: 'Credit purchase confirmation',
        body: 'Hi {{name}},\n\nWe received your purchase of {{credits}} credits. Order: {{order_id}}\n\nThanks!',
        is_active: true,
    },
    job_completed: {
        subject: 'Your verification job is complete',
        body: 'Hi {{name}},\n\nJob {{job_id}} has completed. Download results here: {{download_link}}\n\nRegards,\nTeam',
        is_active: true,
    },
    transaction: {
        subject: 'Transaction notification',
        body: 'Hi {{name}},\n\nYour transaction {{txn_id}} has been processed. Amount: {{amount}}\n\nRegards,\nTeam',
        is_active: true,
    },
    credit_assigned: {
        subject: 'Credits Assigned',
        body: 'Hi {{name}},\n\nAdmin has assigned {{credits}} credits to your account.\n\nRegards,\nTeam',
        is_active: true,
    },
    account_banned: {
        subject: 'Account Suspended',
        body: 'Hi {{name}},\n\nYour account has been suspended by the administrator.\n\nRegards,\nTeam',
        is_active: true,
    },
}

export function SmtpClient({ 
    initialSettings, 
    initialTemplates, 
    initialHasStoredPassword, 
    initialIsConnectionVerified 
}: { 
    initialSettings: SmtpSettings, 
    initialTemplates: Record<TemplatesKey, Template>,
    initialHasStoredPassword: boolean,
    initialIsConnectionVerified: boolean
}) {
    const [selectedTpl, setSelectedTpl] = useState<TemplatesKey>('register')
    const [templates, setTemplates] = useState<Record<TemplatesKey, Template>>(initialTemplates)
    const [hasStoredPassword, setHasStoredPassword] = useState(initialHasStoredPassword)
    const [isConnectionVerified, setIsConnectionVerified] = useState(initialIsConnectionVerified)
    const isFirstMount = useRef(true)
    const isProgrammaticUpdate = useRef(false)

    const smtpForm = useForm<z.infer<typeof smtpSettingsSchema>>({
        resolver: zodResolver(smtpSettingsSchema),
        defaultValues: {
            host: initialSettings.host || "",
            port: initialSettings.port || "587",
            encryption: initialSettings.encryption || "tls",
            username: initialSettings.username || "",
            password: "",
            daily_limit: initialSettings.daily_limit || "5000",
            is_active: initialSettings.is_active ?? true
        }
    })

    const templateForm = useForm<z.infer<typeof templateSchema>>({
        resolver: zodResolver(templateSchema),
        defaultValues: {
            subject: templates[selectedTpl]?.subject || "",
            body: templates[selectedTpl]?.body || "",
            is_active: templates[selectedTpl]?.is_active ?? true
        }
    })

    const fetchSmtpData = async () => {
        try {
            const [smtpData, tplData] = await Promise.all([
                ApiClient.get('/admin/smtp/settings'),
                ApiClient.get('/admin/smtp/templates')
            ]);
            if (smtpData.status === 'success' && smtpData.data) {
                const smtpResponse = smtpData.data as SmtpSettings;
                isProgrammaticUpdate.current = true;
                smtpForm.reset({
                    host: smtpResponse.host || "",
                    port: smtpResponse.port || "587",
                    encryption: smtpResponse.encryption || "tls",
                    username: smtpResponse.username || "",
                    password: "",
                    daily_limit: smtpResponse.daily_limit || "5000",
                    is_active: smtpResponse.is_active ?? true
                });
                setHasStoredPassword(Boolean(smtpResponse.has_password));
                setIsConnectionVerified(Boolean(smtpResponse.is_active));
                setTimeout(() => { isProgrammaticUpdate.current = false; }, 100);
            }
            if (tplData.status === 'success' && tplData.data) {
                const rows = tplData.data as ApiTemplateRow[];
                if (Array.isArray(rows)) {
                    const nextTemplates = { ...DEFAULT_TEMPLATES };
                    for (const row of rows) {
                        const key = row.template_name as TemplatesKey;
                        if (nextTemplates[key]) {
                            nextTemplates[key] = {
                                subject: row.subject || nextTemplates[key].subject,
                                body: row.body || nextTemplates[key].body,
                                is_active: row.is_active ?? true
                            };
                        }
                    }
                    setTemplates(nextTemplates);
                }
            }
        } catch (error) {
            console.error("Failed to fetch SMTP settings on client mount:", error);
        }
    };

    useEffect(() => {
        if (isFirstMount.current) {
            isFirstMount.current = false;
            return;
        }
        fetchSmtpData();
    }, []);

    useEffect(() => {
        templateForm.reset({
            subject: templates[selectedTpl]?.subject || "",
            body: templates[selectedTpl]?.body || "",
            is_active: templates[selectedTpl]?.is_active ?? true
        })
    }, [selectedTpl, templates, templateForm])

    // Clean up forms when fields change
    useEffect(() => {
        const subscription = smtpForm.watch((value, { name }) => {
            if (isProgrammaticUpdate.current) return;
            if (name && ['host', 'port', 'encryption', 'username', 'password'].includes(name)) {
                if (name === 'password' && (value.password === "" || !value.password) && hasStoredPassword) {
                    return;
                }
                setIsConnectionVerified(false);
                smtpForm.setValue('is_active', false);
            }
        });
        return () => subscription.unsubscribe();
    }, [smtpForm.watch, hasStoredPassword]);

    const handleSaveSettings = async (values: z.infer<typeof smtpSettingsSchema>) => {
        try {
            const payload = { ...values };
            if (!(payload.host && payload.host.trim() !== '' && payload.username && payload.username.trim() !== '' && (payload.password?.trim() !== '' || hasStoredPassword))) {
                payload.is_active = false;
                smtpForm.setValue('is_active', false);
            }
            const result = await ApiClient.post('/admin/smtp/settings', payload);

            if (result.status === 'success') {
                isProgrammaticUpdate.current = true;
                setHasStoredPassword(hasStoredPassword || (payload.password?.trim() !== ""));
                smtpForm.setValue('password', "");
                setTimeout(() => { isProgrammaticUpdate.current = false; }, 100);
                toast.success("SMTP settings saved successfully.");
            } else {
                toast.error(result.message || "Failed to save settings.");
            }
        } catch (error: any) {
            toast.error(error.message || "Server error occurred.");
        }
    }

    const handleTestConnection = async () => {
        const toastId = toast.loading("Testing SMTP connection...");
        try {
            const values = smtpForm.getValues();
            const result = await ApiClient.post('/admin/smtp/test', values);
            if (result.status === 'success') {
                setIsConnectionVerified(true);
                smtpForm.setValue('is_active', true);
                toast.success("Connection successful.", { id: toastId });
            } else {
                toast.error(result.message || "Connection failed.", { id: toastId });
            }
        } catch (error: any) {
            toast.error(error.message || "Server error occurred.", { id: toastId });
        }
    }

    const handleSaveTemplate = async (values: z.infer<typeof templateSchema>) => {
        try {
            const result = await ApiClient.post('/admin/smtp/templates', {
                template_name: selectedTpl,
                subject: values.subject,
                body: values.body,
                is_active: values.is_active ?? true
            });

            if (result.status === 'success') {
                setTemplates(prev => ({ ...prev, [selectedTpl]: { subject: values.subject, body: values.body, is_active: values.is_active } }));
                toast.success("Template saved successfully.");
            } else {
                toast.error(result.message || "Failed to save template.");
            }
        } catch (error: any) {
            toast.error(error.message || "Server error occurred.");
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

    const hasValidCredentials = (smtpForm.watch('host') || "").trim() !== '' && (smtpForm.watch('username') || "").trim() !== '' && ((smtpForm.watch('password') || "").trim() !== '' || hasStoredPassword);
    const isGlobalSmtpActive = smtpForm.watch('is_active') && hasValidCredentials;

    return (
        <div className="flex-1 space-y-6">
            <div className="flex items-center justify-between space-y-2">
                <div>
                    <h2 className="text-3xl font-bold tracking-tight">SMTP Settings</h2>
                    <p className="text-muted-foreground">Configure email delivery and edit templates for user and system events.</p>
                </div>
            </div>



            <div className="grid gap-6 lg:grid-cols-2">
                {/* SMTP Settings */}
                <Card className="border-indigo-100 shadow-sm overflow-hidden">
                    <CardHeader className="bg-slate-50/50 border-b border-indigo-50/50">
                        <CardTitle className="flex items-center justify-between gap-2">
                            <div className="flex items-center gap-2">
                                <div className="p-2 bg-indigo-50 rounded-full border border-indigo-100">
                                    <Settings className="h-5 w-5 text-indigo-600" />
                                </div>
                                SMTP Configuration
                            </div>
                            <div className="flex items-center gap-2 text-sm font-normal text-muted-foreground">
                                <span>{smtpForm.watch('is_active') && hasValidCredentials ? 'Active' : 'Disabled'}</span>
                                <Switch
                                    checked={Boolean(smtpForm.watch('is_active') && hasValidCredentials)}
                                    onCheckedChange={(checked) => smtpForm.setValue('is_active', checked)}
                                    disabled={!isConnectionVerified || !hasValidCredentials}
                                />
                            </div>
                        </CardTitle>
                        <CardDescription>Set your mailer credentials and sender identity</CardDescription>
                    </CardHeader>
                    <form onSubmit={smtpForm.handleSubmit(handleSaveSettings)}>
                    <CardContent className="space-y-4 pt-6">
                        <div className="grid gap-4 sm:grid-cols-2">
                            <div className="space-y-2">
                                <label htmlFor="daily_limit" className="text-sm font-medium">Daily Send Limit</label>
                                <Input id="daily_limit" type="number" {...smtpForm.register("daily_limit")} />
                            </div>
                            <div className="space-y-2">
                                <label htmlFor="host" className="text-sm font-medium">Host</label>
                                <Input id="host" {...smtpForm.register("host")} />
                            </div>
                            <div className="space-y-2">
                                <label htmlFor="port" className="text-sm font-medium">Port</label>
                                <Input id="port" {...smtpForm.register("port")} />
                            </div>
                            <div className="space-y-2">
                                <label className="text-sm font-medium">Encryption</label>
                                <SimpleSelect
                                    value={smtpForm.watch('encryption')}
                                    onChange={(e) => smtpForm.setValue('encryption', e.target.value as any)}
                                    options={[
                                        { label: 'None', value: 'none' },
                                        { label: 'SSL', value: 'ssl' },
                                        { label: 'TLS', value: 'tls' }
                                    ]}
                                />
                            </div>
                            <div className="space-y-2">
                                <label htmlFor="username" className="text-sm font-medium">Username</label>
                                <Input id="username" autoComplete="off" {...smtpForm.register("username")} />
                            </div>
                            <div className="space-y-2">
                                <label htmlFor="password" className="text-sm font-medium">Password</label>
                                <Input id="password" type="password" autoComplete="new-password" {...smtpForm.register("password")} />
                                <p className="text-xs text-slate-500">
                                    {hasStoredPassword ? 'Leave blank to keep the existing SMTP password.' : 'Enter the SMTP password to store it securely.'}
                                </p>
                            </div>
                        </div>
                        <div className="pt-4 flex items-center gap-2">
                            <Button
                                type="submit"
                                disabled={smtpForm.formState.isSubmitting}
                                className="bg-[#0f172b] hover:bg-[#0f172b]/90 text-white shadow-sm min-w-[140px]"
                            >
                                {smtpForm.formState.isSubmitting ? <Loader2 className="mr-2 h-4 w-4 animate-spin" /> : <Save className="mr-2 h-4 w-4" />}
                                {smtpForm.formState.isSubmitting ? 'Saving...' : 'Save Settings'}
                            </Button>
                            <Button
                                type="button"
                                variant="outline"
                                onClick={handleTestConnection}
                                disabled={smtpForm.formState.isSubmitting}
                                className="text-slate-700 hover:bg-slate-50 border-slate-200 min-w-[150px]"
                            >
                                <Settings className="mr-2 h-4 w-4" /> Test Connection
                            </Button>
                        </div>
                    </CardContent>
                    </form>
                </Card>

                {/* Templates */}
                <Card className="border-indigo-100 shadow-sm overflow-hidden">
                    <CardHeader className="bg-slate-50/50 border-b border-indigo-50/50">
                        <CardTitle className="flex items-center justify-between gap-2">
                            <div className="flex items-center gap-2">
                                <div className="p-2 bg-indigo-50 rounded-full border border-indigo-100">
                                    <FileText className="h-5 w-5 text-indigo-600" />
                                </div>
                                Templates
                            </div>
                            <div className="flex items-center gap-2 text-sm font-normal text-muted-foreground">
                                <span>{templateForm.watch('is_active') !== false ? 'Active' : 'Disabled'}</span>
                                <Switch
                                    checked={Boolean(templateForm.watch('is_active') !== false)}
                                    onCheckedChange={(checked) => {
                                        templateForm.setValue('is_active', checked);
                                        setTemplates(prev => ({
                                            ...prev,
                                            [selectedTpl]: {
                                                ...prev[selectedTpl],
                                                is_active: checked
                                            }
                                        }));
                                    }}
                                />
                            </div>
                        </CardTitle>
                        <CardDescription>
                            Use placeholders like {'{{name}}'}, {'{{verification_link}}'}, {'{{credits}}'}.
                        </CardDescription>
                    </CardHeader>
                    <form onSubmit={templateForm.handleSubmit(handleSaveTemplate)}>
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
                                        className={cn(templateForm.formState.errors.subject && "border-red-500")}
                                        {...templateForm.register("subject")}
                                    />
                                    {templateForm.formState.errors.subject && <p className="text-[10px] text-red-500">{templateForm.formState.errors.subject.message}</p>}
                                </div>
                            </div>
                            <div className="space-y-2">
                                <label className="text-sm font-medium">Body</label>
                                <Textarea
                                    rows={12}
                                    className={cn("font-mono text-xs", templateForm.formState.errors.body && "border-red-500")}
                                    {...templateForm.register("body")}
                                />
                                {templateForm.formState.errors.body && <p className="text-[10px] text-red-500">{templateForm.formState.errors.body.message}</p>}
                            </div>
                            <div className="flex gap-2 pt-2">
                                <Button
                                    type="submit"
                                    disabled={templateForm.formState.isSubmitting}
                                    className="bg-[#0f172b] hover:bg-[#0f172b]/90 text-white min-w-[140px]"
                                >
                                    {templateForm.formState.isSubmitting ? <Loader2 className="mr-2 h-4 w-4 animate-spin" /> : <Save className="mr-2 h-4 w-4" />}
                                    {templateForm.formState.isSubmitting ? "Saving..." : "Save Template"}
                                </Button>
                            </div>
                        </div>
                    </CardContent>
                    </form>
                </Card>
            </div>
        </div >
    )
}
