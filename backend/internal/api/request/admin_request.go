package request

type AddDomainRequest struct {
	DomainName string `json:"domain_name" binding:"required,valid_domain"`
	Type       string `json:"type"        binding:"required"`
}

type IDRequest struct {
	ID uint `json:"id" binding:"required"`
}

type AddServerRequest struct {
	Name string `json:"name"       binding:"required"`
	IP   string `json:"ip_address" binding:"required,ipv4_or_ipv6"`
}

type CreatePackageRequest struct {
	Name          string      `json:"name" binding:"required"`
	Tagline       string      `json:"tagline"`
	CreditsAmount int         `json:"credits_amount" binding:"required"`
	Price         float64     `json:"price"`
	Features      interface{} `json:"features"`
	Enabled       bool        `json:"enabled"`
	Popular       bool        `json:"popular"`
}
