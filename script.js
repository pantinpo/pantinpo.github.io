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

// Scroll-driven UI: header, progress bar, active nav link

const header = document.getElementById("header");
const nav = document.getElementById("nav");
const navLinks = [...nav.querySelectorAll("a")];
const indicator = nav.querySelector(".nav-indicator");
const sections = navLinks.map(link => document.querySelector(link.getAttribute("href")));
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

// Ask about Jas: pre-written answers, typed out like a chat

const ASK = [
  {
    q: "How does Jas fit an Analytics or BI Manager role?",
    a: [
      "Jas leads a global data analytics team at Accenture, fully remote. He turns business questions into KPIs and Power BI dashboards with product, operations and engineering leads, and sets the governance and QA standards for multi-region reporting.",
      "His team's results: 20+ vendor sites in a single source of truth, data accuracy lifted from 83% to 99% in 4 weeks, and 100% on-time reporting.",
      "Before that he ran capacity planning for 1,000+ FTEs at Citi and coached a team of 4 analysts. With 8+ years in analytics after 6 on the operations floor, he builds reporting for the people who actually use it.",
    ],
    link: { href: "#projects", label: "See the projects" },
  },
  {
    q: "Can Jas work remotely in my time zone?",
    a: [
      "Yes. Jas works fully remote today, leading a global team from Manila, and is available for US and Australia / NZ hours.",
      "Working across regions is how he has spent his career: multi-region reporting at Accenture, global workforce optimization at Citi, and vendor sites in the Philippines, India and Puerto Rico at Optum.",
    ],
    link: { href: document.getElementById("book-call").href, label: "Book a 30-min call" },
  },
  {
    q: "Does Jas know SQL and Python, and what does he use them for?",
    a: [
      "Yes. His e-commerce dashboard project uses both, end to end. SQL pulls the data from a six-table source database and uses a window function to flag each customer's first order.",
      "Python (pandas) then cleans it, fixing 8 types of data issues across 45,736 orders and validating the output before it reaches Looker Studio.",
      "At work he also builds with Google Apps Script, VBA, Excel and Power BI.",
    ],
    link: { href: "https://github.com/pantinpo/BI_Portfolio", label: "See the code on GitHub" },
  },
  {
    q: "What has Jas automated?",
    a: [
      "At Accenture: reporting pipelines in Google Apps Script for 20+ vendor sites, with automated cleaning, multi-week consolidation and anomaly detection, kept human-in-the-loop. Routine reporting setup time dropped 30%.",
      "Earlier: overtime billing and executive dashboards in VBA at Optum, and Excel dashboards for SLA adherence, capacity and staffing at Citi.",
    ],
  },
  {
    q: "How does Jas use AI at work?",
    a: [
      "He builds AI into the daily work itself: data pipelines where AI handles the ingestion, and websites vibe-coded with AI, like the insights dashboard on this site.",
      "For his team he created AI skills and prompt libraries, and set up AI-automated queries that run daily-cadence workflows from nothing more than simple tables.",
      "He also founded Work Faster & Smarter, which trained 100+ operations staff to use AI and lifted daily adoption from 83% to 96%+, with zero policy violations.",
    ],
  },
];

const askLog = document.getElementById("ask-log");
const askChips = document.getElementById("ask-chips");
const askReset = document.getElementById("ask-reset");
const askStatus = document.getElementById("ask-status");
const askGreeting = askLog.innerHTML;
const bookingUrl = document.getElementById("book-call").href;
const wait = ms => new Promise(resolve => setTimeout(resolve, ms));
let answering = false;

function addBubble(from) {
  const bubble = document.createElement("div");
  bubble.className = `bubble bubble-${from}`;
  askLog.appendChild(bubble);
  askLog.scrollTop = askLog.scrollHeight;
  return bubble;
}

async function typeParagraph(bubble, text) {
  const p = document.createElement("p");
  bubble.appendChild(p);
  if (reduceMotion) {
    p.textContent = text;
    return;
  }
  const words = text.split(" ");
  for (let i = 1; i <= words.length; i++) {
    p.textContent = words.slice(0, i).join(" ");
    askLog.scrollTop = askLog.scrollHeight;
    await wait(22);
  }
}

async function reply(paragraphs, link) {
  const bubble = addBubble("bot");
  bubble.classList.add("typing");
  bubble.innerHTML = "<span></span><span></span><span></span>";
  await wait(reduceMotion ? 0 : 700);
  bubble.classList.remove("typing");
  bubble.innerHTML = "";

  askStatus.textContent = paragraphs.join(" ");
  for (const text of paragraphs) await typeParagraph(bubble, text);

  if (link) {
    const a = document.createElement("a");
    a.href = link.href;
    a.textContent = link.label + " →";
    if (link.href.startsWith("http")) {
      a.target = "_blank";
      a.rel = "noopener";
    }
    bubble.appendChild(document.createElement("p")).appendChild(a);
    askLog.scrollTop = askLog.scrollHeight;
  }
}

async function ask(item, chip) {
  if (answering || chip.getAttribute("aria-disabled")) return;
  answering = true;
  askChips.classList.add("busy");
  chip.setAttribute("aria-disabled", "true");
  askReset.hidden = false;

  addBubble("user").textContent = item.q;
  await reply(item.a, item.link);
  if (!askChips.querySelector('.chip:not([aria-disabled="true"])')) {
    await reply(["That's everything I can answer here. The quickest way to learn more is a short call with Jas."],
      { href: bookingUrl, label: "Book a 30-min call" });
  }

  answering = false;
  askChips.classList.remove("busy");
}

function resetAsk() {
  askLog.innerHTML = askGreeting;
  askStatus.textContent = "";
  askReset.hidden = true;
  askChips.innerHTML = "";
  for (const item of ASK) {
    const chip = document.createElement("button");
    chip.type = "button";
    chip.className = "chip";
    chip.textContent = item.q;
    chip.addEventListener("click", () => ask(item, chip));
    askChips.appendChild(chip);
  }
}

askReset.addEventListener("click", () => {
  if (answering) return;
  resetAsk();
  askChips.firstChild.focus();
});
resetAsk();

// Experience timeline: side-scrolls with drag, swipe, arrows or keyboard

const timeline = document.getElementById("timeline");
const timelineItems = [...timeline.children];
const timelinePrev = document.getElementById("timeline-prev");
const timelineNext = document.getElementById("timeline-next");
const timelineCount = document.getElementById("timeline-count");
const pad = n => String(n).padStart(2, "0");

// Each card's distance from where the first card rests.
function cardOffsets() {
  const start = timeline.getBoundingClientRect().left + parseFloat(getComputedStyle(timeline).paddingLeft);
  return timelineItems.map(item => item.getBoundingClientRect().left - start);
}

function updateTimeline() {
  const offsets = cardOffsets();
  const atStart = timeline.scrollLeft <= 2;
  const atEnd = timeline.scrollLeft >= timeline.scrollWidth - timeline.clientWidth - 2;
  let current = offsets.reduce((best, offset, i) => (Math.abs(offset) < Math.abs(offsets[best]) ? i : best), 0);
  if (atEnd) current = timelineItems.length - 1;

  timelineItems.forEach((item, i) => {
    item.classList.toggle("current", i === current);
    item.classList.toggle("reached", item.getBoundingClientRect().left < window.innerWidth * 0.8);
  });
  timelineCount.textContent = `${pad(current + 1)} / ${pad(timelineItems.length)}`;
  timelinePrev.disabled = atStart;
  timelineNext.disabled = atEnd;
}

function stepTimeline(direction) {
  const offsets = cardOffsets();
  const target = direction > 0 ? offsets.findIndex(o => o > 2) : offsets.findLastIndex(o => o < -2);
  if (target === -1) return;
  timeline.scrollBy({ left: offsets[target], behavior: reduceMotion ? "auto" : "smooth" });
}

timelinePrev.addEventListener("click", () => stepTimeline(-1));
timelineNext.addEventListener("click", () => stepTimeline(1));

let timelineQueued = false;
timeline.addEventListener("scroll", () => {
  if (timelineQueued) return;
  timelineQueued = true;
  requestAnimationFrame(() => {
    updateTimeline();
    timelineQueued = false;
  });
}, { passive: true });
window.addEventListener("resize", updateTimeline);
updateTimeline();

// Mouse drag. Touch and trackpads already scroll sideways natively.
let drag = null;

timeline.addEventListener("pointerdown", event => {
  if (event.pointerType !== "mouse" || event.button !== 0) return;
  drag = { x: event.clientX, left: timeline.scrollLeft, moved: false };
});

window.addEventListener("pointermove", event => {
  if (!drag) return;
  const dx = event.clientX - drag.x;
  if (!drag.moved && Math.abs(dx) > 4) {
    drag.moved = true;
    timeline.classList.add("dragging");
    window.getSelection().removeAllRanges();
  }
  if (drag.moved) timeline.scrollLeft = drag.left - dx;
});

window.addEventListener("pointerup", () => {
  if (!drag) return;
  if (drag.moved) {
    timeline.classList.remove("dragging");
    const offsets = cardOffsets();
    const nearest = offsets.reduce((best, o) => (Math.abs(o) < Math.abs(best) ? o : best), Infinity);
    timeline.scrollBy({ left: nearest, behavior: reduceMotion ? "auto" : "smooth" });
  }
  drag = null;
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

  const showAtPointer = event => {
    const bounds = svg.getBoundingClientRect();
    const ratio = (event.clientX - bounds.left - MARGIN.left) / plotWidth;
    show(Math.max(0, Math.min(MONTHLY_REVENUE.length - 1, Math.round(ratio * (MONTHLY_REVENUE.length - 1)))));
  };
  hitArea.addEventListener("pointermove", showAtPointer);
  hitArea.addEventListener("pointerdown", showAtPointer);
  // On touch, keep the tooltip after the finger lifts; tapping elsewhere blurs the chart and hides it.
  hitArea.addEventListener("pointerleave", event => {
    if (event.pointerType === "mouse") hide();
  });

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

// Hero tiles: revenue sparkline and Manila local time

function renderSpark() {
  const svg = document.getElementById("spark");
  const values = MONTHLY_REVENUE.map(([, value]) => value);
  const max = Math.max(...values);
  const points = values.map((value, i) => [(i / (values.length - 1)) * 300, 76 - (value / max) * 60]);
  const line = points.map(([px, py], i) => (i ? "L" : "M") + px.toFixed(1) + "," + py.toFixed(1)).join("");
  el("path", { d: line + "L300,80L0,80Z", fill: "var(--series-1)", "fill-opacity": 0.12 }, svg);
  el("path", {
    d: line, fill: "none", stroke: "var(--series-1)", "stroke-width": 2,
    "vector-effect": "non-scaling-stroke", "stroke-linejoin": "round",
  }, svg);

  const [lastKey, lastValue] = MONTHLY_REVENUE[MONTHLY_REVENUE.length - 1];
  const yearAgo = MONTHLY_REVENUE.find(([key]) => key === `${Number(lastKey.slice(0, 4)) - 1}${lastKey.slice(4)}`);
  document.getElementById("spark-value").textContent = compactCurrency(lastValue);
  document.getElementById("spark-note").textContent = yearAgo
    ? `${monthName(lastKey)} · ${lastValue >= yearAgo[1] ? "+" : "−"}${Math.round(Math.abs(lastValue / yearAgo[1] - 1) * 100)}% vs last year`
    : monthName(lastKey);
}

renderSpark();

const localTime = document.getElementById("local-time");
const manilaClock = new Intl.DateTimeFormat("en-US", { timeZone: "Asia/Manila", hour: "numeric", minute: "2-digit" });

function updateLocalTime() {
  localTime.textContent = `${manilaClock.format(new Date())} in Manila (GMT+8)`;
}

updateLocalTime();
setInterval(updateLocalTime, 30000);
