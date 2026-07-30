package presenter

type UserResponse struct {
	ID        uint   `json:"id"`
	Name      string `json:"name"`
	Email     string `json:"email"`
	Credits   int    `json:"credits"`
	Role      string `json:"role"`
	Status    string `json:"status"`
	CreatedAt string `json:"created_at"`
}

type AuthResponse struct {
	APIKey string       `json:"api_key"`
	User   UserResponse `json:"user"`
}
