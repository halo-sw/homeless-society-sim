// 기준 tab (React, Astryx): the explicit simulation criteria.
// Rendered inside the compare card in sim mode. Data comes from
// /scenarios/criteria/kr-default.json resolved against the working
// scenario (main.js) — never invented here. Editable values send a
// what-if re-run through the consult agent, like any other what-if.
import { useEffect, useRef, useState } from "react";
import { Badge } from "@astryxdesign/core/Badge";
import { Banner } from "@astryxdesign/core/Banner";
import { Button } from "@astryxdesign/core/Button";
import { Heading } from "@astryxdesign/core/Heading";
import { HStack } from "@astryxdesign/core/HStack";
import { VStack } from "@astryxdesign/core/VStack";
import { Text } from "@astryxdesign/core/Text";
import { store } from "./store.js";

const act = (name, ...args) => store.act(name, ...args);

const SOURCE_VARIANT = {
  "engine 기본값": "neutral",
  "고객 입력": "blue",
  "데이터: OSM": "teal",
  "데이터: 실거래가": "info",
  "가정값": "orange",
};

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
        <HStack gap={1} vAlign="center" wrap="wrap">
          <Text>{item.title}</Text>
          <Badge variant="neutral" label={item.id} />
          <Badge variant={SOURCE_VARIANT[item.source] || "neutral"} label={item.source} />
        </HStack>
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
                <Text type="supporting">{`${k} (${v.unit})`}</Text>
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
      <Text type="supporting">
        {`시뮬레이션 기준 ${doc.items.length}개 · ${doc.doc} v${doc.version}`}
        {doc.overrides.length > 0 ? ` · 재정의 ${doc.overrides.length}개 (${doc.overrides.join(", ")})` : " · 재정의 없음"}
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
