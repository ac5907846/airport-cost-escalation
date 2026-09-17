import { load } from "../lib/data.js";
import { el, onResize } from "../lib/dom.js";
import { select, slider } from "../lib/controls.js";
import { tokens, onTheme } from "../lib/theme.js";
import { showTip, hideTip } from "../lib/tooltip.js";
import { barPath, onReveal, intro } from "../lib/chart.js";
import { dollars, num, pct } from "../lib/format.js";

function parseAmount(text) {
  const v = Number(String(text).replace(/[^0-9.]/g, ""));
  return Number.isFinite(v) && v > 0 ? v : null;
}

function short(v) {
  const a = Math.abs(v);
  if (a >= 1e9) return `$${num(v / 1e9, 2)}B`;
  if (a >= 1e6) return `$${num(v / 1e6, 2)}M`;
  if (a >= 1e3) return `$${num(v / 1e3, 0)}K`;
  return dollars(v);
}

export async function initEstimator() {
  const b = await load("bids");
  const root = document.getElementById("tool-estimator");
  root.replaceChildren();
  root.append(
    el("h3", null, "Bid escalation and competition check"),
    el("p", null, "Bring an engineer’s estimate to bid-year prices with the study’s price indexes, then adjust it for the number of bidders you expect."),
  );
  const seriesList = [
    ...b.specs.map((s) => ({ id: `spec:${s.key}`, label: s.key === "baseline" ? "Bid price index, airport capital projects" : `Bid price index, ${s.label.toLowerCase()}`, points: s.points, spec: true })),
    ...b.ppi.map((p) => ({ id: `ppi:${p.key}`, label: p.label, points: p.points, spec: false })),
  ];
  const state = { amount: 2500000, series: "spec:baseline", base: 2021, bid: 2025, bidders: 2 };
  const current = () => seriesList.find((s) => s.id === state.series);

  const form = el("div", "form-grid");
  root.append(form);
  const amountWrap = el("div", "control");
  const amountLabel = el("span", "control-label", "Engineer’s estimate");
  amountLabel.id = "est-amount-label";
  const amount = el("input", "text-input");
  amount.type = "text";
  amount.inputMode = "decimal";
  amount.value = dollars(state.amount);
  amount.setAttribute("aria-labelledby", "est-amount-label");
  amount.addEventListener("input", () => {
    const v = parseAmount(amount.value);
    if (v) {
      state.amount = v;
      update();
    }
  });
  amount.addEventListener("blur", () => {
    amount.value = dollars(state.amount);
  });
  amountWrap.append(amountLabel, amount);
  form.append(amountWrap);

  select(form, {
    label: "Price series",
    options: [
      { group: "Bid price index (this study)", options: seriesList.filter((s) => s.spec).map((s) => ({ value: s.id, label: s.label })) },
      { group: "Producer price indexes", options: seriesList.filter((s) => !s.spec).map((s) => ({ value: s.id, label: s.label })) },
    ],
    value: state.series,
    onChange: (v) => {
      state.series = v;
      refreshYears();
      update();
    },
  });
  const baseHolder = el("div");
  const bidHolder = el("div");
  form.append(baseHolder, bidHolder);
  let baseSelect = null;
  let bidSelect = null;

  function refreshYears() {
    const years = current().points.map((p) => p.year);
    if (!years.includes(state.base)) state.base = years.includes(2021) ? 2021 : years[0];
    if (!years.includes(state.bid)) state.bid = years[years.length - 1];
    baseHolder.replaceChildren();
    bidHolder.replaceChildren();
    baseSelect = select(baseHolder, {
      label: "Price year of the estimate",
      options: years.map((y) => ({ value: y, label: String(y) })),
      value: state.base,
      onChange: (v) => {
        state.base = Number(v);
        update();
      },
    });
    bidSelect = select(bidHolder, {
      label: "Expected bid year",
      options: years.map((y) => ({ value: y, label: String(y) })),
      value: state.bid,
      onChange: (v) => {
        state.bid = Number(v);
        update();
      },
    });
    baseHolder.firstChild.classList.add("control");
    bidHolder.firstChild.classList.add("control");
  }
  refreshYears();

  const model = b.bidderModel;
  slider(form, {
    label: `Expected number of bidders (sample mean ${num(model.meanBidders, 1)})`,
    min: model.bidderRange[0],
    max: model.bidderRange[1],
    step: 1,
    value: state.bidders,
    format: (v) => String(v),
    full: true,
    onChange: (v) => {
      state.bidders = v;
      update();
    },
  });

  const result = el("div", "result");
  const main = el("div", "result-main");
  const mainValue = el("strong");
  main.append(mainValue, el("span", null, "Screening value of the low bid"));
  const sideRange = el("div", "result-side");
  const rangeValue = el("strong");
  const rangeLabel = el("span");
  sideRange.append(rangeValue, rangeLabel);
  const sidePrice = el("div", "result-side");
  const priceValue = el("strong");
  sidePrice.append(priceValue, el("span", null, "Price change"));
  const sideComp = el("div", "result-side");
  const compValue = el("strong");
  sideComp.append(compValue, el("span", null, "Competition adjustment"));
  result.append(main, sidePrice, sideComp, sideRange);
  result.setAttribute("aria-live", "polite");
  root.append(result);

  root.append(el("p", "tool-sub", "How the value is built"));
  const waterfall = el("div", "tool-chart");
  root.append(waterfall);
  root.append(el("p", "tool-sub", "Price path of the selected series"));
  const pathBox = el("div", "tool-chart");
  root.append(pathBox);
  root.append(
    el(
      "p",
      "chart-note",
      `The price change is the ratio of the series in the bid year to the price year. The competition adjustment applies the project model coefficient (${num(model.coef, 3)} per bidder, ${model.n} projects) relative to the sample mean of ${num(model.meanBidders, 2)} bidders, which assumes the escalated estimate matches a typical low bid at average competition. The bid price index rests on Tennessee and South Carolina capital projects and has wide intervals; use the result for screening and discussion, not as a project estimate.`,
    ),
  );

  function compute() {
    const s = current();
    const p0 = s.points.find((p) => p.year === state.base);
    const p1 = s.points.find((p) => p.year === state.bid);
    const priceFactor = p1.index / p0.index;
    const escalated = state.amount * priceFactor;
    const compFactor = Math.exp(model.coef * (state.bidders - model.meanBidders));
    const screening = escalated * compFactor;
    const range = s.spec && p1.lo !== undefined ? [(state.amount * p1.lo) / p0.index * compFactor, (state.amount * p1.hi) / p0.index * compFactor] : null;
    return { s, p0, p1, priceFactor, escalated, compFactor, screening, range };
  }

  function drawWaterfall(c) {
    const t = tokens();
    const width = Math.max(260, waterfall.clientWidth);
    const height = 190;
    const m = { top: 22, right: 8, bottom: 30, left: 8 };
    const w = width - m.left - m.right;
    const h = height - m.top - m.bottom;
    const svg = d3.create("svg").attr("width", width).attr("height", height).attr("viewBox", `0 0 ${width} ${height}`);
    const g = svg.append("g").attr("transform", `translate(${m.left},${m.top})`);
    const steps = [
      { label: "Estimate", from: 0, to: state.amount, kind: "total" },
      { label: `Prices ${state.base} to ${state.bid}`, from: state.amount, to: c.escalated, kind: "delta" },
      { label: `${state.bidders} bidder${state.bidders === 1 ? "" : "s"}`, from: c.escalated, to: c.screening, kind: "delta" },
      { label: "Screening value", from: 0, to: c.screening, kind: "total" },
    ];
    const x = d3.scaleBand().domain(steps.map((s) => s.label)).range([0, w]).padding(0.35);
    const top = d3.max(steps, (s) => Math.max(s.from, s.to)) * 1.1;
    const y = d3.scaleLinear().domain([0, top]).range([h, 0]);
    g.append("line").attr("class", "baseline").attr("x1", 0).attr("x2", w).attr("y1", h).attr("y2", h);
    steps.forEach((s, i) => {
      const bw = Math.min(48, x.bandwidth());
      const bx = x(s.label) + (x.bandwidth() - bw) / 2;
      const lo = Math.min(s.from, s.to);
      const hi = Math.max(s.from, s.to);
      const color = s.kind === "total" ? t.series[0] : s.to >= s.from ? t.pos : t.neg;
      const hgt = Math.max(1.5, y(lo) - y(hi));
      g.append("path")
        .attr("class", "grow-y")
        .attr("d", barPath(bx, y(hi), bw, hgt, s.kind === "total" ? 4 : 2, s.kind === "total" ? "up" : "none"))
        .attr("fill", color)
        .on("pointerenter pointermove", (event) => {
          showTip(event, {
            title: s.label,
            rows: [
              { value: dollars(s.to), label: "running value", color, shape: "dot" },
              s.kind === "delta" ? { value: `${dollars(s.to - s.from)} (${pct(100 * (s.to / s.from - 1), 1)})`, label: "change in this step" } : null,
            ],
          });
        })
        .on("pointerleave", hideTip);
      if (i < steps.length - 1) {
        const next = steps[i + 1];
        const nx = x(next.label) + (x.bandwidth() - Math.min(48, x.bandwidth())) / 2;
        g.append("line").attr("x1", bx + bw).attr("x2", nx).attr("y1", y(s.to)).attr("y2", y(s.to)).attr("stroke", t.axis).attr("stroke-width", 1);
      }
      const text = s.kind === "total" ? short(s.to) : pct(100 * (s.to / s.from - 1), 1);
      g.append("text").attr("class", "label-strong").attr("x", bx + bw / 2).attr("y", y(hi) - 6).attr("text-anchor", "middle").text(text);
      g.append("text").attr("class", "label").attr("x", bx + bw / 2).attr("y", h + 18).attr("text-anchor", "middle").text(s.label);
    });
    waterfall.replaceChildren(svg.node());
  }

  function drawPath(c) {
    const t = tokens();
    const width = Math.max(260, pathBox.clientWidth);
    const height = 170;
    const m = { top: 12, right: 14, bottom: 24, left: 38 };
    const w = width - m.left - m.right;
    const h = height - m.top - m.bottom;
    const svg = d3.create("svg").attr("width", width).attr("height", height).attr("viewBox", `0 0 ${width} ${height}`);
    const g = svg.append("g").attr("transform", `translate(${m.left},${m.top})`);
    const pts = c.s.points;
    const x = d3.scaleLinear().domain(d3.extent(pts, (p) => p.year)).range([0, w]);
    const vals = pts.flatMap((p) => (c.s.spec ? [p.index, Math.min(p.hi, 230), Math.max(p.lo, 50)] : [p.index]));
    const y = d3.scaleLinear().domain(d3.extent(vals)).nice(4).range([h, 0]);
    g.append("g").attr("class", "axis").call(d3.axisLeft(y).ticks(4).tickSize(-w).tickPadding(6));
    g.append("g").attr("class", "axis no-grid").attr("transform", `translate(0,${h})`).call(d3.axisBottom(x).tickValues(pts.map((p) => p.year)).tickFormat((v) => String(v)).tickSize(3));
    if (c.s.spec) {
      g.append("path").attr("d", d3.area().x((p) => x(p.year)).y0((p) => y(Math.max(p.lo, y.domain()[0]))).y1((p) => y(Math.min(p.hi, y.domain()[1])))(pts)).attr("fill", t.series[0]).attr("fill-opacity", 0.12);
    }
    g.append("path").attr("class", "draw").attr("d", d3.line().x((p) => x(p.year)).y((p) => y(p.index))(pts)).attr("fill", "none").attr("stroke", t.series[0]).attr("stroke-width", 2);
    g.selectAll("circle").data(pts).join("circle").attr("cx", (p) => x(p.year)).attr("cy", (p) => y(p.index)).attr("r", 3.5).attr("fill", t.series[0]).attr("stroke", t.surface).attr("stroke-width", 1.5);
    [
      { p: c.p0, label: "estimate" },
      { p: c.p1, label: "bid" },
    ].forEach(({ p, label }, i) => {
      g.append("circle").attr("cx", x(p.year)).attr("cy", y(p.index)).attr("r", 7).attr("fill", "none").attr("stroke", t.ink).attr("stroke-width", 2);
      g.append("text").attr("class", "label-strong halo").attr("x", x(p.year)).attr("y", y(p.index) + (i === 0 ? 20 : -12)).attr("text-anchor", "middle").text(`${label} ${num(p.index, 1)}`);
    });
    pathBox.replaceChildren(svg.node());
  }

  function update() {
    const c = compute();
    mainValue.textContent = dollars(c.screening);
    priceValue.textContent = pct(100 * (c.priceFactor - 1), 1);
    compValue.textContent = pct(100 * (c.compFactor - 1), 1);
    if (c.range) {
      rangeValue.textContent = `${short(c.range[0])} to ${short(c.range[1])}`;
      rangeLabel.textContent = state.base === 2021 ? "Range from the 95% interval" : "Approximate range from the bid year interval";
      sideRange.hidden = false;
    } else {
      sideRange.hidden = true;
    }
    drawWaterfall(c);
    drawPath(c);
  }

  update();
  onResize(root, update);
  onTheme(update);
  onReveal(root, () => {
    update();
    intro(waterfall);
    intro(pathBox);
  }, 0.25);
}
