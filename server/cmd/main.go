package main

import (
	"bp-arena/server/internal/handlers"
	"bp-arena/server/internal/models"
	"github.com/gin-contrib/cors"
	"github.com/gin-gonic/gin"
	"github.com/glebarez/sqlite"
	"gorm.io/gorm"
	"log"
)


func main() {
	// 1. Initialize Database
	db, err := gorm.Open(sqlite.Open("arena.db"), &gorm.Config{})
	if err != nil {
		log.Fatal("Failed to connect to database:", err)
	}

	// 2. Auto-Migrate
	db.AutoMigrate(&models.User{}, &models.Room{})

	// Seed default user
	var count int64
	db.Model(&models.User{}).Count(&count)
	if (count == 0) {
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

	roomHandler := &handlers.RoomHandler{DB: db}
	authHandler := &handlers.AuthHandler{DB: db}

	// 4. Routes
	r.GET("/ping", func(c *gin.Context) {
		c.JSON(200, gin.H{"message": "Welcome to BP Arena!"})
	})

	api := r.Group("/api")
	{
		api.POST("/login", authHandler.Login)
		api.GET("/rooms", roomHandler.GetRooms)
		api.POST("/rooms", roomHandler.CreateRoom)
		api.POST("/rooms/:id/join", roomHandler.JoinRoom)
	}


	log.Println("Arena Backend starting on :8081...")
	r.Run(":8081")
}


