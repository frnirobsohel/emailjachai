package service

import (
	"testing"

	"ejp-backend/internal/model"
)

func TestAllowedEmailTemplateKeys(t *testing.T) {
	if !AllowedEmailTemplateKeys["register"] {
		t.Fatal("register must be allowed")
	}
	if AllowedEmailTemplateKeys["custom_spam"] {
		t.Fatal("unknown template must be rejected")
	}
}

func TestSaveTemplate_RejectsUnknownKey(t *testing.T) {
	s := &systemService{systemRepo: nil}
	err := s.SaveTemplate(&model.EmailTemplate{
		TemplateName: "not_a_real_template",
		Subject:      "Hi",
		Body:         "Body",
		IsActive:     true,
	})
	if err != ErrTemplateNameInvalid {
		t.Fatalf("got %v, want ErrTemplateNameInvalid", err)
	}
}

func TestSaveTemplate_RequiresSubjectBody(t *testing.T) {
	s := &systemService{systemRepo: nil}
	err := s.SaveTemplate(&model.EmailTemplate{
		TemplateName: "register",
		Subject:      "",
		Body:         "Body",
		IsActive:     true,
	})
	if err == nil {
		t.Fatal("expected error for empty subject")
	}
}
