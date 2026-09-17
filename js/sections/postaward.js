import { load } from "../lib/data.js";
import { card, legend, frame, yAxis, xAxis, barPath, band, textWidth, smallToggle, thin } from "../lib/chart.js";
import { showTip, hideTip } from "../lib/tooltip.js";
import { sequential, diverging, inkOn } from "../lib/theme.js";
import { pct, num, count, eraLabel, pValue } from "../lib/format.js";

const HUBS = ["Large hub", "Medium hub", "Small hub", "Nonhub primary", "Nonprimary commercial", "Reliever", "General aviation"];
const ERA_SHORT = ["ARRA era", "Steady state", "Pandemic", "IIJA"];
const ERA_YEARS = [
  [2008, 2010],
  [2011, 2019],
  [2020, 2021],
  [2022, 2023],
];
const MEASURES = {
  added: { label: "Grants with money added within 36 months", key: "share_increase", share: true },
  returned: { label: "Grants with money returned within 36 months", key: "share_decrease", share: true },
  net: { label: "Dollar-weighted net change within 36 months", key: "dollar_weighted_growth_pct", share: false },
};

function valueOf(row, measure) {
  const m = MEASURES[measure];
  return m.share ? 100 * row[m.key] : row[m.key];
}

function termLabel(term) {
  const match = term.match(/\[T\.(.*)\]/);
  if (match) return eraLabel(match[1]);
  if (term === "lsize") return "Log grant amount";
  return term;
}

function termGroup(term) {
  if (term.startsWith("C(era)")) return "Era, relative to FY2011 to FY2019";
  if (term.startsWith("C(cat)")) return "Work category, relative to runway pavement";
  if (term.startsWith("C(hub)")) return "Airport class, relative to general aviation";
  return "Grant size";
}

function eraBands(g, x, fys, h, t, w) {
  ERA_YEARS.forEach(([a, b], i) => {
    const x0 = x(a) - (x.step() * x.paddingInner()) / 2;
    const x1 = x(b) + x.bandwidth() + (x.step() * x.paddingInner()) / 2;
    if (i % 2 === 1) band(g, x0, x1, h, { fill: i === 3 ? t.bandPost : t.bandPre });
    g.append("text").attr("class", "band-label").attr("x", (x0 + x1) / 2).attr("y", -9).attr("text-anchor", "middle").text(w < 440 && i === 2 ? "Pand." : ERA_SHORT[i]);
  });
}

export async function initPostaward() {
  const p = await load("postaward");
  const eras = p.eras;
  const fys = p.byYear.map((r) => r.fy);
  const view = { heat: "hub", heatMeasure: "added", odds: "prob" };

  const years = card(document.getElementById("post-years"), {
    figure: "Fig. 9a",
    title: "Grants with money added or returned within 36 months",
    subtitle: "AIP construction grants by fiscal year of award; labels show the shares added (top) and returned (bottom)",
    note: "Of the 21,576 grants, 18% received added federal funds within 36 months, 39% returned funds, and 46% had no amendment that changed funding; some grants did both.",
    height: (w) => Math.round(Math.max(290, Math.min(370, w * 0.64))),
    table: () => ({
      caption: "AIP construction grant amendments by award year",
      columns: [{ label: "Fiscal year" }, { label: "Grants", num: true }, { label: "Money added", num: true }, { label: "No change", num: true }, { label: "Money returned", num: true }],
      rows: p.byYear.map((r) => [String(r.fy), count(r.grants), pct(100 * r.share_increase, 1), pct(100 * r.share_unchanged, 1), pct(100 * r.share_decrease, 1)]),
    }),
    render: (api, t) => {
      const parts = [
        { key: "share_decrease", label: "Money returned", color: t.series[0] },
        { key: "share_unchanged", label: "No change", color: t.other },
        { key: "share_increase", label: "Money added", color: t.series[1] },
      ];
      legend(api.legend, parts.slice().reverse().map((q) => ({ key: q.key, label: q.label, color: q.color })));
      const m = { top: 24, right: 6, bottom: 24, left: 40 };
      const { g, w, h } = frame(api, m);
      const x = d3.scaleBand().domain(fys).range([0, w]).paddingInner(0.24).paddingOuter(0.08);
      const y = d3.scaleLinear().domain([0, 100]).range([h, 0]);
      eraBands(g, x, fys, h, t, w);
      yAxis(g, y, { width: w, values: [0, 25, 50, 75, 100], format: (v) => `${v}%` });
      xAxis(g, x, { height: h, values: thin(fys, w, 40), format: (v) => String(v) });
      const bw = Math.min(26, x.bandwidth());
      const off = (x.bandwidth() - bw) / 2;
      const cols = g.append("g");
      p.byYear.forEach((r) => {
        const col = cols.append("g").attr("class", "mark grow-y").attr("data-fy", r.fy);
        let acc = 0;
        const total = r.share_decrease + r.share_unchanged + r.share_increase;
        parts.forEach((q, k) => {
          const v = (100 * r[q.key]) / total;
          const y0 = y(acc);
          const y1 = y(acc + v);
          const gap = k > 0 ? 2 : 0;
          col.append("path").attr("d", barPath(x(r.fy) + off, y1, bw, Math.max(0, y0 - y1 - gap), k === parts.length - 1 ? 4 : 0, k === parts.length - 1 ? "up" : "none")).attr("fill", q.color);
          acc += v;
        });
        if (bw >= 18) {
          col.append("text").attr("x", x(r.fy) + x.bandwidth() / 2).attr("y", y(100 - (50 * r.share_increase) / total) + 4).attr("text-anchor", "middle").attr("font-size", 9.5).attr("fill", inkOn(t.series[1])).text(Math.round(100 * r.share_increase));
          col.append("text").attr("x", x(r.fy) + x.bandwidth() / 2).attr("y", y((50 * r.share_decrease) / total) + 4).attr("text-anchor", "middle").attr("font-size", 9.5).attr("fill", inkOn(t.series[0])).text(Math.round(100 * r.share_decrease));
        }
      });
      g.append("rect")
        .attr("class", "hit")
        .attr("width", w)
        .attr("height", h)
        .on("pointermove", (event) => {
          const [mx] = d3.pointer(event);
          const idx = Math.max(0, Math.min(fys.length - 1, Math.round((mx - x(fys[0]) - x.bandwidth() / 2) / x.step())));
          const r = p.byYear[idx];
          cols.selectAll(".mark").classed("is-dim", function () {
            return Number(this.getAttribute("data-fy")) !== r.fy;
          });
          const era = ERA_YEARS.findIndex(([a, b]) => r.fy >= a && r.fy <= b);
          showTip(event, {
            title: `Grants awarded in FY${r.fy}`,
            subtitle: `${count(r.grants)} grants · ${eraLabel(eras[era])}`,
            rows: [
              { value: pct(100 * r.share_increase, 1), label: "money added within 36 months", color: t.series[1] },
              { value: pct(100 * r.share_unchanged, 1), label: "no change in funding", color: t.other },
              { value: pct(100 * r.share_decrease, 1), label: "money returned within 36 months", color: t.series[0] },
            ],
          });
        })
        .on("pointerleave", () => {
          cols.selectAll(".mark").classed("is-dim", false);
          hideTip();
        });
    },
  });

  const net = card(document.getElementById("post-net"), {
    figure: "Fig. 9b",
    title: "Net change within 36 months of award",
    subtitle: "Percentile ribbons of the net change by award year, with the dollar-weighted net change",
    note: "The median net change was 0, and the dollar-weighted net change was .5% of original obligations; by era it ranged from about 0% for FY2022 to FY2023 grants to 2.9% for pandemic era grants. Ribbons are clipped at −12% and 12%.",
    height: (w) => Math.round(Math.max(290, Math.min(370, w * 0.64))),
    table: () => ({
      caption: "Net change within 36 months by award year (percent of original grant)",
      columns: [{ label: "Fiscal year" }, { label: "10th percentile", num: true }, { label: "25th", num: true }, { label: "Median", num: true }, { label: "75th", num: true }, { label: "90th", num: true }, { label: "Dollar weighted", num: true }],
      rows: p.byYear.map((r) => [String(r.fy), pct(r.p10_growth_pct, 1), pct(r.p25_growth_pct, 1), pct(r.median_growth_pct, 1), pct(r.p75_growth_pct, 1), pct(r.p90_growth_pct, 1), pct(r.dollar_weighted_growth_pct, 2)]),
    }),
    render: (api, t) => {
      legend(api.legend, [
        { key: "p90", label: "10th to 90th percentile", color: d3.interpolateLab(t.surface, t.series[0])(0.28) },
        { key: "p75", label: "25th to 75th percentile", color: d3.interpolateLab(t.surface, t.series[0])(0.6) },
        { key: "dw", label: "Dollar-weighted net change", color: t.ink, shape: "line" },
      ]);
      const m = { top: 24, right: 10, bottom: 24, left: 40 };
      const { g, w, h } = frame(api, m);
      const x = d3.scaleBand().domain(fys).range([0, w]).paddingInner(0.24).paddingOuter(0.08);
      const cx = (fy) => x(fy) + x.bandwidth() / 2;
      const y = d3.scaleLinear().domain([-12, 12]).range([h, 0]);
      eraBands(g, x, fys, h, t, w);
      yAxis(g, y, { width: w, values: [-10, -5, 0, 5, 10], format: (v) => pct(v) });
      xAxis(g, x, { height: h, values: thin(fys, w, 40), format: (v) => String(v) });
      const area = (lo, hi) => d3.area().x((r) => cx(r.fy)).y0((r) => y(Math.max(-12, r[lo]))).y1((r) => y(Math.min(12, r[hi]))).curve(d3.curveMonotoneX);
      g.append("path").attr("class", "fade").attr("d", area("p10_growth_pct", "p90_growth_pct")(p.byYear)).attr("fill", t.series[0]).attr("fill-opacity", 0.18);
      g.append("path").attr("class", "fade").attr("d", area("p25_growth_pct", "p75_growth_pct")(p.byYear)).attr("fill", t.series[0]).attr("fill-opacity", 0.38);
      g.append("line").attr("class", "baseline").attr("x1", 0).attr("x2", w).attr("y1", y(0)).attr("y2", y(0));
      g.append("path").attr("class", "draw").attr("d", d3.line().x((r) => cx(r.fy)).y((r) => y(r.dollar_weighted_growth_pct))(p.byYear)).attr("fill", "none").attr("stroke", t.ink).attr("stroke-width", 2);
      g.append("g")
        .selectAll("circle")
        .data(p.byYear)
        .join("circle")
        .attr("class", "pop")
        .attr("cx", (r) => cx(r.fy))
        .attr("cy", (r) => y(r.dollar_weighted_growth_pct))
        .attr("r", 3.5)
        .attr("fill", t.ink)
        .attr("stroke", t.surface)
        .attr("stroke-width", 1.5);
      const hair = g.append("line").attr("class", "crosshair").attr("y1", 0).attr("y2", h).style("opacity", 0);
      g.append("rect")
        .attr("class", "hit")
        .attr("width", w)
        .attr("height", h)
        .on("pointermove", (event) => {
          const [mx] = d3.pointer(event);
          const idx = Math.max(0, Math.min(fys.length - 1, Math.round((mx - x(fys[0]) - x.bandwidth() / 2) / x.step())));
          const r = p.byYear[idx];
          hair.attr("x1", cx(r.fy)).attr("x2", cx(r.fy)).style("opacity", 1);
          showTip(event, {
            title: `Grants awarded in FY${r.fy}`,
            subtitle: `${count(r.grants)} grants`,
            rows: [
              { value: pct(r.dollar_weighted_growth_pct, 2), label: "dollar-weighted net change", color: t.ink, focus: true },
              { value: `${pct(r.p25_growth_pct, 1)} to ${pct(r.p75_growth_pct, 1)}`, label: "25th to 75th percentile" },
              { value: `${pct(r.p10_growth_pct, 1)} to ${pct(r.p90_growth_pct, 1)}`, label: "10th to 90th percentile" },
              { value: pct(r.median_growth_pct, 1), label: "median" },
            ],
          });
        })
        .on("pointerleave", () => {
          hair.style("opacity", 0);
          hideTip();
        });
    },
  });

  const timing = card(document.getElementById("post-timing"), {
    figure: "Fig. 9c",
    title: "Timing of amendments after award",
    subtitle: "Amendments that added funds (above) came earlier than those that returned funds (below)",
    note: "Months from award to each amendment that changed federal obligations, in 3-month bins; the last bin includes later amendments.",
    height: (w) => Math.round(Math.max(290, Math.min(360, w * 0.62))),
    table: () => ({
      caption: "Amendments by months after award",
      columns: [{ label: "Months after award" }, { label: "Money added", num: true }, { label: "Money returned", num: true }],
      rows: p.timing.added.map((v, i) => [`${p.timing.binMonths[i]} to ${p.timing.binMonths[i + 1]}`, count(v), count(p.timing.returned[i])]),
    }),
    render: (api, t) => {
      legend(api.legend, [
        { key: "added", label: "Money added", color: t.series[1] },
        { key: "returned", label: "Money returned", color: t.series[0] },
      ]);
      const bins = p.timing.binMonths;
      const m = { top: 12, right: 10, bottom: 36, left: 46 };
      const { g, w, h } = frame(api, m);
      const x = d3.scaleLinear().domain([0, 60]).range([0, w]);
      const maxV = Math.max(d3.max(p.timing.added), d3.max(p.timing.returned));
      const y = d3.scaleLinear().domain([-maxV, maxV]).nice(4).range([h, 0]);
      yAxis(g, y, { width: w, ticks: 6, format: (v) => count(Math.abs(v)) });
      xAxis(g, x, { height: h, values: [0, 12, 24, 36, 48, 60], format: (v) => String(v), tickSize: 4 });
      g.append("text").attr("class", "axis-title").attr("x", w / 2).attr("y", h + 32).attr("text-anchor", "middle").text("Months after award");
      g.append("line").attr("class", "baseline").attr("x1", 0).attr("x2", w).attr("y1", y(0)).attr("y2", y(0));
      const bw = Math.max(2, x(3) - x(0) - 2);
      const groups = p.timing.added.map((v, i) => ({ i, a: v, r: p.timing.returned[i], x0: x(bins[i]) + 1 }));
      const cols = g.append("g");
      groups.forEach((bn) => {
        const col = cols.append("g").attr("class", "mark").attr("data-i", bn.i);
        col.append("path").attr("class", "grow-y").attr("d", barPath(bn.x0, y(bn.a), bw, y(0) - y(bn.a) - 1, 3, "up")).attr("fill", t.series[1]);
        col.append("path").attr("class", "grow-down").attr("d", barPath(bn.x0, y(0) + 1, bw, y(-bn.r) - y(0) - 1, 3, "down")).attr("fill", t.series[0]);
      });
      [
        { v: p.timing.medianAdded, label: `median ${num(p.timing.medianAdded, 0)} months`, above: true },
        { v: p.timing.medianReturned, label: `median ${num(p.timing.medianReturned, 0)} months`, above: false },
      ].forEach((md) => {
        g.append("line").attr("class", "fade").attr("x1", x(md.v)).attr("x2", x(md.v)).attr("y1", md.above ? 0 : y(0)).attr("y2", md.above ? y(0) : h).attr("stroke", t.ink).attr("stroke-width", 1.5);
        g.append("text").attr("class", "label-strong halo fade").attr("x", x(md.v) + 5).attr("y", md.above ? 12 : h - 6).text(md.label);
      });
      g.append("rect")
        .attr("class", "hit")
        .attr("width", w)
        .attr("height", h)
        .on("pointermove", (event) => {
          const [mx] = d3.pointer(event);
          const i = Math.max(0, Math.min(groups.length - 1, Math.floor(x.invert(mx) / 3)));
          const bn = groups[i];
          cols.selectAll(".mark").classed("is-dim", function () {
            return Number(this.getAttribute("data-i")) !== i;
          });
          showTip(event, {
            title: i === groups.length - 1 ? `${bins[i]} months or later` : `${bins[i]} to ${bins[i + 1]} months after award`,
            rows: [
              { value: count(bn.a), label: "amendments that added money", color: t.series[1] },
              { value: count(bn.r), label: "amendments that returned money", color: t.series[0] },
            ],
          });
        })
        .on("pointerleave", () => {
          cols.selectAll(".mark").classed("is-dim", false);
          hideTip();
        });
    },
  });

  const categories = [...new Set(p.byCategoryEra.map((r) => r.primary_category))];
  const heat = card(document.getElementById("post-hub"), {
    figure: "Fig. 9d",
    title: "Grants with money added by airport class and era",
    subtitle: "Raw shares of grants; darker cells are higher",
    note: "",
    height: () => (view.heat === "hub" ? HUBS.length : categories.length) * 34 + 46,
    table: () => {
      const rowsKey = view.heat === "hub" ? "hub_class" : "primary_category";
      const names = view.heat === "hub" ? HUBS : categories;
      const src = view.heat === "hub" ? p.byHubEra : p.byCategoryEra;
      return {
        caption: `${MEASURES[view.heatMeasure].label} by ${view.heat === "hub" ? "airport class" : "work category"} and era`,
        columns: [{ label: view.heat === "hub" ? "Airport class" : "Work category" }, ...eras.map((e) => ({ label: eraLabel(e), num: true }))],
        rows: names.map((nm) => [
          nm,
          ...eras.map((e) => {
            const r = src.find((o) => o[rowsKey] === nm && o.era === e);
            return r ? { text: pct(valueOf(r, view.heatMeasure), 1), sort: valueOf(r, view.heatMeasure) } : "";
          }),
        ]),
      };
    },
    render: (api, t) => {
      smallToggle(
        api,
        [
          { value: "added", label: "Added" },
          { value: "returned", label: "Returned" },
          { value: "net", label: "Net" },
        ],
        view.heatMeasure,
        (v) => {
          view.heatMeasure = v;
          heat.update();
        },
      );
      if (!api.tools.querySelector(".segmented + .segmented")) {
        const group = document.createElement("div");
        group.className = "segmented small";
        group.setAttribute("role", "radiogroup");
        [
          { value: "hub", label: "Class" },
          { value: "category", label: "Category" },
        ].forEach((opt) => {
          const b = document.createElement("button");
          b.type = "button";
          b.setAttribute("role", "radio");
          b.textContent = opt.label;
          b.setAttribute("aria-checked", String(view.heat === opt.value));
          b.addEventListener("click", () => {
            view.heat = opt.value;
            group.querySelectorAll("button").forEach((o) => o.setAttribute("aria-checked", String(o === b)));
            heat.update();
          });
          group.append(b);
        });
        api.tools.querySelector(".segmented").after(group);
      }
      const measure = MEASURES[view.heatMeasure];
      const rowsKey = view.heat === "hub" ? "hub_class" : "primary_category";
      const names = view.heat === "hub" ? HUBS : categories;
      const src = view.heat === "hub" ? p.byHubEra : p.byCategoryEra;
      api.setTitle(`${measure.label.replace(" within 36 months", "")} by ${view.heat === "hub" ? "airport class" : "work category"} and era`);
      api.setSubtitle(measure.share ? "Raw shares of grants; darker cells are higher" : "Dollar-weighted net change as a percent of original obligations");
      api.setNote(view.heat === "hub" ? "Large hubs were the least likely to receive added funds in every era; the adjusted probability was 4% at large hubs and 23% at general aviation airports." : "Support buildings, drainage, and landside access grants were more likely to receive added funds, holding other factors constant.");
      const values = src.map((r) => valueOf(r, view.heatMeasure));
      let color;
      if (measure.share) {
        const ramp = view.heatMeasure === "added" ? [t.orangeLo, t.orangeHi] : [t.seqLo, t.seqHi];
        color = d3.scaleQuantize().domain([0, d3.max(values)]).range(sequential(ramp[0], d3.interpolateLab(ramp[0], ramp[1])(0.8), 6));
      } else {
        const lim = Math.max(Math.abs(d3.min(values)), Math.abs(d3.max(values)));
        const cols = diverging(t, 3);
        color = (v) => cols[Math.max(0, Math.min(6, Math.round(3 + (3 * v) / lim)))];
      }
      const labelW = Math.min(200, Math.max(...names.map((nm) => textWidth(nm, 11.5))) + 12);
      const m = { top: 34, right: 4, bottom: 8, left: labelW };
      const { g, w, h } = frame(api, m);
      const x = d3.scaleBand().domain(eras).range([0, w]).padding(0.06);
      const y = d3.scaleBand().domain(names).range([0, h]).padding(0.08);
      eras.forEach((e, i) => {
        g.append("text").attr("class", "label").attr("x", x(e) + x.bandwidth() / 2).attr("y", -20).attr("text-anchor", "middle").text(ERA_SHORT[i]);
        g.append("text").attr("class", "label-muted").attr("x", x(e) + x.bandwidth() / 2).attr("y", -7).attr("text-anchor", "middle").text(`FY${ERA_YEARS[i][0]} to ${String(ERA_YEARS[i][1]).slice(2)}`);
      });
      names.forEach((nm) => g.append("text").attr("class", "label").attr("x", -10).attr("y", y(nm) + y.bandwidth() / 2 + 4).attr("text-anchor", "end").text(nm));
      const cells = [];
      names.forEach((nm) => {
        eras.forEach((e) => {
          const r = src.find((o) => o[rowsKey] === nm && o.era === e);
          if (r) cells.push({ nm, e, r, v: valueOf(r, view.heatMeasure) });
        });
      });
      const cellG = g
        .selectAll("g.cell")
        .data(cells)
        .join("g")
        .attr("class", "cell mark")
        .attr("transform", (c) => `translate(${x(c.e)},${y(c.nm)})`);
      cellG.append("rect").attr("class", "fade").attr("width", x.bandwidth()).attr("height", y.bandwidth()).attr("rx", 4).attr("fill", (c) => color(c.v));
      cellG
        .append("text")
        .attr("class", "fade")
        .attr("x", x.bandwidth() / 2)
        .attr("y", y.bandwidth() / 2 + 4)
        .attr("text-anchor", "middle")
        .attr("font-size", 12)
        .attr("fill", (c) => inkOn(color(c.v)))
        .text((c) => pct(c.v, measure.share ? 0 : 1));
      cellG
        .on("pointerenter pointermove", (event, c) => {
          cellG.classed("is-dim", (o) => o !== c);
          showTip(event, {
            title: c.nm,
            subtitle: `${eraLabel(c.e)} · ${count(c.r.grants)} grants`,
            rows: [
              { value: pct(100 * c.r.share_increase, 1), label: "money added within 36 months", focus: view.heatMeasure === "added" },
              { value: pct(100 * c.r.share_decrease, 1), label: "money returned within 36 months", focus: view.heatMeasure === "returned" },
              { value: pct(c.r.dollar_weighted_growth_pct, 2), label: "dollar-weighted net change", focus: view.heatMeasure === "net" },
              { value: pct(c.r.mean_increase_pct_given_increase, 1), label: "mean increase when money was added" },
            ],
          });
        })
        .on("pointerleave", () => {
          cellG.classed("is-dim", false);
          hideTip();
        });
    },
  });

  const oddsRows = p.oddsRatios.filter((o) => o.term !== "Intercept");
  const probGroups = () => [
    { name: "Era", rows: eras.map((e) => ({ label: eraLabel(e), v: 100 * p.adjusted.increaseByEra[e], ret: 100 * p.adjusted.decreaseByEra[e] })) },
    { name: "Airport class", rows: HUBS.map((hb) => ({ label: hb, v: 100 * p.adjusted.increaseByHub[hb] })) },
    { name: "Work category", rows: Object.entries(p.adjusted.increaseByCategory).map(([c, v]) => ({ label: c, v: 100 * v })).sort((a, b) => b.v - a.v) },
  ];
  const adjusted = card(document.getElementById("post-adjusted"), {
    figure: "Table 2",
    title: "Adjusted probability of added funds within 36 months",
    subtitle: "Logit model with era, work category, airport class, and log grant amount; predictions averaged over all grants with each level set in turn",
    note: `Model of ${count(p.n)} grants; standard errors clustered by airport. FY2022 to FY2023 grants: odds ratio .55 relative to FY2011 to FY2019 (95% CI .48 to .62; p < .001). The adjusted probability of returning funds fell from 45% to 36%.`,
    height: (w) => {
      if (view.odds === "odds") return oddsRows.length * 24 + 4 * 26 + 40;
      return w >= 860 ? 9 * 26 + 40 : 20 * 26 + 3 * 26 + 20;
    },
    table: () =>
      view.odds === "prob"
        ? {
            caption: "Adjusted probability of added funds within 36 months",
            columns: [{ label: "Group" }, { label: "Level" }, { label: "Adjusted probability", num: true }],
            rows: probGroups().flatMap((gr) => gr.rows.map((r) => [gr.name, r.label, { text: pct(r.v, 1), sort: r.v }])),
          }
        : {
            caption: "Odds ratios for an increase within 36 months",
            columns: [{ label: "Term" }, { label: "Odds ratio", num: true }, { label: "95% CI", num: true }, { label: "p value", num: true }],
            rows: oddsRows.map((o) => [`${termGroup(o.term)}: ${termLabel(o.term)}`, { text: num(o.odds_ratio, 2), sort: o.odds_ratio }, `${num(o.or_low, 2)} to ${num(o.or_high, 2)}`, { text: pValue(o.p), sort: o.p }]),
          },
    render: (api, t) => {
      smallToggle(
        api,
        [
          { value: "prob", label: "Probabilities" },
          { value: "odds", label: "Odds ratios" },
        ],
        view.odds,
        (v) => {
          view.odds = v;
          adjusted.update();
        },
      );
      if (view.odds === "prob") {
        const groups = probGroups();
        const wide = api.width >= 860;
        const colW = wide ? api.width / 3 : api.width;
        let offsetY = 0;
        groups.forEach((gr, gi) => {
          const gx = wide ? gi * colW : 0;
          const gy = wide ? 0 : offsetY;
          const labelW = Math.min(wide ? 170 : 210, Math.max(...gr.rows.map((r) => textWidth(r.label, 11.5))) + 12);
          const barW = colW - labelW - 56;
          const x = d3.scaleLinear().domain([0, 30]).range([0, barW]);
          const grp = api.svg.append("g").attr("transform", `translate(${gx + labelW},${gy})`);
          grp.append("text").attr("class", "label-strong").attr("x", -labelW).attr("y", 16).text(gr.name);
          gr.rows.forEach((r, i) => {
            const row = grp.append("g").attr("class", "mark").attr("transform", `translate(0,${26 + i * 26})`);
            row.append("rect").attr("x", -labelW).attr("width", colW - 8).attr("height", 26).attr("fill", "transparent");
            row.append("text").attr("class", "label").attr("x", -10).attr("y", 17).attr("text-anchor", "end").text(r.label);
            row.append("rect").attr("x", 0).attr("y", 7).attr("width", barW).attr("height", 12).attr("rx", 6).attr("fill", t.bandPre);
            row.append("path").attr("class", "grow-x").attr("d", barPath(0, 7, Math.max(2, x(r.v)), 12, 4, "right")).attr("fill", t.series[1]);
            row.append("text").attr("class", "label fade").attr("x", barW + 8).attr("y", 17).text(pct(r.v));
            row
              .on("pointerenter pointermove", (event) => {
                showTip(event, {
                  title: r.label,
                  subtitle: gr.name,
                  rows: [{ value: pct(r.v, 1), label: "adjusted probability of added funds", color: t.series[1], focus: true }, r.ret !== undefined ? { value: pct(r.ret, 1), label: "adjusted probability of returned funds", color: t.series[0] } : null],
                });
              })
              .on("pointerleave", hideTip);
          });
          offsetY += 26 + gr.rows.length * 26 + 18;
        });
        return;
      }
      const grouped = d3.groups(oddsRows, (o) => termGroup(o.term));
      const labelW = Math.min(210, Math.max(...oddsRows.map((o) => textWidth(termLabel(o.term), 11.5))) + 12);
      const m = { top: 4, right: 64, bottom: 26, left: labelW };
      const { g, w, h } = frame(api, m);
      const x = d3.scaleLog().domain([0.08, 3]).range([0, w]);
      g.append("g").attr("class", "axis").attr("transform", `translate(0,${h})`).call(d3.axisBottom(x).tickValues([0.1, 0.25, 0.5, 1, 2]).tickSize(-h).tickPadding(8).tickFormat((v) => num(v, v < 1 ? 2 : 0).replace(/0$/, "")));
      g.append("line").attr("class", "baseline").attr("x1", x(1)).attr("x2", x(1)).attr("y1", 0).attr("y2", h).attr("stroke-width", 1.5);
      let yy = 0;
      grouped.forEach(([name, rows]) => {
        g.append("text").attr("class", "label-strong").attr("x", -labelW).attr("y", yy + 17).text(name);
        yy += 26;
        rows.forEach((o) => {
          const sig = o.p < 0.05;
          const row = g.append("g").attr("class", "mark").attr("transform", `translate(0,${yy + 12})`);
          row.append("rect").attr("x", -labelW).attr("y", -12).attr("width", w + labelW + m.right).attr("height", 24).attr("fill", "transparent");
          row.append("text").attr("class", "label").attr("x", -10).attr("y", 4).attr("text-anchor", "end").text(termLabel(o.term));
          row.append("line").attr("class", "draw").attr("x1", x(o.or_low)).attr("x2", x(o.or_high)).attr("stroke", t.series[1]).attr("stroke-width", 2).attr("stroke-linecap", "round");
          row.append("circle").attr("class", "pop").attr("cx", x(o.odds_ratio)).attr("r", 5).attr("fill", sig ? t.series[1] : t.surface).attr("stroke", sig ? t.surface : t.series[1]).attr("stroke-width", 2);
          row.append("text").attr("class", "label").attr("x", w + m.right - 2).attr("y", 4).attr("text-anchor", "end").text(num(o.odds_ratio, 2));
          row
            .on("pointerenter pointermove", (event) => {
              showTip(event, {
                title: termLabel(o.term),
                subtitle: name,
                rows: [
                  { value: num(o.odds_ratio, 3), label: "odds ratio", color: t.series[1], focus: true },
                  { value: `${num(o.or_low, 3)} to ${num(o.or_high, 3)}`, label: "95% confidence interval" },
                  { value: pValue(o.p), label: sig ? "significant at 5%" : "not significant at 5%" },
                ],
              });
            })
            .on("pointerleave", hideTip);
          yy += 24;
        });
      });
    },
  });

  [years, net, timing, heat, adjusted].forEach((c) => c.render());
}
