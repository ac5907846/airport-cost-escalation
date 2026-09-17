import { load, on } from "../lib/data.js";
import { el, onResize } from "../lib/dom.js";
import { segmented, search } from "../lib/controls.js";
import { legend, barPath, thin, intro } from "../lib/chart.js";

function ordinal(n) {
  const v = Math.round(n);
  const tail = v % 100;
  if (tail >= 11 && tail <= 13) return `${v}th`;
  return `${v}${["th", "st", "nd", "rd"][v % 10] || "th"}`;
}
import { tokens, onTheme } from "../lib/theme.js";
import { showTip, hideTip } from "../lib/tooltip.js";
import { money, pct, num, count, reportLabel, reportShort } from "../lib/format.js";

export async function initExplorer() {
  const root = document.getElementById("tool-explorer");
  root.replaceChildren(el("div", "loading", "Loading airport histories"));
  const hist = await load("history");
  const ids = Object.keys(hist.airports);
  const last = hist.cycles.length - 1;
  const prev = hist.cycles.indexOf("2021-2025");
  const state = { a: hist.airports.DFW ? "DFW" : ids[0], b: null, dollars: "nominal" };

  const changeOf = (rec) => {
    const e0 = rec.est[prev];
    const e1 = rec.est[last];
    return e0 && e1 ? 100 * (e1 / e0 - 1) : null;
  };
  const byClass = new Map();
  ids.forEach((id) => {
    const rec = hist.airports[id];
    const c = changeOf(rec);
    if (c === null) return;
    if (!byClass.has(rec.hub)) byClass.set(rec.hub, []);
    byClass.get(rec.hub).push(c);
  });
  byClass.forEach((list) => list.sort((x, y) => x - y));

  root.replaceChildren();
  root.append(
    el("h3", null, "Airport estimate explorer"),
    el("p", null, "Follow any NPIAS airport’s five-year development estimate across 12 reports, with its IIJA allocations and awards. Search by name, state, or code, or open an airport from the map."),
  );
  const form = el("div", "form-grid");
  root.append(form);
  const items = ids
    .map((id) => {
      const rec = hist.airports[id];
      return { id, value: id, label: `${rec.name} (${id})`, sub: `${rec.st || ""} · ${hist.hubs[rec.hub]}`, key: `${id} ${rec.name} ${rec.st || ""}`.toLowerCase(), size: rec.est[last] || 0 };
    })
    .sort((x, y) => y.size - x.size);
  const primary = search(form, {
    label: "Airport",
    placeholder: "Name, state, or code",
    items,
    onSelect: (item) => {
      state.a = item.value;
      update();
    },
  });
  const compare = search(form, {
    label: "Compare with",
    placeholder: "Optional second airport",
    items,
    onSelect: (item) => {
      state.b = item.value;
      update();
    },
  });
  compare.input.addEventListener("input", () => {
    if (!compare.input.value.trim() && state.b) {
      state.b = null;
      update();
    }
  });
  segmented(form, {
    label: "Dollars",
    options: [
      { value: "nominal", label: "Nominal" },
      { value: "real", label: "Constant prices" },
    ],
    value: state.dollars,
    onChange: (v) => {
      state.dollars = v;
      update();
    },
  });

  const result = el("div", "result");
  result.setAttribute("aria-live", "polite");
  root.append(result);
  root.append(el("p", "tool-sub", "Five-year estimate by NPIAS report"));
  const legendBox = el("div", "chart-legend");
  root.append(legendBox);
  const lineBox = el("div", "tool-chart");
  root.append(lineBox);
  root.append(el("p", "tool-sub", "IIJA dollars by fiscal year"));
  const barBox = el("div", "tool-chart");
  root.append(barBox);
  const kv = el("div", "kv");
  root.append(kv);
  root.append(el("p", "chart-note", "Constant prices deflate each report with the PPI for construction materials to the prices of the 2025 to 2029 report. Percentile ranks compare the change between the 2021 to 2025 and 2025 to 2029 reports with other airports in the same class."));

  const value = (rec, i) => {
    const v = rec.est[i];
    if (v === null || v === undefined) return null;
    return state.dollars === "nominal" ? v : (v * hist.ppiIndex[last]) / hist.ppiIndex[i];
  };

  function percentile(rec) {
    const c = changeOf(rec);
    const list = byClass.get(rec.hub);
    if (c === null || !list) return null;
    return (100 * d3.bisectLeft(list, c)) / list.length;
  }

  function stat(valueText, label) {
    const d = el("div", "result-side");
    d.append(el("strong", null, valueText), el("span", null, label));
    return d;
  }

  function drawLine(recs) {
    const t = tokens();
    const width = Math.max(260, lineBox.clientWidth);
    const height = 200;
    const m = { top: 12, right: 16, bottom: 26, left: 50 };
    const w = width - m.left - m.right;
    const h = height - m.top - m.bottom;
    const svg = d3.create("svg").attr("width", width).attr("height", height).attr("viewBox", `0 0 ${width} ${height}`).attr("class", "chart-svg");
    const g = svg.append("g").attr("transform", `translate(${m.left},${m.top})`);
    const x = d3.scalePoint().domain(hist.cycles).range([0, w]).padding(0.3);
    const maxV = d3.max(recs, ({ rec }) => d3.max(hist.cycles, (c, i) => value(rec, i))) || 1;
    const y = d3.scaleLinear().domain([0, maxV]).nice(4).range([h, 0]);
    g.append("rect").attr("x", x(hist.cycles[last - 1]) - 12).attr("width", x(hist.cycles[last]) - x(hist.cycles[last - 1]) + 24).attr("height", h).attr("fill", t.bandPost);
    g.append("g").attr("class", "axis").call(d3.axisLeft(y).ticks(4).tickSize(-w).tickPadding(6).tickFormat((v) => (v === 0 ? "0" : money(v))));
    g.append("g").attr("class", "axis no-grid").attr("transform", `translate(0,${h})`).call(d3.axisBottom(x).tickValues(thin(hist.cycles, w, 50)).tickFormat(reportShort).tickSize(0).tickPadding(8));
    recs.forEach(({ rec, color }) => {
      const pts = hist.cycles.map((c, i) => ({ c, v: value(rec, i) }));
      g.append("path").attr("class", "draw").attr("d", d3.line().defined((p) => p.v !== null).x((p) => x(p.c)).y((p) => y(p.v))(pts)).attr("fill", "none").attr("stroke", color).attr("stroke-width", 2).attr("stroke-linejoin", "round");
      g.append("g").selectAll("circle").data(pts.filter((p) => p.v !== null)).join("circle").attr("cx", (p) => x(p.c)).attr("cy", (p) => y(p.v)).attr("r", 3.5).attr("fill", color).attr("stroke", t.surface).attr("stroke-width", 1.5);
    });
    const hair = g.append("line").attr("class", "crosshair").attr("y1", 0).attr("y2", h).style("opacity", 0);
    g.append("rect")
      .attr("class", "hit")
      .attr("width", w)
      .attr("height", h)
      .on("pointermove", (event) => {
        const [mx] = d3.pointer(event);
        let idx = 0;
        hist.cycles.forEach((c, i) => {
          if (Math.abs(x(c) - mx) < Math.abs(x(hist.cycles[idx]) - mx)) idx = i;
        });
        hair.attr("x1", x(hist.cycles[idx])).attr("x2", x(hist.cycles[idx])).style("opacity", 1);
        showTip(event, {
          title: `${reportLabel(hist.cycles[idx])} report`,
          subtitle: state.dollars === "nominal" ? "Nominal dollars" : "Constant prices",
          rows: recs.map(({ rec, color, id }) => ({ value: value(rec, idx) === null ? "not listed" : money(value(rec, idx)), label: `${rec.name} (${id})`, color })),
        });
      })
      .on("pointerleave", () => {
        hair.style("opacity", 0);
        hideTip();
      });
    lineBox.replaceChildren(svg.node());
  }

  function drawBars(rec, id) {
    const t = tokens();
    const width = Math.max(260, barBox.clientWidth);
    const height = 150;
    const m = { top: 16, right: 10, bottom: 24, left: 50 };
    const w = width - m.left - m.right;
    const h = height - m.top - m.bottom;
    const svg = d3.create("svg").attr("width", width).attr("height", height).attr("viewBox", `0 0 ${width} ${height}`).attr("class", "chart-svg");
    const g = svg.append("g").attr("transform", `translate(${m.left},${m.top})`);
    const aig = rec.aig || hist.years.map(() => 0);
    const atp = rec.atp || hist.years.map(() => 0);
    const x = d3.scaleBand().domain(hist.years).range([0, w]).padding(0.4);
    const y = d3.scaleLinear().domain([0, d3.max(hist.years, (yr, i) => aig[i] + atp[i]) || 1]).nice(4).range([h, 0]);
    g.append("g").attr("class", "axis").call(d3.axisLeft(y).ticks(3).tickSize(-w).tickPadding(6).tickFormat((v) => (v === 0 ? "0" : money(v))));
    g.append("g").attr("class", "axis no-grid").attr("transform", `translate(0,${h})`).call(d3.axisBottom(x).tickFormat((v) => `FY${v}`).tickSize(0).tickPadding(8));
    const bw = Math.min(28, x.bandwidth());
    hist.years.forEach((yr, i) => {
      const bx = x(yr) + (x.bandwidth() - bw) / 2;
      const a = aig[i];
      const b = atp[i];
      const group = g.append("g").attr("class", "mark");
      if (a > 0) group.append("path").attr("d", barPath(bx, y(a), bw, h - y(a), b > 0 ? 0 : 4, b > 0 ? "none" : "up")).attr("fill", t.series[0]);
      if (b > 0) {
        const gap = a > 0 && y(a) - y(a + b) > 3 ? 2 : 0;
        group.append("path").attr("d", barPath(bx, y(a + b), bw, Math.max(1, y(a) - y(a + b) - gap), 4, "up")).attr("fill", t.series[1]);
      }
      if (a + b > 0) g.append("text").attr("class", "label").attr("x", bx + bw / 2).attr("y", y(a + b) - 5).attr("text-anchor", "middle").text(money(a + b));
      g.append("rect")
        .attr("x", x(yr) - 6)
        .attr("width", x.bandwidth() + 12)
        .attr("height", h)
        .attr("fill", "transparent")
        .on("pointerenter pointermove", (event) => {
          showTip(event, {
            title: `${rec.name}, FY${yr}`,
            rows: [
              { value: money(a), label: "AIG allocation", color: t.series[0] },
              { value: money(b), label: "ATP award", color: t.series[1] },
            ],
          });
        })
        .on("pointerleave", hideTip);
    });
    barBox.replaceChildren(svg.node());
  }

  function update(animate = true) {
    const t = tokens();
    const a = hist.airports[state.a];
    const b = state.b ? hist.airports[state.b] : null;
    primary.setValue(`${a.name} (${state.a})`);
    const recs = [{ rec: a, id: state.a, color: t.series[0] }];
    if (b) recs.push({ rec: b, id: state.b, color: t.series[1] });
    legend(legendBox, recs.map((r) => ({ key: r.id, label: `${r.rec.name} (${r.id})`, color: r.color, shape: "line" })));
    const change = changeOf(a);
    const rank = percentile(a);
    const iija = d3.sum(a.aig || []) + d3.sum(a.atp || []);
    result.replaceChildren();
    const main = el("div", "result-main");
    main.append(el("strong", null, money(value(a, last))), el("span", null, `${a.name}, 2025 to 2029 report`));
    result.append(
      main,
      stat(change === null ? "n/a" : pct(change), "change from the 2021 to 2025 report"),
      stat(rank === null ? "n/a" : ordinal(rank), `percentile of the change among ${hist.hubs[a.hub].toLowerCase()} airports`),
      stat(money(iija), "AIG and ATP, FY2022 to FY2026"),
    );
    drawLine(recs);
    drawBars(a, state.a);
    if (animate === true) {
      intro(lineBox);
      intro(barBox);
    }
    kv.replaceChildren();
    kv.append(el("span", "kv-head", "Measure"), el("span", "kv-head kv-num", state.a), el("span", "kv-head kv-num", b ? state.b : ""));
    const rows = [
      ["Class", hist.hubs[a.hub], b ? hist.hubs[b.hub] : ""],
      ["State", a.st || "", b ? b.st || "" : ""],
      ["Estimate, 2021 to 2025 report", money(value(a, prev)), b ? money(value(b, prev)) : ""],
      ["Estimate, 2025 to 2029 report", money(value(a, last)), b ? money(value(b, last)) : ""],
      ["Change between the reports", change === null ? "n/a" : pct(change), b ? (changeOf(b) === null ? "n/a" : pct(changeOf(b))) : ""],
      ["Largest estimate in any report", money(d3.max(hist.cycles, (c, i) => value(a, i))), b ? money(d3.max(hist.cycles, (c, i) => value(b, i))) : ""],
      ["AIG, FY2022 to FY2026", money(d3.sum(a.aig || [])), b ? money(d3.sum(b.aig || [])) : ""],
      ["ATP, FY2022 to FY2026", money(d3.sum(a.atp || [])), b ? money(d3.sum(b.atp || [])) : ""],
    ];
    rows.forEach(([label, va, vb]) => kv.append(el("span", "kv-label", label), el("span", "kv-num", va), el("span", "kv-num", vb)));
  }

  on("explore", ({ id }) => {
    if (hist.airports[id]) {
      state.a = id;
      update();
    }
  });
  update();
  onResize(root, () => update(false));
  onTheme(() => update(false));
}
