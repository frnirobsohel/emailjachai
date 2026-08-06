import * as z from "zod"

export const otpCodeSchema = z.object({
    code: z
        .string()
        .trim()
        .regex(/^\d{6}$/, "Enter the 6-digit code from your email"),
})

export type OtpCodeValues = z.infer<typeof otpCodeSchema>

export const resetPasswordWithCodeSchema = z.object({
    code: z
        .string()
        .trim()
        .regex(/^\d{6}$/, "Enter the 6-digit code from your email"),
    password: z.string()
        .min(8, "Password must be at least 8 characters")
        .regex(/[A-Z]/, "Password must contain at least one uppercase letter")
        .regex(/[0-9]/, "Password must contain at least one number"),
    confirmPassword: z.string(),
}).refine((data) => data.password === data.confirmPassword, {
    message: "Passwords do not match",
    path: ["confirmPassword"],
})

export type ResetPasswordWithCodeValues = z.infer<typeof resetPasswordWithCodeSchema>
