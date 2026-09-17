import { load } from "../lib/data.js";
import { el } from "../lib/dom.js";
import { card, legend, frame, yAxis, xAxis, barPath, band, spreadLabels, textWidth, thin, jitter, smallToggle } from "../lib/chart.js";
import { segmented, select } from "../lib/controls.js";
import { showTip, hideTip } from "../lib/tooltip.js";
import { inkOn } from "../lib/theme.js";
import { money, pct, num, count, logToPct, reportLabel, reportShort, pValue } from "../lib/format.js";

const DEV_SLOT = { Terminal: 1, Reconstruction: 0, Standards: 2, "Airfield capacity": 3, "Safety and security": 4, "Environmental and noise": 5, "Ground access": 6, "New airports, towers, other": -1 };
const DEV_STACK = ["Terminal", "Reconstruction", "Standards", "Airfield capacity", "Safety and security", "Environmental and noise", "Ground access", "New airports, towers, other"];
const TYPES = ["Large hub", "Medium hub", "Small hub", "Nonhub", "Nonprimary"];
const PCT_TICKS = [-75, -50, 0, 100, 200, 300];

function devColor(t, c) {
  const s = DEV_SLOT[c];
  return s === undefined || s < 0 ? t.other : t.series[s];
}

export async function initPlanning() {
  const [n, dose] = await Promise.all([load("npias"), load("dose")]);
  const cycles = n.cycles;
  const hubs = n.hubs;
  const last = cycles.length - 1;
  const view = { dollars: "nominal", revClass: "All airports", hidden: new Set(), devHidden: new Set(), devView: "dollars", typeGroup: "All types", doseY: "post", typeHidden: new Set() };
  const deflator = n.indexPPI.map((v) => n.indexPPI[last] / v);
  const hubValue = (h, i) => n.byHub[h][i] * (view.dollars === "nominal" ? 1 : deflator[i]);

  const controls = document.getElementById("planning-controls");
  segmented(controls, {
    label: "Dollars",
    options: [
      { value: "nominal", label: "Nominal" },
      { value: "real", label: "Constant prices" },
    ],
    value: view.dollars,
    onChange: (v) => {
      view.dollars = v;
      totals.update();
      devBars.update();
    },
  });
  select(controls, {
    label: "Airport class for revisions",
    options: [{ value: "All airports", label: "All airports" }, ...hubs.map((h) => ({ value: h, label: h }))],
    value: view.revClass,
    onChange: (v) => {
      view.revClass = v;
      revisions.update();
    },
  });

  function stackedColumns(g, { rows, x, y, bw, color, key }) {
    const cols = g.append("g");
    const off = (x.bandwidth() - bw) / 2;
    rows.forEach((r) => {
      const col = cols.append("g").attr("class", "mark grow-y").attr("data-i", r.i);
      const segs = r.segs.filter((s) => s.v > 0);
      segs.forEach((s, k) => {
        const y0 = y(s.y0);
        const y1 = y(s.y1);
        const gap = k > 0 && y0 - y1 > 3 ? 2 : 0;
        const top = k === segs.length - 1;
        col
          .append("path")
          .attr("d", barPath(x(r[key]) + off, y1, bw, Math.max(0, y0 - y1 - gap), top ? 4 : 0, top ? "up" : "none"))
          .attr("fill", color(s));
      });
    });
    return cols;
  }

  const totals = card(document.getElementById("npias-totals"), {
    figure: "Fig. 4a",
    title: "Five-year development estimates by airport type",
    subtitle: "Sum of airport estimates in each NPIAS report",
    note: "Constant prices deflate each report with the PPI for construction materials to the prices of the 2025 to 2029 report.",
    height: (w) => Math.round(Math.max(270, Math.min(360, w * 0.6))),
    table: () => ({
      caption: `NPIAS five-year estimates by airport type (${view.dollars === "nominal" ? "nominal dollars" : "constant prices"})`,
      columns: [{ label: "Report" }, ...hubs.map((h) => ({ label: h, num: true })), { label: "Total", num: true }],
      rows: cycles.map((c, i) => [reportLabel(c), ...hubs.map((h) => ({ text: money(hubValue(h, i)), sort: hubValue(h, i) })), { text: money(d3.sum(hubs, (h) => hubValue(h, i))), sort: d3.sum(hubs, (h) => hubValue(h, i)) }]),
    }),
    render: (api, t) => {
      legend(api.legend, hubs.map((h, i) => ({ key: h, label: h, color: t.series[i] })), { hidden: view.hidden, onToggle: () => totals.update() });
      const shown = hubs.filter((h) => !view.hidden.has(h));
      const m = { top: 22, right: 6, bottom: 24, left: 50 };
      const { g, w, h } = frame(api, m);
      const rows = cycles.map((c, i) => {
        let acc = 0;
        const segs = shown.map((hub) => {
          const v = hubValue(hub, i);
          const s = { hub, v, y0: acc, y1: acc + v };
          acc += v;
          return s;
        });
        return { c, i, segs, total: acc };
      });
      const x = d3.scaleBand().domain(cycles).range([0, w]).paddingInner(0.3).paddingOuter(0.1);
      const y = d3.scaleLinear().domain([0, d3.max(rows, (r) => r.total) || 1]).nice(5).range([h, 0]);
      band(g, x(cycles[last - 1]) - 4, x(cycles[last]) + x.bandwidth() + 4, h, { fill: t.bandPost, label: "After IIJA", labelY: -8, align: "end" });
      yAxis(g, y, { width: w, ticks: 5, format: (v) => (v === 0 ? "0" : money(v)) });
      xAxis(g, x, { height: h, values: thin(cycles, w, 50), format: reportShort });
      const cols = stackedColumns(g, { rows, x, y, bw: Math.min(24, x.bandwidth()), color: (s) => t.series[hubs.indexOf(s.hub)], key: "c" });
      const readout = g.append("text").attr("class", "label-strong halo fade").attr("text-anchor", "middle");
      const setReadout = (r) => readout.attr("x", x(r.c) + x.bandwidth() / 2).attr("y", y(r.total) - 6).text(money(r.total));
      setReadout(rows[last]);
      g.append("rect")
        .attr("class", "hit")
        .attr("width", w)
        .attr("height", h)
        .on("pointermove", (event) => {
          const [mx, my] = d3.pointer(event);
          const idx = Math.max(0, Math.min(last, Math.round((mx - x(cycles[0]) - x.bandwidth() / 2) / x.step())));
          const r = rows[idx];
          cols.selectAll(".mark").classed("is-dim", function () {
            return Number(this.getAttribute("data-i")) !== idx;
          });
          setReadout(r);
          const v = y.invert(my);
          const hovered = r.segs.find((s) => v >= s.y0 && v <= s.y1);
          showTip(event, {
            title: `${reportLabel(r.c)} report`,
            subtitle: `Total ${money(r.total)} for ${n.airports[idx].toLocaleString("en-US")} airports`,
            rows: r.segs
              .slice()
              .reverse()
              .map((s) => ({ value: money(s.v), label: s.hub, color: t.series[hubs.indexOf(s.hub)], shape: "dot", focus: hovered && hovered.hub === s.hub })),
          });
        })
        .on("pointerleave", () => {
          cols.selectAll(".mark").classed("is-dim", false);
          setReadout(rows[last]);
          hideTip();
        });
    },
  });

  const indexSeries = [
    { key: "nominal", label: "NPIAS estimate, nominal", values: n.indexNominal, slot: 0 },
    { key: "ppi", label: "PPI, construction materials", values: n.indexPPI, slot: 1 },
    { key: "real", label: "NPIAS estimate, deflated by the PPI", values: n.indexReal, slot: 2 },
  ];
  const indexHidden = new Set();
  const index = card(document.getElementById("npias-index"), {
    figure: "Fig. 4b",
    title: "NPIAS estimates and construction material prices",
    subtitle: "Index, 2007 to 2011 report = 100, by the dollar year of each report",
    note: "From the 2019 to 2023 report to the 2025 to 2029 report, the nominal estimate rose 94% and the PPI for construction materials rose 39%. Deflated, the 2025 to 2029 total was 10% below the 2007 to 2011 total.",
    height: (w) => Math.round(Math.max(270, Math.min(360, w * 0.6))),
    table: () => ({
      caption: "Index values (2007 to 2011 report = 100)",
      columns: [{ label: "Report" }, { label: "Dollar year", num: true }, ...indexSeries.map((s) => ({ label: s.label, num: true }))],
      rows: cycles.map((c, i) => [reportLabel(c), String(n.dollarYear[i]), ...indexSeries.map((s) => ({ text: num(s.values[i], 1), sort: s.values[i] }))]),
    }),
    render: (api, t) => {
      legend(api.legend, indexSeries.map((s) => ({ key: s.key, label: s.label, color: t.series[s.slot], shape: "line" })), { hidden: indexHidden, onToggle: () => index.update() });
      const shown = indexSeries.filter((s) => !indexHidden.has(s.key));
      const m = { top: 12, right: 44, bottom: 24, left: 40 };
      const { g, w, h } = frame(api, m);
      const x = d3.scaleLinear().domain(d3.extent(n.dollarYear)).range([0, w]);
      const y = d3.scaleLinear().domain([0, d3.max(shown, (s) => d3.max(s.values)) * 1.05]).nice(5).range([h, 0]);
      band(g, x(2021.5), w, h, { fill: t.bandPost });
      yAxis(g, y, { width: w, ticks: 5 });
      xAxis(g, x, { height: h, values: [2000, 2006, 2012, 2018, 2024], format: (v) => String(v), tickSize: 4 });
      g.append("line").attr("class", "baseline").attr("x1", 0).attr("x2", w).attr("y1", y(100)).attr("y2", y(100));
      const line = d3.line().x((d) => x(d.x)).y((d) => y(d.v)).curve(d3.curveMonotoneX);
      shown.forEach((s) => {
        const pts = s.values.map((v, i) => ({ x: n.dollarYear[i], v }));
        g.append("path").attr("class", "draw").attr("d", line(pts)).attr("fill", "none").attr("stroke", t.series[s.slot]).attr("stroke-width", 2).attr("stroke-linejoin", "round");
      });
      spreadLabels(
        shown.map((s) => ({ s, y: y(s.values[last]) })),
        { minGap: 13, top: 0, bottom: h },
      ).forEach((e) => {
        g.append("circle").attr("class", "pop").attr("cx", w).attr("cy", y(e.s.values[last])).attr("r", 4).attr("fill", t.series[e.s.slot]).attr("stroke", t.surface).attr("stroke-width", 2);
        g.append("text").attr("class", "label fade").attr("x", w + 8).attr("y", e.ly + 4).text(num(e.s.values[last], 0));
      });
      const hair = g.append("line").attr("class", "crosshair").attr("y1", 0).attr("y2", h).style("opacity", 0);
      const dots = g.append("g");
      g.append("rect")
        .attr("class", "hit")
        .attr("width", w)
        .attr("height", h)
        .on("pointermove", (event) => {
          const [mx] = d3.pointer(event);
          const yr = x.invert(mx);
          let idx = 0;
          n.dollarYear.forEach((p, i) => {
            if (Math.abs(p - yr) < Math.abs(n.dollarYear[idx] - yr)) idx = i;
          });
          hair.attr("x1", x(n.dollarYear[idx])).attr("x2", x(n.dollarYear[idx])).style("opacity", 1);
          dots.selectAll("*").remove();
          shown.forEach((s) => dots.append("circle").attr("cx", x(n.dollarYear[idx])).attr("cy", y(s.values[idx])).attr("r", 4).attr("fill", t.series[s.slot]).attr("stroke", t.surface).attr("stroke-width", 2));
          showTip(event, {
            title: `${reportLabel(cycles[idx])} report`,
            subtitle: `Prices of ${n.dollarYear[idx]}`,
            rows: shown.map((s) => ({ value: num(s.values[idx], 1), label: s.label, color: t.series[s.slot] })),
          });
        })
        .on("pointerleave", () => {
          hair.style("opacity", 0);
          dots.selectAll("*").remove();
          hideTip();
        });
    },
  });

  const allRev = Object.values(n.revisions).flat().filter(Boolean);
  const revDomain = [Math.min(...allRev.map((r) => r.p10)) - 0.05, Math.max(...allRev.map((r) => r.p90)) + 0.05];
  const transitions = cycles.slice(1);

  const revisions = card(document.getElementById("npias-revisions"), {
    figure: "Fig. 4c",
    title: "Airport-level revisions between consecutive reports",
    subtitle: "Box: middle half of airports; line: 10th to 90th percentile; bar: median",
    note: "The median revision reached 15% in the 2023 to 2027 report, the first prepared after the IIJA, and returned to 0% in the 2025 to 2029 report. Logarithmic scale.",
    height: (w) => Math.round(Math.max(300, Math.min(520, w * 0.92))),
    table: () => ({
      caption: `Revisions for ${view.revClass.toLowerCase()}`,
      columns: [{ label: "Report" }, { label: "Airports", num: true }, { label: "10th percentile", num: true }, { label: "25th", num: true }, { label: "Median", num: true }, { label: "75th", num: true }, { label: "90th", num: true }, { label: "Rose more than 5%", num: true }],
      rows: transitions
        .map((c, i) => [c, n.revisions[view.revClass][i]])
        .filter(([, r]) => r)
        .map(([c, r]) => [reportLabel(c), count(r.n), pct(logToPct(r.p10)), pct(logToPct(r.q1)), pct(logToPct(r.med)), pct(logToPct(r.q3)), pct(logToPct(r.p90)), pct(100 * r.up)]),
    }),
    render: (api, t) => {
      api.setTitle(`Airport-level revisions between consecutive reports, ${view.revClass.toLowerCase()}`);
      const rows = n.revisions[view.revClass];
      const m = { top: 22, right: 6, bottom: 24, left: 46 };
      const { g, w, h } = frame(api, m);
      const x = d3.scaleBand().domain(transitions).range([0, w]).paddingInner(0.35).paddingOuter(0.1);
      const y = d3.scaleLinear().domain(revDomain).range([h, 0]);
      const bw = Math.min(22, x.bandwidth());
      const off = (x.bandwidth() - bw) / 2;
      const iija = transitions.indexOf("2023-2027");
      band(g, x(transitions[iija]) - 4, x(transitions[iija]) + x.bandwidth() + 4, h, { fill: t.bandPost, label: "First after IIJA", labelY: -8, align: x(transitions[iija]) > w * 0.6 ? "end" : "start" });
      yAxis(g, y, { width: w, values: PCT_TICKS.map((p) => Math.log(1 + p / 100)).filter((v) => v >= revDomain[0] && v <= revDomain[1]), format: (v) => pct(logToPct(v)) });
      xAxis(g, x, { height: h, values: thin(transitions, w, 50), format: reportShort });
      g.append("line").attr("class", "baseline").attr("x1", 0).attr("x2", w).attr("y1", y(0)).attr("y2", y(0));
      const marks = g.append("g");
      rows.forEach((r, i) => {
        if (!r) return;
        const c = transitions[i];
        const cx = x(c) + x.bandwidth() / 2;
        const grp = marks.append("g").attr("class", "mark").attr("data-i", i);
        grp.append("line").attr("class", "draw").attr("x1", cx).attr("x2", cx).attr("y1", y(r.p10)).attr("y2", y(r.p90)).attr("stroke", t.ink2).attr("stroke-width", 1);
        grp.append("rect").attr("class", "pop").attr("x", x(c) + off).attr("width", bw).attr("y", y(r.q3)).attr("height", Math.max(1, y(r.q1) - y(r.q3))).attr("rx", 3).attr("fill", t.series[0]).attr("fill-opacity", i === iija ? 0.55 : 0.3);
        grp.append("line").attr("class", "pop").attr("x1", x(c) + off - 2).attr("x2", x(c) + off + bw + 2).attr("y1", y(r.med)).attr("y2", y(r.med)).attr("stroke", t.ink).attr("stroke-width", 2.5).attr("stroke-linecap", "round");
      });
      g.append("rect")
        .attr("class", "hit")
        .attr("width", w)
        .attr("height", h)
        .on("pointermove", (event) => {
          const [mx] = d3.pointer(event);
          const idx = Math.max(0, Math.min(transitions.length - 1, Math.round((mx - x(transitions[0]) - x.bandwidth() / 2) / x.step())));
          const r = rows[idx];
          marks.selectAll(".mark").classed("is-dim", function () {
            return Number(this.getAttribute("data-i")) !== idx;
          });
          if (!r) {
            hideTip();
            return;
          }
          showTip(event, {
            title: `${reportLabel(cycles[idx])} to ${reportLabel(transitions[idx])} report`,
            subtitle: `${count(r.n)} airports, ${view.revClass.toLowerCase()}`,
            rows: [
              { value: pct(logToPct(r.med)), label: "median revision", focus: true },
              { value: `${pct(logToPct(r.q1))} to ${pct(logToPct(r.q3))}`, label: "middle half" },
              { value: `${pct(logToPct(r.p10))} to ${pct(logToPct(r.p90))}`, label: "10th to 90th percentile" },
              { value: pct(100 * r.up), label: "of airports rose more than 5%" },
            ],
          });
        })
        .on("pointerleave", () => {
          marks.selectAll(".mark").classed("is-dim", false);
          hideTip();
        });
    },
  });

  const largeHubs = card(document.getElementById("npias-large-hubs"), {
    figure: "Fig. 4d",
    title: "Large hub airport estimates by report",
    subtitle: "The 30 large hubs with the largest 2025 to 2029 estimates; labels in billion dollars for estimates of $500 million or more",
    note: "Cell color shows the estimate on a logarithmic scale. DFW is outlined; its estimate rose from $739 million to $2.34 billion between the 2019 to 2023 and 2025 to 2029 reports.",
    height: () => 30 * 15 + 64,
    table: () => ({
      caption: "Large hub airport estimates by NPIAS report",
      columns: [{ label: "Airport" }, ...cycles.map((c) => ({ label: reportShort(c), num: true }))],
      rows: (largeHubs.rows || []).map(([id, a]) => [`${a.name} (${id})`, ...a.est.map((v) => ({ text: v ? money(v) : "", sort: v ?? -1 }))]),
    }),
    render: (api, t) => {
      if (!largeHubs.rows) {
        api.svg.append("text").attr("class", "label").attr("x", 10).attr("y", 20).text("Loading airport histories");
        return;
      }
      const rows = largeHubs.rows;
      const m = { top: 26, right: 4, bottom: 20, left: 42 };
      const { g, w, h } = frame(api, m);
      const x = d3.scaleBand().domain(cycles).range([0, w]).padding(0.06);
      const y = d3.scaleBand().domain(rows.map(([id]) => id)).range([0, h]).padding(0.08);
      const ramp = d3.interpolateLab(t.seqLo, t.seqHi);
      const color = (v) => ramp(Math.max(0, Math.min(1, (Math.log10(Math.max(v, 10)) - 1) / 2.7)));
      api.legend.replaceChildren();
      const lw = 190;
      const lsvg = d3.create("svg").attr("width", lw + 90).attr("height", 28).attr("class", "chart-svg");
      const gradId = `grad-large-hubs-${t.dark ? "dark" : "light"}`;
      const grad = lsvg.append("defs").append("linearGradient").attr("id", gradId);
      d3.range(0, 1.001, 0.1).forEach((k) => grad.append("stop").attr("offset", `${Math.round(k * 100)}%`).attr("stop-color", ramp(k)));
      lsvg.append("text").attr("class", "label").attr("x", 6).attr("y", 11).text("Estimate");
      lsvg.append("rect").attr("x", 66).attr("y", 3).attr("width", lw).attr("height", 9).attr("rx", 2).attr("fill", `url(#${gradId})`);
      [
        [10, "$10M"],
        [100, "$100M"],
        [1000, "$1B"],
        [5000, "$5B"],
      ].forEach(([v, text]) => {
        lsvg.append("text").attr("class", "tick-label").attr("x", 66 + (lw * (Math.log10(v) - 1)) / 2.7).attr("y", 25).attr("text-anchor", "middle").text(text);
      });
      api.legend.append(lsvg.node());
      thin(cycles, w, 38).forEach((c) => g.append("text").attr("class", "label-muted").attr("x", x(c) + x.bandwidth() / 2).attr("y", -8).attr("text-anchor", "middle").text(c.slice(0, 4)));
      rows.forEach(([id, a]) => {
        g.append("text").attr("class", id === "DFW" ? "label-strong" : "label").attr("x", -6).attr("y", y(id) + y.bandwidth() / 2 + 4).attr("text-anchor", "end").attr("font-size", 10.5).text(id);
      });
      const cells = [];
      rows.forEach(([id, a]) => {
        cycles.forEach((c, i) => {
          cells.push({ id, a, c, i, v: a.est[i] });
        });
      });
      const cellG = g
        .selectAll("g.cell")
        .data(cells)
        .join("g")
        .attr("class", "cell mark")
        .attr("transform", (d) => `translate(${x(d.c)},${y(d.id)})`);
      cellG
        .append("rect")
        .attr("class", "fade")
        .attr("width", x.bandwidth())
        .attr("height", y.bandwidth())
        .attr("rx", 2)
        .attr("fill", (d) => (d.v ? color(d.v) : t.surface))
        .attr("stroke", (d) => (d.v ? "none" : t.grid));
      cellG
        .filter((d) => d.v >= 500 && x.bandwidth() >= 22)
        .append("text")
        .attr("x", x.bandwidth() / 2)
        .attr("y", y.bandwidth() / 2 + 3.5)
        .attr("text-anchor", "middle")
        .attr("font-size", 9.5)
        .attr("fill", (d) => inkOn(color(d.v)))
        .text((d) => num(d.v / 1000, 1));
      const dfwRow = rows.find(([id]) => id === "DFW");
      if (dfwRow) g.append("rect").attr("x", -1).attr("y", y("DFW") - 1).attr("width", w + 2).attr("height", y.bandwidth() + 2).attr("rx", 3).attr("fill", "none").attr("stroke", t.ink).attr("stroke-width", 1.8);
      cellG
        .on("pointerenter pointermove", (event, d) => {
          const prev = d.i > 0 ? d.a.est[d.i - 1] : null;
          showTip(event, {
            title: `${d.a.name} (${d.id})`,
            subtitle: `${reportLabel(d.c)} report`,
            rows: [
              { value: d.v ? money(d.v) : "not listed", label: "five-year estimate", color: d.v ? color(d.v) : null, shape: "dot", focus: true },
              prev && d.v ? { value: pct(100 * (d.v / prev - 1)), label: "change from the previous report" } : null,
            ],
          });
        })
        .on("pointerleave", hideTip);
    },
  });
  load("history").then((hist) => {
    largeHubs.rows = Object.entries(hist.airports)
      .filter(([, a]) => a.hub === 0 && a.est[last])
      .sort((a, b) => b[1].est[last] - a[1].est[last])
      .slice(0, 30);
    largeHubs.update();
  });

  const devValue = (c, i) => (view.dollars === "nominal" ? n.devmix.nominal[c][i] : n.devmix.real2023[c][i]);
  const devBars = card(document.getElementById("devmix-bars"), {
    figure: "Fig. 5a",
    title: "Need by development category in each NPIAS report",
    subtitle: "Terminal need reached 32.8% of total need in the 2025 to 2029 report, the highest share among the 12 reports",
    note: "Categories follow the narrative tables of each report. Constant prices use 2023 dollars.",
    height: (w) => Math.round(Math.max(280, Math.min(380, w * 0.36))),
    table: () => ({
      caption: `Need by development category (${view.dollars === "nominal" ? "nominal dollars" : "2023 dollars"})`,
      columns: [{ label: "Report" }, ...DEV_STACK.map((c) => ({ label: c, num: true })), { label: "Terminal share", num: true }],
      rows: cycles.map((cy, i) => {
        const total = d3.sum(DEV_STACK, (c) => devValue(c, i));
        return [reportLabel(cy), ...DEV_STACK.map((c) => ({ text: money(devValue(c, i)), sort: devValue(c, i) })), { text: pct((100 * devValue("Terminal", i)) / total, 1), sort: devValue("Terminal", i) / total }];
      }),
    }),
    render: (api, t) => {
      smallToggle(
        api,
        [
          { value: "dollars", label: "Dollars" },
          { value: "share", label: "Share" },
        ],
        view.devView,
        (v) => {
          view.devView = v;
          devBars.update();
        },
      );
      legend(api.legend, DEV_STACK.map((c) => ({ key: c, label: c, color: devColor(t, c) })), { hidden: view.devHidden, onToggle: () => devBars.update() });
      const shown = DEV_STACK.filter((c) => !view.devHidden.has(c));
      const share = view.devView === "share";
      const m = { top: 22, right: 8, bottom: 24, left: share ? 40 : 50 };
      const { g, w, h } = frame(api, m);
      const rows = cycles.map((cy, i) => {
        const full = d3.sum(DEV_STACK, (c) => devValue(c, i));
        const subtotal = d3.sum(shown, (c) => devValue(c, i));
        let acc = 0;
        const segs = shown.map((c) => {
          const raw = devValue(c, i);
          const v = share ? (100 * raw) / subtotal : raw;
          const s = { c, raw, v, y0: acc, y1: acc + v, pctOfAll: (100 * raw) / full };
          acc += v;
          return s;
        });
        return { cy, i, segs, top: acc, full };
      });
      const x = d3.scaleBand().domain(cycles).range([0, w]).paddingInner(0.34).paddingOuter(0.1);
      const y = d3.scaleLinear().domain([0, share ? 100 : d3.max(rows, (r) => r.top) || 1]).nice(5).range([h, 0]);
      band(g, x(cycles[last - 1]) - 4, x(cycles[last]) + x.bandwidth() + 4, h, { fill: t.bandPost, label: "After IIJA", labelY: -8, align: "end" });
      yAxis(g, y, { width: w, ticks: 5, format: share ? (v) => `${v}%` : (v) => (v === 0 ? "0" : money(v)) });
      xAxis(g, x, { height: h, values: thin(cycles, w, 50), format: reportShort });
      const cols = stackedColumns(g, { rows, x, y, bw: Math.min(24, x.bandwidth()), color: (s) => devColor(t, s.c), key: "cy" });
      if (!view.devHidden.has("Terminal")) {
        const lastRow = rows[last];
        const term = lastRow.segs.find((s) => s.c === "Terminal");
        if (term) {
          g.append("text")
            .attr("class", "label-strong halo fade")
            .attr("x", x(cycles[last]) + x.bandwidth() / 2)
            .attr("y", y(lastRow.top) - 6)
            .attr("text-anchor", "middle")
            .text(`${pct(term.pctOfAll, 1)} terminal`);
        }
      }
      g.append("rect")
        .attr("class", "hit")
        .attr("width", w)
        .attr("height", h)
        .on("pointermove", (event) => {
          const [mx, my] = d3.pointer(event);
          const idx = Math.max(0, Math.min(last, Math.round((mx - x(cycles[0]) - x.bandwidth() / 2) / x.step())));
          const r = rows[idx];
          cols.selectAll(".mark").classed("is-dim", function () {
            return Number(this.getAttribute("data-i")) !== idx;
          });
          const v = y.invert(my);
          const hovered = r.segs.find((s) => v >= s.y0 && v <= s.y1);
          showTip(event, {
            title: `${reportLabel(r.cy)} report`,
            subtitle: `Total ${money(r.full)} (${view.dollars === "nominal" ? "nominal" : "2023 dollars"})`,
            rows: r.segs
              .slice()
              .reverse()
              .map((s) => ({ value: share ? pct(s.v, 1) : money(s.raw), label: `${s.c}${share ? "" : ` (${pct(s.pctOfAll, 1)})`}`, color: devColor(t, s.c), shape: "dot", focus: hovered && hovered.c === s.c })),
          });
        })
        .on("pointerleave", () => {
          cols.selectAll(".mark").classed("is-dim", false);
          hideTip();
        });
    },
  });

  const typeGroups = ["All types", "Large hub", "Medium hub", "Small hub", "Nonhub", "Nonprimary", "New airport"];
  const changeRows = () =>
    n.devmix.categories
      .map((c) => {
        const recs = n.devmix.change.filter((r) => r.category_group === c && (view.typeGroup === "All types" || r.type_group === view.typeGroup));
        return { c, before: d3.sum(recs, (r) => r.real2023_2021_2025), after: d3.sum(recs, (r) => r.real2023_2025_2029), change: d3.sum(recs, (r) => r.change), recs };
      })
      .sort((a, b) => b.change - a.change);

  const devChange = card(document.getElementById("devmix-change"), {
    figure: "Fig. 5b",
    title: "Change in need by development category",
    subtitle: "2021 to 2025 report to 2025 to 2029 report, 2023 dollars",
    note: "Terminal need rose $12.9 billion, including $9.3 billion at large hubs and $2.9 billion at medium hubs, while total need rose $6.2 billion.",
    height: () => 8 * 34 + 40,
    table: () => ({
      caption: `Need by development category, ${view.typeGroup.toLowerCase()}, 2023 dollars`,
      columns: [{ label: "Category" }, { label: "2021 to 2025 report", num: true }, { label: "2025 to 2029 report", num: true }, { label: "Change", num: true }],
      rows: changeRows().map((r) => [r.c, { text: money(r.before), sort: r.before }, { text: money(r.after), sort: r.after }, { text: money(r.change), sort: r.change }]),
    }),
    render: (api, t) => {
      if (!api.tools.querySelector("select")) {
        const holder = el("div");
        select(holder, {
          options: typeGroups.map((gname) => ({ value: gname, label: gname })),
          value: view.typeGroup,
          onChange: (v) => {
            view.typeGroup = v;
            devChange.update();
          },
        });
        const s = holder.querySelector("select");
        s.setAttribute("aria-label", "Airport type");
        api.addTool(s);
      }
      const rows = changeRows();
      const total = d3.sum(rows, (r) => r.change);
      api.setSubtitle(`2021 to 2025 report to 2025 to 2029 report, 2023 dollars; net change ${money(total)}`);
      const labelW = Math.min(170, Math.max(...rows.map((r) => textWidth(r.c, 11.5))) + 12);
      const m = { top: 8, right: 12, bottom: 24, left: labelW };
      const { g, w, h } = frame(api, m);
      const y = d3.scaleBand().domain(rows.map((r) => r.c)).range([0, h]).padding(0.28);
      const ext = d3.extent([0, ...rows.map((r) => r.change)]);
      const pad = (ext[1] - ext[0]) * 0.16 || 1;
      const x = d3.scaleLinear().domain([ext[0] - (ext[0] < 0 ? pad : 0), ext[1] + pad]).nice(5).range([0, w]);
      g.append("g").attr("class", "axis").attr("transform", `translate(0,${h})`).call(d3.axisBottom(x).ticks(5).tickSize(-h).tickPadding(8).tickFormat((v) => (v === 0 ? "0" : money(v))));
      g.append("line").attr("class", "baseline").attr("x1", x(0)).attr("x2", x(0)).attr("y1", 0).attr("y2", h);
      const bh = Math.min(20, y.bandwidth());
      const rowG = g.selectAll("g.row").data(rows).join("g").attr("class", "row mark").attr("transform", (r) => `translate(0,${y(r.c) + (y.bandwidth() - bh) / 2})`);
      rowG.append("rect").attr("x", -labelW).attr("y", -(y.step() - bh) / 2).attr("width", w + labelW).attr("height", y.step()).attr("fill", "transparent");
      rowG.append("text").attr("class", "label").attr("x", -10).attr("y", bh / 2 + 4).attr("text-anchor", "end").text((r) => r.c);
      rowG
        .append("path")
        .attr("class", (r) => (r.change >= 0 ? "grow-x" : "grow-left"))
        .attr("d", (r) => (r.change >= 0 ? barPath(x(0), 0, x(r.change) - x(0), bh, 4, "right") : barPath(x(r.change), 0, x(0) - x(r.change), bh, 4, "left")))
        .attr("fill", (r) => (r.change >= 0 ? t.pos : t.neg));
      rowG
        .append("text")
        .attr("class", "label fade")
        .attr("x", (r) => (r.change >= 0 ? x(r.change) + 5 : x(r.change) - 5))
        .attr("y", bh / 2 + 4)
        .attr("text-anchor", (r) => (r.change >= 0 ? "start" : "end"))
        .text((r) => money(r.change));
      rowG
        .on("pointerenter pointermove", (event, r) => {
          rowG.classed("is-dim", (o) => o !== r);
          const parts = view.typeGroup === "All types" ? r.recs.slice().sort((a, b) => b.change - a.change).map((rec) => ({ value: money(rec.change), label: rec.type_group })) : [];
          showTip(event, {
            title: r.c,
            subtitle: `${view.typeGroup}, 2023 dollars`,
            rows: [{ value: money(r.before), label: "2021 to 2025 report" }, { value: money(r.after), label: "2025 to 2029 report" }, { value: money(r.change), label: "change", color: r.change >= 0 ? t.pos : t.neg, focus: true }, ...parts],
          });
        })
        .on("pointerleave", () => {
          rowG.classed("is-dim", false);
          hideTip();
        });
    },
  });

  const terminalByType = TYPES.map((ty) => ({
    ty,
    values: cycles.map((c) => {
      const r = n.devmix.typeMatrix.find((o) => o.category_group === "Terminal" && o.type_group === ty && o.cycle === c);
      return r ? r.value_musd_real2023 : null;
    }),
  }));
  const devTerminal = card(document.getElementById("devmix-terminal"), {
    figure: "Fig. 5c",
    title: "Terminal need by airport type",
    subtitle: "Five-year terminal need in each NPIAS report, 2023 dollars",
    note: "Terminal need at large hubs rose from $4.5 billion to $13.7 billion across the last three reports.",
    height: () => 8 * 34 + 40,
    table: () => ({
      caption: "Terminal need by airport type (2023 dollars)",
      columns: [{ label: "Report" }, ...TYPES.map((ty) => ({ label: ty, num: true }))],
      rows: cycles.map((c, i) => [reportLabel(c), ...terminalByType.map((s) => ({ text: money(s.values[i]), sort: s.values[i] ?? -1 }))]),
    }),
    render: (api, t) => {
      legend(api.legend, terminalByType.map((s, i) => ({ key: s.ty, label: s.ty, color: t.series[i], shape: "line" })), { hidden: view.typeHidden, onToggle: () => devTerminal.update() });
      const shown = terminalByType.map((s, i) => ({ ...s, slot: i })).filter((s) => !view.typeHidden.has(s.ty));
      const m = { top: 12, right: 44, bottom: 24, left: 46 };
      const { g, w, h } = frame(api, m);
      const x = d3.scalePoint().domain(cycles).range([0, w]).padding(0.3);
      const y = d3.scaleLinear().domain([0, d3.max(shown, (s) => d3.max(s.values)) || 1]).nice(5).range([h, 0]);
      g.append("rect").attr("x", x(cycles[last - 1]) - x.step() / 2).attr("width", x(cycles[last]) - x(cycles[last - 1]) + x.step()).attr("height", h).attr("fill", t.bandPost);
      yAxis(g, y, { width: w, ticks: 5, format: (v) => (v === 0 ? "0" : money(v)) });
      xAxis(g, x, { height: h, values: thin(cycles, w, 50), format: reportShort });
      shown.forEach((s) => {
        const pts = s.values.map((v, i) => ({ c: cycles[i], v })).filter((p) => p.v !== null);
        g.append("path").attr("class", "draw").attr("d", d3.line().x((p) => x(p.c)).y((p) => y(p.v))(pts)).attr("fill", "none").attr("stroke", t.series[s.slot]).attr("stroke-width", 2).attr("stroke-linejoin", "round");
        g.append("g")
          .selectAll("circle")
          .data(pts)
          .join("circle")
          .attr("class", "pop")
          .attr("cx", (p) => x(p.c))
          .attr("cy", (p) => y(p.v))
          .attr("r", 3)
          .attr("fill", t.series[s.slot])
          .attr("stroke", t.surface)
          .attr("stroke-width", 1.2);
      });
      spreadLabels(
        shown.map((s) => ({ s, y: y(s.values[last]) })),
        { minGap: 12, top: 0, bottom: h },
      ).forEach((e) => g.append("text").attr("class", "label fade").attr("x", w + 6).attr("y", e.ly + 4).text(num(e.s.values[last] / 1000, 1)));
      const hair = g.append("line").attr("class", "crosshair").attr("y1", 0).attr("y2", h).style("opacity", 0);
      g.append("rect")
        .attr("class", "hit")
        .attr("width", w)
        .attr("height", h)
        .on("pointermove", (event) => {
          const [mx] = d3.pointer(event);
          let idx = 0;
          cycles.forEach((c, i) => {
            if (Math.abs(x(c) - mx) < Math.abs(x(cycles[idx]) - mx)) idx = i;
          });
          hair.attr("x1", x(cycles[idx])).attr("x2", x(cycles[idx])).style("opacity", 1);
          showTip(event, {
            title: `${reportLabel(cycles[idx])} report`,
            subtitle: "Terminal need, 2023 dollars",
            rows: shown.map((s) => ({ value: money(s.values[idx]), label: s.ty, color: t.series[s.slot] })),
          });
        })
        .on("pointerleave", () => {
          hair.style("opacity", 0);
          hideTip();
        });
    },
  });

  const classes = card(document.getElementById("dose-classes"), {
    figure: "Fig. 6a",
    title: "Median revision by airport class",
    subtitle: "Across two report cycles before (ring) and after (dot) the IIJA",
    note: "Before: 2017 to 2021 report to 2021 to 2025 report. After: 2021 to 2025 report to 2025 to 2029 report.",
    height: () => hubs.length * 32 + 36,
    table: () => ({
      caption: "Median revision by airport class",
      columns: [{ label: "Airport class" }, { label: "Airports", num: true }, { label: "Before the IIJA", num: true }, { label: "After the IIJA", num: true }, { label: "ATP winners", num: true }],
      rows: dose.classes.map((c) => [c.hub, count(c.n), { text: pct(c.pre), sort: c.pre }, { text: pct(c.post), sort: c.post }, { text: pct(c.win), sort: c.win }]),
    }),
    render: (api, t) => {
      const labelW = Math.min(150, Math.max(...dose.classes.map((c) => textWidth(c.hub, 11.5))) + 12);
      const m = { top: 8, right: 74, bottom: 24, left: labelW };
      const { g, w, h } = frame(api, m);
      const y = d3.scaleBand().domain(dose.classes.map((c) => c.hub)).range([0, h]).padding(0.2);
      const x = d3.scaleLinear().domain([Math.min(0, d3.min(dose.classes, (c) => Math.min(c.pre, c.post))), d3.max(dose.classes, (c) => Math.max(c.pre, c.post)) * 1.05]).nice(5).range([0, w]);
      g.append("g").attr("class", "axis").attr("transform", `translate(0,${h})`).call(d3.axisBottom(x).ticks(5).tickSize(-h).tickPadding(8).tickFormat((v) => `${v}%`));
      const rowG = g.selectAll("g.row").data(dose.classes).join("g").attr("class", "row mark").attr("transform", (c) => `translate(0,${y(c.hub) + y.bandwidth() / 2})`);
      rowG.append("rect").attr("x", -labelW).attr("y", -y.step() / 2).attr("width", w + labelW + m.right).attr("height", y.step()).attr("fill", "transparent");
      rowG.append("text").attr("class", "label").attr("x", -10).attr("y", 4).attr("text-anchor", "end").text((c) => c.hub);
      rowG.append("line").attr("class", "draw").attr("x1", (c) => x(c.pre)).attr("x2", (c) => x(c.post)).attr("stroke", t.axis).attr("stroke-width", 2);
      rowG.append("circle").attr("cx", (c) => x(c.pre)).attr("r", 4.5).attr("fill", t.surface).attr("stroke", t.ink2).attr("stroke-width", 1.5);
      rowG.append("circle").attr("class", "pop").attr("cx", (c) => x(c.post)).attr("r", 5).attr("fill", t.series[0]).attr("stroke", t.surface).attr("stroke-width", 2);
      rowG.append("text").attr("class", "label fade").attr("x", w + m.right - 2).attr("y", 4).attr("text-anchor", "end").text((c) => `${pct(c.pre)} to ${pct(c.post)}`);
      rowG
        .on("pointerenter pointermove", (event, c) => {
          rowG.classed("is-dim", (o) => o !== c);
          showTip(event, {
            title: c.hub,
            subtitle: `${count(c.n)} airports`,
            rows: [
              { value: pct(c.pre, 1), label: "median revision before the IIJA" },
              { value: pct(c.post, 1), label: "median revision after the IIJA", color: t.series[0], shape: "dot" },
              { value: pct(c.win, 1), label: "received ATP awards, FY2022 to FY2024" },
            ],
          });
        })
        .on("pointerleave", () => {
          rowG.classed("is-dim", false);
          hideTip();
        });
    },
  });

  const groupsOrder = ["No ATP award", "ATP under $5M", "ATP $5M to $20M", "ATP over $20M"];
  const binned = card(document.getElementById("dose-binned"), {
    figure: "Fig. 6b",
    title: "Mean revision by ATP award size",
    subtitle: "Before (ring) and after (dot) the IIJA, with 95% confidence intervals",
    note: "Airports that later received awards above $20 million had already revised their estimates by 72% on average before the IIJA.",
    height: () => groupsOrder.length * 52 + 36,
    table: () => ({
      caption: "Mean revision by ATP award group",
      columns: [{ label: "ATP group" }, { label: "Period" }, { label: "Airports", num: true }, { label: "Mean", num: true }, { label: "95% CI", num: true }],
      rows: dose.binned.map((b) => [b.group, b.period === "pre" ? "Before the IIJA" : "After the IIJA", count(b.n), { text: pct(b.mean, 1), sort: b.mean }, `${pct(b.lo, 1)} to ${pct(b.hi, 1)}`]),
    }),
    render: (api, t) => {
      const labelW = Math.min(130, Math.max(...groupsOrder.map((gname) => textWidth(gname, 11.5))) + 12);
      const m = { top: 8, right: 14, bottom: 24, left: labelW };
      const { g, w, h } = frame(api, m);
      const y = d3.scaleBand().domain(groupsOrder).range([0, h]).padding(0.15);
      const x = d3.scaleLinear().domain([Math.min(-10, d3.min(dose.binned, (b) => b.lo)), d3.max(dose.binned, (b) => b.hi)]).nice(5).range([0, w]);
      g.append("g").attr("class", "axis").attr("transform", `translate(0,${h})`).call(d3.axisBottom(x).ticks(5).tickSize(-h).tickPadding(8).tickFormat((v) => pct(v)));
      g.append("line").attr("class", "baseline").attr("x1", x(0)).attr("x2", x(0)).attr("y1", 0).attr("y2", h);
      groupsOrder.forEach((gname) => g.append("text").attr("class", "label").attr("x", -10).attr("y", y(gname) + y.bandwidth() / 2 + 4).attr("text-anchor", "end").text(gname));
      const pts = g
        .selectAll("g.pt")
        .data(dose.binned)
        .join("g")
        .attr("class", "pt mark")
        .attr("transform", (b) => `translate(0,${y(b.group) + y.bandwidth() / 2 + (b.period === "pre" ? -9 : 9)})`);
      pts.append("rect").attr("x", (b) => x(b.lo) - 6).attr("y", -9).attr("width", (b) => x(b.hi) - x(b.lo) + 12).attr("height", 18).attr("fill", "transparent");
      pts.append("line").attr("class", "draw").attr("x1", (b) => x(b.lo)).attr("x2", (b) => x(b.hi)).attr("stroke", (b) => (b.period === "pre" ? t.ink2 : t.series[0])).attr("stroke-width", 1.5);
      pts
        .append("circle")
        .attr("class", "pop")
        .attr("cx", (b) => x(b.mean))
        .attr("r", (b) => (b.period === "pre" ? 4.5 : 5))
        .attr("fill", (b) => (b.period === "pre" ? t.surface : t.series[0]))
        .attr("stroke", (b) => (b.period === "pre" ? t.ink2 : t.surface))
        .attr("stroke-width", (b) => (b.period === "pre" ? 1.5 : 2));
      pts
        .on("pointerenter pointermove", (event, b) => {
          pts.classed("is-dim", (o) => o !== b);
          showTip(event, {
            title: b.group,
            subtitle: b.period === "pre" ? "Before the IIJA" : "After the IIJA",
            rows: [
              { value: pct(b.mean, 1), label: "mean revision", color: b.period === "pre" ? t.ink2 : t.series[0], shape: "dot", focus: true },
              { value: `${pct(b.lo, 1)} to ${pct(b.hi, 1)}`, label: "95% confidence interval" },
              { value: count(b.n), label: "airports" },
            ],
          });
        })
        .on("pointerleave", () => {
          pts.classed("is-dim", false);
          hideTip();
        });
    },
  });

  const models = [...new Set(dose.coefficients.map((c) => c.model))];
  const coefs = card(document.getElementById("dose-coefs"), {
    figure: "Fig. 6c",
    title: "Dose response coefficients",
    subtitle: "Coefficients with 95% confidence intervals; filled dots are significant at the 5% level",
    note: "Cross sections include hub class effects, the earlier estimate, and enplanements. The stacked model adds airport fixed effects, so each airport is compared with its own earlier revision. Standard errors are clustered by state.",
    height: () => dose.coefficients.length * 30 + models.length * 22 + 30,
    table: () => ({
      caption: "Dose response coefficients (Table 2 in the paper)",
      columns: [{ label: "Model" }, { label: "Term" }, { label: "Coefficient", num: true }, { label: "95% CI", num: true }, { label: "p value", num: true }, { label: "Observations", num: true }],
      rows: dose.coefficients.map((c) => [c.model, c.term, { text: num(c.coef, 2), sort: c.coef }, `${num(c.lo, 2)} to ${num(c.hi, 2)}`, { text: pValue(c.p), sort: c.p }, count(c.n)]),
    }),
    render: (api, t) => {
      const m = { top: 6, right: 70, bottom: 24, left: 96 };
      const { g, w, h } = frame(api, m);
      const rows = [];
      let yy = 0;
      models.forEach((model) => {
        rows.push({ header: model, y: yy + 14 });
        yy += 22;
        dose.coefficients
          .filter((c) => c.model === model)
          .forEach((c) => {
            rows.push({ c, y: yy + 15 });
            yy += 30;
          });
      });
      const x = d3.scaleLinear().domain([Math.min(-0.8, d3.min(dose.coefficients, (c) => c.lo)), Math.max(0.8, d3.max(dose.coefficients, (c) => c.hi))]).nice(4).range([0, w]);
      g.append("g").attr("class", "axis").attr("transform", `translate(0,${h})`).call(d3.axisBottom(x).ticks(5).tickSize(-h).tickPadding(8).tickFormat((v) => num(v, 1)));
      g.append("line").attr("class", "baseline").attr("x1", x(0)).attr("x2", x(0)).attr("y1", 0).attr("y2", h);
      rows.forEach((row) => {
        if (row.header) {
          g.append("text").attr("class", "label-strong").attr("x", -m.left).attr("y", row.y).text(row.header);
          return;
        }
        const c = row.c;
        const sig = c.p < 0.05;
        const grp = g.append("g").attr("class", "mark").attr("transform", `translate(0,${row.y})`);
        grp.append("rect").attr("x", -m.left).attr("y", -15).attr("width", w + m.left + m.right).attr("height", 30).attr("fill", "transparent");
        grp.append("text").attr("class", "label").attr("x", -10).attr("y", 4).attr("text-anchor", "end").text(c.term);
        grp.append("line").attr("class", "draw").attr("x1", x(c.lo)).attr("x2", x(c.hi)).attr("stroke", t.series[0]).attr("stroke-width", 2).attr("stroke-linecap", "round");
        grp.append("circle").attr("class", "pop").attr("cx", x(c.coef)).attr("r", 5).attr("fill", sig ? t.series[0] : t.surface).attr("stroke", sig ? t.surface : t.series[0]).attr("stroke-width", 2);
        grp.append("text").attr("class", "label").attr("x", w + m.right - 2).attr("y", 4).attr("text-anchor", "end").text(pValue(c.p));
        grp
          .on("pointerenter pointermove", (event) => {
            showTip(event, {
              title: c.term,
              subtitle: c.model,
              rows: [
                { value: num(c.coef, 3), label: "coefficient", color: t.series[0], focus: true },
                { value: `${num(c.lo, 3)} to ${num(c.hi, 3)}`, label: "95% confidence interval" },
                { value: pValue(c.p), label: sig ? "significant at 5%" : "not significant at 5%" },
                { value: count(c.n), label: "observations" },
              ],
            });
          })
          .on("pointerleave", hideTip);
      });
    },
  });

  const hubColors = (t) => ({ "Large hub": t.series[0], "Medium hub": t.series[1], "Small hub": t.series[2] });
  const Y_LO = Math.log(0.15);
  const Y_HI = Math.log(8);
  const scatter = card(document.getElementById("dose-scatter"), {
    figure: "Fig. 6d",
    title: "Hub airport revisions and ATP awards",
    subtitle: "Each circle is a large, medium, or small hub airport sized by its 2025 to 2029 estimate",
    note: "Revisions varied widely at every level of ATP funding. ATP dollars use a square root scale; revisions beyond the axis range are drawn at its edge.",
    height: (w) => Math.round(Math.max(320, Math.min(430, w * 0.74))),
    table: () => ({
      caption: "Hub airports: ATP awards and estimate revisions",
      columns: [{ label: "Airport" }, { label: "State" }, { label: "Class" }, { label: "ATP, FY2022 to FY2024", num: true }, { label: "AIG, FY2022 to FY2024", num: true }, { label: "Revision before", num: true }, { label: "Revision after", num: true }, { label: "Estimate, 2025 to 2029", num: true }],
      rows: dose.hubAirports.map((a) => [`${a.name} (${a.id})`, a.st, a.hub, { text: money(a.atp), sort: a.atp }, { text: money(a.aig), sort: a.aig }, { text: a.pre === null ? "n/a" : pct(a.pre), sort: a.pre ?? -1e9 }, { text: pct(a.chg), sort: a.chg }, { text: money(a.est), sort: a.est }]),
    }),
    render: (api, t) => {
      smallToggle(
        api,
        [
          { value: "post", label: "After IIJA" },
          { value: "pre", label: "Before IIJA" },
        ],
        view.doseY,
        (v) => {
          view.doseY = v;
          scatter.update();
        },
      );
      const colors = hubColors(t);
      legend(api.legend, Object.entries(colors).map(([k, c]) => ({ key: k, label: k, color: c, shape: "dot" })));
      const key = view.doseY === "post" ? "chg" : "pre";
      const m = { top: 10, right: 12, bottom: 34, left: 48 };
      const { g, w, h } = frame(api, m);
      const x = d3.scaleSqrt().domain([0, d3.max(dose.hubAirports, (a) => a.atp) * 1.05]).range([0, w]);
      const y = d3.scaleLinear().domain([Y_LO, Y_HI]).range([h, 0]);
      const r = d3.scaleSqrt().domain([0, d3.max(dose.hubAirports, (a) => a.est)]).range([2.5, 15]);
      g.append("g").attr("class", "axis").call(d3.axisLeft(y).tickValues([-75, -50, 0, 100, 300, 600].map((p) => Math.log(1 + p / 100))).tickSize(-w).tickPadding(8).tickFormat((v) => pct(logToPct(v))));
      g.append("g").attr("class", "axis").attr("transform", `translate(0,${h})`).call(d3.axisBottom(x).tickValues([0, 5, 20, 50, 100].filter((v) => v <= x.domain()[1])).tickSize(-h).tickPadding(8).tickFormat((v) => (v === 0 ? "0" : money(v))));
      g.append("text").attr("class", "axis-title").attr("x", w).attr("y", h + 30).attr("text-anchor", "end").text("ATP awards, FY2022 to FY2024");
      g.append("line").attr("class", "baseline").attr("x1", 0).attr("x2", w).attr("y1", y(0)).attr("y2", y(0));
      const data = dose.hubAirports
        .filter((a) => a[key] !== null && a[key] !== undefined)
        .map((a, i) => ({ a, px: x(a.atp) + (a.atp === 0 ? Math.abs(jitter(i)) * 10 : 0), py: y(Math.max(Y_LO, Math.min(Y_HI, Math.log(1 + a[key] / 100)))), rr: r(a.est) }))
        .sort((p, q) => q.rr - p.rr);
      g.append("g")
        .selectAll("circle")
        .data(data)
        .join("circle")
        .attr("class", "pop")
        .attr("cx", (d) => d.px)
        .attr("cy", (d) => d.py)
        .attr("r", (d) => d.rr)
        .attr("fill", (d) => colors[d.a.hub])
        .attr("fill-opacity", 0.85)
        .attr("stroke", t.surface)
        .attr("stroke-width", 1.5)
        .attr("pointer-events", "none");
      const placed = [];
      data.slice(0, 7).forEach((d) => {
        const text = d.a.id;
        const tw = textWidth(text, 11, 600);
        const bx = d.px + d.rr + 3;
        const box = { x0: bx, x1: bx + tw, y0: d.py - 8, y1: d.py + 4 };
        if (box.x1 > w || placed.some((b) => box.x0 < b.x1 && box.x1 > b.x0 && box.y0 < b.y1 && box.y1 > b.y0)) return;
        placed.push(box);
        g.append("text").attr("class", "label-strong halo fade").attr("x", bx).attr("y", d.py + 4).text(text);
      });
      const ring = g.append("circle").attr("fill", "none").attr("stroke", t.ink).attr("stroke-width", 2).style("opacity", 0);
      const delaunay = d3.Delaunay.from(data, (d) => d.px, (d) => d.py);
      g.append("rect")
        .attr("class", "hit")
        .attr("width", w)
        .attr("height", h)
        .on("pointermove", (event) => {
          const [mx, my] = d3.pointer(event);
          const d = data[delaunay.find(mx, my)];
          if (!d || Math.hypot(d.px - mx, d.py - my) > d.rr + 24) {
            ring.style("opacity", 0);
            hideTip();
            return;
          }
          ring.attr("cx", d.px).attr("cy", d.py).attr("r", d.rr + 3).style("opacity", 1);
          showTip(event, {
            title: `${d.a.name} (${d.a.id})`,
            subtitle: `${d.a.st} · ${d.a.hub}`,
            rows: [
              { value: money(d.a.atp), label: "ATP awards, FY2022 to FY2024", color: colors[d.a.hub], shape: "dot" },
              { value: money(d.a.aig), label: "AIG allocations, FY2022 to FY2024" },
              { value: d.a.pre === null ? "n/a" : pct(d.a.pre), label: "revision before the IIJA", focus: key === "pre" },
              { value: pct(d.a.chg), label: "revision after the IIJA", focus: key === "chg" },
              { value: money(d.a.est), label: "estimate, 2025 to 2029 report" },
            ],
          });
        })
        .on("pointerleave", () => {
          ring.style("opacity", 0);
          hideTip();
        });
    },
  });

  [totals, index, revisions, largeHubs, devBars, devChange, devTerminal, classes, binned, coefs, scatter].forEach((c) => c.render());
}
