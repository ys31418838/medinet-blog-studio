/* 메디넷 부동산 블로그 스튜디오 — 화면 동작 */
(function () {
  const $ = (s, el = document) => el.querySelector(s);
  const $$ = (s, el = document) => [...el.querySelectorAll(s)];

  // ── 저장소 (이 PC 브라우저) ──
  const store = {
    get(key, fallback) {
      try {
        const v = localStorage.getItem(key);
        return v ? JSON.parse(v) : fallback;
      } catch {
        return fallback;
      }
    },
    set(key, value) {
      try {
        localStorage.setItem(key, JSON.stringify(value));
        return true;
      } catch {
        return false;
      }
    },
  };
  const DEFAULT_OFFICE = { name: "메디넷 부동산", phone: "02-3141-8838", address: "마포구 동교로 253" };
  let settings = { apiKey: "", ...DEFAULT_OFFICE, ...store.get("medinet_settings", {}) };
  // 키에는 영문·숫자·기호만 들어갈 수 있습니다. 한글·공백·보이지 않는 문자가 섞이면 요청 자체가 실패하므로 걸러 냅니다.
  const cleanKey = (s) => String(s || "").replace(/[^\x21-\x7E]/g, "");
  const validApiKey = (s) => /^sk-ant-[A-Za-z0-9_-]{20,}$/.test(s);
  settings.apiKey = cleanKey(settings.apiKey);
  settings.pexelsKey = cleanKey(settings.pexelsKey);
  if (settings.apiKey && !validApiKey(settings.apiKey)) settings.apiKey = "";
  let stats = { posts: 0, images: 0, listings: 0, ...store.get("medinet_stats", {}) };
  let history = store.get("medinet_history", []);
  const office = () => ({ name: settings.name, phone: settings.phone, address: settings.address });

  function toast(msg) {
    const t = $("#toast");
    t.textContent = msg;
    t.classList.add("show");
    clearTimeout(toast.timer);
    toast.timer = setTimeout(() => t.classList.remove("show"), 2200);
  }

  function refreshChrome() {
    $("#statPosts").textContent = stats.posts;
    $("#statImages").textContent = stats.images;
    $("#statListings").textContent = stats.listings;
    $("#histCount").textContent = history.length;
    $("#brandOffice").textContent = settings.name || "부동산";
    const o = office();
    $("#sideOffice").innerHTML = o.name
      ? `<b>${esc(o.name)}</b><br>${esc(o.phone || "")}<br>${esc(o.address || "")}`
      : "";
  }
  function bump(key, n = 1) {
    stats[key] = (stats[key] || 0) + n;
    store.set("medinet_stats", stats);
    refreshChrome();
  }

  const esc = (s) => String(s ?? "").replace(/[&<>"']/g, (c) => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;" }[c]));
  const slug = (s) => String(s || "").replace(/[\\/:*?"<>|]/g, "").replace(/\s+/g, "_").slice(0, 40);
  const pad2 = (n) => String(n).padStart(2, "0");

  // ── 화면 전환 ──
  const PAGES = {
    blog: ["블로그 글쓰기", "주제와 내 경험을 넣으면 글과 내용에 맞는 이미지를 함께 만듭니다."],
    listing: ["매물 정리", "광고 텍스트를 붙여 넣으면 1매물 = 1행 표로 정리합니다."],
    history: ["작성 기록", "최근 만든 글을 다시 열 수 있습니다."],
    settings: ["설정", "API 키와 사무소 정보를 관리합니다."],
  };
  function go(page) {
    $$(".nav-item").forEach((b) => b.classList.toggle("on", b.dataset.page === page));
    $$(".page").forEach((p) => (p.hidden = p.id !== `page-${page}`));
    $("#pageTitle").textContent = PAGES[page][0];
    $("#pageDesc").textContent = PAGES[page][1];
    $("#side").classList.remove("open");
    if (page === "history") renderHistory();
    window.scrollTo({ top: 0 });
  }
  $$(".nav-item").forEach((b) => b.addEventListener("click", () => go(b.dataset.page)));
  $("#menuBtn").addEventListener("click", (e) => {
    e.stopPropagation();
    $("#side").classList.toggle("open");
  });
  document.addEventListener("click", (e) => {
    const side = $("#side");
    if (side.classList.contains("open") && !side.contains(e.target)) side.classList.remove("open");
  });

  // ── 서버 상태 ──
  let serverKey = false;
  async function checkStatus() {
    const pill = $("#keyPill");
    try {
      const s = await (await fetch("/api/status")).json();
      serverKey = s.serverKey;
      $("#promptInfo").textContent = `프롬프트 파일 위치: ${s.promptDir}${s.promptsOk ? "" : " (파일을 찾을 수 없습니다!)"} — 이 폴더의 .txt 를 고치면 다음 글부터 반영됩니다.`;
    } catch {
      pill.textContent = "서버 꺼짐";
      pill.className = "pill bad";
      return;
    }
    const ok = serverKey || settings.apiKey;
    pill.textContent = ok ? "API 연결 준비됨" : "API 키 필요";
    pill.className = `pill ${ok ? "ok" : "bad"}`;
    pill.onclick = ok ? null : () => go("settings");
  }
  const headers = () => ({
    "Content-Type": "application/json",
    ...(validApiKey(settings.apiKey) ? { "x-api-key": settings.apiKey } : {}),
    ...(settings.pexelsKey ? { "x-pexels-key": cleanKey(settings.pexelsKey) } : {}),
  });

  // ── 결과 파싱 ──
  function tag(raw, name, partial = false) {
    const open = raw.indexOf(`<${name}>`);
    if (open < 0) return null;
    const start = open + name.length + 2;
    const close = raw.indexOf(`</${name}>`, start);
    if (close < 0) return partial ? raw.slice(start) : null;
    return raw.slice(start, close);
  }
  function parseJSONArray(s) {
    if (!s) return [];
    const a = s.indexOf("["), b = s.lastIndexOf("]");
    if (a < 0 || b < a) return [];
    try {
      const v = JSON.parse(s.slice(a, b + 1));
      return Array.isArray(v) ? v : [];
    } catch {
      return [];
    }
  }
  function parseResult(raw) {
    return {
      title: (tag(raw, "title") ?? "").trim(),
      meta: (tag(raw, "meta") ?? "").trim(),
      body: tag(raw, "body") ?? "",
      tags: (tag(raw, "tags") ?? "").split(/[,\n]/).map((t) => t.replace(/^#/, "").trim()).filter(Boolean),
      images: parseJSONArray(tag(raw, "images")).filter((i) => i && i.id != null),
      check: parseJSONArray(tag(raw, "check")),
    };
  }

  // ── 본문 HTML 정리 (허용 태그만 남김) ──
  const ALLOWED = new Set(["H2", "H3", "P", "STRONG", "B", "EM", "I", "U", "UL", "OL", "LI", "BLOCKQUOTE", "HR", "BR", "TABLE", "THEAD", "TBODY", "TR", "TH", "TD", "A"]);
  const DROP = new Set(["SCRIPT", "STYLE", "IFRAME", "OBJECT", "EMBED", "LINK", "META"]);
  function sanitizeInto(target, html) {
    const doc = new DOMParser().parseFromString(`<div>${html}</div>`, "text/html");
    const walk = (src, dst) => {
      for (const n of src.childNodes) {
        if (n.nodeType === 3) dst.appendChild(document.createTextNode(n.nodeValue));
        else if (n.nodeType === 1) {
          if (DROP.has(n.tagName)) continue;
          if (ALLOWED.has(n.tagName)) {
            const el = document.createElement(n.tagName);
            if (n.tagName === "A") {
              const href = n.getAttribute("href") || "";
              if (/^https?:\/\//i.test(href)) {
                el.href = href;
                el.target = "_blank";
                el.rel = "noopener";
              }
            }
            walk(n, el);
            dst.appendChild(el);
          } else walk(n, dst);
        }
      }
    };
    walk(doc.body.firstChild, target);
  }

  // ── 미리보기 렌더링 ──
  let current = null; // { raw, parsed, sources, topic, slots: Map(id → {spec, canvas, photo}) }

  function renderBody(bodyHtml, { streaming = false, specs = [] } = {}) {
    const out = $("#outBody");
    out.textContent = "";
    const html = streaming ? bodyHtml.replace(/<[^>]*$/, "") : bodyHtml;
    sanitizeInto(out, html);

    const used = new Set();
    for (const p of $$("p, li", out)) {
      const text = p.textContent.trim();
      const m = text.match(/^\[\[IMG:(\d+)\]\]$/);
      if (m && p.tagName === "P") {
        const id = Number(m[1]);
        used.add(id);
        p.replaceWith(makeSlot(id, specs.find((s) => Number(s.id) === id), streaming));
      } else if (/^\[직접 경험 추가/.test(text)) p.classList.add("need");
      else if (/^\[내부 링크 제안/.test(text)) p.classList.add("link-tip");
      else if (/\[\[IMG:\d+\]\]/.test(text)) p.innerHTML = p.innerHTML.replace(/\[\[IMG:\d+\]\]/g, "");
    }
    if (!streaming) {
      // 본문에 자리가 없는 이미지는 맨 끝에 붙입니다
      for (const s of specs) if (!used.has(Number(s.id))) out.appendChild(makeSlot(Number(s.id), s, false));
    } else {
      const c = document.createElement("span");
      c.className = "cursor";
      (out.lastElementChild || out).appendChild(c);
    }
  }

  const KIND_LABEL = { cover: "대표", stats: "핵심 수치", bar: "그래프", steps: "단계", compare: "비교표", checklist: "체크리스트", tip: "핵심 요약", photo: "사진" };

  function makeSlot(id, spec, streaming) {
    const fig = document.createElement("figure");
    fig.className = "slot";
    fig.dataset.id = id;
    const wrapEl = document.createElement("div");
    wrapEl.className = "img-wrap";
    wrapEl.innerHTML = `<span class="loading">${streaming ? `이미지 ${pad2(id)} — 글이 끝나면 그려집니다` : "이미지 그리는 중…"}</span>`;
    fig.appendChild(wrapEl);
    const cap = document.createElement("figcaption");
    cap.innerHTML = `<span class="num">${pad2(id)}</span><span class="cap">${esc(spec?.caption || spec?.title || "")}<small class="credit"></small></span>`;
    if (spec) {
      cap.insertAdjacentHTML("beforeend", `<span class="kind">${KIND_LABEL[spec.kind] || spec.kind || ""}</span>
        <span class="acts">
          <button class="btn small" data-act="save" type="button">저장</button>
          <button class="btn small" data-act="next" type="button" hidden>다른 사진</button>
          <button class="btn small" data-act="photo" type="button">내 사진으로</button>
          <button class="btn small" data-act="reset" type="button" hidden>되돌리기</button>
        </span>`);
    }
    fig.appendChild(cap);
    return fig;
  }

  // ── 사진 자동 찾기 (대표 이미지 배경, 사진 자리) ──
  const loadImg = (url) =>
    new Promise((resolve, reject) => {
      const img = new Image();
      img.onload = () => resolve(img);
      img.onerror = reject;
      img.src = url;
    });
  async function findPhotos(query) {
    try {
      const r = await fetch(`/api/photos?q=${encodeURIComponent(query)}`, { headers: headers() });
      return r.ok ? (await r.json()).photos || [] : [];
    } catch {
      return [];
    }
  }
  // start 번째 후보부터 차례로 받아 보고, 처음 성공한 사진으로 이미지를 만듭니다
  async function applyFoundPhoto(slot, start = 0) {
    const list = slot.photos || [];
    for (let k = 0; k < list.length; k++) {
      const i = (start + k) % list.length;
      for (const src of list[i].srcs) {
        try {
          const img = await loadImg(`/api/img?u=${encodeURIComponent(src)}`);
          if (img.width < 400) continue;
          slot.canvas = slot.spec.kind === "cover"
            ? await MedinetImages.render(slot.spec, office(), img)
            : await MedinetImages.renderPhoto(slot.spec, office(), img);
          slot.pi = i;
          slot.credit = list[i].credit;
          return true;
        } catch {
          /* 다음 후보 */
        }
      }
    }
    return false;
  }
  async function prepareSlot(slot) {
    if (slot.canvas) return;
    const { spec } = slot;
    if (spec.query && (spec.kind === "cover" || spec.kind === "photo")) {
      slot.photos = await findPhotos(spec.query);
      const n = Math.min(slot.photos.length, 5); // 글마다 같은 사진이 반복되지 않게 상위 후보 중 무작위로 시작
      if (await applyFoundPhoto(slot, n ? Math.floor(Math.random() * n) : 0)) return;
    }
    // 사진을 못 찾으면 빈칸 대신 설명 카드로 채웁니다
    slot.credit = null;
    const s = spec.kind === "photo" ? { ...spec, kind: "tip", text: spec.caption || spec.title } : spec;
    slot.canvas = await MedinetImages.render(s, office());
  }

  async function drawSlots() {
    if (!current) return;
    const mine = current;
    await Promise.all(
      $$("#outBody figure.slot").map(async (fig) => {
        const slot = mine.slots.get(Number(fig.dataset.id));
        if (!slot) return fig.remove();
        await prepareSlot(slot);
        if (current === mine) showSlot(fig, slot);
      })
    );
  }
  function showSlot(fig, slot) {
    const canvas = slot.photo || slot.canvas;
    const wrapEl = $(".img-wrap", fig);
    wrapEl.textContent = "";
    const img = new Image();
    img.alt = slot.spec.alt || slot.spec.title || "";
    img.src = canvas.toDataURL("image/png");
    wrapEl.appendChild(img);
    const reset = $('[data-act="reset"]', fig);
    if (reset) reset.hidden = !slot.photo;
    const next = $('[data-act="next"]', fig);
    if (next) next.hidden = !!slot.photo || !(slot.photos?.length > 1);
    const credit = $(".credit", fig);
    if (credit) credit.textContent = !slot.photo && slot.credit ? ` · ${slot.credit}` : "";
  }

  function fileName(slot) {
    return `${pad2(slot.spec.id)}_${slug(slot.spec.title || KIND_LABEL[slot.spec.kind] || "이미지")}.png`;
  }
  const toBlob = (canvas) => new Promise((r) => canvas.toBlob(r, "image/png"));
  function download(blob, name) {
    const a = document.createElement("a");
    a.href = URL.createObjectURL(blob);
    a.download = name;
    document.body.appendChild(a);
    a.click();
    a.remove();
    setTimeout(() => URL.revokeObjectURL(a.href), 4000);
  }

  // 이미지 버튼 (저장 / 내 사진 / 되돌리기)
  let photoTarget = null;
  $("#outBody").addEventListener("click", async (e) => {
    const btn = e.target.closest("button[data-act]");
    if (!btn || !current) return;
    const fig = btn.closest("figure.slot");
    const slot = current.slots.get(Number(fig.dataset.id));
    if (!slot) return;
    if (btn.dataset.act === "save") download(await toBlob(slot.photo || slot.canvas), fileName(slot));
    if (btn.dataset.act === "next") {
      btn.disabled = true;
      btn.textContent = "찾는 중…";
      await applyFoundPhoto(slot, (slot.pi ?? 0) + 1);
      btn.disabled = false;
      btn.textContent = "다른 사진";
      showSlot(fig, slot);
    }
    if (btn.dataset.act === "photo") {
      photoTarget = { fig, slot };
      $("#photoInput").value = "";
      $("#photoInput").click();
    }
    if (btn.dataset.act === "reset") {
      slot.photo = null;
      showSlot(fig, slot);
    }
  });
  $("#photoInput").addEventListener("change", () => {
    const file = $("#photoInput").files[0];
    if (!file || !photoTarget) return;
    const img = new Image();
    img.onload = async () => {
      photoTarget.slot.photo = await MedinetImages.renderPhoto(photoTarget.slot.spec, office(), img);
      showSlot(photoTarget.fig, photoTarget.slot);
      URL.revokeObjectURL(img.src);
      toast("사진에 로고를 넣었어요");
    };
    img.onerror = () => toast("이미지 파일을 열 수 없습니다");
    img.src = URL.createObjectURL(file);
  });

  function showResult(raw, { streaming = false, sources = [] } = {}) {
    $("#emptyState").hidden = true;
    $("#result").hidden = false;
    const p = parseResult(raw);
    $("#outTitle").textContent = p.title || (streaming ? "제목 작성 중…" : "(제목 없음)");
    $("#outMeta").textContent = p.meta;
    $("#metaLen").textContent = p.meta ? `(${p.meta.length}자)` : "";
    const body = tag(raw, "body", true) ?? "";
    renderBody(body, { streaming, specs: p.images });

    $("#tagsBox").hidden = !p.tags.length;
    $("#outTags").innerHTML = p.tags.map((t) => `<span>#${esc(t)}</span>`).join("");
    $("#sourcesBox").hidden = !sources.length;
    $("#outSources").innerHTML = sources.map((s) => `<li><a href="${esc(s.url)}" target="_blank" rel="noopener">${esc(s.title || s.url)}</a></li>`).join("");
    $("#checkBox").hidden = !p.check.length;
    $("#outCheck").innerHTML = p.check
      .map((c) => `<li class="${c.ok ? "" : "no"}"><span class="mk">${c.ok ? "✓" : "보완"}</span><div><b>${esc(c.item)}</b> — ${esc(c.note || "")}</div></li>`)
      .join("");
    return p;
  }

  // 본문에 실제로 넣은 링크 = 인용한 출처 (API 인용 정보와 합쳐서 중복 제거)
  function bodySources(raw, apiSources) {
    const seen = new Map(apiSources.map((s) => [s.url, s]));
    const doc = new DOMParser().parseFromString(tag(raw, "body") ?? "", "text/html");
    for (const a of doc.querySelectorAll("a[href]")) {
      const url = a.getAttribute("href");
      if (/^https?:\/\//i.test(url) && !seen.has(url)) seen.set(url, { url, title: a.textContent.trim() || url });
    }
    return [...seen.values()];
  }

  async function finishResult(raw, { sources = [], topic = "", save = true } = {}) {
    sources = bodySources(raw, sources);
    const parsed = showResult(raw, { sources });
    current = { raw, parsed, sources, topic, slots: new Map(parsed.images.map((s) => [Number(s.id), { spec: s, canvas: null, photo: null }])) };
    await drawSlots();
    if (save && parsed.title) {
      history.unshift({ id: Date.now(), at: new Date().toISOString(), topic, title: parsed.title, raw, sources });
      history = history.slice(0, 20);
      if (!store.set("medinet_history", history)) {
        history = history.slice(0, 5);
        store.set("medinet_history", history);
      }
      bump("posts");
      bump("images", parsed.images.length);
    }
    return parsed;
  }

  // ── 글 생성 (실시간 스트리밍) ──
  let controller = null;
  $("#blogForm").addEventListener("submit", async (e) => {
    e.preventDefault();
    const fd = new FormData(e.target);
    const body = Object.fromEntries(fd.entries());
    body.webSearch = $("#webSearch").checked;
    body.office = office();
    if (!body.topic.trim()) return $("#topic").focus();
    if (!serverKey && !settings.apiKey) {
      toast("먼저 설정에서 API 키를 넣어 주세요");
      return go("settings");
    }

    const status = $("#genStatus");
    const setStatus = (html, err = false) => {
      status.innerHTML = html;
      status.classList.toggle("err", err);
    };
    $("#genBtn").disabled = true;
    $("#stopBtn").hidden = false;
    setStatus(`<span class="spin"></span>글 구성을 생각하는 중… (2~4분 걸려요)`);
    current = null;

    let raw = "";
    let sources = [];
    let finished = false;
    let searches = 0;
    let lastPaint = 0;
    controller = new AbortController();
    try {
      const res = await fetch("/api/generate", { method: "POST", headers: headers(), body: JSON.stringify(body), signal: controller.signal });
      if (!res.ok) {
        const j = await res.json().catch(() => ({}));
        throw new Error(j.error || `서버 오류 (${res.status})`);
      }
      const reader = res.body.getReader();
      const dec = new TextDecoder();
      let buf = "";
      for (;;) {
        const { value, done } = await reader.read();
        if (done) break;
        buf += dec.decode(value, { stream: true });
        let idx;
        while ((idx = buf.indexOf("\n\n")) >= 0) {
          const chunk = buf.slice(0, idx);
          buf = buf.slice(idx + 2);
          const ev = /^event: (.*)$/m.exec(chunk)?.[1];
          const dataLine = /^data: (.*)$/m.exec(chunk)?.[1];
          if (!ev || dataLine == null) continue;
          const data = JSON.parse(dataLine);
          if (ev === "delta") {
            raw += data;
            const now = performance.now();
            if (now - lastPaint > 180) {
              lastPaint = now;
              showResult(raw, { streaming: true });
              setStatus(`<span class="spin"></span>글 쓰는 중… ${raw.length.toLocaleString()}자${searches ? ` · 자료 검색 ${searches}회` : ""}`);
            }
          } else if (ev === "status") {
            searches = data.searches || searches;
            setStatus(`<span class="spin"></span>${esc(data.text)}`);
          } else if (ev === "done") {
            sources = data.sources || [];
            finished = true;
            if (data.stop_reason === "max_tokens") toast("글이 너무 길어 중간에 끊겼어요. 분량을 줄여 다시 시도해 보세요.");
          } else if (ev === "error") {
            throw new Error(data.error);
          }
        }
      }
      if (!finished) throw new Error("연결이 중간에 끊겼습니다. 다시 시도해 주세요.");
      setStatus(`<span class="spin"></span>이미지 그리고 사진 찾는 중…`);
      const parsed = await finishResult(raw, { sources, topic: body.topic });
      if (!parsed.title || !parsed.body) setStatus("결과 형식이 조금 달라요. 그대로 쓰거나 다시 만들어 보세요.", true);
      else setStatus(`완성! 이미지 ${parsed.images.length}장 · 인용 출처 ${current.sources.length}개 — 오른쪽 위 ① 제목 → ② 본문 → ③ 태그 순서로 복사해 네이버에 붙여 넣으세요.`);
    } catch (err) {
      if (err.name === "AbortError") {
        setStatus("멈췄습니다.");
        if (raw) await finishResult(raw, { sources, topic: body.topic, save: false });
      } else setStatus(esc(err.message), true);
    } finally {
      $("#genBtn").disabled = false;
      $("#stopBtn").hidden = true;
      controller = null;
    }
  });
  $("#stopBtn").addEventListener("click", () => controller?.abort());

  $("#demoBtn").addEventListener("click", async () => {
    await finishResult(window.MEDINET_DEMO, { topic: "예시", save: false });
    $("#genStatus").textContent = "예시 화면입니다. 수치는 실제 자료가 아닙니다.";
  });

  // ── 복사 ──
  // 클립보드 API가 막힌 환경에서는 선택 후 복사(execCommand)로 대신합니다
  function legacyCopy(html, text) {
    const el = document.createElement(html ? "div" : "textarea");
    el.style.cssText = "position:fixed;left:-9999px;top:0;opacity:0";
    if (html) {
      el.contentEditable = "true";
      el.innerHTML = html;
    } else el.value = text;
    document.body.appendChild(el);
    if (html) {
      const range = document.createRange();
      range.selectNodeContents(el);
      const sel = getSelection();
      sel.removeAllRanges();
      sel.addRange(range);
    } else el.select();
    const ok = document.execCommand("copy");
    getSelection().removeAllRanges();
    el.remove();
    return ok;
  }
  async function copyRich(html, text) {
    try {
      await navigator.clipboard.write([
        new ClipboardItem({
          "text/html": new Blob([html], { type: "text/html" }),
          "text/plain": new Blob([text], { type: "text/plain" }),
        }),
      ]);
      return true;
    } catch {
      return legacyCopy(html, text);
    }
  }
  async function copyText(text) {
    try {
      await navigator.clipboard.writeText(text);
      return true;
    } catch {
      return legacyCopy(null, text);
    }
  }
  // 네이버에 붙여 넣을 본문: 이미지를 그림 그대로(JPEG) 넣고, 설명·사진 출처를 아래에 씁니다
  function bodyForNaver(withImages = true) {
    const clone = $("#outBody").cloneNode(true);
    clone.querySelectorAll(".cursor").forEach((c) => c.remove());
    clone.querySelectorAll("figure.slot").forEach((fig) => {
      const slot = current?.slots.get(Number(fig.dataset.id));
      const frag = document.createDocumentFragment();
      const canvas = slot && (slot.photo || slot.canvas);
      const p = document.createElement("p");
      p.setAttribute("style", "text-align:center");
      if (withImages && canvas) {
        const img = document.createElement("img");
        img.src = canvas.toDataURL("image/jpeg", 0.88);
        img.alt = slot.spec.alt || slot.spec.title || "";
        img.width = 760;
        p.appendChild(img);
      } else {
        p.innerHTML = `<span style="background:#FFF1A8">📷 [이미지 ${pad2(fig.dataset.id)}] 여기에 '${esc(slot ? fileName(slot) : "")}' 파일을 넣으세요</span>`;
      }
      frag.appendChild(p);
      if (slot?.spec.caption) {
        const c = document.createElement("p");
        c.setAttribute("style", "text-align:center;color:#666666");
        c.textContent = slot.spec.caption;
        frag.appendChild(c);
      }
      if (slot?.credit && !slot.photo) {
        const c = document.createElement("p");
        c.setAttribute("style", "text-align:center;color:#999999;font-size:12px");
        c.textContent = slot.credit;
        frag.appendChild(c);
      }
      fig.replaceWith(frag);
    });
    clone.querySelectorAll(".need").forEach((p) => p.setAttribute("style", "background:#FFF1A8"));
    clone.querySelectorAll("[class]").forEach((el) => el.removeAttribute("class"));
    return { html: clone.innerHTML, text: clone.innerText };
  }
  $$("[data-copy]").forEach((btn) =>
    btn.addEventListener("click", async () => {
      if (!current) return;
      const what = btn.dataset.copy;
      let ok = true;
      if (what === "title") ok = await copyText(current.parsed.title);
      if (what === "tags") ok = await copyText(current.parsed.tags.map((t) => `#${t}`).join(" "));
      if (what === "body") {
        const b = bodyForNaver();
        ok = await copyRich(b.html, b.text);
      }
      if (!ok) return toast("이 브라우저에서 복사가 막혀 있어요. 크롬에서 열어 주세요.");
      toast({ title: "① 제목을 복사했어요 — 네이버 제목 칸에 붙여 넣으세요", tags: "③ 태그를 복사했어요 — 태그 칸에 붙여 넣으세요", body: "본문(글만)을 복사했어요" }[what]);
    })
  );

  // ── ② 붙여넣기 도우미 ──
  // 네이버 편집기는 글 속에 섞인 이미지를 버리지만, 그림 한 장만 복사하면 Ctrl+V 로 올라갑니다.
  // 그래서 본문을 글 → 이미지 → 글 → 이미지 … 조각으로 나눠 한 조각씩 복사합니다.
  function buildPieces() {
    const clone = $("#outBody").cloneNode(true);
    clone.querySelectorAll(".cursor").forEach((c) => c.remove());
    // 다른 요소 안에 들어간 이미지 자리는 그 요소 바로 뒤로 꺼냅니다
    clone.querySelectorAll("figure.slot").forEach((fig) => {
      let top = fig;
      while (top.parentNode !== clone) top = top.parentNode;
      if (top !== fig) top.after(fig);
    });
    const pieces = [];
    let buf = document.createElement("div");
    const flush = () => {
      buf.querySelectorAll(".need").forEach((p) => p.setAttribute("style", "background:#FFF1A8"));
      buf.querySelectorAll("[class]").forEach((el) => el.removeAttribute("class"));
      if (buf.textContent.trim()) pieces.push({ type: "text", html: buf.innerHTML, text: buf.textContent.trim() });
      buf = document.createElement("div");
    };
    const note = (text, style) => {
      const p = document.createElement("p");
      p.setAttribute("style", style);
      p.textContent = text;
      buf.appendChild(p);
    };
    for (const node of [...clone.childNodes]) {
      if (node.nodeType === 1 && node.matches("figure.slot")) {
        const slot = current?.slots.get(Number(node.dataset.id));
        if (!slot || !(slot.photo || slot.canvas)) continue;
        flush();
        pieces.push({ type: "image", slot });
        if (slot.spec.caption) note(slot.spec.caption, "text-align:center;color:#666666");
        if (slot.credit && !slot.photo) note(slot.credit, "text-align:center;color:#999999;font-size:12px");
      } else buf.appendChild(node);
    }
    flush();
    let n = 0;
    pieces.forEach((p) => (p.label = p.type === "image" ? `이미지 ${pad2(p.slot.spec.id)}` : `글 ${++n}`));
    return pieces;
  }

  async function copyPiece(p) {
    if (p.type === "text") return copyRich(p.html, p.text);
    try {
      // Promise 를 그대로 넘겨야 클릭 직후 권한이 유지됩니다
      await navigator.clipboard.write([new ClipboardItem({ "image/png": toBlob(p.slot.photo || p.slot.canvas) })]);
      return true;
    } catch (e) {
      console.warn("이미지 복사 실패", e);
      return false;
    }
  }

  let helper = null;
  async function helperCopy() {
    const { pieces, i } = helper;
    const p = pieces[i];
    $("#phStep").textContent = `${i + 1} / ${pieces.length}`;
    $("#phMsg").classList.remove("err");
    $("#phMsg").textContent = `${p.label} 복사 중…`;
    $("#phNext").disabled = $("#phAgain").disabled = true;
    const ok = await copyPiece(p);
    $("#phNext").disabled = $("#phAgain").disabled = false;
    $("#phStep").textContent = `${i + 1} / ${pieces.length}`;
    $("#phProg").style.width = `${((i + 1) / pieces.length) * 100}%`;
    $("#phMsg").innerHTML = ok
      ? `<b>${esc(p.label)}</b> 복사됨 → 네이버 본문 <b>맨 끝</b>을 클릭하고 <kbd>Ctrl</kbd>+<kbd>V</kbd>`
      : `<b>${esc(p.label)}</b> 복사에 실패했어요. <b>다시 복사</b>를 눌러 주세요.`;
    $("#phMsg").classList.toggle("err", !ok);
    const next = pieces[i + 1];
    $("#phNext").textContent = next ? `다음: ${next.label} 복사` : "다 붙여 넣었어요";
    $$("figure.slot").forEach((f) => f.classList.toggle("pasting", p.type === "image" && Number(f.dataset.id) === Number(p.slot.spec.id)));
  }
  function closeHelper() {
    helper = null;
    $("#pasteHelper").hidden = true;
    $$("figure.slot.pasting").forEach((f) => f.classList.remove("pasting"));
  }
  $("#pasteHelperBtn").addEventListener("click", async () => {
    if (!current) return;
    const pieces = buildPieces();
    if (!pieces.length) return toast("붙여 넣을 본문이 없어요");
    helper = { pieces, i: 0 };
    $("#pasteHelper").hidden = false;
    await helperCopy();
  });
  $("#phNext").addEventListener("click", async () => {
    if (!helper) return;
    if (helper.i + 1 >= helper.pieces.length) {
      closeHelper();
      return toast("본문 완성! 이제 ③ 태그를 복사해 붙여 넣으세요");
    }
    helper.i += 1;
    await helperCopy();
  });
  $("#phAgain").addEventListener("click", () => helper && helperCopy());
  $("#phClose").addEventListener("click", closeHelper);

  $("#saveAllBtn").addEventListener("click", async () => {
    if (!current?.slots.size) return toast("저장할 이미지가 없어요");
    const slots = [...current.slots.values()].filter((s) => s.canvas || s.photo).sort((a, b) => a.spec.id - b.spec.id);
    if (window.JSZip) {
      const zip = new JSZip();
      for (const s of slots) zip.file(fileName(s), await toBlob(s.photo || s.canvas));
      download(await zip.generateAsync({ type: "blob" }), `${slug(current.parsed.title) || "블로그"}_이미지.zip`);
      toast(`이미지 ${slots.length}장을 압축 파일로 저장했어요`);
    } else {
      for (const s of slots) {
        download(await toBlob(s.photo || s.canvas), fileName(s));
        await new Promise((r) => setTimeout(r, 350));
      }
      toast(`이미지 ${slots.length}장을 저장했어요`);
    }
  });

  // ── 작성 기록 ──
  function renderHistory() {
    const ul = $("#historyList");
    if (!history.length) {
      ul.innerHTML = `<li class="none">아직 작성한 글이 없어요.</li>`;
      return;
    }
    ul.innerHTML = history
      .map((h, i) => `<li><div><b>${esc(h.title)}</b><small>${new Date(h.at).toLocaleString("ko-KR")} · 주제: ${esc(h.topic)}</small></div>
        <button class="btn small primary" data-open="${i}">열기</button><button class="btn small" data-del="${i}">삭제</button></li>`)
      .join("");
  }
  $("#historyList").addEventListener("click", async (e) => {
    const open = e.target.closest("[data-open]");
    const del = e.target.closest("[data-del]");
    if (open) {
      const h = history[Number(open.dataset.open)];
      go("blog");
      await finishResult(h.raw, { sources: h.sources || [], topic: h.topic, save: false });
      $("#genStatus").textContent = `기록에서 불러왔어요 (${new Date(h.at).toLocaleDateString("ko-KR")})`;
    }
    if (del) {
      history.splice(Number(del.dataset.del), 1);
      store.set("medinet_history", history);
      refreshChrome();
      renderHistory();
    }
  });

  // ── 매물 정리 ──
  let listingRows = null; // [header[], ...rows]
  function parseMarkdownTable(md) {
    const lines = md.split("\n").map((l) => l.trim()).filter((l) => l.startsWith("|"));
    const rows = lines
      .filter((l) => !/^\|(\s*:?-+:?\s*\|)+\s*$/.test(l))
      .map((l) => l.replace(/^\|/, "").replace(/\|$/, "").split("|").map((c) => c.trim()));
    return rows.length > 1 ? rows : null;
  }
  $("#listingBtn").addEventListener("click", async () => {
    const text = $("#listingText").value.trim();
    const st = $("#listingStatus");
    if (!text) return $("#listingText").focus();
    if (!serverKey && !settings.apiKey) {
      toast("먼저 설정에서 API 키를 넣어 주세요");
      return go("settings");
    }
    $("#listingBtn").disabled = true;
    st.className = "status";
    st.innerHTML = `<span class="spin"></span>매물을 정리하는 중…`;
    try {
      const res = await fetch("/api/listings", { method: "POST", headers: headers(), body: JSON.stringify({ text }) });
      const j = await res.json();
      if (!res.ok) throw new Error(j.error || "정리에 실패했어요");
      const rows = parseMarkdownTable(j.markdown);
      if (!rows) throw new Error("표를 읽지 못했어요. 텍스트를 확인하고 다시 시도해 주세요.");
      listingRows = rows;
      renderListing();
      bump("listings", rows.length - 1);
      st.textContent = `${rows.length - 1}개 매물을 정리했어요.`;
    } catch (err) {
      st.className = "status err";
      st.textContent = err.message;
    } finally {
      $("#listingBtn").disabled = false;
    }
  });
  function renderListing() {
    const [head, ...rows] = listingRows;
    $("#listingResult").hidden = false;
    $("#listingCount").textContent = `(${rows.length}건)`;
    $("#listingTable").innerHTML =
      `<thead><tr>${head.map((h) => `<th>${esc(h)}</th>`).join("")}</tr></thead><tbody>` +
      rows.map((r) => `<tr>${head.map((_, i) => `<td class="${r[i] === "확실하지 않음" ? "unknown" : ""}">${esc(r[i] ?? "")}</td>`).join("")}</tr>`).join("") +
      `</tbody>`;
  }
  const tableMarkdown = () => listingRows.map((r, i) => `| ${r.join(" | ")} |` + (i === 0 ? `\n|${r.map(() => "---").join("|")}|` : "")).join("\n");
  $("#copyTableBtn").addEventListener("click", async () => {
    if (!listingRows) return;
    const tsv = listingRows.map((r) => r.join("\t")).join("\n");
    const ok = await copyRich($("#listingTable").outerHTML, tsv);
    toast(ok ? "표를 복사했어요 — 엑셀에 바로 붙여 넣을 수 있어요" : "이 브라우저에서 복사가 막혀 있어요. 크롬에서 열어 주세요.");
  });
  $("#csvBtn").addEventListener("click", () => {
    if (!listingRows) return;
    const csv = listingRows.map((r) => r.map((c) => `"${String(c).replace(/"/g, '""')}"`).join(",")).join("\r\n");
    download(new Blob(["﻿" + csv], { type: "text/csv" }), `매물정리_${new Date().toISOString().slice(0, 10)}.csv`);
  });
  $("#toBlogBtn").addEventListener("click", () => {
    if (!listingRows) return;
    $("#listingsInput").value = tableMarkdown();
    $(".more").open = true;
    go("blog");
    toast("매물 자료를 블로그 입력란에 넣었어요");
  });

  // ── 설정 ──
  const sf = $("#settingsForm");
  const SETTING_KEYS = ["apiKey", "pexelsKey", "name", "phone", "address"];
  for (const k of SETTING_KEYS) sf.elements[k].value = settings[k] || "";
  sf.addEventListener("submit", (e) => {
    e.preventDefault();
    for (const k of SETTING_KEYS) settings[k] = sf.elements[k].value.trim();
    const warn = [];
    const rawApi = settings.apiKey;
    settings.apiKey = cleanKey(rawApi);
    if (rawApi && rawApi !== settings.apiKey) warn.push("API 키에 섞여 있던 한글·공백을 지웠어요");
    if (settings.apiKey && !validApiKey(settings.apiKey)) {
      warn.push("API 키 모양이 올바르지 않아요 (sk-ant- 로 시작해야 합니다). console.anthropic.com 에서 복사한 키를 그대로 붙여 넣어 주세요");
      settings.apiKey = "";
    }
    const rawPx = settings.pexelsKey;
    settings.pexelsKey = cleanKey(rawPx);
    if (rawPx && rawPx !== settings.pexelsKey) {
      warn.push("Pexels 키에 한글·공백이 있어 비웠어요 (비워 두어도 사진은 찾아집니다)");
      settings.pexelsKey = "";
    }
    for (const k of SETTING_KEYS) sf.elements[k].value = settings[k] || "";
    const ok = store.set("medinet_settings", settings);
    const st = $("#settingsStatus");
    st.classList.toggle("err", warn.length > 0);
    st.textContent = warn.length ? warn.join(" · ") : ok ? "저장했어요" : "이 브라우저에 저장할 수 없어요 (창을 닫으면 사라집니다)";
    refreshChrome();
    checkStatus();
    if (current) {
      for (const s of current.slots.values()) s.canvas = null;
      drawSlots();
    }
  });

  window.__medinet = { bodyForNaver, buildPieces }; // 점검용

  refreshChrome();
  checkStatus();
})();
