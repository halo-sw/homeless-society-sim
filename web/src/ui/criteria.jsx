// 기준 tab (React, Astryx): the explicit simulation criteria.
// Rendered inside the compare card in sim mode. Data comes from
// /scenarios/criteria/kr-default.json resolved against the working
// scenario (main.js) — never invented here. Editable values send a
// what-if re-run through the consult agent, like any other what-if.
import { useEffect, useRef, useState } from "react";
import { Banner } from "@astryxdesign/core/Banner";
import { Button } from "@astryxdesign/core/Button";
import { Heading } from "@astryxdesign/core/Heading";
import { HStack } from "@astryxdesign/core/HStack";
import { VStack } from "@astryxdesign/core/VStack";
import { Text } from "@astryxdesign/core/Text";
import { store } from "./store.js";
import { plainSource } from "./copy.js";
import { PRIORITY_GROUPS, PRIORITY_METRICS } from "../priorities.js";

function PrioritiesMap() {
  return (
    <VStack gap={1}>
      <Heading level={4}>내 기준 (중요한 것 → 재는 값)</Heading>
      <Text type="supporting">고객님이 직접 정하는 비중(각 0–5, 기본 모두 보통). 이 비중이 집을 나란히 보는 유일한 잣대이며, 항상 고객님의 것으로 표시돼요. 한 숫자로 볼 때 치안은 합산하지 않아요.</Text>
      {PRIORITY_GROUPS.map((g) => (
        <VStack gap={0} key={g.id}>
          <Text>{`${g.title} — ${g.note}`}</Text>
          {PRIORITY_METRICS.filter((m) => m.group === g.id).map((m) => (
            <Text key={m.id} type="supporting">{`· ${m.label} (${m.unit}, ${m.source})`}</Text>
          ))}
        </VStack>
      ))}
    </VStack>
  );
}

const act = (name, ...args) => store.act(name, ...args);

function CriterionRow({ item, focus }) {
  const ref = useRef(null);
  const [draft, setDraft] = useState({});
  useEffect(() => {
    if (focus && ref.current && ref.current.scrollIntoView) {
      ref.current.scrollIntoView({ block: "nearest" });
    }
  }, [focus]);
  const overridables = Object.entries(item.values || {}).filter(([, v]) => v.overridable);
  const dirty = overridables.filter(([k]) => draft[k] !== undefined && draft[k] !== "");
  return (
    <div ref={ref} className={focus ? "ui-criterion-focus" : undefined}>
      <VStack gap={1}>
        {/* 13e4: title only — the internal id stays in `title`. */}
        <span title={item.id}>
          <Text>{item.title}</Text>
        </span>
        <Text type="supporting">{plainSource(item.source)}</Text>
        <Text type="supporting">{item.rule}</Text>
        {item.valuesLine && <Text type="supporting" hasTabularNumbers>{item.valuesLine}</Text>}
        {item.affects.length > 0 && (
          <Text type="supporting">{`영향: ${item.affects.join(" · ")}`}</Text>
        )}
        <HStack gap={1} vAlign="center" wrap="wrap">
          <Button size="sm" variant="ghost" label="이 기준을 쓴 순간 보기"
            onClick={() => act("jumpToCriterionUse", item.id)} />
        </HStack>
        {overridables.length > 0 && (
          <HStack gap={1} vAlign="center" wrap="wrap">
            {overridables.map(([k, v]) => (
              <HStack gap={1} vAlign="center" key={k}>
                <Text type="supporting">{`${String(k).replace(/_/g, " ")} (${v.unit})`}</Text>
                <input className="ui-weight" type="number"
                  value={draft[k] !== undefined ? draft[k] : v.value}
                  onChange={(e) => setDraft({ ...draft, [k]: e.target.value })}
                  aria-label={`${item.id} ${k}`} />
              </HStack>
            ))}
            {dirty.length > 0 && (
              <Button size="sm" variant="secondary" label="상담으로 다시 실행"
                onClick={() => {
                  const patch = {};
                  for (const [k] of dirty) patch[k] = Number(draft[k]);
                  const msg = `기준 ${item.id}(${item.title})을 이렇게 바꿔서 다시 실행해줘: ${JSON.stringify(patch)}`;
                  try {
                    act("consultSend", msg);
                  } catch {
                    store.set({ consultOpen: true });
                  }
                }} />
            )}
          </HStack>
        )}
      </VStack>
    </div>
  );
}

export function CriteriaTab({ state }) {
  const doc = state.criteria;
  if (state.criteriaLoading) return <Text type="supporting">불러오는 중…</Text>;
  if (!doc || doc.error) {
    return (
      <Banner status="warning" title="기준을 불러오지 못했습니다"
        description={(doc && doc.error) || "criteria.json이 없습니다"} />
    );
  }
  return (
    <VStack gap={2}>
      <PrioritiesMap />
      <Text type="supporting">
        {`계산 기준 ${doc.items.length}개`}
        {doc.overrides.length > 0 ? ` · 고객님이 바꾼 것 ${doc.overrides.length}개` : " · 바꾼 것 없음"}
      </Text>
      {doc.groups.map((g) => (
        <VStack gap={1} key={g.id}>
          <Heading level={4}>{g.title}</Heading>
          {doc.items.filter((c) => c.group === g.id).map((c) => (
            <CriterionRow key={c.id} item={c} focus={state.criteriaFocus === c.id} />
          ))}
        </VStack>
      ))}
    </VStack>
  );
}
