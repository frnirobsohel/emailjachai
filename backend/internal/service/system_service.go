package service

type SystemService interface {
	GetStatus() (interface{}, error)
	ListBackups() (interface{}, error)
	CreateBackup() error
	GetSmtpSettings() (interface{}, error)
	SaveSmtpSettings(settings map[string]string) error
}

type systemService struct{}

func NewSystemService() SystemService {
	return &systemService{}
}

func (s *systemService) GetStatus() (interface{}, error) {
	return map[string]string{"status": "running"}, nil
}

func (s *systemService) ListBackups() (interface{}, error) {
	return []string{}, nil
}

func (s *systemService) CreateBackup() error {
	return nil
}

func (s *systemService) GetSmtpSettings() (interface{}, error) {
	return map[string]string{}, nil
}

func (s *systemService) SaveSmtpSettings(settings map[string]string) error {
	return nil
}
