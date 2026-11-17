// Package auth cuida de senhas, tokens de acesso (JWT) e refresh tokens.
package auth

import (
	"crypto/rand"
	"crypto/sha256"
	"encoding/base64"
	"errors"
	"fmt"
	"time"

	"github.com/golang-jwt/jwt/v5"
	"golang.org/x/crypto/bcrypt"
)

// ErrInvalidToken indica token ausente, malformado, adulterado ou expirado.
var ErrInvalidToken = errors.New("token inválido")

// HashPassword gera o hash bcrypt da senha.
func HashPassword(password string) (string, error) {
	b, err := bcrypt.GenerateFromPassword([]byte(password), bcrypt.DefaultCost)
	return string(b), err
}

// CheckPassword compara a senha com o hash bcrypt.
func CheckPassword(hash, password string) bool {
	return bcrypt.CompareHashAndPassword([]byte(hash), []byte(password)) == nil
}

// Tokens emite e valida tokens de acesso e gera refresh tokens opacos.
type Tokens struct {
	secret     []byte
	AccessTTL  time.Duration
	RefreshTTL time.Duration
	now        func() time.Time
}

// NewTokens cria o emissor. O segredo assina os JWTs (HS256).
func NewTokens(secret string, accessTTL, refreshTTL time.Duration) *Tokens {
	return &Tokens{secret: []byte(secret), AccessTTL: accessTTL, RefreshTTL: refreshTTL, now: time.Now}
}

// NewAccessToken emite um JWT para o usuário.
func (t *Tokens) NewAccessToken(userID string) (string, error) {
	now := t.now()
	return jwt.NewWithClaims(jwt.SigningMethodHS256, jwt.RegisteredClaims{
		Subject:   userID,
		IssuedAt:  jwt.NewNumericDate(now),
		ExpiresAt: jwt.NewNumericDate(now.Add(t.AccessTTL)),
	}).SignedString(t.secret)
}

// ParseAccessToken valida o JWT e devolve o id do usuário.
func (t *Tokens) ParseAccessToken(raw string) (string, error) {
	var claims jwt.RegisteredClaims
	tok, err := jwt.ParseWithClaims(raw, &claims, func(*jwt.Token) (any, error) { return t.secret, nil },
		jwt.WithValidMethods([]string{"HS256"}),
		jwt.WithTimeFunc(t.now),
		jwt.WithExpirationRequired(),
	)
	if err != nil || !tok.Valid || claims.Subject == "" {
		return "", ErrInvalidToken
	}
	return claims.Subject, nil
}

// NewRefreshToken gera um token aleatório (devolvido ao cliente) e seu hash (guardado no banco).
func (t *Tokens) NewRefreshToken() (token string, hash []byte, expiresAt time.Time, err error) {
	buf := make([]byte, 32)
	if _, err = rand.Read(buf); err != nil {
		return "", nil, time.Time{}, fmt.Errorf("gerando refresh token: %w", err)
	}
	token = base64.RawURLEncoding.EncodeToString(buf)
	return token, HashRefreshToken(token), t.now().Add(t.RefreshTTL), nil
}

// HashRefreshToken é o hash que identifica o refresh token no banco.
func HashRefreshToken(token string) []byte {
	sum := sha256.Sum256([]byte(token))
	return sum[:]
}
