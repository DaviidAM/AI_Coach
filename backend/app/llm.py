import json
import os
import httpx
import re
from typing import Any

MINIMAX_API_KEY = os.getenv("MINIMAX_API_KEY", "")
MINIMAX_BASE_URL = "https://api.minimaxi.chat/v1"


SYSTEM_PROMPT = """You are COACH, a friendly English teacher chatting with a student on WhatsApp.

Student level: {LEVEL} (CEFR).
Tone: encouraging, natural, like a native speaker texting.

Rules:
- Reply in English. Keep it short (1-3 sentences).
- Continue the conversation naturally.
- Detect errors in the student's last message.
- For each error, output: original_phrase, corrected_phrase, explanation, error_level (CEFR), category, error_type.
- Only return errors that you are confident about. If no errors, return [].
- error_level rubric:
  - A1: present simple, basic vocabulary, articles (a/the)
  - A2: past simple, present perfect, common prepositions
  - B1: conditionals, modals, phrasal verbs, basic relative clauses
  - B2: passive voice, mixed conditionals, nuanced prepositions
  - C1: subjunctive, inversion, advanced vocabulary, idiomatic expressions
  - C2: stylistic nuances, register shifts, rare exceptions
- Always return strict JSON with keys 'reply' (string) and 'corrections' (array).
- error_type must be one of: grammar, vocabulary, suggestion, style, word_order, pronunciation
- No prose outside the JSON."""


class LLMError(Exception):
    pass


def build_messages(level: str, history: list[dict]) -> list[dict]:
    system = SYSTEM_PROMPT.format(LEVEL=level)
    messages = [{"role": "system", "content": system}]
    for msg in history:
        messages.append({"role": msg["role"], "content": msg["content"]})
    return messages


def parse_and_validate_reply(raw: str) -> dict:
    try:
        data = json.loads(raw)
    except json.JSONDecodeError:
        match = re.search(r"\{[\s\S]*\}", raw)
        if match:
            data = json.loads(match.group(0))
        else:
            raise ValueError("No JSON object found")

    if not isinstance(data, dict):
        raise ValueError("Top-level value is not an object")
    if "reply" not in data or "corrections" not in data:
        raise ValueError("Missing 'reply' or 'corrections' field")
    if not isinstance(data["corrections"], list):
        raise ValueError("'corrections' must be a list")
    for c in data["corrections"]:
        if not isinstance(c, dict):
            raise ValueError("Correction must be an object")
        if not all(k in c for k in ("original_phrase", "corrected_phrase", "explanation", "error_level")):
            raise ValueError("Correction missing required fields")
        if "category" not in c:
            c["category"] = "general"
        if "error_type" not in c:
            c["error_type"] = "general"
    return data


def _mock_reply(level: str, history: list[dict]) -> dict:
    """Offline fallback when MINIMAX_API_KEY is not set."""
    last_user = ""
    for msg in reversed(history):
        if msg["role"] == "user":
            last_user = msg["content"]
            break

    text = last_user.lower()
    corrections = []

    def add(orig, fixed, expl, lvl, err_type="grammar"):
        if orig != fixed:
            corrections.append({
                "original_phrase": orig,
                "corrected_phrase": fixed,
                "explanation": expl,
                "error_level": lvl,
                "category": err_type,
                "error_type": err_type,
            })

    # Case-insensitive patterns so "I Goed" / "I GOED" all match
    if re.search(r"\bi\s+goed\b", text, re.IGNORECASE):
        add("I goed", "I went", "Use the past simple 'went', not 'goed'.", "A2")

    # "I have went" -> "I have gone"
    if re.search(r"\bi\s+have\s+went\b", text, re.IGNORECASE):
        add("I have went", "I have gone", "After 'have', use the past participle 'gone'.", "A2")

    # "I didn't went" -> "I didn't go"
    if re.search(r"\bdidn't\s+went\b", text, re.IGNORECASE):
        add("didn't went", "didn't go", "After 'didn't', use the base form of the verb.", "A2")

    # "more better" -> "better"
    if "more better" in text:
        add("more better", "better", "'Better' is already comparative; don't use 'more'.", "A2", "suggestion")

    # "informations" -> "information"
    if "informations" in text:
        add("informations", "information", "'Information' is uncountable in English.", "B1", "vocabulary")

    # "buyed" -> "bought"
    if re.search(r"\bbuyed\b", text, re.IGNORECASE):
        add("buyed", "bought", "'Bought' is the past tense of 'buy'.", "A2")

    # "I am agree" -> "I agree"
    if re.search(r"\bi\s+am\s+agree\b", text, re.IGNORECASE):
        add("I am agree", "I agree", "Don't use 'am' before 'agree'.", "B1", "grammar")

    if corrections:
        reply = "I noticed a small mistake — let me know if my correction helps! What else happened?"
    else:
        reply = "Sounds great! Tell me more about that."

    return {"reply": reply, "corrections": corrections}


def call_minimax(messages: list[dict], retry: bool = False) -> str:
    if not MINIMAX_API_KEY:
        raise LLMError("MINIMAX_API_KEY not set")

    payload = {
        "model": "MiniMax-Text-01",
        "messages": messages,
        "temperature": 0.7,
    }
    if retry:
        payload["messages"].append({
            "role": "user",
            "content": "Your previous response was not valid JSON. Please return ONLY valid JSON."
        })

    headers = {
        "Authorization": f"Bearer {MINIMAX_API_KEY}",
        "Content-Type": "application/json",
    }

    with httpx.Client(timeout=30.0) as client:
        resp = client.post(f"{MINIMAX_BASE_URL}/text/chatcompletion_v2", headers=headers, json=payload)
        if resp.status_code != 200:
            raise LLMError(f"Minimax API returned {resp.status_code}: {resp.text}")
        result = resp.json()
        content = result.get("choices", [{}])[0].get("message", {}).get("content", "")
        return content


def get_llm_reply(level: str, history: list[dict]) -> dict:
    # Read key at call time so tests can patch os.environ without reimporting.
    if not os.getenv("MINIMAX_API_KEY"):
        return _mock_reply(level, history)

    messages = build_messages(level, history)
    raw = call_minimax(messages)
    try:
        return parse_and_validate_reply(raw)
    except (json.JSONDecodeError, ValueError):
        try:
            raw = call_minimax(messages, retry=True)
            return parse_and_validate_reply(raw)
        except Exception as e:
            raise LLMError(f"LLM returned malformed JSON after retry: {raw[:200]}") from e


def summarize_conversation(level: str, history: list[dict]) -> str:
    """
    Generate a one-paragraph summary of the conversation using the LLM.
    When history is empty or only has the system prompt, returns a placeholder
    without burning tokens.
    """
    if not history:
        return "No conversation to summarize yet."

    summary_system = (
        "You are a helpful assistant that summarizes English tutoring conversations. "
        "Provide a single paragraph summarizing: main topics discussed, "
        "key improvements or errors addressed, and any next steps mentioned. "
        "Keep it to 3-4 sentences. Reply in English."
    )
    history_text = "\n".join(f"{m['role']}: {m['content']}" for m in history)
    messages = [
        {"role": "system", "content": summary_system},
        {"role": "user", "content": f"Summarize this conversation:\n{history_text}"},
    ]
    try:
        result = get_llm_reply(level, messages)
        return result.get("reply", "Unable to generate summary.")
    except LLMError:
        return "Unable to generate summary."
