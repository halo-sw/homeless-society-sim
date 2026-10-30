// 13f-1: the only two source badges on screen — 실측 / 가정값 — with
// the same small style everywhere (one neutral Badge). Shown once per
// group (section header or row group), never on every line. Every other
// badge colour became plain text or was removed.
import { Badge } from "@astryxdesign/core/Badge";
import { sourceBadgeFor, groupBadgesFor } from "./copy.js";

export function SourceBadge({ source }) {
  return <Badge variant="neutral" label={sourceBadgeFor(source)} />;
}

export function GroupBadges({ sources }) {
  const badges = groupBadgesFor(sources);
  if (badges.length === 0) return null;
  return (
    <>
      {badges.map((b) => (
        <Badge key={b} variant="neutral" label={b} />
      ))}
    </>
  );
}
