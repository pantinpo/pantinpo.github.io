const reduceMotion = window.matchMedia("(prefers-reduced-motion: reduce)").matches;

// Reveal on scroll

const revealObserver = new IntersectionObserver(entries => {
  for (const entry of entries) {
    if (!entry.isIntersecting) continue;
    entry.target.classList.add("is-visible");
    revealObserver.unobserve(entry.target);
  }
}, { threshold: 0.12, rootMargin: "0px 0px -40px 0px" });

document.querySelectorAll("[data-reveal]").forEach(el => revealObserver.observe(el));

// Count-up stats

function countUp(el) {
  const target = Number(el.dataset.count);
  const suffix = el.dataset.suffix || "";
  const duration = 1400;
  const start = performance.now();
  const tick = now => {
    const t = Math.min(1, (now - start) / duration);
    const eased = 1 - Math.pow(1 - t, 3);
    el.textContent = Math.round(target * eased).toLocaleString("en-US") + suffix;
    if (t < 1) requestAnimationFrame(tick);
  };
  requestAnimationFrame(tick);
}

if (!reduceMotion) {
  const countObserver = new IntersectionObserver(entries => {
    for (const entry of entries) {
      if (!entry.isIntersecting) continue;
      countUp(entry.target);
      countObserver.unobserve(entry.target);
    }
  }, { threshold: 0.6 });

  document.querySelectorAll("[data-count]").forEach(el => {
    el.textContent = "0" + (el.dataset.suffix || "");
    countObserver.observe(el);
  });
}

// Scroll-driven UI: header, progress bar, active nav link, timeline

const header = document.getElementById("header");
const nav = document.getElementById("nav");
const navLinks = [...nav.querySelectorAll("a")];
const indicator = nav.querySelector(".nav-indicator");
const sections = navLinks.map(link => document.querySelector(link.getAttribute("href")));
const timeline = document.getElementById("timeline");
const timelineItems = [...timeline.querySelectorAll(":scope > li")];
const root = document.documentElement;

function moveIndicator(link) {
  if (!link) {
    indicator.style.opacity = 0;
    return;
  }
  indicator.style.opacity = 1;
  indicator.style.width = link.offsetWidth + "px";
  indicator.style.setProperty("--x", link.offsetLeft + "px");
}

function onScroll() {
  const scrollY = window.scrollY;
  const maxScroll = root.scrollHeight - window.innerHeight;

  header.classList.toggle("scrolled", scrollY > 8);
  root.style.setProperty("--progress", maxScroll > 0 ? scrollY / maxScroll : 0);
  root.style.setProperty("--scroll", scrollY);

  let activeIndex = -1;
  sections.forEach((section, i) => {
    if (section.getBoundingClientRect().top <= window.innerHeight * 0.35) activeIndex = i;
  });
  if (scrollY >= maxScroll - 2) activeIndex = sections.length - 1;
  navLinks.forEach((link, i) => link.classList.toggle("active", i === activeIndex));
  moveIndicator(navLinks[activeIndex]);

  const anchor = window.innerHeight * 0.6;
  const bounds = timeline.getBoundingClientRect();
  const filled = Math.max(0, Math.min(1, (anchor - bounds.top) / bounds.height));
  timeline.style.setProperty("--timeline", filled);
  timelineItems.forEach(item => item.classList.toggle("reached", item.getBoundingClientRect().top + 8 < anchor));
}

let scrollQueued = false;
window.addEventListener("scroll", () => {
  if (scrollQueued) return;
  scrollQueued = true;
  requestAnimationFrame(() => {
    onScroll();
    scrollQueued = false;
  });
}, { passive: true });
window.addEventListener("resize", onScroll);
onScroll();

// Mobile menu

const menuToggle = document.getElementById("menu-toggle");

function setMenu(open) {
  nav.classList.toggle("open", open);
  menuToggle.setAttribute("aria-expanded", open);
  menuToggle.setAttribute("aria-label", open ? "Close menu" : "Open menu");
}

menuToggle.addEventListener("click", () => setMenu(!nav.classList.contains("open")));
navLinks.forEach(link => link.addEventListener("click", () => setMenu(false)));

// Flip cards (hover flips on desktop; tap or Enter toggles)

document.querySelectorAll(".flip").forEach(card => {
  card.addEventListener("click", () => {
    card.setAttribute("aria-pressed", card.getAttribute("aria-pressed") !== "true");
  });
});

// Cursor-following highlight on cards

document.querySelectorAll(".card").forEach(card => {
  card.addEventListener("pointermove", event => {
    const bounds = card.getBoundingClientRect();
    card.style.setProperty("--mx", event.clientX - bounds.left + "px");
    card.style.setProperty("--my", event.clientY - bounds.top + "px");
  });
});

// Revenue chart

// Monthly net revenue from the e-commerce project (sales_clean.csv),
// excluding cancelled and returned orders.
const MONTHLY_REVENUE = [
  ["2024-01", 72831], ["2024-02", 78039], ["2024-03", 93797], ["2024-04", 81777],
  ["2024-05", 94148], ["2024-06", 94706], ["2024-07", 96133], ["2024-08", 110163],
  ["2024-09", 101895], ["2024-10", 112466], ["2024-11", 148969], ["2024-12", 161350],
  ["2025-01", 93798], ["2025-02", 92428], ["2025-03", 108538], ["2025-04", 103842],
  ["2025-05", 119896], ["2025-06", 109327], ["2025-07", 132732], ["2025-08", 131440],
  ["2025-09", 132132], ["2025-10", 141810], ["2025-11", 200653], ["2025-12", 192916],
  ["2026-01", 127326], ["2026-02", 108679], ["2026-03", 147099], ["2026-04", 142866],
  ["2026-05", 165438], ["2026-06", 148741], ["2026-07", 180145], ["2026-08", 181920],
];

const SVG_NS = "http://www.w3.org/2000/svg";
const Y_MAX = 250000;
const Y_STEP = 50000;
const MARGIN = { top: 12, right: 56, bottom: 28, left: 48 };

const monthName = key => {
  const [year, month] = key.split("-").map(Number);
  return new Date(year, month - 1).toLocaleString("en-US", { month: "short", year: "numeric" });
};
const fullCurrency = value => "$" + value.toLocaleString("en-US");
const compactCurrency = value => "$" + Math.round(value / 1000) + "K";

function el(tag, attrs, parent) {
  const node = document.createElementNS(SVG_NS, tag);
  for (const [key, value] of Object.entries(attrs)) node.setAttribute(key, value);
  if (parent) parent.appendChild(node);
  return node;
}

let chartDrawn = reduceMotion;
let chartParts = null;

function renderChart(container) {
  container.innerHTML = "";
  const width = container.clientWidth;
  const height = container.clientHeight;
  const plotWidth = width - MARGIN.left - MARGIN.right;
  const plotHeight = height - MARGIN.top - MARGIN.bottom;

  const x = i => MARGIN.left + (i / (MONTHLY_REVENUE.length - 1)) * plotWidth;
  const y = value => MARGIN.top + plotHeight - (value / Y_MAX) * plotHeight;

  const svg = el("svg", { width, height, tabindex: 0, "aria-hidden": "true" }, container);

  for (let tick = 0; tick <= Y_MAX; tick += Y_STEP) {
    el("line", {
      x1: MARGIN.left, x2: width - MARGIN.right, y1: y(tick), y2: y(tick),
      stroke: "var(--grid)", "stroke-width": 1,
    }, svg);
    el("text", {
      x: MARGIN.left - 8, y: y(tick), "text-anchor": "end", "dominant-baseline": "middle", class: "axis-label",
    }, svg).textContent = tick === 0 ? "$0" : compactCurrency(tick);
  }

  MONTHLY_REVENUE.forEach(([key], i) => {
    if (key.endsWith("-01")) {
      el("text", { x: x(i), y: height - 6, "text-anchor": "start", class: "axis-label" }, svg).textContent = key.slice(0, 4);
    }
  });

  const points = MONTHLY_REVENUE.map(([, value], i) => [x(i), y(value)]);
  const linePath = points.map(([px, py], i) => (i ? "L" : "M") + px + "," + py).join("");
  const areaPath = linePath + `L${x(points.length - 1)},${y(0)}L${x(0)},${y(0)}Z`;

  const area = el("path", { d: areaPath, fill: "var(--series-1)", "fill-opacity": 0.1 }, svg);
  const line = el("path", {
    d: linePath, fill: "none", stroke: "var(--series-1)", "stroke-width": 2,
    "stroke-linejoin": "round", "stroke-linecap": "round",
  }, svg);

  const last = points[points.length - 1];
  const endDot = el("circle", {
    cx: last[0], cy: last[1], r: 4, fill: "var(--series-1)", stroke: "var(--surface-raised)", "stroke-width": 2,
  }, svg);
  const endLabel = el("text", {
    x: last[0] + 10, y: last[1], "dominant-baseline": "middle", class: "end-label",
  }, svg);
  endLabel.textContent = compactCurrency(MONTHLY_REVENUE[MONTHLY_REVENUE.length - 1][1]);

  chartParts = { area, line, endDot, endLabel };
  if (!chartDrawn) {
    const length = line.getTotalLength();
    line.style.strokeDasharray = length;
    line.style.strokeDashoffset = length;
    for (const part of [area, endDot, endLabel]) part.style.opacity = 0;
  }

  // Hover layer: crosshair snaps to the nearest month.
  const crosshair = el("line", {
    y1: MARGIN.top, y2: MARGIN.top + plotHeight, stroke: "var(--text-muted)", "stroke-width": 1, visibility: "hidden",
  }, svg);
  const hoverDot = el("circle", {
    r: 5, fill: "var(--series-1)", stroke: "var(--surface-raised)", "stroke-width": 2, visibility: "hidden",
  }, svg);
  const hitArea = el("rect", {
    x: MARGIN.left, y: MARGIN.top, width: plotWidth, height: plotHeight, fill: "transparent",
  }, svg);

  const tooltip = document.createElement("div");
  tooltip.className = "chart-tooltip";
  container.appendChild(tooltip);

  let activeIndex = null;

  function show(i) {
    activeIndex = i;
    const [key, value] = MONTHLY_REVENUE[i];
    const [px, py] = points[i];
    crosshair.setAttribute("x1", px);
    crosshair.setAttribute("x2", px);
    crosshair.setAttribute("visibility", "visible");
    hoverDot.setAttribute("cx", px);
    hoverDot.setAttribute("cy", py);
    hoverDot.setAttribute("visibility", "visible");

    tooltip.innerHTML = `<div class="tooltip-month">${monthName(key)}</div>
      <div class="tooltip-value"><span class="tooltip-key"></span>${fullCurrency(value)}</div>`;
    const tooltipWidth = tooltip.offsetWidth;
    const left = px + 12 + tooltipWidth > width ? px - 12 - tooltipWidth : px + 12;
    tooltip.style.left = left + "px";
    tooltip.style.top = Math.max(0, py - 56) + "px";
    tooltip.classList.add("visible");
  }

  function hide() {
    activeIndex = null;
    crosshair.setAttribute("visibility", "hidden");
    hoverDot.setAttribute("visibility", "hidden");
    tooltip.classList.remove("visible");
  }

  hitArea.addEventListener("pointermove", event => {
    const bounds = svg.getBoundingClientRect();
    const ratio = (event.clientX - bounds.left - MARGIN.left) / plotWidth;
    show(Math.max(0, Math.min(MONTHLY_REVENUE.length - 1, Math.round(ratio * (MONTHLY_REVENUE.length - 1)))));
  });
  hitArea.addEventListener("pointerleave", hide);

  svg.addEventListener("keydown", event => {
    if (event.key !== "ArrowLeft" && event.key !== "ArrowRight") return;
    event.preventDefault();
    const step = event.key === "ArrowRight" ? 1 : -1;
    const start = activeIndex ?? (step > 0 ? -1 : MONTHLY_REVENUE.length);
    show(Math.max(0, Math.min(MONTHLY_REVENUE.length - 1, start + step)));
  });
  svg.addEventListener("blur", hide);
}

function drawChartIn() {
  chartDrawn = true;
  const { area, line, endDot, endLabel } = chartParts;
  line.style.transition = "stroke-dashoffset 1.6s cubic-bezier(0.4, 0, 0.2, 1)";
  line.style.strokeDashoffset = 0;
  area.style.transition = "opacity 0.8s ease 0.6s";
  for (const part of [endDot, endLabel]) part.style.transition = "opacity 0.4s ease 1.5s";
  for (const part of [area, endDot, endLabel]) part.style.opacity = 1;
}

function renderTable(tbody) {
  tbody.innerHTML = MONTHLY_REVENUE
    .map(([key, value]) => `<tr><td>${monthName(key)}</td><td>${fullCurrency(value)}</td></tr>`)
    .join("");
}

const chart = document.getElementById("revenue-chart");
renderChart(chart);
renderTable(document.querySelector("#revenue-table tbody"));
new ResizeObserver(() => renderChart(chart)).observe(chart);

if (!chartDrawn) {
  const chartObserver = new IntersectionObserver(entries => {
    if (!entries[0].isIntersecting) return;
    requestAnimationFrame(drawChartIn);
    chartObserver.disconnect();
  }, { threshold: 0.5 });
  chartObserver.observe(chart);
}
