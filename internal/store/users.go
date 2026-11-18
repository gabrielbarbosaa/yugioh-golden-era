package store

import (
	"context"
	"errors"
	"strings"
	"time"

	"github.com/jackc/pgx/v5"
	"github.com/jackc/pgx/v5/pgconn"
	"github.com/jackc/pgx/v5/pgxpool"
)

// ErrConflict indica violação de unicidade (e-mail ou username já usados).
var ErrConflict = errors.New("conflito")

// ErrInvalidCard indica que a carta escolhida como foto de perfil não existe no catálogo.
var ErrInvalidCard = errors.New("carta inexistente")

// User é uma conta. PasswordHash só deve ser usado no login.
type User struct {
	ID           string
	Email        string
	Username     string
	PasswordHash string
	Bio          string
	// AvatarCardID é a carta escolhida como foto de perfil; AvatarPath, o caminho relativo da imagem pequena dela.
	AvatarCardID *int64
	AvatarPath   *string
	CreatedAt    time.Time
}

// Profile é o perfil com contadores.
type Profile struct {
	User
	DeckCount      int
	FollowerCount  int
	FollowingCount int
	FollowedByMe   bool
}

// ProfileUpdate traz os campos alteráveis; nil mantém o valor atual.
type ProfileUpdate struct {
	Bio          *string
	AvatarCardID *int64
	ClearAvatar  bool // true força avatar_card_id = NULL
}

// Users acessa contas e refresh tokens.
type Users struct{ pool *pgxpool.Pool }

// NewUsers devolve o acesso a usuários usando o pool informado.
func NewUsers(pool *pgxpool.Pool) *Users { return &Users{pool: pool} }

const userColumns = `id::text, email::text, username::text, password_hash, bio, avatar_card_id,
	(SELECT ca.image_small_path FROM cards ca WHERE ca.id = users.avatar_card_id), created_at`

func scanUser(row pgx.Row) (User, error) {
	var u User
	err := row.Scan(&u.ID, &u.Email, &u.Username, &u.PasswordHash, &u.Bio, &u.AvatarCardID, &u.AvatarPath, &u.CreatedAt)
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
SELECT u.id::text, u.email::text, u.username::text, u.password_hash, u.bio, u.avatar_card_id, (SELECT ca.image_small_path FROM cards ca WHERE ca.id = u.avatar_card_id), u.created_at,
       (SELECT count(*) FROM decks d WHERE d.owner_id = u.id),
       (SELECT count(*) FROM follows f WHERE f.followee_id = u.id),
       (SELECT count(*) FROM follows f WHERE f.follower_id = u.id)
FROM users u WHERE u.id = $1`

// Profile devolve o perfil com contadores.
func (s *Users) Profile(ctx context.Context, id string) (Profile, error) {
	var p Profile
	err := s.pool.QueryRow(ctx, profileSQL, id).Scan(&p.ID, &p.Email, &p.Username, &p.PasswordHash,
		&p.Bio, &p.AvatarCardID, &p.AvatarPath, &p.CreatedAt, &p.DeckCount, &p.FollowerCount, &p.FollowingCount)
	if errors.Is(err, pgx.ErrNoRows) {
		return Profile{}, ErrNotFound
	}
	return p, err
}

// PublicProfile devolve o perfil público de um usuário: só decks públicos entram na contagem e
// FollowedByMe reflete o visitante (vazio = anônimo).
func (s *Users) PublicProfile(ctx context.Context, username, viewerID string) (Profile, error) {
	var p Profile
	var viewer any
	if viewerID != "" {
		viewer = viewerID
	}
	err := s.pool.QueryRow(ctx, `
		SELECT u.id::text, u.email::text, u.username::text, u.password_hash, u.bio, u.avatar_card_id, (SELECT ca.image_small_path FROM cards ca WHERE ca.id = u.avatar_card_id), u.created_at,
		       (SELECT count(*) FROM decks d WHERE d.owner_id = u.id AND d.visibility = 'public'),
		       (SELECT count(*) FROM follows f WHERE f.followee_id = u.id),
		       (SELECT count(*) FROM follows f WHERE f.follower_id = u.id),
		       COALESCE(EXISTS (SELECT 1 FROM follows f WHERE f.followee_id = u.id AND f.follower_id = $2::uuid), false)
		FROM users u WHERE u.username = $1`, username, viewer).
		Scan(&p.ID, &p.Email, &p.Username, &p.PasswordHash, &p.Bio, &p.AvatarCardID, &p.AvatarPath, &p.CreatedAt,
			&p.DeckCount, &p.FollowerCount, &p.FollowingCount, &p.FollowedByMe)
	if errors.Is(err, pgx.ErrNoRows) {
		return Profile{}, ErrNotFound
	}
	return p, err
}

// UpdateProfile altera bio e/ou a carta da foto de perfil (ErrInvalidCard se a carta não existir).
func (s *Users) UpdateProfile(ctx context.Context, id string, up ProfileUpdate) error {
	tag, err := s.pool.Exec(ctx, `
		UPDATE users SET
		  bio = COALESCE($2, bio),
		  avatar_card_id = CASE WHEN $4 THEN NULL ELSE COALESCE($3::bigint, avatar_card_id) END
		WHERE id = $1`, id, up.Bio, up.AvatarCardID, up.ClearAvatar)
	var pgErr *pgconn.PgError
	if errors.As(err, &pgErr) && pgErr.Code == "23503" { // chave estrangeira: a carta não existe
		return ErrInvalidCard
	}
	if err != nil {
		return err
	}
	if tag.RowsAffected() == 0 {
		return ErrNotFound
	}
	return nil
}

const userBriefSelect = `u.id::text, u.username::text, u.avatar_card_id, (SELECT ca.image_small_path FROM cards ca WHERE ca.id = u.avatar_card_id)`

// listUsers roda uma consulta que já ordena por username e limita a `limit+1` linhas; devolve até `limit` e se há mais.
func (s *Users) listUsers(ctx context.Context, limit int, sql string, args ...any) ([]DeckOwner, bool, error) {
	rows, err := s.pool.Query(ctx, sql, args...)
	if err != nil {
		return nil, false, err
	}
	defer rows.Close()
	var out []DeckOwner
	for rows.Next() {
		var o DeckOwner
		if err := rows.Scan(&o.ID, &o.Username, &o.AvatarCardID, &o.AvatarPath); err != nil {
			return nil, false, err
		}
		out = append(out, o)
	}
	if err := rows.Err(); err != nil {
		return nil, false, err
	}
	more := len(out) > limit
	if more {
		out = out[:limit]
	}
	return out, more, nil
}

// likePattern escapa %, _ e \ para a busca por trecho (ESCAPE '\').
func likePattern(q string) string {
	r := strings.NewReplacer(`\`, `\\`, `%`, `\%`, `_`, `\_`)
	return "%" + r.Replace(q) + "%"
}

// Search procura usuários pelo trecho do nome (sem diferenciar maiúsculas), em ordem alfabética.
// `after` é o último username da página anterior (vazio = primeira página).
func (s *Users) Search(ctx context.Context, q, after string, limit int) ([]DeckOwner, bool, error) {
	return s.listUsers(ctx, limit, `
		SELECT `+userBriefSelect+`
		FROM users u
		WHERE u.username::text ILIKE $1 ESCAPE '\' AND ($2 = '' OR u.username > $2::citext)
		ORDER BY u.username LIMIT $3`, likePattern(q), after, limit+1)
}

// userExists devolve ErrNotFound se o username não existir.
func (s *Users) userExists(ctx context.Context, username string) error {
	var one int
	err := s.pool.QueryRow(ctx, `SELECT 1 FROM users WHERE username = $1`, username).Scan(&one)
	if errors.Is(err, pgx.ErrNoRows) {
		return ErrNotFound
	}
	return err
}

// Followers lista quem segue o usuário (ErrNotFound se ele não existir).
func (s *Users) Followers(ctx context.Context, username, after string, limit int) ([]DeckOwner, bool, error) {
	if err := s.userExists(ctx, username); err != nil {
		return nil, false, err
	}
	return s.listUsers(ctx, limit, `
		SELECT `+userBriefSelect+`
		FROM follows f
		JOIN users u ON u.id = f.follower_id
		WHERE f.followee_id = (SELECT id FROM users WHERE username = $1) AND ($2 = '' OR u.username > $2::citext)
		ORDER BY u.username LIMIT $3`, username, after, limit+1)
}

// Following lista quem o usuário segue (ErrNotFound se ele não existir).
func (s *Users) Following(ctx context.Context, username, after string, limit int) ([]DeckOwner, bool, error) {
	if err := s.userExists(ctx, username); err != nil {
		return nil, false, err
	}
	return s.listUsers(ctx, limit, `
		SELECT `+userBriefSelect+`
		FROM follows f
		JOIN users u ON u.id = f.followee_id
		WHERE f.follower_id = (SELECT id FROM users WHERE username = $1) AND ($2 = '' OR u.username > $2::citext)
		ORDER BY u.username LIMIT $3`, username, after, limit+1)
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
