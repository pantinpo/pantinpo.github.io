const BASE_CALLS = [
  14, 22, 34, 46, 58, 66, 70, 68, 62, 56, 52, 57, 62, 60, 54,
  48, 42, 38, 33, 30, 28, 31, 34, 32, 26, 21, 17, 13, 10, 7,
];
const BASE_TOTAL = BASE_CALLS.reduce((sum, n) => sum + n, 0);
const INTERVAL_SEC = 1800;
const SVG_NS = "http://www.w3.org/2000/svg";

const intervalLabel = i => {
  const minutes = 7 * 60 + i * 30;
  return `${String(Math.floor(minutes / 60)).padStart(2, "0")}:${minutes % 60 ? "30" : "00"}`;
};

// Erlang B by recursion, then converted to Erlang C. Stable for large agent counts.
function erlangC(n, a) {
  if (n <= a) return 1;
  let b = 1;
  for (let k = 1; k <= n; k++) b = (a * b) / (k + a * b);
  return (n * b) / (n - a * (1 - b));
}

function serviceLevel(n, a, targetSec, aht) {
  if (n <= a) return 0;
  return 1 - erlangC(n, a) * Math.exp((-(n - a) * targetSec) / aht);
}

function requiredAgents(calls, aht, slTarget, targetSec, maxOcc) {
  const a = (calls * aht) / INTERVAL_SEC;
  if (a === 0) return 0;
  let n = Math.max(1, Math.floor(a) + 1);
  while (serviceLevel(n, a, targetSec, aht) < slTarget || a / n > maxOcc) n++;
  return n;
}

function staffingPlan(calls, { sl, targetSec, aht, shrinkage, maxOcc }) {
  return calls.map((volume, i) => {
    const a = (volume * aht) / INTERVAL_SEC;
    const agents = requiredAgents(volume, aht, sl, targetSec, maxOcc);
    return {
      label: intervalLabel(i),
      calls: volume,
      erlangs: a,
      agents,
      sl: agents ? serviceLevel(agents, a, targetSec, aht) : 1,
      asa: agents ? (erlangC(agents, a) * aht) / (agents - a) : 0,
      occupancy: agents ? a / agents : 0,
      heads: Math.ceil(agents / (1 - shrinkage) - 1e-9),
    };
  });
}

function scaledCalls(total) {
  return BASE_CALLS.map(n => Math.round((n * total) / BASE_TOTAL));
}

// Page

const form = document.getElementById("calc-form");
const chart = document.getElementById("agents-chart");
const tableBody = document.querySelector("#agents-table tbody");
const volumeInput = document.getElementById("volume");
const volumeOutput = document.getElementById("volume-value");
const statusEl = document.getElementById("calc-status");
const pct = value => Math.round(value * 100) + "%";
let plan = [];
let statusTimer;

function readInputs() {
  const num = id => Number(document.getElementById(id).value);
  const inputs = {
    sl: num("sl") / 100,
    targetSec: num("target"),
    aht: num("aht"),
    shrinkage: num("shrinkage") / 100,
    maxOcc: num("occupancy") / 100,
  };
  const valid = form.checkValidity();
  return valid ? inputs : null;
}

function update() {
  const inputs = readInputs();
  const calls = scaledCalls(Number(volumeInput.value));
  volumeOutput.textContent = calls.reduce((sum, n) => sum + n, 0).toLocaleString("en-US") + " calls";
  if (!inputs) return;
  plan = staffingPlan(calls, inputs);

  const totalCalls = plan.reduce((sum, row) => sum + row.calls, 0);
  const peak = plan.reduce((best, row) => (row.agents > best.agents ? row : best), plan[0]);
  const agentHours = plan.reduce((sum, row) => sum + row.agents, 0) / 2;
  const scheduledHours = plan.reduce((sum, row) => sum + row.heads, 0) / 2;
  const dailySl = totalCalls ? plan.reduce((sum, row) => sum + row.calls * row.sl, 0) / totalCalls : 1;

  document.getElementById("kpi-peak").textContent = peak.agents;
  document.getElementById("kpi-peak-note").textContent = `at ${peak.label}, ${peak.heads} scheduled after shrinkage`;
  document.getElementById("kpi-hours").textContent = agentHours.toLocaleString("en-US");
  document.getElementById("kpi-scheduled").textContent = scheduledHours.toLocaleString("en-US");
  document.getElementById("kpi-sl").textContent = (dailySl * 100).toFixed(1) + "%";
  document.getElementById("kpi-sl-note").textContent = `target ${pct(inputs.sl)} in ${inputs.targetSec} sec`;

  renderChart();
  renderTable();

  clearTimeout(statusTimer);
  statusTimer = setTimeout(() => {
    statusEl.textContent = `Peak ${peak.agents} agents at ${peak.label}. ${agentHours} agent-hours. Daily service level ${(dailySl * 100).toFixed(1)}%.`;
  }, 800);
}

function el(tag, attrs, parent) {
  const node = document.createElementNS(SVG_NS, tag);
  for (const [key, value] of Object.entries(attrs)) node.setAttribute(key, value);
  if (parent) parent.appendChild(node);
  return node;
}

function niceStep(max) {
  for (const step of [1, 2, 5, 10, 20, 25, 50, 100]) if (max / step <= 5) return step;
  return 200;
}

let activeIndex = null;

function renderChart() {
  chart.innerHTML = "";
  const width = chart.clientWidth;
  const height = chart.clientHeight;
  if (!width || !plan.length) return;
  const margin = { top: 28, right: 8, bottom: 28, left: 32 };
  const plotWidth = width - margin.left - margin.right;
  const plotHeight = height - margin.top - margin.bottom;
  const maxAgents = Math.max(...plan.map(row => row.agents), 1);
  const step = niceStep(maxAgents);
  const yMax = Math.ceil(maxAgents / step) * step;
  const band = plotWidth / plan.length;
  const barWidth = Math.max(2, band * 0.68);
  const y = value => margin.top + plotHeight - (value / yMax) * plotHeight;

  const svg = el("svg", {
    width, height, tabindex: 0, role: "img",
    "aria-label": "Agents required by 30-minute interval. Use the table below for exact values.",
  }, chart);

  for (let tick = 0; tick <= yMax; tick += step) {
    el("line", {
      x1: margin.left, x2: width - margin.right, y1: y(tick), y2: y(tick), stroke: "var(--grid)", "stroke-width": 1,
    }, svg);
    el("text", {
      x: margin.left - 8, y: y(tick), "text-anchor": "end", "dominant-baseline": "middle", class: "axis-label",
    }, svg).textContent = tick;
  }

  const highlight = el("rect", {
    y: margin.top, width: band, height: plotHeight, rx: 4, fill: "var(--accent-soft)", visibility: "hidden",
  }, svg);

  const centers = plan.map((_, i) => margin.left + band * i + band / 2);
  plan.forEach((row, i) => {
    if (i % 4 === 0) {
      el("text", { x: centers[i], y: height - 6, "text-anchor": "middle", class: "axis-label" }, svg).textContent = row.label;
    }
    if (!row.agents) return;
    const x0 = centers[i] - barWidth / 2;
    const top = y(row.agents);
    const r = Math.min(4, barWidth / 2, y(0) - top);
    el("path", {
      d: `M${x0},${y(0)}V${top + r}Q${x0},${top} ${x0 + r},${top}H${x0 + barWidth - r}Q${x0 + barWidth},${top} ${x0 + barWidth},${top + r}V${y(0)}Z`,
      fill: "var(--series-1)",
    }, svg);
  });

  const peakIndex = plan.findIndex(row => row.agents === maxAgents);
  el("text", {
    x: centers[peakIndex], y: y(maxAgents) - 8, "text-anchor": "middle", class: "end-label",
  }, svg).textContent = `Peak ${maxAgents}`;

  const hitArea = el("rect", {
    x: margin.left, y: margin.top, width: plotWidth, height: plotHeight, fill: "transparent",
  }, svg);

  const tooltip = document.createElement("div");
  tooltip.className = "chart-tooltip";
  chart.appendChild(tooltip);

  function show(i) {
    activeIndex = i;
    const row = plan[i];
    highlight.setAttribute("x", margin.left + band * i);
    highlight.setAttribute("visibility", "visible");
    tooltip.innerHTML = `<div class="tooltip-month">${row.label}–${intervalLabel(i + 1)}</div>
      <div class="tooltip-value"><span class="tooltip-key bar-key"></span>${row.agents} agents</div>
      <div class="tooltip-detail">${row.calls} calls · SL ${pct(row.sl)} · ${row.heads} scheduled</div>`;
    const tipWidth = tooltip.offsetWidth;
    const left = centers[i] + band + tipWidth > width ? centers[i] - band - tipWidth : centers[i] + band;
    tooltip.style.left = Math.max(0, left) + "px";
    tooltip.style.top = Math.max(0, y(row.agents) - 70) + "px";
    tooltip.classList.add("visible");
  }

  function hide() {
    activeIndex = null;
    highlight.setAttribute("visibility", "hidden");
    tooltip.classList.remove("visible");
  }

  const showAtPointer = event => {
    const bounds = svg.getBoundingClientRect();
    const i = Math.floor((event.clientX - bounds.left - margin.left) / band);
    show(Math.max(0, Math.min(plan.length - 1, i)));
  };
  hitArea.addEventListener("pointermove", showAtPointer);
  hitArea.addEventListener("pointerdown", showAtPointer);
  hitArea.addEventListener("pointerleave", event => {
    if (event.pointerType === "mouse") hide();
  });
  svg.addEventListener("keydown", event => {
    if (event.key !== "ArrowLeft" && event.key !== "ArrowRight") return;
    event.preventDefault();
    const dir = event.key === "ArrowRight" ? 1 : -1;
    const start = activeIndex ?? (dir > 0 ? -1 : plan.length);
    show(Math.max(0, Math.min(plan.length - 1, start + dir)));
  });
  svg.addEventListener("blur", hide);
}

function renderTable() {
  tableBody.innerHTML = plan.map(row => `<tr>
    <td>${row.label}</td><td>${row.calls}</td><td>${row.erlangs.toFixed(2)}</td><td>${row.agents}</td>
    <td>${(row.sl * 100).toFixed(1)}%</td><td>${row.asa.toFixed(1)}</td><td>${pct(row.occupancy)}</td><td>${row.heads}</td>
  </tr>`).join("");
}

form.addEventListener("input", update);
form.addEventListener("submit", event => event.preventDefault());
document.getElementById("calc-reset").addEventListener("click", () => {
  form.reset();
  update();
});
new ResizeObserver(renderChart).observe(chart);
update();
