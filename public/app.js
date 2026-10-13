(() => {
  "use strict";

  const canvas = document.getElementById("canvas");
  const wrap = document.getElementById("canvasWrap");
  const svg = document.getElementById("arrowsSvg");
  const ctx = canvas.getContext("2d");
  const statusEl = document.getElementById("status");
  const boardSelect = document.getElementById("boardSelect");
  const boardName = document.getElementById("boardName");

  const btnPen = document.getElementById("btnPen");
  const btnEraser = document.getElementById("btnEraser");
  const btnNote = document.getElementById("btnNote");
  const btnTask = document.getElementById("btnTask");
  const btnColumn = document.getElementById("btnColumn");
  const btnArrow = document.getElementById("btnArrow");
  const btnImage = document.getElementById("btnImage");
  const fileInput = document.getElementById("fileInput");
  const btnUndo = document.getElementById("btnUndo");
  const btnClear = document.getElementById("btnClear");
  const btnSave = document.getElementById("btnSave");
  const btnLoad = document.getElementById("btnLoad");
  const btnDelete = document.getElementById("btnDelete");
  const btnPng = document.getElementById("btnPng");
  const btnTheme = document.getElementById("btnTheme");
  const widthInput = document.getElementById("width");
  const swatches = [...document.querySelectorAll(".swatch")];

  const ERASER_WIDTH_MUL = 6;
  const NOTE_W = 180;
  const NOTE_H = 150;
  const NOTE_COLORS = ["#ffe066", "#ff8fa3", "#8ecdf7", "#b5e48c", "#ffc078"];
  const INK = { dark: "#f4f4f5", light: "#1e1e2e" };
  const ARROW_COLOR = "#7aa2f7";

  let strokes = [];
  let notes = [];
  let columns = [];
  let arrows = [];
  let images = [];
  let tool = "pen";
  let color = INK.dark;
  let arrowFrom = null;
  let drawing = null;
  let currentId = "";
  let dirty = false;
  let statusTimer = null;

  const uid = () =>
    crypto.randomUUID ? crypto.randomUUID() : Math.random().toString(36).slice(2) + Date.now().toString(36);

  const isDark = () => document.body.dataset.theme !== "light";
  const bg = () => (isDark() ? "#1e1e2e" : "#ffffff");

  function R() {
    return wrap.getBoundingClientRect();
  }

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

  function addResizeHandle(el, obj, minW, minH, onResize) {
    const h = document.createElement("div");
    h.className = "resize";
    h.title = "Rozciągnij";
    h.addEventListener("pointerdown", (e) => {
      e.stopPropagation();
      e.preventDefault();
      h.setPointerCapture(e.pointerId);
      const sx = e.clientX;
      const sy = e.clientY;
      const ow = obj.w;
      const oh = obj.h;
      const move = (ev) => {
        obj.w = Math.max(minW, Math.round(ow + ev.clientX - sx));
        obj.h = Math.max(minH, Math.round(oh + ev.clientY - sy));
        el.style.width = obj.w + "px";
        el.style.height = obj.h + "px";
        if (onResize) onResize();
      };
      const up = () => {
        h.removeEventListener("pointermove", move);
        h.removeEventListener("pointerup", up);
        setDirty(true);
      };
      h.addEventListener("pointermove", move);
      h.addEventListener("pointerup", up);
    });
    el.appendChild(h);
  }

  /* ---------- canvas ---------- */

  function resize() {
    const dpr = window.devicePixelRatio || 1;
    const rect = R();
    canvas.width = Math.round(rect.width * dpr);
    canvas.height = Math.round(rect.height * dpr);
    redraw();
    renderColumns();
    renderImages();
    renderNotes();
    renderArrows();
  }

  function drawStroke(s, c = ctx) {
    c.globalCompositeOperation = "source-over";
    c.strokeStyle = s.tool === "eraser" ? bg() : s.color;
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
    ctx.fillStyle = bg();
    ctx.fillRect(0, 0, canvas.width, canvas.height);
    for (const s of strokes) drawStroke(s);
  }

  function toNorm(x, y) {
    return [x / canvas.width, y / canvas.height];
  }

  canvas.addEventListener("pointerdown", (e) => {
    if (e.button !== 0 && e.pointerType === "mouse") return;
    const dpr = window.devicePixelRatio || 1;
    const [nx, ny] = toNorm(e.offsetX * dpr, e.offsetY * dpr);
    const nxCss = e.offsetX;
    const nyCss = e.offsetY;

    if (tool === "arrow") {
      clearArrowSelection();
      return;
    }

    if (tool === "note" || tool === "task") {
      notes.push({
        id: uid(),
        x: nxCss / R().width - NOTE_W / 2 / R().width,
        y: nyCss / R().height - NOTE_H / 2 / R().height,
        w: NOTE_W,
        h: NOTE_H,
        color: NOTE_COLORS[0],
        type: tool === "task" ? "task" : "note",
        text: "",
        items: tool === "task" ? [{ t: "", done: false }] : [],
        col: null,
      });
      setDirty(true);
      renderNotes();
      const tas = wrap.querySelectorAll(".note textarea, .note .task-row input[type=text]");
      tas[tas.length - 1]?.focus();
      return;
    }

    if (tool === "column") {
      columns.push({
        id: uid(),
        x: nxCss / R().width - 130 / R().width,
        y: nyCss / R().height - 20 / R().height,
        w: 260,
        h: 360,
        title: "Kolumna",
      });
      setDirty(true);
      renderColumns();
      const inputs = wrap.querySelectorAll(".column-bar input");
      inputs[inputs.length - 1]?.focus();
      inputs[inputs.length - 1]?.select();
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

  canvas.addEventListener("pointerup", () => (drawing = null));
  canvas.addEventListener("pointercancel", () => (drawing = null));

  /* ---------- theme ---------- */

  function applyTheme(theme) {
    document.body.dataset.theme = theme;
    localStorage.setItem("wb-theme", theme);
    btnTheme.textContent = theme === "dark" ? "☀️" : "🌙";
    const oldInk = theme === "dark" ? INK.light : INK.dark;
    const newInk = theme === "dark" ? INK.dark : INK.light;
    if (color === oldInk) color = newInk;
    swatches[0].dataset.color = newInk;
    swatches[0].style.background = newInk;
    redraw();
    renderArrows();
  }

  btnTheme.addEventListener("click", () =>
    applyTheme(isDark() ? "light" : "dark")
  );

  /* ---------- columns ---------- */

  function colNotes(colId) {
    return notes.filter((n) => n.col === colId);
  }

  function renderColumns() {
    for (const el of [...wrap.querySelectorAll(".column")]) el.remove();
    const rect = R();
    for (const c of columns) {
      const el = document.createElement("div");
      el.className = "column";
      el.dataset.id = c.id;
      el.style.left = clamp(c.x, 0, 1) * rect.width + "px";
      el.style.top = clamp(c.y, 0, 1) * rect.height + "px";
      el.style.width = c.w + "px";
      el.style.height = c.h + "px";
      if (arrowFrom === c.id) el.classList.add("selected");

      const bar = document.createElement("div");
      bar.className = "column-bar";

      const title = document.createElement("input");
      title.value = c.title || "";
      title.placeholder = "Nazwa kolumny";
      title.addEventListener("input", () => {
        c.title = title.value;
        setDirty(true);
      });
      title.addEventListener("pointerdown", (e) => e.stopPropagation());
      bar.appendChild(title);

      const del = document.createElement("button");
      del.className = "column-del";
      del.textContent = "×";
      del.title = "Usuń kolumnę";
      del.addEventListener("click", (e) => {
        e.stopPropagation();
        for (const n of colNotes(c.id)) {
          const nel = wrap.querySelector('[data-id="' + CSS.escape(n.id) + '"]');
          if (nel) {
            n.x = parseFloat(nel.style.left) / rect.width;
            n.y = parseFloat(nel.style.top) / rect.height;
          }
          n.col = null;
        }
        columns = columns.filter((m) => m !== c);
        setDirty(true);
        renderColumns();
        renderNotes();
        renderArrows();
      });
      bar.appendChild(del);

      addResizeHandle(el, c, 200, 240, () => {
        renderNotes();
        renderArrows();
      });

      bar.addEventListener("pointerdown", (e) => {
        if (tool === "arrow") {
          handleArrowClick(c.id, el);
          return;
        }
        if (e.target !== bar) return;
        e.preventDefault();
        bar.setPointerCapture(e.pointerId);
        const startX = e.clientX;
        const startY = e.clientY;
        const origX = c.x;
        const origY = c.y;
        const move = (ev) => {
          c.x = clamp(origX + (ev.clientX - startX) / rect.width, 0, 1);
          c.y = clamp(origY + (ev.clientY - startY) / rect.height, 0, 1);
          el.style.left = c.x * rect.width + "px";
          el.style.top = c.y * rect.height + "px";
          renderNotes();
          renderArrows();
        };
        const up = () => {
          bar.removeEventListener("pointermove", move);
          bar.removeEventListener("pointerup", up);
          setDirty(true);
        };
        bar.addEventListener("pointermove", move);
        bar.addEventListener("pointerup", up);
      });

      el.appendChild(bar);
      wrap.appendChild(el);
    }
  }

  /* ---------- notes ---------- */

  function stackedPos(n, idx, rect) {
    const c = columns.find((m) => m.id === n.col);
    if (!c) return null;
    const x = clamp(c.x, 0, 1) * rect.width + 10;
    const y = clamp(c.y, 0, 1) * rect.height + 38 + idx * (NOTE_H + 10);
    return { x, y, w: c.w - 20 };
  }

  function colIndex(n) {
    return colNotes(n.col).indexOf(n);
  }

  function renderNotes() {
    for (const el of [...wrap.querySelectorAll(".note")]) el.remove();
    const rect = R();
    for (const n of notes) {
      const sp = n.col ? stackedPos(n, colIndex(n), rect) : null;
      const el = document.createElement("div");
      el.className = "note";
      el.dataset.id = n.id;
      const w = sp ? sp.w : n.w;
      const h = sp ? NOTE_H : n.h;
      const x = sp ? sp.x : clamp(n.x, 0, 1) * rect.width;
      const y = sp ? sp.y : clamp(n.y, 0, 1) * rect.height;
      el.style.left = x + "px";
      el.style.top = y + "px";
      el.style.width = w + "px";
      el.style.height = h + "px";
      el.style.background = n.color;
      if (arrowFrom === n.id) el.classList.add("selected");

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
      del.title = "Usuń";
      del.addEventListener("click", (e) => {
        e.stopPropagation();
        notes = notes.filter((m) => m !== n);
        arrows = arrows.filter((a) => a.from !== n.id && a.to !== n.id);
        setDirty(true);
        renderNotes();
        renderArrows();
      });
      bar.appendChild(del);

      el.appendChild(bar);

      if (!n.col) addResizeHandle(el, n, 120, 80, renderArrows);

      if (n.type === "task") {
        const list = document.createElement("div");
        list.className = "tasks";
        const renderItems = () => {
          list.innerHTML = "";
          (n.items || []).forEach((it, i) => {
            const row = document.createElement("div");
            row.className = "task-row";
            const cb = document.createElement("input");
            cb.type = "checkbox";
            cb.checked = !!it.done;
            cb.addEventListener("change", () => {
              it.done = cb.checked;
              txt.classList.toggle("done", it.done);
              setDirty(true);
            });
            const txt = document.createElement("input");
            txt.type = "text";
            txt.value = it.t || "";
            txt.placeholder = "zadanie...";
            txt.classList.toggle("done", !!it.done);
            txt.addEventListener("input", () => {
              it.t = txt.value;
              setDirty(true);
            });
            txt.addEventListener("pointerdown", (e) => e.stopPropagation());
            const rm = document.createElement("button");
            rm.className = "task-del";
            rm.textContent = "×";
            rm.title = "Usuń zadanie";
            rm.addEventListener("click", () => {
              n.items.splice(i, 1);
              setDirty(true);
              renderItems();
            });
            row.append(cb, txt, rm);
            list.appendChild(row);
          });
        };
        renderItems();
        const add = document.createElement("button");
        add.className = "task-add";
        add.textContent = "+ zadanie";
        add.addEventListener("click", () => {
          n.items.push({ t: "", done: false });
          setDirty(true);
          renderItems();
          const inputs = list.querySelectorAll("input[type=text]");
          inputs[inputs.length - 1]?.focus();
        });
        add.addEventListener("pointerdown", (e) => e.stopPropagation());
        list.appendChild(add);
        el.appendChild(list);
      } else {
        const ta = document.createElement("textarea");
        ta.value = n.text || "";
        ta.placeholder = "napisz coś...";
        ta.addEventListener("input", () => {
          n.text = ta.value;
          setDirty(true);
        });
        ta.addEventListener("pointerdown", (e) => e.stopPropagation());
        el.appendChild(ta);
      }

      bar.addEventListener("pointerdown", (e) => {
        if (tool === "arrow") {
          handleArrowClick(n.id, el);
          return;
        }
        if (e.target !== bar) return;
        e.preventDefault();
        if (n.col) {
          n.x = parseFloat(el.style.left) / rect.width;
          n.y = parseFloat(el.style.top) / rect.height;
          n.w = parseFloat(el.style.width);
          n.h = NOTE_H;
          n.col = null;
        }
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
          renderArrows();
        };
        const up = () => {
          bar.removeEventListener("pointermove", move);
          bar.removeEventListener("pointerup", up);
          const cx = (n.x * rect.width + w / 2) / rect.width;
          const cy = (n.y * rect.height + h / 2) / rect.height;
          const target = columns.find(
            (c) =>
              cx >= c.x &&
              cx <= c.x + c.w / rect.width &&
              cy >= c.y &&
              cy <= c.y + c.h / rect.height
          );
          if (target) {
            n.col = target.id;
            notes = notes.filter((m) => m !== n);
            notes.push(n);
          }
          setDirty(true);
          renderNotes();
          renderArrows();
        };
        bar.addEventListener("pointermove", move);
        bar.addEventListener("pointerup", up);
      });

      wrap.appendChild(el);
    }
  }

  /* ---------- arrows ---------- */

  function clearArrowSelection() {
    arrowFrom = null;
    for (const el of wrap.querySelectorAll(".selected")) el.classList.remove("selected");
  }

  function handleArrowClick(id, el) {
    if (!arrowFrom) {
      arrowFrom = id;
      el.classList.add("selected");
      return;
    }
    if (arrowFrom === id) {
      clearArrowSelection();
      return;
    }
    arrows.push({ id: uid(), from: arrowFrom, to: id });
    clearArrowSelection();
    setDirty(true);
    renderArrows();
  }

  function edgePoint(cx, cy, tx, ty, w, h) {
    const dx = tx - cx;
    const dy = ty - cy;
    let t = Infinity;
    if (dx !== 0) t = Math.min(t, w / 2 / Math.abs(dx));
    if (dy !== 0) t = Math.min(t, h / 2 / Math.abs(dy));
    if (!isFinite(t)) t = 0;
    return [cx + dx * t, cy + dy * t];
  }

  function renderArrows() {
    const rect = R();
    let html =
      '<defs><marker id="ah" viewBox="0 0 10 10" refX="9" refY="5" markerWidth="7" markerHeight="7" orient="auto-start-reverse"><path d="M0,0 L10,5 L0,10 z" fill="' +
      ARROW_COLOR +
      '"/></marker></defs>';
    for (const a of arrows) {
      const fe = wrap.querySelector('[data-id="' + CSS.escape(a.from) + '"]');
      const te = wrap.querySelector('[data-id="' + CSS.escape(a.to) + '"]');
      if (!fe || !te) continue;
      const fr = fe.getBoundingClientRect();
      const tr = te.getBoundingClientRect();
      const fc = [fr.left - rect.left + fr.width / 2, fr.top - rect.top + fr.height / 2];
      const tc = [tr.left - rect.left + tr.width / 2, tr.top - rect.top + tr.height / 2];
      const p1 = edgePoint(fc[0], fc[1], tc[0], tc[1], fr.width, fr.height);
      const p2 = edgePoint(tc[0], tc[1], fc[0], fc[1], tr.width, tr.height);
      html +=
        '<path data-id="' +
        a.id +
        '" d="M' +
        p1[0] +
        "," +
        p1[1] +
        " L" +
        p2[0] +
        "," +
        p2[1] +
        '" stroke="' +
        ARROW_COLOR +
        '" stroke-width="2.5" fill="none" marker-end="url(#ah)"/>';
    }
    svg.innerHTML = html;
    for (const p of svg.querySelectorAll("path[data-id]")) {
      p.addEventListener("pointerdown", () => {
        if (tool !== "arrow") return;
        arrows = arrows.filter((m) => m.id !== p.dataset.id);
        setDirty(true);
        renderArrows();
      });
    }
  }

  /* ---------- images ---------- */

  function addImageFromData(data, natW, natH) {
    const rect = R();
    const w = Math.min(natW, 320);
    const h = (natH / natW) * w;
    images.push({
      id: uid(),
      x: clamp(0.2 + Math.random() * 0.4, 0, 1),
      y: clamp(0.15 + Math.random() * 0.4, 0, 1),
      w,
      h,
      data,
    });
    setDirty(true);
    renderImages();
  }

  async function addImages(files) {
    for (const file of files) {
      if (!file.type.startsWith("image/")) continue;
      const url = await new Promise((res) => {
        const fr = new FileReader();
        fr.onload = () => res(fr.result);
        fr.readAsDataURL(file);
      });
      const img = new Image();
      await new Promise((res, rej) => {
        img.onload = res;
        img.onerror = rej;
        img.src = url;
      });
      let w = img.naturalWidth;
      let h = img.naturalHeight;
      if (Math.max(w, h) > 2000) {
        const scale = 2000 / Math.max(w, h);
        const tmp = document.createElement("canvas");
        tmp.width = Math.round(w * scale);
        tmp.height = Math.round(h * scale);
        tmp.getContext("2d").drawImage(img, 0, 0, tmp.width, tmp.height);
        const smaller = tmp.toDataURL("image/png");
        addImageFromData(smaller, tmp.width, tmp.height);
      } else {
        addImageFromData(url, w, h);
      }
    }
  }

  btnImage.addEventListener("click", () => fileInput.click());
  fileInput.addEventListener("change", async () => {
    await addImages([...fileInput.files]);
    fileInput.value = "";
  });

  window.addEventListener("paste", (e) => {
    const files = [...(e.clipboardData?.items || [])]
      .filter((i) => i.type.startsWith("image/"))
      .map((i) => i.getAsFile())
      .filter(Boolean);
    if (files.length) {
      e.preventDefault();
      addImages(files);
    }
  });

  function renderImages() {
    for (const el of [...wrap.querySelectorAll(".image-card")]) el.remove();
    const rect = R();
    for (const im of images) {
      const el = document.createElement("div");
      el.className = "image-card";
      el.dataset.id = im.id;
      el.style.left = clamp(im.x, 0, 1) * rect.width + "px";
      el.style.top = clamp(im.y, 0, 1) * rect.height + "px";
      el.style.width = im.w + "px";
      el.style.height = im.h + "px";
      const img = document.createElement("img");
      img.src = im.data;
      img.alt = "";
      const del = document.createElement("button");
      del.className = "img-del";
      del.textContent = "×";
      del.title = "Usuń obrazek";
      del.addEventListener("pointerdown", (e) => e.stopPropagation());
      del.addEventListener("click", (e) => {
        e.stopPropagation();
        images = images.filter((m) => m !== im);
        setDirty(true);
        renderImages();
      });
      el.append(img, del);

      addResizeHandle(el, im, 60, 40);

      el.addEventListener("pointerdown", (e) => {
        if (tool === "arrow" || e.target === del) return;
        e.preventDefault();
        el.setPointerCapture(e.pointerId);
        const startX = e.clientX;
        const startY = e.clientY;
        const origX = im.x;
        const origY = im.y;
        const move = (ev) => {
          im.x = clamp(origX + (ev.clientX - startX) / rect.width, 0, 1);
          im.y = clamp(origY + (ev.clientY - startY) / rect.height, 0, 1);
          el.style.left = im.x * rect.width + "px";
          el.style.top = im.y * rect.height + "px";
        };
        const up = () => {
          el.removeEventListener("pointermove", move);
          el.removeEventListener("pointerup", up);
          setDirty(true);
        };
        el.addEventListener("pointermove", move);
        el.addEventListener("pointerup", up);
      });

      wrap.appendChild(el);
    }
  }

  /* ---------- tools ---------- */

  function setTool(t) {
    tool = t;
    if (t !== "arrow") clearArrowSelection();
    for (const b of [btnPen, btnEraser, btnNote, btnTask, btnColumn, btnArrow, btnImage])
      b.classList.toggle("active", b.dataset.tool === t);
  }

  btnPen.dataset.tool = "pen";
  btnEraser.dataset.tool = "eraser";
  btnNote.dataset.tool = "note";
  btnTask.dataset.tool = "task";
  btnColumn.dataset.tool = "column";
  btnArrow.dataset.tool = "arrow";
  btnImage.dataset.tool = "image";

  btnPen.addEventListener("click", () => setTool("pen"));
  btnEraser.addEventListener("click", () => setTool("eraser"));
  btnNote.addEventListener("click", () => setTool("note"));
  btnTask.addEventListener("click", () => setTool("task"));
  btnColumn.addEventListener("click", () => setTool("column"));
  btnArrow.addEventListener("click", () => setTool("arrow"));
  btnImage.addEventListener("click", () => setTool("pen"));

  swatches.forEach((sw, i) =>
    sw.addEventListener("click", () => {
      color = sw.dataset.color;
      swatches.forEach((s) => s.classList.toggle("active", s === sw));
      setTool("pen");
      if (i === 0 && isDark()) {
        sw.dataset.color = INK.dark;
        sw.style.background = INK.dark;
      } else if (i === 0) {
        sw.dataset.color = INK.light;
        sw.style.background = INK.light;
      }
    })
  );

  btnUndo.addEventListener("click", () => {
    strokes.pop();
    setDirty(true);
    redraw();
  });

  btnClear.addEventListener("click", () => {
    const count = strokes.length + notes.length + columns.length + arrows.length + images.length;
    if (count && !confirm("Wyczyścić cały board?")) return;
    strokes = [];
    notes = [];
    columns = [];
    arrows = [];
    images = [];
    setDirty(true);
    redraw();
    renderColumns();
    renderImages();
    renderNotes();
    renderArrows();
  });

  /* ---------- PNG export ---------- */

  function wrapText(c, text, x, y, maxW, lineH, maxLines) {
    const words = String(text).split(/\s+/).filter(Boolean);
    let line = "";
    let yy = y;
    let lines = 0;
    for (const w of words) {
      const test = line ? line + " " + w : w;
      if (c.measureText(test).width > maxW && line) {
        c.fillText(line, x, yy);
        line = w;
        yy += lineH;
        lines++;
        if (maxLines && lines >= maxLines) return;
      } else {
        line = test;
      }
    }
    if (line) c.fillText(line, x, yy);
  }

  btnPng.addEventListener("click", async () => {
    const dpr = window.devicePixelRatio || 1;
    const rect = R();
    const tmp = document.createElement("canvas");
    tmp.width = canvas.width;
    tmp.height = canvas.height;
    const t = tmp.getContext("2d");
    t.fillStyle = bg();
    t.fillRect(0, 0, tmp.width, tmp.height);

    for (const c of columns) {
      const x = clamp(c.x, 0, 1) * rect.width * dpr;
      const y = clamp(c.y, 0, 1) * rect.height * dpr;
      const w = c.w * dpr;
      const h = c.h * dpr;
      t.fillStyle = isDark() ? "#27273a" : "#ffffff";
      t.strokeStyle = isDark() ? "#45455e" : "#d4d4d8";
      t.lineWidth = dpr;
      t.beginPath();
      t.roundRect(x, y, w, h, 10 * dpr);
      t.fill();
      t.stroke();
      t.fillStyle = isDark() ? "#e4e4f0" : "#1e1e2e";
      t.font = `bold ${13 * dpr}px system-ui, sans-serif`;
      t.fillText(c.title || "", x + 10 * dpr, y + 24 * dpr);
    }

    for (const a of arrows) {
      const fe = wrap.querySelector('[data-id="' + CSS.escape(a.from) + '"]');
      const te = wrap.querySelector('[data-id="' + CSS.escape(a.to) + '"]');
      if (!fe || !te) continue;
      const fr = fe.getBoundingClientRect();
      const tr = te.getBoundingClientRect();
      const fc = [(fr.left - rect.left + fr.width / 2) * dpr, (fr.top - rect.top + fr.height / 2) * dpr];
      const tc = [(tr.left - rect.left + tr.width / 2) * dpr, (tr.top - rect.top + tr.height / 2) * dpr];
      const p1 = edgePoint(fc[0], fc[1], tc[0], tc[1], fr.width * dpr, fr.height * dpr);
      const p2 = edgePoint(tc[0], tc[1], fc[0], fc[1], tr.width * dpr, tr.height * dpr);
      t.strokeStyle = ARROW_COLOR;
      t.lineWidth = 2.5 * dpr;
      t.beginPath();
      t.moveTo(p1[0], p1[1]);
      t.lineTo(p2[0], p2[1]);
      t.stroke();
      const ang = Math.atan2(p2[1] - p1[1], p2[0] - p1[0]);
      t.fillStyle = ARROW_COLOR;
      t.beginPath();
      t.moveTo(p2[0], p2[1]);
      t.lineTo(p2[0] - 10 * dpr * Math.cos(ang - 0.4), p2[1] - 10 * dpr * Math.sin(ang - 0.4));
      t.lineTo(p2[0] - 10 * dpr * Math.cos(ang + 0.4), p2[1] - 10 * dpr * Math.sin(ang + 0.4));
      t.fill();
    }

    const imgs = await Promise.all(
      images.map(
        (im) =>
          new Promise((res) => {
            const i = new Image();
            i.onload = () => res([im, i]);
            i.onerror = () => res(null);
            i.src = im.data;
          })
      )
    );
    for (const pair of imgs) {
      if (!pair) continue;
      const [im, i] = pair;
      t.drawImage(
        i,
        clamp(im.x, 0, 1) * rect.width * dpr,
        clamp(im.y, 0, 1) * rect.height * dpr,
        im.w * dpr,
        im.h * dpr
      );
    }

    for (const n of notes) {
      const sp = n.col ? stackedPos(n, colIndex(n), rect) : null;
      const w = (sp ? sp.w : n.w) * dpr;
      const h = (sp ? NOTE_H : n.h) * dpr;
      const x = (sp ? sp.x : clamp(n.x, 0, 1) * rect.width) * dpr;
      const y = (sp ? sp.y : clamp(n.y, 0, 1) * rect.height) * dpr;
      t.fillStyle = n.color;
      t.beginPath();
      t.roundRect(x, y, w, h, 4 * dpr);
      t.fill();
      if (n.type === "task") {
        let yy = y + 30 * dpr;
        for (const it of n.items || []) {
          t.strokeStyle = "#1e1e2e";
          t.lineWidth = 1.5 * dpr;
          t.strokeRect(x + 10 * dpr, yy - 9 * dpr, 11 * dpr, 11 * dpr);
          if (it.done) {
            t.beginPath();
            t.moveTo(x + 12 * dpr, yy - 4 * dpr);
            t.lineTo(x + 15 * dpr, yy);
            t.lineTo(x + 21 * dpr, yy - 10 * dpr);
            t.stroke();
          }
          t.fillStyle = "#1e1e2e";
          t.font = `${13 * dpr}px system-ui, sans-serif`;
          if (it.done) {
            t.save();
            t.globalAlpha = 0.55;
          }
          t.fillText(it.t || "", x + 28 * dpr, yy);
          if (it.done) t.restore();
          yy += 20 * dpr;
          if (yy > y + h - 8 * dpr) break;
        }
      } else {
        t.fillStyle = "#1e1e2e";
        t.font = `${14 * dpr}px "Segoe Print", "Comic Sans MS", cursive, system-ui`;
        wrapText(t, n.text || "", x + 10 * dpr, y + 32 * dpr, w - 20 * dpr, 19 * dpr);
      }
    }

    tmp.toBlob((blob) => {
      const a = document.createElement("a");
      a.href = URL.createObjectURL(blob);
      a.download = (currentId || "whiteboard") + ".png";
      a.click();
      URL.revokeObjectURL(a.href);
    });
  });

  /* ---------- boards ---------- */

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
    const d = await res.json();
    strokes = (d.strokes || []).filter((s) => Array.isArray(s.points));
    notes = (d.notes || []).filter((n) => Number.isFinite(n.x) && Number.isFinite(n.y));
    columns = (d.columns || []).filter((c) => Number.isFinite(c.x) && Number.isFinite(c.y));
    arrows = (d.arrows || []).filter((a) => a.from && a.to);
    images = (d.images || []).filter(
      (i) => Number.isFinite(i.x) && Number.isFinite(i.y) && String(i.data || "").startsWith("data:image")
    );
    for (const arr of [notes, columns, images]) for (const o of arr) if (!o.id) o.id = uid();
    currentId = id;
    boardName.value = id;
    boardSelect.value = id;
    setDirty(false);
    redraw();
    renderColumns();
    renderImages();
    renderNotes();
    renderArrows();
    status("Wczytano: " + id);
  }

  btnSave.addEventListener("click", async () => {
    const id = sanitizeId(boardName.value);
    if (!id) return status("Podaj nazwę boardu");
    const empty = !strokes.length && !notes.length && !columns.length && !images.length;
    if (empty && !confirm("Board jest pusty. Zapisać?")) return;
    btnSave.disabled = true;
    try {
      const res = await fetch("/api/boards/" + encodeURIComponent(id), {
        method: "PUT",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ strokes, notes, columns, arrows, images }),
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
        columns = [];
        arrows = [];
        images = [];
        redraw();
        renderColumns();
        renderImages();
        renderNotes();
        renderArrows();
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
  applyTheme(localStorage.getItem("wb-theme") || "dark");
  resize();
  refreshList().catch(() => status("Brak połączenia z serwerem"));
})();
