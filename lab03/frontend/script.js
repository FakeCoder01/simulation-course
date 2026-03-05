// consts
const GRID_W = 100,
  GRID_H = 100;
const TOTAL = GRID_W * GRID_H;

// state IDs
const S_EMPTY = 0,
  S_YOUNG = 1,
  S_MATURE = 2,
  S_BURNING = 3,
  S_EMBERS = 4,
  S_ASH = 5,
  S_WATER = 6;

// base rgb per state
const BASE_COLORS = [
  [196, 178, 116], // 0 empty - warm soil
  [111, 168, 122], // 1 young - spring green
  [61, 112, 80], // 2 mature - deep forest
  [201, 64, 16], // 3 burning - fire orange
  [158, 42, 8], // 4 embers - deep red
  [122, 114, 101], // 5 ash - warm grey
  [46, 111, 160], // 6 water - clear blue
];

// states
let cells = new Uint8Array(TOTAL);
let elevation = new Float32Array(TOTAL);
let cfg = {};
let stats = {};
let isRunning = false;
let isRaining = false;
let activeTool = 0;
let paintActive = false;
let pendingPaint = [];
let paintTimer = null;
let windAngle = 45;
let windStrength = 0.5;

// canvas setup
const canvasGrid = document.getElementById("canvas-grid");
const canvasEffects = document.getElementById("canvas-effects");
const canvasRain = document.getElementById("canvas-rain");
const ctxGrid = canvasGrid.getContext("2d");
const ctxEff = canvasEffects.getContext("2d");
const ctxRain = canvasRain.getContext("2d");

let CELL_SIZE = 7;
let CANVAS_W, CANVAS_H;

function sizeCanvas() {
  const area = document.getElementById("canvas-area");
  const panel = document.getElementById("panel");
  const header = document.getElementById("header");
  const avW = area.clientWidth - 32;
  const avH = area.clientHeight - 32;
  const side = Math.min(avW, avH, 800);
  CELL_SIZE = Math.max(4, Math.floor(side / GRID_W));
  CANVAS_W = CELL_SIZE * GRID_W;
  CANVAS_H = CELL_SIZE * GRID_H;
  for (const c of [canvasGrid, canvasEffects, canvasRain]) {
    c.width = CANVAS_W;
    c.height = CANVAS_H;
  }
}

window.addEventListener("resize", () => {
  sizeCanvas();
  renderFull();
});
sizeCanvas();

// rendering
const imgData = () => ctxGrid.createImageData(CANVAS_W, CANVAS_H);
let frameData = null;

function clampByte(v) {
  return v < 0 ? 0 : v > 255 ? 255 : v | 0;
}

function renderFull() {
  if (!frameData || frameData.width !== CANVAS_W) {
    frameData = ctxGrid.createImageData(CANVAS_W, CANVAS_H);
  }
  const d = frameData.data;
  const t = performance.now() * 0.001;

  for (let y = 0; y < GRID_H; y++) {
    for (let x = 0; x < GRID_W; x++) {
      const idx = y * GRID_W + x;
      const state = cells[idx];
      const elev = elevation[idx];
      let [r, g, b] = BASE_COLORS[state];

      // elevation shading: subtle tonal variation
      if (state === S_YOUNG || state === S_MATURE) {
        const shade = (elev - 0.5) * 18;
        r = clampByte(r + shade * 0.4);
        g = clampByte(g + shade * 0.8);
        b = clampByte(b + shade * 0.3);
      } else if (state === S_EMPTY) {
        const shade = (elev - 0.5) * 22;
        r = clampByte(r + shade);
        g = clampByte(g + shade * 0.7);
        b = clampByte(b + shade * 0.4);
      }

      // fire flicker
      if (state === S_BURNING) {
        const f = (Math.random() * 2 - 1) * 28;
        r = clampByte(r + f * 0.8);
        g = clampByte(g + f * 0.3 - Math.abs(f) * 0.5);
        b = clampByte(b + f * 0.1);
      }

      // ember glow pulse
      if (state === S_EMBERS) {
        const pulse = Math.sin(t * 3 + x * 0.5 + y * 0.4) * 0.5 + 0.5;
        r = clampByte(r + pulse * 30);
        g = clampByte(g + pulse * 8);
      }

      // write pixels
      for (let py = 0; py < CELL_SIZE; py++) {
        for (let px = 0; px < CELL_SIZE; px++) {
          const i =
            ((y * CELL_SIZE + py) * CANVAS_W + (x * CELL_SIZE + px)) * 4;
          d[i] = r;
          d[i + 1] = g;
          d[i + 2] = b;
          d[i + 3] = 255;
        }
      }
    }
  }
  ctxGrid.putImageData(frameData, 0, 0);
  renderEffects();
}

function renderEffects() {
  ctxEff.clearRect(0, 0, CANVAS_W, CANVAS_H);
  ctxEff.globalCompositeOperation = "source-over";

  // glow for fire cells
  ctxEff.shadowBlur = CELL_SIZE * 2.2;
  for (let y = 0; y < GRID_H; y++) {
    for (let x = 0; x < GRID_W; x++) {
      const st = cells[y * GRID_W + x];
      if (st === S_BURNING) {
        ctxEff.shadowColor = "rgba(255,120,30,0.7)";
        ctxEff.fillStyle = "rgba(255,100,20,0.18)";
        ctxEff.fillRect(x * CELL_SIZE, y * CELL_SIZE, CELL_SIZE, CELL_SIZE);
      } else if (st === S_EMBERS) {
        ctxEff.shadowColor = "rgba(200,60,10,0.5)";
        ctxEff.fillStyle = "rgba(180,50,10,0.12)";
        ctxEff.fillRect(x * CELL_SIZE, y * CELL_SIZE, CELL_SIZE, CELL_SIZE);
      }
    }
  }
  ctxEff.shadowBlur = 0;
}

// rain overlay
const rainDrops = Array.from({ length: 180 }, () => ({
  x: Math.random() * 900,
  y: Math.random() * 900,
  speed: 2.5 + Math.random() * 3,
  len: 7 + Math.random() * 9,
  opacity: 0.3 + Math.random() * 0.4,
}));

function animateRain() {
  ctxRain.clearRect(0, 0, CANVAS_W, CANVAS_H);
  if (!isRaining) return;
  ctxRain.lineWidth = 0.8;
  for (const d of rainDrops) {
    ctxRain.strokeStyle = `rgba(170,210,240,${d.opacity})`;
    ctxRain.beginPath();
    ctxRain.moveTo(d.x, d.y);
    ctxRain.lineTo(d.x + d.len * 0.15, d.y + d.len);
    ctxRain.stroke();

    d.y += d.speed;
    d.x += d.speed * 0.12;

    if (d.y > CANVAS_H + 20) {
      d.y = -20;
      d.x = Math.random() * CANVAS_W;
    }
  }
}

// anim loop
let lastRender = 0;
function loop(ts) {
  if (ts - lastRender > 40) {
    // ~25fps render cap
    renderFull();
    animateRain();
    lastRender = ts;
  }
  requestAnimationFrame(loop);
}
requestAnimationFrame(loop);

// websocket thingy
let ws = null;
let wsReconnectTimer = null;

function connect() {
  const proto = location.protocol === "https:" ? "wss:" : "ws:";
  ws = new WebSocket(`${proto}//${location.host}/lab3/ws`);

  ws.onopen = () => {
    console.log("WS connected");
    clearTimeout(wsReconnectTimer);
  };

  ws.onmessage = ({ data }) => {
    const msg = JSON.parse(data);
    if (msg.type === "full") {
      cells.set(msg.cells);
      elevation.set(msg.elevation);
      cfg = msg.config;

      applyConfig(cfg);
      updateStats(msg.stats);
      updateRunning(msg.running);
    } else if (msg.type === "delta") {
      for (const [idx, state] of msg.changes) {
        cells[idx] = state;
      }
      updateStats(msg.stats);
      updateRunning(msg.running);
    }
  };

  ws.onclose = () => {
    wsReconnectTimer = setTimeout(connect, 2000);
  };
}

connect();

// update UI
function updateRunning(running) {
  isRunning = running;
  const btn = document.getElementById("btn-play");
  if (running) {
    btn.textContent = "⏸ Pause";
    btn.classList.remove("paused");
  } else {
    btn.textContent = "▶ Start";
    btn.classList.add("paused");
  }
}

function updateStats(s) {
  stats = s;
  const total = TOTAL;
  const trees = s.young + s.mature;

  document.getElementById("hstat-trees").textContent = trees;
  document.getElementById("hstat-fire").textContent = s.burning + s.embers;
  document.getElementById("hstat-cover").textContent =
    Math.round((trees / total) * 100) + "%";
  document.getElementById("tick-val").textContent = s.tick.toLocaleString();

  // rain badge
  const rainBadge = document.getElementById("rain-badge");
  const rainCanvas = document.getElementById("canvas-rain");
  if (s.raining !== isRaining) {
    isRaining = s.raining;
    if (isRaining) {
      rainBadge.classList.add("visible");
      rainCanvas.classList.add("visible");
    } else {
      rainBadge.classList.remove("visible");
      rainCanvas.classList.remove("visible");
    }
  }

  // bars
  const setBar = (id, cnt, color) => {
    const pct = Math.min(100, (cnt / total) * 100 * 4); // increased for visibility
    document.getElementById("bar-" + id).style.width = pct + "%";
    document.getElementById("cnt-" + id).textContent = cnt;
  };
  setBar("young", s.young, "#6FA87A");
  setBar("mature", s.mature, "#3D7050");
  setBar("fire", s.burning, "#C94010");
  setBar("embers", s.embers, "#9E2A08");
  setBar("ash", s.ash, "#7A7265");
  setBar("water", s.water, "#2E6FA0");
}

function applyConfig(c) {
  document.getElementById("s-growth").value = c.growth_rate;
  document.getElementById("v-growth").textContent = c.growth_rate.toFixed(3);
  document.getElementById("s-maturity").value = c.maturity_rate;
  document.getElementById("v-maturity").textContent =
    c.maturity_rate.toFixed(3);
  document.getElementById("s-lightning").value = c.lightning_rate;
  document.getElementById("v-lightning").textContent =
    c.lightning_rate.toFixed(5);
  document.getElementById("s-humidity").value = c.humidity;
  document.getElementById("v-humidity").textContent = c.humidity.toFixed(2);
  document.getElementById("s-fps").value = c.fps;
  document.getElementById("v-fps").textContent = c.fps;
  document.getElementById("t-rain").checked = c.rain_enabled;
  document.getElementById("t-ember").checked = c.ember_jump;

  windAngle = c.wind_angle;
  windStrength = c.wind_strength;
  document.getElementById("s-wind-strength").value = windStrength;
  updateCompassUI();
}

async function api(path, body) {
  await fetch(path, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify(body),
  }).catch(console.error);
}

function getConfig() {
  return {
    growth_rate: parseFloat(document.getElementById("s-growth").value),
    maturity_rate: parseFloat(document.getElementById("s-maturity").value),
    lightning_rate: parseFloat(document.getElementById("s-lightning").value),
    humidity: parseFloat(document.getElementById("s-humidity").value),
    wind_angle: windAngle,
    wind_strength: windStrength,
    ember_jump: document.getElementById("t-ember").checked,
    rain_enabled: document.getElementById("t-rain").checked,
    fps: parseInt(document.getElementById("s-fps").value),
  };
}

async function sendConfig() {
  await api("/lab3/api/config", getConfig());
}

let configDebounce = null;
function debouncedConfig() {
  clearTimeout(configDebounce);
  configDebounce = setTimeout(sendConfig, 300);
}

function updateSlider(key, el) {
  const map = {
    growth: ["v-growth", (v) => v.toFixed(3)],
    maturity: ["v-maturity", (v) => v.toFixed(3)],
    lightning: ["v-lightning", (v) => v.toFixed(5)],
    humidity: ["v-humidity", (v) => v.toFixed(2)],
    fps: ["v-fps", (v) => Math.round(v)],
  };
  const [id, fmt] = map[key];
  document.getElementById(id).textContent = fmt(parseFloat(el.value));
  debouncedConfig();
}

function updateWindStrength(el) {
  windStrength = parseFloat(el.value);
  updateCompassUI();
  debouncedConfig();
}

// sim controls
async function toggleSim() {
  await api("/lab3/api/control", {
    action: isRunning ? "pause" : "start",
  });
}

async function stepSim() {
  await api("/lab3/api/control", { action: "step" });
}

async function resetSim() {
  await api("/lab3/api/control", { action: "reset" });
}

async function igniteFire() {
  // start 3 random fires to kick off simulation
  const paintBatch = [];
  for (let i = 0; i < 5; i++) {
    const x = 5 + Math.floor(Math.random() * 90);
    const y = 5 + Math.floor(Math.random() * 90);
    paintBatch.push({ x, y, state: S_BURNING });
    paintBatch.push({ x: x + 1, y, state: S_BURNING });
    paintBatch.push({ x, y: y + 1, state: S_BURNING });
  }
  await api("/lab3/api/paint", { cells: paintBatch });
}

// paint tool
function setTool(el) {
  document
    .querySelectorAll(".tool-btn")
    .forEach((b) => b.classList.remove("active"));
  el.classList.add("active");
  activeTool = parseInt(el.dataset.state);
  canvasGrid.style.cursor = activeTool === 0 ? "default" : "crosshair";
}

function canvasXY(e) {
  const rect = canvasGrid.getBoundingClientRect();
  const cx = (e.clientX - rect.left) * (CANVAS_W / rect.width);
  const cy = (e.clientY - rect.top) * (CANVAS_H / rect.height);
  return {
    x: Math.floor(cx / CELL_SIZE),
    y: Math.floor(cy / CELL_SIZE),
  };
}

function queuePaint(x, y) {
  if (x < 0 || x >= GRID_W || y < 0 || y >= GRID_H) return;
  // no duplicates
  if (!pendingPaint.some((c) => c.x === x && c.y === y)) {
    pendingPaint.push({ x, y, state: activeTool });
    cells[y * GRID_W + x] = activeTool; // optimistic update
  }
}

function flushPaint() {
  if (pendingPaint.length === 0) return;
  api("/lab3/api/paint", { cells: [...pendingPaint] });
  pendingPaint = [];
}

canvasGrid.addEventListener("mousedown", (e) => {
  paintActive = true;
  const { x, y } = canvasXY(e);
  queuePaint(x, y);
  paintTimer = setInterval(flushPaint, 80);
});

canvasGrid.addEventListener("mousemove", (e) => {
  if (!paintActive) return;
  const { x, y } = canvasXY(e);
  queuePaint(x, y);
});

canvasGrid.addEventListener("mouseup", () => {
  paintActive = false;
  clearInterval(paintTimer);
  flushPaint();
});
canvasGrid.addEventListener("mouseleave", () => {
  paintActive = false;
  clearInterval(paintTimer);
  flushPaint();
});

// touch support
canvasGrid.addEventListener(
  "touchstart",
  (e) => {
    e.preventDefault();
    paintActive = true;
    const { x, y } = canvasXY(e.touches[0]);
    queuePaint(x, y);
    paintTimer = setInterval(flushPaint, 80);
  },
  { passive: false },
);

canvasGrid.addEventListener(
  "touchmove",
  (e) => {
    e.preventDefault();
    if (!paintActive) return;
    const { x, y } = canvasXY(e.touches[0]);
    queuePaint(x, y);
  },
  { passive: false },
);

canvasGrid.addEventListener("touchend", () => {
  paintActive = false;
  clearInterval(paintTimer);
  flushPaint();
});

// wind compass
const compassSVG = document.getElementById("compass-svg");
let compassDragging = false;

function updateCompassUI() {
  const arrow = document.getElementById("compass-arrow");
  // rotate: wind angle 0 deg = east (right), standard math convention
  // svg arrow points north (up) by default = -90°
  // angle 0 = east, so arrow rotation = angle - 90
  arrow.style.transform = `rotate(${windAngle - 90}deg)`;

  document.getElementById("w-angle").textContent = Math.round(windAngle) + "°";
  document.getElementById("w-strength").textContent = windStrength.toFixed(2);
  document.getElementById("wind-strength-fill").style.width =
    windStrength * 100 + "%";
}

function compassAngle(e) {
  const rect = compassSVG.getBoundingClientRect();
  const cx = rect.left + rect.width / 2;
  const cy = rect.top + rect.height / 2;
  const dx = e.clientX - cx;
  const dy = e.clientY - cy;
  // atan2 gives angle from East; convert to 0-360
  let angle = (Math.atan2(dy, dx) * 180) / Math.PI;
  if (angle < 0) angle += 360;
  return angle;
}

compassSVG.addEventListener("mousedown", (e) => {
  compassDragging = true;
  windAngle = compassAngle(e);
  updateCompassUI();
});

window.addEventListener("mousemove", (e) => {
  if (!compassDragging) return;
  windAngle = compassAngle(e);
  updateCompassUI();
});

window.addEventListener("mouseup", (e) => {
  if (!compassDragging) return;
  compassDragging = false;
  debouncedConfig();
});

// init
updateCompassUI();
