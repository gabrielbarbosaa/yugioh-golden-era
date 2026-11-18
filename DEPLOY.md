# Publicar na VPS (novaera.gabrielbarbosadev.com.br)

O repositório roda inteiro em Docker (banco, API, servidor de duelo e site). Na frente fica um proxy HTTPS que
distribui o tráfego do subdomínio:

| Caminho | Vai para | O quê |
|---|---|---|
| `/v1/*` e `/images/*` | API (`127.0.0.1:18080`) | dados do app/site e imagens das cartas |
| `/duel-server/*` | servidor de duelo (`127.0.0.1:18787`) | ingressos e WebSocket das partidas |
| tudo o resto | site (`127.0.0.1:13000`) | páginas |

Nada do compose de produção fica aberto para a internet: tudo escuta só em `127.0.0.1`, e o proxy é a única porta
pública (80/443).

## 1. DNS

No painel do domínio, crie um registro **A** `novaera` apontando para o IP da VPS (e **AAAA**, se ela tiver IPv6).
Espere propagar: `nslookup novaera.gabrielbarbosadev.com.br`.

## 2. Requisitos na VPS

- Docker com o plugin compose (`docker compose version`).
- `git`.
- Um proxy: **Caddy** (mais simples, HTTPS automático) **ou nginx** + certbot. Se a VPS já tem um deles para outros
  apps, use o mesmo: basta acrescentar o bloco do subdomínio.
- Firewall liberando só 22, 80 e 443.

## 3. Baixar o projeto na pasta `apps`

```bash
cd ~/apps
git clone https://github.com/gabrielbarbosaa/yugioh-golden-era.git novaera
cd novaera
```

(Se o repositório for privado, use uma deploy key ou um token do GitHub no `git clone`.)

## 4. Configurar

```bash
cp .env.production.example .env.production
nano .env.production        # troque POSTGRES_PASSWORD e JWT_SECRET (openssl rand -hex 32); confira o DOMAIN
chmod +x deploy/*.sh         # uma vez, para poder rodar ./deploy/update.sh
```

**Defina a senha do banco (`POSTGRES_PASSWORD`) antes do primeiro `up`:** o Postgres só a aplica ao criar o volume.
Se mudar depois, a API não conecta ("password authentication failed"); nesse caso volte a senha antiga ou recrie o
banco (`docker compose ... down -v`, que apaga os dados).
As portas padrão (18080, 18787, 13000) são altas de propósito, para não bater com outros apps. Se alguma estiver em
uso, mude no `.env.production` **e** nas linhas `reverse_proxy` / `proxy_pass` do proxy.

## 5. Subir

```bash
docker compose -f docker-compose.prod.yml --env-file .env.production up -d --build
docker compose -f docker-compose.prod.yml --env-file .env.production ps     # tudo "healthy"/"running"
```

A API aplica as migrações do banco sozinha ao subir.

## 6. Catálogo de cartas e imagens

O banco nasce vazio. Em vez de baixar tudo de novo na VPS, leve o catálogo que você já tem no computador.

**No seu computador** (compose de desenvolvimento no ar e `.data/images` preenchida):

```bash
./deploy/export-catalog.sh                                   # gera catalog.sql
scp catalog.sql USUARIO@IP_DA_VPS:~/apps/novaera/
rsync -avz --progress .data/images/ USUARIO@IP_DA_VPS:~/apps/novaera/.data/images/
```

**Na VPS:**

```bash
cd ~/apps/novaera
chmod -R a+rX .data/images          # o container da API lê como usuário sem privilégios
docker compose -f docker-compose.prod.yml --env-file .env.production exec -T db \
  sh -c 'psql -U "$POSTGRES_USER" -d "$POSTGRES_DB" -v ON_ERROR_STOP=1' < catalog.sql
```

(No Windows, rode o `export-catalog.sh` pelo Git Bash ou WSL, ou copie os comandos de dentro dele.)

## 7. Proxy

**Caddy:** acrescente o conteúdo de `deploy/Caddyfile` ao seu Caddyfile e recarregue (`sudo systemctl reload caddy`).
O certificado é emitido sozinho.

**nginx:**

```bash
sudo cp deploy/nginx.conf /etc/nginx/sites-available/novaera
sudo ln -s /etc/nginx/sites-available/novaera /etc/nginx/sites-enabled/
sudo nginx -t && sudo systemctl reload nginx
sudo certbot --nginx -d novaera.gabrielbarbosadev.com.br
```

**Caddy (ou outro proxy) que já roda em Docker na VPS:** não instale outro proxy (as portas 80/443 já estão em uso).
Descubra a rede dele (`docker network ls`; ex.: `proxy`) e ligue o Novaera a ela:

```bash
echo 'PROXY_NETWORK=proxy' >> .env.production        # nome da rede do seu proxy
docker compose -f docker-compose.prod.yml -f docker-compose.proxy.yml --env-file .env.production up -d
cp deploy/caddy-docker.caddy ~/proxy/sites/novaera.caddy       # pasta que o Caddyfile importa (sites/*.caddy)
docker exec proxy-caddy-1 caddy validate --config /etc/caddy/Caddyfile
docker exec proxy-caddy-1 caddy reload --config /etc/caddy/Caddyfile
```

O `deploy/update.sh` passa a incluir o `docker-compose.proxy.yml` sozinho quando `PROXY_NETWORK` existe.
## 8. Conferir

```bash
curl -s https://novaera.gabrielbarbosadev.com.br/v1/health          # {"status":"ok",...}
curl -sI https://novaera.gabrielbarbosadev.com.br/ | head -1         # HTTP/2 200
curl -s https://novaera.gabrielbarbosadev.com.br/duel-server/healthz # {"status":"ok",...}
```

Depois abra o site, crie uma conta, e jogue contra o bot na aba Duelo.

## 9. Atualizar (a rotina do dia a dia)

```bash
cd ~/apps/novaera
./deploy/update.sh        # git pull + rebuild + restart; as migrações rodam sozinhas
```

## 10. App de celular

Gere o app apontando para a produção:

```bash
EXPO_PUBLIC_API_URL=https://novaera.gabrielbarbosadev.com.br/v1 \
EXPO_PUBLIC_DUEL_URL=https://novaera.gabrielbarbosadev.com.br/duel-server \
npx expo start      # ou o build com EAS
```

As imagens vêm de `<API>/images` automaticamente.

## Backup

```bash
docker compose -f docker-compose.prod.yml --env-file .env.production exec -T db \
  sh -c 'pg_dump -U "$POSTGRES_USER" "$POSTGRES_DB"' > backup-$(date +%F).sql
```

Contas, decks, curtidas e coleções ficam no volume `pgdata`; o catálogo se regenera do `catalog.sql`/ingestão.

## Problemas comuns

- **502 Bad Gateway:** o container não subiu. `docker compose -f docker-compose.prod.yml --env-file .env.production logs api web duel`.
- **"Invalid Server Actions request" ao entrar/curtir:** o proxy precisa repassar `Host` e `X-Forwarded-Host`
  (os arquivos de `deploy/` já fazem isso).
- **Login não "gruda":** o cookie é `Secure`, então só funciona em HTTPS. Acesse sempre pelo `https://`.
- **Imagens das cartas quebradas:** confira a pasta `.data/images`, a permissão de leitura (`chmod -R a+rX`) e se o
  `DOMAIN` do `.env.production` é o do subdomínio.
- **Partida cai sozinha:** o proxy precisa permitir WebSocket e ter timeout de leitura longo (já configurado).
- **A API recusa subir com "JWT_SECRET":** use 32+ caracteres e um valor diferente do padrão de desenvolvimento.