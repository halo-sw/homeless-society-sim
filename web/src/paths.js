// Base-aware asset URLs for GitHub Pages (22a).
export const STATIC_SITE = (typeof import.meta !== "undefined"
  && import.meta.env
  && import.meta.env.VITE_STATIC) === "1";

export function assetUrlWith(base, p) {
  const path = String(p || "");
  const noLead = path.replace(/^\/+/, "");
  const b = base || "/";
  const norm = b.endsWith("/") ? b : `${b}/`;
  return `${norm}${noLead}`;
}

export function assetUrl(p) {
  const base = (typeof import.meta !== "undefined"
    && import.meta.env
    && import.meta.env.BASE_URL) || "/";
  return assetUrlWith(base, p);
}
