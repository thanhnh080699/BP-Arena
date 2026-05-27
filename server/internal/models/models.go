package models

import "gorm.io/gorm"

type User struct {
	gorm.Model
	Username string `gorm:"uniqueIndex;not null" json:"username"`
	Password string `json:"-"` // Never return password in JSON
	Email    string `gorm:"uniqueIndex" json:"email"`
}

type Room struct {
	gorm.Model
	Name      string `json:"name"`
	HostID    uint   `json:"host_id"`
	HostName  string `json:"host_name"`
	Capacity  int    `json:"capacity" gorm:"default:8"`
	Status    string `json:"status" gorm:"default:'waiting'"` // waiting, playing
	GameType  string `json:"game_type"` // AOE1, AOE2, etc.
}
