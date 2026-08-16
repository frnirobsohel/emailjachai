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
