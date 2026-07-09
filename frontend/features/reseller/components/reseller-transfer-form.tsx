"use client"

import { Loader2 } from "lucide-react"
import { Button } from "@/components/ui/button"
import { Input } from "@/components/ui/input"
import { ApiClient } from "@/lib/api-client"
import { useForm } from "react-hook-form"
import { zodResolver } from "@hookform/resolvers/zod"
import { toast } from "react-hot-toast"
import { transferSchema, TransferFormValues } from "@/features/reseller/schemas/reseller-transfer.schema"
import { useSettings } from "@/lib/settings-context"

export function ResellerTransferForm() {
    const settings = useSettings()
    const isMaintenance = settings?.maintenance_mode === "1"
    const {
        register,
        handleSubmit,
        formState: { errors, isSubmitting },
        reset
    } = useForm<TransferFormValues>({
        resolver: zodResolver(transferSchema),
        defaultValues: { email: "", amount: "" }
    })

    const onTransfer = async (data: TransferFormValues) => {
        if (isMaintenance) return
        try {
            const result = await ApiClient.post("/reseller/transfer", {
                email: data.email,
                amount: parseInt(data.amount)
            })

            if (result.status === "success") {
                toast.success(result.message || "Credits transferred successfully.")
                reset()
                // Emit event to update CreditBadge if needed
                window.dispatchEvent(new Event('creditsUpdated'))
            } else {
                toast.error(result.message || "Transfer failed. Please check the email and your balance.")
            }
        } catch (err: any) {
            toast.error(err.message || "An unexpected error occurred during transfer.")
        }
    }

    return (
        <form onSubmit={handleSubmit(onTransfer)} className="space-y-4">
            <div className="space-y-2">
                <label className="text-sm font-medium text-slate-700">Recipient Email</label>
                <Input
                    type="email"
                    placeholder="user@example.com"
                    className={`border-indigo-100 focus-visible:ring-indigo-500 h-11 ${errors.email ? 'border-red-500' : ''}`}
                    disabled={isSubmitting || isMaintenance}
                    {...register("email")}
                />
                {errors.email && <p className="text-xs text-red-500 mt-1">{errors.email.message}</p>}
            </div>
            <div className="space-y-2">
                <label className="text-sm font-medium text-slate-700">Credit Amount</label>
                <Input
                    type="number"
                    placeholder="Ex: 5000"
                    className={`border-indigo-100 focus-visible:ring-indigo-500 h-11 ${errors.amount ? 'border-red-500' : ''}`}
                    disabled={isSubmitting || isMaintenance}
                    {...register("amount")}
                />
                {errors.amount && <p className="text-xs text-red-500 mt-1">{errors.amount.message}</p>}
            </div>

            <Button 
                type="submit" 
                className="w-full bg-indigo-600 hover:bg-indigo-700 text-white h-11 text-md font-semibold transition-all shadow-md active:scale-[0.98]"
                disabled={isSubmitting || isMaintenance}
            >
                {isSubmitting ? <Loader2 className="mr-2 h-4 w-4 animate-spin" /> : null}
                {isSubmitting ? "Processing Request..." : isMaintenance ? "Transfer Disabled" : "Confirm Transfer"}
            </Button>
        </form>
    )
}
