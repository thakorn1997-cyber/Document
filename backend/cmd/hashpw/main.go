package main

import (
	"fmt"
	"os"

	"project-document/backend/utils"
)

func main() {
	if len(os.Args) < 2 {
		fmt.Println("usage: go run ./cmd/hashpw <password>")
		os.Exit(1)
	}
	h, err := utils.HashPassword(os.Args[1])
	if err != nil {
		fmt.Println("error:", err)
		os.Exit(1)
	}
	fmt.Println(h)
}
