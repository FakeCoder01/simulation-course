// constants and states
const ALL_STEPS = [1, 0.1, 0.01, 0.001, 0.0001];
const STEP_KEYS = ["1", "0.1", "0.01", "0.001", "0.0001"];
const PALETTE = ["#D94F4F", "#3E7FE8", "#2DB07A", "#C97B28", "#7B5CE0"];

let trajs = [];
let selStep = 0.1;
let busy = false;

// slider and number box sync
const PAIRS = [
  { r: "rv0", n: "nv0", min: 10, max: 500, dp: 0 },
  { r: "rang", n: "nang", min: 1, max: 89, dp: 0 },
  { r: "rmas", n: "nmas", min: 0.1, max: 20, dp: 1 },
  { r: "rcd", n: "ncd", min: 0.01, max: 2, dp: 2 },
  { r: "rare", n: "nare", min: 0.001, max: 0.5, dp: 3 },
];

function trackSlider(el) {
  const lo = +el.min,
    hi = +el.max,
    v = +el.value;
  const pct = Math.max(0, Math.min(100, ((v - lo) / (hi - lo)) * 100));
  el.style.setProperty("--fill", pct + "%");
}

PAIRS.forEach(({ r, n, min, max, dp }) => {
  const sl = id(r),
    ni = id(n);

  sl.addEventListener("input", () => {
    ni.value = fmtVal(sl.value, dp);
    trackSlider(sl);
  });

  const sync = () => {
    let v = parseFloat(ni.value);
    if (isNaN(v)) v = parseFloat(sl.value);
    v = clamp(v, min, max);
    sl.value = v;
    ni.value = fmtVal(v, dp);
    trackSlider(sl);
  };
  ni.addEventListener("change", sync);
  ni.addEventListener("blur", sync);
  ni.addEventListener("keydown", (e) => {
    if (e.key === "Enter") sync();
  });

  trackSlider(sl);
});

// steps
function pickStep(btn) {
  selStep = parseFloat(btn.dataset.v);
  document.querySelectorAll(".sp").forEach((b) => b.classList.remove("active"));
  btn.classList.add("active");
  id("custDt").value = "";
}

function getStep() {
  const c = parseFloat(id("custDt").value);
  return !isNaN(c) && c > 0 ? c : selStep;
}

function params(step) {
  return {
    step: step ?? getStep(),
    v0: +id("rv0").value,
    angle: +id("rang").value,
    mass: +id("rmas").value,
    cd: +id("rcd").value,
    area: +id("rare").value,
    color: "#000",
  };
}

// api calls
async function api(body) {
  const res = await fetch("/lab1/api/simulate", {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify(body),
  });
  if (!res.ok) throw new Error("HTTP " + res.status);
  return res.json();
}

async function runOne() {
  if (busy) return;
  busy = true;
  lock(true);
  setPbar(25);

  const step = getStep();
  const color = colorFor(step);
  try {
    setPbar(55);
    const data = await api({ ...params(step), color });
    data.color = color;
    addTraj(data);
    toast(
      `dt=${step} s — Range ${data.flightRange.toFixed(1)} m, Peak ${data.maxAltitude.toFixed(1)} m`,
    );
  } catch (e) {
    toast(e.message, true);
  } finally {
    busy = false;
    lock(false);
    setPbar(0);
  }
}

async function runAll() {
  if (busy) return;
  busy = true;
  lock(true);

  const wrap = id("rapWrap");
  const track = id("rapTrack");
  const lbl = id("rapLbl");
  const cnt = id("rapCnt");

  wrap.classList.add("show");
  track.innerHTML = ALL_STEPS.map(
    (_, i) => `<div class="rap-seg" id="rseg${i}"></div>`,
  ).join("");

  let done = 0;
  for (let i = 0; i < ALL_STEPS.length; i++) {
    const step = ALL_STEPS[i];
    const color = PALETTE[i];
    lbl.textContent = `Running dt = ${step} s…`;
    cnt.textContent = `${i + 1} / ${ALL_STEPS.length}`;
    id("rseg" + i).classList.add("active");
    setPbar((i / ALL_STEPS.length) * 80);

    try {
      const data = await api({ ...params(step), color });
      data.color = color;
      addTraj(data);
      done++;
    } catch (e) {
      toast(`dt=${step}: ${e.message}`, true);
    }
    id("rseg" + i).classList.remove("active");
    id("rseg" + i).classList.add("done");
  }

  toast(`Finished — ${done}/${ALL_STEPS.length} steps completed.`);
  setPbar(0);
  busy = false;
  lock(false);
  setTimeout(() => {
    wrap.classList.remove("show");
  }, 1000);
}

function clearAll() {
  trajs = [];
  STEP_KEYS.forEach((k) => {
    ["r", "a", "t"].forEach((p) => {
      const el = id(`${p}-${k}`);
      if (el) {
        el.textContent = "—";
        el.className = "";
      }
    });
    const th = id(`th-${k}`);
    if (th) {
      th.style.color = "";
      th.style.fontWeight = "";
    }
  });
  renderList();
  renderLegend();
  draw();
}

function addTraj(data) {
  const idx = trajs.findIndex((t) => t.step === data.step);
  if (idx >= 0) trajs[idx] = data;
  else trajs.push(data);
  updateTable(data);
  renderList();
  renderLegend();
  draw();
}

function colorFor(step) {
  const i = ALL_STEPS.indexOf(step);
  if (i >= 0) return PALETTE[i];
  return PALETTE[trajs.length % PALETTE.length];
}

// table
function keyFor(step) {
  return (
    STEP_KEYS.find((k) => Math.abs(parseFloat(k) - step) / step < 0.01) ?? null
  );
}

function updateTable(data) {
  const k = keyFor(data.step);
  if (!k) return;

  const put = (pre, val) => {
    const el = id(`${pre}-${k}`);
    if (!el) return;
    el.textContent = val.toFixed(2);
    el.className = "filled";
  };
  put("r", data.flightRange);
  put("a", data.maxAltitude);
  put("t", data.terminalSpeed);

  const th = id(`th-${k}`);
  if (th) {
    th.style.color = data.color;
    th.style.fontWeight = "700";
  }
}

// trajectory list
function renderList() {
  const el = id("trajList");
  if (!trajs.length) {
    el.innerHTML =
      '<div class="traj-empty">No trajectories yet. Hit Run to begin.</div>';
    return;
  }
  el.innerHTML = trajs
    .map(
      (t, i) => `
    <div class="traj-row">
      <div class="traj-blob" style="background:${t.color}"></div>
      <div class="traj-info">
        dt = ${t.step} s
        <small>${t.flightRange.toFixed(1)} m range · ${t.maxAltitude.toFixed(1)} m peak · ${t.terminalSpeed.toFixed(1)} m/s</small>
      </div>
      <button class="traj-del" onclick="removeTraj(${i})" title="Remove">✕</button>
    </div>
  `,
    )
    .join("");
}

function removeTraj(i) {
  trajs.splice(i, 1);
  renderList();
  renderLegend();
  draw();
}

function renderLegend() {
  id("legend").innerHTML = trajs
    .map(
      (t) => `
    <div class="leg-item">
      <div class="leg-line" style="background:${t.color}"></div>
      dt=${t.step}
    </div>
  `,
    )
    .join("");
}

// canvas starts here
let cv, cx;

function initCanvas() {
  cv = id("cv");
  cx = cv.getContext("2d");
  resize();
  window.addEventListener("resize", () => {
    resize();
    draw();
  });
  cv.addEventListener("mousemove", onHover);
  cv.addEventListener("mouseleave", () => {
    id("tip").classList.remove("on");
  });
}

function resize() {
  const box = cv.parentElement;
  cv.width = box.clientWidth;
  cv.height = box.clientHeight;
}

const MG = { l: 68, r: 24, t: 20, b: 48 };

function vp() {
  if (!trajs.length) return { x0: 0, x1: 1200, y0: 0, y1: 600 };
  let xM = 0,
    yM = 0;
  trajs.forEach((t) =>
    t.points.forEach((p) => {
      if (p.x > xM) xM = p.x;
      if (p.y > yM) yM = p.y;
    }),
  );
  return { x0: -xM * 0.02, x1: xM * 1.1, y0: -yM * 0.03, y1: yM * 1.15 };
}

function toC(x, y, v) {
  const W = cv.width,
    H = cv.height;
  return [
    MG.l + ((x - v.x0) / (v.x1 - v.x0)) * (W - MG.l - MG.r),
    H - MG.b - ((y - v.y0) / (v.y1 - v.y0)) * (H - MG.t - MG.b),
  ];
}

function fromC(cx2, cy2, v) {
  const W = cv.width,
    H = cv.height;
  return [
    v.x0 + ((cx2 - MG.l) / (W - MG.l - MG.r)) * (v.x1 - v.x0),
    v.y0 + ((H - MG.b - cy2) / (H - MG.t - MG.b)) * (v.y1 - v.y0),
  ];
}

function niceStep(range, n) {
  const r = range / n,
    e = Math.floor(Math.log10(r)),
    f = r / Math.pow(10, e);
  const nf = f < 1.5 ? 1 : f < 3 ? 2 : f < 7 ? 5 : 10;
  return nf * Math.pow(10, e);
}

function draw() {
  if (!cv) return;
  const W = cv.width,
    H = cv.height;
  const v = vp();

  // white bg
  cx.fillStyle = "#FFFFFF";
  cx.fillRect(0, 0, W, H);

  // clip to plot area
  cx.save();
  cx.beginPath();
  cx.rect(MG.l, MG.t, W - MG.l - MG.r, H - MG.t - MG.b);
  cx.clip();

  // grid
  cx.strokeStyle = "#F2EFE9";
  cx.lineWidth = 1;
  const sX = niceStep(v.x1 - v.x0, 8),
    sY = niceStep(v.y1 - v.y0, 6);
  const gx0 = Math.ceil(v.x0 / sX) * sX;
  for (let x = gx0; x <= v.x1; x += sX) {
    const [px] = toC(x, 0, v);
    cx.beginPath();
    cx.moveTo(px, MG.t);
    cx.lineTo(px, H - MG.b);
    cx.stroke();
  }
  const gy0 = Math.ceil(v.y0 / sY) * sY;
  for (let y = gy0; y <= v.y1; y += sY) {
    const [, py] = toC(0, y, v);
    cx.beginPath();
    cx.moveTo(MG.l, py);
    cx.lineTo(W - MG.r, py);
    cx.stroke();
  }

  // trajectories
  trajs.forEach((t) => {
    if (!t.points?.length) return;
    const col = t.color;

    // glow
    cx.save();
    cx.globalAlpha = 0.15;
    cx.strokeStyle = col;
    cx.lineWidth = 9;
    cx.lineJoin = "round";
    cx.lineCap = "round";
    path(t.points, v);
    cx.stroke();
    cx.restore();

    // line
    cx.save();
    cx.strokeStyle = col;
    cx.lineWidth = 2.2;
    cx.lineJoin = "round";
    cx.lineCap = "round";
    path(t.points, v);
    cx.stroke();
    cx.restore();
  });

  cx.restore(); // unclip

  // axes
  cx.strokeStyle = "#DDD9D0";
  cx.lineWidth = 1.5;
  cx.beginPath();
  cx.moveTo(MG.l, MG.t);
  cx.lineTo(MG.l, H - MG.b);
  cx.lineTo(W - MG.r, H - MG.b);
  cx.stroke();

  // tick labels
  cx.fillStyle = "#98AAB8";
  cx.font = "500 10px DM Mono, monospace";

  cx.textAlign = "center";
  for (let x = gx0; x <= v.x1; x += sX) {
    const [px] = toC(x, 0, v);
    if (px < MG.l || px > W - MG.r) continue;
    cx.fillText(fmt(x), px, H - MG.b + 17);
  }

  cx.textAlign = "right";
  for (let y = gy0; y <= v.y1; y += sY) {
    const [, py] = toC(0, y, v);
    if (py < MG.t || py > H - MG.b) continue;
    cx.fillText(fmt(y), MG.l - 7, py + 4);
  }

  // axis labels
  cx.fillStyle = "#7A90A4";
  cx.font = "500 11px DM Sans, sans-serif";
  cx.textAlign = "center";
  cx.fillText("Range (m)", MG.l + (W - MG.l - MG.r) / 2, H - 8);
  cx.save();
  cx.translate(14, MG.t + (H - MG.t - MG.b) / 2);
  cx.rotate(-Math.PI / 2);
  cx.fillText("Altitude (m)", 0, 0);
  cx.restore();

  // endpoint and peak markers
  trajs.forEach((t) => {
    if (!t.points?.length) return;
    const col = t.color;

    const last = t.points[t.points.length - 1];
    const [lx, ly] = toC(last.x, 0, v);
    cx.save();
    cx.fillStyle = col;
    cx.strokeStyle = "#fff";
    cx.lineWidth = 2;
    cx.beginPath();
    cx.arc(lx, ly, 5, 0, Math.PI * 2);
    cx.fill();
    cx.stroke();
    cx.restore();

    const peak = t.points.reduce((a, b) => (b.y > a.y ? b : a));
    const [px2, py2] = toC(peak.x, peak.y, v);
    cx.save();
    cx.fillStyle = "#fff";
    cx.strokeStyle = col;
    cx.lineWidth = 2;
    cx.beginPath();
    cx.arc(px2, py2, 4, 0, Math.PI * 2);
    cx.fill();
    cx.stroke();
    cx.restore();
  });

  // empty state
  if (!trajs.length) {
    cx.fillStyle = "#C4CEDB";
    cx.font = "300 14px DM Sans, sans-serif";
    cx.textAlign = "center";
    cx.fillText("Run a simulation to see trajectories here", W / 2, H / 2 - 8);
    cx.font = "300 12px DM Sans, sans-serif";
    cx.fillStyle = "#D4DAE2";
    cx.fillText(
      "Adjust parameters in the sidebar and click Run Simulation",
      W / 2,
      H / 2 + 14,
    );
  }
}

function path(pts, v) {
  cx.beginPath();
  pts.forEach((p, i) => {
    const [x, y] = toC(p.x, p.y, v);
    i === 0 ? cx.moveTo(x, y) : cx.lineTo(x, y);
  });
}

// hover tooltip
function onHover(e) {
  if (!trajs.length) return;
  const v = vp();
  const rect = cv.getBoundingClientRect();
  const scaleX = cv.width / rect.width,
    scaleY = cv.height / rect.height;
  const mx = (e.clientX - rect.left) * scaleX;
  const my = (e.clientY - rect.top) * scaleY;

  let best = null,
    bestD = Infinity;
  trajs.forEach((t) => {
    t.points.forEach((p) => {
      const [cx2, cy2] = toC(p.x, p.y, v);
      const d = Math.hypot(cx2 - mx, cy2 - my);
      if (d < bestD) {
        bestD = d;
        best = { p, color: t.color, dt: t.step };
      }
    });
  });

  const tip = id("tip");
  if (best && bestD < 28) {
    tip.innerHTML = `
      <span class="tip-color" style="color:${best.color}">dt = ${best.dt} s</span><br>
      x = ${best.p.x.toFixed(1)} m &nbsp;&nbsp; y = ${best.p.y.toFixed(1)} m<br>
      v = ${best.p.v.toFixed(2)} m/s
    `;
    // position tip so it doesn't overflow
    const tw = 170,
      th = 66;
    const rx = e.clientX - rect.left,
      ry = e.clientY - rect.top;
    const ox = rx + tw + 14 > rect.width ? -(tw + 8) : 12;
    const oy = ry + th + 8 > rect.height ? -(th + 4) : 8;
    tip.style.left = rx + ox + "px";
    tip.style.top = ry + oy + "px";
    tip.classList.add("on");
  } else {
    tip.classList.remove("on");
  }
}

// helpers goes here
function id(s) {
  return document.getElementById(s);
}
function clamp(v, lo, hi) {
  return Math.max(lo, Math.min(hi, v));
}
function fmtVal(v, dp) {
  return parseFloat(v).toFixed(dp);
}
function fmt(v) {
  if (Math.abs(v) >= 10000) return (v / 1000).toFixed(0) + "k";
  if (Math.abs(v) >= 1000) return (v / 1000).toFixed(1) + "k";
  if (Number.isInteger(v) || Math.abs(v) >= 100)
    return Math.round(v).toString();
  return parseFloat(v.toFixed(2)).toString();
}

function lock(v) {
  id("btnRun").disabled = v;
  id("btnAll").disabled = v;
}

function setPbar(pct) {
  id("pbar").style.width = pct + "%";
}

function toast(msg, err = false) {
  const box = id("toasts");
  const el = document.createElement("div");
  el.className = "toast" + (err ? " err" : "");
  el.textContent = msg;
  box.appendChild(el);
  setTimeout(() => {
    el.style.transition = "opacity 0.4s";
    el.style.opacity = "0";
    setTimeout(() => el.remove(), 420);
  }, 3500);
}

// init
window.addEventListener("load", () => {
  initCanvas();
  draw();
});
