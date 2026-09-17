import { load } from "../lib/data.js";
import { el, onResize } from "../lib/dom.js";
import { renderTable, barPath, intro, onReveal, reducedMotion } from "../lib/chart.js";
import { tokens, onTheme } from "../lib/theme.js";
import { showTip, hideTip } from "../lib/tooltip.js";
import { num, numTrim, pct } from "../lib/format.js";

const PPI = "PPI inputs to highways and streets, goods (2021 = 100)";
const BID = "Airfield bid price index, hedonic (2021 = 100)";
const NPIAS = "NPIAS 5 year need, nominal (2007 report = 100)";

const LABELS = {
  "Federal airport grants excl. pandemic relief (billion $)": { label: "Federal airport grants excluding pandemic relief, billion dollars per year", fmt: (v) => `$${num(v, 1)}B` },
  "Median change in airport NPIAS estimate vs prior report (%)": { label: "Median airport estimate revision from the prior report", fmt: (v) => pct(v, 1) },
  [NPIAS]: { label: "Five-year need, nominal, 2007 to 2011 report = 100", fmt: (v) => num(v, 0) },
  "Share of airports whose estimate rose more than 5% (%)": { label: "Airports whose estimate rose more than 5%", fmt: (v) => pct(v, 0) },
  [BID]: { label: "Bid price index, capital projects, 2021 = 100", fmt: (v) => num(v, 1) },
  "Line item estimate error, median absolute log deviation": { label: "Line item estimate error, median absolute deviation", fmt: (v) => num(v, 2) },
  "Median low bid / engineer estimate, project totals": { label: "Median low bid relative to the estimate, project totals", fmt: (v) => num(v, 2) },
  "Median low bid / estimate, line items (%)": { label: "Median low bid relative to the estimate, line items", fmt: (v) => pct(v, 1) },
  "Share of projects with low bid above estimate (%)": { label: "Projects with a low bid above the engineer’s estimate", fmt: (v) => pct(v, 0) },
  "DFW DBB awards with a change order allowance (%)": { label: "DFW DBB awards with a change order allowance", fmt: (v) => pct(v, 0) },
  "DFW DBB awards with a single bid (%)": { label: "DFW DBB awards with a single bid", fmt: (v) => pct(v, 0) },
  "DFW median bids per DBB award": { label: "DFW median bids per DBB award", fmt: (v) => num(v, 1) },
  "Dollar weighted net growth within 36 months (%)": { label: "Dollar-weighted net change within 36 months", fmt: (v) => pct(v, 2) },
  "Money added within 36 months (% of cohort dollars)": { label: "Money added within 36 months, percent of cohort dollars", fmt: (v) => pct(v, 2) },
  "Share of grants with money added within 36 months (%)": { label: "Grants with money added within 36 months", fmt: (v) => pct(v, 1) },
  "Share of grants with money returned within 36 months (%)": { label: "Grants with money returned within 36 months", fmt: (v) => pct(v, 1) },
  [PPI]: { label: "PPI for highway and street inputs, 2021 = 100", fmt: (v) => num(v, 1) },
};

const ROWS = [
  { letter: "a", stage: "Funding", title: "Federal airport grants", unit: (v) => `$${numTrim(v, 1)}B`, series: [{ key: "Federal airport grants excl. pandemic relief (billion $)", label: "Grants excluding pandemic relief", slot: 0 }], bar: "Federal airport grants excl. pandemic relief (billion $)", barLabel: "Grants per year" },
  {
    letter: "b",
    stage: "Planning",
    title: "NPIAS estimates",
    unit: (v) => numTrim(v, 0),
    series: [
      { key: NPIAS, label: "NPIAS five-year need, nominal (2020 = 100)", slot: 0, rebase: 2020 },
      { key: PPI, label: "PPI, highway and street inputs (2020 = 100)", slot: 1, rebase: 2020 },
    ],
    bar: "Median change in airport NPIAS estimate vs prior report (%)",
    barLabel: "Median revision",
  },
  {
    letter: "c",
    stage: "Bid",
    title: "Bid price index",
    unit: (v) => numTrim(v, 0),
    series: [
      { key: BID, label: "Bid price index with 95% interval", slot: 0, band: ["Airfield bid price index, 95% CI low", "Airfield bid price index, 95% CI high"] },
      { key: PPI, label: "PPI, highway and street inputs", slot: 1 },
    ],
    ylim: [55, 250],
    bar: BID,
    barLabel: "Index, 2021 = 100",
  },
  { letter: "d", stage: "Bid", title: "Estimate accuracy", unit: (v) => `${numTrim(v, 0)}%`, series: [{ key: "Share of projects with low bid above estimate (%)", label: "Projects above the estimate", slot: 0 }], bar: "Line item estimate error, median absolute log deviation", barLabel: "Line item error" },
  {
    letter: "e",
    stage: "Award",
    title: "DFW contracting",
    unit: (v) => `${numTrim(v, 0)}%`,
    series: [
      { key: "DFW DBB awards with a change order allowance (%)", label: "With a change order allowance", slot: 1 },
      { key: "DFW DBB awards with a single bid (%)", label: "With a single bid", slot: 0 },
    ],
    ylim: [-5, 100],
    bar: "DFW DBB awards with a change order allowance (%)",
    barLabel: "With an allowance",
  },
  {
    letter: "f",
    stage: "After award",
    title: "Post-award amendments",
    unit: (v) => `${numTrim(v, 0)}%`,
    series: [
      { key: "Share of grants with money added within 36 months (%)", label: "Money added", slot: 1 },
      { key: "Share of grants with money returned within 36 months (%)", label: "Money returned", slot: 0 },
    ],
    bar: "Share of grants with money added within 36 months (%)",
    barLabel: "With money added",
  },
];

const STAGES = { "0 Funding": "Funding", "1 Planning": "Planning", "2 Bid price": "Bid price", "3 Estimate accuracy": "Estimate accuracy", "4 Award": "Award", "5 Post award": "After award", "R Reference": "Reference" };
const DOMAIN = [2015, 2026];

function changeNote(indicator, pre, post) {
  const word = post > pre ? "increase" : "decrease";
  if (indicator.includes("(%)")) return `${num(Math.abs(post - pre), 1)} pp ${word}`;
  if (Math.max(pre, post) < 1) return `${num(Math.abs(post - pre), 2)} ${word}`;
  return `${num(Math.abs(100 * (post / pre - 1)), 0)}% ${word}`;
}

export async function initSynthesis() {
  const s = await load("synthesis");
  const grid = document.getElementById("synthesis-grid");
  const view = { year: null };
  let playTimer = 0;

  const seriesOf = (def) => {
    const raw = (s.series[def.key] || []).filter((p) => p.year >= DOMAIN[0] && p.year <= DOMAIN[1]);
    if (!def.rebase) return raw;
    const base = (s.series[def.key] || []).find((p) => p.year === def.rebase);
    return base ? raw.map((p) => ({ year: p.year, value: (100 * p.value) / base.value })) : raw;
  };

  const controls = el("div", "controls");
  grid.before(controls);
  const playBtn = el("button", "play-btn", "▶ Play the years");
  playBtn.type = "button";
  playBtn.setAttribute("aria-pressed", "false");
  playBtn.title = "Step through 2015 to 2026 in every panel";
  controls.append(playBtn);
  const badge = el("span", "fig-badge", "Fig. 10");
  controls.prepend(badge);

  const panels = ROWS.map((def) => {
    const box = el("div", "card synth-card");
    const head = el("div", "synth-head");
    const title = el("div");
    title.append(el("span", "synth-letter", `${def.letter}) ${def.stage}`), el("div", "chart-title", def.title));
    const readout = el("div", "synth-readout");
    readout.setAttribute("aria-live", "polite");
    head.append(title, readout);
    const legendRow = el("div", "synth-legend");
    const bodyGrid = el("div", "synth-body");
    const lineNode = document.createElementNS("http://www.w3.org/2000/svg", "svg");
    lineNode.setAttribute("class", "chart-svg");
    const barNode = document.createElementNS("http://www.w3.org/2000/svg", "svg");
    barNode.setAttribute("class", "chart-svg");
    const lineWrap = el("div");
    const barWrap = el("div");
    lineWrap.append(lineNode);
    barWrap.append(barNode);
    bodyGrid.append(lineWrap, barWrap);
    box.append(head, legendRow, bodyGrid);
    grid.append(box);
    return { def, box, readout, legendRow, lineWrap, barWrap, line: d3.select(lineNode), bars: d3.select(barNode), update: null };
  });

  function drawPanel(panel, animate) {
    const t = tokens();
    const def = panel.def;
    panel.legendRow.replaceChildren();
    def.series.forEach((sd) => {
      const item = el("span");
      const key = el("span", "legend-swatch legend-line");
      key.style.setProperty("--c", t.series[sd.slot]);
      item.append(key, document.createTextNode(sd.label));
      panel.legendRow.append(item);
    });
    const width = Math.floor(panel.lineWrap.clientWidth);
    if (width <= 0) return;
    const height = 150;
    const svg = panel.line;
    svg.attr("width", width).attr("height", height).attr("viewBox", `0 0 ${width} ${height}`);
    svg.selectAll("*").remove();
    const m = { top: 8, right: 8, bottom: 22, left: 38 };
    const w = width - m.left - m.right;
    const h = height - m.top - m.bottom;
    const g = svg.append("g").attr("transform", `translate(${m.left},${m.top})`);
    const x = d3.scaleLinear().domain([DOMAIN[0] - 0.5, DOMAIN[1] + 0.5]).range([0, w]);
    const all = def.series.flatMap((sd) => {
      const pts = seriesOf(sd).map((p) => p.value);
      if (sd.band) sd.band.forEach((k) => (s.series[k] || []).filter((p) => p.year >= DOMAIN[0]).forEach((p) => pts.push(p.value)));
      return pts;
    });
    const ext = d3.extent(all);
    const pad = (ext[1] - ext[0]) * 0.1 || 1;
    const y = d3.scaleLinear().domain(def.ylim || [ext[0] >= 0 ? Math.max(0, ext[0] - pad) : ext[0] - pad, ext[1] + pad]).nice(4).range([h, 0]);
    g.append("rect").attr("x", x(2021.85)).attr("width", x(DOMAIN[1] + 0.5) - x(2021.85)).attr("height", h).attr("fill", t.bandPost);
    if (def.letter === "a") g.append("text").attr("class", "band-label").attr("x", x(2024.2)).attr("y", 11).attr("text-anchor", "middle").text("IIJA period");
    g.append("g").attr("class", "axis").call(d3.axisLeft(y).ticks(4).tickSize(-w).tickPadding(6).tickFormat(def.unit));
    g.append("g").attr("class", "axis no-grid").attr("transform", `translate(0,${h})`).call(d3.axisBottom(x).tickValues(d3.range(2015, 2027, 2)).tickFormat((v) => String(v)).tickSize(3).tickPadding(5));
    const clip = `synth-clip-${def.letter}`;
    svg.append("defs").append("clipPath").attr("id", clip).append("rect").attr("width", w).attr("height", h);
    const plot = g.append("g").attr("clip-path", `url(#${clip})`);
    const lines = def.series.map((sd) => {
      const pts = seriesOf(sd);
      if (sd.band) {
        const lo = s.series[sd.band[0]] || [];
        const hi = s.series[sd.band[1]] || [];
        const bandPts = lo.filter((p) => p.year >= DOMAIN[0]).map((p) => ({ year: p.year, lo: p.value, hi: (hi.find((q) => q.year === p.year) || p).value }));
        plot.append("path").attr("class", "fade").attr("d", d3.area().x((p) => x(p.year)).y0((p) => y(p.lo)).y1((p) => y(p.hi))(bandPts)).attr("fill", t.series[sd.slot]).attr("fill-opacity", 0.13);
      }
      plot.append("path").attr("class", "draw").attr("d", d3.line().x((p) => x(p.year)).y((p) => y(p.value))(pts)).attr("fill", "none").attr("stroke", t.series[sd.slot]).attr("stroke-width", 2).attr("stroke-linejoin", "round");
      plot.selectAll(null).data(pts).join("circle").attr("class", "pop").attr("cx", (p) => x(p.year)).attr("cy", (p) => y(p.value)).attr("r", 3).attr("fill", t.series[sd.slot]).attr("stroke", t.surface).attr("stroke-width", 1.5);
      return { sd, pts };
    });
    const hair = g.append("line").attr("class", "crosshair").attr("y1", 0).attr("y2", h).style("opacity", 0);
    const focusDots = g.append("g");

    const pp = s.prePost.find((r) => r.indicator === def.bar);
    const bw = Math.floor(panel.barWrap.clientWidth);
    const bsvg = panel.bars;
    const bh = 150;
    bsvg.attr("width", bw).attr("height", bh).attr("viewBox", `0 0 ${bw} ${bh}`);
    bsvg.selectAll("*").remove();
    if (pp && bw > 40) {
      const fmt = LABELS[def.bar].fmt;
      const bm = { top: 30, right: 4, bottom: 22, left: 4 };
      const bwid = bw - bm.left - bm.right;
      const bhgt = bh - bm.top - bm.bottom;
      const bg = bsvg.append("g").attr("transform", `translate(${bm.left},${bm.top})`);
      const top = Math.max(pp.pre, pp.post) * 1.18;
      const by = d3.scaleLinear().domain([0, top]).range([bhgt, 0]);
      const bx = d3.scaleBand().domain(["pre", "post"]).range([0, bwid]).padding(0.3);
      const colW = Math.min(30, bx.bandwidth());
      bsvg.append("text").attr("class", "synth-change").attr("x", bw / 2).attr("y", 12).attr("text-anchor", "middle").attr("fill", pp.post > pp.pre ? t.pos : t.neg).attr("font-size", 12).attr("font-weight", 650).text(changeNote(def.bar, pp.pre, pp.post));
      bsvg.append("text").attr("class", "label-muted").attr("x", bw / 2).attr("y", 25).attr("text-anchor", "middle").attr("font-size", 10).text(def.barLabel);
      [
        { k: "pre", v: pp.pre, fill: t.other, label: "2017–21" },
        { k: "post", v: pp.post, fill: t.series[0], label: "2022–25" },
      ].forEach((b) => {
        const bx0 = bx(b.k) + (bx.bandwidth() - colW) / 2;
        bg.append("path").attr("class", "grow-y").attr("d", barPath(bx0, by(b.v), colW, bhgt - by(b.v), 4, "up")).attr("fill", b.fill);
        bg.append("text").attr("class", "label fade").attr("x", bx0 + colW / 2).attr("y", by(b.v) - 4).attr("text-anchor", "middle").attr("font-size", 10.5).text(fmt(b.v));
        bg.append("text").attr("class", "label-muted").attr("x", bx0 + colW / 2).attr("y", bhgt + 14).attr("text-anchor", "middle").attr("font-size", 10).text(b.label);
      });
      bg.append("line").attr("class", "baseline").attr("x1", 0).attr("x2", bwid).attr("y1", bhgt).attr("y2", bhgt);
      bsvg
        .append("rect")
        .attr("width", bw)
        .attr("height", bh)
        .attr("fill", "transparent")
        .on("pointerenter pointermove", (event) => {
          showTip(event, {
            title: LABELS[def.bar].label,
            rows: [
              { value: fmt(pp.pre), label: "mean, 2017 to 2021", color: t.other, shape: "dot" },
              { value: fmt(pp.post), label: "mean, 2022 to 2025", color: t.series[0], shape: "dot" },
              { value: changeNote(def.bar, pp.pre, pp.post), label: "change", focus: true },
            ],
          });
        })
        .on("pointerleave", hideTip);
    }

    panel.update = (year) => {
      focusDots.selectAll("*").remove();
      if (year === null) {
        hair.style("opacity", 0);
        panel.readout.textContent = "";
        return;
      }
      hair.attr("x1", x(year)).attr("x2", x(year)).style("opacity", 1);
      const parts = [];
      lines.forEach(({ sd, pts }) => {
        const pt = pts.find((q) => q.year === year);
        if (!pt) return;
        focusDots.append("circle").attr("cx", x(year)).attr("cy", y(pt.value)).attr("r", 5).attr("fill", t.series[sd.slot]).attr("stroke", t.surface).attr("stroke-width", 2);
        parts.push(def.unit(pt.value));
      });
      panel.readout.textContent = `${year}: ${parts.length ? parts.join(" · ") : "n/a"}`;
    };
    g.append("rect")
      .attr("class", "hit")
      .attr("width", w)
      .attr("height", h)
      .on("pointermove", (event) => {
        stopPlay();
        const [mx] = d3.pointer(event);
        const year = Math.max(DOMAIN[0], Math.min(DOMAIN[1], Math.round(x.invert(mx))));
        setYear(year);
        const rows = [];
        ROWS.forEach((row) => {
          row.series.forEach((sd) => {
            const pt = seriesOf(sd).find((q) => q.year === year);
            rows.push({ value: pt ? row.unit(pt.value) : "n/a", label: `${row.letter}) ${sd.label}`, color: t.series[sd.slot], focus: row === def, muted: !pt });
          });
        });
        showTip(event, { title: String(year), subtitle: year >= 2022 && year <= 2025 ? "Years averaged as the IIJA period" : year >= 2017 && year <= 2021 ? "Years averaged as the pre-IIJA period" : null, rows });
      })
      .on("pointerleave", () => {
        setYear(null);
        hideTip();
      });
    panel.update(view.year);
    if (animate) {
      intro(svg.node());
      intro(bsvg.node());
    }
  }

  function setYear(year) {
    view.year = year;
    panels.forEach((p) => p.update && p.update(year));
  }

  function drawAll(animate = false) {
    panels.forEach((p) => drawPanel(p, animate));
  }

  function stopPlay() {
    if (!playTimer) return;
    clearTimeout(playTimer);
    playTimer = 0;
    playBtn.setAttribute("aria-pressed", "false");
    playBtn.textContent = "▶ Play the years";
  }

  playBtn.addEventListener("click", () => {
    if (playTimer) {
      stopPlay();
      setYear(null);
      return;
    }
    playBtn.setAttribute("aria-pressed", "true");
    playBtn.textContent = "❚❚ Pause";
    let year = view.year && view.year < DOMAIN[1] ? view.year : DOMAIN[0];
    const step = () => {
      setYear(year);
      if (year >= DOMAIN[1]) {
        playTimer = setTimeout(() => {
          stopPlay();
          setYear(null);
        }, 1400);
        return;
      }
      year += 1;
      playTimer = setTimeout(step, reducedMotion() ? 1400 : 800);
    };
    step();
  });

  const summary = el("div", "card synth-summary");
  grid.after(summary);
  const head = el("h4", "chart-title");
  head.append(el("span", "fig-badge", "Fig. 10"), document.createTextNode("Means before and after the IIJA"));
  summary.append(head, el("p", "chart-sub", "Averages of the yearly indicators for 2017 to 2021 and 2022 to 2025; the last column marks the indicators drawn in Fig. 10"));
  const tableWrap = el("div", "chart-table");
  tableWrap.style.maxHeight = "none";
  tableWrap.style.marginTop = "10px";
  summary.append(tableWrap);
  const inFigure = new Map(ROWS.flatMap((row) => [[row.bar, row.letter], ...row.series.map((sd) => [sd.key, row.letter])]));
  const rows = s.prePost
    .filter((r) => !/CI (low|high)/.test(r.indicator) && r.indicator !== "Mean bidders per project" && LABELS[r.indicator])
    .map((r) => {
      const o = LABELS[r.indicator];
      return [STAGES[r.stage] || r.stage, o.label, { text: o.fmt(r.pre), sort: r.pre }, { text: o.fmt(r.post), sort: r.post }, { text: r.post > r.pre ? "▲ rose" : "▼ fell", sort: r.post - r.pre }, inFigure.get(r.indicator) ? `${inFigure.get(r.indicator)})` : ""];
    });
  renderTable(tableWrap, {
    columns: [{ label: "Stage" }, { label: "Indicator" }, { label: "2017 to 2021", num: true }, { label: "2022 to 2025", num: true }, { label: "Direction" }, { label: "Panel" }],
    rows,
  });

  requestAnimationFrame(() => drawAll(false));
  onResize(grid, () => drawAll(false));
  onTheme(() => drawAll(false));
  onReveal(grid, () => drawAll(true), 0.15);
}
