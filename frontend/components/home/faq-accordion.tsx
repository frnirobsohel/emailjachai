"use client"

import { useState } from "react"

interface FAQItem {
  q: string;
  a: string;
}

const faqs: FAQItem[] = [
  {
    q: "How does email verification work?",
    a: "We perform multi-layer checks including syntax validation, MX record lookup, SMTP connection verification, and mailbox existence check — all without sending a single email."
  },
  {
    q: "What is a credit?",
    a: "One credit equals one email verification. When you verify a single email, it costs 1 credit. Unknown results are automatically refunded at 80%."
  },
  {
    q: "Do credits expire?",
    a: "No! Credits never expire. Buy once and use them whenever you need. There are no monthly fees or subscriptions required."
  },
  {
    q: "Can I upload a CSV file for bulk verification?",
    a: "Yes! You can upload CSV or TXT files containing email lists. Our system will process them in parallel using distributed workers for maximum speed."
  },
  {
    q: "Is my data secure?",
    a: "100%. All data is encrypted in transit and at rest. We never share, sell, or store your email lists beyond what is needed for verification. Your data is automatically purged."
  },
]

export function FAQAccordion() {
  const [openIndex, setOpenIndex] = useState<number>(0)

  return (
    <div className="space-y-3">
      {faqs.map((faq, i) => {
        const isOpen = openIndex === i

        return (
          <div 
            key={i} 
            className="group rounded-2xl border border-white/5 bg-white/[0.02] backdrop-blur-sm overflow-hidden"
          >
            <button
              onClick={() => {
                setOpenIndex(isOpen ? -1 : i)
              }}
              className="w-full flex items-center justify-between px-5 py-4 text-left font-medium hover:bg-white/[0.02] transition-colors text-sm md:text-base cursor-pointer focus:outline-none"
            >
              <span>{faq.q}</span>
              <svg 
                className={`h-5 w-5 text-slate-500 flex-shrink-0 ml-4 transition-transform duration-200 ${isOpen ? 'rotate-45' : ''}`} 
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
                <div className="px-5 pb-4 text-sm text-slate-400 leading-relaxed">
                  {faq.a}
                </div>
              </div>
            </div>
          </div>
        )
      })}
    </div>
  )
}
