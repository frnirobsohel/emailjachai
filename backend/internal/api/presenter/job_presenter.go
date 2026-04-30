package presenter

type DetailedChecks struct {
	SafeToSend      bool `json:"safeToSend"`
	Deliverable     bool `json:"deliverable"`
	InvalidSyntax   bool `json:"invalidSyntax"`
	DisposableEmail bool `json:"disposableEmail"`
	MxRecords       bool `json:"mxRecords"`
	SmtpConnect     bool `json:"smtpConnect"`
	UserExist       bool `json:"userExist"`
	Unknown         bool `json:"unknown"`
	MailboxFull     bool `json:"mailboxFull"`
	CatchAll        bool `json:"catchAll"`
	RoleAccount     bool `json:"roleAccount"`
	FreeAccount     bool `json:"freeAccount"`
	SpamTrap        bool `json:"spamTrap"`
	Blacklist       bool `json:"blacklist"`
}

type JobResponse struct {
	ID             uint           `json:"id"`
	JobID          string         `json:"job_id"`
	Filename       string         `json:"filename"`
	Type           string         `json:"type"`
	Status         string         `json:"status"`
	TotalEmails    int            `json:"total_emails"`
	ProcessedCount int            `json:"processed_count"`
	Deliverable    int            `json:"deliverable"`
	Risky          int            `json:"risky"`
	Undeliverable  int            `json:"undeliverable"`
	CatchAll       int            `json:"catch_all"`
	Disposable     int            `json:"disposable"`
	InvalidSyntax  int            `json:"invalid_syntax"`
	RoleAccounts   int            `json:"role_accounts"`
	CreatedAt      string         `json:"created_at"`
	DetailedChecks *DetailedChecks `json:"detailedChecks,omitempty"`
	Email          string         `json:"email,omitempty"`
	Score          int            `json:"score,omitempty"`
	ProcessingTime string         `json:"processingTime,omitempty"`
}

type JobListResponse struct {
	Jobs    []JobResponse `json:"jobs"`
	Total   int           `json:"total"`
	HasMore bool          `json:"has_more"`
	Offset  int           `json:"offset"`
	Limit   int           `json:"limit"`
}
