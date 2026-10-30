import { LANG, setLang } from "../i18n/index.js";

// Small text button: "English" in Korean mode, "한국어" in English mode.
// data-no-i18n keeps the DOM translator from rewriting its label.
export function LangToggle() {
  const toEn = LANG !== "en";
  return (
    <button
      type="button"
      className="ui-lang-toggle"
      data-no-i18n
      aria-label="Switch language / 언어 바꾸기"
      onClick={() => setLang(toEn ? "en" : "ko")}>
      {toEn ? "English" : "한국어"}
    </button>
  );
}
