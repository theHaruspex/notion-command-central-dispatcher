const test = require("node:test");
const assert = require("node:assert/strict");

const { selectEventsConfigCandidate } = require("../dist/apps/events/routing/resolveWorkflowRouting.js");

function candidate(overrides = {}) {
  return {
    workflowDefinitionId: "wf-1",
    statePropertyName: "Posting Status",
    originDatabaseName: "NEW MCC",
    statePropertyPresent: false,
    ...overrides,
  };
}

test("selects the only candidate with state present", () => {
  const c1 = candidate({ statePropertyName: "Posting Status", statePropertyPresent: false });
  const c2 = candidate({ statePropertyName: "New Brand Status", statePropertyPresent: true });
  const result = selectEventsConfigCandidate([c1, c2]);
  assert.equal(result.selected, c2);
  assert.equal(result.reason, "single_state_present");
});

test("returns the only candidate even if state not present", () => {
  const c1 = candidate({ statePropertyPresent: false });
  const result = selectEventsConfigCandidate([c1]);
  assert.equal(result.selected, c1);
  assert.equal(result.reason, "single_candidate_no_state");
});

test("prefers first candidate when multiple states are present", () => {
  const c1 = candidate({ statePropertyName: "Posting Status", statePropertyPresent: true });
  const c2 = candidate({ statePropertyName: "New Brand Status", statePropertyPresent: true });
  const result = selectEventsConfigCandidate([c1, c2]);
  assert.equal(result.selected, c1);
  assert.equal(result.reason, "multi_state_present");
});

test("prefers first candidate when no states are present", () => {
  const c1 = candidate({ statePropertyName: "Posting Status", statePropertyPresent: false });
  const c2 = candidate({ statePropertyName: "New Brand Status", statePropertyPresent: false });
  const result = selectEventsConfigCandidate([c1, c2]);
  assert.equal(result.selected, c1);
  assert.equal(result.reason, "multi_candidate_no_state");
});

test("returns null when no candidates exist", () => {
  const result = selectEventsConfigCandidate([]);
  assert.equal(result.selected, null);
  assert.equal(result.reason, "no_candidates");
});
