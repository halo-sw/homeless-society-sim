// 28b: the "Powered by Muse" credit with the official Muse logo (docs/design.md §3.12).
import { assetUrl } from "../paths.js";

export const MUSE_LOGO_PATH = "brand/muse-logo.png";

export function museModelLabel(live) {
  if (live === null || live === undefined) return "연결 확인 중";
  return live ? "Muse Spark 1.3" : "규칙 모드";
}

export function PoweredByMuse({ size = "sm", live, showStatus = false }) {
  const px = size === "md" ? 20 : 16;
  const label = `Powered by Muse${showStatus ? `, ${museModelLabel(live)}` : ""}`;
  return (
    <span className="ds-pbm" data-size={size} aria-label={label}>
      <img src={assetUrl(MUSE_LOGO_PATH)} alt="" width={px} height={px} className="ds-pbm-logo" />
      <span className="ds-pbm-text">Powered by <b>Muse</b></span>
      {showStatus ? (
        <span className="ds-pbm-status" data-live={live === true ? "1" : "0"}>
          <i className="ds-pbm-dot" />{museModelLabel(live)}
        </span>
      ) : null}
    </span>
  );
}
