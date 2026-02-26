"use strict";

const API = "/lab2";
const DT_PRESETS = [0.1, 0.01, 0.001, 0.0001];
const DX_PRESETS = [0.1, 0.01, 0.001, 0.0001];
const DT_LBL = ["0.1", "0.01", "0.001", "0.0001"];
const DX_LBL = ["0.1", "0.01", "0.001", "0.0001"];

// graph curve
const PALETTE = [
  "#B85C2C",
  "#D4703C",
  "#2A6A28",
  "#1A6060",
  "#5A4099",
  "#8A3E18",
  "#0E7490",
  "#845A20",
  "#3A6A3A",
  "#C04040",
  "#4A3A90",
  "#6A4020",
  "#1A7A5A",
  "#904060",
  "#407040",
  "#605A20",
];

// states
let runs = []; // array of run objects { id, params, result, color, visible }
let busy = false;
let runId = 0;

// table cells: key = `${dt}_${dx}` → { el, dot }
let tableCells = {};

// params
// continuous sliders (log or linear)
function wireContinuous(sId, vId, fId, opts) {
  const sl = document.getElementById(sId);
  const vl = document.getElementById(vId);
  const fi = document.getElementById(fId);

  function toDisplay(slv) {
    if (opts.log) return Math.pow(10, parseFloat(slv));
    return parseFloat(slv);
  }
  function toSlider(val) {
    if (opts.log) return Math.log10(val);
    return val;
  }
  function updateFill() {
    const min = parseFloat(sl.min),
      max = parseFloat(sl.max),
      val = parseFloat(sl.value);
    const pct = ((val - min) / (max - min)) * 100;
    fi.style.width = pct + "%";
  }

  sl.addEventListener("input", () => {
    const v = toDisplay(sl.value);
    vl.value = opts.decimals != null ? v.toFixed(opts.decimals) : v;
    updateFill();
    onParamChange();
  });
  vl.addEventListener("input", () => {
    let v = parseFloat(vl.value);
    if (isNaN(v)) return;
    v = Math.max(
      parseFloat(opts.min ?? sl.min),
      Math.min(parseFloat(opts.max ?? sl.max), v),
    );
    sl.value = toSlider(v);
    updateFill();
    onParamChange();
  });

  updateFill();
}

// preset-step sliders (Δt / Δx)
function wirePreset(sId, vId, fId, ticksId, presets, labels) {
  const sl = document.getElementById(sId);
  const vl = document.getElementById(vId);
  const fi = document.getElementById(fId);
  const tc = document.getElementById(ticksId);

  // build ticks
  labels.forEach((l, i) => {
    const t = document.createElement("span");
    t.className = "tick";
    t.textContent = l;
    t.dataset.i = i;
    t.addEventListener("click", () => {
      sl.value = i;
      syncPreset();
      onParamChange();
    });
    tc.appendChild(t);
  });

  function syncPreset() {
    const i = parseInt(sl.value);
    vl.value = presets[i];
    fi.style.width = (i / (presets.length - 1)) * 100 + "%";
    tc.querySelectorAll(".tick").forEach((t, j) =>
      t.classList.toggle("on", j === i),
    );
  }

  sl.addEventListener("input", () => {
    syncPreset();
    onParamChange();
  });
  vl.addEventListener("input", () => {
    let v = parseFloat(vl.value);
    if (isNaN(v) || v <= 0) return;
    // find nearest preset
    let best = 0,
      bestD = Infinity;
    presets.forEach((p, i) => {
      const d = Math.abs(Math.log10(p) - Math.log10(v));
      if (d < bestD) {
        bestD = d;
        best = i;
      }
    });
    sl.value = best;
    syncPreset();
    onParamChange();
  });

  syncPreset();
}

// wire all sliders
wireContinuous("s-alpha", "v-alpha", "f-alpha", {
  log: true,
  decimals: 5,
  min: 0.00001,
  max: 0.1,
});
wireContinuous("s-L", "v-L", "f-L", {
  log: false,
  decimals: 1,
  min: 0.1,
  max: 10,
});
wireContinuous("s-T", "v-T", "f-T", {
  log: false,
  decimals: 1,
  min: 0.1,
  max: 20,
});
wireContinuous("s-A", "v-A", "f-A", {
  log: false,
  decimals: 0,
  min: 1,
  max: 1000,
});
wirePreset("s-dt", "v-dt", "f-dt", "ticks-dt", DT_PRESETS, DT_LBL);
wirePreset("s-dx", "v-dx", "f-dx", "ticks-dx", DX_PRESETS, DX_LBL);

// read current param values
function getParams() {
  return {
    alpha: Math.max(
      1e-7,
      parseFloat(document.getElementById("v-alpha").value) || 0.001,
    ),
    L: Math.max(0.01, parseFloat(document.getElementById("v-L").value) || 1.0),
    t_final: Math.max(
      0.01,
      parseFloat(document.getElementById("v-T").value) || 2.0,
    ),
    ic_peak: parseFloat(document.getElementById("v-A").value) || 100,
    dt: Math.max(
      1e-7,
      parseFloat(document.getElementById("v-dt").value) || 0.01,
    ),
    dx: Math.max(
      1e-7,
      parseFloat(document.getElementById("v-dx").value) || 0.01,
    ),
  };
}

// update stability preview whenever a param changes
function onParamChange() {
  const p = getParams();
  const r = (p.alpha * p.dt) / (p.dx * p.dx);
  const ok = r <= 0.5;
  const rEl = document.getElementById("rVal");
  const bd = document.getElementById("stabBadge");
  rEl.textContent = r >= 1e5 ? r.toExponential(2) : r.toFixed(6);
  rEl.className = "stab-r-val " + (ok ? "ok" : "bad");
  bd.textContent = ok ? "✓ Stable" : "✗ Unstable";
  bd.className = "stab-badge " + (ok ? "ok" : "bad");
}
onParamChange();

function initTable() {
  const tbody = document.getElementById("tblBody");
  tbody.innerHTML = "";
  tableCells = {};

  DT_PRESETS.forEach((dt, ti) => {
    const tr = document.createElement("tr");
    const th = document.createElement("td");
    th.textContent = `Δt = ${DT_LBL[ti]}`;
    tr.appendChild(th);

    DX_PRESETS.forEach((dx) => {
      const td = document.createElement("td");
      const cell = document.createElement("div");
      cell.className = "tc tc-empty";
      cell.innerHTML = `<div class="tc-dot"></div><div class="tv">—</div><div class="ts"></div>`;
      td.addEventListener("mouseenter", (e) => showTip(e, dt, dx));
      td.addEventListener("mouseleave", hideTip);
      td.addEventListener("mousemove", moveTip);
      td.appendChild(cell);
      tr.appendChild(td);

      const k = tKey(dt, dx);
      tableCells[k] = {
        el: cell,
        dot: cell.querySelector(".tc-dot"),
        data: null,
      };
    });

    tbody.appendChild(tr);
  });
}
initTable();

function tKey(dt, dx) {
  return `${dt}_${dx}`;
}

function fillTableCell(dt, dx, result, color) {
  const k = tKey(dt, dx);
  const obj = tableCells[k];
  if (!obj) return;

  const { el, dot } = obj;
  obj.data = result;
  obj.color = color;

  el.classList.remove("tc-wait", "tc-empty");

  const r = (result.alpha * dt) / (dx * dx);
  const ok = r <= 0.5;
  const temp = result.temperature;
  const costly =
    result.message && result.message.toLowerCase().includes("cost");

  let state, tv, ts, tp;
  if (temp === null || temp === undefined) {
    state = costly ? "cost" : "bad";
    tv = costly ? "Too costly" : "Diverged";
    ts = `r = ${r >= 1e4 ? r.toExponential(1) : r.toFixed(4)}`;
    tp = costly ? "⚠ Overflow" : "✗ Unstable";
  } else if (!ok) {
    state = "bad";
    tv = "Diverged";
    ts = `r = ${r.toFixed(4)}`;
    tp = "✗ Unstable";
  } else {
    state = "ok";
    tv = temp.toFixed(4) + " °C";
    ts = `r = ${r.toFixed(4)}`;
    tp = "✓ Stable";
  }

  el.setAttribute("data-s", state);
  el.innerHTML = `
    <div class="tc-dot" style="background:${color};display:${color ? "block" : "none"}"></div>
    <div class="tv">${tv}</div>
    <div class="ts">${ts}</div>
    <div class="tp">${tp}</div>`;

  el.classList.add("tc-pop");
  setTimeout(() => el.classList.remove("tc-pop"), 350);
}

// tooltip
const tipEl = document.getElementById("tipEl");
function showTip(e, dt, dx) {
  const obj = tableCells[tKey(dt, dx)];
  if (!obj || !obj.data) return;
  const res = obj.data;
  const r = (res.alpha * dt) / (dx * dx);
  const ok = r <= 0.5 && res.temperature != null;
  const temp = res.temperature;
  document.getElementById("tipTtl").textContent = `Δt = ${dt} s · Δx = ${dx} m`;
  document.getElementById("tipBody").innerHTML = `
    <div class="tip-row"><span class="tl">TEMPERATURE</span><span class="tv2 ${ok ? "g" : "r"}">${temp != null ? temp.toFixed(6) + " °C" : "N/A"}</span></div>
    <div class="tip-row"><span class="tl">COURANT r</span><span class="tv2 ${r <= 0.5 ? "g" : "r"}">${r >= 1e5 ? r.toExponential(3) : r.toFixed(6)} ${r <= 0.5 ? "✓" : "✗"}</span></div>
    <div class="tip-row"><span class="tl">STABILITY</span><span class="tv2 ${r <= 0.5 ? "g" : "r"}">${r <= 0.5 ? "Stable" : "Unstable"}</span></div>
    <div class="tip-row"><span class="tl">NX NODES</span><span class="tv2">${res.nx ?? "—"}</span></div>
    <div class="tip-row"><span class="tl">TIME STEPS</span><span class="tv2">${res.steps ?? "—"}</span></div>
    <div class="tip-row"><span class="tl">α</span><span class="tv2">${res.alpha}</span></div>
    <div class="tip-row"><span class="tl">MSG</span><span class="tv2 w" style="font-size:9px">${(res.message || "").slice(0, 30)}</span></div>`;
  tipEl.classList.add("on");
  moveTip(e);
}
function hideTip() {
  tipEl.classList.remove("on");
}
function moveTip(e) {
  const tw = tipEl.offsetWidth,
    th = tipEl.offsetHeight;
  let l = e.clientX + 16,
    t = e.clientY - 14;
  if (l + tw > window.innerWidth - 8) l = e.clientX - tw - 16;
  if (t + th > window.innerHeight - 8) t = window.innerHeight - th - 8;
  tipEl.style.left = l + "px";
  tipEl.style.top = t + "px";
}

// graph
const canvas = document.getElementById("graphCanvas");
const ctx = canvas.getContext("2d");
const emptyEl = document.getElementById("graphEmpty");

function setupCanvas() {
  const dpr = window.devicePixelRatio || 1;
  const w = canvas.parentElement.clientWidth;
  const h = 320;
  canvas.style.width = w + "px";
  canvas.style.height = h + "px";
  canvas.width = w * dpr;
  canvas.height = h * dpr;
  ctx.setTransform(dpr, 0, 0, dpr, 0, 0);
  return { W: w, H: h };
}

const PAD = { l: 62, r: 24, t: 18, b: 46 };

function drawGraph() {
  const { W, H } = setupCanvas();
  ctx.clearRect(0, 0, W, H);
  ctx.fillStyle = "#FFFFFF";
  ctx.fillRect(0, 0, W, H);

  const visRuns = runs.filter(
    (r) => r.visible && r.result.profile && r.result.profile.length > 0,
  );
  const iW = W - PAD.l - PAD.r;
  const iH = H - PAD.t - PAD.b;

  // determine axis bounds
  let xMax = 1,
    yMin = 0,
    yMax = 100;
  if (visRuns.length > 0) {
    xMax = Math.max(...visRuns.map((r) => r.result.l));
    const allU = visRuns.flatMap((r) => r.result.profile);
    yMin = Math.min(0, ...allU);
    yMax = Math.max(0.001, ...allU, runs[0]?.result.ic_peak || 100);
  }
  const ySpan = yMax - yMin || 1;

  // nice round axis labels
  function niceNum(range, round) {
    const exp = Math.floor(Math.log10(range));
    const f = range / Math.pow(10, exp);
    let nf;
    if (round) {
      if (f < 1.5) nf = 1;
      else if (f < 3) nf = 2;
      else if (f < 7) nf = 5;
      else nf = 10;
    } else {
      if (f <= 1) nf = 1;
      else if (f <= 2) nf = 2;
      else if (f <= 5) nf = 5;
      else nf = 10;
    }
    return nf * Math.pow(10, exp);
  }
  const yStep = niceNum(ySpan / 5, true);
  const yStart = Math.floor(yMin / yStep) * yStep;

  const toX = (x) => PAD.l + (x / xMax) * iW;
  const toY = (u) => PAD.t + iH - ((u - yMin) / ySpan) * iH;

  // grids
  ctx.lineWidth = 1;
  ctx.setLineDash([3, 4]);
  ctx.strokeStyle = "rgba(226,219,208,.7)";

  // horizontal grid lines
  for (let v = yStart; v <= yMax + yStep * 0.5; v += yStep) {
    const y = toY(v);
    if (y < PAD.t - 2 || y > H - PAD.b + 2) continue;
    ctx.beginPath();
    ctx.moveTo(PAD.l, y);
    ctx.lineTo(W - PAD.r, y);
    ctx.stroke();
  }
  // vertical grid lines
  for (let i = 0; i <= 5; i++) {
    const x = PAD.l + (iW * i) / 5;
    ctx.beginPath();
    ctx.moveTo(x, PAD.t);
    ctx.lineTo(x, H - PAD.b);
    ctx.stroke();
  }
  ctx.setLineDash([]);

  // IC line
  if (visRuns.length > 0) {
    const peak = visRuns[0].result.ic_peak;
    const L = visRuns[0].result.l;
    const N = 200;
    ctx.strokeStyle = "rgba(196,184,176,.55)";
    ctx.lineWidth = 1.5;
    ctx.setLineDash([6, 5]);
    ctx.beginPath();
    for (let i = 0; i <= N; i++) {
      const x = (i / N) * L;
      const u = peak * Math.sin((Math.PI * x) / L);
      i === 0 ? ctx.moveTo(toX(x), toY(u)) : ctx.lineTo(toX(x), toY(u));
    }
    ctx.stroke();
    ctx.setLineDash([]);
  }

  // curves
  visRuns.forEach((run) => {
    const { profile, x_values } = run.result;
    if (!profile || profile.length < 2) return;

    ctx.strokeStyle = run.color;
    ctx.lineWidth = 2.2;
    ctx.lineJoin = "round";
    ctx.lineCap = "round";
    ctx.beginPath();
    profile.forEach((u, i) => {
      const x = x_values[i];
      i === 0 ? ctx.moveTo(toX(x), toY(u)) : ctx.lineTo(toX(x), toY(u));
    });
    ctx.stroke();

    // center point marker
    const centerX = run.result.l / 2;
    const centerU = run.result.temperature;
    if (centerU != null) {
      const px = toX(centerX),
        py = toY(centerU);
      ctx.fillStyle = "#FFFFFF";
      ctx.beginPath();
      ctx.arc(px, py, 5, 0, Math.PI * 2);
      ctx.fill();
      ctx.strokeStyle = run.color;
      ctx.lineWidth = 2;
      ctx.beginPath();
      ctx.arc(px, py, 5, 0, Math.PI * 2);
      ctx.stroke();
    }
  });

  // axes
  ctx.strokeStyle = "#9A8C82";
  ctx.lineWidth = 1.5;
  ctx.setLineDash([]);
  ctx.beginPath();
  ctx.moveTo(PAD.l, PAD.t - 4);
  ctx.lineTo(PAD.l, H - PAD.b);
  ctx.moveTo(PAD.l, H - PAD.b);
  ctx.lineTo(W - PAD.r, H - PAD.b);
  ctx.stroke();

  // y labels
  ctx.fillStyle = "#9A8C82";
  ctx.font = '10px "DM Mono", monospace';
  ctx.textAlign = "right";
  for (let v = yStart; v <= yMax + yStep * 0.5; v += yStep) {
    const y = toY(v);
    if (y < PAD.t - 2 || y > H - PAD.b + 2) continue;
    const lbl =
      Math.abs(v) < 0.001
        ? "0"
        : Math.abs(v) >= 1000
          ? v.toExponential(1)
          : v % 1 === 0
            ? v.toFixed(0)
            : v.toFixed(2);
    ctx.fillText(lbl, PAD.l - 7, y + 3.5);
  }

  // x labels
  ctx.textAlign = "center";
  for (let i = 0; i <= 5; i++) {
    const xv = (xMax * i) / 5;
    const px = PAD.l + (iW * i) / 5;
    const lbl = xv === 0 ? "0" : xv.toFixed(xMax <= 1 ? 1 : xMax <= 5 ? 1 : 0);
    ctx.fillText(lbl, px, H - PAD.b + 16);
  }

  // axis labels
  ctx.fillStyle = "#6A5C52";
  ctx.font = '11px "DM Sans", sans-serif';
  ctx.textAlign = "center";
  ctx.fillText("Position x (m)", PAD.l + iW / 2, H - 4);

  ctx.save();
  ctx.translate(12, PAD.t + iH / 2);
  ctx.rotate(-Math.PI / 2);
  ctx.textAlign = "center";
  ctx.fillText("Temperature u (°C)", 0, 0);
  ctx.restore();

  // legend label for IC
  if (visRuns.length > 0) {
    ctx.fillStyle = "rgba(196,184,176,.8)";
    ctx.font = '9px "DM Mono", monospace';
    ctx.textAlign = "left";
    ctx.fillText("IC t=0", PAD.l + 4, PAD.t + 12);
  }

  emptyEl.classList.toggle("hidden", visRuns.length > 0);

  // store for crosshair
  canvas._bounds = { PAD, iW, iH, xMax, yMin, ySpan, W, H };
  canvas._visRuns = visRuns;
}

// crosshair hover
const gtEl = document.getElementById("graphTip");
canvas.addEventListener("mousemove", (e) => {
  if (!canvas._bounds || !canvas._visRuns?.length) return;
  const { PAD, iW, iH, xMax, yMin, ySpan, W, H } = canvas._bounds;
  const rect = canvas.getBoundingClientRect();
  const mx = e.clientX - rect.left;
  const my = e.clientY - rect.top;

  if (mx < PAD.l || mx > W - PAD.r || my < PAD.t || my > H - PAD.b) {
    gtEl.classList.remove("show");
    return;
  }

  const xVal = ((mx - PAD.l) / iW) * xMax;

  // for each visible run, find closest x point
  let rows = "";
  canvas._visRuns.forEach((run) => {
    const { profile, x_values } = run.result;
    if (!profile) return;
    let best = 0,
      bestD = Infinity;
    x_values.forEach((x, i) => {
      const d = Math.abs(x - xVal);
      if (d < bestD) {
        bestD = d;
        best = i;
      }
    });
    const u = profile[best];
    rows += `<div class="gt-row"><span class="gt-lbl" style="color:${run.color}80">Δt=${run.params.dt} Δx=${run.params.dx}</span><span class="gt-val">${u.toFixed(4)}°C</span></div>`;
  });

  gtEl.innerHTML = `<div class="gt-row"><span class="gt-lbl">x</span><span class="gt-val">${xVal.toFixed(4)} m</span></div>${rows}`;
  gtEl.classList.add("show");

  // position tip inside the graph-wrap
  const gw = canvas.parentElement;
  const gwR = gw.getBoundingClientRect();
  let tx = e.clientX - gwR.left + 12;
  let ty = e.clientY - gwR.top - 8;
  const tw = 200,
    th = gtEl.offsetHeight;
  if (tx + tw > gwR.width - 4) tx = e.clientX - gwR.left - tw - 12;
  if (ty + th > gwR.height - 4) ty = gwR.height - th - 4;
  gtEl.style.left = tx + "px";
  gtEl.style.top = ty + "px";

  // draw crosshair
  const { W: cW, H: cH } = canvas._bounds;
  drawGraph(); // redraw base
  ctx.strokeStyle = "rgba(154,140,130,.5)";
  ctx.lineWidth = 1;
  ctx.setLineDash([4, 3]);
  ctx.beginPath();
  ctx.moveTo(mx, PAD.t);
  ctx.lineTo(mx, H - PAD.b);
  ctx.stroke();
  ctx.setLineDash([]);
});
canvas.addEventListener("mouseleave", () => {
  gtEl.classList.remove("show");
  drawGraph();
});

// legend
function buildLegend() {
  const wrap = document.getElementById("legendWrap");
  wrap.innerHTML = "";
  if (runs.length === 0) return;

  // IC entry
  const ic = document.createElement("div");
  ic.className = "lg-item";
  ic.innerHTML = `<div class="lg-swatch" style="background:rgba(196,184,176,.6);border:1.5px dashed #9A8C82"></div><span>IC t=0</span>`;
  wrap.appendChild(ic);

  runs.forEach((run) => {
    const el = document.createElement("div");
    el.className = "lg-item" + (run.visible ? "" : " muted");
    el.dataset.id = run.id;

    const lbl =
      run.result.temperature != null
        ? `Δt=${run.params.dt} Δx=${run.params.dx} → ${run.result.temperature.toFixed(3)}°C`
        : `Δt=${run.params.dt} Δx=${run.params.dx} → diverged`;

    el.innerHTML = `
      <div class="lg-swatch" style="background:${run.color}"></div>
      <span>${lbl}</span>
      <span class="lg-del" data-id="${run.id}">✕</span>`;

    el.querySelector(".lg-del").addEventListener("click", (e) => {
      e.stopPropagation();
      removeRun(run.id);
    });
    el.addEventListener("click", () => toggleRunVisibility(run.id));
    wrap.appendChild(el);
  });
}

function toggleRunVisibility(id) {
  const run = runs.find((r) => r.id === id);
  if (run) {
    run.visible = !run.visible;
    buildLegend();
    drawGraph();
  }
}

function removeRun(id) {
  runs = runs.filter((r) => r.id !== id);
  buildLegend();
  drawGraph();
  updateBadges();
}

// badges
function updateBadges() {
  const stableN = runs.filter(
    (r) => r.result.stable && r.result.temperature != null,
  ).length;
  const unstableN = runs.filter(
    (r) => !r.result.stable || r.result.temperature == null,
  ).length;
  const el = document.getElementById("tableCountBadges");
  el.innerHTML = "";
  if (stableN > 0)
    el.innerHTML += `<span class="bdg bdg-ok">${stableN} Stable</span>`;
  if (unstableN > 0)
    el.innerHTML += `<span class="bdg bdg-bad">${unstableN} Unstable</span>`;

  // also table badges
  const tb = document.getElementById("tblBadges");
  const okN = Object.values(tableCells).filter(
    (c) => c.data?.stable && c.data?.temperature != null,
  ).length;
  const badN = Object.values(tableCells).filter(
    (c) => c.data && (!c.data.stable || c.data.temperature == null),
  ).length;
  tb.innerHTML = "";
  if (okN > 0) tb.innerHTML += `<span class="bdg bdg-ok">${okN} Stable</span>`;
  if (badN > 0)
    tb.innerHTML += `<span class="bdg bdg-bad">${badN} Unstable</span>`;
}

// api calls
async function apiFetch(params) {
  const qs = new URLSearchParams({
    alpha: params.alpha,
    L: params.L,
    t_final: params.t_final,
    ic_peak: params.ic_peak,
    dt: params.dt,
    dx: params.dx,
  });
  const res = await fetch(`${API}/api/simulate?${qs}`);
  if (!res.ok) throw new Error("HTTP " + res.status);
  return res.json();
}

// runs
async function runSingle() {
  if (busy) return;
  const params = getParams();

  const btnS = document.getElementById("btnSingle");
  const btnA = document.getElementById("btnAll");
  const sp = document.getElementById("spinSingle");
  const lb = document.getElementById("lblSingle");

  btnS.disabled = btnA.disabled = true;
  sp.classList.add("on");
  lb.textContent = "Running…";

  try {
    const result = await apiFetch(params);
    addRun(params, result);
  } catch (e) {
    alert("API error — is the backend running?\n" + e.message);
  } finally {
    btnS.disabled = btnA.disabled = false;
    sp.classList.remove("on");
    lb.textContent = "Run Single";
  }
}

// add to run state
function addRun(params, result) {
  const color = PALETTE[runs.length % PALETTE.length];
  const run = {
    id: ++runId,
    params,
    result,
    color,
    visible: true,
  };
  runs.push(run);

  // if dt and dx are preset values, also fill the table
  const dtPreset = DT_PRESETS.includes(params.dt);
  const dxPreset = DX_PRESETS.includes(params.dx);
  if (dtPreset && dxPreset) {
    fillTableCell(params.dt, params.dx, result, color);
  }

  buildLegend();
  drawGraph();
  updateBadges();
}

async function runAll() {
  if (busy) return;
  busy = true;

  const baseParams = getParams(); // alpha, L, T, IC fixed; dt/dx will vary

  const btnS = document.getElementById("btnSingle");
  const btnA = document.getElementById("btnAll");
  const spA = document.getElementById("spinAll");
  const lbA = document.getElementById("lblAll");
  const pw = document.getElementById("progWrap");
  const pf = document.getElementById("progFill");
  const pt = document.getElementById("progTxt");
  const pn = document.getElementById("progNum");

  btnS.disabled = btnA.disabled = true;
  spA.classList.add("on");
  lbA.textContent = "Running 16…";
  pw.classList.add("on");
  pf.style.width = "0%";
  pt.textContent = "Computing…";
  pn.textContent = "0 / 16";

  const total = DT_PRESETS.length * DX_PRESETS.length;
  let done = 0;

  const tasks = DT_PRESETS.flatMap((dt) =>
    DX_PRESETS.map((dx) => {
      const params = { ...baseParams, dt, dx };
      return apiFetch(params)
        .then((result) => {
          addRun(params, result);
        })
        .catch(() => {
          const fake = {
            temperature: null,
            profile: null,
            x_values: null,
            stable: false,
            cfl: 0,
            nx: 0,
            steps: 0,
            message: "Network error",
            alpha: baseParams.alpha,
            l: baseParams.L,
            t_final: baseParams.t_final,
            ic_peak: baseParams.ic_peak,
            dt,
            dx,
          };
          addRun(params, fake);
        })
        .finally(() => {
          done++;
          pf.style.width = (done / total) * 100 + "%";
          pn.textContent = `${done} / ${total}`;
          pt.textContent = done < total ? "Computing…" : "Complete ✓";
        });
    }),
  );

  await Promise.all(tasks);

  btnS.disabled = btnA.disabled = false;
  spA.classList.remove("on");
  lbA.textContent = "Run All 16 Combos";
  busy = false;
}

function clearRuns() {
  runs = [];
  runId = 0;
  initTable();
  buildLegend();
  drawGraph();
  updateBadges();
  document.getElementById("progWrap").classList.remove("on");
  document.getElementById("progFill").style.width = "0%";
  document.getElementById("tableCountBadges").innerHTML = "";
  document.getElementById("tblBadges").innerHTML = "";
}

// init
drawGraph();

window.addEventListener("resize", () => {
  drawGraph();
});
