let chart;

const form = document.getElementById("simulate-form");
const errorBox = document.getElementById("error");
const button = document.getElementById("simulate-btn");

const formatNumber = (value, digits = 4) => {
  if (!Number.isFinite(value)) return "—";
  return Number(value).toFixed(digits);
};

const formatPercent = (value, digits = 2) => {
  if (!Number.isFinite(value)) return "—";
  return `${(value * 100).toFixed(digits)}%`;
};

const setError = (message) => {
  if (message) {
    errorBox.textContent = message;
    errorBox.classList.remove("hidden");
  } else {
    errorBox.textContent = "";
    errorBox.classList.add("hidden");
  }
};

const renderChart = (labels, empirical, theoretical) => {
  const ctx = document.getElementById("dist-chart");
  if (!chart) {
    chart = new Chart(ctx, {
      type: "bar",
      data: {
        labels,
        datasets: [
          {
            type: "bar",
            label: "Эмпирическое",
            data: empirical,
            backgroundColor: "rgba(15, 118, 110, 0.4)",
            borderColor: "rgba(15, 118, 110, 0.8)",
            borderWidth: 1,
          },
          {
            type: "line",
            label: "Теоретическое",
            data: theoretical,
            borderColor: "rgba(15, 23, 42, 0.9)",
            backgroundColor: "rgba(15, 23, 42, 0.05)",
            pointRadius: 0,
            tension: 0.25,
            borderWidth: 2,
          },
        ],
      },
      options: {
        responsive: true,
        maintainAspectRatio: false,
        interaction: { mode: "index", intersect: false },
        plugins: {
          legend: { position: "top" },
          tooltip: {
            callbacks: {
              label: (ctx) =>
                `${ctx.dataset.label}: ${ctx.parsed.y.toFixed(4)}`,
            },
          },
        },
        scales: {
          y: {
            beginAtZero: true,
            title: { display: true, text: "Вероятность" },
          },
          x: { title: { display: true, text: "k" } },
        },
      },
    });
  } else {
    chart.data.labels = labels;
    chart.data.datasets[0].data = empirical;
    chart.data.datasets[1].data = theoretical;
    chart.update();
  }
};

const updateTable = (counts, empirical, theoretical) => {
  const tbody = document.getElementById("dist-body");
  tbody.innerHTML = "";

  counts.forEach((count, k) => {
    const row = document.createElement("tr");
    row.innerHTML = `
            <td class="px-3 py-2 text-slate-700">${k}</td>
            <td class="px-3 py-2 text-slate-700">${count}</td>
            <td class="px-3 py-2 text-slate-700">${formatNumber(empirical[k], 5)}</td>
            <td class="px-3 py-2 text-slate-700">${formatNumber(theoretical[k], 5)}</td>
        `;
    tbody.appendChild(row);
  });
};

const updateSummary = (data) => {
  document.getElementById("sample-example").textContent = data.sampleExample;
  document.getElementById("mean-value").textContent = formatNumber(
    data.mean,
    4,
  );
  document.getElementById("variance-value").textContent = formatNumber(
    data.variance,
    4,
  );
  document.getElementById("mean-theory").textContent = formatNumber(
    data.theoreticalMean,
    4,
  );
  document.getElementById("variance-theory").textContent = formatNumber(
    data.theoreticalVariance,
    4,
  );
  document.getElementById("mu-value").textContent = formatNumber(data.mu, 4);

  const meanDiff = Math.abs(data.mean - data.theoreticalMean);
  const varDiff = Math.abs(data.variance - data.theoreticalVariance);
  const meanRel =
    data.theoreticalMean > 0 ? meanDiff / data.theoreticalMean : 0;
  const varRel =
    data.theoreticalVariance > 0 ? varDiff / data.theoreticalVariance : 0;

  document.getElementById("mean-diff").textContent = formatNumber(meanDiff, 4);
  document.getElementById("var-diff").textContent = formatNumber(varDiff, 4);
  document.getElementById("mean-rel").textContent = formatPercent(meanRel, 2);
  document.getElementById("var-rel").textContent = formatPercent(varRel, 2);

  const conclusion = document.getElementById("conclusion");
  if (meanRel < 0.05 && varRel < 0.05) {
    conclusion.textContent =
      "Выборочные среднее и дисперсия близки к μ = λT. Эмпирическое распределение соответствует пуассоновскому потоку.";
  } else {
    conclusion.textContent =
      "Отклонение от теории заметно. Увеличьте число интервалов N или уточните параметры λ и T.";
  }
};

const runSimulation = async () => {
  setError("");
  const lambda = Number(document.getElementById("lambda-input").value);
  const interval = Number(document.getElementById("interval-input").value);
  const samples = Math.floor(
    Number(document.getElementById("samples-input").value),
  );

  if (!Number.isFinite(lambda) || lambda <= 0) {
    setError("λ должно быть положительным числом.");
    return;
  }
  if (!Number.isFinite(interval) || interval <= 0) {
    setError("T должно быть положительным числом.");
    return;
  }
  if (!Number.isFinite(samples) || samples <= 0) {
    setError("N должно быть положительным целым числом.");
    return;
  }

  button.disabled = true;
  button.textContent = "Моделируем...";

  try {
    const response = await fetch("/api/simulate", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ lambda, interval, samples }),
    });
    const data = await response.json();
    if (!response.ok) {
      throw new Error(data.error || "Ошибка сервера");
    }

    const labels = data.empirical.map((_, index) => index.toString());
    renderChart(labels, data.empirical, data.theoretical);
    updateTable(data.counts, data.empirical, data.theoretical);
    updateSummary(data);
  } catch (error) {
    setError(error.message);
  } finally {
    button.disabled = false;
    button.textContent = "Смоделировать";
  }
};

form.addEventListener("submit", (event) => {
  event.preventDefault();
  runSimulation();
});
