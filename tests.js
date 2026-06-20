/* ============================================================
   TREAD — Test Suite
   tests.js — lightweight, dependency-free unit tests for the
   carbon footprint calculator (window.TreadCalculator.computeFootprint).

   HOW TO RUN:
   Open test.html in a browser (separate from the main app) and
   check the results rendered on the page, or open the browser
   console after loading test.html for a full pass/fail log.

   No framework required — this is a minimal, self-contained
   assert/test runner so the suite has zero external dependencies.
   ============================================================ */

(function () {
  "use strict";

  const results = [];
  let passCount = 0;
  let failCount = 0;

  function assert(condition, message) {
    if (condition) {
      passCount++;
      results.push({ pass: true, message });
    } else {
      failCount++;
      results.push({ pass: false, message });
    }
  }

  function assertClose(actual, expected, tolerance, message) {
    const diff = Math.abs(actual - expected);
    assert(diff <= tolerance, `${message} (expected ≈${expected}, got ${actual.toFixed(4)}, diff ${diff.toFixed(4)})`);
  }

  function test(name, fn) {
    try {
      fn();
    } catch (err) {
      failCount++;
      results.push({ pass: false, message: `${name} threw an error: ${err.message}` });
    }
  }

  // ---------------------------------------------------------
  // Pull in the calculator. Works whether tests.js is loaded
  // after script.js in a browser (window.TreadCalculator) or
  // run under Node for CI (require fallback).
  // ---------------------------------------------------------
  const computeFootprint =
    (typeof window !== "undefined" && window.TreadCalculator)
      ? window.TreadCalculator.computeFootprint
      : null;

  if (!computeFootprint) {
    console.error("TreadCalculator not found. Load script.js before tests.js.");
    return;
  }

  // Baseline input set mirroring the default slider values in index.html
  const DEFAULT_INPUTS = {
    transportFactor: 0.18,
    weeklyKm: 120,
    flights: 1,
    bill: 2500,
    household: 3,
    sourceMultiplier: 1.0,
    dietBase: 1.7,
    wasteLevel: 1,
    recyclingFactor: 0.8,
    goodsLevel: 1
  };

  // -----------------------------------------------------------
  // TEST 1: Default inputs produce a sensible, well-known total
  // -----------------------------------------------------------
  test("default inputs produce expected total (~5.3t)", () => {
    const result = computeFootprint(DEFAULT_INPUTS);
    assertClose(result.total, 5.32, 0.05, "Default total should be approximately 5.32t");
  });

  // -----------------------------------------------------------
  // TEST 2: All-minimum (most eco-friendly) inputs never go negative
  // -----------------------------------------------------------
  test("minimum inputs produce a non-negative total", () => {
    const result = computeFootprint({
      transportFactor: 0.05, weeklyKm: 0, flights: 0,
      bill: 0, household: 8, sourceMultiplier: 0.3,
      dietBase: 0.8, wasteLevel: 0,
      recyclingFactor: 0.4, goodsLevel: 0
    });
    assert(result.total >= 0, "Total must never be negative");
    assert(result.transport >= 0, "Transport must never be negative");
    assert(result.energy >= 0, "Energy must never be negative");
    assert(result.diet >= 0, "Diet must never be negative");
    assert(result.waste >= 0, "Waste must never be negative");
  });

  // -----------------------------------------------------------
  // TEST 3: Maximum (heaviest) inputs stay finite and don't overflow
  // -----------------------------------------------------------
  test("maximum inputs produce a finite, bounded total", () => {
    const result = computeFootprint({
      transportFactor: 0.25, weeklyKm: 500, flights: 10,
      bill: 10000, household: 1, sourceMultiplier: 1.0,
      dietBase: 2.5, wasteLevel: 3,
      recyclingFactor: 1.2, goodsLevel: 3
    });
    assert(Number.isFinite(result.total), "Total must be a finite number");
    assert(result.total < 100, "Total should stay within a believable range (<100t) even at max inputs");
  });

  // -----------------------------------------------------------
  // TEST 4: Category sub-totals always sum to the reported total
  // -----------------------------------------------------------
  test("category breakdown sums to the total", () => {
    const result = computeFootprint(DEFAULT_INPUTS);
    const sum = result.transport + result.energy + result.diet + result.waste;
    assertClose(sum, result.total, 0.001, "transport + energy + diet + waste should equal total");
  });

  // -----------------------------------------------------------
  // TEST 5: Household size of zero does not throw or divide by zero
  // -----------------------------------------------------------
  test("household size of zero is handled safely (no divide-by-zero)", () => {
    const result = computeFootprint({ ...DEFAULT_INPUTS, household: 0 });
    assert(Number.isFinite(result.energy), "Energy must remain finite when household is 0");
    assert(!Number.isNaN(result.total), "Total must not be NaN when household is 0");
  });

  // -----------------------------------------------------------
  // TEST 6: Increasing weekly distance increases transport footprint
  // -----------------------------------------------------------
  test("increasing distance increases transport footprint (monotonicity)", () => {
    const low = computeFootprint({ ...DEFAULT_INPUTS, weeklyKm: 50 });
    const high = computeFootprint({ ...DEFAULT_INPUTS, weeklyKm: 400 });
    assert(high.transport > low.transport, "More weekly km should mean a higher transport footprint");
  });

  // -----------------------------------------------------------
  // TEST 7: Switching to renewable energy source reduces energy footprint
  // -----------------------------------------------------------
  test("lower-carbon energy source reduces energy footprint", () => {
    const gridHeavy = computeFootprint({ ...DEFAULT_INPUTS, sourceMultiplier: 1.0 });
    const solar = computeFootprint({ ...DEFAULT_INPUTS, sourceMultiplier: 0.3 });
    assert(solar.energy < gridHeavy.energy, "Solar/renewables should produce a lower energy footprint than grid-heavy");
  });

  // -----------------------------------------------------------
  // TEST 8: Vegan diet produces a lower diet footprint than meat-heavy
  // -----------------------------------------------------------
  test("vegan diet produces lower footprint than meat-heavy diet", () => {
    const meatHeavy = computeFootprint({ ...DEFAULT_INPUTS, dietBase: 2.5 });
    const vegan = computeFootprint({ ...DEFAULT_INPUTS, dietBase: 0.8 });
    assert(vegan.diet < meatHeavy.diet, "Vegan diet base should yield a lower diet footprint");
  });

  // -----------------------------------------------------------
  // TEST 9: Output shape always has the five expected numeric keys
  // -----------------------------------------------------------
  test("result object has the expected shape", () => {
    const result = computeFootprint(DEFAULT_INPUTS);
    ["transport", "energy", "diet", "waste", "total"].forEach((key) => {
      assert(typeof result[key] === "number", `result.${key} should be a number`);
      assert(!Number.isNaN(result[key]), `result.${key} should not be NaN`);
    });
  });

  // -----------------------------------------------------------
  // Render results
  // -----------------------------------------------------------
  function renderResults() {
    const summary = `${passCount} passed, ${failCount} failed, ${results.length} total`;
    console.log(`%cTread Test Suite: ${summary}`, failCount === 0 ? "color: green; font-weight: bold;" : "color: red; font-weight: bold;");
    results.forEach((r) => {
      const icon = r.pass ? "✅" : "❌";
      console.log(`${icon} ${r.message}`);
    });

    // If running in a browser with a results container, render visually too
    if (typeof document !== "undefined") {
      const container = document.getElementById("testResults");
      if (container) {
        const items = results.map((r) =>
          `<li class="${r.pass ? "pass" : "fail"}">${r.pass ? "✅" : "❌"} ${r.message}</li>`
        ).join("");
        container.innerHTML = `
          <p class="test-summary ${failCount === 0 ? "all-pass" : "has-fail"}">${summary}</p>
          <ul class="test-list">${items}</ul>
        `;
      }
    }
  }

  renderResults();

  // Expose for any external test runner / CI hook
  if (typeof window !== "undefined") {
    window.TreadTestResults = { passCount, failCount, results };
  }
})();
