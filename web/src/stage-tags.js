// Household tag layout (13e2, pure, no DOM). Tags live in #tags,
// which is inset-0 over the canvas — so NDC maps to the canvas/stage
// rect, never innerWidth/innerHeight (those slide tags under the
// right drawer). Rects are {left, top, width, height} in any
// consistent space (viewport px or #tags-local px).

// Visible stage rect: the canvas minus the right drawer overlap.
export function stageRect(canvasRect, { drawerOpen = false, drawerWidth = 0 } = {}) {
  const overlap = drawerOpen ? Math.max(drawerWidth, 0) : 0;
  return {
    left: canvasRect.left,
    top: canvasRect.top,
    width: Math.max(canvasRect.width - overlap, 0),
    height: canvasRect.height,
  };
}

// NDC (-1..1) to px, positioned in the full canvas rect. A tag is
// hidden when it lands past the stage's right edge or outside the
// stage vertically.
export function placeTag(nx, ny, canvasRect, { drawerOpen = false, drawerWidth = 0 } = {}) {
  const stage = stageRect(canvasRect, { drawerOpen, drawerWidth });
  const x = (nx * 0.5 + 0.5) * canvasRect.width + canvasRect.left;
  const y = (-ny * 0.5 + 0.5) * canvasRect.height + canvasRect.top;
  const visible = x <= stage.left + stage.width
    && y >= stage.top && y <= stage.top + stage.height;
  return { x, y, visible };
}

// 13e4: hide a tag when its BOX — not just its anchor point —
// touches a blocker (drawer, top bar). All rects are
// {left, top, width, height} in one consistent space (e.g. viewport
// px from getBoundingClientRect). Touching edges do not count.
export function rectsIntersect(a, b) {
  if (!a || !b) return false;
  if (!(a.width > 0 && a.height > 0 && b.width > 0 && b.height > 0)) return false;
  return a.left < b.left + b.width && b.left < a.left + a.width
    && a.top < b.top + b.height && b.top < a.top + a.height;
}

export function tagBoxBlocked(tagBox, blockers) {
  return (blockers || []).some((r) => rectsIntersect(tagBox, r));
}

// 13e5: camera view offset so the orbit target renders at the centre
// of the STAGE (canvas minus the right-drawer overlap), never under
// the drawer. three.js setViewOffset(fullW, fullH, x, y, w, h) with
// w == fullW keeps the image size and slides the content left by x
// px, so x = overlap / 2 lands the target on the stage centre. DOM
// tags project through the same camera, so they stay aligned.
// Caller: camera.setViewOffset(o.fullW, h, o.x, 0, o.width, h) — or
// camera.clearViewOffset() when o.overlap is 0.
export function simViewOffset(canvasWidth, drawerOverlap) {
  const fullW = Math.max(canvasWidth || 0, 0);
  const overlap = Math.min(Math.max(drawerOverlap || 0, 0), fullW);
  const stageWidth = fullW - overlap;
  return {
    x: overlap / 2, y: 0, fullW, width: fullW, overlap, stageWidth,
    stageCenterX: stageWidth / 2,
  };
}
