"use client"

import { useState, useEffect } from "react"
import { useRouter } from "next/navigation"
import { Card, CardContent, CardDescription, CardHeader, CardTitle, CardFooter } from "@/components/common/card"
import { Input } from "@/components/common/input"
import { Button } from "@/components/common/button"
import { Label } from "@/components/common/label"
import { Avatar, AvatarFallback, AvatarImage } from "@/components/common/avatar"
import { ApiClient } from "@/lib/api-client"
import { User, Lock, Save, ShieldCheck, AlertCircle, Loader2 } from "lucide-react"

export default function ProfilePage() {
    const router = useRouter()
    const [isLoading, setIsLoading] = useState(true)
    const [isSaving, setIsSaving] = useState(false)
    const [user, setUser] = useState<{ id: number; name: string; email: string; role: string } | null>(null)
    const [message, setMessage] = useState<{ type: 'success' | 'error', text: string } | null>(null)

    // Form states
    const [name, setName] = useState("")
    const [currentPassword, setCurrentPassword] = useState("")
    const [newPassword, setNewPassword] = useState("")
    const [confirmPassword, setConfirmPassword] = useState("")

    useEffect(() => {
        const fetchProfile = async () => {
            try {
                const result = await ApiClient.get<any>('/auth/me');
                if (result.status === 'success' && result.data) {
                    const profile = result.data.user || result.data;
                    setUser(profile);
                    setName(profile.name);
                }
            } catch (error) {
                console.error("Failed to fetch profile:", error);
            } finally {
                setIsLoading(false);
            }
        };
        fetchProfile();
    }, []);

    const handleUpdateName = async (e: React.FormEvent) => {
        e.preventDefault();
        if (!name.trim()) return;

        setIsSaving(true);
        setMessage(null);

        try {
            const result = await ApiClient.post('/auth/profile/update', { name });
            if (result.status === 'success') {
                setMessage({ type: 'success', text: "Profile name updated successfully!" });
                // Refresh sidebar user info
                if (typeof window !== 'undefined') {
                    const cachedUser = localStorage.getItem('sidebar_user');
                    if (cachedUser) {
                        const parsed = JSON.parse(cachedUser);
                        parsed.name = name;
                        localStorage.setItem('sidebar_user', JSON.stringify(parsed));
                    }
                }
            } else {
                setMessage({ type: 'error', text: result.message || "Failed to update profile" });
            }
        } catch (error: any) {
            setMessage({ type: 'error', text: error.message || "An unexpected error occurred" });
        } finally {
            setIsSaving(false);
            setTimeout(() => setMessage(null), 5000);
        }
    };

    const handleChangePassword = async (e: React.FormEvent) => {
        e.preventDefault();
        setMessage(null);

        if (!currentPassword || !newPassword || !confirmPassword) {
            setMessage({ type: 'error', text: "Please fill all password fields" });
            return;
        }

        if (newPassword !== confirmPassword) {
            setMessage({ type: 'error', text: "New passwords do not match" });
            return;
        }

        if (newPassword.length < 8) {
            setMessage({ type: 'error', text: "New password must be at least 8 characters" });
            return;
        }

        setIsSaving(true);
        try {
            const result = await ApiClient.post('/auth/profile/update', {
                current_password: currentPassword,
                new_password: newPassword
            });

            if (result.status === 'success') {
                setMessage({ type: 'success', text: "Password changed successfully!" });
                setCurrentPassword("");
                setNewPassword("");
                setConfirmPassword("");
            } else {
                setMessage({ type: 'error', text: result.message || "Failed to change password" });
            }
        } catch (error: any) {
            setMessage({ type: 'error', text: error.message || "An unexpected error occurred" });
        } finally {
            setIsSaving(false);
            setTimeout(() => setMessage(null), 5000);
        }
    };

    if (isLoading) {
        return <div className="flex items-center justify-center min-h-[400px]">Loading profile...</div>;
    }

    return (
        <div className="flex-1 space-y-4">
            <div className="flex items-center justify-between space-y-2">
                <div>
                    <h2 className="text-3xl font-bold tracking-tight">Profile Settings</h2>
                    <p className="text-slate-500 text-sm">Manage your account information and security preferences.</p>
                </div>
            </div>

            {message && (
                <div className={`p-4 rounded-lg flex items-center gap-3 animate-in fade-in slide-in-from-top-2 duration-300 ${
                    message.type === 'success' 
                        ? 'bg-emerald-50 text-emerald-700 border border-emerald-200' 
                        : 'bg-red-50 text-red-700 border border-red-200'
                }`}>
                    {message.type === 'success' ? <ShieldCheck className="h-5 w-5" /> : <AlertCircle className="h-5 w-5" />}
                    <span className="text-sm font-medium">{message.text}</span>
                </div>
            )}

            <div className="grid grid-cols-1 md:grid-cols-3 gap-6">
                {/* Left: User Overview */}
                <div className="md:col-span-1 space-y-6">
                    <Card className="shadow-sm border-indigo-100 overflow-hidden">
                        <CardHeader className="text-center bg-slate-50/50 border-b border-indigo-50/50 pb-8">
                            <div className="mx-auto pb-4 pt-4">
                                <Avatar className="h-24 w-24 border-4 border-white shadow-md">
                                    <AvatarImage src="" />
                                    <AvatarFallback className="text-2xl font-bold bg-indigo-600 text-white">
                                        {user?.name?.split(' ').map(n => n[0]).join('') || "??"}
                                    </AvatarFallback>
                                </Avatar>
                            </div>
                            <CardTitle className="text-xl">{user?.name}</CardTitle>
                            <CardDescription className="font-medium text-slate-500">{user?.email}</CardDescription>
                            <div className="mt-4 flex justify-center">
                                <div className="px-3 py-1 rounded-full text-[10px] font-bold uppercase tracking-widest bg-indigo-100 text-indigo-700 border border-indigo-200">
                                    {user?.role || "User"} Account
                                </div>
                            </div>
                        </CardHeader>
                        <CardContent className="pt-6">
                            <ul className="space-y-4 text-sm">
                                <li className="flex items-center justify-between">
                                    <span className="text-slate-500">Member Since</span>
                                    <span className="font-medium">Recent</span>
                                </li>
                                <li className="flex items-center justify-between">
                                    <span className="text-slate-500">Status</span>
                                    <span className="inline-flex items-center px-2 py-0.5 rounded-full text-xs font-semibold bg-emerald-100 text-emerald-700">Active</span>
                                </li>
                            </ul>
                        </CardContent>
                    </Card>
                </div>

                {/* Right: Forms */}
                <div className="md:col-span-2 space-y-6">
                    {/* General Section */}
                    <Card className="shadow-sm border-indigo-100 overflow-hidden">
                        <form onSubmit={handleUpdateName}>
                            <CardHeader className="bg-slate-50/50 border-b border-indigo-50/50">
                                <CardTitle className="flex items-center gap-2 text-lg">
                                    <User className="h-5 w-5 text-indigo-500" />
                                    Account Details
                                </CardTitle>
                                <CardDescription>Update your display name and view account info.</CardDescription>
                            </CardHeader>
                            <CardContent className="space-y-4 pt-6">
                                <div className="space-y-2">
                                    <Label htmlFor="usr-name">Full Name</Label>
                                    <Input 
                                        id="usr-name" 
                                        value={name} 
                                        onChange={(e) => setName(e.target.value)} 
                                        placeholder="Full Name"
                                        required 
                                        className="focus-visible:ring-indigo-500"
                                    />
                                </div>
                                <div className="space-y-2">
                                    <Label htmlFor="usr-email">Email Address</Label>
                                    <Input id="usr-email" value={user?.email || ""} disabled className="bg-slate-50 opacity-80 cursor-not-allowed border-dashed" />
                                    <p className="text-[10px] text-slate-400">Your registered email address cannot be changed.</p>
                                </div>
                            </CardContent>
                            <CardFooter className="border-t pt-4 pb-4 bg-slate-50/30">
                                <Button type="submit" disabled={isSaving} className="bg-[#0f172b] hover:bg-[#0f172b]/90 text-white min-w-[140px]">
                                    {isSaving ? <Loader2 className="mr-2 h-4 w-4 animate-spin" /> : <Save className="mr-2 h-4 w-4" />}
                                    {isSaving ? "Saving..." : "Update Name"}
                                </Button>
                            </CardFooter>
                        </form>
                    </Card>

                    {/* Security Section */}
                    <Card className="shadow-sm border-indigo-100 overflow-hidden">
                        <form onSubmit={handleChangePassword}>
                            <CardHeader className="bg-slate-50/50 border-b border-indigo-50/50">
                                <CardTitle className="flex items-center gap-2 text-lg">
                                    <Lock className="h-5 w-5 text-emerald-500" />
                                    Security & Password
                                </CardTitle>
                                <CardDescription>Change your password regularly to stay secure.</CardDescription>
                            </CardHeader>
                            <CardContent className="space-y-4 pt-6">
                                <div className="space-y-2">
                                    <Label htmlFor="cur-pass">Current Password</Label>
                                    <Input 
                                        id="cur-pass" 
                                        type="password" 
                                        value={currentPassword}
                                        onChange={(e) => setCurrentPassword(e.target.value)}
                                        placeholder="Enter current password"
                                        required 
                                        className="focus-visible:ring-indigo-500"
                                    />
                                </div>
                                <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                                    <div className="space-y-2">
                                        <Label htmlFor="new-pass">New Password</Label>
                                        <Input 
                                            id="new-pass" 
                                            type="password" 
                                            value={newPassword}
                                            onChange={(e) => setNewPassword(e.target.value)}
                                            placeholder="Enter new password"
                                            required 
                                            className="focus-visible:ring-indigo-500"
                                        />
                                    </div>
                                    <div className="space-y-2">
                                        <Label htmlFor="conf-pass">Confirm Password</Label>
                                        <Input 
                                            id="conf-pass" 
                                            type="password" 
                                            value={confirmPassword}
                                            onChange={(e) => setConfirmPassword(e.target.value)}
                                            placeholder="Confirm new password"
                                            required 
                                            className="focus-visible:ring-indigo-500"
                                        />
                                    </div>
                                </div>
                            </CardContent>
                            <CardFooter className="border-t pt-4 pb-4 bg-slate-50/30">
                                <Button type="submit" disabled={isSaving} className="bg-emerald-600 hover:bg-emerald-700 text-white min-w-[140px]">
                                    {isSaving ? <Loader2 className="mr-2 h-4 w-4 animate-spin" /> : <Lock className="mr-2 h-4 w-4" />}
                                    {isSaving ? "Updating..." : "Update Password"}
                                </Button>
                            </CardFooter>
                        </form>
                    </Card>
                </div>
            </div>
        </div>
    )
}
