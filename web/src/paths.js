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

// Base-aware app URLs (22b): every in-app link keeps the Vite base, so
// navigation works both at / and under /homeless-society-sim/ on Pages.
// `query` is the part after "?", without the leading "?".

function baseWithSlash(base) {
  const b = base || "/";
  return b.endsWith("/") ? b : `${b}/`;
}

function currentBase() {
  return (typeof import.meta !== "undefined"
    && import.meta.env
    && import.meta.env.BASE_URL) || "/";
}

export function appUrlWith(base, query = "") {
  const norm = baseWithSlash(base);
  const q = String(query || "").replace(/^\?/, "");
  return q ? `${norm}?${q}` : norm;
}

export function appUrl(query = "") {
  return appUrlWith(currentBase(), query);
}

// Full public URL for share / copy-link features.
export function publicUrlWith(origin, base, query = "") {
  return `${String(origin || "")}${appUrlWith(base, query)}`;
}

export function publicUrl(query = "") {
  const origin = (typeof window !== "undefined" && window.location && window.location.origin)
    || "";
  return publicUrlWith(origin, currentBase(), query);
}
