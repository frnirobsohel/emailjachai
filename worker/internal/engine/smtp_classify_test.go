package engine

import (
	"errors"
	"net/textproto"
	"testing"
)

func TestClassifyCatchAllRCPT(t *testing.T) {
	cases := []struct {
		err  error
		want CatchAllResult
	}{
		{nil, CatchAllAccepted},
		{&textproto.Error{Code: 550, Msg: "user unknown"}, CatchAllRejected},
		{&textproto.Error{Code: 450, Msg: "greylisted"}, CatchAllInconclusive},
		{errors.New("i/o timeout"), CatchAllInconclusive},
		{&textproto.Error{Code: 552, Msg: "over quota"}, CatchAllAccepted},
	}
	for _, tc := range cases {
		if got := ClassifyCatchAllRCPT(tc.err); got != tc.want {
			t.Fatalf("ClassifyCatchAllRCPT(%v) = %q, want %q", tc.err, got, tc.want)
		}
	}
}

func TestClassifyTargetRCPT(t *testing.T) {
	hard, full := ClassifyTargetRCPT(&textproto.Error{Code: 550, Msg: "user unknown"})
	if !hard || full {
		t.Fatalf("550: hard=%v full=%v", hard, full)
	}
	hard, full = ClassifyTargetRCPT(&textproto.Error{Code: 554, Msg: "policy"})
	if !hard || full {
		t.Fatalf("554: hard=%v full=%v", hard, full)
	}
	hard, full = ClassifyTargetRCPT(&textproto.Error{Code: 521, Msg: "does not accept mail"})
	if !hard || full {
		t.Fatalf("521: hard=%v full=%v", hard, full)
	}
	hard, full = ClassifyTargetRCPT(&textproto.Error{Code: 556, Msg: "null mx"})
	if !hard || full {
		t.Fatalf("556: hard=%v full=%v", hard, full)
	}
	hard, full = ClassifyTargetRCPT(errors.New("450 4.7.1 greylisted; retry after 550"))
	if hard || full {
		t.Fatalf("greylist text mentioning 550 must not hard-fail, got hard=%v full=%v", hard, full)
	}
	hard, full = ClassifyTargetRCPT(&textproto.Error{Code: 503, Msg: "need MAIL first"})
	if hard || full {
		t.Fatalf("503 protocol error must stay unknown, got hard=%v full=%v", hard, full)
	}
	hard, full = ClassifyTargetRCPT(&textproto.Error{Code: 552, Msg: "over quota"})
	if hard || !full {
		t.Fatalf("552: hard=%v full=%v", hard, full)
	}
}

func TestStatusForAcceptedRCPT(t *testing.T) {
	st, _, reason, deliv, catchAll := StatusForAcceptedRCPT(CatchAllRejected)
	if st != "valid" || reason != "accepted" || !deliv || catchAll {
		t.Fatalf("rejected probe: %s reason=%s deliv=%v catchAll=%v", st, reason, deliv, catchAll)
	}
	st, _, reason, deliv, catchAll = StatusForAcceptedRCPT(CatchAllAccepted)
	if st != "catch_all" || deliv || !catchAll {
		t.Fatalf("accepted probe: %s deliv=%v catchAll=%v", st, deliv, catchAll)
	}
	st, _, reason, deliv, catchAll = StatusForAcceptedRCPT(CatchAllInconclusive)
	if st != "unknown" || reason != "catchall_inconclusive" || deliv || catchAll {
		t.Fatalf("inconclusive: %s reason=%s deliv=%v catchAll=%v", st, reason, deliv, catchAll)
	}

	_, _, _, _, _, done, inc := SMTPProbeDisposition(false, "", true, false, true)
	if done || inc {
		t.Fatal("later MX hard-fail after greylist hole must continue, not invalid")
	}
}
