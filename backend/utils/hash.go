package utils

import "golang.org/x/crypto/bcrypt"

const BcryptCost = 12

func HashPassword(pw string) (string, error) {
	h, err := bcrypt.GenerateFromPassword([]byte(pw), BcryptCost)
	if err != nil {
		return "", err
	}
	return string(h), nil
}

func VerifyPassword(hash, pw string) bool {
	return bcrypt.CompareHashAndPassword([]byte(hash), []byte(pw)) == nil
}
