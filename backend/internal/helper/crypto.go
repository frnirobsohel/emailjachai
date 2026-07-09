package helper

import (
	"crypto/aes"
	"crypto/cipher"
	"crypto/rand"
	"crypto/sha256"
	"encoding/base64"
	"encoding/hex"
	"errors"
	"os"
	"strconv"
	"strings"
)

func SafeAtoi(s string) (int, error) {
	return strconv.Atoi(strings.TrimSpace(s))
}

func SafeBase64Decode(s string) ([]byte, error) {
	s = strings.TrimSpace(s)
	if s == "" {
		return nil, nil
	}
	b, err := base64.StdEncoding.DecodeString(s)
	if err != nil {
		return nil, err
	}
	return b, nil
}

func SafeBase64Encode(b []byte) string {
	if len(b) == 0 {
		return ""
	}
	return base64.StdEncoding.EncodeToString(b)
}

func AES256GCMEncrypt(plain []byte, key []byte) ([]byte, []byte, error) {
	if len(key) != 32 {
		return nil, nil, errors.New("AES-256 key must be 32 bytes")
	}
	block, err := aes.NewCipher(key)
	if err != nil {
		return nil, nil, err
	}
	aesgcm, err := cipher.NewGCM(block)
	if err != nil {
		return nil, nil, err
	}
	nonce := make([]byte, aesgcm.NonceSize())
	if _, err := rand.Read(nonce); err != nil {
		return nil, nil, err
	}
	ciphertext := aesgcm.Seal(nil, nonce, plain, nil)
	return ciphertext, nonce, nil
}

func AES256GCMDecrypt(ciphertext []byte, key []byte, nonce []byte) ([]byte, error) {
	if len(key) != 32 {
		return nil, errors.New("AES-256 key must be 32 bytes")
	}
	block, err := aes.NewCipher(key)
	if err != nil {
		return nil, err
	}
	aesgcm, err := cipher.NewGCM(block)
	if err != nil {
		return nil, err
	}
	return aesgcm.Open(nil, nonce, ciphertext, nil)
}

func AES256CTREncrypt(plain []byte, key []byte, iv []byte) ([]byte, error) {
	if len(key) != 32 {
		return nil, errors.New("AES-256 key must be 32 bytes")
	}
	if len(iv) != aes.BlockSize {
		return nil, errors.New("AES-CTR IV must be 16 bytes")
	}
	block, err := aes.NewCipher(key)
	if err != nil {
		return nil, err
	}
	out := make([]byte, len(plain))
	stream := cipher.NewCTR(block, iv)
	stream.XORKeyStream(out, plain)
	return out, nil
}

func AES256CTRDecrypt(cipherBytes []byte, key []byte, iv []byte) ([]byte, error) {
	// CTR decrypt is identical to encrypt
	return AES256CTREncrypt(cipherBytes, key, iv)
}

// EncryptSecret encrypts a plaintext string using AES-256-GCM with the JWT_SECRET as the key.
func EncryptSecret(plain string) (string, error) {
	secret := strings.TrimSpace(os.Getenv("JWT_SECRET"))
	if secret == "" {
		return "", errors.New("JWT_SECRET is required")
	}
	key := sha256.Sum256([]byte(secret))

	ciphertext, nonce, err := AES256GCMEncrypt([]byte(plain), key[:])
	if err != nil {
		return "", err
	}

	return "gcm:" + SafeBase64Encode(ciphertext) + ":" + hex.EncodeToString(nonce), nil
}

// DecryptSecret decrypts gcm:base64(ciphertext):hex(nonce) OR base64(ciphertext):hex(iv) using JWT_SECRET.
func DecryptSecret(stored string) (string, error) {
	if stored == "" {
		return "", nil
	}

	secret := strings.TrimSpace(os.Getenv("JWT_SECRET"))
	if secret == "" {
		return "", errors.New("JWT_SECRET is required")
	}
	key := sha256.Sum256([]byte(secret))

	if strings.HasPrefix(stored, "gcm:") {
		parts := strings.SplitN(stored[4:], ":", 2)
		if len(parts) != 2 {
			return "", errors.New("invalid gcm secret format")
		}

		encB64 := parts[0]
		nonceHex := parts[1]

		cipherBytes, err := SafeBase64Decode(encB64)
		if err != nil {
			return "", err
		}
		nonce, err := hex.DecodeString(nonceHex)
		if err != nil {
			return "", err
		}

		plainBytes, err := AES256GCMDecrypt(cipherBytes, key[:], nonce)
		if err != nil {
			return "", err
		}
		return string(plainBytes), nil
	}

	// Legacy AES-CTR fallback
	parts := strings.SplitN(stored, ":", 2)
	if len(parts) != 2 {
		return "", errors.New("invalid secret format")
	}

	encB64 := parts[0]
	ivHex := parts[1]

	cipherBytes, err := SafeBase64Decode(encB64)
	if err != nil {
		return "", err
	}
	iv, err := hex.DecodeString(ivHex)
	if err != nil {
		return "", err
	}

	plainBytes, err := AES256CTRDecrypt(cipherBytes, key[:], iv)
	if err != nil {
		return "", err
	}
	return string(plainBytes), nil
}




