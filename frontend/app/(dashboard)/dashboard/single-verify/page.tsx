import { Metadata } from "next"
import { SingleVerifyClient } from "@/features/single-verify/components/single-verify-client"

export const metadata: Metadata = {
    title: "Single Email Verification",
}

export default function SingleVerifyPage() {
    return <SingleVerifyClient />
}
