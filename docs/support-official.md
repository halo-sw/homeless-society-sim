# 지원 제도 공식 출처 연결점 (stage 9b, Part C.4)

정책 대출·청년·신혼 지원은 `scenarios/assumptions/kr-support-programs.json`
(구조 + 이름, 수치는 오케스트레이터가 공식 페이지에서 확인 후 기입)과
`web/src/money/support.js`의 조건별 대조표로 보인다. 여기에 더해 키가 필요한
공식 목록 API 두 곳을 미리 연결점으로만 둔다. 호출은 하지 않는다.

## 인터페이스 (`web/src/support-official.js`)

```js
source = {
  id,            // "youth-center" | "bokjiro" | "fixture:..."
  needsKey,      // fixture는 false, 실제 API는 true
  async listPolicies({ region?, maxAge? }) -> [
    { title, org, min_age, max_age, summary, source_url },
  ],
}
```

- `checkSupportSource(source)` — 모양 검사.
- `fixtureSupportSource({ id, policies })` — 호출 없이 행을 그대로 내놓는
  모의 출처. 테스트와 화면 데모가 쓴다.
- `checkPolicyRow(row)` — 행 모양 검사 (fixture 파일과 미래 매퍼가 공유).

## 픽스처

- `web/tests/fixtures/support-official-youth.json` — 온통청년 모양 예시 2행.
- `web/tests/fixtures/support-official-bokjiro.json` — 복지로 모양 예시 2행.

두 파일 다 예시이며 공식 값이 아니다. `source_url`은 미확정이라 null이다.

## 키가 오면

1. 서버 쪽에만 키를 둔 출처를 구현한다 (`HOUSING_API_KEY` 때처럼 키는
   절대 브라우저에 내려가지 않는다).
2. 같은 인터페이스(`listPolicies`)로 갈아 끼운다. 화면·상담은 그대로 둔다.
3. 목록 값도 `needs_confirmation` 규칙을 따른다. 미확인 링크는 null이다.
