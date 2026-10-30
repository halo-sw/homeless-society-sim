import { LANG, setLang } from "./lang.js";
import { phrases, patterns } from "./en.js";
import { createTranslator } from "./translate.js";
import { startDomTranslation } from "./dom.js";

export { LANG, setLang };

// English mode: translate the rendered DOM in place (Korean mode returns
// immediately: no observer, no cost).
export function initI18n() {
  if (LANG !== "en") return null;
  if (typeof document === "undefined") return null;
  document.documentElement.lang = "en";
  const translator = createTranslator({ phrases, patterns });
  startDomTranslation(document.body, translator);
  try {
    if (typeof window !== "undefined") {
      window.__ithacaI18n = { missing: () => [...translator.missing] };
    }
  } catch {
    /* coverage hook is best-effort */
  }
  return translator;
}
