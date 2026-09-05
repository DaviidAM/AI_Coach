# Manual Smoke Test Checklist

**Before any deploy — run every section in order.**
Test environment URLs:
- Frontend: `https://maria-config-florists-noble.trycloudflare.com`
- Backend: `https://specifically-signed-liquid-blocking.trycloudflare.com`

---

## Pre-flight

- [ ] **1. Frontend URL loads**
  Expected: Browser loads `https://maria-config-florists-noble.trycloudflare.com` with no certificate errors or blank screen.

- [ ] **2. Backend URL loads**
  Expected: Browser/curl loads `https://specifically-signed-liquid-blocking.trycloudflare.com` with no certificate errors.

- [ ] **3. `/api/health` returns HTTP 200**
  Expected: `curl -s -o /dev/null -w "%{http_code}" https://specifically-signed-liquid-blocking.trycloudflare.com/api/health` prints `200`.
  Note: When MINIMAX_API_KEY is unset the backend runs in mock mode; health endpoint still returns 200.

---

## Chat flow — text path (CEFR A2)

- [ ] **4. Topbar visible with CEFR chips A1–C2**
  Expected: Top of the chat UI shows clickable level chips labelled A1, A1+, A2, B1, B2, C1, C2 (or similar A1–C2 spread).

- [ ] **5. Theme toggle (dark/light) works**
  Expected: Clicking the theme toggle switches the UI between dark and light mode without page reload.

- [ ] **6. Select CEFR level A2**
  Expected: Clicking the A2 chip highlights it as active; subsequent corrections are filtered to A2 and below.

- [ ] **7. Type "I goed to the store yesterday"**
  Expected: Text appears in the message input field exactly as typed.

- [ ] **8. Click send**
  Expected: User message appears in the chat history as a bubble. Input field clears.

- [ ] **9. Coach reply appears (text bubble)**
  Expected: After a short delay a coach message bubble appears below the user message.

- [ ] **10. Coach audio button visible**
  Expected: The coach bubble shows a speaker or play button.

- [ ] **11. Audio plays automatically (or "Tap to enable audio" shown)**
  Expected: Either audio starts playing on its own, or a prompt "Tap to enable audio" / "Play" button is shown if browser autoplay is blocked.

- [ ] **12. Corrections panel shows "I goed → I went" (A2)**
  Expected: A corrections panel (inline or sidebar) lists at least one correction: `I goed → I went` tagged A2.

- [ ] **13. Corrections panel does NOT show B1 or higher errors**
  Expected: The correction "the store yesterday → ...yesterday at the store" (B1) is NOT shown while on A2 level.
  Note: The mock backend uses regex: "I goed" → "I went" (A2), "I have went" → "I have gone" (A2), "she go" → "she goes" (A1), "the store yesterday" → B1.

---

## Level filtering — CEFR A1

- [ ] **14. Switch to CEFR level A1**
  Expected: Clicking the A1 chip highlights it as active; corrections above A1 are now filtered out.

- [ ] **15. Type "I have went to the market"**
  Expected: Text appears in the input field exactly as typed.

- [ ] **16. Send message**
  Expected: User message bubble appears; coach replies.

- [ ] **17. Corrections panel shows A1/A2 only; B1+ filtered**
  Expected: The mock response would correct "I have went → I have gone" (A2). No B1 corrections appear in the panel.

---

## Audio path (requires microphone)

- [ ] **18. Hold mic button to record**
  Expected: UI shows recording state (e.g., pulsing mic icon, waveform) while the button is held.

- [ ] **19. Release to send**
  Expected: Recording stops; audio is sent to the backend.

- [ ] **20. Audio transcription appears as user text**
  Expected: The transcribed text appears in a user message bubble matching what was spoken.

- [ ] **21. Coach reply follows same correction flow**
  Expected: Coach responds with text + audio + corrections panel, identical to the text-path flow.

---

## Reset

- [ ] **22. Click reset / new conversation**
  Expected: A reset or "New conversation" button is present and clickable.

- [ ] **23. Chat history clears**
  Expected: All user and coach message bubbles disappear from the UI.

- [ ] **24. Corrections panel clears**
  Expected: The corrections panel is empty; no past corrections are visible.

---

## Corrections history tab

- [ ] **25. Click Corrections tab**
  Expected: A tab or navigation item labelled "Corrections" (or similar) switches the view to a corrections history list.

- [ ] **26. Previous corrections listed with timestamps**
  Expected: Past corrections appear with timestamps, showing original → corrected text and CEFR level.

- [ ] **27. Pagination works (20 per page)**
  Expected: If more than 20 corrections exist, a "Next" / page control advances through results 20 at a time.

---

## Acceptance criteria

- [ ] File at `docs/SMOKE_TEST.md`
- [ ] All critical paths covered: pre-flight, text chat, level filtering, audio (if mic available), reset, corrections history
- [ ] Each step has a checkbox `[ ]` and an expected result
