// Hover/tap housing-term definitions (React, Astryx-free).
// The definition text is the shared glossary (ui/glossary.js) — the same
// rows the consult agent serves through define_term.
import { Text } from "@astryxdesign/core/Text";
import { glossDef } from "./glossary.js";

export function Gloss({ term, children }) {
  const hit = glossDef(term);
  if (!hit) return <>{children || term}</>;
  const title = hit.source_url ? `${hit.def} (출처: ${hit.source_url})` : hit.def;
  return (
    <abbr className="ui-gloss" title={title}>
      {children || term}
    </abbr>
  );
}

export function GlossText({ term, type }) {
  const hit = glossDef(term);
  if (!hit) return <Text type={type}>{term}</Text>;
  return (
    <Text type={type}>
      <Gloss term={term} />
    </Text>
  );
}
