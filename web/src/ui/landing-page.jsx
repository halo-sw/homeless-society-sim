// 28d: the marketing landing at / (docs/design.md §4.1–4.2). A static
// page — no 3D world, no area fetch. Every entry point leads to the chat.
// 28f: band rhythm, hero proof facts, product window, dark closing.
import { useState } from "react";
import { ChatComposer } from "@astryxdesign/core/Chat";
import { assetUrl, appUrl } from "../paths.js";
import { appEntryUrl, chatUrl } from "../chat/urls.js";
import { currentLang } from "../i18n/lang.js";
import { META_HQ_EXAMPLE } from "../places-us.js";
import { COVERAGE_LINE, EXAMPLE_PROMPTS } from "./landing.jsx";
import { LangToggle } from "./lang-toggle.jsx";
import { PoweredByMuse, MUSE_LOGO_PATH } from "./powered-by-muse.jsx";

const NOTICE = "지금은 서울 동남권과 분당·판교·수지 11곳에서 시작했어요";
const HERO_PLACEHOLDER = "판교 출근인데 전세 2억 이하로 혼자 살 집 찾아 줘";
const COMPOSER_FILL = "판교로 출근해요. 전세로 혼자 살 집 찾아 줘";
const NIGHT_PROMPT = "판교 출근 집 두 곳에서 30일 살아 보고 밤 10시 이후 귀가를 보여 줘";
const HOOD_PROMPT = "미금역 근처 전세 찾아 주고 동네를 보여 줘";
const META_HQ_PROMPT = META_HQ_EXAMPLE;

export function replayIdForLang(lang) {
  return lang === "en" ? "menlo-month" : "seoul-couple";
}

export function replayEntryUrl(lang) {
  const id = replayIdForLang(lang === "en" ? "en" : "ko");
  const l = lang === "en" || lang === "ko" ? lang : "ko";
  return appUrl("?replay=" + id + "&lang=" + l);
}

// Same lines as landing.jsx SOURCES (kept local; landing.jsx is untouched).
const SOURCES_DETAIL = [
  "집값·전세: 국토교통부 실거래가 공개시스템 (최근 12개월, 참고용)",
  "집 위치·모양: OpenStreetMap + GIS건물통합정보 (국토교통부/VWorld)",
  "타는 시간: 서울교통공사 표준 운행시간, 없으면 1~8호선 평균 속도로 추정",
  "붐비는 정도: 서울교통공사 지하철혼잡도정보 (실측 표시가 없을 땐 가정값)",
  "주변 사진: Wikimedia Commons (자유 라이선스, 매물 사진 아님)",
  "치안·학교: 경찰청·교육부 공식 통계만 (출처·기간·단위와 함께 표시)",
  "미국 월세: Zillow Observed Rent Index (ZIP 단위 추정, 매물 가격 아님) · 지도·항공사진: USGS The National Map",
];

// Proof facts from the real walkthrough shown under the hero chips.
const PROOFS = [
  { num: "14초", rest: "후보 6곳 찾기" },
  { num: "85초", rest: "두 집 30일 살아 보기" },
  { num: "8/8", rest: "일기 문장 기록과 대조" },
];

const COLUMNS = [
  { n: "01", t: "물어보면 Muse가 골라요", d: "기능은 모두 Muse의 도구예요" },
  { n: "02", t: "숫자는 세서 말해요", d: "시간·거리·돈은 엔진이 계산해요" },
  { n: "03", t: "고르는 건 고객님이에요", d: "비교만 보여주고 고르라 하지 않아요" },
];

const TABLE_ROWS = [
  { k: "매물 가격을", a: "내 기억", b: "확률로 지음", c: "국토부 실거래 중간값에 대조" },
  { k: "출근 시간을", a: "대충 어림", b: "노선도 거리", c: "걷기+지하철+기다림을 셈" },
  { k: "살아 볼 수 있나", a: "불가능", b: "불가능", c: "30일 시뮬레이션 일기" },
];

const NUMBERS = [
  { big: "30일", small: "살아 봐야 아는 것: 출근 30번, 장보기, 밤 귀갓길" },
  { big: "11곳", small: "다루는 지역 11곳, 실거래 25.10–26.10" },
];

const USE_CASES = [
  { img: "uc-first-job", title: "판교 출근 신입의 첫 자취",
    line: "미금역 7분, 전세 실거래로 좁혀요", prompt: EXAMPLE_PROMPTS[0].prompt },
  { img: "uc-couple", title: "결혼 앞둔 두 사람의 비교",
    line: "돈·출근·확인할 것을 나란히", prompt: EXAMPLE_PROMPTS[1].prompt },
  { img: "uc-night", title: "밤 귀갓길이 걱정될 때",
    line: "기록에서 밤 10시 이후 귀가만 꺼내요", prompt: NIGHT_PROMPT },
  { img: "uc-neighbourhood", title: "동네를 한눈에",
    line: "역·마트까지 걸어서 몇 분인지 지도로 봐요", prompt: HOOD_PROMPT },
];

const STEPS = [
  { t: "말로 물어봐요", d: "출근지·예산·같이 사는 사람을 한 문장으로" },
  { t: "Muse가 확인해요", d: "실거래·출근길을 직접 찾아보고 ▸ 줄로 남겨요" },
  { t: "요청하면 보여 줘요", d: "지도·동네·비교는 말할 때만 열려요" },
  { t: "30일 살아 보고 전해요", d: "일기 문장은 모두 기록과 대조해요" },
];

const FAQ = [
  { q: "가격이 오를까요?",
    a: "오름·내림은 말하지 않아요. 대신 고객님이 고른 가정(−2/0/+2%씩 매년)으로 나란히 견줘 보여요." },
  { q: "어디가 제일 좋아요?",
    a: "순위는 정해 주지 않아요. 고객님 기준 비중으로 정렬한 내 기준 점수만 보여주고, 고르는 건 고객님 몫이에요." },
  { q: "이 전세 안전한가요?",
    a: "안전 판정은 하지 않아요. 보증금 비율 같은 공개 신호, 확인할 것 목록, 모의 손실 시나리오를 드려요." },
  { q: "지원금은 받을 수 있나요?",
    a: "합격 판정은 하지 않아요. 고객님 조건과 공고 조건을 항목별로 대조해 보여줘요(기준일·공식 링크 포함)." },
  { q: "밤길은 안전한가요?",
    a: "점수는 매기지 않아요. 공식 통계(출처·기간·단위·지역 단위)와 밤 귀갓길 기록을 보여줘요." },
  { q: "일기는 진짜예요?",
    a: "가상 주민(모의) 일기예요. ✓ 문장 8개 모두 기록과 대조처럼 근거 검사를 통과한 문장만 보여줘요." },
];

const DATA_NAMES = ["국토교통부 실거래가", "OpenStreetMap", "서울교통공사 혼잡도", "GIS건물통합정보"];

// Image slots: the <img> keeps the frame honest until the orchestrator
// adds the file; on error it hides and the empty frame stays.
function Shot({ name, product }) {
  const [ok, setOk] = useState(true);
  return (
    <figure className={product ? "ds-lp-shot ds-lp-shot--product" : "ds-lp-shot"}>
      {ok ? (
        <img src={assetUrl(`landing/${name}.png`)} alt="" onError={() => setOk(false)} />
      ) : null}
    </figure>
  );
}

function ExampleRow({ title, prompt }) {
  const [copied, setCopied] = useState(false);
  const copy = async () => {
    try {
      await navigator.clipboard.writeText(prompt);
      setCopied(true);
      setTimeout(() => setCopied(false), 1500);
    } catch {
      /* clipboard unavailable — the button keeps reading 복사 */
    }
  };
  return (
    <li className="ds-lp-exrow">
      <div className="ds-lp-extext">
        <p className="ds-lp-extitle">{title}</p>
        <p className="ds-lp-exprompt">{prompt}</p>
      </div>
      <button type="button" className="ds-lp-btn ds-lp-btn--ghost ds-lp-btn--sm" onClick={copy}>
        {copied ? "복사했어요" : "복사"}
      </button>
      <button
        type="button"
        className="ds-lp-btn ds-lp-btn--secondary ds-lp-btn--sm"
        onClick={() => { window.location.href = chatUrl(prompt); }}>
        물어보기
      </button>
    </li>
  );
}

export function LandingPage() {
  const [value, setValue] = useState("");
  const submit = (text) => {
    const content = String(text || "").trim();
    if (!content) return;
    window.location.href = chatUrl(content);
  };
  return (
    <div className="ds-lp">
      <nav className="ds-lp-nav">
        <div className="ds-lp-nav-inner">
          <span className="ds-lp-brand">Ithaca</span>
          <div className="ds-lp-links">
            <a href="#features">기능</a>
            <a href="#living">살아 보기</a>
            <a href="#data">데이터</a>
            <a href="#faq">질문</a>
          </div>
          <div className="ds-lp-nav-right">
            <PoweredByMuse size="sm" />
            <LangToggle />
            <a className="ds-lp-pill" href={appEntryUrl()}>시작하기</a>
          </div>
        </div>
      </nav>
      <div className="ds-lp-notice">{NOTICE}</div>

      <div className="ds-lp-heroband">
      <header className="ds-lp-hero">
        <h1 className="ds-lp-title">어떤 집을 고민 중이세요?</h1>
        <p className="ds-lp-lede">Muse가 직접 확인하고, 대신 30일 살아 보고, 대화로 알려 줘요.</p>
        <div className="ds-lp-composer">
          <ChatComposer
            onSubmit={submit}
            value={value}
            onChange={setValue}
            placeholder={HERO_PLACEHOLDER}
          />
        </div>
        <div className="ds-lp-chips">
          <button type="button" className="ds-lp-chip" onClick={() => setValue(COMPOSER_FILL)}>
            출근지로 집 찾기
          </button>
          <button
            type="button"
            className="ds-lp-chip"
            onClick={() => { window.location.href = appEntryUrl(); }}>
            본 매물 붙여 넣기
          </button>
          <button
            type="button"
            className="ds-lp-chip"
            onClick={() => { window.location.href = chatUrl(EXAMPLE_PROMPTS[0].prompt); }}>
            예시로 써 보기
          </button>
        </div>
        <div className="ds-lp-judge">
          <a className="ds-lp-btn ds-lp-btn--primary" href={replayEntryUrl(currentLang())}>기록된 한 달 보기</a>
          <a className="ds-lp-btn ds-lp-btn--secondary" href={chatUrl(META_HQ_PROMPT)}>Meta 본사 출근으로 해 보기</a>
        </div>
        <p className="ds-lp-replaynote">기록 재생은 키 없이 돼요. 직접 해 보기는 Muse에 실시간으로 물어요(하루 한도 있음).</p>
        <div className="ds-lp-proof">
          {PROOFS.map((p) => (
            <span key={p.num} className="ds-lp-prooffact">
              <b>{p.num}</b>
              <span>{p.rest}</span>
            </span>
          ))}
        </div>
        <PoweredByMuse size="md" />
        <p className="ds-lp-cover">{COVERAGE_LINE}</p>
      </header>
      </div>

      <section className="ds-lp-band ds-lp-band--sunken" id="features">
        <div className="ds-lp-section">
          <p className="ds-lp-eyebrow">기능</p>
          <h2 className="ds-lp-h">Muse가 하는 일</h2>
          <p className="ds-lp-sub">말하면 Muse가 도구를 골라 쓰고, 한 일은 모두 대화에 남아요.</p>
          <div className="ds-lp-window">
            <div className="ds-lp-winbar" aria-hidden="true"><i /><i /><i /></div>
            <Shot name="product" product />
            <span className="ds-lp-callout ds-lp-callout--left">▸ 실거래 확인 · 출근 계산</span>
            <span className="ds-lp-callout ds-lp-callout--right">✓ 문장 8개 모두 기록과 대조</span>
          </div>
          <div className="ds-lp-cols3">
            {COLUMNS.map((c) => (
              <div key={c.t} className="ds-lp-col">
                <span className="ds-lp-colnum" aria-hidden="true">{c.n}</span>
                <h3>{c.t}</h3>
                <p>{c.d}</p>
              </div>
            ))}
          </div>
        </div>
      </section>

      <section className="ds-lp-band" aria-label="비교">
        <div className="ds-lp-section ds-lp-center">
          <p className="ds-lp-eyebrow">비교</p>
          <h2 className="ds-lp-h">직접 찾기·챗봇과 무엇이 다른가요</h2>
          <p className="ds-lp-sub">기억이나 추측이 아니라 기록으로 견줘요.</p>
          <div className="ds-lp-tablewrap">
            <table className="ds-lp-table">
              <thead>
                <tr>
                  <th scope="col"><span className="ds-lp-thhide">항목</span></th>
                  <th scope="col">직접 정리</th>
                  <th scope="col">일반 챗봇</th>
                  <th scope="col" className="ds-lp-col-ithaca">
                    <span className="ds-lp-ithacahead">
                      <img src={assetUrl(MUSE_LOGO_PATH)} alt="" width={16} height={16} />
                      Ithaca
                    </span>
                  </th>
                </tr>
              </thead>
              <tbody>
                {TABLE_ROWS.map((r) => (
                  <tr key={r.k}>
                    <th scope="row">{r.k}</th>
                    <td data-label="직접 정리">{r.a}</td>
                    <td data-label="일반 챗봇">{r.b}</td>
                    <td data-label="Ithaca" className="ds-lp-col-ithaca">{r.c}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </div>
      </section>

      <section className="ds-lp-band ds-lp-band--surface">
        <div className="ds-lp-section">
          <p className="ds-lp-eyebrow">문제</p>
          <h2 className="ds-lp-h">집 고를 때 진짜 막막한 것들</h2>
          <p className="ds-lp-sub">살아 보기 전엔 알 수 없는 것, 발로 뛰어야 아는 것을 보여줘요.</p>
          <div className="ds-lp-numcards">
            {NUMBERS.map((n) => (
              <div key={n.big} className="ds-lp-numcard">
                <p className="ds-lp-num">{n.big}</p>
                <p className="ds-lp-numsub">{n.small}</p>
              </div>
            ))}
          </div>
        </div>
      </section>

      <section className="ds-lp-band" id="living">
        <div className="ds-lp-section">
          <p className="ds-lp-eyebrow">쓰임</p>
          <h2 className="ds-lp-h">이럴 때 써요</h2>
          <p className="ds-lp-sub">고민에 맞는 말을 고르면 대화가 바로 시작돼요.</p>
          <div className="ds-lp-grid2">
            {USE_CASES.map((u) => (
              <button
                key={u.img}
                type="button"
                className="ds-lp-card"
                onClick={() => { window.location.href = chatUrl(u.prompt); }}>
                <span className="ds-lp-well">
                  <Shot name={u.img} />
                </span>
                <span className="ds-lp-cardtitle">{u.title}</span>
                <span className="ds-lp-cardline">{u.line}</span>
                <span className="ds-lp-ask">물어보기 →</span>
              </button>
            ))}
          </div>
        </div>
      </section>

      <section className="ds-lp-band ds-lp-band--surface" aria-label="동작 순서">
        <div className="ds-lp-section ds-lp-center">
          <p className="ds-lp-eyebrow">순서</p>
          <h2 className="ds-lp-h">이렇게 움직여요</h2>
          <p className="ds-lp-sub">말 한마디면 Muse가 움직여요.</p>
          <ol className="ds-lp-steps">
            {STEPS.map((s, i) => (
              <li key={s.t} className="ds-lp-step">
                <span className="ds-lp-stepnum" aria-hidden="true">{i + 1}</span>
                <span>
                  <span className="ds-lp-steptitle">{s.t}</span>
                  <span className="ds-lp-stepline">{s.d}</span>
                </span>
              </li>
            ))}
          </ol>
        </div>
      </section>

      <section className="ds-lp-band" aria-label="예시 프롬프트">
        <div className="ds-lp-section">
          <p className="ds-lp-eyebrow">예시</p>
          <h2 className="ds-lp-h">이렇게 물어보세요</h2>
          <p className="ds-lp-sub">누르면 바로 대화가 시작돼요.</p>
          <ul className="ds-lp-examples">
            {EXAMPLE_PROMPTS.map((p) => (
              <ExampleRow key={p.id} title={p.title} prompt={p.prompt} />
            ))}
          </ul>
        </div>
      </section>

      <section className="ds-lp-band ds-lp-band--surface ds-lp-faq" id="faq">
        <div className="ds-lp-section ds-lp-center">
          <p className="ds-lp-eyebrow">질문</p>
          <h2 className="ds-lp-h">자주 묻는 질문</h2>
          <p className="ds-lp-sub">판정 대신 공개 자료로 답해요.</p>
          <div className="ds-lp-faqcol">
            {FAQ.map((f) => (
              <details key={f.q}>
                <summary>{f.q}</summary>
                <p>{f.a}</p>
              </details>
            ))}
          </div>
        </div>
      </section>

      <section className="ds-lp-band" id="data">
        <div className="ds-lp-section">
          <p className="ds-lp-eyebrow">데이터</p>
          <h2 className="ds-lp-h">쓰는 데이터</h2>
          <p className="ds-lp-sub">숫자는 모두 공개 자료에서 세요. 출처와 기간을 화면에 함께 적어요.</p>
          <ul className="ds-lp-datanames">
            {DATA_NAMES.map((n) => (
              <li key={n}>{n}</li>
            ))}
          </ul>
          <details className="ds-lp-details">
            <summary>자세히</summary>
            <ul>
              {SOURCES_DETAIL.map((s) => (
                <li key={s}>{s}</li>
              ))}
            </ul>
          </details>
        </div>
      </section>

      <section className="ds-lp-cta">
        <div className="ds-lp-section ds-lp-center">
          <p className="ds-lp-eyebrow ds-lp-eyebrow--dark">시작</p>
          <h2 className="ds-lp-ctatitle">먼저 한 문장만 물어보세요.</h2>
          <p className="ds-lp-ctaline">한 문장이면 Muse가 나머지를 확인해요.</p>
          <a className="ds-lp-ctapill" href={appEntryUrl()}>대화로 시작하기</a>
        </div>
      </section>

      <footer className="ds-lp-foot">
        <div className="ds-lp-foot-inner">
          <div className="ds-lp-foot-brand">
            <span>Ithaca</span>
            <p>We walk the odyssey. You just come home.</p>
          </div>
          <nav className="ds-lp-foot-links" aria-label="랜딩 이동">
            <a href="#features">기능</a>
            <a href="#living">살아 보기</a>
            <a href="#data">데이터</a>
            <a href="#faq">질문</a>
            <a href="https://github.com/halo-sw/ithaca">GitHub</a>
          </nav>
          <div className="ds-lp-foot-meta">
            <PoweredByMuse size="sm" />
            <span>MIT</span>
            <span>© 2026</span>
          </div>
        </div>
      </footer>
    </div>
  );
}
