import express from "express";
import Anthropic from "@anthropic-ai/sdk";
import path from "node:path";
import fs from "node:fs";
import { fileURLToPath } from "node:url";

const here = path.dirname(fileURLToPath(import.meta.url));

// .env 파일이 있으면 읽어 옵니다 (ANTHROPIC_API_KEY, PORT)
const envPath = path.join(here, ".env");
if (fs.existsSync(envPath)) process.loadEnvFile(envPath);

const PORT = Number(process.env.PORT) || 3300;
const MODEL = "claude-opus-5-5";

// 프롬프트 파일 위치: start.bat 이 구글 드라이브 원본 폴더를 PROMPT_DIR 로 알려 줍니다.
// 그래서 드라이브의 프롬프트 .txt 를 고치면 서버를 다시 켜지 않아도 다음 글부터 바로 반영됩니다.
const PROMPT_DIR =
  process.env.PROMPT_DIR && fs.existsSync(process.env.PROMPT_DIR)
    ? process.env.PROMPT_DIR
    : path.join(here, "prompts");
const BLOG_PROMPT_FILE = "블로그포스팅 프롬프트.txt";
const LISTING_PROMPT_FILE = "부동산 매물정리 프롬프트.txt";

const readPrompt = (name) => fs.readFileSync(path.join(PROMPT_DIR, name), "utf8").trim();

const app = express();
app.use(express.json({ limit: "2mb" }));
app.use(express.static(path.join(here, "public")));

// 자동화 프로그램이 결과를 읽을 수 있도록, 사용자 프롬프트 뒤에 붙이는 출력 형식 규칙
const OUTPUT_RULES = `━━━━━━━━━━━━━━━━━━
[출력 형식 – 자동화 프로그램이 읽습니다. 반드시 지키세요]

최종 답변은 아래 태그만 순서대로 씁니다. 태그 밖에는 아무것도 쓰지 않습니다.
웹 검색을 하는 동안에도 "검색해 보겠습니다" 같은 설명 문장은 쓰지 않습니다.

<title>SEO에 최적화된 제목 한 줄</title>
<meta>메타 설명 (160자 이내)</meta>
<body>
본문 HTML. 쓸 수 있는 태그: h2, h3, p, strong, em, u, ul, ol, li, blockquote, hr, br, table, thead, tbody, tr, th, td, a
- style, class, script, 마크다운 문법(#, **, -)은 쓰지 않습니다. 제목·메타 설명은 본문에 다시 쓰지 않습니다.
- 프롬프트의 구조(도입부 → 목차(ol) → 소제목 3개 이상의 본문 → 실행 팁/단계별 가이드 → 결론과 생각할 거리 → CTA)를 본문 안에 담습니다.
- 이미지가 들어갈 자리에는 그 자리에 단독 문단으로 <p>[[IMG:번호]]</p> 를 넣습니다. 번호는 1부터, <images> 의 id 와 같아야 합니다.
  이미지는 4~7장. 1번은 대표 이미지(cover)이고 본문 맨 앞에 둡니다. 나머지는 그 문단 내용을 정리한 그림이 되도록 내용 바로 뒤에 둡니다.
- 외부 링크는 웹 검색으로 실제 확인한 출처만 <a href="URL">출처명</a> 으로 넣습니다. 확인하지 못한 링크·통계는 쓰지 않습니다.
- 이 글은 그대로 발행됩니다. 빈칸, 대괄호 안내 문구([…]), "여기에 ○○를 쓰세요" 같은 작성자용 메모를 절대 넣지 않습니다.
  내부 링크 제안도 본문에 넣지 않습니다.
- 경험 부분은 '작성자 경험 메모'가 있으면 그것을 중심으로 씁니다. 메모가 없거나 부족하면 공인중개사의 실무 지식으로 채웁니다:
  상담·계약 현장에서 자주 생기는 상황, 손님들이 자주 묻는 질문, 실수하기 쉬운 지점, 확인 순서와 요령을
  "현장에서 자주 보는 경우는…", "예를 들어 보증금 3억 원이라면…" 처럼 구체적인 수치 예시와 함께 씁니다.
  단, 특정 날짜·특정 손님·특정 거래를 실제로 있었던 일처럼 지어내지는 않습니다.
- 경제적 이해관계 표시는 요청의 '표시 문구'를 따릅니다.
</body>
<tags>태그 10~15개, 쉼표로 구분, # 없이</tags>
<images>
JSON 배열만 씁니다. 각 원소 공통 필드:
{"id":1, "kind":"cover|stats|bar|steps|compare|checklist|tip|photo", "title":"이미지 제목(18자 이내)", "alt":"대체 텍스트", "caption":"이미지 아래 들어갈 설명 한 문장"}
kind 별 추가 필드:
- cover: "subtitle":"부제(25자 이내)", "query":"배경 사진 검색어(영어 2~4단어, 예: seoul apartment complex)"
- stats: "items":[{"label":"","value":"","note":""}] 2~4개 — 출처가 확인됐거나 사용자가 준 숫자만
- bar: "unit":"단위", "items":[{"label":"","value":숫자}] 3~8개 — 출처가 확인됐거나 사용자가 준 수치만
- steps: "items":[{"label":"","desc":""}] 3~6개
- compare: "columns":["구분","A","B"], "rows":[["","",""]] 3~6행 (열 2~4개)
- checklist: "items":["",""] 3~8개
- tip: "text":"핵심 한두 문장"
- photo: "query":"무료 사진 검색어(영어 2~4단어, 예: house keys handover, apartment living room)" — 분위기·상황을 보여 줄 실제 사진 자리. 1~2장.
  특정 단지·특정 매물처럼 검색으로 찾을 수 없는 사진이 아니라, 누구나 쓸 수 있는 일반적인 장면을 고릅니다.
이미지 안 글자는 짧게 씁니다. 이미지로 보여 주는 핵심 내용은 본문 텍스트에도 반드시 씁니다.
</images>
<check>
JSON 배열만 씁니다. 완성된 글을 (10)·(11) 기준으로 점검한 결과 5개:
[{"item":"독자 및 목적","ok":true,"note":"한 줄 설명"},{"item":"절차 및 구체적 해결 과정",...},{"item":"대안 및 비교 분석",...},{"item":"실제 적용 사례 및 결과",...},{"item":"맥락에 맞는 이미지와 동영상",...}]
기준에 부족한 점이 있으면 글을 먼저 고쳐서 채운 뒤 점검 결과를 씁니다. 그래도 남는 한계가 있으면 ok 를 false 로 하고 note 에 씁니다.
</check>`;

const TONES = {
  expert: "신뢰감 있는 현장 전문가 말투 (~합니다체, 근거 중심)",
  friendly: "동네 중개사가 설명하듯 친근한 말투 (~해요체)",
  review: "직접 겪은 과정을 들려주는 후기 말투 (~했어요체, 장단점 솔직하게)",
};
const LENGTHS = {
  short: "공백 포함 약 2,000자",
  medium: "공백 포함 약 3,500자",
  long: "공백 포함 약 5,000자 이상",
};
const DISCLOSURES = {
  none: "경제적 대가 없음 — 별도 표시 문구 없이, 필요하면 '직접 중개·상담한 경험을 바탕으로 썼다'는 점만 밝힘",
  own: "글 맨 앞에 '내돈내산' 표시",
  sponsored: "글 맨 앞에 '업체로부터 지원을 받아 작성했습니다' 표시",
};

function officeBlock(office = {}) {
  const name = (office.name || "").trim();
  if (!name) return "";
  const parts = [name, office.phone, office.address].map((v) => (v || "").trim()).filter(Boolean);
  return `\n\n[블로그 운영자]\n이 블로그는 ${parts.join(" / ")} 에서 운영합니다. 글쓴이는 이 사무소의 공인중개사입니다.\nCTA에서 상담 연락처를 한 번만 자연스럽게 안내하고, 본문 곳곳에 홍보 문구를 넣지 않습니다.`;
}

function buildUserPrompt(b) {
  const today = new Date().toLocaleDateString("ko-KR", { timeZone: "Asia/Seoul", year: "numeric", month: "long", day: "numeric" });
  const lines = [`입력된 주제: ${b.topic}`, `오늘 날짜: ${today}`];
  if (b.keywords) lines.push(`핵심 키워드: ${b.keywords}`);
  if (b.audience) lines.push(`독자와 상황(TPO): ${b.audience}`);
  lines.push(`말투: ${TONES[b.tone] ?? TONES.expert}`);
  lines.push(`분량: ${LENGTHS[b.length] ?? LENGTHS.medium}`);
  lines.push(`표시 문구: ${DISCLOSURES[b.disclosure] ?? DISCLOSURES.none}`);
  lines.push("", "작성자 경험 메모:");
  lines.push(b.experience || "(없음 — 공인중개사 실무 지식과 현장에서 흔한 상황·수치 예시로 빈칸 없이 완성)");
  if (b.listings) lines.push("", "참고할 매물 자료 (이 자료에 있는 사실만 사용):", b.listings);
  if (b.extra) lines.push("", `추가 요청: ${b.extra}`);
  lines.push("", b.webSearch
    ? "필요한 통계·제도·최신 동향은 웹 검색으로 공식 기관이나 신뢰할 수 있는 출처를 확인한 뒤 인용하세요."
    : "웹 검색은 쓰지 않습니다. 확인할 수 없는 통계·날짜는 쓰지 말고 필요한 곳에는 '(확인 필요)'라고 표시하세요.");
  lines.push("위 조건으로 블로그 포스팅을 정해진 출력 형식대로 작성하세요.");
  return lines.join("\n");
}

function apiKeyFrom(req) {
  return req.get("x-api-key") || process.env.ANTHROPIC_API_KEY || "";
}

app.get("/api/status", (_req, res) => {
  let promptsOk = true;
  try {
    readPrompt(BLOG_PROMPT_FILE);
    readPrompt(LISTING_PROMPT_FILE);
  } catch {
    promptsOk = false;
  }
  res.json({ serverKey: Boolean(process.env.ANTHROPIC_API_KEY), model: MODEL, promptDir: PROMPT_DIR, promptsOk });
});

app.post("/api/generate", async (req, res) => {
  const b = req.body ?? {};
  const clean = (v) => (typeof v === "string" ? v.trim() : "");
  const input = {
    topic: clean(b.topic),
    keywords: clean(b.keywords),
    audience: clean(b.audience),
    experience: clean(b.experience),
    listings: clean(b.listings),
    extra: clean(b.extra),
    tone: b.tone,
    length: b.length,
    disclosure: b.disclosure,
    webSearch: b.webSearch !== false,
  };
  if (!input.topic) return res.status(400).json({ error: "주제를 입력해 주세요." });

  const apiKey = apiKeyFrom(req);
  if (!apiKey) return res.status(400).json({ error: "API 키가 없습니다. 왼쪽 '설정'에서 Anthropic API 키를 넣어 주세요." });

  let system;
  try {
    system = `${readPrompt(BLOG_PROMPT_FILE)}${officeBlock(b.office)}\n\n${OUTPUT_RULES}`;
  } catch {
    return res.status(500).json({ error: `프롬프트 파일을 찾을 수 없습니다: ${path.join(PROMPT_DIR, BLOG_PROMPT_FILE)}` });
  }

  res.writeHead(200, {
    "Content-Type": "text/event-stream; charset=utf-8",
    "Cache-Control": "no-cache",
    Connection: "keep-alive",
  });
  const send = (event, data) => res.write(`event: ${event}\ndata: ${JSON.stringify(data)}\n\n`);

  const client = new Anthropic({ apiKey });
  const tools = input.webSearch
    ? [{ type: "web_search_20260209", name: "web_search", max_uses: 6 }]
    : undefined;

  let current = null;
  let closed = false;
  res.on("close", () => {
    closed = true;
    current?.abort();
  });

  const messages = [{ role: "user", content: buildUserPrompt(input) }];
  const sources = new Map();
  let searches = 0;

  try {
    let message;
    // 웹 검색이 길어지면 API가 pause_turn 으로 잠깐 멈추므로, 이어서 쓰도록 다시 보냅니다.
    for (let round = 0; round < 4 && !closed; round++) {
      current = client.beta.messages.stream({
        model: MODEL,
        max_tokens: 64000,
        betas: ["server-side-fallback-2026-07-01"],
        fallbacks: "default",
        thinking: { type: "adaptive" },
        output_config: { effort: "medium" },
        system,
        messages,
        ...(tools ? { tools } : {}),
      });
      current.on("text", (delta) => send("delta", delta));
      current.on("contentBlock", (block) => {
        if (block.type === "server_tool_use" && block.name === "web_search") {
          searches += 1;
          send("status", { text: `자료 검색 중: ${block.input?.query ?? ""}`, searches });
        }
      });

      message = await current.finalMessage();
      for (const block of message.content) {
        if (block.type !== "text" || !block.citations) continue;
        for (const c of block.citations) {
          if (c.url && !sources.has(c.url)) sources.set(c.url, c.title || c.url);
        }
      }
      if (message.stop_reason !== "pause_turn") break;
      messages.push({ role: "assistant", content: message.content });
    }

    if (closed) return;
    if (message?.stop_reason === "refusal") {
      send("error", { error: "이 주제는 작성이 거절되었습니다. 주제를 바꿔서 다시 시도해 주세요." });
    } else {
      send("done", {
        stop_reason: message?.stop_reason,
        model: message?.model,
        searches,
        sources: [...sources].map(([url, title]) => ({ url, title })),
      });
    }
  } catch (err) {
    if (!res.writableEnded && !closed) send("error", { error: describeError(err) });
  } finally {
    res.end();
  }
});

app.post("/api/listings", async (req, res) => {
  const text = typeof req.body?.text === "string" ? req.body.text.trim() : "";
  if (!text) return res.status(400).json({ error: "매물 텍스트를 붙여 넣어 주세요." });
  const apiKey = apiKeyFrom(req);
  if (!apiKey) return res.status(400).json({ error: "API 키가 없습니다. 왼쪽 '설정'에서 Anthropic API 키를 넣어 주세요." });

  let system;
  try {
    system = readPrompt(LISTING_PROMPT_FILE);
  } catch {
    return res.status(500).json({ error: `프롬프트 파일을 찾을 수 없습니다: ${path.join(PROMPT_DIR, LISTING_PROMPT_FILE)}` });
  }

  const client = new Anthropic({ apiKey });
  const stream = client.beta.messages.stream({
    model: MODEL,
    max_tokens: 32000,
    betas: ["server-side-fallback-2026-07-01"],
    fallbacks: "default",
    thinking: { type: "adaptive" },
    output_config: { effort: "medium" },
    system,
    messages: [{ role: "user", content: `[부동산 매물 텍스트]\n${text}` }],
  });
  res.on("close", () => stream.abort());

  try {
    const message = await stream.finalMessage();
    if (message.stop_reason === "refusal") return res.status(422).json({ error: "요청이 거절되었습니다. 텍스트를 확인해 주세요." });
    const markdown = message.content.filter((b) => b.type === "text").map((b) => b.text).join("").trim();
    res.json({ markdown, stop_reason: message.stop_reason });
  } catch (err) {
    if (!res.headersSent) res.status(500).json({ error: describeError(err) });
  }
});

// ── 무료 사진 찾기 ──
// Pexels 키가 있으면 Pexels(고화질, 출처 표기 불필요), 없으면 Openverse(상업적 이용·수정 허용 CC 라이선스, 출처 표기 필요)
const UA = "MedinetBlogStudio/1.0 (local blog tool)";
const IMG_HOSTS = [/^images\.pexels\.com$/, /^api\.openverse\.org$/, /^upload\.wikimedia\.org$/, /^(live|farm\d+)\.staticflickr\.com$/];
const okHost = (u) => {
  try {
    const url = new URL(u);
    return url.protocol === "https:" && IMG_HOSTS.some((re) => re.test(url.hostname));
  } catch {
    return false;
  }
};
const LICENSE_NAMES = { by: "CC BY", "by-sa": "CC BY-SA", cc0: "CC0", pdm: "퍼블릭 도메인" };

async function searchPexels(q, key) {
  const r = await fetch(`https://api.pexels.com/v1/search?query=${encodeURIComponent(q)}&per_page=8&orientation=landscape`, {
    headers: { Authorization: key, "User-Agent": UA },
    signal: AbortSignal.timeout(15000),
  });
  if (!r.ok) throw new Error(`Pexels ${r.status}`);
  const j = await r.json();
  return (j.photos || []).map((p) => ({
    src: p.src?.large2x || p.src?.large,
    credit: `사진: ${p.photographer} / Pexels`,
    link: p.url,
  }));
}

async function searchOpenverse(q) {
  const r = await fetch(
    `https://api.openverse.org/v1/images/?q=${encodeURIComponent(q)}&license_type=commercial,modification&page_size=20&aspect_ratio=wide&mature=false`,
    { headers: { "User-Agent": UA }, signal: AbortSignal.timeout(15000) }
  );
  if (!r.ok) throw new Error(`Openverse ${r.status}`);
  const j = await r.json();
  return (j.results || [])
    .filter((p) => p.url && (p.width || 0) >= 480)
    .sort((a, b) => (b.width || 0) - (a.width || 0))
    .slice(0, 8)
    .map((p) => {
      // 플리커 기본 주소는 500px 이라 1024px(_b) 주소를 먼저 시도합니다
      let big = null;
      if (/staticflickr\.com\/.+\/\d+_[0-9a-f]+\.jpg$/.test(p.url)) big = p.url.replace(/\.jpg$/, "_b.jpg");
      // 위키미디어 원본은 수십 MB 일 수 있어 1280px 축소본을 씁니다
      const wm = p.url.match(/^https:\/\/upload\.wikimedia\.org\/wikipedia\/commons\/([0-9a-f])\/([0-9a-f]{2})\/([^/]+\.(?:jpe?g|png))$/i);
      if (wm && (p.width || 0) > 1280) big = `https://upload.wikimedia.org/wikipedia/commons/thumb/${wm[1]}/${wm[2]}/${wm[3]}/1280px-${wm[3]}`;
      const lic = `${LICENSE_NAMES[p.license] || (p.license || "").toUpperCase()} ${p.license_version || ""}`.trim();
      const site = { flickr: "Flickr", wikimedia: "Wikimedia Commons" }[p.provider] || p.source || p.provider;
      return {
        src: big || p.url,
        fallback: p.thumbnail,
        alt: p.url,
        credit: `사진: ${p.creator || "작가 미상"} / ${site} (${lic})`,
        link: p.foreign_landing_url,
      };
    });
}

app.get("/api/photos", async (req, res) => {
  const q = String(req.query.q || "").trim().slice(0, 80);
  if (!q) return res.status(400).json({ error: "검색어가 없습니다." });
  const pexelsKey = req.get("x-pexels-key") || process.env.PEXELS_API_KEY;
  try {
    let photos = [];
    if (pexelsKey) photos = await searchPexels(q, pexelsKey).catch(() => []);
    if (!photos.length) photos = await searchOpenverse(q);
    res.json({ photos: photos.map((p) => ({ ...p, srcs: [p.src, p.alt, p.fallback].filter((u) => u && okHost(u)) })).filter((p) => p.srcs.length) });
  } catch (err) {
    res.status(502).json({ error: `사진 검색 실패: ${err.message}` });
  }
});

// 외부 사진을 같은 주소로 받아 와야 로고를 합성해 저장할 수 있습니다 (허용된 사진 사이트만)
app.get("/api/img", async (req, res) => {
  const u = String(req.query.u || "");
  if (!okHost(u)) return res.status(400).end();
  try {
    const r = await fetch(u, { headers: { "User-Agent": UA }, signal: AbortSignal.timeout(20000) });
    const type = r.headers.get("content-type") || "";
    if (!r.ok || !okHost(r.url) || !type.startsWith("image/")) return res.status(502).end();
    const buf = Buffer.from(await r.arrayBuffer());
    if (buf.length > 25 * 1024 * 1024) return res.status(413).end();
    res.set({ "Content-Type": type, "Cache-Control": "max-age=86400" }).send(buf);
  } catch {
    res.status(502).end();
  }
});

function describeError(err) {
  if (err instanceof Anthropic.AuthenticationError) return "API 키가 올바르지 않습니다. 설정에서 키를 확인해 주세요.";
  if (err instanceof Anthropic.PermissionDeniedError) return "이 API 키로는 해당 모델이나 웹 검색을 사용할 권한이 없습니다. (웹 검색을 끄고 다시 시도해 보세요)";
  if (err instanceof Anthropic.RateLimitError) return "요청이 너무 많습니다. 잠시 후 다시 시도해 주세요.";
  if (err instanceof Anthropic.APIConnectionError) return "Anthropic 서버에 연결할 수 없습니다. 인터넷 연결을 확인해 주세요.";
  if (err instanceof Anthropic.APIUserAbortError) return "생성이 중단되었습니다.";
  if (err instanceof Anthropic.BadRequestError) return `요청 오류: ${err.message} (웹 검색을 끄고 다시 시도해 보세요)`;
  if (err instanceof Anthropic.APIError) return `API 오류 (${err.status ?? "?"}): ${err.message}`;
  return `알 수 없는 오류: ${err?.message ?? err}`;
}

app.listen(PORT, () => {
  console.log(`메디넷 부동산 블로그 스튜디오 실행 중 → http://localhost:${PORT}`);
  console.log(`프롬프트 폴더: ${PROMPT_DIR}`);
  if (!process.env.ANTHROPIC_API_KEY) console.log("(.env 에 API 키가 없습니다. 웹 화면의 '설정'에서 키를 입력해도 됩니다.)");
});
