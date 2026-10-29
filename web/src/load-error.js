// One error explainer for every data load (13, Part 9). Replaces the
// generic "불러오지 못했어요" with: which data, what happened, what
// still works, what the user can do — in plain Korean plus a technical
// detail line. Pure; tested in load-error-13.test.js.

// cause: not-built | http | endpoint-changed | no-key | not-covered |
//        parse | timeout | unknown
export function explainLoadError({ feature, cause, detail = {} }) {
  const f = FEATURE_KO[feature] || "자료";
  const builders = {
    "not-built": () => ({
      title: `${f} 자료가 아직 안 만들어졌어요`,
      body: `필요한 파일(${detail.file || "빌드 결과물"})이 없어요. `
        + `${detail.command ? `터미널에서 \`${detail.command}\`를 실행하면 만들어져요. ` : ""}`
        + `그 전에도 ${STILL_OK[feature] || "다른 화면은 그대로 볼 수 있어요"}.`,
      tech: `missing file: ${detail.file || "?"}${detail.command ? ` · build: ${detail.command}` : ""}`,
    }),
    http: () => ({
      title: `${f} 자료를 받아오지 못했어요 (HTTP ${detail.status || "?"})`,
      body: `${detail.status ? `서버가 ${detail.status}라고 답했어요` : "서버가 답하지 않았어요"}. `
        + `${detail.message ? `${detail.message} ` : ""}`
        + `${STILL_OK[feature] || "저장된 화면은 그대로 볼 수 있어요"}. `
        + "잠시 뒤 다시 시도해 보세요.",
      tech: `HTTP ${detail.status || "?"} ${detail.url || ""} ${detail.message || ""}`.trim(),
    }),
    "endpoint-changed": () => ({
      title: `${f} 제공처 주소가 바뀌었어요`,
      body: `쓰던 주소(${detail.url || "API 주소"})가 ${detail.status || 404}를 돌려줘요. `
        + `${detail.since ? `${detail.since}부터 확인됐어요. ` : ""}`
        + `그동안 ${STILL_OK[feature] || "다른 화면은 그대로 볼 수 있어요"}.`,
      tech: `endpoint changed: ${detail.url || ""} -> HTTP ${detail.status || 404} since ${detail.since || "?"}`,
    }),
    "no-key": () => ({
      title: `${f}에 쓸 키가 없어요`,
      body: `이 기능은 ${detail.provider || "외부 API"} 키가 필요해요. `
        + "상단 모델 패널에서 키를 붙여넣거나, 기록된 답변 모드로 보세요.",
      tech: `missing key for ${detail.provider || feature}`,
    }),
    "not-covered": () => ({
      title: `${f}: 이 지역은 자료가 없어요`,
      body: `${detail.region ? `‘${detail.region}’` : "이 지역"}은 아직 모은 자료가 없어요. `
        + `${STILL_OK[feature] || "자료가 있는 지역은 그대로 볼 수 있어요"}.`,
      tech: `not covered: ${detail.region || "?"}`,
    }),
    parse: () => ({
      title: `${f} 자료가 깨졌어요`,
      body: `받은 자료(${detail.file || "응답"})를 읽지 못했어요. `
        + `${detail.command ? `\`${detail.command}\`로 다시 만들면 고쳐질 수 있어요. ` : ""}`
        + `${STILL_OK[feature] || "다른 화면은 그대로 볼 수 있어요"}.`,
      tech: `parse error: ${detail.file || ""} ${detail.message || ""}`.trim(),
    }),
    timeout: () => ({
      title: `${f} 답이 너무 늦어요`,
      body: `요청이 ${detail.ms ? `${Math.round(detail.ms / 1000)}초 안에` : ""} 오지 않았어요. `
        + "다시 시도해 보세요. 자꾸 늦으면 모델 패널에서 다른 모델을 고르세요.",
      tech: `timeout after ${detail.ms || "?"} ms`,
    }),
  };
  const build = builders[cause] || (() => ({
    title: `${f} 자료를 불러오지 못했어요`,
    body: `${detail.message || "이유를 알 수 없어요"}. 다시 시도해 보세요.`,
    tech: detail.message || "unknown",
  }));
  const out = build();
  return { feature, cause: cause || "unknown", ...out };
}

export const FEATURE_KO = {
  jeonse: "전세 점검",
  money: "돈 계산",
  safety: "안심 정보",
  rentals: "공공임대",
  support: "도움 제도",
  photos: "사진",
  model: "모델 답변",
  transit: "대중교통 시간",
  map: "지도 시뮬레이션",
  sim3d: "3D 시뮬레이션",
};

const STILL_OK = {
  jeonse: "매물 기본 정보와 실거래가는 그대로 볼 수 있어요",
  money: "후보 목록과 출퇴근 시간은 그대로 볼 수 있어요",
  safety: "후보 목록과 돈 계산은 그대로 볼 수 있어요",
  rentals: "민간 매물 후보는 그대로 볼 수 있어요",
  support: "후보 찾기와 시뮬레이션은 그대로 쓸 수 있어요",
  photos: "우리 3D 미리보기와 지도로 볼 수 있어요",
  model: "키 없이 보는 기록된 답변이 있어요",
  transit: "집 위치와 사진은 그대로 볼 수 있어요",
  map: "후보 목록은 그대로 볼 수 있어요",
  sim3d: "지도 시뮬레이션으로 볼 수 있어요",
};
