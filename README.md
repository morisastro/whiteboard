# Whiteboard

Prosty whiteboard do rysowania z zapisem boardów do bucketa S3 (np. MinIO na tym samym VPS).

## Funkcje

- Rysowanie (długopis, gumka), kolory, grubość, undo, clear, eksport PNG
- Wiele boardów: zapis / wczytanie / usunięcie (Ctrl+S zapisuje)
- Boardy trzymane jako JSON w buckecie MinIO/S3
- Podstawowa autoryzacja HTTP Basic (opcjonalna)

## Env vars (ustaw w Coolify)

| Zmienna | Opis |
|---|---|
| `S3_ENDPOINT` | Adres MinIO/S3, np. `http://minio:9000` |
| `S3_BUCKET` | Nazwa bucketa (np. `whiteboard`) |
| `S3_REGION` | Region, domyślnie `us-east-1` |
| `S3_ACCESS_KEY` | Access key MinIO |
| `S3_SECRET_KEY` | Secret key MinIO |
| `AUTH_USER` | Login (puste = brak hasła) |
| `AUTH_PASS` | Hasło |

## Uruchomienie lokalnie

```bash
cp .env.example .env
# edytuj .env
npm install
node server.js
# http://localhost:3000
```

## Deploy na Coolify

### Wariant A: docker-compose (aplikacja + MinIO naraz)

W Coolify: **New Resource → Docker Compose** z tego repo. Coolify wykryje zmienne `${...}` z `docker-compose.yml` i poprosi o ich wypełnienie:

- `MINIO_ROOT_USER` / `MINIO_ROOT_PASSWORD` — login i hasło roota do MinIO (też używane jako klucze S3 przez aplikację)
- `S3_BUCKET` — domyślnie `whiteboard`
- `AUTH_USER` / `AUTH_PASS` — login i hasło do whiteboarda

Compose stawia: MinIO (z wolumenem `minio-data`), jednorazowy kontener `minio-init` (tworzy bucket) i aplikację na porcie `3000`.

Po deploju:
1. Domenę ustaw w zakładce **Domains** przy serwisie `whiteboard` (port 3000).
2. Konsolę MinIO znajdziesz na `http://<IP-VPS>:9001` (log: MINIO_ROOT_USER/PASSWORD). Po konfiguracji możesz zamknąć port 9001 w firewallu.

### Wariant B: samo Dockerfile (MinIO już masz)

1. Wypchnij repo na GitHub/Gitea.
2. W Coolify: **New Resource → Dockerfile** z tego repo.
3. Ustaw env vars z tabeli powyżej.
   - Jeśli MinIO działa w Coolify na tym samym VPS: użyj `http://minio:9000` (nazwa usługi w tej samej sieci Docker) albo `http://<IP-VPS>:9000`.
4. Ustaw port `3000` i domenę w zakładce **Domains**.
5. Utwórz bucket `whiteboard` w MinIO (i ewentualnie access key) — aplikacja sama zapisuje pod `boards/<nazwa>.json`.

## Struktura

- `server.js` — Express + @aws-sdk/client-s3, endpointy `/api/boards`
- `public/` — frontend (vanilla JS canvas)
- `Dockerfile` — obraz do Coolify
