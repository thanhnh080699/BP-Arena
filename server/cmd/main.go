package main

import (
	"bp-arena/server/internal/handlers"
	"bp-arena/server/internal/models"
	"github.com/gin-contrib/cors"
	"github.com/gin-gonic/gin"
	"github.com/glebarez/sqlite"
	"gorm.io/gorm"
	"log"
	"os"
)

func main() {
	// 1. Initialize Database
	db, err := gorm.Open(sqlite.Open("arena.db"), &gorm.Config{})
	if err != nil {
		log.Fatal("Failed to connect to database:", err)
	}

	// 2. Auto-Migrate
	db.AutoMigrate(
		&models.User{},
		&models.Room{},
		&models.Presence{},
		&models.Invite{},
		&models.Match{},
		&models.Rating{},
		&models.Replay{},
		&models.TelemetryEvent{},
		&models.ResearchNote{},
	)

	// Seed default user
	var count int64
	db.Model(&models.User{}).Count(&count)
	if count == 0 {
		db.Create(&models.User{
			Username: "user",
			Password: "123456", // As requested by user
			Email:    "user@example.com",
		})
		log.Println("Default user created: user | 123456")
	}

	// 3. Setup Router

	r := gin.Default()
	r.Use(cors.Default())

	roomHub := handlers.NewRoomHub()
	roomHandler := &handlers.RoomHandler{DB: db, Hub: roomHub}
	authHandler := &handlers.AuthHandler{DB: db}
	platformHandler := &handlers.PlatformHandler{DB: db}

	// 4. Routes
	r.GET("/ping", func(c *gin.Context) {
		c.JSON(200, gin.H{"message": "Welcome to BP Arena!"})
	})
	r.GET("/ws/rooms", roomHub.Serve)

	api := r.Group("/api")
	{
		api.POST("/login", authHandler.Login)
		api.GET("/rooms", roomHandler.GetRooms)
		api.POST("/rooms", roomHandler.CreateRoom)
		api.GET("/rooms/:id", roomHandler.GetRoom)
		api.PUT("/rooms/:id", roomHandler.UpdateRoom)
		api.DELETE("/rooms/:id", roomHandler.DeleteRoom)
		api.POST("/rooms/:id/join", roomHandler.JoinRoom)
		api.POST("/rooms/:id/game-created", roomHandler.MarkGameCreated)
		api.POST("/rooms/:id/heartbeat", roomHandler.Heartbeat)
		api.POST("/rooms/:id/state", roomHandler.UpdateState)
		api.GET("/presence", platformHandler.ListPresence)
		api.POST("/invites", platformHandler.CreateInvite)
		api.POST("/invites/:token", platformHandler.UpdateInvite)
		api.GET("/telemetry", platformHandler.ListTelemetry)
		api.POST("/telemetry", platformHandler.RecordTelemetry)
		api.GET("/matches", platformHandler.ListMatches)
		api.POST("/matches", platformHandler.CreateMatch)
		api.POST("/matches/:id/report", platformHandler.ReportMatch)
		api.GET("/leaderboard", platformHandler.Leaderboard)
		api.GET("/replays", platformHandler.ListReplays)
		api.POST("/replays", platformHandler.CreateReplay)
		api.GET("/research/notes", platformHandler.ListResearchNotes)
		api.POST("/research/notes", platformHandler.CreateResearchNote)
	}

	port := os.Getenv("BP_ARENA_PORT")
	if port == "" {
		port = "8081"
	}
	log.Printf("Arena Backend starting on :%s...", port)
	r.Run(":" + port)
}
