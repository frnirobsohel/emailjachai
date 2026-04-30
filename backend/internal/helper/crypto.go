package helper

import (
	"crypto/aes"
	"crypto/cipher"
	"encoding/base64"
	"errors"
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




