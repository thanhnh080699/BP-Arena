package handlers

import (
	"bp-arena/server/internal/models"
	"encoding/json"
	"net/http"
	"time"

	"github.com/gin-gonic/gin"
	"github.com/google/uuid"
	"gorm.io/gorm"
)

type PlatformHandler struct {
	DB *gorm.DB
}

type inviteRequest struct {
	RoomID   uint   `json:"room_id" binding:"required"`
	FromUser string `json:"from_user" binding:"required"`
	ToUser   string `json:"to_user" binding:"required"`
}

type telemetryRequest struct {
	Username string                 `json:"username"`
	RoomID   uint                   `json:"room_id"`
	State    string                 `json:"state" binding:"required"`
	Payload  map[string]interface{} `json:"payload"`
}

type matchRequest struct {
	RoomID   uint   `json:"room_id"`
	Status   string `json:"status"`
	Winner   string `json:"winner"`
	Loser    string `json:"loser"`
	Metadata string `json:"metadata"`
}

type replayRequest struct {
	MatchID  uint   `json:"match_id" binding:"required"`
	FileName string `json:"file_name" binding:"required"`
	Path     string `json:"path"`
	Size     int64  `json:"size"`
}

type researchNoteRequest struct {
	Topic   string `json:"topic" binding:"required"`
	Status  string `json:"status"`
	Summary string `json:"summary"`
}

func (h *PlatformHandler) ListPresence(c *gin.Context) {
	var presence []models.Presence
	query := h.DB.Order("last_seen_at desc")
	if roomID := c.Query("room_id"); roomID != "" {
		query = query.Where("room_id = ?", roomID)
	}
	query.Find(&presence)
	c.JSON(http.StatusOK, presence)
}

func (h *PlatformHandler) CreateInvite(c *gin.Context) {
	var req inviteRequest
	if err := c.ShouldBindJSON(&req); err != nil {
		c.JSON(http.StatusBadRequest, gin.H{"error": err.Error()})
		return
	}

	expiresAt := time.Now().Add(30 * time.Minute)
	invite := models.Invite{
		RoomID:    req.RoomID,
		FromUser:  req.FromUser,
		ToUser:    req.ToUser,
		Token:     uuid.NewString(),
		Status:    "pending",
		ExpiresAt: &expiresAt,
	}

	if err := h.DB.Create(&invite).Error; err != nil {
		c.JSON(http.StatusInternalServerError, gin.H{"error": "Could not create invite"})
		return
	}

	c.JSON(http.StatusOK, invite)
}

func (h *PlatformHandler) UpdateInvite(c *gin.Context) {
	token := c.Param("token")
	var invite models.Invite
	if err := h.DB.Where("token = ?", token).First(&invite).Error; err != nil {
		c.JSON(http.StatusNotFound, gin.H{"error": "Invite not found"})
		return
	}

	var body struct {
		Status string `json:"status" binding:"required"`
	}
	if err := c.ShouldBindJSON(&body); err != nil {
		c.JSON(http.StatusBadRequest, gin.H{"error": err.Error()})
		return
	}

	switch body.Status {
	case "accepted", "declined", "expired":
		invite.Status = body.Status
	default:
		c.JSON(http.StatusBadRequest, gin.H{"error": "Invalid invite status"})
		return
	}

	h.DB.Save(&invite)
	c.JSON(http.StatusOK, invite)
}

func (h *PlatformHandler) RecordTelemetry(c *gin.Context) {
	var req telemetryRequest
	if err := c.ShouldBindJSON(&req); err != nil {
		c.JSON(http.StatusBadRequest, gin.H{"error": err.Error()})
		return
	}

	payload, _ := json.Marshal(req.Payload)
	event := models.TelemetryEvent{
		Username: req.Username,
		RoomID:   req.RoomID,
		State:    req.State,
		Payload:  string(payload),
	}

	if err := h.DB.Create(&event).Error; err != nil {
		c.JSON(http.StatusInternalServerError, gin.H{"error": "Could not record telemetry"})
		return
	}

	c.JSON(http.StatusOK, event)
}

func (h *PlatformHandler) ListTelemetry(c *gin.Context) {
	var events []models.TelemetryEvent
	query := h.DB.Order("created_at desc").Limit(200)
	if roomID := c.Query("room_id"); roomID != "" {
		query = query.Where("room_id = ?", roomID)
	}
	query.Find(&events)
	c.JSON(http.StatusOK, events)
}

func (h *PlatformHandler) CreateMatch(c *gin.Context) {
	var req matchRequest
	if err := c.ShouldBindJSON(&req); err != nil {
		c.JSON(http.StatusBadRequest, gin.H{"error": err.Error()})
		return
	}

	now := time.Now()
	status := req.Status
	if status == "" {
		status = "pending"
	}

	match := models.Match{
		RoomID:    req.RoomID,
		Status:    status,
		StartedAt: &now,
		Metadata:  req.Metadata,
	}
	if err := h.DB.Create(&match).Error; err != nil {
		c.JSON(http.StatusInternalServerError, gin.H{"error": "Could not create match"})
		return
	}

	c.JSON(http.StatusOK, match)
}

func (h *PlatformHandler) ReportMatch(c *gin.Context) {
	var match models.Match
	if err := h.DB.First(&match, c.Param("id")).Error; err != nil {
		c.JSON(http.StatusNotFound, gin.H{"error": "Match not found"})
		return
	}

	var req matchRequest
	if err := c.ShouldBindJSON(&req); err != nil {
		c.JSON(http.StatusBadRequest, gin.H{"error": err.Error()})
		return
	}

	now := time.Now()
	match.Status = "reported"
	match.Winner = req.Winner
	match.Loser = req.Loser
	match.EndedAt = &now
	if req.Metadata != "" {
		match.Metadata = req.Metadata
	}
	h.DB.Save(&match)

	if req.Winner != "" {
		h.applyRating(req.Winner, true)
	}
	if req.Loser != "" {
		h.applyRating(req.Loser, false)
	}

	c.JSON(http.StatusOK, match)
}

func (h *PlatformHandler) ListMatches(c *gin.Context) {
	var matches []models.Match
	h.DB.Order("created_at desc").Limit(200).Find(&matches)
	c.JSON(http.StatusOK, matches)
}

func (h *PlatformHandler) applyRating(username string, won bool) {
	var rating models.Rating
	h.DB.Where("username = ?", username).FirstOrCreate(&rating, models.Rating{
		Username: username,
		ELO:      1000,
	})

	if won {
		rating.Wins++
		rating.ELO += 16
	} else {
		rating.Losses++
		rating.ELO -= 12
		if rating.ELO < 100 {
			rating.ELO = 100
		}
	}
	h.DB.Save(&rating)
}

func (h *PlatformHandler) Leaderboard(c *gin.Context) {
	var ratings []models.Rating
	h.DB.Order("elo desc").Limit(100).Find(&ratings)
	c.JSON(http.StatusOK, ratings)
}

func (h *PlatformHandler) CreateReplay(c *gin.Context) {
	var req replayRequest
	if err := c.ShouldBindJSON(&req); err != nil {
		c.JSON(http.StatusBadRequest, gin.H{"error": err.Error()})
		return
	}

	replay := models.Replay{
		MatchID:  req.MatchID,
		FileName: req.FileName,
		Path:     req.Path,
		Size:     req.Size,
		Status:   "indexed",
	}

	if err := h.DB.Create(&replay).Error; err != nil {
		c.JSON(http.StatusInternalServerError, gin.H{"error": "Could not index replay"})
		return
	}

	c.JSON(http.StatusOK, replay)
}

func (h *PlatformHandler) ListReplays(c *gin.Context) {
	var replays []models.Replay
	h.DB.Order("created_at desc").Limit(200).Find(&replays)
	c.JSON(http.StatusOK, replays)
}

func (h *PlatformHandler) CreateResearchNote(c *gin.Context) {
	var req researchNoteRequest
	if err := c.ShouldBindJSON(&req); err != nil {
		c.JSON(http.StatusBadRequest, gin.H{"error": err.Error()})
		return
	}

	status := req.Status
	if status == "" {
		status = "isolated"
	}

	note := models.ResearchNote{
		Topic:   req.Topic,
		Status:  status,
		Summary: req.Summary,
	}

	if err := h.DB.Create(&note).Error; err != nil {
		c.JSON(http.StatusInternalServerError, gin.H{"error": "Could not create research note"})
		return
	}

	c.JSON(http.StatusOK, note)
}

func (h *PlatformHandler) ListResearchNotes(c *gin.Context) {
	var notes []models.ResearchNote
	h.DB.Order("created_at desc").Find(&notes)
	c.JSON(http.StatusOK, notes)
}
