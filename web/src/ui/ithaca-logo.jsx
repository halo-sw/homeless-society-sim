// 32e: the real Ithaca logo (arch symbol + ITHACA wordmark SVG) for the
// landing nav, the landing footer and the app top bar. Ink #1d1b18 on
// transparent; the name stays untranslated (alt="Ithaca").
import { assetUrl } from "../paths.js";

export const ITHACA_LOGO_PATH = "brand/ithaca-logo.svg";

export function IthacaLogo({ height = 20 }) {
  const h = height;
  return (
    <img src={assetUrl(ITHACA_LOGO_PATH)} alt="Ithaca"
      height={h} width={Math.round(h * 1628 / 389)}
      className="ds-ithaca-logo" />
  );
}
