// 가정 바꾸기 panel (13, Part 3): editable engine assumptions with
// current value, source, reset and plain-word help. Changes apply to
// the next simulation run and are recorded in the share link (?assume=).
// SSR-safe.
import { Button } from "@astryxdesign/core/Button";
import { Card } from "@astryxdesign/core/Card";
import { Heading } from "@astryxdesign/core/Heading";
import { HStack } from "@astryxdesign/core/HStack";
import { VStack } from "@astryxdesign/core/VStack";
import { Text } from "@astryxdesign/core/Text";
import {
  EDITABLE_ASSUMPTIONS, currentValue, changedCount,
} from "../assumptions.js";

function fmtAssumption(def, value) {
  if (def.unit === "원" || def.unit === "원/월") return `${Number(value).toLocaleString()}${def.unit}`;
  if (def.id === "C-commute-depart.morning_anchor_min") {
    const h = Math.floor(value / 60);
    const m = String(value % 60).padStart(2, "0");
    return `${h}:${m}`;
  }
  return `${value} ${def.unit}`;
}

export function AssumptionsPanel({ overrides, onSet, onReset, onClose }) {
  const changed = changedCount(overrides);
  return (
    <Card padding={3}>
      <VStack gap={2}>
        <HStack gap={1} vAlign="center">
          <Heading level={4}>{`가정 바꾸기${changed > 0 ? ` (${changed}개 바꿈)` : ""}`}</Heading>
          <span style={{ flex: 1 }} />
          {onClose && <Button size="sm" variant="ghost" label="닫기" onClick={onClose} />}
        </HStack>
        <Text type="supporting">바꾼 값은 다음 살아 보기부터 적용되고, 공유 링크에 함께 기록돼요.</Text>
        {EDITABLE_ASSUMPTIONS.map((def) => {
          const cur = currentValue(overrides, def.id);
          const isDefault = cur === def.def;
          return (
            <div key={def.id} className="ui-src-row">
              <HStack gap={1} vAlign="center">
                <Text><strong>{def.label}</strong></Text>
                <span style={{ flex: 1 }} />
                <Text hasTabularNumbers>{fmtAssumption(def, cur)}</Text>
                {!isDefault && (
                  <Button size="sm" variant="ghost" label="되돌리기"
                    onClick={() => onReset && onReset(def.id)} />
                )}
              </HStack>
              <HStack gap={1} vAlign="center">
                <input type="range" min={def.min} max={def.max} step={def.step}
                  value={cur} style={{ flex: 1 }}
                  aria-label={def.label}
                  onChange={(e) => onSet && onSet(def.id, Number(e.target.value))} />
              </HStack>
              <Text type="supporting">{def.help}</Text>
              <Text type="supporting">{`출처: ${def.source} · 기본값 ${fmtAssumption(def, def.def)}`}</Text>
            </div>
          );
        })}
      </VStack>
    </Card>
  );
}
