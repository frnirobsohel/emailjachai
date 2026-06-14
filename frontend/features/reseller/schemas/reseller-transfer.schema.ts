import * as z from "zod"

export const transferSchema = z.object({
    email: z.string().email("Valid recipient email is required"),
    amount: z.string().min(1, "Required").refine((val) => !isNaN(parseInt(val)) && parseInt(val) > 0, {
        message: "Please enter a credit amount greater than zero",
    })
})

export type TransferFormValues = z.infer<typeof transferSchema>
