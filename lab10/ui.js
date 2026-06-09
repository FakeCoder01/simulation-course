"use strict";

(function initLab10Ui(root) {
  const { SCENARIOS } = root.Lab10Scenarios;
  const { runSimulation, formatNumber } = root.Lab10Simulation;
  const { renderResult } = root.Lab10Render;

  let currentScenarioId = SCENARIOS[0].id;
  let lastResult = null;
  let lastComparison = null;

  function readConfigFromInputs() {
    const scenario =
      SCENARIOS.find((item) => item.id === currentScenarioId) || SCENARIOS[0];
    return {
      ...scenario,
      lambda: numberFrom("lambda"),
      mu: numberFrom("mu"),
      servers: numberFrom("servers"),
      capacity: numberFrom("capacity"),
      sourcePopulation: numberFrom("source-population"),
      patienceMean: numberFrom("patience"),
      resourceCapacity: numberFrom("resource-capacity"),
      resourceMin: numberFrom("resource-min"),
      resourceMax: numberFrom("resource-max"),
      observation: numberFrom("observation"),
      warmup: numberFrom("warmup"),
      longWait: numberFrom("long-wait"),
      logLimit: numberFrom("log-limit"),
      seed: numberFrom("seed"),
    };
  }

  function numberFrom(id) {
    return Number(document.getElementById(id).value);
  }
  function setNumber(id, value) {
    const input = document.getElementById(id);
    if (input) input.value = value;
  }

  function setAlert(type = "", text = "") {
    const alert = document.getElementById("alert");
    if (!alert) return;
    alert.className = "alert";
    alert.textContent = "";
    if (text) {
      alert.classList.add(type);
      alert.textContent = text;
    }
  }

  function applyScenario(id) {
    const scenario = SCENARIOS.find((item) => item.id === id) || SCENARIOS[0];
    currentScenarioId = scenario.id;

    setNumber("lambda", scenario.lambda);
    setNumber("mu", scenario.mu);
    setNumber("servers", scenario.servers);
    setNumber("capacity", scenario.capacity);
    setNumber("source-population", scenario.sourcePopulation);
    setNumber("patience", scenario.patienceMean);
    setNumber("resource-capacity", scenario.resourceCapacity);
    setNumber("resource-min", scenario.resourceMin);
    setNumber("resource-max", scenario.resourceMax);
    setNumber("observation", scenario.observation);
    setNumber("warmup", scenario.warmup);
    setNumber("long-wait", scenario.longWait);
    setNumber("seed", scenario.seed);

    syncObservationButtons();
    renderScenarioButtons();
  }

  function renderScenarioButtons() {
    const grid = document.getElementById("scenario-grid");
    if (!grid) return;

    grid.innerHTML = SCENARIOS.map(
      (scenario) => `
      <button class="scenario-btn ${scenario.id === currentScenarioId ? "active" : ""}" type="button" data-scenario="${scenario.id}">
        <strong>${scenario.name}</strong>
        <span>${scenario.short}</span>
      </button>
    `,
    ).join("");

    grid.querySelectorAll(".scenario-btn").forEach((button) => {
      button.addEventListener("click", () => {
        applyScenario(button.dataset.scenario);
        runSelectedScenario();
      });
    });
  }

  function runSelectedScenario() {
    setAlert();
    try {
      lastResult = runSimulation(readConfigFromInputs());
      lastComparison = null;
      root.lastLab10Result = lastResult;

      const resContainer = document.getElementById("results");
      resContainer.style.opacity = 0;
      renderResult(lastResult);
      setTimeout(() => (resContainer.style.opacity = 1), 50);

      setAlert(
        "ok",
        `Complete: ${lastResult.arrivals} arrivals, ${lastResult.completed} services.`,
      );
    } catch (error) {
      setAlert("err", error.message);
    }
  }

  function compareScenarios() {
    setAlert();
    try {
      const base = readConfigFromInputs();
      lastComparison = SCENARIOS.map((scenario, index) =>
        runSimulation({
          ...scenario,
          observation: base.observation,
          warmup: base.warmup,
          logLimit: Math.min(120, base.logLimit || 260),
          seed: (base.seed || scenario.seed) + index * 1009,
        }),
      );

      lastResult =
        lastComparison.find(
          (result) => result.config.id === currentScenarioId,
        ) || lastComparison[0];
      root.lastLab10Result = lastResult;

      const resContainer = document.getElementById("results");
      resContainer.style.opacity = 0;
      renderResult(lastResult, lastComparison);
      setTimeout(() => (resContainer.style.opacity = 1), 50);

      setAlert("ok", `Compared ${lastComparison.length} preset scenarios.`);
    } catch (error) {
      setAlert("err", error.message);
    }
  }

  function exportCsv() {
    /* Code identical to original */
    if (!lastResult) return root.alert("Run a simulation first.");
    const lines = [
      "Lab 10,M/M/c/K/N queue",
      `Scenario,${lastResult.config.name}`,
      `lambda,${lastResult.config.lambda}`,
      `mu,${lastResult.config.mu}`,
      `servers,${lastResult.config.servers}`,
      `mean wait,${lastResult.meanWait}`,
      "",
      "system size,probability",
      ...lastResult.stateRows.map((row) => `${row.label},${row.value}`),
      "",
      "state log",
      ...lastResult.stateLog,
    ];
    downloadText(
      "lab10_results.csv",
      lines.join("\r\n"),
      "text/csv;charset=utf-8",
    );
  }

  function exportLog() {
    /* Code identical to original */
    if (!lastResult) return root.alert("Run a simulation first.");
    const lines = [
      `Scenario: ${lastResult.config.name}`,
      `Arrivals=${lastResult.arrivals}, admitted=${lastResult.admitted}`,
      "",
      "Event log",
      ...lastResult.eventLog,
    ];
    downloadText(
      "lab10_log.txt",
      lines.join("\r\n"),
      "text/plain;charset=utf-8",
    );
  }

  function downloadText(filename, text, type) {
    const blob = new Blob([text], { type });
    const url = URL.createObjectURL(blob);
    const a = document.createElement("a");
    a.href = url;
    a.download = filename;
    document.body.appendChild(a);
    a.click();
    a.remove();
    URL.revokeObjectURL(url);
  }

  function randomSeed() {
    setNumber("seed", Math.floor(Math.random() * 100000000) + 1);
  }

  function syncObservationButtons(source = "") {
    const hidden = document.getElementById("observation");
    const custom = document.getElementById("observation-custom");
    const buttons = document.querySelectorAll(
      '.chip-group[data-input="observation"] .chip-btn',
    );
    let matchedPreset = false;

    buttons.forEach((button) => {
      const active = button.dataset.value === hidden.value;
      button.classList.toggle("active", active);
      if (active) matchedPreset = true;
    });

    if (source === "preset") custom.value = "";
    else if (!matchedPreset && document.activeElement !== custom)
      custom.value = hidden.value;
  }

  function bindEvents() {
    document
      .getElementById("run-simulation")
      ?.addEventListener("click", runSelectedScenario);
    document
      .getElementById("compare-scenarios")
      ?.addEventListener("click", compareScenarios);
    document.getElementById("export-csv")?.addEventListener("click", exportCsv);
    document.getElementById("export-log")?.addEventListener("click", exportLog);
    document.getElementById("random-seed")?.addEventListener("click", () => {
      randomSeed();
      runSelectedScenario();
    });

    document
      .querySelectorAll('.chip-group[data-input="observation"] .chip-btn')
      .forEach((button) => {
        button.addEventListener("click", () => {
          setNumber("observation", button.dataset.value);
          syncObservationButtons("preset");
        });
      });

    document
      .getElementById("observation-custom")
      ?.addEventListener("input", (event) => {
        const value = event.target.value.trim();
        if (value !== "") setNumber("observation", value);
        syncObservationButtons("custom");
      });

    document
      .querySelector(".config-panel")
      ?.addEventListener("keydown", (event) => {
        if (event.key === "Enter" && event.target.matches("input"))
          runSelectedScenario();
      });

    root.addEventListener(
      "resize",
      () => lastResult && renderResult(lastResult, lastComparison),
    );
  }

  function initUi() {
    renderScenarioButtons();
    applyScenario(currentScenarioId);
    bindEvents();
    syncObservationButtons();
    // Start empty to let user explore dashboard first. (Optional: uncomment to auto-run)
    // runSelectedScenario();
  }

  if (typeof document !== "undefined") {
    document.addEventListener("DOMContentLoaded", initUi);
  }
})(typeof globalThis !== "undefined" ? globalThis : window);
