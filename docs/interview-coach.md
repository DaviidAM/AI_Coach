# Interview Coach

The Interview Coach is a dedicated route in AI Coach (`/interview`). It runs a
tailored practice interview for a real job offer and coaches every answer. The
English Coach lives at `/english` and the coach selector at `/`; the two
coaches have separate sessions, limits, prompts and UI state.

## Quick start

1. Start the backend and frontend as described in the [README](../README.md).
2. Open <http://localhost:3000/interview> in local development, or
   <http://localhost:18101/interview> with Docker Compose.
3. Paste a job offer or upload `.txt`, `.md`, `.pdf` or `.docx` (up to 5 MB).
4. Choose **Introduction**, **Technical** or **Final**.
5. Answer by typing or holding the microphone button. Each answer gets live
   coaching, a 1–5 score and a stronger-answer suggestion.
6. Use **End interview** when you are ready for the practice report.

The setup popup is mandatory on first entry. Once an interview is configured,
the browser stores its session id in `localStorage` under
`ai-interview-session-id` and restores the conversation on reload. The backend
keeps sessions in memory, so a backend restart clears them.

## Navigation

Both coach headers include a **← AI Coach Home** link in the top-left corner.
The Interview header also provides **All feedback**, **End interview** and
**New interview** actions. There is no cross-coach switcher; use the home page
or the back link to move between the English and Interview Coaches. The setup
modal's fallback link also returns to the landing page.

## Interview stages

Each stage is a backend prompt/rubric module in
`backend/app/interview/skills/`:

| Stage | ID | Focus |
|---|---|---|
| Introduction | `intro` | Career story, relevance, motivation, communication and fit. |
| Technical | `technical` | Correctness, depth, design, trade-offs, testing, failure modes and handling unknowns. |
| Final | `final` | Ownership, measurable impact, conflict, failure, leadership, prioritisation and closing. |

The technical stage adapts its question plan to the inferred role track:
software engineering, data, AI/ML, architecture or technical lead. The role
title, company, seniority, key skills and offer digest are inferred from the
offer. If the LLM is unavailable, heuristic extraction keeps the interview
usable.

## One turn

The candidate can send text or audio:

- **Audio** is transcribed with the same faster-whisper STT path as the
  English Coach. The original recording is kept for playback.
- **Text** is also synthesized to audio so both bubbles support playback.
- The interviewer's reply is generated as one in-character question, then
  synthesized with edge-tts. If Edge TTS is blocked upstream, Google TTS is
  used as a fallback. TTS is best-effort: if both engines fail, the text turn
  still succeeds and no audio URL is returned.

Coaching is returned alongside the interviewer reply and never spoken by the
interviewer. Each note contains:

- the question being answered
- category and severity (`critical`, `major` or `minor`)
- the candidate's evidence
- what went wrong
- why it matters for the role and stage
- a concrete stronger answer

The live panel shows the latest answer. **All feedback** opens the full history
grouped by answer.

## Final report

**End interview** generates a practice report with:

- an overall score from 1 to 5
- a readiness label: `not_ready`, `getting_there` or `interview_ready`
- a summary, strengths, gaps and next steps
- the number of answers evaluated

Readiness is a practice signal, not a hire/no-hire decision. Reports are stored
with the interview session and can be reopened until the session is reset or
the backend restarts.

## Limits and fallbacks

- `INTERVIEW_MESSAGE_LIMIT` sets the maximum candidate answers per interview
  (default `20`; `-1` means unlimited). At the cap the UI disables input and
  the backend returns HTTP 429.
- The conversation keeps the latest 64 messages to bound memory. The answer
  count is tracked separately so limits stay correct when old messages are
  trimmed.
- LLM setup, turn and report failures fall back to rule-based output. The
  interview remains usable offline with text only.
- Interview audio is saved under the same static audio directory as the
  English Coach and is cleaned up by the existing audio janitor.
- The interview session is independent from the English session. Resetting or
  ending an interview does not clear English corrections or messages.

## API

All endpoints are prefixed with `/api/interview`:

| Method | Route | Purpose |
|---|---|---|
| `GET` | `/skills` | List stages and the current answer limit. |
| `POST` | `/setup` | Configure the interview from `job_text` or `job_file`. |
| `GET` | `/session?session_id=...` | Restore messages, feedback, scores and report. |
| `POST` | `/chat` | Send a candidate answer as text or audio. |
| `GET` | `/feedback?session_id=...&limit=20&offset=0` | Paginated feedback history. |
| `POST` | `/report?session_id=...` | Generate and store the practice report. |
| `POST` | `/reset?session_id=...&keep_setup=true` | Clear progress; `keep_setup=false` requires a new setup. |

See the [Interview Coach API section](../README.md#interview-coach-api) in the
README for request details. The frontend client is
`frontend/lib/interview-api.ts`, and the types are in
`frontend/types/interview.ts`.

## Troubleshooting

| Symptom | Likely cause |
|---|---|
| The setup popup asks for the same offer after reload | The backend restarted and lost the in-memory session. |
| No interviewer audio | Both edge-tts and Google TTS were unavailable; the text reply still works. |
| "Could not transcribe the audio" | STT failed or the recording was empty. Type the answer or retry. |
| The report is rule-based and mentions no language model | The LLM call failed; the report is built from stored scores and feedback. |
| Audio keeps failing with 403 | edge-tts was rejected upstream. The backend should retry with Google TTS automatically; check the logs if both engines fail. The interview itself is unaffected. |
| The header shows no way to switch coaches | Use **← AI Coach Home** or open `/` and choose a coach card. |
