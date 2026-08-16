package helper

import (
	"errors"
	"net/textproto"
	"testing"
)

func TestSMTPReplyCode(t *testing.T) {
	if got := SMTPReplyCode(nil); got != 250 {
		t.Fatalf("nil = %d, want 250", got)
	}
	if got := SMTPReplyCode(&textproto.Error{Code: 550, Msg: "user unknown"}); got != 550 {
		t.Fatalf("textproto 550 = %d", got)
	}
	if got := SMTPReplyCode(errors.New("450 4.7.1 greylisted")); got != 450 {
		t.Fatalf("string 450 = %d", got)
	}
	if got := SMTPReplyCode(errors.New("timeout")); got != 0 {
		t.Fatalf("timeout = %d, want 0", got)
	}
}

func TestClassifyCatchAllRCPT(t *testing.T) {
	cases := []struct {
		err  error
		want CatchAllResult
	}{
		{nil, CatchAllAccepted},
		{&textproto.Error{Code: 250, Msg: "ok"}, CatchAllAccepted},
		{&textproto.Error{Code: 552, Msg: "over quota"}, CatchAllAccepted},
		{&textproto.Error{Code: 550, Msg: "user unknown"}, CatchAllRejected},
		{&textproto.Error{Code: 551, Msg: "user not local"}, CatchAllRejected},
		{&textproto.Error{Code: 553, Msg: "mailbox name not allowed"}, CatchAllRejected},
		{&textproto.Error{Code: 554, Msg: "transaction failed"}, CatchAllRejected},
		{&textproto.Error{Code: 450, Msg: "greylisted"}, CatchAllInconclusive},
		{&textproto.Error{Code: 451, Msg: "try again"}, CatchAllInconclusive},
		{errors.New("i/o timeout"), CatchAllInconclusive},
	}
	for _, tc := range cases {
		if got := ClassifyCatchAllRCPT(tc.err); got != tc.want {
			t.Fatalf("ClassifyCatchAllRCPT(%v) = %q, want %q", tc.err, got, tc.want)
		}
	}
}

func TestStatusForAcceptedRCPT(t *testing.T) {
	st, score, reason, deliv, catchAll := StatusForAcceptedRCPT(CatchAllRejected)
	if st != "valid" || score != 100 || reason != "accepted" || !deliv || catchAll {
		t.Fatalf("rejected probe: %s score=%d reason=%s deliv=%v catchAll=%v", st, score, reason, deliv, catchAll)
	}

	st, score, reason, deliv, catchAll = StatusForAcceptedRCPT(CatchAllAccepted)
	if st != "catch_all" || score != 55 || reason != "catch_all" || deliv || !catchAll {
		t.Fatalf("accepted probe: %s score=%d reason=%s deliv=%v catchAll=%v", st, score, reason, deliv, catchAll)
	}

	st, score, reason, deliv, catchAll = StatusForAcceptedRCPT(CatchAllInconclusive)
	if st != "unknown" || score != 35 || reason != "catchall_inconclusive" || deliv || catchAll {
		t.Fatalf("inconclusive: %s score=%d reason=%s deliv=%v catchAll=%v", st, score, reason, deliv, catchAll)
	}
}

func TestClassifyTargetRCPT(t *testing.T) {
	hard, full := ClassifyTargetRCPT(nil)
	if hard || full {
		t.Fatal("nil RCPT must not be hard-fail or mailbox-full")
	}
	hard, full = ClassifyTargetRCPT(&textproto.Error{Code: 550, Msg: "user unknown"})
	if !hard || full {
		t.Fatalf("550: hard=%v full=%v", hard, full)
	}
	hard, full = ClassifyTargetRCPT(&textproto.Error{Code: 554, Msg: "policy"})
	if hard || full {
		t.Fatalf("554 must stay inconclusive, got hard=%v full=%v", hard, full)
	}
	hard, full = ClassifyTargetRCPT(&textproto.Error{Code: 450, Msg: "greylist"})
	if hard || full {
		t.Fatalf("450 must stay inconclusive, got hard=%v full=%v", hard, full)
	}
	hard, full = ClassifyTargetRCPT(&textproto.Error{Code: 552, Msg: "over quota"})
	if hard || !full {
		t.Fatalf("552: hard=%v full=%v", hard, full)
	}
}

func TestSMTPProbeDisposition(t *testing.T) {
	st, _, _, _, _, done, inc := SMTPProbeDisposition(true, CatchAllInconclusive, false, false, false)
	if done || !inc || st != "" {
		t.Fatalf("inconclusive accept should continue, done=%v inc=%v st=%q", done, inc, st)
	}

	st, _, reason, deliv, ca, done, inc := SMTPProbeDisposition(true, CatchAllRejected, false, false, false)
	if !done || inc || st != "valid" || reason != "accepted" || !deliv || ca {
		t.Fatalf("rejected random: st=%s reason=%s done=%v", st, reason, done)
	}

	st, _, _, deliv, ca, done, _ = SMTPProbeDisposition(true, CatchAllAccepted, false, false, false)
	if !done || st != "catch_all" || deliv || !ca {
		t.Fatalf("catch-all: st=%s deliv=%v ca=%v", st, deliv, ca)
	}

	st, _, reason, _, _, done, _ = SMTPProbeDisposition(false, "", true, false, false)
	if !done || st != "invalid" || reason != "rejected" {
		t.Fatalf("hard-fail: st=%s reason=%s done=%v", st, reason, done)
	}

	st, _, _, _, _, done, _ = SMTPProbeDisposition(false, "", true, false, true)
	if done {
		t.Fatal("later MX 550 after greylist hole must not become invalid")
	}

	st, _, reason, deliv, _, done, _ = SMTPProbeDisposition(false, "", false, true, false)
	if !done || st != "valid" || reason != "mailbox_full" || !deliv {
		t.Fatalf("mailbox full: st=%s reason=%s", st, reason)
	}
}

func TestIsSafeToSend(t *testing.T) {
	if !IsSafeToSend("valid", true, false) {
		t.Fatal("confirmed valid should be safe to send")
	}
	if IsSafeToSend("catch_all", false, true) {
		t.Fatal("catch-all must not be safe to send")
	}
	if IsSafeToSend("catch_all", true, true) {
		t.Fatal("catch-all with deliverable flag must still not be safe to send")
	}
	if IsSafeToSend("unknown", false, false) {
		t.Fatal("unknown must not be safe to send")
	}
	if IsSafeToSend("valid", true, true) {
		t.Fatal("valid+catchAll must not be safe to send")
	}
}
