"use strict";

(function exposeRender(root) {
  const { formatNumber, formatPercent } = root.Lab10Simulation;
  const { drawLineChart, drawBarChart, drawComparisonChart } = root.Lab10Charts;

  function conclusionFor(result) {
    if (result.rejectionProbability > 0.18)
      return "High capacity blocking. System fills up too fast.";
    if (result.abandonmentProbability > 0.18)
      return "High impatience. Customers wait too long.";
    if (result.resourceUtilization > 0.88 && result.serverUtilization < 0.82)
      return "Shared resources are the bottleneck.";
    if (result.serverUtilization > 0.9) return "Operators are saturated.";
    return "Scenario is operationally balanced.";
  }

  function kpiCard(title, value, note) {
    return `
      <div class="kpi-card">
        <div class="kpi-title">${title}</div>
        <div class="kpi-value">${value}</div>
        <div class="kpi-note">${note}</div>
      </div>
    `;
  }

  function renderResult(result, comparison = null) {
    const c = result.config;

    document.getElementById("results").innerHTML = `
      <div class="summary-banner">
        <div>
          <h2>${conclusionFor(result)}</h2>
          <p>Simulation complete: ${result.arrivals} arrived, ${result.completed} serviced, ${result.rejected} rejected, ${result.abandoned} abandoned.</p>
        </div>
        <div class="summary-meta">
          <strong>${c.name}</strong><br>
          T = ${formatNumber(c.observation, 0)} | Seed = ${c.seed}
        </div>
      </div>

      <div class="kpi-grid">
        ${kpiCard("Offered Load", formatNumber(result.offeredLoad, 3), "λ / (c * μ)")}
        ${kpiCard("P(Reject)", formatPercent(result.rejectionProbability), "System full")}
        ${kpiCard("P(Abandon)", formatPercent(result.abandonmentProbability), "Impatience")}
        ${kpiCard("Server Util.", formatPercent(result.serverUtilization), `${c.servers} Operators`)}
        ${kpiCard("Resource Util.", formatPercent(result.resourceUtilization), `${c.resourceCapacity} Units`)}
        ${kpiCard("Mean Wait (Wq)", formatNumber(result.meanWait, 3), "Queue time")}
      </div>

      <div class="charts-grid">
        <div class="card">
          <div class="card-header">
            <div class="card-title">Requests in System (N)</div>
            <div class="card-subtitle">Probability distribution (c=${c.servers}, K=${c.capacity})</div>
          </div>
          <div class="canvas-container"><canvas id="state-chart"></canvas></div>
        </div>

        <div class="card">
          <div class="card-header">
            <div class="card-title">Wait Time Histogram</div>
            <div class="card-subtitle">P(Wq > ${c.longWait}) = ${formatPercent(result.longWaitProbability)}</div>
          </div>
          <div class="canvas-container"><canvas id="wait-chart"></canvas></div>
        </div>

        <div class="card">
          <div class="card-header">
            <div class="card-title">Busy Operators</div>
            <div class="card-subtitle">Empirical distribution</div>
          </div>
          <div class="canvas-container"><canvas id="busy-chart"></canvas></div>
        </div>

        <div class="card">
          <div class="card-header">
            <div class="card-title">Queue Length</div>
            <div class="card-subtitle">Empirical distribution</div>
          </div>
          <div class="canvas-container"><canvas id="queue-chart"></canvas></div>
        </div>
      </div>

      ${comparison ? comparisonBlock(comparison) : ""}

      <div class="kpi-grid">
        ${kpiCard("Mean System Size (L)", formatNumber(result.meanSystemSize, 3), "Time-weighted")}
        ${kpiCard("Mean Queue Length (Lq)", formatNumber(result.meanQueueLength, 3), "Time-weighted")}
        ${kpiCard("Throughput", formatNumber(result.throughput, 3), "Completed / min")}
      </div>

      <div class="tables-grid">
        <div class="card">
          <div class="card-title mb-2">System Size Probabilities</div>
          <table>
            <thead><tr><th>N</th><th>Probability</th></tr></thead>
            <tbody>${result.stateRows.map((r) => `<tr><td>${r.label}</td><td>${formatNumber(r.value, 4)}</td></tr>`).join("")}</tbody>
          </table>
        </div>
        <div class="card">
          <div class="card-title mb-2">Queue Length Probabilities</div>
          <table>
            <thead><tr><th>Q</th><th>Probability</th></tr></thead>
            <tbody>${result.queueRows.map((r) => `<tr><td>${r.label}</td><td>${formatNumber(r.value, 4)}</td></tr>`).join("")}</tbody>
          </table>
        </div>
        <div class="card">
          <div class="card-title mb-2">Busy Server Probabilities</div>
          <table>
            <thead><tr><th>Busy</th><th>Probability</th></tr></thead>
            <tbody>${result.busyOperatorRows.map((r) => `<tr><td>${r.label}</td><td>${formatNumber(r.value, 4)}</td></tr>`).join("")}</tbody>
          </table>
        </div>
      </div>

      <div class="logs-grid">
        <div class="card log-block">
          <div class="card-title">State Log (100 units)</div>
          <pre>${escapeHtml(result.stateLog.join("\n"))}</pre>
        </div>
        <div class="card log-block">
          <div class="card-title">Event Log</div>
          <pre>${escapeHtml(result.eventLog.join("\n"))}</pre>
        </div>
      </div>
    `;

    // Updated brand colors
    drawLineChart("state-chart", result.stateRows, "#2563eb");
    drawBarChart("wait-chart", result.waitHistogram, "#8b5cf6");
    drawLineChart("busy-chart", result.busyOperatorRows, "#10b981");
    drawLineChart("queue-chart", result.queueRows, "#f59e0b");
    if (comparison) drawComparisonChart(comparison);
  }

  function comparisonBlock(comparison) {
    return `
      <div class="charts-grid" style="grid-template-columns: 1fr;">
        <div class="card">
          <div class="card-header">
            <div class="card-title">Scenario Comparison: Lost Customers</div>
            <div class="card-subtitle">Combined rejection and abandonment probability</div>
          </div>
          <div class="canvas-container"><canvas id="comparison-chart"></canvas></div>
        </div>
      </div>
      <div class="card" style="margin-bottom: 24px; overflow-x: auto;">
        <div class="card-title mb-2">Comparison Metrics</div>
        <table>
          <thead>
            <tr>
              <th>Scenario</th><th>Load</th><th>Rejected</th><th>Abandoned</th><th>Mean Wq</th><th>Server Util.</th><th>Res. Util.</th>
            </tr>
          </thead>
          <tbody>
            ${comparison
              .map(
                (r) => `
              <tr>
                <td><strong>${r.config.name}</strong></td>
                <td>${formatNumber(r.offeredLoad, 3)}</td>
                <td style="color:${r.rejectionProbability > 0.1 ? "#ef4444" : "inherit"}">${formatPercent(r.rejectionProbability)}</td>
                <td style="color:${r.abandonmentProbability > 0.1 ? "#ef4444" : "inherit"}">${formatPercent(r.abandonmentProbability)}</td>
                <td>${formatNumber(r.meanWait, 3)}</td>
                <td>${formatPercent(r.serverUtilization)}</td>
                <td>${formatPercent(r.resourceUtilization)}</td>
              </tr>
            `,
              )
              .join("")}
          </tbody>
        </table>
      </div>
    `;
  }

  function escapeHtml(text) {
    return text
      .replaceAll("&", "&amp;")
      .replaceAll("<", "&lt;")
      .replaceAll(">", "&gt;");
  }

  root.Lab10Render = { renderResult, conclusionFor };
})(typeof globalThis !== "undefined" ? globalThis : window);
