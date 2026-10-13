# Whiteboard

Prosty whiteboard do rysowania z zapisem boardów do bucketa S3 (SeaweedFS w stosie compose).

## Funkcje

- Rysowanie (długopis, gumka), kolory, grubość, undo, clear, eksport PNG
- Wiele boardów: zapis / wczytanie / usunięcie (Ctrl+S zapisuje)
- Boardy trzymane jako JSON w buckecie S3 (bucket tworzy się sam przy starcie)
- Podstawowa autoryzacja HTTP Basic (opcjonalna)

## Env vars (ustaw w Coolify)

| Zmienna | Opis |
|---|---|
| `S3_ENDPOINT` | Adres serwera S3, np. `http://s3:8333` (SeaweedFS ze stosu compose) |
| `S3_BUCKET` | Nazwa bucketa (tworzony automatycznie przy starcie) |
| `S3_REGION` | Region, domyślnie `us-east-1` |
| `S3_ACCESS_KEY` | Login S3 |
| `S3_SECRET_KEY` | Hasło S3 |
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

### Wariant A: docker-compose (aplikacja + SeaweedFS naraz)

W Coolify: **New Resource → Docker Compose** z tego repo. Coolify wykryje zmienne `${...}` z `docker-compose.yaml` i poprosi o ich wypełnienie:

- `S3_ACCESS_KEY` / `S3_SECRET_KEY` — dowolny login i hasło (uwierzytelniają S3 i aplikację)
- `S3_BUCKET` — np. `whiteboard` (tworzony automatycznie)
- `AUTH_USER` / `AUTH_PASS` — login i hasło do whiteboarda

Compose stawia: SeaweedFS w trybie S3 (port 8333, wolumen `s3-data`, niedostępny z zewnątrz) i aplikację na porcie `3000`. Bucket tworzy się automatycznie przy pierwszym starcie aplikacji.

Po deploju: ustaw domenę w zakładce **Domains** przy serwisie `whiteboard` (port 3000).

### Wariant B: samo Dockerfile (masz już S3/MinIO)

1. Wypchnij repo na GitHub/Gitea.
2. W Coolify: **New Resource → Dockerfile** z tego repo.
3. Ustaw env vars z tabeli powyżej.
4. Ustaw port `3000` i domenę w zakładce **Domains**.

Aplikacja sama tworzy bucket, jeśli nie istnieje (wymaga to uprawnień w danym S3; na AWS S3 utwórz bucket ręcznie).

## Struktura

- `server.js` — Express + @aws-sdk/client-s3, endpointy `/api/boards`
- `public/` — frontend (vanilla JS canvas)
- `Dockerfile` — obraz do Coolify
