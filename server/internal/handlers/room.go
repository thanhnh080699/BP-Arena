package handlers

import (
	"bp-arena/server/internal/models"
	"github.com/gin-gonic/gin"
	"gorm.io/gorm"
	"net/http"
)

type RoomHandler struct {
	DB *gorm.DB
}

func (h *RoomHandler) GetRooms(c *gin.Context) {
	var rooms []models.Room
	h.DB.Where("status = ?", "waiting").Find(&rooms)
	c.JSON(http.StatusOK, rooms)
}

func (h *RoomHandler) CreateRoom(c *gin.Context) {
	var room models.Room
	if err := c.ShouldBindJSON(&room); err != nil {
		c.JSON(http.StatusBadRequest, gin.H{"error": err.Error()})
		return
	}

	if err := h.DB.Create(&room).Error; err != nil {
		c.JSON(http.StatusInternalServerError, gin.H{"error": "Could not create room"})
		return
	}

	c.JSON(http.StatusOK, room)
}

func (h *RoomHandler) JoinRoom(c *gin.Context) {
	id := c.Param("id")
	var room models.Room
	if err := h.DB.First(&room, id).Error; err != nil {
		c.JSON(http.StatusNotFound, gin.H{"error": "Room not found"})
		return
	}

	// Logic to check capacity and add player would go here
	// For now, just return the room
	c.JSON(http.StatusOK, room)
}
