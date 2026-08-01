package service

import (
	"errors"
	"testing"

	"ejp-backend/internal/model"
)

func TestNormalizeAndValidatePackage_OK(t *testing.T) {
	pkg := &model.Package{
		Name:          " Pro ",
		Tagline:       " Best ",
		CreditsAmount: 100,
		Price:         9.999,
		Features:      `[" Fast ", "", "Secure"]`,
		Status:        "active",
	}
	if err := normalizeAndValidatePackage(pkg); err != nil {
		t.Fatalf("unexpected error: %v", err)
	}
	if pkg.Name != "Pro" || pkg.Tagline != "Best" {
		t.Fatalf("trim failed: %+v", pkg)
	}
	if pkg.Price != 10.00 {
		t.Fatalf("price round = %v, want 10.00", pkg.Price)
	}
	if pkg.Description != "Best" {
		t.Fatalf("description sync = %q", pkg.Description)
	}
	if pkg.Features != `["Fast","Secure"]` {
		t.Fatalf("features = %s", pkg.Features)
	}
}

func TestNormalizeAndValidatePackage_RejectsEmptyFeatures(t *testing.T) {
	pkg := &model.Package{
		Name:          "Pro",
		CreditsAmount: 100,
		Price:         10,
		Features:      `["", "  "]`,
	}
	if err := normalizeAndValidatePackage(pkg); !errors.Is(err, ErrPackageFeaturesEmpty) {
		t.Fatalf("got %v, want ErrPackageFeaturesEmpty", err)
	}
}

func TestNormalizeAndValidatePackage_RejectsBadBounds(t *testing.T) {
	cases := []struct {
		name string
		pkg  model.Package
		want error
	}{
		{
			name: "empty name",
			pkg:  model.Package{Name: " ", CreditsAmount: 1, Price: 1, Features: `["a"]`},
			want: ErrPackageNameRequired,
		},
		{
			name: "credits zero",
			pkg:  model.Package{Name: "A", CreditsAmount: 0, Price: 1, Features: `["a"]`},
			want: ErrPackageCreditsInvalid,
		},
		{
			name: "negative price",
			pkg:  model.Package{Name: "A", CreditsAmount: 1, Price: -1, Features: `["a"]`},
			want: ErrPackagePriceNegative,
		},
		{
			name: "price too high",
			pkg:  model.Package{Name: "A", CreditsAmount: 1, Price: 1_000_000, Features: `["a"]`},
			want: ErrPackagePriceTooHigh,
		},
	}
	for _, tc := range cases {
		t.Run(tc.name, func(t *testing.T) {
			p := tc.pkg
			if err := normalizeAndValidatePackage(&p); !errors.Is(err, tc.want) {
				t.Fatalf("got %v, want %v", err, tc.want)
			}
		})
	}
}

func TestNormalizeFeaturesJSON_RejectsInvalid(t *testing.T) {
	if _, err := normalizeFeaturesJSON(`{"a":1}`); !errors.Is(err, ErrPackageFeaturesInvalid) {
		t.Fatalf("got %v, want ErrPackageFeaturesInvalid", err)
	}
}

func TestPublicListFilterContract(t *testing.T) {
	// Documents the catalog visibility rule used by repo.List(activeOnly=true):
	// status=active AND is_public=true. Both flags must be true for Buy Credits.
	type row struct {
		status   string
		isPublic bool
	}
	visible := func(r row) bool {
		return r.status == "active" && r.isPublic
	}
	cases := []struct {
		r    row
		want bool
	}{
		{row{"active", true}, true},
		{row{"active", false}, false},
		{row{"inactive", true}, false},
		{row{"inactive", false}, false},
	}
	for _, tc := range cases {
		if got := visible(tc.r); got != tc.want {
			t.Fatalf("%+v visible=%v want=%v", tc.r, got, tc.want)
		}
	}
}
