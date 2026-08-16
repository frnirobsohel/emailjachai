package engine

import (
	"bufio"
	"errors"
	"fmt"
	"net"
	"strconv"
	"strings"
	"testing"
	"time"
)

func TestProbeSMTPCatchAllClassification(t *testing.T) {
	prevResolve := resolvePublicSMTP
	resolvePublicSMTP = allowLoopbackSMTPResolve
	t.Cleanup(func() { resolvePublicSMTP = prevResolve })

	deadline := time.Now().Add(15 * time.Second)

	t.Run("valid when random is 550", func(t *testing.T) {
		host, port := startFakeSMTP(t, 250, 550)
		prev := smtpDialPort
		smtpDialPort = port
		t.Cleanup(func() { smtpDialPort = prev })

		res := probeSMTP(host, "example.com", "user@example.com", deadline)
		if !res.Accepted || res.CatchAllResult != CatchAllRejected {
			t.Fatalf("accepted=%v catchAll=%q", res.Accepted, res.CatchAllResult)
		}
		st, _, _, deliv, catchAll := StatusForAcceptedRCPT(res.CatchAllResult)
		if st != "valid" || !deliv || catchAll {
			t.Fatalf("status=%s deliv=%v catchAll=%v", st, deliv, catchAll)
		}
	})

	t.Run("catch_all when random is 250", func(t *testing.T) {
		host, port := startFakeSMTP(t, 250, 250)
		prev := smtpDialPort
		smtpDialPort = port
		t.Cleanup(func() { smtpDialPort = prev })

		res := probeSMTP(host, "example.com", "user@example.com", deadline)
		if !res.Accepted || res.CatchAllResult != CatchAllAccepted {
			t.Fatalf("accepted=%v catchAll=%q", res.Accepted, res.CatchAllResult)
		}
		st, _, _, deliv, catchAll := StatusForAcceptedRCPT(res.CatchAllResult)
		if st != "catch_all" || deliv || !catchAll {
			t.Fatalf("status=%s deliv=%v catchAll=%v", st, deliv, catchAll)
		}
	})

	t.Run("unknown when random is greylisted 450", func(t *testing.T) {
		host, port := startFakeSMTP(t, 250, 450)
		prev := smtpDialPort
		smtpDialPort = port
		t.Cleanup(func() { smtpDialPort = prev })

		res := probeSMTP(host, "example.com", "user@example.com", deadline)
		if !res.Accepted || res.CatchAllResult != CatchAllInconclusive {
			t.Fatalf("accepted=%v catchAll=%q", res.Accepted, res.CatchAllResult)
		}
		st, _, reason, deliv, catchAll := StatusForAcceptedRCPT(res.CatchAllResult)
		if st != "unknown" || reason != "catchall_inconclusive" || deliv || catchAll {
			t.Fatalf("status=%s reason=%s deliv=%v catchAll=%v", st, reason, deliv, catchAll)
		}
	})
}

func TestProbeSMTPSkipsPrivateMX(t *testing.T) {
	dials := 0
	prevDial := smtpDial
	smtpDial = func(network, address string, timeout time.Duration) (net.Conn, error) {
		dials++
		t.Fatalf("dialed blocked SMTP target %s", address)
		return nil, errors.New("should not dial")
	}
	t.Cleanup(func() { smtpDial = prevDial })

	deadline := time.Now().Add(5 * time.Second)
	for _, host := range []string{"127.0.0.1", "10.0.0.1", "192.168.1.1", "169.254.169.254", "::1"} {
		res := probeSMTP(host, "example.com", "user@example.com", deadline)
		if !res.Blocked || res.Connected {
			t.Fatalf("%s: blocked=%v connected=%v", host, res.Blocked, res.Connected)
		}
	}
	if dials != 0 {
		t.Fatalf("dial count = %d, want 0", dials)
	}
}

func allowLoopbackSMTPResolve(host string) ([]net.IP, error) {
	host = strings.TrimSpace(host)
	host = strings.TrimPrefix(host, "[")
	host = strings.TrimSuffix(host, "]")
	if ip := net.ParseIP(host); ip != nil {
		return []net.IP{ip}, nil
	}
	return PublicSMTPDialIPs(host)
}

func startFakeSMTP(t *testing.T, targetCode, randomCode int) (host, port string) {
	t.Helper()
	ln, err := net.Listen("tcp", "127.0.0.1:0")
	if err != nil {
		t.Fatal(err)
	}
	t.Cleanup(func() { _ = ln.Close() })

	go func() {
		for {
			conn, err := ln.Accept()
			if err != nil {
				return
			}
			go handleFakeSMTP(conn, targetCode, randomCode)
		}
	}()

	tcpAddr, ok := ln.Addr().(*net.TCPAddr)
	if !ok {
		t.Fatal("expected tcp addr")
	}
	return "127.0.0.1", strconv.Itoa(tcpAddr.Port)
}

func handleFakeSMTP(conn net.Conn, targetCode, randomCode int) {
	defer conn.Close()
	_ = conn.SetDeadline(time.Now().Add(10 * time.Second))
	br := bufio.NewReader(conn)
	write := func(s string) {
		_, _ = conn.Write([]byte(s + "\r\n"))
	}
	write("220 fake.example ESMTP")
	rcptN := 0
	for {
		line, err := br.ReadString('\n')
		if err != nil {
			return
		}
		cmd := strings.ToUpper(strings.TrimSpace(line))
		switch {
		case strings.HasPrefix(cmd, "EHLO"), strings.HasPrefix(cmd, "HELO"):
			write("250 fake.example")
		case strings.HasPrefix(cmd, "MAIL"):
			write("250 2.1.0 OK")
		case strings.HasPrefix(cmd, "RCPT"):
			code := targetCode
			if rcptN > 0 {
				code = randomCode
			}
			rcptN++
			write(fmt.Sprintf("%d test", code))
		case strings.HasPrefix(cmd, "RSET"):
			write("250 2.0.0 OK")
		case strings.HasPrefix(cmd, "QUIT"):
			write("221 2.0.0 Bye")
			return
		default:
			write("250 OK")
		}
	}
}
