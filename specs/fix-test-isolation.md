# Fix cross-test interference in pytest suite (8 failures when running `pytest tests/`)

## Symptom

The pytest suite has **interference failures**: tests pass in isolation but fail
when run together with `pytest tests/`.

| Run | Result |
|---|---|
| `pytest tests/test_message_limit.py` alone | 12/12 ✅ |
| `pytest tests/test_stt_tts.py` alone | 21/21 ✅ |
| `pytest tests/test_regression.py` alone | (need to verify — likely ✅) |
| `pytest tests/` (full suite) | **8 failed, 91 passed** ❌ |

This same 8-failure pattern exists on both `main` (2 fail) and
`feat/configurable-message-limit` (8 fail because more test files share state
now after this PR). **It is NOT a regression from the message-limit feature.**

## Failing tests (8)

Reproduce with: `cd /root/Hermes/repos/AI_Coach/backend && uv run pytest tests/ -v`

```
tests/test_regression.py::TestSavedRecordings::test_audio_chat_saves_original_recording
tests/test_regression.py::TestSavedRecordings::test_text_chat_does_not_create_stt_file
tests/test_stt_tts.py::TestTranscribe::test_transcribe_uses_base_model_cpu
tests/test_stt_tts.py::TestChatAudioResponse::test_post_audio_returns_all_fields
tests/test_stt_tts.py::TestChatAudioResponse::test_user_audio_url_follows_uuid_pattern
tests/test_stt_tts.py::TestChatAudioResponse::test_coach_audio_url_follows_uuid_pattern
tests/test_stt_tts.py::TestChatAudioValidation::test_audio_only_valid
tests/test_stt_tts.py::TestSTTValidation::test_empty_audio_returns_empty_string
```

## Root cause (diagnosed, not guessed)

Three categories of state leak between test files:

1. **`SessionStore` singleton** — `backend/app/session.py:83` defines a
   module-level `store = SessionStore()`. Session IDs accumulated by one test
   file bleed into the next. `test_message_limit.py::TestChatEnforcement`
   creates sessions like `f"limit-test-{uuid4()}"` that aren't cleaned up.
   When `test_stt_tts.py::TestChatAudioResponse` later queries the same store,
   it sees stale state.

2. **STT model singleton (whisper)** — `backend/app/stt.py` (or wherever the
   faster-whisper model is loaded) caches the loaded model at module scope.
   `test_stt_tts.py::TestTranscribe::test_transcribe_uses_base_model_cpu`
   asserts the model name. If another test file patches the loader differently,
   the assertion fails. Verify by looking at conftest.py fixtures.

3. **Disk artifacts in `static/audio/`** — `backend/app/api/chat.py` writes
   WAV/MP3 files to `backend/app/static/audio/stt/` and
   `backend/app/static/audio/`. `test_regression.py::TestSavedRecordings`
   counts files in these dirs. Other test files accumulate files that
   `TestSavedRecordings` then trips over, and cleanup isn't happening between
   test files.

4. **HTTP mock registration** — the LLM / OmniRoute mocks are registered at
   the `conftest.py` level but might be reset/replaced by test-specific
   fixtures in `test_message_limit.py` (the new file). The
   `ConnectError: Connection refused` in `test_regression.py` is a symptom:
   a mock was uninstalled and the test then tried to reach the real OmniRoute.

## Goal

`pytest tests/ -q` runs cleanly: **0 failed** when run as a single suite,
with the existing test count preserved or growing. Tests in isolation still pass
(regression check: `pytest tests/test_stt_tts.py`, `pytest tests/test_message_limit.py`,
`pytest tests/test_regression.py` each in isolation must still be all-green).

## Functional requirements

### FR-1 — `SessionStore` isolation per test

- Add a session-scoped autouse fixture (or function-scoped with `autouse=True`)
  in `backend/tests/conftest.py` that calls `store._sessions.clear()` before
  AND after each test function.
- Or, better, expose a `store.reset_all()` method on `SessionStore` that
  wipes sessions + corrections caches, and call it from the fixture.
- The fixture must NOT remove the `store` singleton itself — tests that
  import `store` from `app.session` must keep working.

### FR-2 — STT/TTS module mocks per test

- `backend/app/stt.py` exposes a module-level model singleton. Add a fixture
  in `conftest.py` that snapshots the model reference before each test and
  restores it after. Or — preferred — refactor the loaders into functions
  that take a model name parameter so tests can patch the loader, not the
  model.
- `TestTranscribe::test_transcribe_uses_base_model_cpu` must pass regardless
  of order.

### FR-3 — `static/audio/` cleanup

- Add a `tmp_path`-backed fixture that monkeypatches `AUDIO_DIR` and
  `STT_DIR` in `backend/app/api/chat.py` to point to a per-test temporary
  directory. This is the cleanest fix — production code uses the real dirs,
  tests use `tmp_path`. Pattern is well-supported by pytest.
- Delete the existing `backend/app/static/audio/stt/*.webm` etc. leftovers
  from previous runs (these are not in git but pollute disk and confuse
  `TestSavedRecordings`). One-time `find … -delete` or `rm -rf` — safe
  because the directories are bind-mounted in docker but ignored in git.

### FR-4 — HTTP mock isolation

- Audit `conftest.py` and the test-specific fixtures. The
  `ConnectError: Connection refused` in `test_regression.py` means a mock was
  torn down. Move all HTTP mocking into function-scoped fixtures (not
  module-scoped). Or use `pytest-httpx` / `respx` properly scoped.
- Verify: `test_regression.py` and `test_message_limit.py` running in any
  order both pass.

### FR-5 — conftest.py centralization

- The fixtures from FR-1..FR-4 MUST live in `backend/tests/conftest.py`
  (single source of truth), not duplicated across test files.
- Audit `tests/test_combo_fallback.py`, `tests/test_omniroute_integration.py`,
  etc. for fixtures that should be promoted to conftest.py.

### FR-6 — Deterministic test order

- Run `pytest tests/ -p no:randomly` (no random ordering plugin) — already
  true, but confirm.
- Add a `pytest.ini` / `pyproject.toml [tool.pytest.ini_options]` block with
  `addopts = "-v --tb=short"` and explicit `testpaths = ["tests"]`.
- Optionally: add `pytest-xdist` with `--dist=loadfile` so test files don't
  share a worker (heavier change — out of scope unless trivial).

## Acceptance criteria

1. **AC-1 full suite green.** `cd /root/Hermes/repos/AI_Coach/backend && uv run pytest tests/ -q`
   reports `0 failed`. Test count grows by at most +2 (the fixtures themselves
   if they need assertions) but never decreases.
2. **AC-2 isolation preserved.** Running each test file individually
   (`pytest tests/test_stt_tts.py`, `…/test_message_limit.py`, `…/test_regression.py`,
   `…/test_env_overrides.py`, `…/test_omniroute_integration.py`) all stay
   green.
3. **AC-3 random order robust.** `pytest tests/ -p no:cacheprovider --tb=short`
   runs clean. If you can add `pytest-randomly` and run with `--randomly-seed=...`
   variations, that's a bonus. Not required.
4. **AC-4 no production-code regressions.** `MAX_MESSAGES`, the demo-limit
   feature, and the new `/api/config` endpoint still behave as in
   `feat/configurable-message-limit`. No logic changes to `app/*.py` outside
   what's strictly needed to make mocks work.
5. **AC-5 conftest.py clean.** No more than 2 fixtures per concern (one for
   session, one for audio dirs, one for HTTP mocks). If a fixture exceeds
   ~40 lines, split it.
6. **AC-6 audio leftovers removed.** `find backend/app/static/audio -type f`
   returns empty after `pytest tests/` finishes (proves cleanup works).
7. **AC-7 disk leftover cleanup.** Run a one-shot `git clean -nf backend/app/static/audio`
   BEFORE the test run — there should be no tracked files in that path,
   confirming the directory is gitignored.

## Out of scope

- Migrating from FastAPI's `TestClient` to `httpx.AsyncClient` (works fine).
- Speeding up the suite (some tests load whisper model — slow but acceptable).
- Adding new test coverage for features. Only fix the 8 failing tests.
- Refactoring `SessionStore` into a per-request dependency-injected instance.
  Singleton is fine; we just need to reset it between tests.

## Files expected to change

- `backend/tests/conftest.py` — add fixtures (main work happens here).
- `backend/app/api/chat.py` — minor change: `AUDIO_DIR` / `STT_DIR` made
  overridable (e.g. via env var or function arg) so tests can monkeypatch
  them to `tmp_path`. Don't change the default value.
- `backend/app/session.py` — add `SessionStore.reset_all()` method (one
  method, ~5 lines).
- `backend/app/stt.py` (or wherever the whisper model is cached) — refactor
  model loader to be patchable, OR add a `reset_model()` function for tests.
- `backend/pyproject.toml` — possibly update `[tool.pytest.ini_options]` for
  explicit config.

## Branch + PR contract

- **New branch** from `main` (NOT from `feat/configurable-message-limit`):
  `fix/test-suite-isolation`. Rationale: this is orthogonal to the demo-limit
  feature and should be mergeable independently.
- Commits small, conventional-commit prefixed (`test(conftest): …`,
  `refactor(session): …`, `fix(tests): …`).
- Push to `origin fix/test-suite-isolation` at the end.
- Do NOT open a PR. Do NOT push to main. Daviid merges manually.

## CRITICAL RULES (Daviid, 2026-09-13 — non-negotiable)

**DONE requires ALL of these simultaneously:**
1. `git log origin/fix/test-suite-isolation --oneline` shows ≥1 new commit.
2. `git status --short` is empty.
3. `pytest tests/ -q` reports `0 failed`.
4. Each of `pytest tests/test_stt_tts.py`, `…/test_message_limit.py`,
   `…/test_regression.py` alone is also all-green.
5. The commit hash(es) are in your `kanban complete` summary.

If any fails: `kanban block` with the failure reason — do NOT fake completion.

**If you do not push, your work is lost.** Commit AND push:
```bash
cd /root/Hermes/repos/AI_Coach
git checkout -b fix/test-suite-isolation
git add -A
git commit -m "test(conftest): <what>"
git push origin fix/test-suite-isolation
```

## Verification commands to run before completing

Paste actual stdout into the completion summary:

```bash
cd /root/Hermes/repos/AI_Coach/backend

# Full suite (must be 0 failed)
uv run pytest tests/ -q 2>&1 | tail -5

# Each file individually
for f in tests/test_stt_tts.py tests/test_message_limit.py tests/test_regression.py \
         tests/test_env_overrides.py tests/test_omniroute_integration.py \
         tests/test_filter.py tests/test_llm_json.py tests/test_health.py \
         tests/test_combo_fallback.py tests/test_summary.py \
         tests/test_settings.py tests/test_audio_janitor.py \
         tests/test_settings_persistence.py; do
  echo "=== $f ==="
  uv run pytest "$f" -q 2>&1 | tail -2
done

# Audio dir clean after suite
find /root/Hermes/repos/AI_Coach/backend/app/static/audio -type f | wc -l
# Expected: 0 (or, if production code writes non-test artifacts, document why)
```

## Definition of done

- [ ] All 7 ACs verifiable with real commands.
- [ ] No production logic changed beyond what's listed under "Files expected
      to change".
- [ ] Branch `fix/test-suite-isolation` pushed, working tree clean.
- [ ] Completion summary references this spec at
      `specs/fix-test-isolation.md`.
