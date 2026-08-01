import type { ReactNode } from "react"
import {
  isPublicMarketingPath,
  parseHeadSnippet,
  parseHeadScriptsJson,
  type HeadScriptItem,
} from "@/lib/head-scripts"

type BrandHeadScriptsProps = {
  headScriptsJson?: string
  pathname: string
}

function MetaFromAttrs({
  attrs,
  tagKey,
}: {
  attrs: ReturnType<typeof parseHeadSnippet>["metaTags"][number]
  tagKey: string
}) {
  if (attrs.charset) {
    return <meta key={tagKey} charSet={attrs.charset} />
  }
  if (attrs.httpEquiv) {
    return (
      <meta
        key={tagKey}
        httpEquiv={attrs.httpEquiv}
        content={attrs.content}
      />
    )
  }
  if (attrs.property) {
    return (
      <meta
        key={tagKey}
        property={attrs.property}
        content={attrs.content}
      />
    )
  }
  if (attrs.name) {
    return <meta key={tagKey} name={attrs.name} content={attrs.content} />
  }
  return null
}

function SnippetNodes({ script }: { script: HeadScriptItem }) {
  const parsed = parseHeadSnippet(script.code)
  const nodes: ReactNode[] = []

  parsed.metaTags.forEach((meta, i) => {
    nodes.push(
      <MetaFromAttrs
        key={`${script.id}-meta-${i}`}
        tagKey={`${script.id}-meta-${i}`}
        attrs={meta}
      />
    )
  })

  parsed.externalScripts.forEach((ext, i) => {
    nodes.push(
      <script
        key={`${script.id}-ext-${i}`}
        src={ext.src}
        async={ext.async || undefined}
        defer={ext.defer || undefined}
      />
    )
  })

  parsed.inlineScripts.forEach((js, i) => {
    nodes.push(
      <script
        key={`${script.id}-inline-${i}`}
        dangerouslySetInnerHTML={{ __html: js }}
      />
    )
  })

  // noscript pixels are valid in <head>; drop other leftover markup.
  if (parsed.residualHtml) {
    const noscriptMatch = parsed.residualHtml.match(
      /<noscript([^>]*)>([\s\S]*?)<\/noscript>/i
    )
    if (noscriptMatch) {
      nodes.push(
        <noscript
          key={`${script.id}-noscript`}
          dangerouslySetInnerHTML={{ __html: noscriptMatch[2] }}
        />
      )
    }
  }

  return <>{nodes}</>
}

/** Injects admin-configured head snippets on public marketing pages only. */
export function BrandHeadScripts({
  headScriptsJson,
  pathname,
}: BrandHeadScriptsProps) {
  if (!isPublicMarketingPath(pathname)) {
    return null
  }

  const active = parseHeadScriptsJson(headScriptsJson).filter(
    (s) => s.enabled && s.code.trim()
  )
  if (active.length === 0) {
    return null
  }

  return (
    <>
      {active.map((script) => (
        <SnippetNodes key={script.id} script={script} />
      ))}
    </>
  )
}
