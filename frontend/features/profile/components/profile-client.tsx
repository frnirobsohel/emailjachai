"use client"

import { useState, useEffect } from "react"
import { useRouter } from "next/navigation"
import { Card, CardContent, CardDescription, CardHeader, CardTitle, CardFooter } from "@/components/ui/card"
import { Input } from "@/components/ui/input"
import { Button } from "@/components/ui/button"
import { Label } from "@/components/ui/label"
import { Avatar, AvatarFallback, AvatarImage } from "@/components/ui/avatar"
import { ApiClient } from "@/lib/api-client"
import { User, Lock, Save, Loader2 } from "lucide-react"
import { useForm } from "react-hook-form"
import { zodResolver } from "@hookform/resolvers/zod"
import * as z from "zod"
import { toast } from "react-hot-toast"

const nameSchema = z.object({
    name: z.string().min(1, "Name is required")
})

const passwordSchema = z.object({
    current_password: z.string().min(1, "Current password is required"),
    new_password: z.string().min(8, "New password must be at least 8 characters"),
    confirm_password: z.string().min(1, "Confirm your password")
}).refine((data) => data.new_password === data.confirm_password, {
    message: "Passwords do not match",
    path: ["confirm_password"]
})

export function ProfileClient({ initialProfile }: { initialProfile: any }) {
    const router = useRouter()
    const [isLoading, setIsLoading] = useState(false)
    const [user, setUser] = useState<{ id: number; name: string; email: string; role: string } | null>(initialProfile)

    const nameForm = useForm<z.infer<typeof nameSchema>>({
        resolver: zodResolver(nameSchema),
        defaultValues: { name: initialProfile?.name || "" }
    })

    const passwordForm = useForm<z.infer<typeof passwordSchema>>({
        resolver: zodResolver(passwordSchema),
        defaultValues: { current_password: "", new_password: "", confirm_password: "" }
    })

    useEffect(() => {
        const fetchProfile = async () => {
            try {
                setIsLoading(true);
                const result = await ApiClient.get<any>('/auth/me');
                if (result.status === 'success' && result.data) {
                    const profile = result.data.user || result.data;
                    setUser(profile);
                    nameForm.reset({ name: profile.name });
                }
            } catch (error) {
                console.error("Failed to fetch profile:", error);
            } finally {
                setIsLoading(false);
            }
        };
        void fetchProfile();
    }, [nameForm]);

    const onUpdateName = async (values: z.infer<typeof nameSchema>) => {
        try {
            const result = await ApiClient.post('/auth/profile/update', { name: values.name });
            if (result.status === 'success') {
                toast.success("Profile name updated successfully!");
                setUser(prev => prev ? { ...prev, name: values.name } : null);
                // Refresh sidebar user info
                if (typeof window !== 'undefined') {
                    const cachedUser = localStorage.getItem('sidebar_user');
                    if (cachedUser) {
                        const parsed = JSON.parse(cachedUser);
                        parsed.name = values.name;
                        localStorage.setItem('sidebar_user', JSON.stringify(parsed));
                    }
                }
            } else {
                toast.error(result.message || "Failed to update profile");
            }
        } catch (error: any) {
            toast.error(error.message || "An unexpected error occurred");
        }
    };

    const onChangePassword = async (values: z.infer<typeof passwordSchema>) => {
        try {
            const result = await ApiClient.post('/auth/profile/update', {
                current_password: values.current_password,
                new_password: values.new_password
            });

            if (result.status === 'success') {
                toast.success("Password changed successfully!");
                passwordForm.reset();
            } else {
                toast.error(result.message || "Failed to change password");
            }
        } catch (error: any) {
            toast.error(error.message || "An unexpected error occurred");
        }
    };

    if (isLoading) {
        return <div className="flex items-center justify-center min-h-[400px]">Loading profile...</div>;
    }

    return (
        <div className="flex-1 space-y-4">
            <div className="flex items-center justify-between space-y-2">
                <div>
                    <h2 className="text-2xl font-semibold tracking-tight text-[#0b1f1c] sm:text-3xl">Profile Settings</h2>
                    <p className="mt-1 text-sm text-[#5a736c]">Manage your account information and security preferences.</p>
                </div>
            </div>

            <div className="grid grid-cols-1 md:grid-cols-3 gap-6">
                {/* Left: User Overview */}
                <div className="md:col-span-1 space-y-6">
                    <Card className="shadow-none border-[#0b1f1c]/10 overflow-hidden">
                        <CardHeader className="text-center bg-[#f0f4f2]/60 border-b border-[#0b1f1c]/8 pb-8">
                            <div className="mx-auto pb-4 pt-4">
                                <Avatar className="h-24 w-24 border-4 border-white shadow-md">
                                    <AvatarImage src="" />
                                    <AvatarFallback className="text-2xl font-bold bg-[#0f5c52] text-white">
                                        {user?.name?.split(' ').map(n => n[0]).join('') || "??"}
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
                                    <span className="font-medium text-[#0b1f1c]">Recent</span>
                                </li>
                                <li className="flex items-center justify-between">
                                    <span className="text-[#5a736c]">Status</span>
                                    <span className="inline-flex items-center px-2 py-0.5 rounded-full text-xs font-semibold bg-emerald-100 text-emerald-700">Active</span>
                                </li>
                            </ul>
                        </CardContent>
                    </Card>
                </div>

                {/* Right: Forms */}
                <div className="md:col-span-2 space-y-6">
                    {/* General Section */}
                    <Card className="shadow-none border-[#0b1f1c]/10 overflow-hidden">
                        <form onSubmit={nameForm.handleSubmit(onUpdateName)}>
                            <CardHeader className="bg-[#f0f4f2]/60 border-b border-[#0b1f1c]/8">
                                <CardTitle className="flex items-center gap-2 text-lg text-[#0b1f1c]">
                                    <User className="h-5 w-5 text-[#0f5c52]" />
                                    Account Details
                                </CardTitle>
                                <CardDescription className="text-[#5a736c]">Update your display name and view account info.</CardDescription>
                            </CardHeader>
                            <CardContent className="space-y-4 pt-6">
                                <div className="space-y-2">
                                    <Label htmlFor="usr-name" className="text-[#0b1f1c]">Full Name</Label>
                                    <Input 
                                        id="usr-name" 
                                        placeholder="Full Name"
                                        className={`focus-visible:ring-[#0f5c52]/30 ${nameForm.formState.errors.name ? 'border-red-400' : ''}`}
                                        {...nameForm.register("name")}
                                    />
                                    {nameForm.formState.errors.name && <p className="text-xs text-red-500">{nameForm.formState.errors.name.message}</p>}
                                </div>
                                <div className="space-y-2">
                                    <Label htmlFor="usr-email" className="text-[#0b1f1c]">Email Address</Label>
                                    <Input id="usr-email" value={user?.email || ""} disabled className="bg-[#f0f4f2]/60 opacity-80 cursor-not-allowed border-dashed" />
                                    <p className="text-[10px] text-[#5a736c]">Your registered email address cannot be changed.</p>
                                </div>
                            </CardContent>
                            <CardFooter className="border-t border-[#0b1f1c]/8 pt-4 pb-4 bg-[#f0f4f2]/30">
                                <Button type="submit" disabled={nameForm.formState.isSubmitting} className="border border-[#08352f] bg-[#0f5c52] hover:bg-[#0b4a42] text-white min-w-[140px]">
                                    {nameForm.formState.isSubmitting ? <Loader2 className="mr-2 h-4 w-4 animate-spin" /> : <Save className="mr-2 h-4 w-4" />}
                                    {nameForm.formState.isSubmitting ? "Saving..." : "Update Name"}
                                </Button>
                            </CardFooter>
                        </form>
                    </Card>

                    {/* Security Section */}
                    <Card className="shadow-none border-[#0b1f1c]/10 overflow-hidden">
                        <form onSubmit={passwordForm.handleSubmit(onChangePassword)}>
                            <CardHeader className="bg-[#f0f4f2]/60 border-b border-[#0b1f1c]/8">
                                <CardTitle className="flex items-center gap-2 text-lg text-[#0b1f1c]">
                                    <Lock className="h-5 w-5 text-[#0f5c52]" />
                                    Security & Password
                                </CardTitle>
                                <CardDescription className="text-[#5a736c]">Change your password regularly to stay secure.</CardDescription>
                            </CardHeader>
                            <CardContent className="space-y-4 pt-6">
                                <div className="space-y-2">
                                    <Label htmlFor="cur-pass" className="text-[#0b1f1c]">Current Password</Label>
                                    <Input 
                                        id="cur-pass" 
                                        type="password" 
                                        placeholder="Enter current password"
                                        className={`focus-visible:ring-[#0f5c52]/30 ${passwordForm.formState.errors.current_password ? 'border-red-400' : ''}`}
                                        {...passwordForm.register("current_password")}
                                    />
                                    {passwordForm.formState.errors.current_password && <p className="text-xs text-red-500">{passwordForm.formState.errors.current_password.message}</p>}
                                </div>
                                <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                                    <div className="space-y-2">
                                        <Label htmlFor="new-pass" className="text-[#0b1f1c]">New Password</Label>
                                        <Input 
                                            id="new-pass" 
                                            type="password" 
                                            placeholder="Enter new password"
                                            className={`focus-visible:ring-[#0f5c52]/30 ${passwordForm.formState.errors.new_password ? 'border-red-400' : ''}`}
                                            {...passwordForm.register("new_password")}
                                        />
                                        {passwordForm.formState.errors.new_password && <p className="text-xs text-red-500">{passwordForm.formState.errors.new_password.message}</p>}
                                    </div>
                                    <div className="space-y-2">
                                        <Label htmlFor="conf-pass" className="text-[#0b1f1c]">Confirm Password</Label>
                                        <Input 
                                            id="conf-pass" 
                                            type="password" 
                                            placeholder="Confirm new password"
                                            className={`focus-visible:ring-[#0f5c52]/30 ${passwordForm.formState.errors.confirm_password ? 'border-red-400' : ''}`}
                                            {...passwordForm.register("confirm_password")}
                                        />
                                        {passwordForm.formState.errors.confirm_password && <p className="text-xs text-red-500">{passwordForm.formState.errors.confirm_password.message}</p>}
                                    </div>
                                </div>
                            </CardContent>
                            <CardFooter className="border-t border-[#0b1f1c]/8 pt-4 pb-4 bg-[#f0f4f2]/30">
                                <Button type="submit" disabled={passwordForm.formState.isSubmitting} className="border border-[#08352f] bg-[#0f5c52] hover:bg-[#0b4a42] text-white min-w-[140px]">
                                    {passwordForm.formState.isSubmitting ? <Loader2 className="mr-2 h-4 w-4 animate-spin" /> : <Lock className="mr-2 h-4 w-4" />}
                                    {passwordForm.formState.isSubmitting ? "Updating..." : "Update Password"}
                                </Button>
                            </CardFooter>
                        </form>
                    </Card>
                </div>
            </div>
        </div>
    )
}
