-- +goose Up
-- A foto de perfil passa a ser uma carta do catálogo (a imagem vem de cards.image_small_path).
ALTER TABLE users ADD COLUMN avatar_card_id BIGINT REFERENCES cards (id) ON DELETE SET NULL;
ALTER TABLE users DROP COLUMN avatar_url;

-- +goose Down
ALTER TABLE users ADD COLUMN avatar_url TEXT;
ALTER TABLE users DROP COLUMN avatar_card_id;
