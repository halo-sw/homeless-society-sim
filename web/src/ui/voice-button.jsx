// Mic button for the chat composer: speak, Muse Voice writes it down,
// the customer checks the text and presses send. The transcript is put
// into the composer — never auto-sent. SSR-safe: the idle render touches
// no browser API (the parent gates on voiceSupported() + server key).
import { useEffect, useRef, useState } from "react";
import { VOICE_MAX_MS, recordOnce, transcribe } from "./voice.js";

export const VOICE_DONE_NOTE = "Muse Voice가 받아 적었어요 · 확인하고 보내 주세요";
export const VOICE_ERROR_NOTE = "음성 입력이 안 됐어요. 글로 써 주세요.";

function formatElapsed(sec) {
  const s = Math.max(0, Math.floor(sec || 0));
  return `${Math.floor(s / 60)}:${String(s % 60).padStart(2, "0")}`;
}

function MicGlyph() {
  return (
    <svg width="18" height="18" viewBox="0 0 24 24" fill="none"
      stroke="currentColor" strokeWidth="2" strokeLinecap="round"
      strokeLinejoin="round" aria-hidden="true">
      <rect x="9" y="2" width="6" height="12" rx="3" />
      <path d="M5 10a7 7 0 0 0 14 0" />
      <line x1="12" y1="17" x2="12" y2="22" />
    </svg>
  );
}

export function MicButton({ onText, disabled, onNotice }) {
  const [phase, setPhase] = useState("idle"); // idle | recording | transcribing
  const [elapsedSec, setElapsedSec] = useState(0);
  const ctrlRef = useRef(null);
  const stopTimerRef = useRef(null);
  const busyRef = useRef(false);

  // Unmount mid-recording: stop the recorder so the mic tracks stop too.
  useEffect(() => () => {
    if (stopTimerRef.current) clearTimeout(stopTimerRef.current);
    const ctrl = ctrlRef.current;
    ctrlRef.current = null;
    if (ctrl) ctrl.stop().catch(() => {});
  }, []);

  function note(text) {
    if (onNotice) {
      try {
        onNotice(text);
      } catch {
        /* the caption never breaks the composer */
      }
    }
  }

  async function finish() {
    if (busyRef.current) return;
    busyRef.current = true;
    if (stopTimerRef.current) {
      clearTimeout(stopTimerRef.current);
      stopTimerRef.current = null;
    }
    const ctrl = ctrlRef.current;
    ctrlRef.current = null;
    if (!ctrl) {
      busyRef.current = false;
      setPhase("idle");
      return;
    }
    setPhase("transcribing");
    try {
      const wav = await ctrl.stop();
      const answer = await transcribe(wav);
      if (answer && answer.ok && String(answer.transcript || "").trim()) {
        if (onText) onText(String(answer.transcript).trim());
      } else {
        note(VOICE_ERROR_NOTE);
      }
    } catch {
      // Permission denied, no key, upstream down, rate limited: one
      // caption, no throw, the composer stays usable.
      note(VOICE_ERROR_NOTE);
    }
    busyRef.current = false;
    setElapsedSec(0);
    setPhase("idle");
  }

  async function start() {
    if (busyRef.current || phase !== "idle") return;
    busyRef.current = true;
    try {
      const ctrl = await recordOnce({
        maxMs: VOICE_MAX_MS,
        onTick: (ms) => setElapsedSec(Math.floor(ms / 1000)),
      });
      ctrlRef.current = ctrl;
      setElapsedSec(0);
      setPhase("recording");
      stopTimerRef.current = setTimeout(() => {
        finish().catch(() => {});
      }, VOICE_MAX_MS);
    } catch {
      note(VOICE_ERROR_NOTE);
    }
    busyRef.current = false;
  }

  if (phase === "transcribing") {
    return (
      <button type="button" className="ui-voice-mic" disabled>
        받아 적는 중…
      </button>
    );
  }
  if (phase === "recording") {
    return (
      <button type="button" className="ui-voice-mic ui-voice-mic-rec"
        aria-label="녹음 멈추기" title="녹음 멈추기" aria-pressed="true"
        onClick={() => { finish().catch(() => {}); }}>
        <span className="ui-voice-dot" aria-hidden="true"
          style={{ color: "var(--ds-danger, #d33)" }}>●</span>
        <span data-no-i18n>{formatElapsed(elapsedSec)}</span>
      </button>
    );
  }
  return (
    <button type="button" className="ui-voice-mic"
      aria-label="말로 입력하기" title="말로 입력하기"
      disabled={Boolean(disabled)}
      onClick={() => { start().catch(() => {}); }}>
      <MicGlyph />
    </button>
  );
}
