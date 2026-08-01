package helper

import (
	"regexp"
	"strings"
)

var (
	reScriptBlock   = regexp.MustCompile(`(?is)<\s*script[^>]*>.*?<\s*/\s*script\s*>`)
	reIframeBlock   = regexp.MustCompile(`(?is)<\s*iframe[^>]*>.*?<\s*/\s*iframe\s*>`)
	reObjectBlock   = regexp.MustCompile(`(?is)<\s*object[^>]*>.*?<\s*/\s*object\s*>`)
	reEmbedOpen     = regexp.MustCompile(`(?is)<\s*(script|iframe|object|embed|link|meta|base)[^>]*/?\s*>`)
	reEventHandler  = regexp.MustCompile(`(?i)\son[a-z]+\s*=\s*("[^"]*"|'[^']*'|[^\s>]+)`)
	reJSURL         = regexp.MustCompile(`(?i)(javascript|vbscript|data)\s*:`)
)

// SanitizeEmailTemplateHTML strips high-risk HTML from admin email templates.
func SanitizeEmailTemplateHTML(s string) string {
	s = reScriptBlock.ReplaceAllString(s, "")
	s = reIframeBlock.ReplaceAllString(s, "")
	s = reObjectBlock.ReplaceAllString(s, "")
	s = reEmbedOpen.ReplaceAllString(s, "")
	s = reEventHandler.ReplaceAllString(s, "")
	s = reJSURL.ReplaceAllString(s, "")
	return strings.TrimSpace(s)
}
