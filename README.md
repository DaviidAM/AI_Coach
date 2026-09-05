# AI Coach

Voice + text AI English teacher with progressive correction by CEFR level (A1–C2).

## Stack

- **Frontend:** Next.js 14, TypeScript, Tailwind
- **Backend:** FastAPI, Python (uv-managed)
- **LLM:** MiniMax

## Development

### Backend

```bash
cd backend
uv run uvicorn app.main:app --host 0.0.0.0 --port 8000
```

### Frontend

```bash
cd frontend
npm run dev
```

## Running E2E tests

```bash
make e2e
```

This starts the backend and frontend locally, runs Playwright tests against `localhost`, and tears down on exit.

**Requires:** `uv`, `node`, `npm`, `playwright`.

**Note:** Tests run against localhost — the live Cloudflare tunnel is for manual verification only.
