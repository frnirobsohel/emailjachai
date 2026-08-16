package engine

import (
	"errors"
	"net/textproto"
	"strings"
	"unicode"
)

// CatchAllResult is the outcome of the random-local-part RCPT probe.
// A real mailbox is only "valid" when this probe is Rejected (typically 550).
type CatchAllResult string

const (
	CatchAllRejected     CatchAllResult = "rejected"
	CatchAllAccepted     CatchAllResult = "accepted"
	CatchAllInconclusive CatchAllResult = "inconclusive"
)

func SMTPReplyCode(err error) int {
	if err == nil {
		return 250
	}
	var tp *textproto.Error
	if errors.As(err, &tp) && tp != nil && tp.Code >= 100 && tp.Code <= 599 {
		return tp.Code
	}
	s := strings.TrimSpace(err.Error())
	n := 0
	digits := 0
	for _, r := range s {
		if !unicode.IsDigit(r) {
			break
		}
		n = n*10 + int(r-'0')
		digits++
		if digits == 3 {
			break
		}
	}
	if digits == 3 && n >= 100 && n <= 599 {
		return n
	}
	return 0
}

func ClassifyCatchAllRCPT(err error) CatchAllResult {
	if err == nil {
		return CatchAllAccepted
	}
	code := SMTPReplyCode(err)
	switch {
	case code >= 200 && code <= 299:
		return CatchAllAccepted
	case code == 552:
		return CatchAllAccepted
	case code >= 500 && code <= 599:
		return CatchAllRejected
	default:
		return CatchAllInconclusive
	}
}

// ClassifyTargetRCPT maps the real-address RCPT error using the leading SMTP
// code only. 4xx → unknown. 552 → mailbox full. 550/551/553/554/521/556 → invalid.
func ClassifyTargetRCPT(err error) (hardFail, mailboxFull bool) {
	if err == nil {
		return false, false
	}
	code := SMTPReplyCode(err)
	msg := strings.ToLower(err.Error())
	if code == 552 || strings.Contains(msg, "storage limit") || strings.Contains(msg, "over quota") {
		return false, true
	}
	if isPermanentRecipientReject(code) {
		return true, false
	}
	return false, false
}

func isPermanentRecipientReject(code int) bool {
	switch code {
	case 550, 551, 553, 554, 521, 556:
		return true
	default:
		return false
	}
}

func StatusForAcceptedRCPT(catchAll CatchAllResult) (status string, score int, reason string, deliverable, isCatchAll bool) {
	switch catchAll {
	case CatchAllAccepted:
		return "catch_all", 55, "catch_all", false, true
	case CatchAllRejected:
		return "valid", 100, "accepted", true, false
	default:
		return "unknown", 35, "catchall_inconclusive", false, false
	}
}

func SMTPProbeDisposition(accepted bool, catchAll CatchAllResult, hardFail, mailboxFull, priorInconclusiveAccept bool) (status string, score int, reason string, deliverable, isCatchAll, done, inconclusiveAccept bool) {
	if accepted {
		st, sc, reason, deliv, ca := StatusForAcceptedRCPT(catchAll)
		if reason == "catchall_inconclusive" {
			return "", 0, "", false, false, false, true
		}
		return st, sc, reason, deliv, ca, true, false
	}
	if mailboxFull {
		return "valid", 100, "mailbox_full", true, false, true, false
	}
	if hardFail && !priorInconclusiveAccept {
		return "invalid", 0, "rejected", false, false, true, false
	}
	return "", 0, "", false, false, false, false
}
