const API = "/api";

function switchTab(n) {
  document.getElementById("panel1").classList.toggle("hidden", n !== 1);
  document.getElementById("panel2").classList.toggle("hidden", n !== 2);
  ["tab1", "tab2"].forEach((id, i) => {
    const btn = document.getElementById(id);
    const active = i + 1 === n;
    btn.style.color = active ? "#7C2D3E" : "#6B5E52";
    btn.style.borderBottom = active
      ? "2px solid #7C2D3E"
      : "2px solid transparent";
  });
}

// sync
function updateSlider(el) {
  const v = parseFloat(el.value);
  el.style.setProperty("--val", v * 100 + "%");
  document.getElementById("probDisplay").textContent = v.toFixed(2);
  document.getElementById("probExact").value = v.toFixed(2);
}
function syncExact(el) {
  let v = parseFloat(el.value);
  if (isNaN(v)) return;
  v = Math.min(1, Math.max(0, v));
  document.getElementById("probSlider").value = v;
  document
    .getElementById("probSlider")
    .style.setProperty("--val", v * 100 + "%");
  document.getElementById("probDisplay").textContent = v.toFixed(2);
}

// stores
const yn_history = [];
const m8_history = [];
const m8_counts = new Array(20).fill(0);

// part 1
async function askYesNo() {
  const q =
    document.getElementById("q1input").value.trim() || "Will the event occur?";
  const p = parseFloat(document.getElementById("probSlider").value);

  const btn = document.querySelector("#panel1 .btn-primary");
  btn.textContent = "Generating…";
  btn.disabled = true;

  try {
    const res = await fetch(`${API}/yesno`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ question: q, probability: p }),
    });
    const data = await res.json();
    renderYNResult(data);
    yn_history.unshift(data);
    renderYNHistory();
  } catch (e) {
    showYNError(e.message);
  } finally {
    btn.textContent = "Generate Answer";
    btn.disabled = false;
  }
}

function renderYNResult(d) {
  const area = document.getElementById("yn-answer-area");
  const isYes = d.answer === "YES";
  area.innerHTML = "";
  area.className =
    "flex-1 flex flex-col items-center justify-center min-h-40 rounded-xl mb-4 answer-reveal";
  area.style.background = isYes
    ? "linear-gradient(135deg,#F0FAF0,#DCF0DC)"
    : "linear-gradient(135deg,#FAF0F0,#F0D8D8)";
  area.style.border = `1.5px solid ${isYes ? "#8DA98A" : "#C8888A"}`;

  const questionEl = document.createElement("p");
  questionEl.className = "text-xs font-body mb-2 text-center px-4";
  questionEl.style.color = "#6B5E52";
  questionEl.textContent = `"${d.question}"`;

  const answerEl = document.createElement("div");
  answerEl.className = "font-display font-700 text-5xl mb-1";
  answerEl.style.color = isYes ? "#2D6B3E" : "#7C2D2D";
  answerEl.textContent = isYes ? "YES!" : "NO!";
  if (!isYes) answerEl.classList.add("shake");

  const sub = document.createElement("p");
  sub.className = "text-xs font-mono";
  sub.style.color = isYes ? "#5A8A6A" : "#9A4A4A";
  sub.textContent = isYes ? "Event A occurred" : "Event A did not occur";

  area.append(questionEl, answerEl, sub);

  // debug
  const dbg = document.getElementById("yn-debug");
  dbg.className = "rounded-lg p-3 text-xs font-mono space-y-1 fade-in";
  dbg.style.background = "#F5EFE6";
  dbg.style.border = "1px solid #E8DDD0";
  dbg.style.color = "#3D2B1F";
  dbg.innerHTML = `
        <div class="flex justify-between">
          <span style="color:#6B5E52">α (random):</span>
          <span>${d.alpha.toFixed(6)}</span>
        </div>
        <div class="flex justify-between">
          <span style="color:#6B5E52">p (threshold):</span>
          <span>${d.probability.toFixed(6)}</span>
        </div>
        <div class="flex justify-between">
          <span style="color:#6B5E52">α &lt; p :</span>
          <span style="color:${d.triggered ? "#2D6B3E" : "#7C2D2D"}">${d.triggered}</span>
        </div>
      `;
}

function showYNError(msg) {
  const area = document.getElementById("yn-answer-area");
  area.innerHTML = `
      <p class="text-xs font-body text-center px-4" style="color:#A85060;">
        Error: ${msg}<br><small>Is the backend running?</small>
      </p>`;
}

function renderYNHistory() {
  const el = document.getElementById("yn-history");
  if (!yn_history.length) {
    el.innerHTML =
      '<p class="text-xs font-body text-center py-4" style="color:#C8B8A8;">No experiments yet</p>';
    document.getElementById("yn-stats").textContent = "";
    return;
  }
  const yesCount = yn_history.filter((h) => h.answer === "YES").length;
  document.getElementById("yn-stats").textContent =
    `YES: ${yesCount}/${yn_history.length} (${((yesCount / yn_history.length) * 100).toFixed(0)}%)`;

  el.innerHTML = yn_history
    .map(
      (h, i) => `
        <div class="history-in flex items-center gap-3 px-3 py-2 rounded-lg text-xs"
             style="background:${i === 0 ? "#FAF7F2" : "transparent"}; animation-delay:${i === 0 ? "0" : "0.05"}s; border: 1px solid ${i === 0 ? "#E8E0D6" : "transparent"}">
          <span class="font-600 w-8 text-center rounded px-1 py-0.5" style="background:${h.answer === "YES" ? "#DCF0DC" : "#F0D8D8"}; color:${h.answer === "YES" ? "#2D6B3E" : "#7C2D2D"}; font-family:monospace">
            ${h.answer === "YES" ? "Y" : "N"}
          </span>
          <span class="flex-1 truncate font-body" style="color:#6B5E52;">${h.question}</span>
          <span class="font-mono" style="color:#A89888;">α=${h.alpha.toFixed(4)}</span>
          <span class="font-mono" style="color:#A89888;">p=${h.probability.toFixed(2)}</span>
        </div>
      `,
    )
    .join("");
}

function clearHistory1() {
  yn_history.length = 0;
  renderYNHistory();
  document.getElementById("yn-answer-area").innerHTML =
    '<p class="text-sm font-body" style="color:#A89888;">Awaiting simulation…</p>';
  document.getElementById("yn-answer-area").className =
    "flex-1 flex flex-col items-center justify-center min-h-40 rounded-xl mb-4";
  document.getElementById("yn-answer-area").style.background = "#FAF7F2";
  document.getElementById("yn-answer-area").style.border =
    "1.5px dashed #D6CEC6";
  document.getElementById("yn-debug").className = "hidden";
}

// part 2
const ANSWERS = [
  { text: "It is certain", sentiment: "positive" },
  { text: "It is decidedly so", sentiment: "positive" },
  { text: "Without a doubt", sentiment: "positive" },
  { text: "Yes, definitely", sentiment: "positive" },
  { text: "You may rely on it", sentiment: "positive" },
  { text: "As I see it, yes", sentiment: "positive" },
  { text: "Most likely", sentiment: "positive" },
  { text: "Outlook good", sentiment: "positive" },
  { text: "Yes", sentiment: "positive" },
  { text: "Signs point to yes", sentiment: "positive" },
  { text: "Reply hazy, try again", sentiment: "neutral" },
  { text: "Ask again later", sentiment: "neutral" },
  { text: "Better not tell you", sentiment: "neutral" },
  { text: "Cannot predict now", sentiment: "neutral" },
  { text: "Concentrate & ask again", sentiment: "neutral" },
  { text: "Don't count on it", sentiment: "negative" },
  { text: "My reply is no", sentiment: "negative" },
  { text: "My sources say no", sentiment: "negative" },
  { text: "Outlook not so good", sentiment: "negative" },
  { text: "Very doubtful", sentiment: "negative" },
];

const SENTIMENT_COLORS = {
  positive: { bg: "#DCF0DC", text: "#2D6B3E", bar: "#5A9A6A" },
  neutral: { bg: "#F5EFD6", text: "#6B5A1A", bar: "#C8A832" },
  negative: { bg: "#F0D8D8", text: "#7C2D2D", bar: "#C84848" },
};

function buildDistribution() {
  const container = document.getElementById("m8-distribution");
  container.innerHTML = ANSWERS.map((a, i) => {
    const c = SENTIMENT_COLORS[a.sentiment];
    const count = m8_counts[i];
    const total = m8_counts.reduce((s, v) => s + v, 0);
    const pct = total > 0 ? (count / total) * 100 : 5; // show 5% baseline
    return `
          <div class="flex items-center gap-2 group" id="dist-row-${i}">
            <span class="w-4 text-right text-xs font-mono" style="color:#A89888;">${i + 1}</span>
            <div class="flex-1 flex items-center gap-2">
              <div class="flex-1 h-5 rounded overflow-hidden" style="background:#F0E8DF;">
                <div class="prob-bar-fill h-full rounded" id="dist-bar-${i}"
                     style="width:5%; background:${c.bar}; opacity:0.6;"></div>
              </div>
              <span class="text-xs font-body w-40 truncate" style="color:#6B5E52;">${a.text}</span>
              <span class="text-xs font-mono w-8 text-right" id="dist-count-${i}" style="color:#A89888;">0</span>
            </div>
          </div>
        `;
  }).join("");
}

function updateDistribution(k) {
  m8_counts[k]++;
  const total = m8_counts.reduce((s, v) => s + v, 0);
  ANSWERS.forEach((a, i) => {
    const pct = total > 0 ? Math.max(2, (m8_counts[i] / total) * 100) : 5;
    document.getElementById(`dist-bar-${i}`).style.width = pct + "%";
    document.getElementById(`dist-count-${i}`).textContent = m8_counts[i];
    // highlight active
    const row = document.getElementById(`dist-row-${i}`);
    row.style.background =
      i === k ? SENTIMENT_COLORS[a.sentiment].bg : "transparent";
    row.style.borderRadius = "6px";
    setTimeout(() => {
      if (i === k) row.style.background = "transparent";
    }, 1200);
  });
}

async function askMagic8() {
  const q =
    document.getElementById("q2input").value.trim() || "Will this work?";

  // ball animation
  const ball = document.getElementById("ballSvg");
  ball.classList.add("ball-spin");
  ball.addEventListener(
    "animationend",
    () => ball.classList.remove("ball-spin"),
    { once: true },
  );

  // hide text, show "8" during spin
  document.getElementById("ballAnswerFO").style.display = "none";
  document.getElementById("ball8Label").style.display = "block";

  try {
    const res = await fetch(`${API}/magic8`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ question: q }),
    });
    const data = await res.json();
    setTimeout(() => renderM8Result(data), 400);
    m8_history.unshift(data);
    renderM8History();
    updateDistribution(data.index);
  } catch (e) {
    document.getElementById("ball8Label").textContent = "?";
  }
}

function renderM8Result(d) {
  // update ball window
  const label = document.getElementById("ball8Label");
  const fo = document.getElementById("ballAnswerFO");
  const txt = document.getElementById("ballAnswerText");

  label.style.display = "none";
  fo.style.display = "block";
  txt.textContent = d.answer;

  const c = SENTIMENT_COLORS[d.sentiment];
  txt.style.color =
    c.text === "#2D6B3E"
      ? "#A8D8A8"
      : c.text === "#6B5A1A"
        ? "#E8D890"
        : "#E8A8A8";

  // debug
  const dbg = document.getElementById("m8-debug");
  dbg.className = "w-full rounded-lg p-3 text-xs font-mono space-y-1 fade-in";
  dbg.innerHTML = `
        <div class="flex justify-between">
          <span style="color:#6B5E52">α (random):</span>
          <span>${d.alpha.toFixed(6)}</span>
        </div>
        <div class="flex justify-between">
          <span style="color:#6B5E52">k = ⌊α·m⌋:</span>
          <span>${d.index} (${d.index + 1}/20)</span>
        </div>
        <div class="flex justify-between">
          <span style="color:#6B5E52">Interval:</span>
          <span>[${(d.index / 20).toFixed(4)}, ${((d.index + 1) / 20).toFixed(4)})</span>
        </div>
        <div class="flex justify-between">
          <span style="color:#6B5E52">Sentiment:</span>
          <span style="color:${SENTIMENT_COLORS[d.sentiment].bar}">${d.sentiment}</span>
        </div>
      `;
}

function renderM8History() {
  const el = document.getElementById("m8-history");
  if (!m8_history.length) {
    el.innerHTML =
      '<p class="text-xs font-body text-center py-4" style="color:#C8B8A8;">No experiments yet</p>';
    return;
  }
  el.innerHTML = m8_history
    .map((h, i) => {
      const c = SENTIMENT_COLORS[h.sentiment];
      return `
          <div class="history-in flex items-start gap-3 px-3 py-2 rounded-lg text-xs"
               style="background:${i === 0 ? "#FAF7F2" : "transparent"}; animation-delay:${i === 0 ? "0" : "0.05"}s; border: 1px solid ${i === 0 ? "#E8E0D6" : "transparent"}">
            <span class="flex-shrink-0 mt-0.5 px-1.5 py-0.5 rounded text-center font-600" style="background:${c.bg}; color:${c.text}; font-size:9px; letter-spacing:0.04em">${h.sentiment.toUpperCase()}</span>
            <div class="flex-1 min-w-0">
              <p class="font-body truncate" style="color:#6B5E52;">${h.question}</p>
              <p class="font-600" style="color:#3D2B1F;">${h.answer}</p>
            </div>
            <span class="font-mono flex-shrink-0" style="color:#A89888;">${h.alpha.toFixed(3)}</span>
          </div>
        `;
    })
    .join("");
}

function clearHistory2() {
  m8_history.length = 0;
  m8_counts.fill(0);
  renderM8History();
  buildDistribution();
  document.getElementById("ball8Label").style.display = "block";
  document.getElementById("ballAnswerFO").style.display = "none";
  document.getElementById("ball8Label").textContent = "8";
  document.getElementById("m8-debug").className =
    "hidden w-full rounded-lg p-3 text-xs font-mono space-y-1";
}

// init
buildDistribution();

// allow Enter key on question 1
document.getElementById("q1input").addEventListener("keydown", (e) => {
  if (e.key === "Enter") askYesNo();
});
