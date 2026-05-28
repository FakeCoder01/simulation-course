const form = document.getElementById("mm1-form");
const lambdaInput = document.getElementById("lambda");
const muInput = document.getElementById("mu");
const nInput = document.getElementById("n");
const customersInput = document.getElementById("customers");
const warmupInput = document.getElementById("warmup");
const seedInput = document.getElementById("seed");
const errorEl = document.getElementById("error");
const statusEl = document.getElementById("status");
const badgeEl = document.getElementById("stabilityBadge");
const rhoBar = document.getElementById("rhoBar");
const simMetaEl = document.getElementById("simMeta");

const numberFormat = new Intl.NumberFormat("en-US", {
  maximumFractionDigits: 4,
});

let pnChart = null;

const formatNumber = (value) => numberFormat.format(value);

const setMetricValue = (key, value) => {
  document.querySelectorAll(`[data-stat="${key}"]`).forEach((el) => {
    el.textContent = value;
  });
  document.querySelectorAll(`[data-metric="${key}"]`).forEach((el) => {
    el.textContent = value;
  });
};

const setSimMetricValue = (key, value) => {
  document.querySelectorAll(`[data-metric-sim="${key}"]`).forEach((el) => {
    el.textContent = value;
  });
};

const showError = (message) => {
  errorEl.textContent = message;
  errorEl.classList.remove("hidden");
};

const clearError = () => {
  errorEl.textContent = "";
  errorEl.classList.add("hidden");
};

const updateStability = (rho, stable = true) => {
  badgeEl.textContent = stable ? "Stable" : "Unstable";
  badgeEl.classList.toggle("badge-ok", stable);
  badgeEl.classList.toggle("badge-warn", !stable);

  const bounded = Math.min(Math.max(rho, 0), 1);
  rhoBar.style.width = `${(bounded * 100).toFixed(1)}%`;
  rhoBar.classList.toggle("warn", rho >= 0.85);
};

const updateChart = (theory, simulation) => {
  const labels = theory.map((_, index) => `n=${index}`);
  const ctx = document.getElementById("pnChart");
  const simData = Array.isArray(simulation) ? simulation : null;

  if (!pnChart) {
    pnChart = new Chart(ctx, {
      type: "bar",
      data: {
        labels,
        datasets: [
          {
            label: "Theory Pₙ",
            data: theory,
            backgroundColor: "rgba(37, 99, 235, 0.35)",
            borderColor: "rgba(37, 99, 235, 0.9)",
            borderWidth: 1,
            borderRadius: 6,
          },
          {
            label: "Simulation Pₙ",
            data: simData ?? [],
            backgroundColor: "rgba(249, 115, 22, 0.35)",
            borderColor: "rgba(249, 115, 22, 0.9)",
            borderWidth: 1,
            borderRadius: 6,
            hidden: !simData,
          },
        ],
      },
      options: {
        maintainAspectRatio: false,
        scales: {
          y: {
            beginAtZero: true,
            ticks: {
              callback: (value) => value.toFixed(2),
            },
          },
        },
        plugins: {
          legend: { display: true, position: "bottom" },
          tooltip: {
            callbacks: {
              label: (context) =>
                `${context.dataset.label}: ${context.parsed.y.toFixed(4)}`,
            },
          },
        },
      },
    });
  } else {
    pnChart.data.labels = labels;
    pnChart.data.datasets[0].data = theory;
    pnChart.data.datasets[1].data = simData ?? [];
    pnChart.data.datasets[1].hidden = !simData;
    pnChart.update();
  }
};

const validateInputs = () => {
  const lambda = Number(lambdaInput.value);
  const mu = Number(muInput.value);
  const n = Number(nInput.value);
  const customers = Number(customersInput.value);
  const warmup = Number(warmupInput.value);
  const seedRaw = seedInput.value.trim();
  const seed = seedRaw === "" ? null : Number(seedRaw);

  if (!Number.isFinite(lambda) || lambda <= 0) {
    return { error: "Please enter a valid positive λ (arrival rate)." };
  }
  if (!Number.isFinite(mu) || mu <= 0) {
    return { error: "Please enter a valid positive μ (service rate)." };
  }
  if (!Number.isInteger(n) || n < 1 || n > 200) {
    return { error: "n must be an integer between 1 and 200." };
  }
  if (!Number.isInteger(customers) || customers < 500 || customers > 20000) {
    return { error: "Customers must be an integer between 500 and 20000." };
  }
  if (!Number.isInteger(warmup) || warmup < 0 || warmup > 5000) {
    return { error: "Warmup must be an integer between 0 and 5000." };
  }
  if (seedRaw !== "" && !Number.isInteger(seed)) {
    return { error: "Seed must be an integer or left blank." };
  }

  return { lambda, mu, n, customers, warmup, seed };
};

const updateSimulation = (simulation) => {
  if (!simulation) {
    ["rho", "L", "Lq", "W", "Wq", "P0"].forEach((key) => {
      setSimMetricValue(key, "—");
    });
    simMetaEl.textContent = "Simulation: —";
    return;
  }

  setSimMetricValue("rho", formatNumber(simulation.rho));
  setSimMetricValue("L", formatNumber(simulation.L));
  setSimMetricValue("Lq", formatNumber(simulation.Lq));
  setSimMetricValue("W", formatNumber(simulation.W));
  setSimMetricValue("Wq", formatNumber(simulation.Wq));
  setSimMetricValue("P0", formatNumber(simulation.P0));

  const seedLabel = simulation.seed ?? "auto";
  simMetaEl.textContent = `Simulation: N=${simulation.customers}, warmup=${simulation.warmup}, seed=${seedLabel}.`;
};

const updateMetrics = (data) => {
  setMetricValue("rho", formatNumber(data.rho));
  setMetricValue("L", formatNumber(data.L));
  setMetricValue("Lq", formatNumber(data.Lq));
  setMetricValue("W", formatNumber(data.W));
  setMetricValue("Wq", formatNumber(data.Wq));
  setMetricValue("P0", formatNumber(data.P0));

  updateSimulation(data.simulation);
  updateStability(data.rho, true);
  updateChart(data.Pn, data.simulation?.Pn);
  statusEl.textContent = `Computed theory + simulation for λ=${formatNumber(
    data.lambda
  )}, μ=${formatNumber(data.mu)} (states 0…${data.n}).`;
};

const fetchMetrics = async () => {
  const inputs = validateInputs();
  if (inputs.error) {
    showError(inputs.error);
    return;
  }

  clearError();
  statusEl.textContent = "Computing…";

  const params = new URLSearchParams({
    lambda: inputs.lambda.toString(),
    mu: inputs.mu.toString(),
    n: inputs.n.toString(),
    customers: inputs.customers.toString(),
    warmup: inputs.warmup.toString(),
  });

  if (inputs.seed !== null) {
    params.set("seed", inputs.seed.toString());
  }

  try {
    const response = await fetch(`/api/mm1?${params.toString()}`);
    const payload = await response.json();

    if (!response.ok) {
      const rho = payload.rho ?? 0;
      updateStability(rho, false);
      updateSimulation(null);
      showError(payload.error || "Unable to compute metrics.");
      statusEl.textContent = "System unstable or invalid inputs.";
      return;
    }

    updateMetrics(payload);
  } catch (error) {
    updateSimulation(null);
    showError("Network error. Please try again.");
    statusEl.textContent = "Unable to reach the API.";
  }
};

form.addEventListener("submit", (event) => {
  event.preventDefault();
  fetchMetrics();
});

document.addEventListener("DOMContentLoaded", fetchMetrics);
