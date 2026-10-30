// Language detection + switching (?lang=en|ko wins, then stored, then navigator).
export function detectLang({ search = "", stored = null, navLang = "" } = {}) {
  const q = String(search || "");
  const m = q.match(/[?&]lang=(en|ko)\b/);
  if (m) return m[1];
  if (stored === "en" || stored === "ko") return stored;
  const nav = String(navLang == null ? "" : navLang);
  if (nav === "") return "ko";
  return nav.startsWith("ko") ? "ko" : "en";
}

// Remember ?lang= so in-app links keep the language the user started in.
// detectLang stays pure; this is the only storing path besides setLang.
export function persistLangParam(search, storage) {
  const m = String(search || "").match(/[?&]lang=(en|ko)\b/);
  if (!m) return;
  try {
    storage.setItem("ithaca.lang", m[1]);
  } catch {
    /* storage unavailable: the query param still carries the choice */
  }
}

export function currentLang() {
  if (typeof window === "undefined") return "ko";
  let search = "";
  let stored = null;
  let navLang = "";
  try {
    search = (window.location && window.location.search) || "";
  } catch {
    search = "";
  }
  try {
    persistLangParam(search, window.localStorage);
  } catch {
    /* storage itself is unreachable */
  }
  try {
    stored = window.localStorage.getItem("ithaca.lang");
  } catch {
    stored = null;
  }
  try {
    navLang = (window.navigator && window.navigator.language) || "";
  } catch {
    navLang = "";
  }
  return detectLang({ search, stored, navLang });
}

export function setLang(lang) {
  try {
    window.localStorage.setItem("ithaca.lang", lang);
  } catch {
    /* storage unavailable: the query param still carries the choice */
  }
  const url = new URL(window.location.href);
  url.searchParams.set("lang", lang);
  window.location.assign(url.toString());
}

export const LANG = currentLang();
