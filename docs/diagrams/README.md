# Visual diagrams

Self-contained HTML diagrams generated with the [archify](https://github.com/tt-a1i/archify)
skill from the AI Coach source tree. Each file opens offline in any browser and
includes its own viewer (zoom, route lens, light/dark theme and PNG/SVG/WebM
export).

| Diagram | Type | What it covers |
|---|---|---|
| [AI Coach — System Architecture](ai-coach-architecture.html) | architecture | The whole system: browser, Next.js frontend, FastAPI process, the three in-memory stores, the audio directory, the local speech engines and every external service, grouped by trust boundary |
| [English Coach — One Text Turn](ai-coach-english-turn.html) | sequence | A single turn end to end: Enter key → `POST /api/chat` → demo-limit gate → LLM → TTS → audio file → bubbles, with the degradation paths in context |
| [Interview Coach — One Answer Turn](ai-coach-interview-turn.html) | sequence | A candidate answer through the interview router: limit gate → stage rubric → LLM → normalised feedback → interviewer audio → coaching panel |
| [AI Coach — Audio and Text Data Flow](ai-coach-audio-dataflow.html) | dataflow | Where every byte lives: microphone → multipart POST → `stt/` → faster-whisper → prompt → LLM → edge-tts → `audio/*.mp3` → `<audio>` player, plus the offline fallbacks |
| [AI Coach — Deployment Topology](ai-coach-deployment.html) | architecture | The Docker Compose stack on one host: containers, host ports, named volumes, health checks, the bridge to the host-side OmniRoute service and the single-container PaaS alternative |

## Regenerating a diagram

Every diagram is rendered from a JSON intermediate representation kept next to
it (`<name>.json`). The IR is the source of truth; the HTML is generated from it.

```bash
git clone --depth 1 https://github.com/tt-a1i/archify.git
cd archify
ARCHIFY_UPDATE_CHECK_DISABLED=1 \
  node archify/bin/archify.mjs finalize architecture \
  <candidate.json> <output.html> \
  --repo-root /path/to/AI_Coach --quality showcase --json
```

The `finalize` command runs four gates — schema validation, delivery, strict
check and a real-browser check — and stops at the first failing one. The
passing receipt of each committed diagram is kept as
`<name>.finalize-summary.json`.

> The committed IR pins `meta.repository.revision`, so the source evidence
> (file paths and line ranges) is verified against that exact commit. Regenerate
> after changing the cited code, or the evidence check will fail.

## Related documents

- [`ARCHITECTURE.md`](../../ARCHITECTURE.md) — the full technical reference that
  accompanies these diagrams.
- [`SPEC.md`](../../SPEC.md) — product and API contract.
- [`docs/interview-coach.md`](../interview-coach.md) — Interview Coach guide.
