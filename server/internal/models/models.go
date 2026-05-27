package models

import (
	"time"

	"gorm.io/gorm"
)

type User struct {
	gorm.Model
	Username string `gorm:"uniqueIndex;not null" json:"username"`
	Password string `json:"-"` // Never return password in JSON
	Email    string `gorm:"uniqueIndex" json:"email"`
}

type Room struct {
	gorm.Model
	Name          string     `json:"name"`
	HostID        uint       `json:"host_id"`
	HostName      string     `json:"host_name"`
	HostIP        string     `json:"host_ip"`
	Capacity      int        `json:"capacity" gorm:"default:8"`
	PlayerCount   int        `json:"player_count" gorm:"default:1"`
	Status        string     `json:"status" gorm:"default:'waiting'"`
	GameType      string     `json:"game_type" gorm:"default:'AOE_ROR'"`
	AutomationKey string     `json:"automation_key"`
	LastHeartbeat *time.Time `json:"last_heartbeat"`
}

type Presence struct {
	gorm.Model
	UserID     uint      `json:"user_id"`
	Username   string    `json:"username"`
	RoomID     uint      `json:"room_id"`
	ClientIP   string    `json:"client_ip"`
	Status     string    `json:"status" gorm:"default:'online'"`
	LastSeenAt time.Time `json:"last_seen_at"`
}

type Invite struct {
	gorm.Model
	RoomID    uint       `json:"room_id"`
	FromUser  string     `json:"from_user"`
	ToUser    string     `json:"to_user"`
	Token     string     `json:"token" gorm:"uniqueIndex"`
	Status    string     `json:"status" gorm:"default:'pending'"`
	ExpiresAt *time.Time `json:"expires_at"`
}

type Match struct {
	gorm.Model
	RoomID     uint       `json:"room_id"`
	Status     string     `json:"status" gorm:"default:'pending'"`
	Winner     string     `json:"winner"`
	Loser      string     `json:"loser"`
	StartedAt  *time.Time `json:"started_at"`
	EndedAt    *time.Time `json:"ended_at"`
	ReplayPath string     `json:"replay_path"`
	Metadata   string     `json:"metadata"`
}

type Rating struct {
	gorm.Model
	Username string `json:"username" gorm:"uniqueIndex"`
	ELO      int    `json:"elo" gorm:"default:1000"`
	Wins     int    `json:"wins"`
	Losses   int    `json:"losses"`
}

type Replay struct {
	gorm.Model
	MatchID  uint   `json:"match_id"`
	FileName string `json:"file_name"`
	Path     string `json:"path"`
	Size     int64  `json:"size"`
	Status   string `json:"status" gorm:"default:'indexed'"`
}

type TelemetryEvent struct {
	gorm.Model
	Username string `json:"username"`
	RoomID   uint   `json:"room_id"`
	State    string `json:"state"`
	Payload  string `json:"payload"`
}

type ResearchNote struct {
	gorm.Model
	Topic   string `json:"topic"`
	Status  string `json:"status" gorm:"default:'isolated'"`
	Summary string `json:"summary"`
}
