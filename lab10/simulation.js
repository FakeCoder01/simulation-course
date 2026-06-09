"use strict";
const tools =
  typeof require !== "undefined"
    ? require("./sim_utils.js")
    : globalThis.Lab10Tools;
const {
  MAX_EVENTS,
  WAIT_EPS,
  STATE_LOG_STEP,
  Random,
  EventCalendar,
  CustomerAgent,
  OperatorAgent,
  divide,
  average,
  weightedMean,
  formatNumber,
  formatPercent,
  probabilityRows,
  exactProbabilityRows,
  waitRows,
} = tools;

class QueueSimulation {
  constructor(config) {
    this.config = normalizeConfig(config);
    this.random = new Random(this.config.seed);
    this.calendar = new EventCalendar();
    this.servers = [];
    this.queue = [];
    for (let i = 1; i <= this.config.servers; i++)
      this.servers.push(new OperatorAgent(i));
    this.clock = 0;
    this.lastEventTime = 0;
    this.nextCustomerId = 1;
    this.arrivalToken = 0;
    this.resourceUsed = 0;
    this.stateTime = [];
    this.queueTime = [];
    this.busyOperatorTime = [];
    this.waits = [];
    this.systemTimes = [];
    this.eventLog = [];
    this.stateLog = [];
    this.nextStateLogTime = 0;
    this.lastStateLogTime = null;
    this.arrivals = 0;
    this.admitted = 0;
    this.rejected = 0;
    this.serviceStarts = 0;
    this.completed = 0;
    this.abandoned = 0;
    this.busyTime = 0;
    this.resourceTime = 0;
  }
  endTime() {
    return this.config.warmup + this.config.observation;
  }
  isObserved(time) {
    return time >= this.config.warmup && time <= this.endTime();
  }
  busyServers() {
    return this.servers.filter((server) => !server.isFree()).length;
  }
  systemSize() {
    return this.queue.length + this.busyServers();
  }
  freeServer() {
    return this.servers.find((server) => server.isFree()) || null;
  }
  currentArrivalRate() {
    if (this.config.sourcePopulation === 0) return this.config.lambda;
    const outside = Math.max(
      0,
      this.config.sourcePopulation - this.systemSize(),
    );
    return (this.config.lambda * outside) / this.config.sourcePopulation;
  }
  collectTimeStats(from, to) {
    const a = Math.max(from, this.config.warmup);
    const b = Math.min(to, this.endTime());
    if (b <= a) return;
    const dt = b - a;
    const n = this.systemSize();
    const q = this.queue.length;
    const busy = this.busyServers();
    this.stateTime[n] = (this.stateTime[n] || 0) + dt;
    this.queueTime[q] = (this.queueTime[q] || 0) + dt;
    this.busyOperatorTime[busy] = (this.busyOperatorTime[busy] || 0) + dt;
    this.busyTime += busy * dt;
    this.resourceTime += this.resourceUsed * dt;
  }
  addEventLog(text) {
    if (this.eventLog.length >= this.config.logLimit) return;
    this.eventLog.push(
      `${formatNumber(this.clock, 3).padStart(10, " ")} | ${text}`,
    );
  }
  addStateLogLine(time) {
    const phase = time < this.config.warmup ? "warmup" : "observe";
    const line = [
      `${formatNumber(time, 0).padStart(6, " ")} | ${phase.padEnd(7, " ")}`,
      `N=${String(this.systemSize()).padStart(2, " ")}`,
      `Q=${String(this.queue.length).padStart(2, " ")}`,
      `busy=${this.busyServers()}/${this.config.servers}`,
      `res=${this.resourceUsed}/${this.config.resourceCapacity}`,
      `arr=${this.arrivals}`,
      `adm=${this.admitted}`,
      `rej=${this.rejected}`,
      `done=${this.completed}`,
      `left=${this.abandoned}`,
    ].join(" | ");
    this.stateLog.push(line);
    this.lastStateLogTime = time;
  }
  addStateLogUntil(time) {
    while (
      this.nextStateLogTime <= time &&
      this.nextStateLogTime <= this.endTime()
    ) {
      this.addStateLogLine(this.nextStateLogTime);
      this.nextStateLogTime += STATE_LOG_STEP;
    }
  }
  planArrival() {
    const rate = this.currentArrivalRate();
    if (rate <= 0) return;
    this.arrivalToken++;
    this.calendar.add(this.clock + this.random.exponential(rate), "arrival", {
      token: this.arrivalToken,
    });
  }
  planDeparture(server, customer) {
    this.calendar.add(
      this.clock + this.random.exponential(this.config.mu),
      "departure",
      { serverId: server.id, customerId: customer.id },
    );
  }
  planAbandonment(customer) {
    const patienceRate = 1 / this.config.patienceMean;
    this.calendar.add(
      this.clock + this.random.exponential(patienceRate),
      "abandon",
      { customer },
    );
  }
  handleArrival(event) {
    if (event.data.token !== this.arrivalToken) return;
    if (this.isObserved(this.clock)) this.arrivals++;
    const customer = new CustomerAgent(
      this.nextCustomerId++,
      this.clock,
      this.random.integer(this.config.resourceMin, this.config.resourceMax),
    );
    customer.processEvent({ type: "arrival" }, this);
    this.planArrival();
  }
  acceptCustomer(customer) {
    if (this.systemSize() >= this.config.capacity) {
      customer.status = "rejected";
      if (this.isObserved(this.clock)) this.rejected++;
      this.addEventLog(`REJECT  c${customer.id}, system full`);
    } else {
      this.queue.push(customer);
      if (this.isObserved(this.clock)) this.admitted++;
      this.addEventLog(
        `ARRIVE  c${customer.id}, resource=${customer.resourceNeed}, queue=${this.queue.length}`,
      );
      this.planAbandonment(customer);
      this.tryStartService();
    }
  }
  handleDeparture(event) {
    const server = this.servers.find((item) => item.id === event.data.serverId);
    if (!server) return;
    server.processEvent(event, this);
  }
  completeService(server, customerId) {
    if (!server.customer || server.customer.id !== customerId) return;
    const customer = server.customer;
    server.customer = null;
    customer.status = "completed";
    this.resourceUsed -= customer.resourceNeed;
    if (this.isObserved(this.clock)) {
      this.completed++;
      this.systemTimes.push(this.clock - customer.arrivalTime);
    }
    this.addEventLog(`FINISH  c${customer.id} from s${server.id}`);
    this.tryStartService();
    if (this.config.sourcePopulation > 0) this.planArrival();
  }
  handleAbandonment(event) {
    const customer = event.data.customer;
    customer.processEvent(event, this);
  }
  removeWaitingCustomer(customer) {
    if (customer.status !== "waiting") return;
    const index = this.queue.indexOf(customer);
    if (index >= 0) this.queue.splice(index, 1);
    customer.status = "abandoned";
    if (this.isObserved(this.clock)) this.abandoned++;
    this.addEventLog(
      `LEAVE   c${customer.id}, waited=${formatNumber(this.clock - customer.arrivalTime, 3)}`,
    );
    this.tryStartService();
    if (this.config.sourcePopulation > 0) this.planArrival();
  }
  tryStartService() {
    while (this.queue.length > 0) {
      const server = this.freeServer();
      const customer = this.queue[0];
      if (
        !server ||
        this.resourceUsed + customer.resourceNeed > this.config.resourceCapacity
      )
        return;
      this.queue.shift();
      this.startService(server, customer);
    }
  }
  startService(server, customer) {
    customer.status = "service";
    server.customer = customer;
    this.resourceUsed += customer.resourceNeed;
    const wait = this.clock - customer.arrivalTime;
    if (this.isObserved(this.clock)) {
      this.serviceStarts++;
      this.waits.push(wait);
    }
    this.addEventLog(
      `START   c${customer.id} on s${server.id}, wait=${formatNumber(wait, 3)}`,
    );
    this.planDeparture(server, customer);
  }
  run() {
    this.addEventLog(`START   ${this.config.name}`);
    this.addStateLogUntil(0);
    this.planArrival();
    let processedEvents = 0;
    while (this.calendar.length > 0) {
      const event = this.calendar.next();
      if (!event || event.time > this.endTime()) break;
      processedEvents++;
      if (processedEvents > MAX_EVENTS)
        throw new Error("Event limit exceeded. Reduce the horizon or rates.");
      this.collectTimeStats(this.lastEventTime, event.time);
      this.addStateLogUntil(event.time);
      this.clock = event.time;
      this.lastEventTime = event.time;
      if (event.type === "arrival") this.handleArrival(event);
      if (event.type === "departure") this.handleDeparture(event);
      if (event.type === "abandon") this.handleAbandonment(event);
    }
    this.collectTimeStats(this.lastEventTime, this.endTime());
    this.addStateLogUntil(this.endTime());
    if (this.lastStateLogTime !== this.endTime())
      this.addStateLogLine(this.endTime());
    this.clock = this.endTime();
    this.addEventLog("STOP    observation horizon reached");
    return this.summary();
  }
  summary() {
    const stateProbabilities = this.stateTime.map(
      (time) => (time || 0) / this.config.observation,
    );
    const queueProbabilities = this.queueTime.map(
      (time) => (time || 0) / this.config.observation,
    );
    const busyOperatorProbabilities = this.busyOperatorTime.map(
      (time) => (time || 0) / this.config.observation,
    );
    return {
      config: this.config,
      stateProbabilities,
      queueProbabilities,
      busyOperatorProbabilities,
      waitHistogram: waitRows(this.waits),
      stateRows: probabilityRows(stateProbabilities, this.config.capacity),
      queueRows: probabilityRows(queueProbabilities, this.config.capacity),
      busyOperatorRows: exactProbabilityRows(
        busyOperatorProbabilities,
        this.config.servers,
      ),
      eventLog: this.eventLog,
      stateLog: this.stateLog,
      log: this.eventLog,
      arrivals: this.arrivals,
      admitted: this.admitted,
      rejected: this.rejected,
      serviceStarts: this.serviceStarts,
      completed: this.completed,
      abandoned: this.abandoned,
      offeredLoad: this.config.lambda / (this.config.servers * this.config.mu),
      rejectionProbability: divide(this.rejected, this.arrivals),
      abandonmentProbability: divide(this.abandoned, this.admitted),
      serverUtilization:
        this.busyTime / (this.config.servers * this.config.observation),
      resourceUtilization:
        this.resourceTime /
        (this.config.resourceCapacity * this.config.observation),
      meanSystemSize: weightedMean(stateProbabilities),
      meanQueueLength: weightedMean(queueProbabilities),
      meanWait: average(this.waits),
      meanSystemTime: average(this.systemTimes),
      immediateProbability: divide(
        this.waits.filter((wait) => wait <= WAIT_EPS).length,
        this.waits.length,
      ),
      longWaitProbability: divide(
        this.waits.filter((wait) => wait > this.config.longWait).length,
        this.waits.length,
      ),
      throughput: this.completed / this.config.observation,
    };
  }
}

function normalizeConfig(config) {
  return {
    ...config,
    lambda: Number(config.lambda),
    mu: Number(config.mu),
    patienceMean: Number(config.patienceMean),
    servers: Math.max(1, Math.floor(config.servers)),
    capacity: Math.max(1, Math.floor(config.capacity)),
    sourcePopulation: Math.max(0, Math.floor(config.sourcePopulation)),
    resourceCapacity: Math.max(1, Math.floor(config.resourceCapacity)),
    resourceMin: Math.max(1, Math.floor(config.resourceMin)),
    resourceMax: Math.max(1, Math.floor(config.resourceMax)),
    observation: Math.max(1, Number(config.observation)),
    warmup: Math.max(0, Number(config.warmup)),
    longWait: Math.max(0, Number(config.longWait)),
    logLimit: Math.max(20, Math.floor(config.logLimit || 260)),
    seed: Math.floor(config.seed || 1),
  };
}

function validateConfig(config) {
  if (config.lambda <= 0 || config.mu <= 0)
    return "Lambda and mu must be positive.";
  if (config.capacity < config.servers)
    return "Capacity K must be at least the number of servers c.";
  if (config.sourcePopulation > 0 && config.sourcePopulation < config.capacity)
    return "Finite source N should be at least K.";
  if (config.patienceMean <= 0) return "Mean patience must be positive.";
  if (config.resourceMin > config.resourceMax)
    return "Resource min cannot exceed resource max.";
  if (config.resourceMax > config.resourceCapacity)
    return "Resource capacity must cover the largest request.";
  const horizon = config.observation + config.warmup;
  if (
    (config.lambda + config.servers * config.mu + config.lambda) * horizon >
    MAX_EVENTS
  )
    return "Too many events for an interactive browser run.";
  return "";
}

function runSimulation(config) {
  const normalized = normalizeConfig(config);
  const error = validateConfig(normalized);
  if (error) throw new Error(error);
  return new QueueSimulation(normalized).run();
}

const Lab10Simulation = {
  ...tools,
  QueueSimulation,
  normalizeConfig,
  validateConfig,
  runSimulation,
};
if (typeof globalThis !== "undefined")
  globalThis.Lab10Simulation = Lab10Simulation;
if (typeof module !== "undefined") module.exports = Lab10Simulation;
