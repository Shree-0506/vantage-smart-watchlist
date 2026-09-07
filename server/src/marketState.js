const { getUniverse, stepToTimestamp } = require("./data/simulate");

function getAdminState(db) {
  const row = db.prepare("SELECT * FROM admin_state WHERE id = 1").get();
  return { scenario: row.scenario, currentStep: row.current_step };
}

function getCurrentUniverse(db) {
  const { scenario, currentStep } = getAdminState(db);
  const universe = getUniverse(scenario);
  return { universe, scenario, currentStep, currentTimestamp: stepToTimestamp(currentStep) };
}

module.exports = { getAdminState, getCurrentUniverse };
