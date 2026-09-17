import { load } from "../lib/data.js";
import { el, onResize } from "../lib/dom.js";
import { openPanel } from "../lib/tabs.js";
import { tokens, onTheme } from "../lib/theme.js";
import { num, count } from "../lib/format.js";
import { showTip, hideTip } from "../lib/tooltip.js";
import { onReveal, reducedMotion, intro } from "../lib/chart.js";

function sparkline(svgNode, points, { from, to, format }) {
  const t = tokens();
  const svg = d3.select(svgNode);
  svg.selectAll("*").remove();
  const width = svgNode.clientWidth || 200;
  const height = 34;
  svg.attr("viewBox", `0 0 ${width} ${height}`);
  const x = d3.scaleLinear().domain(d3.extent(points, (p) => p.year)).range([3, width - 5]);
  const y = d3.scaleLinear().domain(d3.extent(points, (p) => p.value)).nice().range([height - 4, 4]);
  const line = d3.line().x((p) => x(p.year)).y((p) => y(p.value)).curve(d3.curveMonotoneX);
  const post = points.filter((p) => p.year >= from - 1 && p.year <= to);
  svg.append("path").attr("class", "draw").attr("d", line(points)).attr("fill", "none").attr("stroke", t.other).attr("stroke-width", 1.5).attr("stroke-linecap", "round");
  svg.append("path").attr("class", "draw").attr("d", line(post)).attr("fill", "none").attr("stroke", t.accent).attr("stroke-width", 2).attr("stroke-linecap", "round");
  const last = post[post.length - 1];
  if (last) svg.append("circle").attr("cx", x(last.year)).attr("cy", y(last.value)).attr("r", 3.5).attr("fill", t.accent).attr("stroke", t.surface).attr("stroke-width", 1.5);
  const focus = svg.append("circle").attr("r", 3.5).attr("fill", t.ink).attr("stroke", t.surface).attr("stroke-width", 1.5).style("opacity", 0);
  svg
    .append("rect")
    .attr("width", width)
    .attr("height", height)
    .attr("fill", "transparent")
    .on("pointermove", (event) => {
      const [mx] = d3.pointer(event);
      const year = x.invert(mx);
      const p = points.reduce((a, b) => (Math.abs(b.year - year) < Math.abs(a.year - year) ? b : a));
      focus.attr("cx", x(p.year)).attr("cy", y(p.value)).style("opacity", 1);
      showTip(event, { title: String(p.year), rows: [{ value: format(p.value), label: "" }] });
    })
    .on("pointerleave", () => {
      focus.style("opacity", 0);
      hideTip();
    });
}

export async function initOverview() {
  const [meta, synthesis] = await Promise.all([load("meta"), load("synthesis")]);
  const h = meta.headline;
  const c = meta.counts;
  const s = synthesis.series;
  const tiles = [
    {
      stage: "Funding",
      target: "funding",
      label: "Federal airport grants per year",
      value: `$${num(h.fundingPost, 1)}B`,
      arrow: "▲",
      delta: `${num(h.fundingChange, 1)}% above $${num(h.fundingPre, 1)}B in FY2017 to FY2021`,
      series: s["Federal airport grants excl. pandemic relief (billion $)"],
      from: 2022,
      to: 2025,
      format: (v) => `$${num(v, 1)}B`,
    },
    {
      stage: "Planning",
      target: "planning",
      label: "Growth in NPIAS estimates",
      value: `${h.npiasChange}%`,
      arrow: "▲",
      delta: `between the 2019 to 2023 and 2025 to 2029 reports; materials PPI ${h.ppiChange}%`,
      series: s["NPIAS 5 year need, nominal (2007 report = 100)"],
      from: 2022,
      to: 2024,
      format: (v) => num(v, 1),
    },
    {
      stage: "Bid",
      target: "bids",
      label: "Bid price index, 2022 to 2025 mean",
      value: num(h.bidIndex, 1),
      arrow: "▲",
      delta: `2021 = 100; PPI for highway inputs ${num(h.ppiHighway, 1)}`,
      series: s["Airfield bid price index, hedonic (2021 = 100)"],
      from: 2022,
      to: 2025,
      format: (v) => num(v, 1),
    },
    {
      stage: "Award",
      target: "award",
      label: "DFW DBB awards with an allowance",
      value: `${h.allowancePost}%`,
      arrow: "▲",
      delta: `2022 to 2024, up from ${h.allowancePre}% in 2016 to 2021`,
      series: s["DFW DBB awards with a change order allowance (%)"],
      from: 2022,
      to: 2024,
      format: (v) => `${num(v, 0)}%`,
    },
    {
      stage: "Award",
      target: "award",
      label: "Median bids per DFW DBB award",
      value: num(h.bidsPost, 0),
      arrow: "▼",
      delta: `2022 to 2024, down from ${num(h.bidsPre, 0)} in 2016 to 2021`,
      series: s["DFW median bids per DBB award"],
      from: 2022,
      to: 2024,
      format: (v) => num(v, 1),
    },
    {
      stage: "After award",
      target: "postaward",
      label: "AIP construction grants with added funds",
      value: `${h.increasePost}%`,
      arrow: "▼",
      delta: `FY2022 to FY2023 grants, adjusted, down from ${h.increasePre}% in FY2011 to FY2019`,
      series: s["Share of grants with money added within 36 months (%)"],
      from: 2022,
      to: 2023,
      format: (v) => `${num(v, 1)}%`,
    },
  ];

  const row = document.getElementById("stat-row");
  row.replaceChildren();
  const sparks = [];
  tiles.forEach((tile) => {
    const node = el("a", "stat");
    node.href = `#${tile.target}`;
    node.addEventListener("click", (event) => {
      event.preventDefault();
      openPanel(tile.target);
      history.replaceState(null, "", `#${tile.target}`);
    });
    const valueNode = el("span", "stat-value", tile.value);
    tile.valueNode = valueNode;
    node.append(el("span", "stat-stage", tile.stage), el("span", "stat-label", tile.label), valueNode);
    const delta = el("span", "stat-delta");
    const arrow = el("span", "stat-arrow", tile.arrow);
    arrow.setAttribute("aria-hidden", "true");
    delta.append(arrow, el("span", null, tile.delta));
    node.append(delta);
    const svg = document.createElementNS("http://www.w3.org/2000/svg", "svg");
    svg.setAttribute("class", "stat-spark");
    svg.setAttribute("aria-hidden", "true");
    node.append(svg);
    row.append(node);
    sparks.push({ svg, tile });
  });
  const drawSparks = () => sparks.forEach(({ svg, tile }) => sparkline(svg, tile.series, tile));
  requestAnimationFrame(drawSparks);
  onResize(row, drawSparks);
  onTheme(drawSparks);

  const counts = el("ul", "counts");
  [
    [count(c.aip_grants), `AIP grants, FY${c.aip_fy_min} to FY${c.aip_fy_max}`],
    [String(c.npias_reports), "NPIAS reports"],
    [count(c.bid_line_items), `bid line items from ${count(c.bid_projects)} project schedules`],
    [count(c.dfw_actions), "DFW Board actions"],
    [count(c.construction_grants_36m), "construction grant amendment histories"],
  ].forEach(([value, label]) => {
    const li = el("li");
    li.append(el("strong", null, value), document.createTextNode(` ${label}`));
    counts.append(li);
  });
  row.after(counts);

  const steps = [
    { id: "funding", name: "Funding", text: "Grants rose 88.5% and shifted toward terminals", dir: "Rose", cls: "is-before", arrow: "▲" },
    { id: "planning", name: "Planning estimate", text: "NPIAS estimates rose 94%, led by terminal need", dir: "Rose", cls: "is-before", arrow: "▲" },
    { id: "bids", name: "Bid", text: "Unit prices rose with input prices, far more in some states, and more projects came in above estimate", dir: "Rose", cls: "is-before", arrow: "▲" },
    { id: "award", name: "Award", text: "Allowances and staged delivery absorbed escalation at DFW", dir: "Rose", cls: "is-before", arrow: "▲" },
    { id: "postaward", name: "After award", text: "Fewer construction grants needed added funds", dir: "Fell", cls: "is-after", arrow: "▼" },
    { id: "synthesis", name: "Across the lifecycle", text: "Escalation surfaced before award", dir: null, cls: "", arrow: "" },
  ];
  const list = document.getElementById("lifecycle-nav");
  list.replaceChildren();
  steps.forEach((step) => {
    const li = el("li", `step ${step.cls}`);
    // the strip is the stage tablist of the lifecycle panel, so each step is a button, not a link
    const a = el("button", "step-button");
    a.type = "button";
    a.id = `step-${step.id}`;
    a.dataset.stage = step.id;
    a.setAttribute("role", "tab");
    a.setAttribute("aria-controls", step.id);
    a.setAttribute("aria-selected", "false");
    a.tabIndex = -1;
    const dot = el("span", "step-dot");
    dot.setAttribute("aria-hidden", "true");
    a.append(dot, el("span", "step-name", step.name), el("span", "step-text", step.text));
    if (step.dir) {
      const dir = el("span", "step-dir");
      const arrow = el("span", null, step.arrow);
      arrow.setAttribute("aria-hidden", "true");
      dir.append(arrow, document.createTextNode(step.dir === "Rose" ? "Escalation indicator rose" : "Indicator fell"));
      a.append(dir);
    }
    li.append(a);
    list.append(li);
  });

  if (!reducedMotion()) {
    row.classList.add("reveal-ready");
    list.classList.add("reveal-ready");
  }
  onReveal(row, () => {
    row.classList.add("is-revealed");
    tiles.forEach((tile) => countUp(tile.valueNode, tile.value));
    requestAnimationFrame(() => sparks.forEach(({ svg }) => intro(svg)));
  }, 0.1);
  onReveal(list, () => list.classList.add("is-revealed"), 0.2);
}

function countUp(node, text) {
  const match = text.match(/^([^0-9.]*)([0-9.]+)(.*)$/);
  if (!match || reducedMotion()) return;
  const [, prefix, digits, suffix] = match;
  const target = Number(digits);
  const decimals = digits.includes(".") ? digits.split(".")[1].length : 0;
  const start = performance.now();
  const tick = (now) => {
    const k = Math.min(1, (now - start) / 1100);
    const eased = 1 - Math.pow(1 - k, 3);
    node.textContent = `${prefix}${num(target * eased, decimals)}${suffix}`;
    if (k < 1) requestAnimationFrame(tick);
    else node.textContent = text;
  };
  requestAnimationFrame(tick);
}
