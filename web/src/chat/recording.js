import { appUrl } from "../paths.js";

export const RECORDINGS = [
  { id: "menlo-month", title: "Meta 본사 출근 · 두 사람의 한 달", titleEn: "Commuting to Meta HQ · a month for two" },
  { id: "seoul-couple", title: "강남 출근 예비부부 · 30일", titleEn: "Engaged couple, Gangnam commute · 30 days" },
];

export function recordingUrl(id) {
  return appUrl("recorded/" + String(id) + ".json");
}

export function validateRecording(doc) {
  const errors = [];
  if (!doc || typeof doc !== "object") return { ok: false, errors: ["not an object"] };
  const messages = doc.messages;
  if (!Array.isArray(messages) || messages.length === 0) errors.push("messages empty");
  else {
    messages.forEach((m, i) => {
      if (!m || typeof m !== "object") errors.push("message " + i + " not an object");
      else {
        if (!m.role) errors.push("message " + i + " missing role");
        if (!m.kind) errors.push("message " + i + " missing kind");
      }
    });
  }
  const meta = doc.meta;
  if (!meta || typeof meta !== "object") errors.push("missing meta");
  else {
    if (typeof meta.id !== "string" || !/^[a-z0-9-]+$/.test(meta.id)) errors.push("bad meta.id");
    if (typeof meta.model !== "string" || meta.model === "") errors.push("bad meta.model");
  }
  return { ok: errors.length === 0, errors };
}

export function replaySchedule(messages) {
  const list = Array.isArray(messages) ? messages : [];
  return list.map((m, index) => {
    if (m && m.role === "user") return { index, delayMs: 700 };
    if (m && (m.kind === "text" || m.kind === "system")) return { index, delayMs: 1200 };
    return { index, delayMs: 1600 };
  });
}
