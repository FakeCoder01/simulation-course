"use strict";

(function exposeTools(root) {
  const MAX_EVENTS = 1800000;
  const WAIT_EPS = 1e-10;
  const STATE_LOG_STEP = 100;

  class Random {
    constructor(seed = 1) {
      this.modulus = 2147483647;
      this.multiplier = 48271;
      this.state = Math.abs(Math.floor(seed)) % this.modulus || 1;
    }
    next() {
      this.state = (this.state * this.multiplier) % this.modulus;
      return this.state / this.modulus;
    }
    exponential(rate) {
      return -Math.log(Math.max(this.next(), Number.MIN_VALUE)) / rate;
    }
    integer(min, max) {
      return min + Math.floor(this.next() * (max - min + 1));
    }
  }

  class EventCalendar {
    constructor() {
      this.events = [];
    }
    add(time, type, data = {}) {
      if (Number.isFinite(time)) this.events.push({ time, type, data });
    }
    next() {
      this.events.sort((a, b) => a.time - b.time);
      return this.events.shift();
    }
    get length() {
      return this.events.length;
    }
  }

  class Agent {
    constructor(id, kind) {
      this.id = id;
      this.kind = kind;
    }
    processEvent() {}
  }

  class CustomerAgent extends Agent {
    constructor(id, arrivalTime, resourceNeed) {
      super(id, "customer");
      this.id = id;
      this.arrivalTime = arrivalTime;
      this.resourceNeed = resourceNeed;
      this.status = "waiting";
    }
    processEvent(event, model) {
      if (event.type === "arrival") model.acceptCustomer(this);
      if (event.type === "abandon") model.removeWaitingCustomer(this);
    }
  }

  class OperatorAgent extends Agent {
    constructor(id) {
      super(id, "operator");
      this.id = id;
      this.customer = null;
    }
    isFree() {
      return this.customer === null;
    }
    processEvent(event, model) {
      if (event.type === "departure")
        model.completeService(this, event.data.customerId);
    }
  }

  const Customer = CustomerAgent;
  const Server = OperatorAgent;

  function divide(a, b) {
    return b ? a / b : 0;
  }
  function average(values) {
    return values.length
      ? values.reduce((sum, value) => sum + value, 0) / values.length
      : 0;
  }
  function weightedMean(probabilities) {
    return probabilities.reduce(
      (sum, probability, index) => sum + index * probability,
      0,
    );
  }
  function formatNumber(value, digits = 4) {
    return Number.isFinite(value) ? value.toFixed(digits) : "-";
  }
  function formatPercent(value, digits = 1) {
    return Number.isFinite(value) ? `${(value * 100).toFixed(digits)}%` : "-";
  }

  function probabilityRows(probabilities, capacity) {
    const lastObserved = probabilities.length - 1;
    const lastShown = Math.max(8, Math.min(24, lastObserved, capacity));
    const rows = [];
    for (let i = 0; i <= lastShown; i++)
      rows.push({ label: String(i), value: probabilities[i] || 0 });
    const tail = probabilities
      .slice(lastShown + 1)
      .reduce((sum, p) => sum + p, 0);
    if (tail > 0.0001) rows.push({ label: `${lastShown + 1}+`, value: tail });
    return rows;
  }

  function exactProbabilityRows(probabilities, maxValue) {
    const rows = [];
    for (let i = 0; i <= maxValue; i++)
      rows.push({ label: String(i), value: probabilities[i] || 0 });
    return rows;
  }

  function waitRows(waits) {
    if (!waits.length) return [{ label: "0", value: 1 }];
    const positive = waits.filter((wait) => wait > WAIT_EPS);
    const maxWait = Math.max(1, positive.length ? Math.max(...positive) : 0);
    const binCount = 12;
    const width = maxWait / binCount;
    const rows = [
      {
        label: "0",
        value: waits.filter((wait) => wait <= WAIT_EPS).length / waits.length,
      },
    ];
    for (let i = 0; i < binCount; i++) {
      const from = i * width;
      const to = i === binCount - 1 ? Infinity : (i + 1) * width;
      const count = positive.filter((wait) =>
        to === Infinity ? wait > from : wait > from && wait <= to,
      ).length;
      rows.push({
        label:
          to === Infinity
            ? `>${formatNumber(from, 1)}`
            : `${formatNumber(from, 1)}-${formatNumber(to, 1)}`,
        value: count / waits.length,
      });
    }
    return rows;
  }

  const Lab10Tools = {
    MAX_EVENTS,
    WAIT_EPS,
    STATE_LOG_STEP,
    Agent,
    Random,
    EventCalendar,
    CustomerAgent,
    OperatorAgent,
    Customer,
    Server,
    divide,
    average,
    weightedMean,
    formatNumber,
    formatPercent,
    probabilityRows,
    exactProbabilityRows,
    waitRows,
  };
  if (root) root.Lab10Tools = Lab10Tools;
  if (typeof module !== "undefined") module.exports = Lab10Tools;
})(typeof globalThis !== "undefined" ? globalThis : window);
