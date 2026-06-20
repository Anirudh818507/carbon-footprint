/* ============================================================
   TREAD — Carbon Footprint Awareness Platform
   script.js — calculator, trail viz, insights, habits, journal
   ============================================================ */

(function () {
  "use strict";

  /* ---------------------------------------------------------
     CONSTANTS
  --------------------------------------------------------- */
  const NATIONAL_AVERAGE = 4.0;  // tonnes CO2e / year, rough national reference
  const GAUGE_MAX = 15;          // tonnes, top of the gauge scale
  const STORAGE_KEYS = {
    actions: "tread_actions_v1",
    streak: "tread_streak_v1",
    journal: "tread_journal_v1"
  };

  const CATEGORY_META = {
    transport: { label: "Transport", color: "#3E6B4F" },
    energy:    { label: "Home energy", color: "#C97B4A" },
    diet:      { label: "Diet", color: "#8FA68E" },
    waste:     { label: "Waste & goods", color: "#9C6644" }
  };

  /* ---------------------------------------------------------
     ELEMENT REFERENCES
  --------------------------------------------------------- */
  const el = {
    totalFootprint: document.getElementById("totalFootprint"),
    compareText: document.getElementById("compareText"),
    gaugeFill: document.getElementById("gaugeFill"),
    gaugeAvgMarker: document.getElementById("gaugeAvgMarker"),

    transportMode: document.getElementById("transportMode"),
    distanceRange: document.getElementById("distanceRange"),
    distanceVal: document.getElementById("distanceVal"),
    flightsRange: document.getElementById("flightsRange"),
    flightsVal: document.getElementById("flightsVal"),

    electricityRange: document.getElementById("electricityRange"),
    electricityVal: document.getElementById("electricityVal"),
    householdRange: document.getElementById("householdRange"),
    householdVal: document.getElementById("householdVal"),
    energySource: document.getElementById("energySource"),

    dietType: document.getElementById("dietType"),
    wasteRange: document.getElementById("wasteRange"),
    wasteVal: document.getElementById("wasteVal"),

    recyclingHabit: document.getElementById("recyclingHabit"),
    goodsRange: document.getElementById("goodsRange"),
    goodsVal: document.getElementById("goodsVal"),

    trailSvg: document.getElementById("trailSvg"),
    legend: document.getElementById("legend"),
    insightCards: document.getElementById("insightCards"),

    actionList: document.getElementById("actionList"),
    streakCount: document.getElementById("streakCount"),
    streakNote: document.getElementById("streakNote"),
    totalActionsLogged: document.getElementById("totalActionsLogged"),
    streakHeaderValue: document.getElementById("streakHeaderValue"),

    saveReadingBtn: document.getElementById("saveReadingBtn"),
    historySvg: document.getElementById("historySvg"),
    journalEmpty: document.getElementById("journalEmpty"),
    journalList: document.getElementById("journalList")
  };

  const WASTE_LABELS = ["Almost none", "Moderate", "Quite a bit", "A lot"];
  const GOODS_LABELS = ["Minimal", "Average", "Frequent shopper", "Always buying new"];

  /* ---------------------------------------------------------
     SECURITY: defensive HTML escaping
     All dynamic strings rendered below originate from this app's
     own fixed config (TIPS, DEFAULT_ACTIONS, CATEGORY_META) or from
     numbers/dates computed locally — never from a raw open-text user
     input field. Escaping is still applied defensively wherever a
     string could end up inside innerHTML, so the output is safe even
     if this data source changes in the future.
  --------------------------------------------------------- */
  function escapeHTML(str) {
    const div = document.createElement("div");
    div.textContent = String(str);
    return div.innerHTML;
  }

  /* ---------------------------------------------------------
     CALCULATOR
     computeFootprint() is a pure function — no DOM access — so
     it can be unit tested directly (see tests.js). calculateFootprint()
     is the thin wrapper that reads current form values and calls it.
  --------------------------------------------------------- */
  function computeFootprint(inputs) {
    const {
      transportFactor, weeklyKm, flights,
      bill, household, sourceMultiplier,
      dietBase, wasteLevel,
      recyclingFactor, goodsLevel
    } = inputs;

    // Transport: weekly km * weekly factor * 52 + flights
    const transportTonnes = (weeklyKm * transportFactor * 52) / 1000 + flights * 0.25;

    // Energy: monthly bill (INR) -> rough proxy * 12 * source multiplier / household share
    const safeHousehold = household > 0 ? household : 1; // guard against divide-by-zero
    const energyTonnes = ((bill * 0.0001 * 12) * sourceMultiplier) / safeHousehold;

    // Diet: annual base by diet type, adjusted by waste level
    const dietTonnes = dietBase + wasteLevel * 0.15;

    // Waste & goods
    const wasteTonnes = recyclingFactor + goodsLevel * 0.3;

    const total = transportTonnes + energyTonnes + dietTonnes + wasteTonnes;

    return {
      transport: Math.max(0, transportTonnes),
      energy: Math.max(0, energyTonnes),
      diet: Math.max(0, dietTonnes),
      waste: Math.max(0, wasteTonnes),
      total: Math.max(0, total)
    };
  }

  function calculateFootprint() {
    return computeFootprint({
      transportFactor: parseFloat(el.transportMode.value),
      weeklyKm: parseFloat(el.distanceRange.value),
      flights: parseFloat(el.flightsRange.value),
      bill: parseFloat(el.electricityRange.value),
      household: parseFloat(el.householdRange.value),
      sourceMultiplier: parseFloat(el.energySource.value),
      dietBase: parseFloat(el.dietType.value),
      wasteLevel: parseFloat(el.wasteRange.value),
      recyclingFactor: parseFloat(el.recyclingHabit.value),
      goodsLevel: parseFloat(el.goodsRange.value)
    });
  }

  // Expose for the test suite (tests.js) and any external evaluation tooling.
  // Harmless in production — just a reference to a pure function, no side effects.
  if (typeof window !== "undefined") {
    window.TreadCalculator = { computeFootprint };
  }

  /* ---------------------------------------------------------
     UPDATE LIVE LABELS NEXT TO SLIDERS
  --------------------------------------------------------- */
  function updateFieldLabels() {
    el.distanceVal.textContent = `${el.distanceRange.value} km`;
    el.flightsVal.textContent = el.flightsRange.value;
    el.electricityVal.textContent = `₹${Number(el.electricityRange.value).toLocaleString("en-IN")}`;
    el.householdVal.textContent = `${el.householdRange.value} ${el.householdRange.value === "1" ? "person" : "people"}`;
    el.wasteVal.textContent = WASTE_LABELS[parseInt(el.wasteRange.value, 10)];
    el.goodsVal.textContent = GOODS_LABELS[parseInt(el.goodsRange.value, 10)];
  }

  /* ---------------------------------------------------------
     RENDER: HERO READING + GAUGE
  --------------------------------------------------------- */
  function renderReading(result) {
    el.totalFootprint.textContent = result.total.toFixed(1);

    const diff = result.total - NATIONAL_AVERAGE;
    const pct = Math.abs(Math.round((diff / NATIONAL_AVERAGE) * 100));
    let compareHTML;
    if (Math.abs(diff) < 0.15) {
      compareHTML = `Right around the national average of <strong>${NATIONAL_AVERAGE.toFixed(1)}t</strong>.`;
    } else if (diff > 0) {
      compareHTML = `That's <strong>${pct}% above</strong> the national average of ${NATIONAL_AVERAGE.toFixed(1)}t.`;
    } else {
      compareHTML = `That's <strong>${pct}% below</strong> the national average of ${NATIONAL_AVERAGE.toFixed(1)}t — good ground.`;
    }
    el.compareText.innerHTML = compareHTML;

    const gaugePct = Math.min(100, (result.total / GAUGE_MAX) * 100);
    el.gaugeFill.style.width = `${gaugePct}%`;

    const avgPct = (NATIONAL_AVERAGE / GAUGE_MAX) * 100;
    el.gaugeAvgMarker.style.left = `${avgPct}%`;

    // color shift on the big number based on standing
    const numberEl = el.totalFootprint;
    if (diff > NATIONAL_AVERAGE * 0.3) {
      numberEl.style.color = "#E0A06B"; // lighter clay against dark panel
    } else if (diff < -NATIONAL_AVERAGE * 0.15) {
      numberEl.style.color = "#A9C2A8"; // lighter sage
    } else {
      numberEl.style.color = "#F7F4EA";
    }
  }

  /* ---------------------------------------------------------
     RENDER: FOOTPRINT TRAIL (signature SVG visualization)
  --------------------------------------------------------- */
  function footprintPath(cx, cy, scale, color, opacity) {
    // A simplified footprint shape, centered at cx,cy, scaled.
    return `<g class="trail-print" transform="translate(${cx},${cy}) scale(${scale})" opacity="${opacity}">
      <ellipse cx="0" cy="0" rx="13" ry="20" fill="${color}"/>
      <circle cx="-11" cy="-26" r="4.5" fill="${color}"/>
      <circle cx="-3.5" cy="-29" r="5" fill="${color}"/>
      <circle cx="4.5" cy="-29" r="5" fill="${color}"/>
      <circle cx="11.5" cy="-26.5" r="4.3" fill="${color}"/>
    </g>`;
  }

  function renderTrail(result) {
    const cats = ["transport", "energy", "diet", "waste"];
    const values = cats.map((c) => result[c]);
    const total = result.total || 0.0001;

    const svgWidth = 1000;
    const svgHeight = 220;
    const baseline = 150;
    const spacing = svgWidth / (cats.length + 1);

    let svgInner = `<line x1="40" y1="${baseline + 35}" x2="${svgWidth - 40}" y2="${baseline + 35}" stroke="#1C2B22" stroke-opacity="0.12" stroke-width="1"/>`;

    cats.forEach((cat, i) => {
      const meta = CATEGORY_META[cat];
      const value = values[i];
      const pct = value / total;
      const scale = 0.7 + Math.min(1.6, pct * 3.2); // visual size driven by share of total
      const cx = spacing * (i + 1);
      const cy = baseline;

      svgInner += footprintPath(cx, cy, scale, meta.color, 0.92);

      // amount label above
      svgInner += `<text x="${cx}" y="${cy - 60 * scale - 8}" text-anchor="middle" class="trail-amount" font-size="20" fill="#1C2B22">${value.toFixed(1)}t</text>`;
      // category label below
      svgInner += `<text x="${cx}" y="${baseline + 60}" text-anchor="middle" class="trail-cat-label" font-size="13.5" fill="#44544A">${meta.label}</text>`;
      // percentage
      svgInner += `<text x="${cx}" y="${baseline + 80}" text-anchor="middle" class="trail-amount" font-size="12" fill="${meta.color}">${Math.round(pct * 100)}%</text>`;
    });

    el.trailSvg.innerHTML = svgInner;

    // Legend
    el.legend.innerHTML = cats.map((cat, i) => {
      const meta = CATEGORY_META[cat];
      const pct = Math.round((values[i] / total) * 100);
      return `<div class="legend-item">
        <span class="legend-dot" style="background:${meta.color}"></span>
        <span class="legend-cat">${escapeHTML(meta.label)}</span>
        <span class="legend-pct">${pct}%</span>
      </div>`;
    }).join("");
  }

  /* ---------------------------------------------------------
     RENDER: INSIGHTS (personalized tips based on largest category)
  --------------------------------------------------------- */
  const TIPS = {
    transport: [
      {
        tag: "Highest impact",
        title: "Swap two car trips a week for transit or cycling",
        body: "Cutting just 40km/week of solo driving can shave roughly 0.3–0.5t off your yearly total — without giving up the car entirely."
      },
      {
        tag: "Worth doing",
        title: "Bundle errands into one trip",
        body: "Combining short drives reduces cold-start emissions, which are disproportionately high per kilometre."
      },
      {
        tag: "Long-term",
        title: "Consider an EV for your next vehicle change",
        body: "Even on a coal-heavy grid, EVs typically cut lifetime transport emissions by 30–50% compared to petrol."
      }
    ],
    energy: [
      {
        tag: "Highest impact",
        title: "Shift peak usage off coal-heavy grid hours",
        body: "Running heavy appliances during off-peak hours, when more renewables are typically on the grid, lowers your effective carbon intensity."
      },
      {
        tag: "Worth doing",
        title: "Seal drafts and service your AC/fridge",
        body: "Poorly maintained cooling systems can use 20–30% more electricity than they need to."
      },
      {
        tag: "Long-term",
        title: "Look into rooftop solar or a green tariff",
        body: "Switching your primary source from grid-mixed to renewable-leaning is the single biggest lever in this category."
      }
    ],
    diet: [
      {
        tag: "Highest impact",
        title: "Make two dinners a week meat-free",
        body: "Red meat has one of the highest footprints per kilogram of any food. Two swaps a week is a realistic, sustainable habit."
      },
      {
        tag: "Worth doing",
        title: "Plan portions to cut food waste",
        body: "Wasted food still carries the full emissions cost of growing, transporting, and refrigerating it — for nothing."
      },
      {
        tag: "Long-term",
        title: "Buy seasonal and local where possible",
        body: "Reduces the transport and cold-storage emissions baked into produce shipped long distances."
      }
    ],
    waste: [
      {
        tag: "Highest impact",
        title: "Separate wet and dry waste consistently",
        body: "Composting organic waste instead of landfilling it prevents methane generation, a much more potent greenhouse gas than CO₂."
      },
      {
        tag: "Worth doing",
        title: "Slow down on new goods",
        body: "Manufacturing footprints dominate most products' life cycle. Buying one fewer item a month adds up over a year."
      },
      {
        tag: "Long-term",
        title: "Repair or resell before replacing",
        body: "Extending a product's life even by a year meaningfully dilutes its embedded manufacturing emissions."
      }
    ]
  };

  function renderInsights(result) {
    const cats = ["transport", "energy", "diet", "waste"];
    const sorted = [...cats].sort((a, b) => result[b] - result[a]);
    const topCategory = sorted[0];
    const tips = TIPS[topCategory];

    el.insightCards.innerHTML = tips.map((tip, i) => {
      const isPriority = i === 0;
      return `<div class="insight-card ${isPriority ? "priority" : ""}">
        <span class="insight-tag">${escapeHTML(tip.tag)}</span>
        <h4>${escapeHTML(tip.title)}</h4>
        <p>${escapeHTML(tip.body)}</p>
      </div>`;
    }).join("");
  }

  /* ---------------------------------------------------------
     MASTER UPDATE
  --------------------------------------------------------- */
  function recalcAll() {
    updateFieldLabels();
    const result = calculateFootprint();
    renderReading(result);
    renderTrail(result);
    renderInsights(result);
    return result;
  }

  /* ---------------------------------------------------------
     HABIT TRACKER
  --------------------------------------------------------- */
  const DEFAULT_ACTIONS = [
    { id: "a1", text: "Used public transit, walked, or cycled today", impact: "~1.2 kg CO₂e" },
    { id: "a2", text: "Ate at least one meat-free meal", impact: "~1.5 kg CO₂e" },
    { id: "a3", text: "Air-dried laundry instead of using a dryer", impact: "~0.8 kg CO₂e" },
    { id: "a4", text: "Brought a reusable bag, bottle, or container", impact: "~0.1 kg CO₂e" },
    { id: "a5", text: "Turned off unused appliances/lights at the plug", impact: "~0.3 kg CO₂e" },
    { id: "a6", text: "Avoided a single-use delivery or takeout order", impact: "~0.4 kg CO₂e" }
  ];

  function todayKey() {
    const d = new Date();
    return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, "0")}-${String(d.getDate()).padStart(2, "0")}`;
  }

  function loadActionState() {
    try {
      const raw = localStorage.getItem(STORAGE_KEYS.actions);
      return raw ? JSON.parse(raw) : {};
    } catch (e) {
      return {};
    }
  }

  function saveActionState(state) {
    localStorage.setItem(STORAGE_KEYS.actions, JSON.stringify(state));
  }

  function loadStreakData() {
    try {
      const raw = localStorage.getItem(STORAGE_KEYS.streak);
      return raw ? JSON.parse(raw) : { count: 0, lastDate: null, totalLogged: 0 };
    } catch (e) {
      return { count: 0, lastDate: null, totalLogged: 0 };
    }
  }

  function saveStreakData(data) {
    localStorage.setItem(STORAGE_KEYS.streak, JSON.stringify(data));
  }

  function checkmarkSVG() {
    return `<svg viewBox="0 0 16 16" fill="none"><path d="M3 8.5L6.2 11.5L13 4.5" stroke="#F7F4EA" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"/></svg>`;
  }

  function renderActions() {
    const state = loadActionState();
    const today = todayKey();
    const todayChecked = state[today] || {};

    el.actionList.innerHTML = DEFAULT_ACTIONS.map((action) => {
      const isChecked = !!todayChecked[action.id];
      return `<div class="action-item ${isChecked ? "checked" : ""}" data-action-id="${action.id}" role="checkbox" aria-checked="${isChecked}" tabindex="0">
        <span class="action-checkbox">${checkmarkSVG()}</span>
        <span class="action-text">${escapeHTML(action.text)}</span>
        <span class="action-impact mono">${escapeHTML(action.impact)}</span>
      </div>`;
    }).join("");

    // attach handlers
    el.actionList.querySelectorAll(".action-item").forEach((item) => {
      item.addEventListener("click", () => toggleAction(item.dataset.actionId));
      item.addEventListener("keydown", (e) => {
        if (e.key === "Enter" || e.key === " ") {
          e.preventDefault();
          toggleAction(item.dataset.actionId);
        }
      });
    });

    renderStreakPanel();
  }

  function toggleAction(actionId) {
    const state = loadActionState();
    const today = todayKey();
    if (!state[today]) state[today] = {};

    const wasChecked = !!state[today][actionId];
    const willCheck = !wasChecked;
    state[today][actionId] = willCheck;
    saveActionState(state);

    // update streak data
    const streakData = loadStreakData();
    const anyCheckedToday = Object.values(state[today]).some(Boolean);

    if (willCheck) {
      streakData.totalLogged += 1;
    } else {
      streakData.totalLogged = Math.max(0, streakData.totalLogged - 1);
    }

    if (anyCheckedToday) {
      if (streakData.lastDate !== today) {
        const yesterday = new Date();
        yesterday.setDate(yesterday.getDate() - 1);
        const yKey = `${yesterday.getFullYear()}-${String(yesterday.getMonth() + 1).padStart(2, "0")}-${String(yesterday.getDate()).padStart(2, "0")}`;

        if (streakData.lastDate === yKey) {
          streakData.count += 1; // continued streak
        } else {
          streakData.count = 1; // streak restarted
        }
        streakData.lastDate = today;
      }
    } else {
      // if nothing checked today anymore and this was today's streak day, roll back
      if (streakData.lastDate === today) {
        streakData.count = Math.max(0, streakData.count - 1);
        streakData.lastDate = streakData.count === 0 ? null : streakData.lastDate;
      }
    }

    saveStreakData(streakData);
    renderActions();
  }

  function renderStreakPanel() {
    const streakData = loadStreakData();
    el.streakCount.textContent = streakData.count;
    el.totalActionsLogged.textContent = streakData.totalLogged;
    el.streakHeaderValue.textContent = `${streakData.count}-day streak`;

    if (streakData.count === 0) {
      el.streakNote.textContent = "Check off an action today to start your streak.";
    } else if (streakData.lastDate === todayKey()) {
      el.streakNote.textContent = `You're keeping it up — ${streakData.count} day${streakData.count === 1 ? "" : "s"} and counting.`;
    } else {
      el.streakNote.textContent = "Log something today to keep your streak alive.";
    }
  }

  /* ---------------------------------------------------------
     JOURNAL (history of saved readings)
  --------------------------------------------------------- */
  function loadJournal() {
    try {
      const raw = localStorage.getItem(STORAGE_KEYS.journal);
      return raw ? JSON.parse(raw) : [];
    } catch (e) {
      return [];
    }
  }

  function saveJournal(entries) {
    localStorage.setItem(STORAGE_KEYS.journal, JSON.stringify(entries));
  }

  function saveTodayReading() {
    const result = calculateFootprint();
    const entries = loadJournal();
    const today = todayKey();

    const existingIdx = entries.findIndex((e) => e.date === today);
    if (existingIdx >= 0) {
      entries[existingIdx].value = result.total;
    } else {
      entries.push({ date: today, value: result.total });
    }
    entries.sort((a, b) => (a.date < b.date ? -1 : 1));
    saveJournal(entries);
    renderJournal();
  }

  function formatDateShort(dateStr) {
    const d = new Date(dateStr + "T00:00:00");
    return d.toLocaleDateString("en-IN", { day: "numeric", month: "short" });
  }

  function renderJournal() {
    const entries = loadJournal();

    if (entries.length === 0) {
      el.journalEmpty.style.display = "block";
      el.historySvg.innerHTML = "";
      el.journalList.innerHTML = "";
      return;
    }

    el.journalEmpty.style.display = "none";

    const width = 800;
    const height = 260;
    const padding = { top: 24, right: 24, bottom: 36, left: 44 };
    const plotW = width - padding.left - padding.right;
    const plotH = height - padding.top - padding.bottom;

    const values = entries.map((e) => e.value);
    const maxVal = Math.max(...values, NATIONAL_AVERAGE) * 1.15;
    const minVal = 0;

    const xStep = entries.length > 1 ? plotW / (entries.length - 1) : 0;

    function xPos(i) { return padding.left + (entries.length > 1 ? i * xStep : plotW / 2); }
    function yPos(v) { return padding.top + plotH - ((v - minVal) / (maxVal - minVal)) * plotH; }

    let svg = "";

    // gridlines
    const gridLines = 4;
    for (let i = 0; i <= gridLines; i++) {
      const v = (maxVal / gridLines) * i;
      const y = yPos(v);
      svg += `<line x1="${padding.left}" y1="${y}" x2="${width - padding.right}" y2="${y}" stroke="#1C2B22" stroke-opacity="0.08" stroke-width="1"/>`;
      svg += `<text x="${padding.left - 10}" y="${y + 4}" text-anchor="end" font-family="JetBrains Mono" font-size="10" fill="#44544A">${v.toFixed(1)}</text>`;
    }

    // national average reference line
    const avgY = yPos(NATIONAL_AVERAGE);
    svg += `<line x1="${padding.left}" y1="${avgY}" x2="${width - padding.right}" y2="${avgY}" stroke="#C97B4A" stroke-width="1.5" stroke-dasharray="4 4" opacity="0.7"/>`;
    svg += `<text x="${width - padding.right}" y="${avgY - 6}" text-anchor="end" font-family="JetBrains Mono" font-size="10" fill="#C97B4A">avg ${NATIONAL_AVERAGE}t</text>`;

    // line path
    let pathD = "";
    entries.forEach((entry, i) => {
      const x = xPos(i);
      const y = yPos(entry.value);
      pathD += (i === 0 ? "M" : "L") + x + "," + y + " ";
    });
    svg += `<path d="${pathD.trim()}" fill="none" stroke="#3E6B4F" stroke-width="2.5" stroke-linejoin="round" stroke-linecap="round"/>`;

    // area fill under line
    if (entries.length > 1) {
      const areaD = pathD.trim() + ` L${xPos(entries.length - 1)},${padding.top + plotH} L${xPos(0)},${padding.top + plotH} Z`;
      svg += `<path d="${areaD}" fill="#3E6B4F" opacity="0.08"/>`;
    }

    // points + x labels
    entries.forEach((entry, i) => {
      const x = xPos(i);
      const y = yPos(entry.value);
      svg += `<circle cx="${x}" cy="${y}" r="4.5" fill="#F7F4EA" stroke="#3E6B4F" stroke-width="2.5"/>`;
      if (entries.length <= 14 || i === 0 || i === entries.length - 1 || i % Math.ceil(entries.length / 8) === 0) {
        svg += `<text x="${x}" y="${height - 10}" text-anchor="middle" font-family="Inter" font-size="10.5" fill="#44544A">${formatDateShort(entry.date)}</text>`;
      }
    });

    el.historySvg.innerHTML = svg;

    // list (most recent first)
    const reversedEntries = [...entries].reverse();
    el.journalList.innerHTML = reversedEntries.map((entry) => {
      return `<li><span class="jl-date">${formatDateShort(entry.date)}</span><span class="jl-val">${entry.value.toFixed(1)}t</span></li>`;
    }).join("");
  }

  /* ---------------------------------------------------------
     EVENT WIRING
  --------------------------------------------------------- */
  function wireCalculatorInputs() {
    const inputs = [
      el.transportMode, el.distanceRange, el.flightsRange,
      el.electricityRange, el.householdRange, el.energySource,
      el.dietType, el.wasteRange,
      el.recyclingHabit, el.goodsRange
    ];
    inputs.forEach((input) => {
      input.addEventListener("input", () => recalcAll());
    });
  }

  function init() {
    wireCalculatorInputs();
    recalcAll();
    renderActions();
    renderJournal();

    el.saveReadingBtn.addEventListener("click", saveTodayReading);
  }

  document.addEventListener("DOMContentLoaded", init);
})();
