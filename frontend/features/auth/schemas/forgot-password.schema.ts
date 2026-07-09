import * as z from "zod"

export const forgotPasswordSchema = z.object({
    email: z.string().email("Invalid email address"),
})

export type ForgotPasswordValues = z.infer<typeof forgotPasswordSchema>
