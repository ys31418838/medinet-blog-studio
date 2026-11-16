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

  const kinds = {
    cover(ctx, spec, office, logo, photo) {
      if (photo) {
        // 찾은 사진을 배경으로 깔고 진한 블루를 덮어 글자가 잘 보이게
        const s = Math.max(W / photo.width, H / photo.height);
        ctx.drawImage(photo, (W - photo.width * s) / 2, (H - photo.height * s) / 2, photo.width * s, photo.height * s);
        const g = ctx.createLinearGradient(0, 0, W, 0);
        g.addColorStop(0, "rgba(11,42,91,.94)");
        g.addColorStop(0.62, "rgba(11,42,91,.78)");
        g.addColorStop(1, "rgba(26,79,176,.35)");
        ctx.fillStyle = g;
        ctx.fillRect(0, 0, W, H);
      } else {
        const g = ctx.createLinearGradient(0, 0, W, H);
        g.addColorStop(0, C.navy);
        g.addColorStop(1, C.primary);
        ctx.fillStyle = g;
        ctx.fillRect(0, 0, W, H);
        // 장식: 지붕 모양 선
        ctx.strokeStyle = "rgba(255,255,255,.07)";
        ctx.lineWidth = 60;
        ctx.beginPath();
        ctx.moveTo(760, 820); ctx.lineTo(1010, 330); ctx.lineTo(1260, 820);
        ctx.stroke();
        ctx.beginPath();
        ctx.moveTo(600, 820); ctx.lineTo(850, 480); ctx.lineTo(1100, 820);
        ctx.stroke();
      }

      ctx.fillStyle = C.accent;
      rr(ctx, 80, 120, 90, 8, 4);
      ctx.fill();

      ctx.fillStyle = C.white;
      const t = fitFont(ctx, spec.title || "", 900, 3, 76, 50, 800);
      let y = drawLines(ctx, t.lines, 80, 210 + t.size * 0.2, t.size * 1.25);
      if (spec.subtitle) {
        ctx.fillStyle = C.sky;
        const s = fitFont(ctx, spec.subtitle, 880, 2, 34, 26, 500);
        drawLines(ctx, s.lines, 80, y + 30, s.size * 1.4);
      }
      drawLogoBadge(ctx, logo, W - 80, H - 130, 120);
      ctx.fillStyle = "rgba(255,255,255,.85)";
      ctx.font = f(22, 600);
      ctx.fillText(wrap(ctx, officeLine(office), 700, 1)[0] || "", 80, H - 80);
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

  window.MedinetImages = { render, renderPhoto, W, H };
})();
