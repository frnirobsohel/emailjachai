package handler

import (
	"strings"
	"testing"
)

func TestExtractEmails_UsesEmailHeaderColumnOnly(t *testing.T) {
	content := `Domain,Email,Status,Score,MX Record,Reason,Verified At,Job ID
sourzzin.com,mfernandez@sourzzin.com,catch_all,55,sourzzin-com.mail.protection.outlook.com,Catch-all Domain (Accepts all incoming mail),2026-07-29 19:47:31,job_abc
cosmeticosalamoda.com,ernesto@cosmeticosalamoda.com,catch_all,55,aspmx.l.google.com; alt1.aspmx.l.google.com,Catch-all Domain,2026-07-29 19:47:31,job_abc
mainspirium.com,alex@mainspirium.com,valid,100,mx00.ionos.es; mx01.ionos.es,Deliverable (Valid Inbox),2026-07-29 19:47:31,job_abc
`
	unique, occurrences, err := extractEmailsFromReader(strings.NewReader(content), 100000)
	if err != nil {
		t.Fatal(err)
	}
	if len(unique) != 3 {
		t.Fatalf("unique=%d want 3 (%v)", len(unique), unique)
	}
	if occurrences != 3 {
		t.Fatalf("occurrences=%d want 3", occurrences)
	}
	if occurrences-len(unique) != 0 {
		t.Fatalf("duplicates_removed=%d want 0", occurrences-len(unique))
	}
	want := map[string]bool{
		"mfernandez@sourzzin.com":          true,
		"ernesto@cosmeticosalamoda.com":    true,
		"alex@mainspirium.com":             true,
	}
	for _, e := range unique {
		if !want[e] {
			t.Fatalf("unexpected email %q", e)
		}
	}
}

func TestExtractEmails_EmailAddressHeader(t *testing.T) {
	content := "Name,Email Address,Phone\nAda,ada@lovelace.com,555\nBob,bob@example.com,123\n"
	unique, occurrences, err := extractEmailsFromReader(strings.NewReader(content), 100000)
	if err != nil {
		t.Fatal(err)
	}
	if len(unique) != 2 || occurrences != 2 {
		t.Fatalf("unique=%d occurrences=%d want 2/2 (%v)", len(unique), occurrences, unique)
	}
}

func TestExtractEmails_IgnoresOtherColumnsWithAt(t *testing.T) {
	// Status/reason text must not be scraped when Email column exists
	content := "Email,Note\na@x.com,contact support@help.com for help\nb@y.com,ok\n"
	unique, occurrences, err := extractEmailsFromReader(strings.NewReader(content), 100000)
	if err != nil {
		t.Fatal(err)
	}
	if occurrences != 2 || len(unique) != 2 {
		t.Fatalf("unique=%d occurrences=%d want 2/2 (%v)", len(unique), occurrences, unique)
	}
	for _, e := range unique {
		if e == "support@help.com" {
			t.Fatal("scraped email from Note column")
		}
	}
}

func TestExtractEmails_PlainListFallback(t *testing.T) {
	content := "a@x.com\na@x.com\nb@y.com\n"
	unique, occurrences, err := extractEmailsFromReader(strings.NewReader(content), 100000)
	if err != nil {
		t.Fatal(err)
	}
	if len(unique) != 2 || occurrences != 3 {
		t.Fatalf("unique=%d occurrences=%d", len(unique), occurrences)
	}
	if occurrences-len(unique) != 1 {
		t.Fatalf("dups=%d want 1", occurrences-len(unique))
	}
}

func TestFindEmailHeaderColumn(t *testing.T) {
	cases := []struct {
		headers []string
		want    int
	}{
		{[]string{"Domain", "Email", "Status"}, 1},
		{[]string{"email_address", "name"}, 0},
		{[]string{"Name", "Phone"}, -1},
		{[]string{"User Email", "ID"}, 0},
		{[]string{"Email Status", "Contact Email"}, 1},
		{[]string{"Email Type", "Name"}, -1},
		{[]string{"EMAIL", "Domain"}, 0},
	}
	for _, tc := range cases {
		got := findEmailHeaderColumn(tc.headers)
		if got != tc.want {
			t.Fatalf("headers=%v got=%d want=%d", tc.headers, got, tc.want)
		}
	}
}

func TestExtractEmails_LowercaseHeader(t *testing.T) {
	content := "domain,email,status\na.com,a@x.com,ok\nb.com,b@y.com,ok\n"
	unique, occurrences, err := extractEmailsFromReader(strings.NewReader(content), 100000)
	if err != nil {
		t.Fatal(err)
	}
	if len(unique) != 2 || occurrences != 2 {
		t.Fatalf("unique=%d occurrences=%d (%v)", len(unique), occurrences, unique)
	}
}

func TestExtractEmails_NamedColumnMustContainEmails(t *testing.T) {
	// "Email" header but cells are statuses — should not trust that column alone
	content := "Email,Contact\nvalid,a@x.com\ninvalid,b@y.com\n"
	unique, occurrences, err := extractEmailsFromReader(strings.NewReader(content), 100000)
	if err != nil {
		t.Fatal(err)
	}
	if len(unique) != 2 || occurrences != 2 {
		t.Fatalf("unique=%d occurrences=%d want 2/2 (%v)", len(unique), occurrences, unique)
	}
	for _, e := range unique {
		if e == "valid" || e == "invalid" {
			t.Fatalf("took status cell %q", e)
		}
	}
}

func TestExtractEmails_PicksColumnWithActualEmails(t *testing.T) {
	content := "Name,Email Status,Contact\nAda,active,ada@x.com\nBob,pending,bob@y.com\n"
	unique, occurrences, err := extractEmailsFromReader(strings.NewReader(content), 100000)
	if err != nil {
		t.Fatal(err)
	}
	if len(unique) != 2 || occurrences != 2 {
		t.Fatalf("unique=%d occurrences=%d want 2/2 (%v)", len(unique), occurrences, unique)
	}
}

func TestExtractEmails_IgnoresFreeTextAtInOtherColumn(t *testing.T) {
	content := "Email,Note\n,\ncontact support@help.com please\na@x.com,ok\nb@y.com,ping admin@z.com\n"
	unique, occurrences, err := extractEmailsFromReader(strings.NewReader(content), 100000)
	if err != nil {
		t.Fatal(err)
	}
	if occurrences != 2 || len(unique) != 2 {
		t.Fatalf("unique=%d occurrences=%d (%v)", len(unique), occurrences, unique)
	}
	for _, e := range unique {
		if strings.Contains(e, " ") || e == "support@help.com" || e == "admin@z.com" {
			t.Fatalf("unexpected %q", e)
		}
	}
}

func TestExtractEmails_PlaceholderHeavyEmailColumn(t *testing.T) {
	content := "Email,Name\na@x.com,Ada\nN/A,Bob\nN/A,Cam\nb@y.com,Dan\n"
	unique, occurrences, err := extractEmailsFromReader(strings.NewReader(content), 100000)
	if err != nil {
		t.Fatal(err)
	}
	if len(unique) != 2 || occurrences != 2 {
		t.Fatalf("unique=%d occurrences=%d (%v)", len(unique), occurrences, unique)
	}
}
