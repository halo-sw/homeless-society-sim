// One home's monthly housing cost (pure, no DOM).
//
// Shared by the chat result card and the share card so 월 주거비 is
// one number: the tenure's housing.monthly_won plus maintenance and
// transit from totals_by_category, normalised to 30 days.

export function monthlyHousingOf(doc, label, days = 30) {
  const h = doc && doc.homes && doc.homes[label];
  if (!h) return { label, missing: true };
  const t = ((doc.default_tenure || {})[label])
    || (h.by_tenure && Object.keys(h.by_tenure)[0]);
  const sel = h.by_tenure && h.by_tenure[t];
  if (!sel || !sel.housing) return { label, tenure: t || null, missing: true };
  const span = Number(days) > 0 ? Number(days) : 30;
  const totals = sel.totals_by_category || {};
  const maintenance = Math.round(Math.abs(totals.maintenance || 0) * 30 / span);
  const transit = Math.round(Math.abs(totals.transit || 0) * 30 / span);
  const housing = Math.max(0, Math.round(Number(sel.housing.monthly_won) || 0));
  return { label, tenure: t, monthly: housing + maintenance + transit,
    parts: { housing, maintenance, transit }, housingDoc: sel.housing,
    maintenanceWon: maintenance, transitWon: transit };
}
