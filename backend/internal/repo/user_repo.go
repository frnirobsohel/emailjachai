package repo

import (
	"ejp-backend/internal/model"
	"ejp-backend/pkg/config"

	"gorm.io/gorm"
)

type UserRepo interface {
	GetByID(id uint) (*model.User, error)
	GetByEmail(email string) (*model.User, error)
	Create(user *model.User) error
	Update(user *model.User, updates map[string]interface{}) error
	GetAll() ([]model.User, error)
	Delete(id uint) error
}

type userRepo struct {
	db *gorm.DB
}

func NewUserRepo() UserRepo {
	return &userRepo{db: config.DB}
}

func (r *userRepo) GetByID(id uint) (*model.User, error) {
	var user model.User
	if err := r.db.First(&user, id).Error; err != nil {
		return nil, err
	}
	return &user, nil
}

func (r *userRepo) GetByEmail(email string) (*model.User, error) {
	var user model.User
	if err := r.db.Where("email = ?", email).First(&user).Error; err != nil {
		return nil, err
	}
	return &user, nil
}

func (r *userRepo) Create(user *model.User) error {
	return r.db.Create(user).Error
}

func (r *userRepo) Update(user *model.User, updates map[string]interface{}) error {
	return r.db.Model(user).Updates(updates).Error
}

func (r *userRepo) GetAll() ([]model.User, error) {
	var users []model.User
	err := r.db.Order("created_at DESC").Find(&users).Error
	return users, err
}

func (r *userRepo) Delete(id uint) error {
	return r.db.Transaction(func(tx *gorm.DB) error {
		tx.Where("user_id = ?", id).Delete(&model.APIKey{})
		tx.Where("user_id = ?", id).Delete(&model.Transaction{})
		tx.Where("user_id = ?", id).Delete(&model.Job{})
		return tx.Delete(&model.User{}, id).Error
	})
}
