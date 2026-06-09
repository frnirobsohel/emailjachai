package service

import (
	"ejp-backend/internal/model"
	"ejp-backend/internal/repo"
	"fmt"
	"regexp"
	"strings"
)

type DomainService interface {
	GetDomains(search, domainType string, limit, offset int) ([]model.Domain, int64, map[string]interface{}, error)
	AddDomain(name, domainType string, adminID uint) error
	DeleteDomain(id, adminID uint) error
	ToggleDomain(id, adminID uint) (bool, error)
	BulkUpload(content string, domainType string, adminID uint) (int, int, int, error)
}

type domainService struct {
	repo    repo.DomainRepo
	logRepo repo.LogRepo
}

func NewDomainService(repo repo.DomainRepo, logRepo repo.LogRepo) DomainService {
	return &domainService{repo: repo, logRepo: logRepo}
}

func (s *domainService) GetDomains(search, domainType string, limit, offset int) ([]model.Domain, int64, map[string]interface{}, error) {
	domains, total, err := s.repo.List(search, domainType, limit, offset)
	if err != nil {
		return nil, 0, nil, err
	}
	stats, err := s.repo.GetStats()
	return domains, total, stats, err
}

func (s *domainService) AddDomain(name, domainType string, adminID uint) error {
	name = strings.ToLower(strings.TrimSpace(name))
	if name == "" {
		return fmt.Errorf("domain name is required")
	}

	// Basic domain format check (Legacy parity)
	re := regexp.MustCompile(`^[a-z0-9]([a-z0-9\-]{0,61}[a-z0-9])?(\.[a-z]{2,})+$`)
	if !re.MatchString(name) {
		return fmt.Errorf("invalid domain format")
	}

	domain := &model.Domain{
		Domain:   name,
		Type:     domainType,
		Excluded: false,
		AddedBy:  &adminID,
	}
	if err := s.repo.Create(domain); err != nil {
		return err
	}

	s.logActivity("INFO", "Admin", fmt.Sprintf("Added domain: %s (%s)", name, domainType), adminID)
	return nil
}

func (s *domainService) DeleteDomain(id, adminID uint) error {
	if err := s.repo.Delete(id); err != nil {
		return err
	}
	s.logActivity("WARN", "Admin", fmt.Sprintf("Deleted domain #%d", id), adminID)
	return nil
}

func (s *domainService) ToggleDomain(id, adminID uint) (bool, error) {
	status, err := s.repo.ToggleStatus(id)
	if err != nil {
		return false, err
	}
	s.logActivity("INFO", "Admin", fmt.Sprintf("Toggled domain #%d, new excluded state: %v", id, status), adminID)
	return status, nil
}

func (s *domainService) BulkUpload(content string, domainType string, adminID uint) (int, int, int, error) {
	// Strip UTF-8 BOM if present
	content = strings.TrimPrefix(content, "\xef\xbb\xbf")
	
	lines := strings.Split(content, "\n")
	added := 0
	duplicates := 0
	invalid := 0

	re := regexp.MustCompile(`^[a-z0-9]([a-z0-9\-]{0,61}[a-z0-9])?(\.[a-z]{2,})+$`)

	for _, line := range lines {
		line = strings.TrimSpace(line)
		if line == "" {
			continue
		}

		// Handle CSV (first column)
		parts := strings.Split(line, ",")
		domainName := strings.ToLower(strings.TrimSpace(parts[0]))
		domainName = strings.Trim(domainName, `"'`)

		if domainName == "" || !re.MatchString(domainName) {
			invalid++
			continue
		}

		domain := &model.Domain{
			Domain:   domainName,
			Type:     domainType,
			Excluded: false,
			AddedBy:  &adminID,
		}

		if err := s.repo.Create(domain); err != nil {
			if strings.Contains(err.Error(), "unique") || strings.Contains(err.Error(), "Duplicate") || strings.Contains(err.Error(), "already exists") {
				duplicates++
			} else {
				return added, duplicates, invalid, err
			}
		} else {
			added++
		}
	}

	s.logActivity("INFO", "Admin", fmt.Sprintf("Bulk uploaded domains: added=%d duplicates=%d invalid=%d", added, duplicates, invalid), adminID)
	return added, duplicates, invalid, nil
}

func (s *domainService) logActivity(level, source, message string, adminID uint) {
	log := &model.ActivityLog{
		UserID:  &adminID,
		Level:   level,
		Source:  source,
		Message: message,
	}
	_ = s.logRepo.Create(log)
}
