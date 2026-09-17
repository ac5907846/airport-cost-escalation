import { load } from "../lib/data.js";
import { el, truncate } from "../lib/dom.js";
import { card, legend, frame, yAxis, xAxis, barPath, band, median, smallToggle, thin } from "../lib/chart.js";
import { segmented, search } from "../lib/controls.js";
import { showTip, hideTip } from "../lib/tooltip.js";
import { money, pct, num, count, fullDate, parseDate, monthYear } from "../lib/format.js";

const YEARS = [2015, 2016, 2017, 2018, 2019, 2020, 2021, 2022, 2023, 2024, 2025, 2026];
const PERIODS = [
  { key: "pre", label: "2016 to 2021", from: 2016, to: 2021, observed: true },
  { key: "surge", label: "2022 to 2024", from: 2022, to: 2024, observed: true },
  { key: "recent", label: "2025 to 2026", from: 2025, to: 2026, observed: false },
];
const DELIVERY = { DBB: "Design-bid-build", DB: "Design-build", CMAR: "Construction manager at risk", Staged: "Staged award" };

function share(list, test) {
  return list.length ? (100 * list.filter(test).length) / list.length : null;
}

export async function initAward() {
  const d = await load("dfw");
  const contracts = d.contracts.map((c) => ({ ...c, d: parseDate(c.date) }));
  const view = { minBase: 0, hidden: new Set(), highlight: null, timelineSort: "revised" };
  const dbb = () => contracts.filter((c) => c.delivery === "DBB" && c.base >= view.minBase);

  function periodStats(p) {
    const inPeriod = dbb().filter((c) => c.year >= p.from && c.year <= p.to);
    const sample = p.observed ? inPeriod.filter((c) => c.months >= 24) : inPeriod;
    const withBids = sample.filter((c) => c.bids !== null);
    const grown = sample.filter((c) => c.growth24 !== null);
    const baseSum = d3.sum(grown, (c) => c.base);
    return {
      n: sample.length,
      allowance: share(sample, (c) => c.allowance > 0),
      medianBids: median(withBids.map((c) => c.bids)),
      single: share(withBids, (c) => c.bids === 1),
      increased: p.observed ? share(grown, (c) => c.growth24 > 0) : null,
      dollarGrowth: p.observed && baseSum ? (100 * d3.sum(grown, (c) => (c.base * c.growth24) / 100)) / baseSum : null,
    };
  }

  const controls = document.getElementById("award-controls");
  segmented(controls, {
    label: "DBB award size",
    options: [
      { value: 0, label: "All awards" },
      { value: 1, label: "$1M and up" },
      { value: 10, label: "$10M and up" },
    ],
    value: view.minBase,
    onChange: (v) => {
      view.minBase = v;
      bids.update();
      shares.update();
      cdf.update();
    },
  });
  search(controls, {
    label: "Find a contract",
    placeholder: "Subject or contract number",
    items: contracts.map((c) => ({ id: c.no, value: c.no, label: truncate(c.subject, 70), sub: `${c.no} · ${DELIVERY[c.delivery]} · ${monthYear(c.date)} · ${money(c.base)}`, key: `${c.no} ${c.subject}`.toLowerCase() })),
    onSelect: (item) => {
      view.highlight = item.value;
      bids.update();
      timeline.update();
    },
  });

  const series = [
    { key: "award_base_musd", label: "Base awards", slot: 0 },
    { key: "allowance_musd", label: "Change order allowances at award", slot: 1 },
    { key: "increase_musd", label: "Increases to existing contracts", slot: 2 },
  ];
  const byYear = new Map(d.byYear.map((r) => [r.year, r]));

  const dollars = card(document.getElementById("dfw-dollars"), {
    figure: "Fig. 8a",
    title: "Construction dollars approved by the DFW Board",
    subtitle: "By year of the Board action; hide a series to rescale the others",
    note: "Base awards totaled $607 million in 2022, $405 million in 2023, and $1.28 billion in 2024. Increases include work packages under program contracts, which reached $1.99 billion in 2026.",
    height: (w) => Math.round(Math.max(290, Math.min(380, w * 0.66))),
    table: () => ({
      caption: "Construction dollars approved by year",
      columns: [{ label: "Year" }, { label: "Awards", num: true }, ...series.map((s) => ({ label: s.label, num: true })), { label: "Increase actions", num: true }],
      rows: YEARS.map((yr) => {
        const r = byYear.get(yr);
        return [String(yr), count(r.award_n), ...series.map((s) => ({ text: money(r[s.key]), sort: r[s.key] })), count(r.increase_n)];
      }),
    }),
    render: (api, t) => {
      legend(api.legend, series.map((s) => ({ key: s.key, label: s.label, color: t.series[s.slot] })), { hidden: view.hidden, onToggle: () => dollars.update() });
      const shown = series.filter((s) => !view.hidden.has(s.key));
      const m = { top: 16, right: 6, bottom: 24, left: 50 };
      const { g, w, h } = frame(api, m);
      const x0 = d3.scaleBand().domain(YEARS).range([0, w]).paddingInner(0.22).paddingOuter(0.08);
      const x1 = d3.scaleBand().domain(shown.map((s) => s.key)).range([0, x0.bandwidth()]).padding(0.12);
      const y = d3.scaleLinear().domain([0, d3.max(YEARS, (yr) => d3.max(shown, (s) => byYear.get(yr)[s.key])) || 1]).nice(5).range([h, 0]);
      const bw = Math.min(18, x1.bandwidth());
      const off = (x1.bandwidth() - bw) / 2;
      band(g, x0(2022) - 3, x0(2024) + x0.bandwidth() + 3, h, { fill: t.bandPost, label: "2022 to 2024", labelY: -4 });
      yAxis(g, y, { width: w, ticks: 5, format: (v) => (v === 0 ? "0" : money(v)) });
      xAxis(g, x0, { height: h, values: thin(YEARS, w, 40), format: (v) => String(v) });
      const cols = g.append("g");
      YEARS.forEach((yr) => {
        const r = byYear.get(yr);
        const col = cols.append("g").attr("class", "mark").attr("data-year", yr).attr("transform", `translate(${x0(yr)},0)`);
        shown.forEach((s) => {
          const v = r[s.key];
          col.append("path").attr("class", "grow-y").attr("d", barPath(x1(s.key) + off, y(v), bw, h - y(v), 3, "up")).attr("fill", t.series[s.slot]);
        });
      });
      g.append("rect")
        .attr("class", "hit")
        .attr("width", w)
        .attr("height", h)
        .on("pointermove", (event) => {
          const [mx] = d3.pointer(event);
          const idx = Math.max(0, Math.min(YEARS.length - 1, Math.round((mx - x0(YEARS[0]) - x0.bandwidth() / 2) / x0.step())));
          const yr = YEARS[idx];
          const r = byYear.get(yr);
          cols.selectAll(".mark").classed("is-dim", function () {
            return Number(this.getAttribute("data-year")) !== yr;
          });
          showTip(event, {
            title: String(yr),
            subtitle: `${count(r.award_n)} construction awards, ${count(r.increase_n)} increase actions`,
            rows: series.map((s) => ({ value: money(r[s.key]), label: s.label, color: t.series[s.slot], muted: view.hidden.has(s.key) })),
          });
        })
        .on("pointerleave", () => {
          cols.selectAll(".mark").classed("is-dim", false);
          hideTip();
        });
    },
  });

  const bids = card(document.getElementById("dfw-bids"), {
    figure: "Fig. 8b",
    title: "Bids received per DBB construction award",
    subtitle: "Each dot is an award; orange dots include a change order allowance",
    note: "Period medians follow the paper: awards observed for at least 24 months for 2016 to 2021 and 2022 to 2024, and all awards for 2025 and 2026.",
    height: (w) => Math.round(Math.max(310, Math.min(400, w * 0.7))),
    table: () => ({
      caption: "DBB construction awards with a bid count",
      columns: [{ label: "Award date" }, { label: "Contract" }, { label: "Subject" }, { label: "Bids", num: true }, { label: "Base award", num: true }, { label: "Allowance", num: true }, { label: "Net change within 24 months", num: true }],
      rows: dbb()
        .filter((c) => c.bids !== null)
        .map((c) => [{ text: c.date, sort: c.d.getTime() }, c.no, c.subject, { text: String(c.bids), sort: c.bids }, { text: money(c.base), sort: c.base }, { text: c.allowance > 0 ? `${money(c.allowance)} (${pct(c.allowShare)})` : "none", sort: c.allowance }, { text: c.growth24 === null ? "not yet observed" : pct(c.growth24, 1), sort: c.growth24 ?? -1e9 }]),
    }),
    render: (api, t) => {
      legend(api.legend, [
        { key: "allow", label: "With change order allowance", color: t.series[1], shape: "dot" },
        { key: "none", label: "Without allowance", color: t.other, shape: "dot" },
        { key: "median", label: "Median for the year", color: t.ink, shape: "line" },
      ]);
      const list = dbb().filter((c) => c.bids !== null);
      const m = { top: 32, right: 8, bottom: 24, left: 34 };
      const { g, w, h } = frame(api, m);
      const x = d3.scaleBand().domain(YEARS).range([0, w]).padding(0.08);
      const maxBids = Math.max(8, d3.max(list, (c) => c.bids) || 1);
      const y = d3.scaleLinear().domain([0, maxBids + 0.6]).range([h, 0]);
      const r = Math.max(2.6, Math.min(4.6, x.bandwidth() / 11));
      PERIODS.forEach((p, i) => {
        const xa = x(p.from) - 2;
        const xb = x(p.to) + x.bandwidth() + 2;
        if (i === 1) band(g, xa, xb, h, { fill: t.bandPost });
        const st = periodStats(p);
        g.append("text").attr("class", "label").attr("x", (xa + xb) / 2).attr("y", -18).attr("text-anchor", "middle").text(p.label);
        g.append("text").attr("class", "label-strong").attr("x", (xa + xb) / 2).attr("y", -4).attr("text-anchor", "middle").text(`median ${st.medianBids === null ? "n/a" : num(st.medianBids, st.medianBids % 1 ? 1 : 0)} bids`);
      });
      yAxis(g, y, { width: w, values: d3.range(0, maxBids + 1, maxBids > 10 ? 2 : 1), format: (v) => String(v) });
      xAxis(g, x, { height: h, values: thin(YEARS, w, 40), format: (v) => String(v) });
      const pts = [];
      YEARS.forEach((yr) => {
        const inYear = list.filter((c) => c.year === yr);
        d3.groups(inYear, (c) => c.bids).forEach(([k, cell]) => {
          cell.sort((a, b2) => b2.base - a.base);
          const perRow = Math.max(1, Math.floor(x.bandwidth() / (2 * r + 1)));
          cell.forEach((c, i) => {
            const row = Math.floor(i / perRow);
            const col = i % perRow;
            const inRow = Math.min(perRow, cell.length - row * perRow);
            pts.push({ c, px: x(yr) + x.bandwidth() / 2 + (col - (inRow - 1) / 2) * (2 * r + 1), py: y(k) - row * (2 * r + 1) * 0.55 });
          });
        });
        const med = median(inYear.map((c) => c.bids));
        if (med !== null) g.append("line").attr("class", "fade").attr("x1", x(yr) + 2).attr("x2", x(yr) + x.bandwidth() - 2).attr("y1", y(med)).attr("y2", y(med)).attr("stroke", t.ink).attr("stroke-width", 2).attr("stroke-linecap", "round");
      });
      g.append("g")
        .selectAll("circle")
        .data(pts)
        .join("circle")
        .attr("class", "pop")
        .attr("cx", (p) => p.px)
        .attr("cy", (p) => p.py)
        .attr("r", r)
        .attr("fill", (p) => (p.c.allowance > 0 ? t.series[1] : t.other))
        .attr("stroke", t.surface)
        .attr("stroke-width", 1);
      const hl = pts.find((p) => p.c.no === view.highlight);
      if (hl) {
        g.append("circle").attr("cx", hl.px).attr("cy", hl.py).attr("r", r + 4).attr("fill", "none").attr("stroke", t.ink).attr("stroke-width", 2);
        g.append("text").attr("class", "label-strong halo").attr("x", Math.min(w - 4, hl.px + r + 6)).attr("y", hl.py - 8).attr("text-anchor", hl.px > w - 120 ? "end" : "start").text(truncate(hl.c.subject, 34));
      }
      const ring = g.append("circle").attr("fill", "none").attr("stroke", t.ink).attr("stroke-width", 2).style("opacity", 0);
      const delaunay = d3.Delaunay.from(pts, (p) => p.px, (p) => p.py);
      g.append("rect")
        .attr("class", "hit")
        .attr("width", w)
        .attr("height", h)
        .on("pointermove", (event) => {
          const [mx, my] = d3.pointer(event);
          const p = pts[delaunay.find(mx, my)];
          if (!p || Math.hypot(p.px - mx, p.py - my) > 18) {
            ring.style("opacity", 0);
            hideTip();
            return;
          }
          ring.attr("cx", p.px).attr("cy", p.py).attr("r", r + 3).style("opacity", 1);
          const c = p.c;
          showTip(event, {
            title: c.subject,
            subtitle: `Contract ${c.no} · awarded ${fullDate(c.date)}`,
            rows: [
              { value: String(c.bids), label: c.bids === 1 ? "bid received" : "bids received", focus: true },
              { value: money(c.base), label: "base award" },
              { value: c.allowance > 0 ? `${money(c.allowance)} (${pct(c.allowShare)})` : "none", label: "change order allowance", color: c.allowance > 0 ? t.series[1] : null, shape: "dot" },
              { value: c.growth24 === null ? "not yet observed" : pct(c.growth24, 1), label: "net change within 24 months" },
            ],
          });
        })
        .on("pointerleave", () => {
          ring.style("opacity", 0);
          hideTip();
        });
    },
  });

  function yearlyShares() {
    return YEARS.map((yr) => {
      const list = dbb().filter((c) => c.year === yr);
      const observed = list.filter((c) => c.growth24 !== null);
      return { yr, n: list.length, nObs: observed.length, allowance: share(list, (c) => c.allowance > 0), increased: yr >= 2025 || !observed.length ? null : share(observed, (c) => c.growth24 > 0) };
    });
  }

  const shares = card(document.getElementById("dfw-shares"), {
    figure: "Fig. 8c",
    title: "DBB awards with allowances or increases",
    subtitle: "Share of DBB awards with a change order allowance at award and share increased within 24 months",
    note: "",
    height: (w) => Math.round(Math.max(290, Math.min(380, w * 0.66))),
    table: () => ({
      caption: "Share of DBB construction awards by year",
      columns: [{ label: "Year" }, { label: "Awards", num: true }, { label: "With allowance", num: true }, { label: "Observed 24 months", num: true }, { label: "Increased within 24 months", num: true }],
      rows: yearlyShares().map((r) => [String(r.yr), count(r.n), { text: r.allowance === null ? "n/a" : pct(r.allowance), sort: r.allowance ?? -1 }, count(r.nObs), { text: r.increased === null ? "not yet observable" : pct(r.increased), sort: r.increased ?? -1 }]),
    }),
    render: (api, t) => {
      const kinds = [
        { key: "allowance", label: "Change order allowance at award", slot: 1 },
        { key: "increased", label: "Increased within 24 months", slot: 2 },
      ];
      legend(api.legend, kinds.map((k) => ({ key: k.key, label: k.label, color: t.series[k.slot] })));
      const stats = PERIODS.map((p) => ({ p, s: periodStats(p) }));
      api.setNote(
        `${stats
          .map(({ p, s }) => `${p.label}: ${pct(s.allowance)} with allowances, ${pct(s.single)} single bid${s.increased === null ? "" : `, ${pct(s.increased)} increased within 24 months (net ${pct(s.dollarGrowth, 1)} of base awards)`}`)
          .join(". ")}. Awards in 2025 and 2026 are not yet observable for 24 months.`,
      );
      const rows = yearlyShares();
      const m = { top: 12, right: 6, bottom: 24, left: 40 };
      const { g, w, h } = frame(api, m);
      const x0 = d3.scaleBand().domain(YEARS).range([0, w]).paddingInner(0.24).paddingOuter(0.08);
      const x1 = d3.scaleBand().domain(kinds.map((k) => k.key)).range([0, x0.bandwidth()]).padding(0.1);
      const top = Math.max(70, d3.max(rows, (r) => Math.max(r.allowance ?? 0, r.increased ?? 0)));
      const y = d3.scaleLinear().domain([0, top]).nice(5).range([h, 0]);
      band(g, x0(2022) - 3, x0(2024) + x0.bandwidth() + 3, h, { fill: t.bandPost, label: "2022 to 2024", labelY: 12 });
      yAxis(g, y, { width: w, ticks: 6, format: (v) => `${v}%` });
      xAxis(g, x0, { height: h, values: thin(YEARS, w, 40), format: (v) => String(v) });
      const bw = Math.min(16, x1.bandwidth());
      const cols = g.append("g");
      rows.forEach((r) => {
        const col = cols.append("g").attr("class", "mark").attr("data-year", r.yr).attr("transform", `translate(${x0(r.yr)},0)`);
        kinds.forEach((k) => {
          const v = r[k.key];
          const bx = x1(k.key) + (x1.bandwidth() - bw) / 2;
          if (v === null) {
            col.append("text").attr("class", "label-muted").attr("x", bx + bw / 2).attr("y", h - 4).attr("text-anchor", "middle").attr("font-size", 9).text("n/o");
          } else if (v === 0) {
            col.append("text").attr("class", "label-muted").attr("x", bx + bw / 2).attr("y", h - 4).attr("text-anchor", "middle").attr("font-size", 9).text("0");
          } else {
            col.append("path").attr("class", "grow-y").attr("d", barPath(bx, y(v), bw, h - y(v), 3, "up")).attr("fill", t.series[k.slot]);
          }
        });
      });
      g.append("rect")
        .attr("class", "hit")
        .attr("width", w)
        .attr("height", h)
        .on("pointermove", (event) => {
          const [mx] = d3.pointer(event);
          const idx = Math.max(0, Math.min(YEARS.length - 1, Math.round((mx - x0(YEARS[0]) - x0.bandwidth() / 2) / x0.step())));
          const r = rows[idx];
          cols.selectAll(".mark").classed("is-dim", function () {
            return Number(this.getAttribute("data-year")) !== r.yr;
          });
          showTip(event, {
            title: String(r.yr),
            subtitle: `${count(r.n)} DBB awards, ${count(r.nObs)} observed for 24 months`,
            rows: [
              { value: r.allowance === null ? "n/a" : pct(r.allowance), label: "with a change order allowance", color: t.series[1] },
              { value: r.increased === null ? "not yet observable" : pct(r.increased), label: "increased within 24 months", color: t.series[2] },
            ],
          });
        })
        .on("pointerleave", () => {
          cols.selectAll(".mark").classed("is-dim", false);
          hideTip();
        });
    },
  });

  const cdf = card(document.getElementById("dfw-cdf"), {
    figure: "Fig. 8d",
    title: "Net change within 24 months of award",
    subtitle: "Cumulative share of DBB awards observed for at least 24 months, by net change as a share of the base award",
    note: "Most awards had no net change within 24 months in both periods. The dollar-weighted net change was 1.6% of base awards for 2016 to 2021 and 2.9% for 2022 to 2024.",
    height: (w) => Math.round(Math.max(290, Math.min(380, w * 0.66))),
    table: () => ({
      caption: "Distribution of net change within 24 months",
      columns: [{ label: "Period" }, { label: "Awards", num: true }, { label: "Decreased", num: true }, { label: "No change", num: true }, { label: "Increased", num: true }, { label: "Median", num: true }],
      rows: PERIODS.filter((p) => p.observed).map((p) => {
        const v = dbb().filter((c) => c.year >= p.from && c.year <= p.to && c.growth24 !== null).map((c) => c.growth24);
        return [p.label, count(v.length), pct(share(v, (x) => x < 0)), pct(share(v, (x) => x === 0)), pct(share(v, (x) => x > 0)), pct(median(v), 1)];
      }),
    }),
    render: (api, t) => {
      const groups = [
        { p: PERIODS[0], color: t.ink2, label: "Awarded 2016 to 2021" },
        { p: PERIODS[1], color: t.series[1], label: "Awarded 2022 to 2024" },
      ].map((gr) => {
        const values = dbb()
          .filter((c) => c.year >= gr.p.from && c.year <= gr.p.to && c.growth24 !== null)
          .map((c) => Math.max(-30, Math.min(60, c.growth24)))
          .sort((a, b2) => a - b2);
        return { ...gr, values };
      });
      legend(api.legend, groups.map((gr) => ({ key: gr.label, label: `${gr.label} (n = ${gr.values.length})`, color: gr.color, shape: "line" })));
      const m = { top: 12, right: 12, bottom: 34, left: 40 };
      const { g, w, h } = frame(api, m);
      const x = d3.scaleLinear().domain([-30, 60]).range([0, w]);
      const y = d3.scaleLinear().domain([0, 1]).range([h, 0]);
      yAxis(g, y, { width: w, values: [0, 0.25, 0.5, 0.75, 1], format: (v) => `${Math.round(v * 100)}%` });
      g.append("g").attr("class", "axis").attr("transform", `translate(0,${h})`).call(d3.axisBottom(x).tickValues([-30, -15, 0, 15, 30, 45, 60]).tickSize(-h).tickPadding(8).tickFormat((v) => `${v === -30 ? "≤ " : v === 60 ? "≥ " : ""}${pct(v)}`));
      g.append("text").attr("class", "axis-title").attr("x", w / 2).attr("y", h + 30).attr("text-anchor", "middle").text("Net change within 24 months, percent of base award");
      g.append("line").attr("class", "baseline").attr("x1", x(0)).attr("x2", x(0)).attr("y1", 0).attr("y2", h);
      const stepFn = (values) => {
        const pts = [[-30, 0]];
        values.forEach((v, i) => {
          pts.push([v, i / values.length], [v, (i + 1) / values.length]);
        });
        pts.push([60, 1]);
        return pts;
      };
      groups.forEach((gr) => {
        if (!gr.values.length) return;
        g.append("path").attr("class", "draw").attr("d", d3.line().x((p) => x(p[0])).y((p) => y(p[1]))(stepFn(gr.values))).attr("fill", "none").attr("stroke", gr.color).attr("stroke-width", 2).attr("stroke-linejoin", "round");
      });
      const hair = g.append("line").attr("class", "crosshair").attr("y1", 0).attr("y2", h).style("opacity", 0);
      g.append("rect")
        .attr("class", "hit")
        .attr("width", w)
        .attr("height", h)
        .on("pointermove", (event) => {
          const [mx] = d3.pointer(event);
          const v = Math.round(x.invert(mx));
          hair.attr("x1", x(v)).attr("x2", x(v)).style("opacity", 1);
          showTip(event, {
            title: `Net change of ${pct(v)} or less`,
            rows: groups.map((gr) => ({ value: gr.values.length ? pct((100 * gr.values.filter((q) => q <= v).length) / gr.values.length) : "n/a", label: `of awards, ${gr.label.toLowerCase()}`, color: gr.color })),
          });
        })
        .on("pointerleave", () => {
          hair.style("opacity", 0);
          hideTip();
        });
    },
  });

  const timeline = card(document.getElementById("dfw-timeline"), {
    figure: "Fig. 8e",
    title: "The largest contracts from award to latest approved amount",
    subtitle: "Circles are Board actions sized by amount; labels show the latest approved amount and the base award",
    note: "Terminal F and Skylink Station rose from a base award of $855 million to $2.06 billion, and the Terminal C renovations under construction manager at risk rose from $34 million to $1.05 billion. Construction amounts under these delivery methods were approved after the initial award and are not part of the DBB measures.",
    height: () => d.timeline.length * 34 + 44,
    table: () => ({
      caption: "Board actions for the largest contracts",
      columns: [{ label: "Contract" }, { label: "Delivery" }, { label: "Date" }, { label: "Action" }, { label: "Amount", num: true }, { label: "Revised amount", num: true }],
      rows: d.timeline.flatMap((c) => c.actions.map((a) => [`${c.subject} (${c.no})`, DELIVERY[c.delivery], { text: a.date, sort: a.date }, a.type, { text: money(a.amount), sort: a.amount }, { text: a.revised === null ? "" : money(a.revised), sort: a.revised ?? 0 }])),
    }),
    render: (api, t) => {
      smallToggle(
        api,
        [
          { value: "revised", label: "Latest amount" },
          { value: "growth", label: "Growth" },
        ],
        view.timelineSort,
        (v) => {
          view.timelineSort = v;
          timeline.update();
        },
      );
      const types = [
        { key: "award", label: "Award", slot: 0 },
        { key: "increase", label: "Increase", slot: 1 },
        { key: "decrease", label: "Decrease", slot: 2 },
      ];
      legend(api.legend, types.map((ty) => ({ key: ty.key, label: ty.label, color: t.series[ty.slot], shape: "dot" })));
      const rows = d.timeline.slice().sort((a, b2) => (view.timelineSort === "revised" ? b2.revised - a.revised : b2.revised / b2.base - a.revised / a.base));
      const narrow = api.width < 560;
      const labelW = narrow ? 130 : Math.min(290, api.width * 0.28);
      const m = { top: 8, right: narrow ? 92 : 120, bottom: 24, left: labelW };
      const { g, w, h } = frame(api, m);
      const x = d3.scaleTime().domain([new Date(2018, 0, 1), new Date(2026, 11, 31)]).range([0, w]);
      const y = d3.scaleBand().domain(rows.map((c) => c.no)).range([0, h]).padding(0.2);
      const amount = d3.scaleSqrt().domain([0, d3.max(d.timeline, (c) => d3.max(c.actions, (a) => Math.abs(a.amount)))]).range([3, 13]);
      g.append("g").attr("class", "axis").attr("transform", `translate(0,${h})`).call(d3.axisBottom(x).ticks(d3.timeYear.every(narrow ? 2 : 1)).tickSize(-h).tickPadding(8).tickFormat(d3.timeFormat(narrow ? "%y" : "%Y")));
      band(g, x(new Date(2022, 0, 1)), x(new Date(2024, 11, 31)), h, { fill: t.bandPost });
      const rowG = g.selectAll("g.row").data(rows).join("g").attr("class", "row mark").attr("transform", (c) => `translate(0,${y(c.no) + y.bandwidth() / 2})`);
      rowG.append("rect").attr("x", -labelW).attr("y", -y.step() / 2).attr("width", w + labelW + m.right).attr("height", y.step()).attr("fill", (c) => (c.no === view.highlight ? t.bandPost : "transparent"));
      rowG.append("text").attr("class", "label").attr("x", -10).attr("y", 0).attr("text-anchor", "end").text((c) => truncate(c.subject.replace(" - Construction Manager at Risk", ""), narrow ? 20 : 44));
      rowG.append("text").attr("class", "label-muted").attr("x", -10).attr("y", 12).attr("text-anchor", "end").text((c) => `${c.delivery} · ${c.no}`);
      rowG.each(function (c) {
        const row = d3.select(this);
        const dates = c.actions.map((a) => parseDate(a.date));
        row.append("line").attr("class", "draw").attr("x1", x(d3.min(dates))).attr("x2", x(d3.max(dates))).attr("stroke", t.axis).attr("stroke-width", 2).attr("stroke-linecap", "round");
        c.actions.forEach((a) => {
          const ty = types.find((o) => o.key === a.type) || types[0];
          row
            .append("circle")
            .attr("class", "pop")
            .attr("cx", x(parseDate(a.date)))
            .attr("r", amount(Math.abs(a.amount)))
            .attr("fill", t.series[ty.slot])
            .attr("fill-opacity", 0.88)
            .attr("stroke", t.surface)
            .attr("stroke-width", 1.5)
            .on("pointerenter pointermove", (event) => {
              showTip(event, {
                title: c.subject,
                subtitle: `${DELIVERY[c.delivery]} · contract ${c.no}`,
                rows: [
                  { value: money(a.amount), label: `${ty.label.toLowerCase()} on ${fullDate(a.date)}`, color: t.series[ty.slot], shape: "dot", focus: true },
                  a.revised !== null ? { value: money(a.revised), label: "revised contract amount" } : null,
                  { value: money(c.base), label: "base award" },
                  { value: money(c.revised), label: "latest approved amount" },
                ],
              });
            })
            .on("pointerleave", hideTip);
        });
        row.append("text").attr("class", "label-strong fade").attr("x", w + m.right - 2).attr("y", 0).attr("text-anchor", "end").text(money(c.revised));
        row.append("text").attr("class", "label-muted fade").attr("x", w + m.right - 2).attr("y", 12).attr("text-anchor", "end").text(`from ${money(c.base)}`);
      });
    },
  });

  [dollars, bids, shares, cdf, timeline].forEach((c) => c.render());
}
