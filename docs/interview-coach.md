# Interview Coach

The Interview Coach is the second route in AI Coach (`/interview`). It runs a
tailored practice interview for a real job offer and coaches every answer. It
does not change the English coach at `/`; sessions, limits and prompts are
separate.

## Quick start

1. Start the backend and frontend as described in the [README](../README.md).
2. Open <http://localhost:3000/interview>.
3. Paste a job offer or upload `.txt`, `.md`, `.pdf` or `.docx` (up to 5 MB).
4. Choose **Introduction**, **Technical** or **Final**.
5. Answer by typing or holding the microphone button. Each answer gets live
   coaching, a 1–5 score and a stronger-answer suggestion.
6. Use **End interview** when you are ready for the practice report.

The setup popup is mandatory on first entry. Once an interview is configured,
the browser stores its session id in `localStorage` under
`ai-interview-session-id` and restores the conversation on reload. The backend
keeps sessions in memory, so a backend restart clears them.

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
  English coach. The original recording is kept for playback.
- **Text** is also synthesized to audio so both bubbles support playback.
- The interviewer's reply is generated as one in-character question, then
  synthesized with edge-tts. TTS is best-effort: if it fails, the text turn
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
  English coach and is cleaned up by the existing audio janitor.

## API

See the [Interview Coach API section](../README.md#interview-coach-api) in the
README for the endpoint list. The frontend client is
`frontend/lib/interview-api.ts`, and the types are in
`frontend/types/interview.ts`.

## Troubleshooting

| Symptom | Likely cause |
|---|---|
| The setup popup asks for the same offer after reload | The backend restarted and lost the in-memory session. |
| No interviewer audio | edge-tts was unavailable; the text reply still works. |
| "Could not transcribe the audio" | STT failed or the recording was empty. Type the answer or retry. |
| The report is rule-based and mentions no language model | The LLM call failed; the report is built from stored scores and feedback. |
| Audio keeps failing with 403 | edge-tts was rejected upstream; check the backend logs. The interview itself is unaffected. |
