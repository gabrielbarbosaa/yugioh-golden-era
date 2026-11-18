-- +goose Up
-- A 00002 removeu users.avatar_url, e isso derruba (500) qualquer binário antigo da API que ainda esteja rodando.
-- Recolocamos a coluna, sem uso, para reinícios graduais: a remoção definitiva fica para uma migração futura,
-- depois que nenhuma versão antiga estiver em execução (expandir -> migrar -> contrair).
ALTER TABLE users ADD COLUMN IF NOT EXISTS avatar_url TEXT;

-- +goose Down
ALTER TABLE users DROP COLUMN IF EXISTS avatar_url;