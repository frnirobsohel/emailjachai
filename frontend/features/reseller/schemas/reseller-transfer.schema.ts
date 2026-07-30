import * as z from "zod"

export const transferSchema = z.object({
    email: z.string().trim().email("Valid recipient email is required"),
    amount: z
        .string()
        .trim()
        .min(1, "Required")
        .regex(/^\d+$/, "Enter a whole number greater than zero")
        .refine((val) => parseInt(val, 10) > 0, {
            message: "Please enter a credit amount greater than zero",
        }),
})

export type TransferFormValues = z.infer<typeof transferSchema>
