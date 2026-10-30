// In-place translation of the rendered DOM (works on plain fakes too:
// only nodeType, nodeValue, childNodes, parentNode, tagName,
// getAttribute/setAttribute are used).
const HANGUL = /[가-힣]/;
const TEXT_NODE = 3;
const ELEMENT_NODE = 1;

export const TRANS_ATTRS = ["placeholder", "aria-label", "title", "alt"];
const SKIP_TAGS = new Set(["SCRIPT", "STYLE", "TEXTAREA"]);

export function createState() {
  return {
    orig: new WeakMap(),
    written: new WeakMap(),
    attrWritten: new WeakMap(),
  };
}

const IMPLICIT = new WeakMap();
function stateFor(translator, state) {
  if (state) return state;
  let s = (translator && typeof translator === "object")
    ? IMPLICIT.get(translator)
    : undefined;
  if (!s) {
    s = createState();
    if (translator && typeof translator === "object") IMPLICIT.set(translator, s);
  }
  return s;
}

function getAttr(el, name) {
  try {
    return (el && typeof el.getAttribute === "function")
      ? el.getAttribute(name)
      : null;
  } catch {
    return null;
  }
}

function setAttr(el, name, value) {
  if (el && typeof el.setAttribute === "function") el.setAttribute(name, value);
}

function underNoI18n(node) {
  let n = node;
  while (n) {
    if (n.nodeType === ELEMENT_NODE && getAttr(n, "data-no-i18n") != null) {
      return true;
    }
    n = n.parentNode || null;
  }
  return false;
}

function skipSubtree(el) {
  if (SKIP_TAGS.has(String(el.tagName || "").toUpperCase())) return true;
  const ce = getAttr(el, "contenteditable");
  if (ce != null && ce !== "false") return true;
  return getAttr(el, "data-no-i18n") != null;
}

function srcOf(t, st) {
  // A node React rewrote (current value differs from what we wrote)
  // is a new source; otherwise keep the recorded source.
  if (t.nodeValue !== st.written.get(t)) st.orig.set(t, t.nodeValue);
  return st.orig.has(t) ? st.orig.get(t) : (t.nodeValue ?? "");
}

function translateSingle(t, translator, st) {
  const src = srcOf(t, st);
  if (typeof src !== "string" || !HANGUL.test(src)) return;
  const out = translator.translate(src);
  if (out !== src) {
    if (t.nodeValue !== out) t.nodeValue = out;
    st.written.set(t, out);
  }
}

function translateLeaf(texts, translator, st) {
  const joined = texts.map((t) => {
    const s = srcOf(t, st);
    return typeof s === "string" ? s : "";
  }).join("");
  if (!HANGUL.test(joined)) return;
  const out = translator.translate(joined);
  if (out === joined) return;
  if (texts[0].nodeValue === out
    && texts.slice(1).every((t) => t.nodeValue === "")) return;
  texts[0].nodeValue = out;
  st.written.set(texts[0], out);
  for (let i = 1; i < texts.length; i++) {
    texts[i].nodeValue = "";
    st.written.set(texts[i], "");
  }
}

function translateAttrs(el, translator, st) {
  for (const attr of TRANS_ATTRS) {
    const cur = getAttr(el, attr);
    if (typeof cur !== "string" || !HANGUL.test(cur)) continue;
    const srcKey = "data-i18n-src-" + attr;
    const stored = getAttr(el, srcKey);
    const prevMap = st.attrWritten.get(el);
    const prevWritten = prevMap ? prevMap[attr] : undefined;
    // React replaced the value when it matches neither the recorded
    // source nor what we wrote: treat the current value as new source.
    const src = (typeof stored === "string" && (cur === stored || cur === prevWritten))
      ? stored
      : cur;
    const out = translator.translate(src);
    if (out !== src) {
      if (cur !== out) setAttr(el, attr, out);
      if (stored !== src) setAttr(el, srcKey, src);
      const next = prevMap || {};
      next[attr] = out;
      st.attrWritten.set(el, next);
    }
  }
}

function childList(node) {
  try {
    return node && node.childNodes ? Array.from(node.childNodes) : [];
  } catch {
    return [];
  }
}

export function translateTree(root, translator, state) {
  const st = stateFor(translator, state);
  walk(root);
  return st;

  function walk(node) {
    if (!node || underNoI18n(node)) return;
    if (node.nodeType === TEXT_NODE) {
      translateSingle(node, translator, st);
      return;
    }
    if (node.nodeType !== ELEMENT_NODE) return;
    if (skipSubtree(node)) return;
    translateAttrs(node, translator, st);
    const kids = childList(node).filter(Boolean);
    const hasEl = kids.some((k) => k.nodeType === ELEMENT_NODE);
    if (!hasEl) {
      const texts = kids.filter((k) => k.nodeType === TEXT_NODE);
      if (texts.length > 1) translateLeaf(texts, translator, st);
      else if (texts.length === 1) translateSingle(texts[0], translator, st);
    } else {
      for (const k of kids) walk(k);
    }
  }
}

function translateTitle(doc, translator) {
  try {
    const t = doc.title;
    if (typeof t === "string" && HANGUL.test(t)) {
      const out = translator.translate(t);
      if (out !== t && doc.title !== out) doc.title = out;
    }
  } catch {
    /* ignore */
  }
}

export function startDomTranslation(root, translator) {
  const st = stateFor(translator, undefined);
  translateTree(root, translator, st);
  if (typeof MutationObserver === "undefined" || !root) return () => {};
  const cleanups = [];
  const retarget = (node) => {
    if (!node || underNoI18n(node)) return;
    const parent = node.parentNode || null;
    if (parent && parent.nodeType === ELEMENT_NODE && !skipSubtree(parent)) {
      const kids = childList(parent).filter(Boolean);
      if (!kids.some((k) => k.nodeType === ELEMENT_NODE)) {
        const texts = kids.filter((k) => k.nodeType === TEXT_NODE);
        if (texts.length > 1) {
          translateLeaf(texts, translator, st);
          return;
        }
      }
    }
    if (node.nodeType === TEXT_NODE) translateSingle(node, translator, st);
    else translateTree(node, translator, st);
  };
  let obs = null;
  // Safety net: never re-enter the callback, and skip a node written
  // more than 3 times in one frame (same-value writes above already
  // avoid the loop; this only caps a pathological one).
  let busy = false;
  let frameCounts = new WeakMap();
  let frameScheduled = false;
  const touch = (node) => {
    const n = (node ? frameCounts.get(node) : 0) || 0;
    const next = n + 1;
    if (node) frameCounts.set(node, next);
    if (!frameScheduled && typeof requestAnimationFrame !== "undefined") {
      frameScheduled = true;
      requestAnimationFrame(() => {
        frameCounts = new WeakMap();
        frameScheduled = false;
      });
    }
    return next;
  };
  try {
    obs = new MutationObserver((mutations) => {
      if (busy) return;
      busy = true;
      try {
        for (const m of mutations || []) {
          try {
            if (!m) continue;
            if (m.type === "characterData") {
              if (touch(m.target) > 3) continue;
              retarget(m.target);
            } else if (m.type === "childList") {
              const added = m.addedNodes ? Array.from(m.addedNodes) : [];
              for (const n of added) {
                if (touch(n) > 3) continue;
                translateTree(n, translator, st);
              }
            } else if (m.type === "attributes" && TRANS_ATTRS.includes(m.attributeName)) {
              const el = m.target;
              if (touch(el) > 3) continue;
              if (el && el.nodeType === ELEMENT_NODE
                && !underNoI18n(el) && !skipSubtree(el)) {
                translateAttrs(el, translator, st);
              }
            }
          } catch {
            /* keep observing */
          }
        }
      } finally {
        busy = false;
      }
    });
    obs.observe(root, {
      subtree: true,
      childList: true,
      characterData: true,
      attributes: true,
      attributeFilter: TRANS_ATTRS,
    });
  } catch {
    return () => {};
  }
  cleanups.push(() => {
    try {
      obs.disconnect();
    } catch {
      /* ignore */
    }
  });
  try {
    const doc = (root && root.ownerDocument)
      || (typeof document !== "undefined" ? document : null);
    if (doc && typeof doc.querySelector === "function") {
      translateTitle(doc, translator);
      const titleEl = doc.querySelector("title");
      if (titleEl) {
        const tobs = new MutationObserver(() => translateTitle(doc, translator));
        tobs.observe(titleEl, { childList: true, characterData: true, subtree: true });
        cleanups.push(() => {
          try {
            tobs.disconnect();
          } catch {
            /* ignore */
          }
        });
      }
    }
  } catch {
    /* title is best-effort */
  }
  return () => {
    for (const fn of cleanups) fn();
  };
}
