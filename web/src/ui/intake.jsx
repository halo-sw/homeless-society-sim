// Inline intake answer cards (13, Part 2): chips, steppers, range
// sliders and a place picker rendered inside the chat, one step at a
// time. State machine in ../intake.js; this file only renders.
// SSR-safe (no window at module scope).
import { useState } from "react";
import { Button } from "@astryxdesign/core/Button";
import { Card } from "@astryxdesign/core/Card";
import { Heading } from "@astryxdesign/core/Heading";
import { HStack } from "@astryxdesign/core/HStack";
import { VStack } from "@astryxdesign/core/VStack";
import { Text } from "@astryxdesign/core/Text";
import {
  INTAKE_KO, SAID_VALUE_BADGE, INTAKE_AREAS, COMMUTE_MODES,
  AGE_BANDS, RELATIONS,
} from "../intake.js";
import { fmtWon } from "../money/format.js";

function SaidBadge({ said }) {
  if (!said) return null;
  return <Text type="supporting">{SAID_VALUE_BADGE}</Text>;
}

function Stepper({ value, min, max, step, unit, placeholder, startValue, onChange }) {
  // 13e2: value may be null (not said yet) — show the placeholder and
  // let the first press land on startValue instead of inventing a number.
  const clamp = (n) => Math.min(max, Math.max(min, n));
  const bump = (dir) => {
    if (value === null || value === undefined) {
      onChange(clamp(startValue ?? min));
      return;
    }
    onChange(clamp(value + dir * step));
  };
  return (
    <HStack gap={1} vAlign="center">
      <Button size="sm" variant="secondary" label="−" onClick={() => bump(-1)} />
      {value === null || value === undefined ? (
        <Text type="supporting">{placeholder || "아직 몰라요"}</Text>
      ) : (
        <Text hasTabularNumbers>{`${value}${unit || ""}`}</Text>
      )}
      <Button size="sm" variant="secondary" label="+" onClick={() => bump(1)} />
    </HStack>
  );
}

function IncomeStep({ value, onChange }) {
  const [kind, setKind] = useState((value && value.kind) || "annual");
  const [amount, setAmount] = useState(value ? value.amount ?? null : null);
  const commit = (k, a) => onChange({ kind: k, amount: a });
  return (
    <VStack gap={2}>
      <HStack gap={1}>
        <Button size="sm" variant={kind === "annual" ? "primary" : "secondary"}
          label="연봉" onClick={() => { setKind("annual"); if (amount !== null) commit("annual", amount); }} />
        <Button size="sm" variant={kind === "monthly" ? "primary" : "secondary"}
          label="세후 월급" onClick={() => { setKind("monthly"); if (amount !== null) commit("monthly", amount); }} />
      </HStack>
      <Stepper value={amount === null ? null : Math.round(amount / 10000)} min={0} max={20000} step={100}
        unit="만 원" placeholder="예: 4,000만 원" startValue={4000}
        onChange={(man) => { setAmount(man * 10000); commit(kind, man * 10000); }} />
      {amount !== null && (
        <Text type="supporting" hasTabularNumbers>{fmtWon(amount)}</Text>
      )}
    </VStack>
  );
}

function TextStep({ value, placeholder, onChange }) {
  const [text, setText] = useState(value || "");
  return (
    <HStack gap={1}>
      <input className="ui-keyinput" value={text} placeholder={placeholder}
        onChange={(e) => setText(e.target.value)}
        onBlur={() => { if (text.trim()) onChange(text.trim()); }}
        aria-label={placeholder} />
      <Button size="sm" label="입력"
        onClick={() => { if (text.trim()) onChange(text.trim()); }} />
    </HStack>
  );
}

function AreasStep({ value, onChange }) {
  const [sel, setSel] = useState(new Set(value || []));
  const toggle = (id) => {
    const next = new Set(sel);
    if (id === "anywhere") {
      onChange(["anywhere"]);
      setSel(new Set(["anywhere"]));
      return;
    }
    next.delete("anywhere");
    if (next.has(id)) next.delete(id);
    else next.add(id);
    setSel(next);
    onChange([...next]);
  };
  return (
    <div className="ui-intake-row">
      {INTAKE_AREAS.map((a) => (
        <Button key={a.id} size="sm"
          variant={sel.has(a.id) ? "primary" : "secondary"}
          label={a.label} onClick={() => toggle(a.id)} />
      ))}
      <Button size="sm" variant={sel.has("anywhere") ? "primary" : "secondary"}
        label="상관없음" onClick={() => toggle("anywhere")} />
    </div>
  );
}

function LivingStep({ value, onChange }) {
  const [amount, setAmount] = useState(value ?? null);
  return (
    <VStack gap={1}>
      <Stepper value={amount === null ? null : Math.round(amount / 10000)} min={0} max={1000} step={10}
        unit="만 원" placeholder="예: 150만 원" startValue={150}
        onChange={(man) => { setAmount(man * 10000); onChange(man * 10000); }} />
      <Text type="supporting" hasTabularNumbers>{amount === null ? "한 달 생활비를 정해주세요" : `한 달 ${fmtWon(amount)}`}</Text>
    </VStack>
  );
}

function CommuteStep({ value, onChange }) {
  const [maxMin, setMaxMin] = useState(value ? value.maxMin ?? null : null);
  const [mode, setMode] = useState((value && value.mode) || "transit");
  const commit = (m, md) => onChange({ maxMin: m, mode: md });
  return (
    <VStack gap={2}>
      <HStack gap={1} vAlign="center">
        <Text type="supporting">최대</Text>
        <Stepper value={maxMin} min={10} max={120} step={5} unit="분"
          placeholder="예: 40분" startValue={40}
          onChange={(n) => { setMaxMin(n); commit(n, mode); }} />
      </HStack>
      <div className="ui-intake-row">
        {COMMUTE_MODES.map((m) => (
          <Button key={m.id} size="sm"
            variant={mode === m.id ? "primary" : "secondary"}
            label={m.label} onClick={() => { setMode(m.id); if (maxMin !== null) commit(maxMin, m.id); }} />
        ))}
      </div>
    </VStack>
  );
}

function BudgetStep({ value, onChange }) {
  const v = value || { tenure: "jeonse", unknown: true };
  const [tenure, setTenure] = useState(v.tenure || "jeonse");
  const [deposit, setDeposit] = useState(v.depositMax ?? null);
  const [monthly, setMonthly] = useState(v.monthlyMax ?? null);
  const [price, setPrice] = useState(v.priceMax ?? null);
  const [unknown, setUnknown] = useState(v.unknown !== false
    && v.depositMax == null && v.monthlyMax == null && v.priceMax == null);
  const commit = (t, d, m, p, u) => onChange(
    u ? { tenure: t, unknown: true, depositMax: null, monthlyMax: null, priceMax: null }
      : { tenure: t, unknown: false, depositMax: d, monthlyMax: m, priceMax: p });
  return (
    <VStack gap={2}>
      <div className="ui-intake-row">
        {[["jeonse", "전세"], ["wolse", "월세"], ["trade", "매매"]].map(([id, label]) => (
          <Button key={id} size="sm" variant={tenure === id ? "primary" : "secondary"}
            label={label} onClick={() => { setTenure(id); setUnknown(false); commit(id, deposit, monthly, price, false); }} />
        ))}
        <Button size="sm" variant={unknown ? "primary" : "secondary"}
          label="아직 모름" onClick={() => { setUnknown(true); commit(tenure, deposit, monthly, price, true); }} />
      </div>
      {!unknown && tenure !== "wolse" && tenure !== "trade" && (
        <HStack gap={1} vAlign="center">
          <Text type="supporting">보증금 상한</Text>
          <Stepper value={deposit === null ? null : Math.round(deposit / 100000000 * 10) / 10} min={0} max={20} step={0.5}
            unit="억" placeholder="예: 3억" startValue={3}
            onChange={(eok) => { setDeposit(eok * 100000000); commit(tenure, eok * 100000000, monthly, price, false); }} />
        </HStack>
      )}
      {!unknown && tenure === "wolse" && (
        <VStack gap={1}>
          <HStack gap={1} vAlign="center">
            <Text type="supporting">보증금</Text>
            <Stepper value={deposit === null ? null : Math.round(deposit / 10000)} min={0} max={20000} step={500}
              unit="만" placeholder="예: 5,000만" startValue={5000}
              onChange={(man) => { setDeposit(man * 10000); commit(tenure, man * 10000, monthly, price, false); }} />
          </HStack>
          <HStack gap={1} vAlign="center">
            <Text type="supporting">월세</Text>
            <Stepper value={monthly === null ? null : Math.round(monthly / 10000)} min={0} max={500} step={10}
              unit="만" placeholder="예: 100만" startValue={100}
              onChange={(man) => { setMonthly(man * 10000); commit(tenure, deposit, man * 10000, price, false); }} />
          </HStack>
        </VStack>
      )}
      {!unknown && tenure === "trade" && (
        <HStack gap={1} vAlign="center">
          <Text type="supporting">매매가 상한</Text>
          <Stepper value={price === null ? null : Math.round(price / 100000000 * 10) / 10} min={0} max={30} step={0.5}
            unit="억" placeholder="예: 6억" startValue={6}
            onChange={(eok) => { setPrice(eok * 100000000); commit(tenure, deposit, monthly, eok * 100000000, false); }} />
        </HStack>
      )}
    </VStack>
  );
}

const STEP_BODY = {
  income: IncomeStep,
  current: (p) => <TextStep {...p} placeholder="예: 성남 분당구" />,
  areas: AreasStep,
  living: LivingStep,
  commute: CommuteStep,
  budget: BudgetStep,
};

export function IntakeCard({ step, index, total, value, said, onAnswer, onSkip }) {
  const Body = STEP_BODY[step];
  if (!Body) return null;
  return (
    <Card padding={3}>
      <VStack gap={2} className="ui-intake">
        <HStack gap={1} vAlign="center">
          <Heading level={4}>{`${index + 1}/${total} · ${INTAKE_KO[step]}`}</Heading>
          <SaidBadge said={said} />
        </HStack>
        <Body value={value} onChange={(v) => onAnswer(step, v)} />
        <HStack gap={1}>
          <Button size="sm" variant="secondary" label="다음"
            onClick={() => onAnswer(step, value ?? null, true)} />
          <Button size="sm" variant="ghost" label="나중에"
            onClick={() => onSkip(step)} />
        </HStack>
      </VStack>
    </Card>
  );
}

export function HouseholdCard({ household, onAdd, onRemove }) {
  const members = (household && household.members) || [];
  const [draft, setDraft] = useState({ relation: "배우자", ageBand: "30대",
    commuteMax: 45, workplaceText: "", incomeMan: null });
  const [error, setError] = useState("");
  return (
    <Card padding={3}>
      <VStack gap={2}>
        <HStack gap={1} vAlign="center">
          <Heading level={4}>{`함께 사는 사람 ${members.length}/4`}</Heading>
        </HStack>
        {members.map((m, i) => (
          <HStack key={i} gap={1} vAlign="center">
            <Text>{`${m.relation} · ${m.ageBand}${m.commuteMax ? ` · 출퇴근 ${m.commuteMax}분` : ""}${m.workplace && m.workplace.known ? ` · ${m.workplace.station}` : " · 직장 모름"}${m.incomeMonthly ? ` · 월 ${fmtWon(m.incomeMonthly)}` : ""}`}</Text>
            <Button size="sm" variant="ghost" label="빼기" onClick={() => onRemove(i)} />
          </HStack>
        ))}
        {members.length < 4 && (
          <VStack gap={1}>
            <div className="ui-intake-row">
              {RELATIONS.map((r) => (
                <Button key={r} size="sm" variant={draft.relation === r ? "primary" : "secondary"}
                  label={r} onClick={() => setDraft({ ...draft, relation: r })} />
              ))}
            </div>
            <div className="ui-intake-row">
              {AGE_BANDS.map((a) => (
                <Button key={a} size="sm" variant={draft.ageBand === a ? "primary" : "secondary"}
                  label={a} onClick={() => setDraft({ ...draft, ageBand: a })} />
              ))}
            </div>
            <HStack gap={1} vAlign="center">
              <Text type="supporting">출퇴근</Text>
              <Stepper value={draft.commuteMax} min={10} max={120} step={5} unit="분"
                onChange={(n) => setDraft({ ...draft, commuteMax: n })} />
            </HStack>
            <HStack gap={1} vAlign="center">
              <input className="ui-keyinput" value={draft.workplaceText}
                placeholder="직장 역/장소 (예: 강남역, 비우면 모름)"
                onChange={(e) => setDraft({ ...draft, workplaceText: e.target.value })}
                aria-label="함께 사는 사람 직장" style={{ flex: 1 }} />
            </HStack>
            <HStack gap={1} vAlign="center">
              <Text type="supporting">월급 (선택)</Text>
              <Stepper value={draft.incomeMan ?? 0} min={0} max={2000} step={50} unit="만"
                onChange={(man) => setDraft({ ...draft, incomeMan: man === 0 ? null : man })} />
              {draft.incomeMan ? (
                <Text type="supporting" hasTabularNumbers>{fmtWon(draft.incomeMan * 10000)}</Text>
              ) : (
                <Text type="supporting">모름</Text>
              )}
            </HStack>
            <HStack gap={1} vAlign="center">
              <Button size="sm" label="+ 함께 사는 사람" onClick={() => {
                const wt = String(draft.workplaceText || "").trim();
                const r = onAdd({ relation: draft.relation, ageBand: draft.ageBand,
                  commuteMax: draft.commuteMax,
                  workplace: wt ? { known: true, station: wt } : { known: false },
                  incomeMonthly: draft.incomeMan ? draft.incomeMan * 10000 : null });
                setError(r && r.error ? r.error : "");
                if (r && r.ok) {
                  setDraft({ relation: "배우자", ageBand: "30대",
                    commuteMax: 45, workplaceText: "", incomeMan: null });
                }
              }} />
            </HStack>
            {error && <Text type="supporting">{error}</Text>}
          </VStack>
        )}
      </VStack>
    </Card>
  );
}
