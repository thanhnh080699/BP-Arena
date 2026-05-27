package handlers

import (
	"bp-arena/server/internal/models"
	"github.com/gin-gonic/gin"
	"gorm.io/gorm"
	"net/http"
)

type AuthHandler struct {
	DB *gorm.DB
}

type LoginRequest struct {
	Username string `json:"username" binding:"required"`
	Password string `json:"password" binding:"required"`
}

func (h *AuthHandler) Login(c *gin.Context) {
	var req LoginRequest
	if err := c.ShouldBindJSON(&req); err != nil {
		c.JSON(http.StatusBadRequest, gin.H{"error": "Invalid request"})
		return
	}

	var user models.User
	if err := h.DB.Where("username = ? AND password = ?", req.Username, req.Password).First(&user).Error; err != nil {
		c.JSON(http.StatusUnauthorized, gin.H{"error": "Invalid username or password"})
		return
	}

	c.JSON(http.StatusOK, gin.H{
		"message":  "Login successful",
		"username": user.Username,
	})
}
