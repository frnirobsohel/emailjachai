import { describe, expect, it } from "vitest"
import {
  isPublicMarketingPath,
  parseHeadSnippet,
  parseHeadScriptsJson,
} from "@/lib/head-scripts"

describe("parseHeadSnippet", () => {
  it("unwraps nested script tags into inline JS", () => {
    const parsed = parseHeadSnippet("<script>fbq('track','PageView');</script>")
    expect(parsed.inlineScripts).toEqual(["fbq('track','PageView');"])
    expect(parsed.externalScripts).toHaveLength(0)
  })

  it("extracts external script src", () => {
    const parsed = parseHeadSnippet(
      '<script async src="https://connect.facebook.net/en_US/fbevents.js"></script>'
    )
    expect(parsed.externalScripts).toEqual([
      {
        src: "https://connect.facebook.net/en_US/fbevents.js",
        async: true,
        defer: false,
      },
    ])
  })

  it("extracts meta verification tags", () => {
    const parsed = parseHeadSnippet(
      '<meta name="google-site-verification" content="ABC123" />'
    )
    expect(parsed.metaTags).toEqual([
      {
        name: "google-site-verification",
        content: "ABC123",
        property: undefined,
        httpEquiv: undefined,
        charset: undefined,
      },
    ])
  })

  it("treats bare JS as inline script", () => {
    const parsed = parseHeadSnippet("console.log(1)")
    expect(parsed.inlineScripts).toEqual(["console.log(1)"])
  })
})

describe("isPublicMarketingPath", () => {
  it("allows marketing routes and blocks app chrome", () => {
    expect(isPublicMarketingPath("/")).toBe(true)
    expect(isPublicMarketingPath("/privacy")).toBe(true)
    expect(isPublicMarketingPath("/login")).toBe(true)
    expect(isPublicMarketingPath("/admin")).toBe(false)
    expect(isPublicMarketingPath("/admin/brand-build")).toBe(false)
    expect(isPublicMarketingPath("/dashboard/jobs")).toBe(false)
  })
})

describe("parseHeadScriptsJson", () => {
  it("returns empty on invalid JSON", () => {
    expect(parseHeadScriptsJson("{nope")).toEqual([])
  })

  it("filters enabled-shaped items", () => {
    const items = parseHeadScriptsJson(
      JSON.stringify([
        { id: "1", name: "A", code: "x", enabled: true },
        { id: "2", name: "B", code: "y" },
      ])
    )
    expect(items).toHaveLength(1)
    expect(items[0].name).toBe("A")
  })
})
