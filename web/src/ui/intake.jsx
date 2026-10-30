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

function Stepper({ value, min, max, step, unit, placeholder, startValue, onChange, decLabel, incLabel }) {
  // 13e2: value may be null (not said yet) — show the placeholder and
  // let the first press land on startValue instead of inventing a number.
  // 29a3: Stepper is kept only for commute minutes; its −/+ carry names.
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
      <Button size="sm" variant="secondary" label="−" aria-label={decLabel || "줄이기"} onClick={() => bump(-1)} />
      {value === null || value === undefined ? (
        <Text type="supporting">{placeholder || "아직 몰라요"}</Text>
      ) : (
        <Text hasTabularNumbers>{`${value}${unit || ""}`}</Text>
      )}
      <Button size="sm" variant="secondary" label="+" aria-label={incLabel || "늘리기"} onClick={() => bump(1)} />
    </HStack>
  );
}

// 29a3: number field with quick chips. value/onChange are 만 원
// (number|null); empty means unknown, never 0. Typing commits on blur
// so multi-digit entry never flips the card mid-word; chips commit at once.
export function MoneyField({ value, onChange, chips, placeholder, ariaLabel }) {
  const [text, setText] = useState(value === null || value === undefined ? "" : String(value));
  const commit = (t) => {
    const digits = String(t).replace(/[^0-9]/g, "");
    onChange(digits === "" ? null : parseInt(digits, 10));
  };
  return (
    <HStack gap={1} vAlign="center">
      <input className="ui-keyinput" inputMode="numeric" value={text}
        placeholder={placeholder} aria-label={ariaLabel || placeholder}
        onChange={(e) => setText(e.target.value)}
        onBlur={(e) => commit(e.target.value)} style={{ flex: 1 }} />
      {(chips || []).map((c) => (
        <Button key={c.label} size="sm"
          variant={value === c.man ? "primary" : "secondary"}
          label={c.label} aria-label={c.label}
          onClick={() => { setText(String(c.man)); onChange(c.man); }} />
      ))}
    </HStack>
  );
}

const EOK_CHIPS = [
  { label: "1억", man: 10000 }, { label: "2억", man: 20000 },
  { label: "3억", man: 30000 }, { label: "4억", man: 40000 },
  { label: "5억", man: 50000 },
];

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
      <MoneyField value={amount === null ? null : Math.round(amount / 10000)}
        placeholder="예: 4,000만 원" ariaLabel={kind === "annual" ? "연봉 (만 원)" : "세후 월급 (만 원)"}
        chips={[{ label: "3,000만", man: 3000 }, { label: "4,000만", man: 4000 },
          { label: "5,000만", man: 5000 }, { label: "6,000만", man: 6000 }]}
        onChange={(man) => { const won = man === null ? null : man * 10000; setAmount(won); commit(kind, won); }} />
      {amount !== null && (
        <Text type="supporting" hasTabularNumbers>{fmtWon(amount)}</Text>
      )}
    </VStack>
  );
}

function TextStep({ value, placeholder, onChange }) {
  const [text, setText] = useState(value || "");
  return (
    <HStack gap={1} className="ui-textstep">
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
      <MoneyField value={amount === null ? null : Math.round(amount / 10000)}
        placeholder="예: 150만 원" ariaLabel="한 달 생활비 (만 원)"
        chips={[{ label: "100만", man: 100 }, { label: "150만", man: 150 }, { label: "200만", man: 200 }]}
        onChange={(man) => { const won = man === null ? null : man * 10000; setAmount(won); onChange(won); }} />
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
          decLabel="출퇴근 상한 5분 줄이기" incLabel="출퇴근 상한 5분 늘리기"
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
          <MoneyField value={deposit === null ? null : Math.round(deposit / 10000)}
            placeholder="예: 3억" ariaLabel="보증금 상한 (만 원)" chips={EOK_CHIPS}
            onChange={(man) => { const won = man === null ? null : man * 10000; setDeposit(won); commit(tenure, won, monthly, price, false); }} />
        </HStack>
      )}
      {!unknown && tenure === "wolse" && (
        <VStack gap={1}>
          <HStack gap={1} vAlign="center">
            <Text type="supporting">보증금</Text>
            <MoneyField value={deposit === null ? null : Math.round(deposit / 10000)}
              placeholder="예: 5,000만" ariaLabel="보증금 (만 원)" chips={EOK_CHIPS}
              onChange={(man) => { const won = man === null ? null : man * 10000; setDeposit(won); commit(tenure, won, monthly, price, false); }} />
          </HStack>
          <HStack gap={1} vAlign="center">
            <Text type="supporting">월세</Text>
            <MoneyField value={monthly === null ? null : Math.round(monthly / 10000)}
              placeholder="예: 100만" ariaLabel="월세 (만 원)"
              chips={[{ label: "50만", man: 50 }, { label: "70만", man: 70 }, { label: "100만", man: 100 }]}
              onChange={(man) => { const won = man === null ? null : man * 10000; setMonthly(won); commit(tenure, deposit, won, price, false); }} />
          </HStack>
        </VStack>
      )}
      {!unknown && tenure === "trade" && (
        <HStack gap={1} vAlign="center">
          <Text type="supporting">매매가 상한</Text>
          <MoneyField value={price === null ? null : Math.round(price / 10000)}
            placeholder="예: 6억" ariaLabel="매매가 상한 (만 원)" chips={EOK_CHIPS}
            onChange={(man) => { const won = man === null ? null : man * 10000; setPrice(won); commit(tenure, deposit, monthly, won, false); }} />
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
          <Button size="sm" variant="primary" label="다음"
            onClick={() => onAnswer(step, value ?? null, true)} />
          <Button size="sm" variant="ghost" label="나중에" style={{ color: "var(--ds-ink-2)" }}
            onClick={() => onSkip(step)} />
        </HStack>
      </VStack>
    </Card>
  );
}

export function HouseholdCard({ household, onAdd, onRemove, defaultWorkplace, stations }) {
  const members = (household && household.members) || [];
  // 18: nothing preselected — a 1인 customer sees 0/4 with no
  // relation or age band chosen. Adding needs both taps.
  // 21a: the sentence-named workplace pre-fills the 직장 box.
  // 29a3: a couple sentence pre-fills the spouse (age null = 나이 미정).
  const said = members.some((m) => m && (m._said || m.ageBand === null || m.ageBand === undefined));
  const [draft, setDraft] = useState({ relation: "", ageBand: "",
    commuteMax: 45, workplaceText: defaultWorkplace || "", incomeMan: null });
  const [error, setError] = useState("");
  const editMember = (m, i) => {
    setDraft({ relation: (m && m.relation) || "",
      ageBand: (m && m.ageBand) || "",
      commuteMax: (m && m.commuteMax) ?? 45,
      workplaceText: (m && m.workplace && m.workplace.station) || "",
      incomeMan: m && m.incomeMonthly ? Math.round(m.incomeMonthly / 10000) : null });
    onRemove(i);
  };
  return (
    <Card padding={3}>
      <VStack gap={2}>
        <HStack gap={1} vAlign="center">
          <Heading level={4}>{`함께 사는 사람 ${members.length}/4${said ? " · 말씀하신 대로 넣어 뒀어요" : ""}`}</Heading>
        </HStack>
        {members.map((m, i) => (
          <HStack key={i} gap={1} vAlign="center">
            <Text>{`${m.relation} · ${m.ageBand || "나이 미정"}${m.commuteMax ? ` · 출퇴근 ${m.commuteMax}분` : ""}${m.workplace && m.workplace.known ? ` · ${m.workplace.station}` : " · 직장 모름"}${m.incomeMonthly ? ` · 월 ${fmtWon(m.incomeMonthly)}` : ""}`}</Text>
            <Button size="sm" variant="ghost" label="고치기" onClick={() => editMember(m, i)} />
            <Button size="sm" variant="ghost" label="빼기" onClick={() => onRemove(i)} />
          </HStack>
        ))}
        {members.length < 4 && (
          <VStack gap={1}>
            <HStack gap={1} vAlign="center">
              <span style={{ fontSize: 12, fontWeight: 600, color: "var(--ds-ink-2)" }}>관계</span>
              <div className="ui-intake-row">
                {RELATIONS.map((r) => (
                  <Button key={r} size="sm" variant={draft.relation === r ? "primary" : "secondary"}
                    label={r} aria-label={`관계: ${r}`} aria-pressed={draft.relation === r ? "true" : "false"}
                    onClick={() => setDraft({ ...draft, relation: r })} />
                ))}
              </div>
            </HStack>
            <HStack gap={1} vAlign="center">
              <span style={{ fontSize: 12, fontWeight: 600, color: "var(--ds-ink-2)" }}>나이</span>
              <div className="ui-intake-row">
                {AGE_BANDS.map((a) => (
                  <Button key={a} size="sm" variant={draft.ageBand === a ? "primary" : "secondary"}
                    label={a} aria-label={`나이: ${a}`} aria-pressed={draft.ageBand === a ? "true" : "false"}
                    onClick={() => setDraft({ ...draft, ageBand: a })} />
                ))}
              </div>
            </HStack>
            <HStack gap={1} vAlign="center">
              <Text type="supporting">출퇴근</Text>
              <Stepper value={draft.commuteMax} min={10} max={120} step={5} unit="분"
                decLabel="출퇴근 상한 5분 줄이기" incLabel="출퇴근 상한 5분 늘리기"
                onChange={(n) => setDraft({ ...draft, commuteMax: n })} />
            </HStack>
            <HStack gap={1} vAlign="center">
              <input className="ui-keyinput" value={draft.workplaceText} list="ui-station-list"
                placeholder="직장 근처 역 (예: 강남역)"
                onChange={(e) => setDraft({ ...draft, workplaceText: e.target.value })}
                aria-label="함께 사는 사람 직장" style={{ flex: 1 }} />
              <datalist id="ui-station-list">
                {(stations || []).map((s) => (
                  <option key={s} value={s} />
                ))}
              </datalist>
            </HStack>
            <HStack gap={1} vAlign="center">
              <Text type="supporting">월급 (선택)</Text>
              <MoneyField key={`hh-pay-${members.length}`} value={draft.incomeMan}
                placeholder="비우면 모름" ariaLabel="함께 사는 사람 월급 (만 원)"
                chips={[{ label: "200만", man: 200 }, { label: "300만", man: 300 }, { label: "400만", man: 400 }]}
                onChange={(man) => setDraft({ ...draft, incomeMan: man })} />
              {draft.incomeMan ? (
                <Text type="supporting" hasTabularNumbers>{fmtWon(draft.incomeMan * 10000)}</Text>
              ) : (
                <Text type="supporting">모름</Text>
              )}
            </HStack>
            <HStack gap={1} vAlign="center">
              <Button size="sm" variant="secondary" label="+ 함께 사는 사람" onClick={() => {
                if (!draft.relation || !draft.ageBand) {
                  setError("누구인지(관계·나이대)를 먼저 골라주세요");
                  return;
                }
                const wt = String(draft.workplaceText || "").trim();
                const r = onAdd({ relation: draft.relation, ageBand: draft.ageBand,
                  commuteMax: draft.commuteMax,
                  workplace: wt ? { known: true, station: wt } : { known: false },
                  incomeMonthly: draft.incomeMan ? draft.incomeMan * 10000 : null });
                setError(r && r.error ? r.error : "");
                if (r && r.ok) {
                  setDraft({ relation: "", ageBand: "",
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
