// 모델 panel (13, Part 4): one row per provider with status,
// bring-your-own-key (sessionStorage only), usage tracking and CSV
// export. No fake OAuth button — neither provider documents one.
// SSR-safe.
import { useState } from "react";
import { Badge } from "@astryxdesign/core/Badge";
import { Button } from "@astryxdesign/core/Button";
import { Card } from "@astryxdesign/core/Card";
import { Heading } from "@astryxdesign/core/Heading";
import { HStack } from "@astryxdesign/core/HStack";
import { VStack } from "@astryxdesign/core/VStack";
import { Text } from "@astryxdesign/core/Text";
import {
  MODEL_ROWS, OAUTH_NOTE, rowStatus, sessionTotals, usageCsv, formatCostUsd,
} from "../models/catalog.js";
import { loadByoKey, saveByoKey, clearByoKey } from "../consult/byok.js";

const STATUS_BADGE = { connected: "green", "no-key": "neutral", error: "red" };
const STATUS_KO = { connected: "연결됨", "no-key": "키 없음", error: "오류" };

function sessionStorageOf() {
  try {
    return typeof sessionStorage !== "undefined" ? sessionStorage : null;
  } catch {
    return null;
  }
}

export function ModelPanel({ usageLog, serverKeys = {}, errors = {}, onClose }) {
  const [drafts, setDrafts] = useState({});
  const [hasKey, setHasKey] = useState({ meta: false, baseten: false });
  const storage = sessionStorageOf();
  const totals = sessionTotals(usageLog);
  const exportCsv = () => {
    if (typeof document === "undefined") return;
    const blob = new Blob([usageCsv(usageLog)], { type: "text/csv" });
    const a = document.createElement("a");
    a.href = URL.createObjectURL(blob);
    a.download = "model-usage.csv";
    a.click();
    setTimeout(() => URL.revokeObjectURL(a.href), 1000);
  };
  return (
    <Card padding={3}>
      <VStack gap={2}>
        <HStack gap={1} vAlign="center">
          <Heading level={4}>모델</Heading>
          <span style={{ flex: 1 }} />
          {onClose && <Button size="sm" variant="ghost" label="닫기" onClick={onClose} />}
        </HStack>
        {MODEL_ROWS.map((row) => {
          const st = rowStatus(row.provider, {
            hasServerKey: Boolean(serverKeys[row.provider]),
            hasByoKey: hasKey[row.provider] || loadByoKey(storage, row.provider).length > 0,
            lastError: errors[row.provider] || null,
          });
          const isKeyRow = row.provider !== "recorded";
          return (
            <div key={row.provider} className="ui-modelrow">
              <VStack gap={0}>
                <Text>{row.label}</Text>
                <Text type="supporting">{st.reason}</Text>
                {isKeyRow && (
                  <HStack gap={1} vAlign="center">
                    <input className="ui-keyinput" type="password"
                      placeholder="키 붙여넣기 (이 탭에서만 저장)"
                      value={drafts[row.provider] || ""}
                      onChange={(e) => setDrafts({ ...drafts, [row.provider]: e.target.value })}
                      aria-label={`${row.label} 키`} />
                    <Button size="sm" variant="secondary" label="저장"
                      onClick={() => {
                        saveByoKey(storage, row.provider, drafts[row.provider] || "");
                        setHasKey({ ...hasKey, [row.provider]: true });
                        setDrafts({ ...drafts, [row.provider]: "" });
                      }} />
                    <Button size="sm" variant="ghost" label="키 지우기"
                      onClick={() => {
                        clearByoKey(storage, row.provider);
                        setHasKey({ ...hasKey, [row.provider]: false });
                      }} />
                  </HStack>
                )}
                {isKeyRow && <Text type="supporting">이 탭을 닫으면 지워져요</Text>}
              </VStack>
              <Badge variant={STATUS_BADGE[st.status]} label={STATUS_KO[st.status]} />
            </div>
          );
        })}
        <Text type="supporting">{OAUTH_NOTE}</Text>
        <VStack gap={0}>
          <Heading level={4}>이번 탭 사용량</Heading>
          <Text type="supporting" hasTabularNumbers className="ui-usage">
            {`대화 ${totals.turns}번 · 입력 ${totals.input.toLocaleString()} · 출력 ${totals.output.toLocaleString()} · 추론 ${totals.reasoning.toLocaleString()} · ${formatCostUsd(totals.costUsd)}`}
          </Text>
          <HStack gap={1}>
            <Button size="sm" variant="secondary" label="사용 기록 내보내기" onClick={exportCsv} />
          </HStack>
        </VStack>
      </VStack>
    </Card>
  );
}
