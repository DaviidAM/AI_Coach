# Manual Smoke Test Checklist

> Screenshots are in `docs/screenshots/` and the README. This document is the
> manual QA checklist. For automated tests, see `backend/tests/` and
> `frontend/__tests__/`.

---

## Pre-flight

- [ ] **1. Frontend loads**
  Expected: Browser loads http://localhost:3000 with no blank screen or errors.

- [ ] **2. Backend `/api/health` returns HTTP 200**
  Expected: `curl -s -o /dev/null -w "%{http_code}" http://localhost:8091/api/health` prints `200`.
  Note: Without `OMNIROUTE_BASE_URL` configured, the backend runs in mock mode; health endpoint still returns 200.

---

## Chat flow — text path (CEFR A2)

- [ ] **3. Topbar visible with CEFR level dropdown**
  Expected: Top of the chat UI shows a level selector (dropdown or chips) labelled with CEFR levels A1–C2.

- [ ] **4. Theme toggle (dark/light) works**
  Expected: Clicking the theme toggle switches the UI between dark and light mode without page reload.

- [ ] **5. Select CEFR level A2**
  Expected: Clicking the A2 level highlights it as active; subsequent corrections are filtered to A2 and below.

- [ ] **6. Type "I goed to the store yesterday"**
  Expected: Text appears in the message input field exactly as typed.

- [ ] **7. Click send**
  Expected: User message appears in the chat history as a bubble. Input field clears.

- [ ] **8. Coach reply appears (text bubble)**
  Expected: After a short delay a coach message bubble appears below the user message.

- [ ] **9. Coach audio button visible**
  Expected: The coach bubble shows a speaker or play button.

- [ ] **10. Audio plays (or "Tap to enable audio" shown if browser blocks autoplay)**
  Expected: Either audio starts playing automatically, or a prompt to tap to enable audio is shown.

- [ ] **11. Corrections panel shows "I goed → I went" (A2)**
  Expected: A corrections panel (inline or sidebar) lists at least one correction tagged A2 level.

- [ ] **12. Corrections panel does NOT show B1 or higher errors while on A2 level**
  Expected: Corrections above A2 level are filtered out.

---

## Level filtering — CEFR A1

- [ ] **13. Switch to CEFR level A1**
  Expected: Clicking the A1 chip highlights it as active; corrections above A1 are now filtered out.

- [ ] **14. Type "I have went to the market"**
  Expected: Text appears in the input field exactly as typed.

- [ ] **15. Send message**
  Expected: User message bubble appears; coach replies.

- [ ] **16. Corrections panel shows A1/A2 only; B1+ filtered**
  Expected: Only errors at A1 or A2 level appear.

---

## Audio path (requires microphone)

- [ ] **17. Hold mic button to record**
  Expected: UI shows recording state (e.g., pulsing mic icon, waveform) while the button is held.

- [ ] **18. Release to send**
  Expected: Recording stops; audio is sent to the backend.

- [ ] **19. Audio transcription appears as user text**
  Expected: The transcribed text appears in a user message bubble matching what was spoken.

- [ ] **20. Coach reply follows same correction flow**
  Expected: Coach responds with text + audio + corrections panel, identical to the text-path flow.

---

## Reset

- [ ] **21. Click reset / new conversation**
  Expected: A reset or "New conversation" button is present and clickable.

- [ ] **22. Chat history clears**
  Expected: All user and coach message bubbles disappear from the UI.

- [ ] **23. Corrections panel clears**
  Expected: The corrections panel is empty; no past corrections are visible.

---

## Corrections history tab

- [ ] **24. Click "All Corrections" button**
  Expected: A modal or tab showing the full corrections history appears.

- [ ] **25. Previous corrections listed with level badges**
  Expected: Past corrections appear showing original → corrected text and CEFR level.

- [ ] **26. Pagination works (if more than 20 corrections exist)**
  Expected: A "Next" / page control advances through results.
