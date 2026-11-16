import express from "express";
import Anthropic from "@anthropic-ai/sdk";
import path from "node:path";
import fs from "node:fs";
import { fileURLToPath } from "node:url";
import "./public/shared.js"; // 글쓰기 규칙·AI 호출·사진 검색 (브라우저 모드와 같은 파일)

const S = globalThis.MedinetShared;
const here = path.dirname(fileURLToPath(import.meta.url));

// .env 파일이 있으면 읽어 옵니다 (ANTHROPIC_API_KEY, PEXELS_API_KEY, PORT)
const envPath = path.join(here, ".env");
if (fs.existsSync(envPath)) process.loadEnvFile(envPath);

const PORT = Number(process.env.PORT) || 3300;

// 프롬프트 파일 위치: start.bat 이 구글 드라이브 원본 폴더를 PROMPT_DIR 로 알려 줍니다.
// 그래서 드라이브의 프롬프트 .txt 를 고치면 서버를 다시 켜지 않아도 다음 글부터 바로 반영됩니다.
const PROMPT_DIR =
  process.env.PROMPT_DIR && fs.existsSync(process.env.PROMPT_DIR)
    ? process.env.PROMPT_DIR
    : path.join(here, "prompts");
const readPrompt = (name) => fs.readFileSync(path.join(PROMPT_DIR, name), "utf8");

const app = express();
app.use(express.json({ limit: "2mb" }));
app.use(express.static(path.join(here, "public")));

const apiKeyFrom = (req) => req.get("x-api-key") || process.env.ANTHROPIC_API_KEY || "";
const NO_KEY = "API 키가 없습니다. 왼쪽 '설정'에서 Anthropic API 키를 넣어 주세요.";

app.get("/api/status", (_req, res) => {
  let promptsOk = true;
  try {
    readPrompt(S.BLOG_PROMPT_FILE);
    readPrompt(S.LISTING_PROMPT_FILE);
  } catch {
    promptsOk = false;
  }
  res.json({ serverKey: Boolean(process.env.ANTHROPIC_API_KEY), model: S.MODEL, promptDir: PROMPT_DIR, promptsOk });
});

app.post("/api/generate", async (req, res) => {
  const input = S.cleanInput(req.body);
  if (!input.topic) return res.status(400).json({ error: "주제를 입력해 주세요." });
  const apiKey = apiKeyFrom(req);
  if (!apiKey) return res.status(400).json({ error: NO_KEY });

  let system;
  try {
    system = S.blogSystem(readPrompt(S.BLOG_PROMPT_FILE), req.body?.office);
  } catch {
    return res.status(500).json({ error: `프롬프트 파일을 찾을 수 없습니다: ${path.join(PROMPT_DIR, S.BLOG_PROMPT_FILE)}` });
  }

  res.writeHead(200, {
    "Content-Type": "text/event-stream; charset=utf-8",
    "Cache-Control": "no-cache",
    Connection: "keep-alive",
  });
  const send = (event, data) => res.write(`event: ${event}\ndata: ${JSON.stringify(data)}\n\n`);
  const ctrl = new AbortController();
  res.on("close", () => ctrl.abort());

  try {
    const result = await S.runBlog({
      client: new Anthropic({ apiKey }),
      system,
      input,
      signal: ctrl.signal,
      on: { delta: (d) => send("delta", d), status: (s) => send("status", s) },
    });
    if (ctrl.signal.aborted) return;
    if (result.stop_reason === "refusal") send("error", { error: "이 주제는 작성이 거절되었습니다. 주제를 바꿔서 다시 시도해 주세요." });
    else send("done", result);
  } catch (err) {
    if (!res.writableEnded && !ctrl.signal.aborted) send("error", { error: S.describeError(err, Anthropic) });
  } finally {
    res.end();
  }
});

app.post("/api/listings", async (req, res) => {
  const text = typeof req.body?.text === "string" ? req.body.text.trim() : "";
  if (!text) return res.status(400).json({ error: "매물 텍스트를 붙여 넣어 주세요." });
  const apiKey = apiKeyFrom(req);
  if (!apiKey) return res.status(400).json({ error: NO_KEY });

  let system;
  try {
    system = readPrompt(S.LISTING_PROMPT_FILE);
  } catch {
    return res.status(500).json({ error: `프롬프트 파일을 찾을 수 없습니다: ${path.join(PROMPT_DIR, S.LISTING_PROMPT_FILE)}` });
  }
  const ctrl = new AbortController();
  res.on("close", () => ctrl.abort());
  try {
    const result = await S.runListings({ client: new Anthropic({ apiKey }), system, text, signal: ctrl.signal });
    if (result.stop_reason === "refusal") return res.status(422).json({ error: "요청이 거절되었습니다. 텍스트를 확인해 주세요." });
    res.json(result);
  } catch (err) {
    if (!res.headersSent) res.status(500).json({ error: S.describeError(err, Anthropic) });
  }
});

// 무료 사진 찾기 (상업적 이용·수정 허용 사진만)
const UA = { "User-Agent": "MedinetBlogStudio/1.0 (local blog tool)" };
app.get("/api/photos", async (req, res) => {
  const q = String(req.query.q || "").trim().slice(0, 80);
  if (!q) return res.status(400).json({ error: "검색어가 없습니다." });
  try {
    res.json({ photos: await S.searchPhotos(q, req.get("x-pexels-key") || process.env.PEXELS_API_KEY, UA) });
  } catch (err) {
    res.status(502).json({ error: `사진 검색 실패: ${err.message}` });
  }
});

// 외부 사진을 같은 주소로 받아 와야 로고를 합성해 저장할 수 있습니다 (허용된 사진 사이트만)
app.get("/api/img", async (req, res) => {
  const u = String(req.query.u || "");
  if (!S.okHost(u)) return res.status(400).end();
  try {
    const r = await fetch(u, { headers: UA, signal: AbortSignal.timeout(20000) });
    const type = r.headers.get("content-type") || "";
    if (!r.ok || !S.okHost(r.url) || !type.startsWith("image/")) return res.status(502).end();
    const buf = Buffer.from(await r.arrayBuffer());
    if (buf.length > 25 * 1024 * 1024) return res.status(413).end();
    res.set({ "Content-Type": type, "Cache-Control": "max-age=86400" }).send(buf);
  } catch {
    res.status(502).end();
  }
});

app.listen(PORT, () => {
  console.log(`메디넷 부동산 블로그 스튜디오 실행 중 → http://localhost:${PORT}`);
  console.log(`프롬프트 폴더: ${PROMPT_DIR}`);
  if (!process.env.ANTHROPIC_API_KEY) console.log("(.env 에 API 키가 없습니다. 웹 화면의 '설정'에서 키를 입력해도 됩니다.)");
});
