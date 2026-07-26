"use client"

import { useState } from "react"

interface FAQItem {
  q: string
  a: string
}

const faqs: FAQItem[] = [
  {
    q: "How does email verification work?",
    a: "We perform multi-layer checks including syntax validation, MX record lookup, SMTP connection verification, and mailbox existence check — all without sending a single email.",
  },
  {
    q: "What is a credit?",
    a: "One credit equals one email verification. When you verify a single email, it costs 1 credit. Unknown results are automatically refunded at 80%.",
  },
  {
    q: "Do credits expire?",
    a: "No! Credits never expire. Buy once and use them whenever you need. There are no monthly fees or subscriptions required.",
  },
  {
    q: "Can I upload a CSV file for bulk verification?",
    a: "Yes! You can upload CSV or TXT files containing email lists. Our system will process them in parallel using distributed workers for maximum speed.",
  },
  {
    q: "Is my data secure?",
    a: "100%. All data is encrypted in transit and at rest. We never share, sell, or store your email lists beyond what is needed for verification. Your data is automatically purged.",
  },
]

export function FAQAccordion() {
  const [openIndex, setOpenIndex] = useState<number>(0)

  return (
    <div className="divide-y divide-[#0b1f1c]/10 border-y border-[#0b1f1c]/10">
      {faqs.map((faq, i) => {
        const isOpen = openIndex === i

        return (
          <div key={i}>
            <button
              onClick={() => setOpenIndex(isOpen ? -1 : i)}
              className="flex w-full cursor-pointer items-center justify-between py-4 text-left text-sm font-medium text-[#0b1f1c] transition-colors hover:text-[#0f5c52] focus:outline-none md:text-base"
            >
              <span>{faq.q}</span>
              <svg
                className={`ml-4 h-5 w-5 shrink-0 text-[#5a736c] transition-transform duration-200 ${isOpen ? "rotate-45" : ""}`}
                fill="none"
                viewBox="0 0 24 24"
                stroke="currentColor"
                strokeWidth={2}
              >
                <path strokeLinecap="round" strokeLinejoin="round" d="M12 4.5v15m7.5-7.5h-15" />
              </svg>
            </button>
            <div
              className={`grid transition-all duration-200 ease-in-out ${
                isOpen ? "grid-rows-[1fr] opacity-100" : "grid-rows-[0fr] opacity-0"
              }`}
            >
              <div className="overflow-hidden">
                <div className="pb-4 text-sm leading-relaxed text-[#4a635c]">{faq.a}</div>
              </div>
            </div>
          </div>
        )
      })}
    </div>
  )
}
