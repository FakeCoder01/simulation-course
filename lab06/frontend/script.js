const API_BASE = "http://localhost:8080/api";
let discreteChartInst = null;
let normalChartInst = null;

// init discrete inputs
const discreteContainer = document.getElementById("discrete-inputs");
for (let i = 1; i <= 5; i++) {
  const isAuto = i === 5;
  discreteContainer.innerHTML += `
    <div class="flex justify-between items-center">
      <label>Prob ${i}</label>
      <input type="number" step="0.01" id="p${i}"
        max="1" min="0"
        class="w-24 border p-1 rounded ${isAuto ? "bg-gray-300" : ""}"
        ${isAuto ? "readonly" : 'value="0.2" onchange="calcAutoProb()"'}
      >
    </div>
  `;
}

function calcAutoProb() {
  let sum = 0;
  for (let i = 1; i <= 4; i++) {
    sum += parseFloat(document.getElementById(`p${i}`).value || 0);
  }
  const p5 = Math.max(0, (1 - sum).toFixed(3));
  document.getElementById("p5").value = p5;
}
calcAutoProb();

async function runDiscrete() {
  const probs = [];
  let totalSumValue = 0;
  for (let i = 1; i <= 5; i++) {
    const value = parseFloat(document.getElementById(`p${i}`).value);
    if (value < 0) {
      alert("Value must be greater than 0");
      return;
    }
    probs.push(value);
    totalSumValue += parseFloat(value);
  }
  if (totalSumValue !== 1) {
    alert("Total sum value must be 1");
    return;
  }
  const n = parseInt(document.getElementById("discrete-n").value);

  const res = await fetch(`${API_BASE}/discrete`, {
    method: "POST",
    body: JSON.stringify({ probs, n }),
  }).then((r) => r.json());

  const ctx = document.getElementById("discreteChart").getContext("2d");
  if (discreteChartInst) discreteChartInst.destroy();

  discreteChartInst = new Chart(ctx, {
    type: "bar",
    data: {
      labels: ["1", "2", "3", "4", "5"],
      datasets: [
        {
          label: "Эмпирическая частота",
          data: res.frequencies,
          backgroundColor: "rgba(54, 162, 235, 0.5)",
          borderColor: "rgba(54, 162, 235, 1)",
          borderWidth: 1,
        },
      ],
    },
    options: {
      maintainAspectRatio: false,
      scales: { y: { beginAtZero: true } },
    },
  });

  const operator = ">"; // res.passed ? "<=" : ">";

  const isTrueStr = res.passed
    ? `<span class="text-green-600">ложно (принимаем нулевую гипотезу H0)</span>`
    : `<span class="text-red-600">верно (отвергаем нулевую гипотезу H0)</span>`;

  document.getElementById("discrete-results").innerHTML = `
    <p>Средний: ${res.mean.toFixed(3)} (ошибка = ${res.meanErr.toFixed(2)}%)</p>
    <p>Дисперсия: ${res.variance.toFixed(3)} (ошибка = ${res.varErr.toFixed(2)}%)</p>
    <p>Хи-квадрат: ${res.chiSq.toFixed(2)} ${operator} ${res.critVal.toFixed(3)} - ${isTrueStr}</p>
  `;
}

async function runNormal() {
  const mean = parseFloat(document.getElementById("normal-mean").value);
  const variance = parseFloat(document.getElementById("normal-var").value);

  if (variance <= 0) {
    alert("Variance must be more than 0");
    return;
  }

  const n = parseInt(document.getElementById("normal-n").value);

  const res = await fetch(`${API_BASE}/normal`, {
    method: "POST",
    body: JSON.stringify({ mean, variance, n }),
  }).then((r) => r.json());

  const ctx = document.getElementById("normalChart").getContext("2d");
  if (normalChartInst) normalChartInst.destroy();

  normalChartInst = new Chart(ctx, {
    type: "bar",
    data: {
      labels: res.labels.map((l) => l.toFixed(2)),
      datasets: [
        {
          type: "line",
          label: "Теоретический",
          data: res.curve,
          borderColor: "rgba(75, 192, 192, 1)",
          borderWidth: 2,
          tension: 0.4,
          fill: false,
        },
        {
          type: "bar",
          label: "Гистограмма",
          data: res.frequencies,
          backgroundColor: "rgba(153, 102, 255, 0.5)",
          borderColor: "rgba(153, 102, 255, 1)",
          borderWidth: 1,
        },
      ],
    },
    options: {
      maintainAspectRatio: false,
      scales: { y: { beginAtZero: true } },
    },
  });

  const operator = ">"; // res.passed ? "<=" : ">";

  const isTrueStr = res.passed
    ? `<span class="text-green-600">ложно (принимаем нулевую гипотезу H0)</span>`
    : `<span class="text-red-600">верно (отвергаем нулевую гипотезу H0)</span>`;

  document.getElementById("normal-results").innerHTML = `
    <p>Средний: ${res.mean.toFixed(3)} (ошибка = ${res.meanErr.toFixed(2)}%)</p>
    <p>Дисперсия: ${res.variance.toFixed(3)} (ошибка = ${res.varErr.toFixed(2)}%)</p>
    <p>Хи-квадрат: ${res.chiSq.toFixed(2)} ${operator} ${res.critVal.toFixed(3)} - ${isTrueStr}</p>
  `;
}

function changeDisribution(distributionTabData) {
  const slag = "-" + distributionTabData.slag;

  const elementToHide = document.getElementById(
    distributionTabData.hide + slag,
  );
  const elementToShow = document.getElementById(
    distributionTabData.show + slag,
  );

  elementToHide.classList.add("hidden");
  elementToShow.classList.remove("hidden");

  if (normalChartInst === null) runNormal();
}

setTimeout(() => {
  runDiscrete();
  // runNormal();
}, 500);
