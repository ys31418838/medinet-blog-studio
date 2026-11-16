/* 본문 내용(이미지 설계 JSON)으로 블로그 이미지를 그리는 모듈.
   모든 이미지는 1200×800 PNG, 메디넷 부동산 로고와 사무소 정보가 들어갑니다. */
(function () {
  const W = 1200, H = 800;
  const C = {
    navy: "#0B2A5B", navy2: "#123A78", primary: "#1A4FB0", soft: "#E8EFFB", soft2: "#F3F7FD",
    line: "#D5DEEC", fg: "#0F1B2D", muted: "#56637C", accent: "#F05A28", white: "#FFFFFF", sky: "#BFD3F7",
  };
  const FONT = 'Pretendard, "Malgun Gothic", "Apple SD Gothic Neo", sans-serif';
  const f = (size, weight = 500) => `${weight} ${size}px ${FONT}`;

  let logoPromise = null;
  function loadLogo() {
    if (!logoPromise) {
      logoPromise = new Promise((resolve) => {
        const img = new Image();
        img.onload = () => resolve(img);
        img.onerror = () => resolve(null);
        img.src = "logo.png";
      });
    }
    return logoPromise;
  }

  let fontsReady = null;
  function loadFonts() {
    if (!fontsReady) {
      fontsReady = document.fonts
        ? Promise.all([400, 500, 700, 800].map((w) => document.fonts.load(`${w} 40px Pretendard`).catch(() => {}))).then(() => {})
        : Promise.resolve();
    }
    return fontsReady;
  }

  function rr(ctx, x, y, w, h, r) {
    ctx.beginPath();
    ctx.roundRect ? ctx.roundRect(x, y, w, h, r) : ctx.rect(x, y, w, h);
  }

  // 글자를 maxWidth 에 맞게 줄바꿈 (한국어는 글자 단위, 영어/숫자는 단어 단위)
  function wrap(ctx, text, maxWidth, maxLines = 99) {
    const s = String(text ?? "").replace(/\s+/g, " ").trim();
    if (!s) return [];
    const tokens = s.match(/[A-Za-z0-9.,%~·\-+/()]+|\s|./g) || [];
    const lines = [];
    let cur = "";
    for (const t of tokens) {
      const next = cur + t;
      if (ctx.measureText(next).width <= maxWidth || !cur.trim()) {
        cur = next;
      } else {
        lines.push(cur.trim());
        cur = t.trim() ? t : "";
      }
    }
    if (cur.trim()) lines.push(cur.trim());
    if (lines.length > maxLines) {
      const kept = lines.slice(0, maxLines);
      let last = kept[maxLines - 1];
      while (last.length && ctx.measureText(last + "…").width > maxWidth) last = last.slice(0, -1);
      kept[maxLines - 1] = last + "…";
      return kept;
    }
    return lines;
  }

  function drawLines(ctx, lines, x, y, lh) {
    lines.forEach((l, i) => ctx.fillText(l, x, y + i * lh));
    return y + lines.length * lh;
  }

  function fitFont(ctx, text, maxWidth, maxLines, start, min, weight) {
    for (let s = start; s >= min; s -= 2) {
      ctx.font = f(s, weight);
      const lines = wrap(ctx, text, maxWidth, 99);
      if (lines.length <= maxLines) return { size: s, lines };
    }
    ctx.font = f(min, weight);
    return { size: min, lines: wrap(ctx, text, maxWidth, maxLines) };
  }

  function officeLine(office) {
    return [office?.name, office?.phone, office?.address].filter(Boolean).join("  ·  ");
  }

  // 공통 틀: 상단 라벨 + 제목, 하단 진한 블루 띠 + 로고
  function frame(ctx, spec, office, logo) {
    ctx.fillStyle = C.white;
    ctx.fillRect(0, 0, W, H);
    ctx.fillStyle = C.soft2;
    ctx.fillRect(0, 0, W, 200);

    ctx.font = f(22, 700);
    const label = `${office?.name || "부동산"} 블로그`;
    const lw = ctx.measureText(label).width + 34;
    ctx.fillStyle = C.soft;
    rr(ctx, 70, 44, lw, 42, 21);
    ctx.fill();
    ctx.fillStyle = C.primary;
    ctx.textBaseline = "middle";
    ctx.fillText(label, 87, 66);

    ctx.textBaseline = "alphabetic";
    ctx.fillStyle = C.navy;
    const t = fitFont(ctx, spec.title || "", 1060, 1, 60, 40, 800);
    ctx.fillText(t.lines[0] || "", 70, 158);

    // 하단 띠
    ctx.fillStyle = C.navy;
    ctx.fillRect(0, H - 84, W, 84);
    ctx.fillStyle = C.white;
    ctx.font = f(21, 600);
    ctx.textBaseline = "middle";
    const ol = wrap(ctx, officeLine(office), 860, 1)[0] || "";
    ctx.fillText(ol, 70, H - 42);
    drawLogoBadge(ctx, logo, W - 70, H - 42, 60);
    ctx.textBaseline = "alphabetic";
    return { top: 230, bottom: H - 84 - 36 };
  }

  // 흰 바탕 둥근 상자 안에 로고 (오른쪽 끝 x, 세로 가운데 cy 기준)
  function drawLogoBadge(ctx, logo, right, cy, logoH) {
    if (!logo) return;
    const lw = (logo.width / logo.height) * logoH;
    const pad = Math.round(logoH * 0.18);
    const bw = lw + pad * 2, bh = logoH + pad * 2;
    ctx.fillStyle = C.white;
    rr(ctx, right - bw, cy - bh / 2, bw, bh, 12);
    ctx.fill();
    ctx.drawImage(logo, right - bw + pad, cy - logoH / 2, lw, logoH);
  }

  // ── 대표 이미지(cover): 제목에 따라 색·배치가 달라집니다 ──
  // 주제별 색 조합 (bg1·bg2 배경, accent 강조색, sub 부제 색)
  const THEMES = {
    blue: { bg1: "#0B2A5B", bg2: "#1A4FB0", accent: "#FF7A3D", sub: "#BFD3F7", rgb: "11,42,91" },
    gold: { bg1: "#14213D", bg2: "#2B4677", accent: "#F2B33D", sub: "#F5E6C4", rgb: "20,33,61" },
    teal: { bg1: "#0B4F4A", bg2: "#14857A", accent: "#FFC857", sub: "#C8F1EA", rgb: "11,79,74" },
    charcoal: { bg1: "#1F2933", bg2: "#3E4C59", accent: "#FF7A45", sub: "#FFD9C7", rgb: "31,41,51" },
    plum: { bg1: "#3A1F5D", bg2: "#5B3A8C", accent: "#FFB347", sub: "#E3D4FA", rgb: "58,31,93" },
    wine: { bg1: "#5A1A2B", bg2: "#8C2F45", accent: "#FFD166", sub: "#F8D5DC", rgb: "90,26,43" },
  };
  const THEME_RULES = [
    ["plum", /세금|양도세|취득세|보유세|종부세|재산세|대출|금리|DSR|LTV|법률|법원|소송|등기|특약|분쟁/],
    ["charcoal", /상가|사무실|오피스|창업|권리금|점포|공장|지식산업|임장/],
    ["teal", /신혼|가족|아이|학군|학교|이사|동네|생활|산책|공원|인테리어|반려/],
    ["gold", /매매|투자|시세|청약|분양|재건축|재개발|갭|수익|경매|급매|호가|실거래/],
    ["wine", /사기|주의|위험|함정|실수|피해|경고|조심/],
    ["blue", /전세|월세|원룸|투룸|오피스텔|보증금|임대|임차|반전세|계약/],
  ];
  const LAYOUTS = ["left", "bottom", "split", "center", "card", "number"];

  function hashStr(s) {
    let h = 2166136261;
    for (const ch of String(s)) h = Math.imul(h ^ ch.codePointAt(0), 16777619);
    return h >>> 0;
  }
  // 제목 속 '7단계', '5가지', 'TOP 3' 같은 숫자
  function bigNumber(text) {
    const m = String(text || "").match(/(\d{1,2})\s*(가지|단계|곳|개|선|분|일|억|%|대|년|평)/) || String(text || "").match(/TOP\s*(\d{1,2})/i);
    return m ? { n: m[1], unit: m[2] || "" } : null;
  }
  function coverStyle(spec) {
    const text = `${spec.title || ""} ${spec.subtitle || ""} ${spec.topic || ""}`;
    const h = hashStr(spec.title || "");
    const v = Number(spec.variant) || 0;
    const num = bigNumber(spec.title) || bigNumber(spec.topic);
    const pool = num ? LAYOUTS : LAYOUTS.filter((l) => l !== "number");
    const hinted = pool.indexOf(spec.layout);
    const base = hinted >= 0 ? hinted : h % pool.length;
    const layout = pool[(base + v) % pool.length];
    const names = Object.keys(THEMES);
    // 표지 문구에서 먼저 찾고, 없으면 부제·글 제목에서 찾습니다
    const rule = THEME_RULES.find(([, re]) => re.test(spec.title || "")) || THEME_RULES.find(([, re]) => re.test(text));
    let ti = rule ? names.indexOf(rule[0]) : (h >>> 8) % names.length;
    ti = (ti + Math.floor((base + v) / pool.length)) % names.length; // 배치를 한 바퀴 다 돌면 색도 바꿈
    return { layout, t: THEMES[names[ti]], num };
  }

  // 사진을 (x,y,w,h) 영역에 꽉 차게
  function drawPhotoFill(ctx, photo, x, y, w, h) {
    const s = Math.max(w / photo.width, h / photo.height);
    const dw = photo.width * s, dh = photo.height * s;
    ctx.save();
    ctx.beginPath();
    ctx.rect(x, y, w, h);
    ctx.clip();
    ctx.drawImage(photo, x + (w - dw) / 2, y + (h - dh) / 2, dw, dh);
    ctx.restore();
  }
  // 사진이 없을 때 배경: 그라데이션 + 레이아웃마다 다른 무늬
  function drawPlainBg(ctx, t, x, y, w, h, seed) {
    const g = ctx.createLinearGradient(x, y, x + w, y + h);
    g.addColorStop(0, t.bg1);
    g.addColorStop(1, t.bg2);
    ctx.fillStyle = g;
    ctx.fillRect(x, y, w, h);
    ctx.save();
    ctx.beginPath();
    ctx.rect(x, y, w, h);
    ctx.clip();
    ctx.strokeStyle = "rgba(255,255,255,.08)";
    ctx.fillStyle = "rgba(255,255,255,.06)";
    const kind = seed % 3;
    if (kind === 0) {
      ctx.lineWidth = 60;
      ctx.beginPath();
      ctx.moveTo(x + w * 0.62, y + h + 20); ctx.lineTo(x + w * 0.84, y + h * 0.4); ctx.lineTo(x + w * 1.05, y + h + 20);
      ctx.stroke();
      ctx.beginPath();
      ctx.moveTo(x + w * 0.5, y + h + 20); ctx.lineTo(x + w * 0.7, y + h * 0.6); ctx.lineTo(x + w * 0.9, y + h + 20);
      ctx.stroke();
    } else if (kind === 1) {
      // 건물 실루엣
      let bx = x + w * 0.5;
      let i = 0;
      while (bx < x + w) {
        const bw = 60 + ((seed >> i) % 5) * 18;
        const bh = h * (0.25 + (((seed >> (i + 3)) % 7) / 14));
        ctx.fillRect(bx, y + h - bh, bw - 10, bh);
        bx += bw;
        i++;
      }
    } else {
      for (let r = 120; r < 900; r += 110) {
        ctx.lineWidth = 3;
        ctx.beginPath();
        ctx.arc(x + w * 0.9, y + h * 0.15, r, 0, Math.PI * 2);
        ctx.stroke();
      }
    }
    ctx.restore();
  }
  function shade(ctx, x, y, w, h, rgb, a0, a1, dir = "h") {
    const g = dir === "h" ? ctx.createLinearGradient(x, 0, x + w, 0) : ctx.createLinearGradient(0, y, 0, y + h);
    g.addColorStop(0, `rgba(${rgb},${a0})`);
    g.addColorStop(1, `rgba(${rgb},${a1})`);
    ctx.fillStyle = g;
    ctx.fillRect(x, y, w, h);
  }
  // 꼬리표 (예: 2026 최신, 계약 전 필독)
  function drawBadge(ctx, text, x, y, bg, fg, align = "left", size = 24) {
    if (!text) return 0;
    ctx.font = f(size, 800);
    const w = ctx.measureText(text).width + size * 1.3, h = size * 1.8;
    const bx = align === "center" ? x - w / 2 : x;
    ctx.fillStyle = bg;
    rr(ctx, bx, y, w, h, h / 2);
    ctx.fill();
    ctx.fillStyle = fg;
    ctx.textBaseline = "middle";
    ctx.textAlign = "center";
    ctx.fillText(text, bx + w / 2, y + h / 2 + 1);
    ctx.textAlign = "left";
    ctx.textBaseline = "alphabetic";
    return h;
  }
  // 제목 줄바꿈은 낱말 단위 (한 낱말이 너무 길 때만 글자 단위)
  function fitTitle(ctx, text, maxWidth, maxLines, start, min) {
    for (let s = start; s >= min; s -= 2) {
      ctx.font = f(s, 800);
      const lines = wrapWords(ctx, text, maxWidth);
      if (lines.length <= maxLines && lines.every((l) => ctx.measureText(l).width <= maxWidth)) return { size: s, lines };
    }
    return fitFont(ctx, text, maxWidth, maxLines, min, min, 800);
  }
  function wrapWords(ctx, text, maxWidth) {
    const words = String(text ?? "").replace(/\s+/g, " ").trim().split(" ").filter(Boolean);
    const lines = [];
    let cur = "";
    for (const w of words) {
      const next = cur ? `${cur} ${w}` : w;
      if (!cur || ctx.measureText(next).width <= maxWidth) cur = next;
      else { lines.push(cur); cur = w; }
    }
    if (cur) lines.push(cur);
    return lines;
  }
  // 강조 낱말만 색을 바꿔 그립니다
  function drawRichLines(ctx, lines, x, y, lh, color, hiColor, highlight, align = "left") {
    const hi = String(highlight || "").trim();
    lines.forEach((line, li) => {
      const parts = hi && line.includes(hi) ? line.split(hi).flatMap((p, i, arr) => (i < arr.length - 1 ? [p, hi] : [p])) : [line];
      const total = ctx.measureText(line).width;
      let cx = align === "center" ? x - total / 2 : x;
      parts.forEach((p) => {
        if (!p) return;
        ctx.fillStyle = hi && p === hi ? hiColor : color;
        ctx.fillText(p, cx, y + li * lh);
        cx += ctx.measureText(p).width;
      });
    });
    return y + (lines.length - 1) * lh;
  }
  function defaultBadge(spec) {
    if (spec.badge) return String(spec.badge).slice(0, 14);
    const y = String(spec.title || "").match(/20\d\d/);
    return y ? `${y[0]} 최신` : "";
  }

  function drawCover(ctx, spec, office, logo, photo) {
    const { layout, t, num } = coverStyle(spec);
    const seed = hashStr(spec.title || "");
    const badge = defaultBadge(spec);
    const title = spec.title || "";
    const hi = spec.highlight;
    const offLine = officeLine(office);
    ctx.textAlign = "left";
    ctx.textBaseline = "alphabetic";

    if (layout === "left") {
      if (photo) {
        drawPhotoFill(ctx, photo, 0, 0, W, H);
        shade(ctx, 0, 0, W, H, t.rgb, 0.95, 0.3);
      } else drawPlainBg(ctx, t, 0, 0, W, H, seed);
      let y = 110;
      y += drawBadge(ctx, badge, 80, y, t.accent, t.bg1) + 36;
      const tt = fitTitle(ctx, title, 860, 3, 84, 52);
      const last = drawRichLines(ctx, tt.lines, 80, y + tt.size * 0.85, tt.size * 1.22, "#fff", t.accent, hi);
      if (spec.subtitle) {
        const s = fitFont(ctx, spec.subtitle, 820, 2, 34, 26, 500);
        ctx.fillStyle = t.sub;
        drawLines(ctx, s.lines, 80, last + s.size + 40, s.size * 1.4);
      }
      drawLogoBadge(ctx, logo, W - 80, H - 120, 110);
      ctx.fillStyle = "rgba(255,255,255,.85)";
      ctx.font = f(22, 600);
      ctx.fillText(wrap(ctx, offLine, 700, 1)[0] || "", 80, H - 72);
    }

    if (layout === "bottom") {
      // 위 사진, 아래 색 띠 (잡지 표지형)
      const py = 470;
      if (photo) drawPhotoFill(ctx, photo, 0, 0, W, py);
      else drawPlainBg(ctx, t, 0, 0, W, py, seed);
      shade(ctx, 0, 0, W, 160, "0,0,0", 0.35, 0, "v");
      ctx.fillStyle = t.bg1;
      ctx.fillRect(0, py, W, H - py);
      ctx.fillStyle = t.accent;
      ctx.fillRect(0, py, W, 10);
      drawLogoBadge(ctx, logo, W - 50, 80, 76);
      if (badge) drawBadge(ctx, badge, 70, py - 30, t.accent, t.bg1, "left", 26);
      const tt = fitTitle(ctx, title, W - 140, 2, 72, 46);
      const last = drawRichLines(ctx, tt.lines, 70, py + 60 + tt.size * 0.9, tt.size * 1.2, "#fff", t.accent, hi);
      if (spec.subtitle && last + 70 < H - 60) {
        ctx.font = f(28, 500);
        ctx.fillStyle = t.sub;
        ctx.fillText(wrap(ctx, spec.subtitle, W - 140, 1)[0], 70, last + 58);
      }
      ctx.font = f(20, 600);
      ctx.fillStyle = "rgba(255,255,255,.7)";
      ctx.fillText(wrap(ctx, offLine, W - 140, 1)[0] || "", 70, H - 32);
    }

    if (layout === "split") {
      // 왼쪽 색 면 + 오른쪽 사진 (비스듬한 경계)
      drawPlainBg(ctx, t, 0, 0, W, H, seed + 1);
      ctx.save();
      ctx.beginPath();
      ctx.moveTo(640, 0); ctx.lineTo(W, 0); ctx.lineTo(W, H); ctx.lineTo(520, H); ctx.closePath();
      ctx.clip();
      if (photo) drawPhotoFill(ctx, photo, 520, 0, W - 520, H);
      else drawPlainBg(ctx, { ...t, bg1: t.bg2, bg2: t.bg1 }, 520, 0, W - 520, H, seed + 2);
      ctx.restore();
      ctx.strokeStyle = t.accent;
      ctx.lineWidth = 12;
      ctx.beginPath();
      ctx.moveTo(640, 0); ctx.lineTo(520, H);
      ctx.stroke();
      let y = 90;
      y += drawBadge(ctx, badge, 70, y, t.accent, t.bg1) + 34;
      const tt = fitTitle(ctx, title, 500, 4, 70, 44);
      const last = drawRichLines(ctx, tt.lines, 70, y + tt.size * 0.85, tt.size * 1.22, "#fff", t.accent, hi);
      if (spec.subtitle) {
        const s = fitFont(ctx, spec.subtitle, 460, 2, 28, 22, 500);
        ctx.fillStyle = t.sub;
        drawLines(ctx, s.lines, 70, last + s.size + 36, s.size * 1.4);
      }
      drawLogoBadge(ctx, logo, 70 + 190, H - 150, 80);
      ctx.fillStyle = "rgba(255,255,255,.75)";
      ctx.font = f(18, 600);
      ctx.fillText(wrap(ctx, office?.phone || "", 300, 1)[0] || "", 70, H - 40);
    }

    if (layout === "center") {
      if (photo) {
        drawPhotoFill(ctx, photo, 0, 0, W, H);
        ctx.fillStyle = `rgba(${t.rgb},.72)`;
        ctx.fillRect(0, 0, W, H);
      } else drawPlainBg(ctx, t, 0, 0, W, H, seed + 2);
      const tt = fitTitle(ctx, title, 1000, 3, 86, 52);
      const lh = tt.size * 1.22;
      const sub = spec.subtitle ? (ctx.font = f(32, 500), wrap(ctx, spec.subtitle, 900, 1)) : [];
      const blockH = 60 + tt.lines.length * lh + (sub.length ? 70 : 0);
      let y = (H - 90 - blockH) / 2 + 20;
      if (badge) drawBadge(ctx, badge, W / 2, y - 20, t.accent, t.bg1, "center");
      y += 60;
      ctx.font = f(tt.size, 800);
      const last = drawRichLines(ctx, tt.lines, W / 2, y + tt.size * 0.85, lh, "#fff", t.accent, hi, "center");
      ctx.fillStyle = t.accent;
      rr(ctx, W / 2 - 50, last + 34, 100, 8, 4);
      ctx.fill();
      if (sub.length) {
        ctx.font = f(32, 500);
        ctx.fillStyle = t.sub;
        ctx.textAlign = "center";
        ctx.fillText(sub[0], W / 2, last + 100);
        ctx.textAlign = "left";
      }
      ctx.fillStyle = "rgba(0,0,0,.25)";
      ctx.fillRect(0, H - 90, W, 90);
      ctx.font = f(21, 600);
      ctx.fillStyle = "rgba(255,255,255,.9)";
      ctx.fillText(wrap(ctx, offLine, 820, 1)[0] || "", 50, H - 45 + 8);
      drawLogoBadge(ctx, logo, W - 40, H - 45, 58);
    }

    if (layout === "card") {
      // 사진 위 흰 카드 (포스터형)
      if (photo) {
        drawPhotoFill(ctx, photo, 0, 0, W, H);
        ctx.fillStyle = "rgba(0,0,0,.25)";
        ctx.fillRect(0, 0, W, H);
      } else drawPlainBg(ctx, t, 0, 0, W, H, seed);
      const cx = 110, cy = 150, cw = W - 220, ch = 440;
      ctx.shadowColor = "rgba(0,0,0,.3)";
      ctx.shadowBlur = 40;
      ctx.fillStyle = "#fff";
      rr(ctx, cx, cy, cw, ch, 26);
      ctx.fill();
      ctx.shadowBlur = 0;
      ctx.fillStyle = t.accent;
      rr(ctx, cx, cy, 16, ch, 8);
      ctx.fill();
      if (badge) drawBadge(ctx, badge, cx + 60, cy - 26, t.bg1, "#fff", "left", 24);
      const tt = fitTitle(ctx, title, cw - 130, 3, 74, 46);
      const lh = tt.size * 1.22;
      const sub = spec.subtitle ? (ctx.font = f(30, 500), wrap(ctx, spec.subtitle, cw - 130, 1)) : [];
      const blockH = tt.lines.length * lh + (sub.length ? 60 : 0);
      const y0 = cy + (ch - blockH) / 2 + tt.size * 0.85;
      ctx.font = f(tt.size, 800);
      const last = drawRichLines(ctx, tt.lines, cx + 70, y0, lh, t.bg1, t.accent, hi);
      if (sub.length) {
        ctx.font = f(30, 500);
        ctx.fillStyle = "#56637C";
        ctx.fillText(sub[0], cx + 70, last + 62);
      }
      ctx.fillStyle = t.bg1;
      ctx.fillRect(0, H - 110, W, 110);
      ctx.font = f(22, 600);
      ctx.fillStyle = "#fff";
      ctx.fillText(wrap(ctx, offLine, 820, 1)[0] || "", 60, H - 48);
      drawLogoBadge(ctx, logo, W - 50, H - 55, 66);
    }

    if (layout === "number") {
      // 큰 숫자 강조형 (예: 7단계, 5가지)
      if (photo) {
        drawPhotoFill(ctx, photo, 0, 0, W, H);
        shade(ctx, 0, 0, W, H, t.rgb, 0.96, 0.55);
      } else drawPlainBg(ctx, t, 0, 0, W, H, seed + 1);
      const n = num || { n: "", unit: "" };
      ctx.font = f(340, 800);
      ctx.fillStyle = t.accent;
      const nw = ctx.measureText(n.n).width;
      ctx.fillText(n.n, 70, 470);
      if (n.unit) {
        ctx.font = f(64, 800);
        ctx.fillStyle = "#fff";
        ctx.textAlign = "center";
        ctx.fillText(n.unit, 70 + nw / 2, 560);
        ctx.textAlign = "left";
      }
      const tx = Math.max(70 + nw + 60, 420), tw = W - tx - 70;
      let y = 140;
      y += drawBadge(ctx, badge, tx, y, "rgba(255,255,255,.16)", "#fff") + 34;
      const tt = fitTitle(ctx, title, tw, 4, 66, 40);
      const last = drawRichLines(ctx, tt.lines, tx, y + tt.size * 0.85, tt.size * 1.22, "#fff", t.accent, hi);
      if (spec.subtitle) {
        const s = fitFont(ctx, spec.subtitle, tw, 2, 28, 22, 500);
        ctx.fillStyle = t.sub;
        drawLines(ctx, s.lines, tx, last + s.size + 32, s.size * 1.4);
      }
      drawLogoBadge(ctx, logo, W - 70, H - 110, 96);
      ctx.fillStyle = "rgba(255,255,255,.85)";
      ctx.font = f(22, 600);
      ctx.fillText(wrap(ctx, offLine, 760, 1)[0] || "", 80, H - 66);
    }
  }

  const kinds = {
    cover(ctx, spec, office, logo, photo) {
      drawCover(ctx, spec, office, logo, photo);
    },

    stats(ctx, spec, office, logo) {
      const { top, bottom } = frame(ctx, spec, office, logo);
      const items = (spec.items || []).slice(0, 4);
      const n = Math.max(items.length, 1), gap = 24;
      const cw = (W - 140 - gap * (n - 1)) / n, ch = bottom - top;
      items.forEach((it, i) => {
        const x = 70 + i * (cw + gap);
        ctx.fillStyle = C.soft;
        rr(ctx, x, top, cw, ch, 18);
        ctx.fill();
        ctx.fillStyle = C.primary;
        rr(ctx, x, top, cw, 8, 4);
        ctx.fill();
        ctx.fillStyle = C.muted;
        const l = fitFont(ctx, it.label, cw - 48, 2, 32, 24, 700);
        let y = drawLines(ctx, l.lines, x + 24, top + 70, l.size * 1.3);
        ctx.fillStyle = C.navy;
        const v = fitFont(ctx, it.value, cw - 48, 2, n <= 2 ? 92 : n === 3 ? 74 : 58, 34, 800);
        y = drawLines(ctx, v.lines, x + 24, y + v.size + 10, v.size * 1.1);
        if (it.note) {
          ctx.fillStyle = C.muted;
          ctx.font = f(25, 500);
          drawLines(ctx, wrap(ctx, it.note, cw - 48, 3), x + 24, y + 34, 34);
        }
      });
    },

    bar(ctx, spec, office, logo) {
      const { top, bottom } = frame(ctx, spec, office, logo);
      const items = (spec.items || []).filter((i) => Number.isFinite(Number(i.value))).slice(0, 8);
      const max = Math.max(...items.map((i) => Number(i.value)), 1);
      const rowH = Math.min(112, (bottom - top) / Math.max(items.length, 1));
      const y0 = top + (bottom - top - rowH * items.length) / 2;
      const labelW = 280, x0 = 70 + labelW + 20, maxW = W - 70 - x0 - 180;
      items.forEach((it, i) => {
        const y = y0 + i * rowH, cy = y + rowH / 2;
        ctx.textBaseline = "middle";
        ctx.fillStyle = C.fg;
        ctx.font = f(Math.min(32, rowH * 0.42), 700);
        ctx.textAlign = "right";
        ctx.fillText(wrap(ctx, it.label, labelW, 1)[0] || "", 70 + labelW, cy);
        ctx.textAlign = "left";
        const w = Math.max(6, (Number(it.value) / max) * maxW);
        ctx.fillStyle = i === items.length - 1 ? C.primary : "#7E9FDA";
        rr(ctx, x0, cy - rowH * 0.3, w, rowH * 0.6, 6);
        ctx.fill();
        ctx.fillStyle = C.navy;
        ctx.font = f(Math.min(34, rowH * 0.45), 800);
        ctx.fillText(`${Number(it.value).toLocaleString("ko-KR")}${spec.unit ? " " + spec.unit : ""}`, x0 + w + 14, cy);
      });
      ctx.textBaseline = "alphabetic";
    },

    steps(ctx, spec, office, logo) {
      const { top, bottom } = frame(ctx, spec, office, logo);
      const items = (spec.items || []).slice(0, 6);
      const cols = items.length > 4 ? 2 : 1;
      const perCol = Math.ceil(items.length / cols);
      const colW = (W - 140 - (cols - 1) * 40) / cols;
      const rowH = (bottom - top) / Math.max(perCol, 1);
      items.forEach((it, i) => {
        const col = Math.floor(i / perCol), row = i % perCol;
        const x = 70 + col * (colW + 40), y = top + row * rowH;
        const r = Math.min(cols === 2 ? 30 : 34, rowH * 0.3);
        ctx.fillStyle = C.primary;
        ctx.beginPath();
        ctx.arc(x + r, y + r + 4, r, 0, Math.PI * 2);
        ctx.fill();
        if (row < perCol - 1 && i < items.length - 1) {
          ctx.strokeStyle = C.line;
          ctx.lineWidth = 3;
          ctx.beginPath();
          ctx.moveTo(x + r, y + 2 * r + 12);
          ctx.lineTo(x + r, y + rowH - 4);
          ctx.stroke();
        }
        ctx.fillStyle = C.white;
        ctx.font = f(r * 0.95, 800);
        ctx.textAlign = "center";
        ctx.textBaseline = "middle";
        ctx.fillText(String(i + 1), x + r, y + r + 5);
        ctx.textAlign = "left";
        ctx.textBaseline = "alphabetic";
        const tx = x + 2 * r + 20, tw = colW - 2 * r - 20;
        ctx.fillStyle = C.navy;
        const l = fitFont(ctx, it.label, tw, 1, cols === 2 ? 32 : 36, 24, 800);
        ctx.fillText(l.lines[0] || "", tx, y + r + 14);
        if (it.desc) {
          ctx.fillStyle = C.muted;
          const ds = cols === 2 ? 24 : 28, lh = ds * 1.3;
          ctx.font = f(ds, 500);
          const lines = Math.max(1, Math.floor((rowH - r - 24 - ds) / lh) + 1);
          drawLines(ctx, wrap(ctx, it.desc, tw, Math.min(lines, 2)), tx, y + r + 22 + lh, lh);
        }
      });
    },

    compare(ctx, spec, office, logo) {
      const { top, bottom } = frame(ctx, spec, office, logo);
      const cols = (spec.columns || []).slice(0, 4);
      const rows = (spec.rows || []).slice(0, 6);
      const n = Math.max(cols.length, 1);
      const firstW = n > 2 ? 240 : 320;
      const restW = (W - 140 - firstW) / Math.max(n - 1, 1);
      const colX = (c) => (c === 0 ? 70 : 70 + firstW + (c - 1) * restW);
      const colW = (c) => (c === 0 ? firstW : restW);
      const headH = 70, rowH = Math.min(112, (bottom - top - headH) / Math.max(rows.length, 1));
      ctx.save();
      rr(ctx, 70, top, W - 140, headH + rowH * rows.length, 14);
      ctx.clip();
      ctx.fillStyle = C.navy;
      ctx.fillRect(70, top, W - 140, headH);
      cols.forEach((c, i) => {
        ctx.fillStyle = C.white;
        ctx.font = f(28, 800);
        ctx.textBaseline = "middle";
        ctx.fillText(wrap(ctx, c, colW(i) - 36, 1)[0] || "", colX(i) + 20, top + headH / 2);
      });
      rows.forEach((r, ri) => {
        const y = top + headH + ri * rowH;
        ctx.fillStyle = ri % 2 ? C.soft2 : C.white;
        ctx.fillRect(70, y, W - 140, rowH);
        ctx.fillStyle = C.soft;
        ctx.fillRect(70, y, firstW, rowH);
        cols.forEach((_, ci) => {
          ctx.fillStyle = ci === 0 ? C.navy : C.fg;
          const size = Math.min(29, rowH * 0.3);
          ctx.font = f(size, ci === 0 ? 700 : 500);
          const lines = wrap(ctx, r[ci] ?? "", colW(ci) - 40, 2);
          const lh = size * 1.3, y0 = y + rowH / 2 - ((lines.length - 1) * lh) / 2;
          lines.forEach((l, li) => ctx.fillText(l, colX(ci) + 20, y0 + li * lh));
        });
        ctx.strokeStyle = C.line;
        ctx.lineWidth = 1;
        ctx.beginPath();
        ctx.moveTo(70, y + rowH);
        ctx.lineTo(W - 70, y + rowH);
        ctx.stroke();
      });
      ctx.restore();
      ctx.textBaseline = "alphabetic";
    },

    checklist(ctx, spec, office, logo) {
      const { top, bottom } = frame(ctx, spec, office, logo);
      const items = (spec.items || []).slice(0, 8);
      const cols = items.length > 4 ? 2 : 1;
      const perCol = Math.ceil(items.length / cols);
      const colW = (W - 140 - (cols - 1) * 32) / cols;
      const rowH = Math.min(116, (bottom - top) / Math.max(perCol, 1));
      items.forEach((txt, i) => {
        const col = Math.floor(i / perCol), row = i % perCol;
        const x = 70 + col * (colW + 32), y = top + row * rowH;
        ctx.fillStyle = C.soft2;
        rr(ctx, x, y, colW, rowH - 14, 14);
        ctx.fill();
        const cy = y + (rowH - 14) / 2;
        ctx.fillStyle = C.primary;
        rr(ctx, x + 20, cy - 17, 34, 34, 8);
        ctx.fill();
        ctx.strokeStyle = C.white;
        ctx.lineWidth = 4;
        ctx.lineCap = "round";
        ctx.beginPath();
        ctx.moveTo(x + 28, cy);
        ctx.lineTo(x + 35, cy + 8);
        ctx.lineTo(x + 47, cy - 8);
        ctx.stroke();
        ctx.fillStyle = C.fg;
        const size = cols === 2 ? 27 : 32;
        ctx.font = f(size, 600);
        const lines = wrap(ctx, typeof txt === "string" ? txt : txt?.label ?? "", colW - 100, 2);
        const lh = size * 1.3;
        ctx.textBaseline = "middle";
        lines.forEach((l, li) => ctx.fillText(l, x + 74, cy - ((lines.length - 1) * lh) / 2 + li * lh));
        ctx.textBaseline = "alphabetic";
      });
    },

    tip(ctx, spec, office, logo) {
      const { top, bottom } = frame(ctx, spec, office, logo);
      ctx.fillStyle = C.soft;
      rr(ctx, 70, top, W - 140, bottom - top, 20);
      ctx.fill();
      ctx.fillStyle = C.accent;
      ctx.font = f(150, 800);
      ctx.fillText("“", 100, top + 140);
      ctx.fillStyle = C.navy;
      const t = fitFont(ctx, spec.text || spec.caption || "", W - 340, 4, 40, 28, 700);
      const lh = t.size * 1.45;
      const total = t.lines.length * lh;
      drawLines(ctx, t.lines, 210, top + (bottom - top - total) / 2 + t.size, lh);
    },

    photo(ctx, spec, office, logo) {
      const { top, bottom } = frame(ctx, spec, office, logo);
      ctx.setLineDash([14, 10]);
      ctx.strokeStyle = "#C9A93A";
      ctx.lineWidth = 3;
      ctx.fillStyle = "#FFFBEA";
      rr(ctx, 70, top, W - 140, bottom - top, 20);
      ctx.fill();
      ctx.stroke();
      ctx.setLineDash([]);
      // 카메라 아이콘
      const cx = W / 2, cy = top + 110;
      ctx.fillStyle = "#C9A93A";
      rr(ctx, cx - 60, cy - 36, 120, 82, 14);
      ctx.fill();
      rr(ctx, cx - 22, cy - 50, 44, 20, 6);
      ctx.fill();
      ctx.fillStyle = "#FFFBEA";
      ctx.beginPath();
      ctx.arc(cx, cy + 5, 26, 0, Math.PI * 2);
      ctx.fill();
      ctx.textAlign = "center";
      ctx.fillStyle = "#5B4700";
      ctx.font = f(32, 800);
      ctx.fillText("직접 찍은 사진을 넣어 주세요", cx, cy + 105);
      ctx.fillStyle = C.muted;
      ctx.font = f(23, 500);
      drawLines(ctx, wrap(ctx, spec.guide || spec.caption || "", 860, 3), cx, cy + 150, 34);
      ctx.textAlign = "left";
    },
  };

  async function render(spec, office, photo) {
    await loadFonts();
    const logo = await loadLogo();
    const canvas = document.createElement("canvas");
    canvas.width = W;
    canvas.height = H;
    const ctx = canvas.getContext("2d");
    const draw = kinds[spec.kind] || kinds.tip;
    try {
      draw(ctx, spec, office, logo, photo);
    } catch (e) {
      console.error("이미지 그리기 실패", spec, e);
      kinds.tip(ctx, { ...spec, text: spec.caption || spec.title }, office, logo);
    }
    return canvas;
  }

  // 사용자가 올린 사진: 가로 3:2로 맞추고 하단에 제목·로고 워터마크
  async function renderPhoto(spec, office, img) {
    await loadFonts();
    const logo = await loadLogo();
    const canvas = document.createElement("canvas");
    canvas.width = W;
    canvas.height = H;
    const ctx = canvas.getContext("2d");
    const s = Math.max(W / img.width, H / img.height);
    const dw = img.width * s, dh = img.height * s;
    ctx.drawImage(img, (W - dw) / 2, (H - dh) / 2, dw, dh);
    const g = ctx.createLinearGradient(0, H - 220, 0, H);
    g.addColorStop(0, "rgba(11,42,91,0)");
    g.addColorStop(1, "rgba(11,42,91,.85)");
    ctx.fillStyle = g;
    ctx.fillRect(0, H - 220, W, 220);
    ctx.fillStyle = C.white;
    const t = fitFont(ctx, spec.title || "", 820, 1, 40, 28, 800);
    ctx.fillText(t.lines[0] || "", 50, H - 78);
    ctx.font = f(20, 600);
    ctx.fillStyle = "rgba(255,255,255,.85)";
    ctx.fillText(wrap(ctx, officeLine(office), 820, 1)[0] || "", 50, H - 42);
    drawLogoBadge(ctx, logo, W - 40, H - 70, 64);
    return canvas;
  }

  window.MedinetImages = { render, renderPhoto, coverLayouts: LAYOUTS, W, H };
})();
