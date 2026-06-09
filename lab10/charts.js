"use strict";

(function exposeCharts(root) {
  function setupCanvas(canvas) {
    const rect = canvas.parentElement.getBoundingClientRect();
    const dpr = root.devicePixelRatio || 1;
    canvas.width = Math.max(1, Math.round(rect.width * dpr));
    canvas.height = Math.max(1, Math.round(rect.height * dpr));

    const ctx = canvas.getContext("2d");
    ctx.setTransform(dpr, 0, 0, dpr, 0, 0);
    ctx.clearRect(0, 0, rect.width, rect.height);

    return {
      ctx,
      width: rect.width,
      height: rect.height,
      left: 40,
      top: 20,
      right: 20,
      bottom: 30,
    };
  }

  function chartArea(chart) {
    return {
      x: chart.left,
      y: chart.top,
      width: chart.width - chart.left - chart.right,
      height: chart.height - chart.top - chart.bottom,
    };
  }

  function xFor(chart, index, count) {
    const area = chartArea(chart);
    return count <= 1
      ? area.x + area.width / 2
      : area.x + (index / (count - 1)) * area.width;
  }

  function yFor(chart, value, maxY) {
    const area = chartArea(chart);
    return area.y + area.height - (value / (maxY * 1.15)) * area.height;
  }

  function drawGrid(chart, maxY) {
    const area = chartArea(chart);
    chart.ctx.strokeStyle = "#e2e8f0"; // New subtle border color
    chart.ctx.fillStyle = "#64748b"; // New muted text
    chart.ctx.font = "11px Inter, sans-serif";

    for (let i = 0; i <= 5; i++) {
      const value = (maxY * i) / 5;
      const y = yFor(chart, value, maxY);
      chart.ctx.beginPath();
      chart.ctx.moveTo(area.x, y);
      chart.ctx.lineTo(area.x + area.width, y);
      chart.ctx.stroke();
      chart.ctx.fillText(value.toFixed(2), 5, y + 4);
    }
  }

  function drawLabels(chart, rows) {
    const area = chartArea(chart);
    const every = Math.max(1, Math.ceil(rows.length / 10));
    chart.ctx.fillStyle = "#64748b";
    chart.ctx.font = "11px Inter, sans-serif";
    chart.ctx.textAlign = "center";

    rows.forEach((row, index) => {
      if (index % every === 0 || index === rows.length - 1) {
        chart.ctx.fillText(
          row.label,
          xFor(chart, index, rows.length),
          area.y + area.height + 16,
        );
      }
    });
    chart.ctx.textAlign = "left";
  }

  function drawLineChart(canvasId, rows, color) {
    const canvas = document.getElementById(canvasId);
    if (!canvas) return;

    const chart = setupCanvas(canvas);
    const maxY = Math.max(0.01, ...rows.map((row) => row.value));
    drawGrid(chart, maxY);

    chart.ctx.strokeStyle = color;
    chart.ctx.fillStyle = color;
    chart.ctx.lineWidth = 3; // Thicker lines
    chart.ctx.beginPath();

    rows.forEach((row, index) => {
      const x = xFor(chart, index, rows.length);
      const y = yFor(chart, row.value, maxY);
      if (index === 0) chart.ctx.moveTo(x, y);
      else chart.ctx.lineTo(x, y);
    });

    chart.ctx.stroke();

    // Add dots
    rows.forEach((row, index) => {
      chart.ctx.beginPath();
      chart.ctx.arc(
        xFor(chart, index, rows.length),
        yFor(chart, row.value, maxY),
        4,
        0,
        Math.PI * 2,
      );
      chart.ctx.fill();
    });
    drawLabels(chart, rows);
  }

  function drawBarChart(canvasId, rows, color) {
    const canvas = document.getElementById(canvasId);
    if (!canvas) return;

    const chart = setupCanvas(canvas);
    const area = chartArea(chart);
    const maxY = Math.max(0.01, ...rows.map((row) => row.value));
    const step = area.width / rows.length;
    const width = Math.max(6, step * 0.7);

    drawGrid(chart, maxY);
    chart.ctx.fillStyle = color;

    rows.forEach((row, index) => {
      const x = area.x + index * step + step / 2 - width / 2;
      const y = yFor(chart, row.value, maxY);

      // Rounded bar tops
      chart.ctx.beginPath();
      chart.ctx.roundRect(x, y, width, area.y + area.height - y, [4, 4, 0, 0]);
      chart.ctx.fill();
    });
    drawLabels(chart, rows);
  }

  function drawComparisonChart(comparison) {
    const rows = comparison.map((result) => ({
      label: result.config.name,
      value: result.rejectionProbability + result.abandonmentProbability,
    }));
    drawBarChart("comparison-chart", rows, "#f43f5e"); // Rose red
  }

  root.Lab10Charts = { drawLineChart, drawBarChart, drawComparisonChart };
})(typeof globalThis !== "undefined" ? globalThis : window);
