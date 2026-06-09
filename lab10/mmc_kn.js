"use strict";

if (typeof require !== "undefined" && typeof module !== "undefined") {
  const scenarios = require("./scenarios.js");
  const simulation = require("./simulation.js");
  module.exports = { ...scenarios, ...simulation };
}
