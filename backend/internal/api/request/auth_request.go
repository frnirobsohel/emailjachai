package request

type RegisterRequest struct {
	FirstName string `json:"firstName" binding:"required"`
	LastName  string `json:"lastName"  binding:"required"`
	Email     string `json:"email"     binding:"required,email,not_disposable"`
	Password  string `json:"password"  binding:"required,strong_password"`
}

type LoginRequest struct {
	Email    string `json:"email" binding:"required,email"`
	Password string `json:"password" binding:"required"`
}

type UpdateProfileRequest struct {
	Name            string `json:"name"`
	CurrentPassword string `json:"current_password"`
	NewPassword     string `json:"new_password" binding:"omitempty,strong_password"`
	Password        string `json:"password" binding:"omitempty,strong_password"` // Compatibility
}
