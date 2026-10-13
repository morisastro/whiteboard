(() => {
  "use strict";

  const canvas = document.getElementById("canvas");
  const wrap = document.getElementById("canvasWrap");
  const ctx = canvas.getContext("2d");
  const statusEl = document.getElementById("status");
  const boardSelect = document.getElementById("boardSelect");
  const boardName = document.getElementById("boardName");

  const btnPen = document.getElementById("btnPen");
  const btnEraser = document.getElementById("btnEraser");
  const btnNote = document.getElementById("btnNote");
  const btnUndo = document.getElementById("btnUndo");
  const btnClear = document.getElementById("btnClear");
  const btnSave = document.getElementById("btnSave");
  const btnLoad = document.getElementById("btnLoad");
  const btnDelete = document.getElementById("btnDelete");
  const btnPng = document.getElementById("btnPng");
  const widthInput = document.getElementById("width");
  const swatches = [...document.querySelectorAll(".swatch")];

  const ERASER_COLOR = "#ffffff";
  const ERASER_WIDTH_MUL = 6;
  const NOTE_W = 180;
  const NOTE_H = 150;
  const NOTE_COLORS = ["#ffe066", "#ff8fa3", "#8ecdf7", "#b5e48c", "#ffc078"];

  let strokes = [];
  let notes = [];
  let tool = "pen";
  let color = swatches[0].dataset.color;
  let lineWidth = 3;
  let drawing = null;
  let currentId = "";
  let dirty = false;
  let statusTimer = null;

  function status(msg, ms = 2500) {
    statusEl.textContent = msg;
    clearTimeout(statusTimer);
    if (msg && ms > 0) statusTimer = setTimeout(() => (statusEl.textContent = ""), ms);
  }

  function setDirty(v) {
    dirty = v;
    document.title = "Whiteboard" + (v ? " *" : "");
  }

  function clamp(v, min, max) {
    return Math.min(max, Math.max(min, v));
  }

  function resize() {
    const dpr = window.devicePixelRatio || 1;
    const rect = wrap.getBoundingClientRect();
    canvas.width = Math.round(rect.width * dpr);
    canvas.height = Math.round(rect.height * dpr);
    redraw();
    renderNotes();
  }

  function drawStroke(s, c = ctx) {
    c.globalCompositeOperation = "source-over";
    c.strokeStyle = s.tool === "eraser" ? ERASER_COLOR : s.color;
    c.lineWidth =
      (s.tool === "eraser" ? s.width * ERASER_WIDTH_MUL : s.width) *
      (window.devicePixelRatio || 1);
    c.lineCap = "round";
    c.lineJoin = "round";
    const pts = s.points;
    if (pts.length === 1) {
      c.fillStyle = c.strokeStyle;
      c.beginPath();
      c.arc(pts[0][0], pts[0][1], c.lineWidth / 2, 0, Math.PI * 2);
      c.fill();
      return;
    }
    c.beginPath();
    c.moveTo(pts[0][0], pts[0][1]);
    for (let i = 1; i < pts.length; i++) c.lineTo(pts[i][0], pts[i][1]);
    c.stroke();
  }

  function redraw() {
    ctx.fillStyle = "#ffffff";
    ctx.fillRect(0, 0, canvas.width, canvas.height);
    for (const s of strokes) drawStroke(s);
  }

  function toNorm(x, y) {
    return [x / canvas.width, y / canvas.height];
  }

  function toCanvas(p) {
    return [p[0] * canvas.width, p[1] * canvas.height];
  }

  canvas.addEventListener("pointerdown", (e) => {
    if (e.button !== 0 && e.pointerType === "mouse") return;
    const dpr = window.devicePixelRatio || 1;
    const [nx, ny] = toNorm(e.offsetX * dpr, e.offsetY * dpr);
    if (tool === "note") {
      notes.push({
        x: nx - (NOTE_W / 2) / (wrap.getBoundingClientRect().width || 1),
        y: ny - (NOTE_H / 2) / (wrap.getBoundingClientRect().height || 1),
        w: NOTE_W,
        h: NOTE_H,
        color: NOTE_COLORS[0],
        text: "",
      });
      setDirty(true);
      renderNotes();
      const tas = wrap.querySelectorAll(".note textarea");
      tas[tas.length - 1]?.focus();
      return;
    }
    canvas.setPointerCapture(e.pointerId);
    drawing = {
      tool,
      color,
      width: Number(widthInput.value),
      points: [[nx, ny]],
      pixel: [[nx * canvas.width, ny * canvas.height]],
    };
    strokes.push(drawing);
    setDirty(true);
    drawStroke({ ...drawing, points: drawing.pixel });
    e.preventDefault();
  });

  canvas.addEventListener("pointermove", (e) => {
    if (!drawing) return;
    const dpr = window.devicePixelRatio || 1;
    const events = e.getCoalescedEvents ? e.getCoalescedEvents() : [e];
    for (const ev of events) {
      const [nx, ny] = toNorm(ev.offsetX * dpr, ev.offsetY * dpr);
      const last = drawing.points[drawing.points.length - 1];
      const dx = (nx - last[0]) * canvas.width;
      const dy = (ny - last[1]) * canvas.height;
      if (dx * dx + dy * dy < 4) continue;
      drawing.points.push([nx, ny]);
      drawing.pixel.push([nx * canvas.width, ny * canvas.height]);
    }
    drawStroke({ ...drawing, points: drawing.pixel.slice(-2) });
  });

  function endStroke() {
    drawing = null;
  }

  canvas.addEventListener("pointerup", endStroke);
  canvas.addEventListener("pointercancel", endStroke);

  function renderNotes() {
    for (const el of [...wrap.querySelectorAll(".note")]) el.remove();
    const rect = wrap.getBoundingClientRect();
    for (const n of notes) {
      const el = document.createElement("div");
      el.className = "note";
      el.style.left = clamp(n.x, 0, 1) * rect.width + "px";
      el.style.top = clamp(n.y, 0, 1) * rect.height + "px";
      el.style.width = n.w + "px";
      el.style.height = n.h + "px";
      el.style.background = n.color;

      const bar = document.createElement("div");
      bar.className = "note-bar";

      const updateDots = () => {
        for (const d of bar.querySelectorAll(".note-dot"))
          d.classList.toggle("active", d.dataset.color === n.color);
      };
      for (const c of NOTE_COLORS) {
        const dot = document.createElement("button");
        dot.className = "note-dot";
        dot.dataset.color = c;
        dot.style.background = c;
        dot.title = "Kolor karteczki";
        dot.addEventListener("click", (e) => {
          e.stopPropagation();
          n.color = c;
          el.style.background = c;
          updateDots();
          setDirty(true);
        });
        bar.appendChild(dot);
      }
      updateDots();

      const del = document.createElement("button");
      del.className = "note-del";
      del.textContent = "×";
      del.title = "Usuń karteczkę";
      del.addEventListener("click", (e) => {
        e.stopPropagation();
        notes = notes.filter((m) => m !== n);
        setDirty(true);
        renderNotes();
      });
      bar.appendChild(del);

      const ta = document.createElement("textarea");
      ta.value = n.text || "";
      ta.placeholder = "napisz coś...";
      ta.addEventListener("input", () => {
        n.text = ta.value;
        setDirty(true);
      });
      ta.addEventListener("pointerdown", (e) => e.stopPropagation());

      el.append(bar, ta);

      bar.addEventListener("pointerdown", (e) => {
        if (e.target !== bar) return;
        e.preventDefault();
        bar.setPointerCapture(e.pointerId);
        const startX = e.clientX;
        const startY = e.clientY;
        const origX = n.x;
        const origY = n.y;
        const move = (ev) => {
          n.x = clamp(origX + (ev.clientX - startX) / rect.width, 0, 1);
          n.y = clamp(origY + (ev.clientY - startY) / rect.height, 0, 1);
          el.style.left = n.x * rect.width + "px";
          el.style.top = n.y * rect.height + "px";
        };
        const up = () => {
          bar.removeEventListener("pointermove", move);
          bar.removeEventListener("pointerup", up);
          setDirty(true);
        };
        bar.addEventListener("pointermove", move);
        bar.addEventListener("pointerup", up);
      });

      wrap.appendChild(el);
    }
  }

  function setTool(t) {
    tool = t;
    btnPen.classList.toggle("active", t === "pen");
    btnEraser.classList.toggle("active", t === "eraser");
    btnNote.classList.toggle("active", t === "note");
  }

  btnPen.addEventListener("click", () => setTool("pen"));
  btnEraser.addEventListener("click", () => setTool("eraser"));
  btnNote.addEventListener("click", () => setTool("note"));

  swatches.forEach((sw) =>
    sw.addEventListener("click", () => {
      color = sw.dataset.color;
      swatches.forEach((s) => s.classList.toggle("active", s === sw));
      setTool("pen");
    })
  );

  btnUndo.addEventListener("click", () => {
    strokes.pop();
    setDirty(true);
    redraw();
  });

  btnClear.addEventListener("click", () => {
    if ((strokes.length || notes.length) && !confirm("Wyczyścić cały board?")) return;
    strokes = [];
    notes = [];
    setDirty(true);
    redraw();
    renderNotes();
  });

  function wrapText(c, text, x, y, maxW, lineH) {
    const words = String(text).split(/\s+/).filter(Boolean);
    let line = "";
    let yy = y;
    for (const w of words) {
      const test = line ? line + " " + w : w;
      if (c.measureText(test).width > maxW && line) {
        c.fillText(line, x, yy);
        line = w;
        yy += lineH;
        if (yy > y + lineH * 12) return;
      } else {
        line = test;
      }
    }
    if (line) c.fillText(line, x, yy);
  }

  btnPng.addEventListener("click", () => {
    const tmp = document.createElement("canvas");
    tmp.width = canvas.width;
    tmp.height = canvas.height;
    const tctx = tmp.getContext("2d");
    tctx.fillStyle = "#ffffff";
    tctx.fillRect(0, 0, tmp.width, tmp.height);
    for (const s of strokes) drawStroke(s, tctx);
    const dpr = window.devicePixelRatio || 1;
    const rect = wrap.getBoundingClientRect();
    for (const n of notes) {
      const x = clamp(n.x, 0, 1) * rect.width * dpr;
      const y = clamp(n.y, 0, 1) * rect.height * dpr;
      const w = n.w * dpr;
      const h = n.h * dpr;
      tctx.fillStyle = n.color;
      tctx.fillRect(x, y, w, h);
      tctx.fillStyle = "#1e1e2e";
      tctx.font = `${14 * dpr}px "Segoe Print", "Comic Sans MS", cursive, system-ui`;
      wrapText(tctx, n.text || "", x + 10 * dpr, y + 32 * dpr, w - 20 * dpr, 19 * dpr);
    }
    tmp.toBlob((blob) => {
      const a = document.createElement("a");
      a.href = URL.createObjectURL(blob);
      a.download = (currentId || "whiteboard") + ".png";
      a.click();
      URL.revokeObjectURL(a.href);
    });
  });

  function sanitizeId(name) {
    return (name || "")
      .toLowerCase()
      .trim()
      .replace(/[^a-z0-9-_]+/g, "-")
      .replace(/^-+|-+$/g, "")
      .slice(0, 64);
  }

  async function refreshList() {
    const res = await fetch("/api/boards");
    if (!res.ok) throw new Error("Nie udało się pobrać listy boardów");
    const { boards } = await res.json();
    boardSelect.innerHTML = '<option value="">— nowy board —</option>';
    for (const id of boards) {
      const opt = document.createElement("option");
      opt.value = id;
      opt.textContent = id;
      boardSelect.appendChild(opt);
    }
  }

  async function loadBoard(id) {
    if (!id) return;
    const res = await fetch("/api/boards/" + encodeURIComponent(id));
    if (!res.ok) return status("Nie udało się wczytać boardu");
    const data = await res.json();
    strokes = (data.strokes || []).filter((s) => Array.isArray(s.points));
    notes = (data.notes || []).filter(
      (n) => Number.isFinite(n.x) && Number.isFinite(n.y)
    );
    currentId = id;
    boardName.value = id;
    boardSelect.value = id;
    setDirty(false);
    redraw();
    renderNotes();
    status("Wczytano: " + id);
  }

  btnSave.addEventListener("click", async () => {
    const id = sanitizeId(boardName.value);
    if (!id) return status("Podaj nazwę boardu");
    if (strokes.length === 0 && notes.length === 0 && !confirm("Board jest pusty. Zapisać?")) return;
    btnSave.disabled = true;
    try {
      const res = await fetch("/api/boards/" + encodeURIComponent(id), {
        method: "PUT",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ strokes, notes }),
      });
      if (!res.ok) throw new Error();
      currentId = id;
      setDirty(false);
      await refreshList();
      boardSelect.value = id;
      status("Zapisano: " + id);
    } catch {
      status("Błąd zapisu");
    } finally {
      btnSave.disabled = false;
    }
  });

  btnLoad.addEventListener("click", () => {
    const id = boardSelect.value;
    if (!id) return status("Wybierz board z listy");
    if (dirty && !confirm("Niezapisane zmiany zostaną utracone. Kontynuować?")) return;
    loadBoard(id).catch(() => status("Błąd wczytywania"));
  });

  btnDelete.addEventListener("click", async () => {
    const id = boardSelect.value;
    if (!id) return status("Wybierz board z listy");
    if (!confirm("Usunąć board '" + id + "'?")) return;
    try {
      const res = await fetch("/api/boards/" + encodeURIComponent(id), { method: "DELETE" });
      if (!res.ok) throw new Error();
      if (currentId === id) {
        currentId = "";
        strokes = [];
        notes = [];
        redraw();
        renderNotes();
      }
      await refreshList();
      status("Usunięto: " + id);
    } catch {
      status("Błąd usuwania");
    }
  });

  boardSelect.addEventListener("change", () => {
    if (boardSelect.value) boardName.value = boardSelect.value;
  });

  window.addEventListener("keydown", (e) => {
    if (e.ctrlKey && e.key === "s") {
      e.preventDefault();
      btnSave.click();
    } else if (e.ctrlKey && e.key === "z") {
      e.preventDefault();
      btnUndo.click();
    }
  });

  new ResizeObserver(resize).observe(wrap);
  resize();
  refreshList().catch(() => status("Brak połączenia z serwerem"));
})();
