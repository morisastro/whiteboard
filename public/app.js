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

  let strokes = [];
  let tool = "pen";
  let color = swatches[0].dataset.color;
  let lineWidth = 3;
  let drawing = null;
  let currentId = "";
  let dirty = false;
  let saveTimer = null;

  function status(msg, ms = 2500) {
    statusEl.textContent = msg;
    clearTimeout(saveTimer);
    if (msg && ms > 0) saveTimer = setTimeout(() => (statusEl.textContent = ""), ms);
  }

  function setDirty(v) {
    dirty = v;
    document.title = "Whiteboard" + (v ? " *" : "");
  }

  function resize() {
    const dpr = window.devicePixelRatio || 1;
    const rect = wrap.getBoundingClientRect();
    canvas.width = Math.round(rect.width * dpr);
    canvas.height = Math.round(rect.height * dpr);
    redraw();
  }

  function drawStroke(s) {
    ctx.globalCompositeOperation = "source-over";
    ctx.strokeStyle = s.tool === "eraser" ? ERASER_COLOR : s.color;
    ctx.lineWidth = (s.tool === "eraser" ? s.width * ERASER_WIDTH_MUL : s.width) * (window.devicePixelRatio || 1);
    ctx.lineCap = "round";
    ctx.lineJoin = "round";
    const pts = s.points;
    if (pts.length === 1) {
      ctx.fillStyle = ctx.strokeStyle;
      ctx.beginPath();
      ctx.arc(pts[0][0], pts[0][1], ctx.lineWidth / 2, 0, Math.PI * 2);
      ctx.fill();
      return;
    }
    ctx.beginPath();
    ctx.moveTo(pts[0][0], pts[0][1]);
    for (let i = 1; i < pts.length; i++) ctx.lineTo(pts[i][0], pts[i][1]);
    ctx.stroke();
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
    canvas.setPointerCapture(e.pointerId);
    const [x, y] = toNorm(e.offsetX * (window.devicePixelRatio || 1), e.offsetY * (window.devicePixelRatio || 1));
    drawing = {
      tool,
      color,
      width: Number(widthInput.value),
      points: [[x, y]],
      pixel: [[toCanvas([x, y])[0], toCanvas([x, y])[1]]],
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
    if (!drawing) return;
    drawing = null;
  }

  canvas.addEventListener("pointerup", endStroke);
  canvas.addEventListener("pointercancel", endStroke);

  function setTool(t) {
    tool = t;
    btnPen.classList.toggle("active", t === "pen");
    btnEraser.classList.toggle("active", t === "eraser");
  }

  btnPen.addEventListener("click", () => setTool("pen"));
  btnEraser.addEventListener("click", () => setTool("eraser"));

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
    if (strokes.length && !confirm("Wyczyścić cały board?")) return;
    strokes = [];
    setDirty(true);
    redraw();
  });

  btnPng.addEventListener("click", () => {
    canvas.toBlob((blob) => {
      const a = document.createElement("a");
      a.href = URL.createObjectURL(blob);
      a.download = (currentId || "whiteboard") + ".png";
      a.click();
      URL.revokeObjectURL(a.href);
    });
  });

  function sanitizeId(name) {
    const id = (name || "")
      .toLowerCase()
      .trim()
      .replace(/[^a-z0-9-_]+/g, "-")
      .replace(/^-+|-+$/g, "")
      .slice(0, 64);
    return id;
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
    currentId = id;
    boardName.value = id;
    boardSelect.value = id;
    setDirty(false);
    redraw();
    status("Wczytano: " + id);
  }

  btnSave.addEventListener("click", async () => {
    const id = sanitizeId(boardName.value);
    if (!id) return status("Podaj nazwę boardu");
    if (strokes.length === 0 && !confirm("Board jest pusty. Zapisać?")) return;
    btnSave.disabled = true;
    try {
      const res = await fetch("/api/boards/" + encodeURIComponent(id), {
        method: "PUT",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ strokes }),
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
        redraw();
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
