-- +goose Up
-- +goose StatementBegin
CREATE EXTENSION IF NOT EXISTS pg_trgm;
CREATE EXTENSION IF NOT EXISTS citext;

-- Catálogo de cartas (populado pelo comando de ingestão) -----------------------

CREATE TABLE cards (
    id               BIGINT PRIMARY KEY,                 -- passcode da carta
    name             TEXT        NOT NULL,
    type             TEXT        NOT NULL,
    frame_type       TEXT        NOT NULL DEFAULT '',
    description      TEXT        NOT NULL DEFAULT '',
    atk              INTEGER,
    def              INTEGER,
    level            INTEGER,
    race             TEXT,
    attribute        TEXT,
    archetype        TEXT,
    is_extra_deck    BOOLEAN     NOT NULL DEFAULT FALSE,
    ocg_date         DATE,
    tcg_date         DATE,
    image_path       TEXT        NOT NULL,           -- relativo; a URL base vem de IMAGE_BASE_URL
    image_small_path TEXT        NOT NULL,
    updated_at       TIMESTAMPTZ NOT NULL DEFAULT now()
);

CREATE INDEX cards_name_trgm_idx  ON cards USING gin (name gin_trgm_ops);
CREATE INDEX cards_archetype_idx  ON cards (archetype);
CREATE INDEX cards_type_idx       ON cards (type);
CREATE INDEX cards_ocg_date_idx   ON cards (ocg_date);

CREATE TABLE card_sets (
    code         TEXT PRIMARY KEY,
    name         TEXT    NOT NULL,
    ocg_date     DATE,
    tcg_date     DATE,
    num_of_cards INTEGER NOT NULL DEFAULT 0
);

CREATE TABLE card_prints (
    card_id    BIGINT NOT NULL REFERENCES cards (id) ON DELETE CASCADE,
    print_code TEXT   NOT NULL,                          -- ex.: LOB-EN005
    set_code   TEXT   NOT NULL REFERENCES card_sets (code) ON DELETE CASCADE,
    rarity     TEXT   NOT NULL DEFAULT '',
    PRIMARY KEY (card_id, print_code, rarity)
);

CREATE INDEX card_prints_set_idx ON card_prints (set_code);

-- Contas -----------------------------------------------------------------------

CREATE TABLE users (
    id            UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    email         CITEXT      NOT NULL UNIQUE,
    username      CITEXT      NOT NULL UNIQUE CHECK (username ~ '^[A-Za-z0-9_]{3,24}$'),
    password_hash TEXT        NOT NULL,
    bio           TEXT        NOT NULL DEFAULT '' CHECK (char_length(bio) <= 280),
    avatar_url    TEXT,
    created_at    TIMESTAMPTZ NOT NULL DEFAULT now()
);

CREATE TABLE refresh_tokens (
    id         UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    user_id    UUID        NOT NULL REFERENCES users (id) ON DELETE CASCADE,
    token_hash BYTEA       NOT NULL UNIQUE,              -- só o hash é guardado
    expires_at TIMESTAMPTZ NOT NULL,
    revoked_at TIMESTAMPTZ,
    created_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

CREATE INDEX refresh_tokens_user_idx ON refresh_tokens (user_id);

-- Decks ------------------------------------------------------------------------

CREATE TABLE decks (
    id             UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    owner_id       UUID        NOT NULL REFERENCES users (id) ON DELETE CASCADE,
    name           TEXT        NOT NULL CHECK (char_length(name) BETWEEN 1 AND 80),
    description    TEXT        NOT NULL DEFAULT '' CHECK (char_length(description) <= 2000),
    archetype      TEXT,
    visibility     TEXT        NOT NULL DEFAULT 'private' CHECK (visibility IN ('private', 'public')),
    cover_card_id  BIGINT      REFERENCES cards (id) ON DELETE SET NULL,
    like_count     INTEGER     NOT NULL DEFAULT 0 CHECK (like_count >= 0),
    comment_count  INTEGER     NOT NULL DEFAULT 0 CHECK (comment_count >= 0),
    created_at     TIMESTAMPTZ NOT NULL DEFAULT now(),
    updated_at     TIMESTAMPTZ NOT NULL DEFAULT now()
);

CREATE INDEX decks_owner_idx        ON decks (owner_id, updated_at DESC);
CREATE INDEX decks_popular_idx      ON decks (like_count DESC, id) WHERE visibility = 'public';
CREATE INDEX decks_recent_idx       ON decks (created_at DESC, id) WHERE visibility = 'public';
CREATE INDEX decks_archetype_idx    ON decks (archetype) WHERE visibility = 'public';
CREATE INDEX decks_name_trgm_idx    ON decks USING gin (name gin_trgm_ops);

CREATE TABLE deck_cards (
    deck_id  UUID     NOT NULL REFERENCES decks (id) ON DELETE CASCADE,
    card_id  BIGINT   NOT NULL REFERENCES cards (id),
    zone     TEXT     NOT NULL CHECK (zone IN ('main', 'extra', 'side')),
    quantity SMALLINT NOT NULL CHECK (quantity BETWEEN 1 AND 3),
    PRIMARY KEY (deck_id, card_id, zone)
);

-- Social -----------------------------------------------------------------------

CREATE TABLE deck_likes (
    deck_id    UUID        NOT NULL REFERENCES decks (id) ON DELETE CASCADE,
    user_id    UUID        NOT NULL REFERENCES users (id) ON DELETE CASCADE,
    created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
    PRIMARY KEY (deck_id, user_id)
);

CREATE TABLE comments (
    id         UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    deck_id    UUID        NOT NULL REFERENCES decks (id) ON DELETE CASCADE,
    author_id  UUID        NOT NULL REFERENCES users (id) ON DELETE CASCADE,
    body       TEXT        NOT NULL CHECK (char_length(body) BETWEEN 1 AND 1000),
    created_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

CREATE INDEX comments_deck_idx ON comments (deck_id, created_at DESC, id);

CREATE TABLE follows (
    follower_id UUID        NOT NULL REFERENCES users (id) ON DELETE CASCADE,
    followee_id UUID        NOT NULL REFERENCES users (id) ON DELETE CASCADE,
    created_at  TIMESTAMPTZ NOT NULL DEFAULT now(),
    PRIMARY KEY (follower_id, followee_id),
    CHECK (follower_id <> followee_id)
);

CREATE INDEX follows_followee_idx ON follows (followee_id);

-- Coleção pessoal --------------------------------------------------------------

CREATE TABLE collection_items (
    user_id  UUID    NOT NULL REFERENCES users (id) ON DELETE CASCADE,
    card_id  BIGINT  NOT NULL REFERENCES cards (id),
    quantity INTEGER NOT NULL CHECK (quantity >= 0),
    PRIMARY KEY (user_id, card_id)
);
-- +goose StatementEnd

-- +goose Down
-- +goose StatementBegin
DROP TABLE IF EXISTS collection_items;
DROP TABLE IF EXISTS follows;
DROP TABLE IF EXISTS comments;
DROP TABLE IF EXISTS deck_likes;
DROP TABLE IF EXISTS deck_cards;
DROP TABLE IF EXISTS decks;
DROP TABLE IF EXISTS refresh_tokens;
DROP TABLE IF EXISTS users;
DROP TABLE IF EXISTS card_prints;
DROP TABLE IF EXISTS card_sets;
DROP TABLE IF EXISTS cards;
-- +goose StatementEnd
