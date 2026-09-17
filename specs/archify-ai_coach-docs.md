# Document AI_Coach with Archify diagrams

## Goal

Generate a complete visual documentation set for the AI_Coach project
(`/root/Hermes/repos/AI_Coach`) using the **archify** skill. Output a
small portfolio of self-contained HTML diagrams under
`docs/diagrams/`, plus a `docs/ARCHITECTURE.md` that references them.

## Skill that's already installed (Daviid/Alfred set this up)

`archify` is installed in two places:

- **Alfred's skill store**: `~/.hermes/skills/archify/SKILL.md`
- **Your profile**: `~/.hermes/profiles/developer/skills/archify/SKILL.md`

**Read your profile's SKILL.md BEFORE starting.** It documents the JSON IR
schema (which is strict — `validate` will reject your first attempt), the
5 diagram types (`architecture`, `workflow`, `sequence`, `dataflow`,
`lifecycle`), the CLI commands (`validate`, `deliver`, `preview`,
`inspect`, `guide`, `examples`), and common recipes.

The renderer itself lives at `/root/Hermes/tools/archify/` (a pinned
clone of `tt-a1i/archify` v2.17.0-dev.1, MIT licensed).

**Always invoke as:**

```bash
ARCHIFY_UPDATE_CHECK_DISABLED=1 \
  node /root/Hermes/tools/archify/archify/bin/archify.mjs \
  <validate|preview|deliver|inspect|guide|examples> \
  <type> <input.json> [output.html]
```

`ARCHIFY_UPDATE_CHECK_DISABLED=1` is mandatory — without it the CLI pings
a remote update endpoint which fails on this server and adds noise.

## BEFORE you write any IR (mandatory)

Run `archify doctor` to confirm the install is healthy:

```bash
ARCHIFY_UPDATE_CHECK_DISABLED=1 \
  node /root/Hermes/tools/archify/archify/bin/archify.mjs doctor
```

Then read **at least one example per type you'll generate**. The fastest way:

```bash
ARCHIFY_UPDATE_CHECK_DISABLED=1 \
  node /root/Hermes/tools/archify/archify/bin/archify.mjs examples
# Lists every example file under /root/Hermes/tools/archify/archify/examples/
```

Read the `.json` source of each type you're going to author (`architecture`,
`sequence`, `dataflow`, `workflow`). Mirror that structure; do NOT invent
keys. The validator will tell you what's wrong but it's faster to read a
working example first.

## Project context (what to document)

AI_Coach is an English-tutor web app:
- **Frontend**: Next.js 14 (TypeScript, CSS Modules), React 18, MediaRecorder
  for audio capture, TTS playback via `<audio>` tags.
- **Backend**: FastAPI (Python 3.11 + uv), uvicorn, Pydantic v2.
- **Speech**: faster-whisper for STT (base model, CPU, int8), edge-tts
  (en-US-AriaNeural) for TTS — both run locally on the same VPS as FastAPI.
- **LLM**: routed through OmniRoute (systemd on host:20128) → free model
  via OpenAI-compatible API. The backend reaches it via
  `host.docker.internal:20128` (compose) or `http://localhost:20128` (native).
- **State**: in-process `SessionStore` singleton (memory only, lost on
  restart), plus on-disk `app/static/audio/*.mp3` and
  `app/static/audio/stt/*.webm`.
- **Frontend ⇄ Backend**: Next.js rewrites `/api/*` → backend container.
  In local dev, backend on host port 18100, frontend on 18101.
- **Demo cap**: `DEMO_MESSAGE_LIMIT=5` (configurable via env, `-1` for
  unlimited). Enforced in `app.api.chat` before `append_message`. Returns
  HTTP 429 when at cap. Per-session state is tracked by counting user-role
  messages.

Read these files to ground every diagram in real lines of code:
- `backend/app/main.py` (FastAPI app, routes mount).
- `backend/app/api/chat.py` (the `/api/chat` endpoint — central to most
  diagrams).
- `backend/app/session.py` (`SessionStore` singleton, `DEMO_MESSAGE_LIMIT`,
  `is_at_demo_limit`).
- `backend/app/stt.py`, `backend/app/tts.py`, `backend/app/llm.py`.
- `frontend/app/page.tsx` (the chat page UI: input + mic + audio player).
- `frontend/components/Topbar.tsx`, `AudioPlayer.tsx`.
- `docker-compose.yml` (service topology + env vars).

## Required deliverables

Generate **at least 4 diagrams** under `docs/diagrams/`. The exact type
choice is yours; the following is the minimum useful coverage:

| Filename | Suggested type | Must cover |
|---|---|---|
| `docs/diagrams/ai-coach-architecture.html` | `architecture` | Components: Next.js frontend, FastAPI backend, faster-whisper STT, edge-tts TTS, OmniRoute LLM gateway, browser media API, on-disk audio dirs, in-memory SessionStore. Boundaries for "Browser" / "FastAPI process" / "External services". At least 10 components. |
| `docs/diagrams/ai-coach-chat-sequence.html` | `sequence` | One full text-only turn from user pressing Enter to the coach's audio reply playing. Actors: User, Browser UI, Next.js frontend, FastAPI /api/chat, OmniRoute LLM, edge-tts TTS, audio disk, SessionStore. Include the `DEMO_MESSAGE_LIMIT` check at the start of the request. |
| `docs/diagrams/ai-coach-audio-dataflow.html` | `dataflow` | Audio bytes from mic capture → browser → multipart POST → STT_DIR disk → faster-whisper → text. Coach reply text → edge-tts → AUDIO_DIR disk → Next.js → `<audio>` tag play. Mark ephemeral vs persistent stores. |
| `docs/diagrams/ai-coach-dev-deploy.html` | `architecture` OR a fresh `workflow` | docker-compose dev topology on the VPS: how backend (18100), frontend (18101), host.docker.internal → 20128 (OmniRoute systemd), the bind-mounted `ai-coach-audio` volume. Optional but recommended. |

Each `.html` is produced by a corresponding input `.json` you commit too:

```
docs/diagrams/
  ai-coach-architecture.json
  ai-coach-architecture.html
  ai-coach-chat-sequence.json
  ai-coach-chat-sequence.html
  ai-coach-audio-dataflow.json
  ai-coach-audio-dataflow.html
  ai-coach-dev-deploy.json
  ai-coach-dev-deploy.html    (only if you did the 4th)
```

`docs/ARCHITECTURE.md` index file:

```markdown
# AI Coach — Architecture

Visual documentation generated with [archify](...). Rendered HTML is
self-contained (no runtime deps, works offline).

| Diagram | What it covers |
|---|---|
| [ai-coach-architecture](diagrams/ai-coach-architecture.html) | Top-level component layout |
| [ai-coach-chat-sequence](diagrams/ai-coach-chat-sequence.html) | One full text turn, end to end |
| [ai-coach-audio-dataflow](diagrams/ai-coach-audio-dataflow.html) | Where audio bytes live and how they move |
| [ai-coach-dev-deploy](diagrams/ai-coach-dev-deploy.html) | docker-compose dev topology |
```

Plus a one-line addition to `README.md` near "Documentation" or at the bottom:

```markdown
See [docs/ARCHITECTURE.md](docs/ARCHITECTURE.md) for the visual system map.
```

## Acceptance criteria

1. **AC-1 four diagrams delivered.** `ls docs/diagrams/*.html` shows at
   least 4 self-contained HTML files generated by archify (look for
   `<meta name="generator" content="archify ...">` in the head). Each one
   opens cleanly in a browser offline.
2. **AC-2 validate pass.** Each input `.json` produces
   `0 errors, 0 warnings` from `archify validate`. Paste the validate
   output into the completion summary.
3. **AC-3 architecture grounded in real code.** Open
   `ai-coach-architecture.html` in a browser, confirm:
   - Frontend box is cyan (layer: frontend), not emerald.
   - STT and TTS are separate components, not folded into one.
   - `OMNIROUTE_BASE_URL` connection reaches a labelled "OmniRoute"
     external component.
   - `SessionStore` is labelled with its lifecycle (in-memory only).
4. **AC-4 sequence covers the demo-limit gate.** Open
   `ai-coach-chat-sequence.html`, confirm the first arrow goes from
   `FastAPI /api/chat` to `SessionStore` with the label referencing
   `DEMO_MESSAGE_LIMIT` or `is_at_demo_limit`.
5. **AC-5 ARCHITECTURE.md index committed and linked from README.md.**
6. **AC-6 no extra/leftover IR.** Final `git status` only shows added
   files under `docs/diagrams/` and `docs/ARCHITECTURE.md`, plus the
   README delta. No new code files, no unrelated changes.
7. **AC-7 push only.** Branch pushed to
   `origin feat/archify-ai_coach-docs`. No PR (Daviid merges). No push
   to main.

## Implementation workflow (recommended order)

1. `archify doctor` — confirm install is healthy.
2. `archify examples` — read each type's example `.json` you plan to use.
3. Author `ai-coach-architecture.json` first (it's the broadest →
   easiest to validate ground truth from).
4. Run `archify validate architecture ai-coach-architecture.json`.
   Fix issues, re-run, until `0 errors`.
5. `archify deliver architecture ai-coach-architecture.json ai-coach-architecture.html`.
6. `archify inspect architecture ai-coach-architecture.json` to verify
   the rendered node IDs match what you expect.
7. Open the rendered HTML in a browser (use `xdg-open` or just `curl`
   to confirm it's well-formed). Verify AC-3 conditions.
8. Repeat for `sequence`, `dataflow`, and the optional 4th.
9. Write `docs/ARCHITECTURE.md` and add the README link.
10. Commit + push.

## Pitfalls (learned from earlier work)

- **Validate BEFORE deliver.** If you skip, the rendered HTML may have
  invisible overlays or wrong-direction arrows. `validate` is fast.
- **Don't invent keys.** The validator catches wrong keys with helpful
  messages, but reading a real example first saves a round trip.
- **`< 30 nodes per diagram`.** If you go over, the layout engine starts
  overlapping boxes. Split into multiple diagrams rather than cramming.
- **`pos: [x, y]` matters.** Without explicit positions you get
  auto-layout which works but is opinionated. To get a clean layout
  similar to other projects, set positions to a grid like
  `[(40, 300), (250, 300), (460, 300), (670, 300), (880, 300)]`
  (the `web-app.architecture.json` example uses this pattern).
- **Don't write a one-html-file PR.** Save the inputs (`.json`) alongside
  the rendered `.html` so the diagrams can be re-rendered after edits.
- **Commit `.gitignore` of large auto-generated junk.** Don't add
  `/tmp/...` outputs or `node_modules` to the repo. Only the four
  `.json` + `.html` pairs and the `ARCHITECTURE.md` go into the PR.

## Branch + PR contract (Daviid, 2026-08-31)

- **Branch already created**: `feat/archify-ai_coach-docs` (you ARE on it).
- Do NOT push to main. Do NOT open a PR. Daviid merges manually.
- Commits: conventional prefix `docs(archify): ...` is fine.

## CRITICAL DONE gate (Daviid, 2026-09-13)

**DONE requires ALL of these simultaneously:**

1. `git log origin/feat/archify-ai_coach-docs --oneline` shows ≥1 commit.
2. `git status --short` is empty.
3. `ls docs/diagrams/*.html` shows ≥ 4 `.html` files.
4. `archify validate <type> <input.json>` for each diagram returns
   `0 errors, 0 warnings`.
5. `docs/ARCHITECTURE.md` exists and links the diagrams.
6. `README.md` has the one-line link.
7. The commit hash(es) are in your `kanban complete` summary.

If any fails: `kanban block` with the failure reason — do NOT fake completion.

## Verification commands to run before completing

Paste the actual stdout into the completion summary:

```bash
cd /root/Hermes/repos/AI_Coach

# AC-1: html files present
ls -la docs/diagrams/ | grep -E '\.html$'

# AC-1: each is archify-generated
for f in docs/diagrams/*.html; do
  echo "=== $f ==="
  grep -m1 'name="generator" content="archify' "$f"
done

# AC-2: validate pass for each json
for f in docs/diagrams/*.json; do
  echo "=== $f ==="
  type=$(basename "$f" | sed 's/.*\.\(.*\)\.json$/\1/')
  base=$(basename "$f" | sed 's/\.json$//' | sed 's/\.[^.]*$//')
  # 'type' is architecture/sequence/dataflow; use derived name
  ARCHIFY_UPDATE_CHECK_DISABLED=1 \
    node /root/Hermes/tools/archify/archify/bin/archify.mjs \
    validate $type "$f" 2>&1 | tail -2
done

# AC-5
test -f docs/ARCHITECTURE.md && head -5 docs/ARCHITECTURE.md
grep -c 'ARCHITECTURE.md' README.md
```

## Definition of done

- [ ] All 7 ACs verified with commands above.
- [ ] Branch pushed, working tree clean.
- [ ] Completion summary references this spec at
      `specs/archify-ai_coach-docs.md`.
