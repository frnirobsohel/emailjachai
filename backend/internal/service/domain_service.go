package service

import (
	"errors"
	"fmt"
	"strings"

	"ejp-backend/internal/helper"
	"ejp-backend/internal/model"
	"ejp-backend/internal/repo"
	"ejp-backend/pkg/config"

	"gorm.io/gorm"
)

var (
	ErrDomainRequired      = errors.New("domain name is required")
	ErrDomainInvalidFormat = errors.New("invalid domain format")
	ErrDomainInvalidType   = errors.New("invalid domain type")
	ErrDomainExists        = errors.New("domain already exists")
	ErrDomainNotFound      = errors.New("domain not found")
	ErrDomainBulkTooLarge  = errors.New("bulk upload exceeds maximum of 50000 domains")
	ErrDomainBulkEmpty     = errors.New("no domains found in upload")
)

var allowedDomainTypes = map[string]bool{
	"disposable": true,
	"free":       true,
	"blacklist":  true,
	"spam-trap":  true,
}

const maxBulkDomains = 50000

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

func normalizeDomainType(domainType string) (string, error) {
	domainType = strings.ToLower(strings.TrimSpace(domainType))
	if domainType == "spam_trap" {
		domainType = "spam-trap"
	}
	if !allowedDomainTypes[domainType] {
		return "", ErrDomainInvalidType
	}
	return domainType, nil
}

func normalizeDomainName(name string) (string, error) {
	name = strings.ToLower(strings.TrimSpace(name))
	name = strings.TrimPrefix(name, "http://")
	name = strings.TrimPrefix(name, "https://")
	name = strings.TrimPrefix(name, "www.")
	name = strings.Trim(name, "/")
	if name == "" {
		return "", ErrDomainRequired
	}
	if !helper.IsValidDomain(name) {
		return "", ErrDomainInvalidFormat
	}
	return name, nil
}

func isDuplicateKey(err error) bool {
	if err == nil {
		return false
	}
	if errors.Is(err, gorm.ErrDuplicatedKey) {
		return true
	}
	msg := strings.ToLower(err.Error())
	return strings.Contains(msg, "duplicate") || strings.Contains(msg, "unique")
}

func (s *domainService) GetDomains(search, domainType string, limit, offset int) ([]model.Domain, int64, map[string]interface{}, error) {
	if domainType != "" {
		normalized, err := normalizeDomainType(domainType)
		if err != nil {
			return nil, 0, nil, err
		}
		domainType = normalized
	}
	domains, total, err := s.repo.List(search, domainType, limit, offset)
	if err != nil {
		return nil, 0, nil, err
	}
	stats, err := s.repo.GetStats()
	return domains, total, stats, err
}

func (s *domainService) AddDomain(name, domainType string, adminID uint) error {
	name, err := normalizeDomainName(name)
	if err != nil {
		return err
	}
	domainType, err = normalizeDomainType(domainType)
	if err != nil {
		return err
	}

	domain := &model.Domain{
		Domain:   name,
		Type:     domainType,
		Excluded: false,
		AddedBy:  &adminID,
	}
	if err := s.repo.Create(domain); err != nil {
		if isDuplicateKey(err) {
			return ErrDomainExists
		}
		return err
	}

	s.logActivity("INFO", "Admin", fmt.Sprintf("Added domain: %s (%s)", name, domainType), adminID)
	config.BumpDomainCacheRevision()
	return nil
}

func (s *domainService) DeleteDomain(id, adminID uint) error {
	if err := s.repo.Delete(id); err != nil {
		if errors.Is(err, gorm.ErrRecordNotFound) {
			return ErrDomainNotFound
		}
		return err
	}
	s.logActivity("WARN", "Admin", fmt.Sprintf("Deleted domain #%d", id), adminID)
	config.BumpDomainCacheRevision()
	return nil
}

func (s *domainService) ToggleDomain(id, adminID uint) (bool, error) {
	status, err := s.repo.ToggleStatus(id)
	if err != nil {
		if errors.Is(err, gorm.ErrRecordNotFound) {
			return false, ErrDomainNotFound
		}
		return false, err
	}
	s.logActivity("INFO", "Admin", fmt.Sprintf("Toggled domain #%d, new excluded state: %v", id, status), adminID)
	config.BumpDomainCacheRevision()
	return status, nil
}

func (s *domainService) BulkUpload(content string, domainType string, adminID uint) (int, int, int, error) {
	domainType, err := normalizeDomainType(domainType)
	if err != nil {
		return 0, 0, 0, err
	}

	content = strings.TrimPrefix(content, "\xef\xbb\xbf")
	lines := strings.Split(content, "\n")

	invalid := 0
	seen := make(map[string]struct{})
	var domainsToInsert []*model.Domain

	for _, line := range lines {
		line = strings.TrimSpace(line)
		if line == "" {
			continue
		}
		parts := strings.Split(line, ",")
		raw := strings.ToLower(strings.TrimSpace(parts[0]))
		raw = strings.Trim(raw, `"'`)

		name, nErr := normalizeDomainName(raw)
		if nErr != nil {
			invalid++
			continue
		}
		if _, ok := seen[name]; ok {
			continue
		}
		seen[name] = struct{}{}

		if len(domainsToInsert) >= maxBulkDomains {
			return 0, 0, invalid, ErrDomainBulkTooLarge
		}

		domainsToInsert = append(domainsToInsert, &model.Domain{
			Domain:   name,
			Type:     domainType,
			Excluded: false,
			AddedBy:  &adminID,
		})
	}

	if len(domainsToInsert) == 0 {
		return 0, 0, invalid, ErrDomainBulkEmpty
	}

	inserted, err := s.repo.BulkCreate(domainsToInsert)
	if err != nil {
		return 0, 0, invalid, err
	}
	added := int(inserted)
	duplicates := len(domainsToInsert) - added

	s.logActivity("INFO", "Admin", fmt.Sprintf("Bulk uploaded domains: %d processed (%d added, %d duplicates), %d invalid", len(domainsToInsert), added, duplicates, invalid), adminID)
	config.BumpDomainCacheRevision()
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
