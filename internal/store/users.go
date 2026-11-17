package store

import (
	"context"
	"errors"
	"time"

	"github.com/jackc/pgx/v5"
	"github.com/jackc/pgx/v5/pgconn"
	"github.com/jackc/pgx/v5/pgxpool"
)

// ErrConflict indica violação de unicidade (e-mail ou username já usados).
var ErrConflict = errors.New("conflito")

// User é uma conta. PasswordHash só deve ser usado no login.
type User struct {
	ID           string
	Email        string
	Username     string
	PasswordHash string
	Bio          string
	AvatarURL    *string
	CreatedAt    time.Time
}

// Profile é o perfil com contadores.
type Profile struct {
	User
	DeckCount      int
	FollowerCount  int
	FollowingCount int
}

// ProfileUpdate traz os campos alteráveis; nil mantém o valor atual.
type ProfileUpdate struct {
	Bio         *string
	AvatarURL   *string
	ClearAvatar bool // true força avatar_url = NULL
}

// Users acessa contas e refresh tokens.
type Users struct{ pool *pgxpool.Pool }

// NewUsers devolve o acesso a usuários usando o pool informado.
func NewUsers(pool *pgxpool.Pool) *Users { return &Users{pool: pool} }

const userColumns = `id::text, email::text, username::text, password_hash, bio, avatar_url, created_at`

func scanUser(row pgx.Row) (User, error) {
	var u User
	err := row.Scan(&u.ID, &u.Email, &u.Username, &u.PasswordHash, &u.Bio, &u.AvatarURL, &u.CreatedAt)
	if errors.Is(err, pgx.ErrNoRows) {
		return User{}, ErrNotFound
	}
	return u, err
}

// Create insere a conta. Devolve ErrConflict se e-mail ou username já existirem.
func (s *Users) Create(ctx context.Context, email, username, passwordHash string) (User, error) {
	u, err := scanUser(s.pool.QueryRow(ctx,
		`INSERT INTO users (email, username, password_hash) VALUES ($1, $2, $3) RETURNING `+userColumns,
		email, username, passwordHash))
	var pgErr *pgconn.PgError
	if errors.As(err, &pgErr) && pgErr.Code == "23505" {
		return User{}, ErrConflict
	}
	return u, err
}

// ByEmail busca pelo e-mail (sem diferenciar maiúsculas).
func (s *Users) ByEmail(ctx context.Context, email string) (User, error) {
	return scanUser(s.pool.QueryRow(ctx, `SELECT `+userColumns+` FROM users WHERE email = $1`, email))
}

const profileSQL = `
SELECT u.id::text, u.email::text, u.username::text, u.password_hash, u.bio, u.avatar_url, u.created_at,
       (SELECT count(*) FROM decks d WHERE d.owner_id = u.id),
       (SELECT count(*) FROM follows f WHERE f.followee_id = u.id),
       (SELECT count(*) FROM follows f WHERE f.follower_id = u.id)
FROM users u WHERE u.id = $1`

// Profile devolve o perfil com contadores.
func (s *Users) Profile(ctx context.Context, id string) (Profile, error) {
	var p Profile
	err := s.pool.QueryRow(ctx, profileSQL, id).Scan(&p.ID, &p.Email, &p.Username, &p.PasswordHash,
		&p.Bio, &p.AvatarURL, &p.CreatedAt, &p.DeckCount, &p.FollowerCount, &p.FollowingCount)
	if errors.Is(err, pgx.ErrNoRows) {
		return Profile{}, ErrNotFound
	}
	return p, err
}

// UpdateProfile altera bio e/ou avatar.
func (s *Users) UpdateProfile(ctx context.Context, id string, up ProfileUpdate) error {
	tag, err := s.pool.Exec(ctx, `
		UPDATE users SET
		  bio = COALESCE($2, bio),
		  avatar_url = CASE WHEN $4 THEN NULL ELSE COALESCE($3, avatar_url) END
		WHERE id = $1`, id, up.Bio, up.AvatarURL, up.ClearAvatar)
	if err != nil {
		return err
	}
	if tag.RowsAffected() == 0 {
		return ErrNotFound
	}
	return nil
}

// SaveRefreshToken guarda o hash de um refresh token recém-emitido.
func (s *Users) SaveRefreshToken(ctx context.Context, userID string, hash []byte, expiresAt time.Time) error {
	_, err := s.pool.Exec(ctx,
		`INSERT INTO refresh_tokens (user_id, token_hash, expires_at) VALUES ($1, $2, $3)`,
		userID, hash, expiresAt)
	return err
}

// ConsumeRefreshToken revoga o token (uso único) e devolve o dono, se ele ainda for válido.
func (s *Users) ConsumeRefreshToken(ctx context.Context, hash []byte) (string, error) {
	var userID string
	err := s.pool.QueryRow(ctx, `
		UPDATE refresh_tokens SET revoked_at = now()
		WHERE token_hash = $1 AND revoked_at IS NULL AND expires_at > now()
		RETURNING user_id::text`, hash).Scan(&userID)
	if errors.Is(err, pgx.ErrNoRows) {
		return "", ErrNotFound
	}
	return userID, err
}

// RevokeRefreshToken revoga o token de um usuário; é idempotente.
func (s *Users) RevokeRefreshToken(ctx context.Context, userID string, hash []byte) error {
	_, err := s.pool.Exec(ctx, `
		UPDATE refresh_tokens SET revoked_at = now()
		WHERE token_hash = $1 AND user_id = $2 AND revoked_at IS NULL`, hash, userID)
	return err
}
