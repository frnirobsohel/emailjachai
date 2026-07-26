import Image from "next/image"

interface BrandLogoProps {
    logoUrl?: string | null
    siteTitle: string
    size?: number
    className?: string
}

/** Uses admin logo_url when set; otherwise public/logo.svg — never a hardcoded letter mark. */
export function BrandLogo({
    logoUrl,
    siteTitle,
    size = 28,
    className = "object-contain",
}: BrandLogoProps) {
    const src = (logoUrl && logoUrl.trim()) || "/logo.svg"
    const isRemote = /^https?:\/\//i.test(src)

    if (isRemote) {
        return (
            // eslint-disable-next-line @next/next/no-img-element
            <img
                src={src}
                alt={siteTitle}
                width={size}
                height={size}
                className={`shrink-0 ${className}`}
                style={{ width: size, height: size }}
            />
        )
    }

    return (
        <Image
            src={src}
            alt={siteTitle}
            width={size}
            height={size}
            className={`shrink-0 ${className}`}
            style={{ width: size, height: size }}
            priority
        />
    )
}
