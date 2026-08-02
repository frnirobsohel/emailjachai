import { ImageResponse } from "next/og"
import { getPublicSettings } from "@/lib/services/settings"

export const alt = "Site preview"
export const size = { width: 1200, height: 630 }
export const contentType = "image/png"

/** Dynamic 1200×630 share card — uses Brand Settings title/tagline. */
export default async function OpenGraphImage() {
  const settings = await getPublicSettings()
  const title = settings?.site_title?.trim() || "Email Verification"
  const tagline =
    settings?.site_tagline?.trim() ||
    "Professional Email Verification Platform"

  return new ImageResponse(
    (
      <div
        style={{
          width: "100%",
          height: "100%",
          display: "flex",
          flexDirection: "column",
          justifyContent: "space-between",
          padding: "64px 72px",
          background: "linear-gradient(145deg, #0b1f1c 0%, #0f5c52 55%, #147a6c 100%)",
          color: "#f0f4f2",
          fontFamily: "ui-sans-serif, system-ui, sans-serif",
        }}
      >
        <div
          style={{
            display: "flex",
            alignItems: "center",
            gap: "12px",
            fontSize: 28,
            fontWeight: 600,
            letterSpacing: "-0.02em",
            opacity: 0.92,
          }}
        >
          <div
            style={{
              width: 14,
              height: 14,
              borderRadius: 999,
              background: "#7ee787",
            }}
          />
          {title}
        </div>

        <div style={{ display: "flex", flexDirection: "column", gap: 20, maxWidth: 920 }}>
          <div
            style={{
              fontSize: 64,
              fontWeight: 700,
              lineHeight: 1.1,
              letterSpacing: "-0.03em",
            }}
          >
            {title}
          </div>
          <div
            style={{
              fontSize: 30,
              lineHeight: 1.35,
              color: "#c5ddd6",
              maxWidth: 860,
            }}
          >
            {tagline}
          </div>
        </div>

        <div
          style={{
            display: "flex",
            justifyContent: "space-between",
            alignItems: "center",
            fontSize: 22,
            color: "#9ec4ba",
          }}
        >
          <span>Email verification platform</span>
          <span style={{ color: "#7ee787" }}>Share preview</span>
        </div>
      </div>
    ),
    { ...size }
  )
}
