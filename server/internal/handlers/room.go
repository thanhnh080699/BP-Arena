package handlers

import (
	"bp-arena/server/internal/models"
	"github.com/gin-gonic/gin"
	"gorm.io/gorm"
	"net/http"
	"time"
)

type RoomHandler struct {
	DB  *gorm.DB
	Hub *RoomHub
}

type heartbeatRequest struct {
	Username    string `json:"username"`
	PlayerCount int    `json:"player_count"`
	ClientIP    string `json:"client_ip"`
	Status      string `json:"status"`
}

type stateRequest struct {
	Status string `json:"status" binding:"required"`
}

type updateRoomRequest struct {
	Name          string `json:"name"`
	HostName      string `json:"host_name"`
	HostIP        string `json:"host_ip"`
	Capacity      int    `json:"capacity"`
	PlayerCount   int    `json:"player_count"`
	Status        string `json:"status"`
	GameType      string `json:"game_type"`
	AutomationKey string `json:"automation_key"`
}

type gameCreatedRequest struct {
	HostName string `json:"host_name"`
	HostIP   string `json:"host_ip"`
}

func validRoomStatus(status string) bool {
	switch status {
	case "waiting", "launching", "in_lobby", "playing", "ended", "stale":
		return true
	default:
		return false
	}
}

func (h *RoomHandler) broadcast(eventType string, room models.Room) {
	if h.Hub != nil {
		h.Hub.Broadcast(eventType, room)
	}
}

func (h *RoomHandler) expireStaleRooms() {
	cutoff := time.Now().Add(-2 * time.Minute)
	h.DB.Model(&models.Room{}).
		Where("status IN ? AND last_heartbeat IS NOT NULL AND last_heartbeat < ?", []string{"waiting", "launching", "in_lobby"}, cutoff).
		Update("status", "stale")
}

func (h *RoomHandler) GetRooms(c *gin.Context) {
	h.expireStaleRooms()
	var rooms []models.Room
	h.DB.Where("status IN ?", []string{"waiting", "launching", "in_lobby", "playing"}).Find(&rooms)
	c.JSON(http.StatusOK, rooms)
}

func (h *RoomHandler) GetRoom(c *gin.Context) {
	id := c.Param("id")
	var room models.Room
	if err := h.DB.First(&room, id).Error; err != nil {
		c.JSON(http.StatusNotFound, gin.H{"error": "Room not found"})
		return
	}

	c.JSON(http.StatusOK, room)
}

func (h *RoomHandler) CreateRoom(c *gin.Context) {
	var room models.Room
	if err := c.ShouldBindJSON(&room); err != nil {
		c.JSON(http.StatusBadRequest, gin.H{"error": err.Error()})
		return
	}

	now := time.Now()
	if room.Status == "" {
		room.Status = "waiting"
	}
	if room.GameType == "" {
		room.GameType = "AOE_ROR"
	}
	if room.Capacity == 0 {
		room.Capacity = 8
	}
	if room.PlayerCount == 0 {
		room.PlayerCount = 1
	}
	if room.HostIP == "" {
		room.HostIP = c.ClientIP()
	}
	room.LastHeartbeat = &now

	if err := h.DB.Create(&room).Error; err != nil {
		c.JSON(http.StatusInternalServerError, gin.H{"error": "Could not create room"})
		return
	}

	h.broadcast("room.created", room)
	c.JSON(http.StatusOK, room)
}

func (h *RoomHandler) UpdateRoom(c *gin.Context) {
	id := c.Param("id")
	var room models.Room
	if err := h.DB.First(&room, id).Error; err != nil {
		c.JSON(http.StatusNotFound, gin.H{"error": "Room not found"})
		return
	}

	var req updateRoomRequest
	if err := c.ShouldBindJSON(&req); err != nil {
		c.JSON(http.StatusBadRequest, gin.H{"error": err.Error()})
		return
	}

	if req.Name != "" {
		room.Name = req.Name
	}
	if req.HostName != "" {
		room.HostName = req.HostName
	}
	if req.HostIP != "" {
		room.HostIP = req.HostIP
	}
	if req.Capacity > 0 {
		room.Capacity = req.Capacity
	}
	if req.PlayerCount > 0 {
		room.PlayerCount = req.PlayerCount
	}
	if req.Status != "" {
		if !validRoomStatus(req.Status) {
			c.JSON(http.StatusBadRequest, gin.H{"error": "Invalid room status"})
			return
		}
		room.Status = req.Status
	}
	if req.GameType != "" {
		room.GameType = req.GameType
	}
	if req.AutomationKey != "" {
		room.AutomationKey = req.AutomationKey
	}

	now := time.Now()
	room.LastHeartbeat = &now
	if err := h.DB.Save(&room).Error; err != nil {
		c.JSON(http.StatusInternalServerError, gin.H{"error": "Could not update room"})
		return
	}

	h.broadcast("room.updated", room)
	c.JSON(http.StatusOK, room)
}

func (h *RoomHandler) DeleteRoom(c *gin.Context) {
	id := c.Param("id")
	var room models.Room
	if err := h.DB.First(&room, id).Error; err != nil {
		c.JSON(http.StatusNotFound, gin.H{"error": "Room not found"})
		return
	}

	if err := h.DB.Delete(&room).Error; err != nil {
		c.JSON(http.StatusInternalServerError, gin.H{"error": "Could not delete room"})
		return
	}

	if h.Hub != nil {
		h.Hub.Broadcast("room.deleted", gin.H{"id": room.ID})
	}
	c.JSON(http.StatusOK, gin.H{"deleted": true, "id": room.ID})
}

func (h *RoomHandler) JoinRoom(c *gin.Context) {
	id := c.Param("id")
	var room models.Room
	if err := h.DB.First(&room, id).Error; err != nil {
		c.JSON(http.StatusNotFound, gin.H{"error": "Room not found"})
		return
	}

	// Logic to check capacity and add player would go here
	if room.PlayerCount < room.Capacity {
		room.PlayerCount++
	}
	if room.Status == "waiting" {
		room.Status = "launching"
	}
	h.DB.Save(&room)
	h.broadcast("room.updated", room)
	c.JSON(http.StatusOK, room)
}

func (h *RoomHandler) Heartbeat(c *gin.Context) {
	id := c.Param("id")
	var room models.Room
	if err := h.DB.First(&room, id).Error; err != nil {
		c.JSON(http.StatusNotFound, gin.H{"error": "Room not found"})
		return
	}

	var req heartbeatRequest
	if err := c.ShouldBindJSON(&req); err != nil {
		c.JSON(http.StatusBadRequest, gin.H{"error": err.Error()})
		return
	}

	now := time.Now()
	room.LastHeartbeat = &now
	if req.PlayerCount > 0 {
		room.PlayerCount = req.PlayerCount
	}
	if req.Status != "" {
		room.Status = req.Status
	}
	if req.ClientIP != "" {
		room.HostIP = req.ClientIP
	}
	h.DB.Save(&room)
	h.broadcast("room.updated", room)

	if req.Username != "" {
		presence := models.Presence{
			Username:   req.Username,
			RoomID:     room.ID,
			ClientIP:   req.ClientIP,
			Status:     "online",
			LastSeenAt: now,
		}
		h.DB.Where("username = ? AND room_id = ?", req.Username, room.ID).Assign(presence).FirstOrCreate(&presence)
	}

	c.JSON(http.StatusOK, room)
}

func (h *RoomHandler) MarkGameCreated(c *gin.Context) {
	id := c.Param("id")
	var room models.Room
	if err := h.DB.First(&room, id).Error; err != nil {
		c.JSON(http.StatusNotFound, gin.H{"error": "Room not found"})
		return
	}

	var req gameCreatedRequest
	if err := c.ShouldBindJSON(&req); err != nil {
		c.JSON(http.StatusBadRequest, gin.H{"error": err.Error()})
		return
	}

	if req.HostName != "" {
		room.HostName = req.HostName
	}
	if req.HostIP != "" {
		room.HostIP = req.HostIP
	}
	room.Status = "in_lobby"
	now := time.Now()
	room.LastHeartbeat = &now
	if err := h.DB.Save(&room).Error; err != nil {
		c.JSON(http.StatusInternalServerError, gin.H{"error": "Could not mark room as in lobby"})
		return
	}

	h.broadcast("room.game_created", room)
	h.broadcast("room.updated", room)
	c.JSON(http.StatusOK, room)
}

func (h *RoomHandler) UpdateState(c *gin.Context) {
	id := c.Param("id")
	var room models.Room
	if err := h.DB.First(&room, id).Error; err != nil {
		c.JSON(http.StatusNotFound, gin.H{"error": "Room not found"})
		return
	}

	var req stateRequest
	if err := c.ShouldBindJSON(&req); err != nil {
		c.JSON(http.StatusBadRequest, gin.H{"error": err.Error()})
		return
	}

	if !validRoomStatus(req.Status) {
		c.JSON(http.StatusBadRequest, gin.H{"error": "Invalid room status"})
		return
	}
	room.Status = req.Status

	now := time.Now()
	room.LastHeartbeat = &now
	h.DB.Save(&room)
	h.broadcast("room.updated", room)
	c.JSON(http.StatusOK, room)
}
