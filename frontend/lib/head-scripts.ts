export type HeadScriptItem = {
  id: string
  name: string
  code: string
  enabled: boolean
}

export type ExternalScriptRef = {
  src: string
  async: boolean
  defer: boolean
}

export type MetaTagAttrs = {
  name?: string
  content?: string
  property?: string
  httpEquiv?: string
  charset?: string
}

export type ParsedHeadSnippet = {
  inlineScripts: string[]
  externalScripts: ExternalScriptRef[]
  metaTags: MetaTagAttrs[]
  residualHtml: string
}

const MAX_SCRIPTS = 20
const MAX_CODE_LEN = 20_000
const MAX_JSON_LEN = 50_000

const SCRIPT_RE = /<script(\s[^>]*)?>([\s\S]*?)<\/script>/gi
const META_RE = /<meta\s+([^>]*?)\s*\/?>/gi
const ATTR_RE = /([a-zA-Z_:][-a-zA-Z0-9_:.]*)\s*=\s*(?:"([^"]*)"|'([^']*)'|([^\s>]+))/g

/** Paths where third-party head scripts must not run (admin session / app chrome). */
export function isPublicMarketingPath(pathname: string): boolean {
  if (!pathname) return true
  const blockedPrefixes = ["/admin", "/dashboard", "/next-api"]
  return !blockedPrefixes.some(
    (prefix) => pathname === prefix || pathname.startsWith(`${prefix}/`)
  )
}

function parseAttrs(attrBlob: string): Record<string, string> {
  const out: Record<string, string> = {}
  ATTR_RE.lastIndex = 0
  let match: RegExpExecArray | null
  while ((match = ATTR_RE.exec(attrBlob)) !== null) {
    const key = match[1].toLowerCase()
    const value = match[2] ?? match[3] ?? match[4] ?? ""
    out[key] = value
  }
  return out
}

/**
 * Split admin-pasted HTML snippets into executable pieces.
 * Presets wrap JS in <script> tags; those must not be nested inside another <script>.
 */
export function parseHeadSnippet(code: string): ParsedHeadSnippet {
  const inlineScripts: string[] = []
  const externalScripts: ExternalScriptRef[] = []
  const metaTags: MetaTagAttrs[] = []

  let working = code.trim()
  if (!working) {
    return { inlineScripts, externalScripts, metaTags, residualHtml: "" }
  }

  // Bare JS (no tags) — treat as inline script body.
  if (!/<[a-z][\s\S]*>/i.test(working)) {
    return {
      inlineScripts: [working],
      externalScripts,
      metaTags,
      residualHtml: "",
    }
  }

  SCRIPT_RE.lastIndex = 0
  working = working.replace(SCRIPT_RE, (_full, attrPart: string | undefined, body: string) => {
    const rawAttrs = attrPart || ""
    const attrs = parseAttrs(rawAttrs)
    const hasAsync = /\basync\b/i.test(rawAttrs)
    const hasDefer = /\bdefer\b/i.test(rawAttrs)
    if (attrs.src) {
      externalScripts.push({
        src: attrs.src,
        async: hasAsync || attrs.async === "" || attrs.async === "true",
        defer: hasDefer || attrs.defer === "" || attrs.defer === "true",
      })
    } else if (body.trim()) {
      inlineScripts.push(body.trim())
    }
    return ""
  })

  META_RE.lastIndex = 0
  working = working.replace(META_RE, (_full, attrPart: string) => {
    const attrs = parseAttrs(attrPart || "")
    metaTags.push({
      name: attrs.name,
      content: attrs.content,
      property: attrs.property,
      httpEquiv: attrs["http-equiv"],
      charset: attrs.charset,
    })
    return ""
  })

  return {
    inlineScripts,
    externalScripts,
    metaTags,
    residualHtml: working.trim(),
  }
}

export function parseHeadScriptsJson(raw: string | undefined | null): HeadScriptItem[] {
  if (!raw?.trim()) return []
  if (raw.length > MAX_JSON_LEN) return []
  try {
    const parsed = JSON.parse(raw)
    if (!Array.isArray(parsed)) return []
    return parsed
      .filter(
        (item): item is HeadScriptItem =>
          item != null &&
          typeof item === "object" &&
          typeof item.id === "string" &&
          typeof item.name === "string" &&
          typeof item.code === "string" &&
          typeof item.enabled === "boolean"
      )
      .slice(0, MAX_SCRIPTS)
      .map((item) => ({
        ...item,
        code: item.code.slice(0, MAX_CODE_LEN),
      }))
  } catch {
    return []
  }
}

export { MAX_SCRIPTS, MAX_CODE_LEN, MAX_JSON_LEN }
