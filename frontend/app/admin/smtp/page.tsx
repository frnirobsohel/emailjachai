export const dynamic = 'force-dynamic';
import { fetchServer } from "@/lib/fetch-server"
import { SmtpClient, SmtpSettings, Template, TemplatesKey, DEFAULT_TEMPLATES, ApiTemplateRow } from "./smtp-client"

export default async function SmtpSettingsPage() {
    let initialSettings: SmtpSettings = {
        host: "",
        port: "587",
        encryption: "tls",
        username: "",
        password: "",
        daily_limit: "5000",
        is_active: true
    };
    let initialTemplates: Record<TemplatesKey, Template> = { ...DEFAULT_TEMPLATES };
    let initialHasStoredPassword = false;
    let initialIsConnectionVerified = false;

    try {
        const [smtpData, tplData] = await Promise.all([
            fetchServer('/admin/smtp/settings'),
            fetchServer('/admin/smtp/templates')
        ]);

        if (smtpData.status === 'success' && smtpData.data) {
            const smtpResponse = smtpData.data as SmtpSettings;
            initialSettings = {
                host: smtpResponse.host || "",
                port: smtpResponse.port || "587",
                encryption: smtpResponse.encryption || "tls",
                username: smtpResponse.username || "",
                password: "",
                daily_limit: smtpResponse.daily_limit || "5000",
                is_active: smtpResponse.is_active ?? true
            };
            initialHasStoredPassword = Boolean(smtpResponse.has_password);
            initialIsConnectionVerified = Boolean(smtpResponse.is_active);
        }

        if (tplData.status === 'success' && tplData.data) {
            const rows = tplData.data as ApiTemplateRow[];
            if (Array.isArray(rows)) {
                for (const row of rows) {
                    const key = row.template_name as TemplatesKey;
                    if (initialTemplates[key]) {
                        initialTemplates[key] = {
                            subject: row.subject || initialTemplates[key].subject,
                            body: row.body || initialTemplates[key].body,
                            is_active: row.is_active ?? true
                        };
                    }
                }
            }
        }
    } catch (e) {
        console.error("Failed to fetch admin smtp settings:", e);
    }

    return (
        <SmtpClient 
            initialSettings={initialSettings} 
            initialTemplates={initialTemplates} 
            initialHasStoredPassword={initialHasStoredPassword} 
            initialIsConnectionVerified={initialIsConnectionVerified} 
        />
    );
}
