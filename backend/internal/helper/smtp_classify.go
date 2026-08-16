package helper

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

// SMTPReplyCode extracts the numeric SMTP code from an RCPT/MAIL error.
// nil means the command succeeded (250-class).
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

// ClassifyCatchAllRCPT interprets the random address RCPT reply.
// Only a completed 5xx (except 552 over-quota) proves the MX can reject unknowns.
func ClassifyCatchAllRCPT(err error) CatchAllResult {
	if err == nil {
		return CatchAllAccepted
	}
	code := SMTPReplyCode(err)
	switch {
	case code >= 200 && code <= 299:
		return CatchAllAccepted
	case code == 552:
		// Random mailbox "exists but full" is almost certainly accept-all.
		return CatchAllAccepted
	case code >= 500 && code <= 599:
		return CatchAllRejected
	default:
		return CatchAllInconclusive
	}
}

// ClassifyTargetRCPT maps the real-address RCPT error using the leading SMTP
// code only (never a substring match). RFC 5321: 4xx is temporary → unknown;
// 5xx is permanent. 552 is over-quota (mailbox exists). Protocol errors
// (500–504, 555) stay unknown. 554 is RFC "transaction failed" — permanent
// refuse of this send, so invalid for verification (not retry/unknown).
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

// StatusForAcceptedRCPT maps a successful target RCPT plus catch-all probe
// onto the public verification status. Never returns valid unless the random
// probe was a hard reject.
func StatusForAcceptedRCPT(catchAll CatchAllResult) (status string, score int, reason string, deliverable, isCatchAll bool) {
	switch catchAll {
	case CatchAllAccepted:
		return "catch_all", ScoreForStatus("catch_all"), "catch_all", false, true
	case CatchAllRejected:
		return "valid", ScoreForStatus("valid"), "accepted", true, false
	default:
		return "unknown", ScoreForStatus("unknown"), "catchall_inconclusive", false, false
	}
}

// SMTPProbeDisposition decides whether one MX answer is final.
// If a prior MX already accepted the target but catch-all was greylisted,
// a later MX 550 must not flip the result to invalid.
func SMTPProbeDisposition(accepted bool, catchAll CatchAllResult, hardFail, mailboxFull, priorInconclusiveAccept bool) (status string, score int, reason string, deliverable, isCatchAll, done, inconclusiveAccept bool) {
	if accepted {
		st, sc, reason, deliv, ca := StatusForAcceptedRCPT(catchAll)
		if reason == "catchall_inconclusive" {
			return "", 0, "", false, false, false, true
		}
		return st, sc, reason, deliv, ca, true, false
	}
	if mailboxFull {
		return "valid", ScoreForStatus("valid"), "mailbox_full", true, false, true, false
	}
	if hardFail && !priorInconclusiveAccept {
		return "invalid", 0, "rejected", false, false, true, false
	}
	return "", 0, "", false, false, false, false
}

// IsSafeToSend is true only for a confirmed inbox: valid, deliverable, not accept-all.
func IsSafeToSend(status string, deliverable, catchAll bool) bool {
	return NormalizeVerificationStatus(status) == "valid" && deliverable && !catchAll
}
