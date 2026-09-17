import { load } from "../lib/data.js";
import { el } from "../lib/dom.js";
import { card, legend, frame, yAxis, xAxis, band, spreadLabels, textWidth, median, jitter, smallToggle } from "../lib/chart.js";
import { segmented, chips, toggle } from "../lib/controls.js";
import { showTip, hideTip } from "../lib/tooltip.js";
import { tokens, onTheme } from "../lib/theme.js";
import { money, pct, num, numTrim, count, fullDate, parseDate, pValue } from "../lib/format.js";

const PPI_SLOT = { WPUIP2312311: 1, PCU324121324121: 2, WPUSI012011: 3, PCU327320327320: 4, WPUIP2312001: 5 };
// fixed hue order, so a state keeps its colour no matter which states the filter leaves on screen
const STATE_ORDER = ["TN", "SC", "WI", "GA", "KY", "AK", "IL", "OR", "VT", "WY"];
const STATE_SLOT = Object.fromEntries(STATE_ORDER.map((s, i) => [s, i % 8]));
const STATE_NAME = { AK: "Alaska", GA: "Georgia", IL: "Illinois", KY: "Kentucky", OR: "Oregon",
  SC: "South Carolina", TN: "Tennessee", VT: "Vermont", WI: "Wisconsin", WY: "Wyoming" };
const RATIO_TICKS = [0.4, 0.6, 0.8, 1, 1.25, 1.5, 2, 3];

function periodMean(spec) {
  if (spec.mean2225 !== undefined && spec.mean2225 !== null) return spec.mean2225;
  const v = spec.points.filter((p) => p.year >= 2022 && p.year <= 2025).map((p) => p.index);
  return v.length ? v.reduce((a, b) => a + b, 0) / v.length : null;
}

export async function initBids() {
  const b = await load("bids");
  const highway = b.ppi.find((p) => p.key === "WPUIP2312311");
  const highwayMean = d3.mean(highway.points.filter((p) => p.year >= 2022 && p.year <= 2025), (p) => p.index);
  const view = { spec: "baseline", ppiHidden: new Set(["WPUSI012011", "PCU327320327320", "WPUIP2312001"]), specHidden: false, states: new Set(), sizeBy: "estimate", rolling: true, domain: null, famSort: "median", bidderView: "time" };
  const spec = () => b.specs.find((s) => s.key === view.spec);
  const projectsAll = b.projects.map((p) => ({ ...p, d: parseDate(p.date) }));
  const withRatio = projectsAll.filter((p) => p.ratio !== null && p.d);
  // the first two panels describe the projects that carry an engineer estimate, so only those states are offered
  const estimateStates = STATE_ORDER.filter((s) => s !== "WY" && withRatio.some((p) => p.st === s));
  if (!view.states.size) estimateStates.forEach((s) => view.states.add(s));

  const controls = document.getElementById("project-controls");
  const stateChips = chips(controls, {
    label: "States",
    options: estimateStates.map((s) => ({ value: s, label: STATE_NAME[s] })),
    values: view.states,
    onChange: (vals) => {
      view.states = vals;
      projects.update();
      bidders.update();
    },
  });
  const paintChips = () => {
    const t = tokens();
    estimateStates.forEach((s) => stateChips.setColor(s, t.series[STATE_SLOT[s]]));
  };
  paintChips();
  onTheme(paintChips);
  segmented(controls, {
    label: "Circle size",
    options: [
      { value: "estimate", label: "Engineer’s estimate" },
      { value: "items", label: "Line items" },
    ],
    value: view.sizeBy,
    onChange: (v) => {
      view.sizeBy = v;
      projects.update();
    },
  });
  toggle(controls, {
    label: "12-month rolling median",
    checked: view.rolling,
    onChange: (on) => {
      view.rolling = on;
      projects.update();
    },
  });

  function rollingMedian(list) {
    const sorted = list.slice().sort((a, c) => a.d - c.d);
    if (!sorted.length) return [];
    const out = [];
    const start = new Date(sorted[0].d.getFullYear(), sorted[0].d.getMonth() + 11, 1);
    const end = sorted[sorted.length - 1].d;
    for (let d = start; d <= end; d = new Date(d.getFullYear(), d.getMonth() + 1, 1)) {
      const from = new Date(d.getFullYear(), d.getMonth() - 12, d.getDate());
      const win = sorted.filter((p) => p.d > from && p.d <= d).map((p) => p.ratio);
      if (win.length >= 6) out.push({ d, v: median(win), n: win.length });
    }
    return out;
  }

  const projects = card(document.getElementById("bid-projects"), {
    figure: "Fig. 7a",
    title: "Low bid relative to the engineer’s estimate",
    subtitle: "Each circle is a project; drag across the strip below the chart to zoom into a period, double click it to reset",
    note: "Ratios outside .3 to 3.5 are excluded as likely mismatches between the tabulated scope and the estimate. The 12-month rolling median uses Tennessee and South Carolina projects; it rose above 1 in early 2022.",
    height: (w) => Math.round(Math.max(340, Math.min(440, w * 0.64))),
    table: () => ({
      caption: "Projects with a low bid and an engineer’s estimate",
      columns: [{ label: "Bid date" }, { label: "State" }, { label: "Airport" }, { label: "Project" }, { label: "Bidders", num: true }, { label: "Estimate", num: true }, { label: "Low bid", num: true }, { label: "Ratio", num: true }],
      rows: withRatio
        .filter((p) => view.states.has(p.st))
        .map((p) => [{ text: p.date, sort: p.d.getTime() }, p.st, p.airport, p.name || "", { text: p.bidders === null ? "n/a" : String(p.bidders), sort: p.bidders ?? -1 }, { text: money(p.estimate), sort: p.estimate }, { text: money(p.low), sort: p.low }, { text: num(p.ratio, 2), sort: p.ratio }]),
    }),
    render: (api, t) => {
      const data = withRatio.filter((p) => view.states.has(p.st));
      legend(api.legend, estimateStates.filter((s) => view.states.has(s)).map((s) => ({ key: s, label: STATE_NAME[s], color: t.series[STATE_SLOT[s]], shape: "dot" })));
      const contextH = 46;
      const m = { top: 10, right: 12, bottom: 30 + contextH, left: 42 };
      const { g, w, h } = frame(api, m);
      const fullDomain = [new Date(2019, 0, 1), new Date(2026, 8, 1)];
      const x = d3.scaleTime().domain(view.domain || fullDomain).range([0, w]);
      const y = d3.scaleLog().domain([0.3, 3.5]).range([h, 0]);
      const r = view.sizeBy === "estimate" ? d3.scaleSqrt().domain([0, d3.max(withRatio, (p) => p.estimate)]).range([2.5, 14]) : d3.scaleSqrt().domain([0, d3.max(withRatio, (p) => p.items)]).range([2.5, 13]);
      const clipId = `clip-proj-${Math.round(Math.random() * 1e9)}`;
      api.svg.append("defs").append("clipPath").attr("id", clipId).append("rect").attr("x", -14).attr("width", w + 28).attr("height", h);
      band(g, Math.max(0, x(new Date(2022, 0, 1))), Math.min(w, x(new Date(2025, 11, 31))), h, { fill: t.bandPost });
      yAxis(g, y, { width: w, values: RATIO_TICKS, format: (v) => numTrim(v, 2) });
      g.append("g").attr("class", "axis no-grid").attr("transform", `translate(0,${h})`).call(d3.axisBottom(x).ticks(w < 460 ? 4 : 8).tickSize(4).tickPadding(6));
      g.append("line").attr("class", "baseline").attr("x1", 0).attr("x2", w).attr("y1", y(1)).attr("y2", y(1)).attr("stroke-width", 1.5);
      g.append("text").attr("class", "label-muted").attr("x", 4).attr("y", y(1) - 5).text("Low bid equals estimate");
      const plot = g.append("g").attr("clip-path", `url(#${clipId})`);
      const pts = data.map((p) => ({ p, px: x(p.d), py: y(Math.max(0.3, Math.min(3.5, p.ratio))), rr: r(view.sizeBy === "estimate" ? p.estimate : p.items) })).sort((a, c) => c.rr - a.rr);
      plot
        .selectAll("circle")
        .data(pts)
        .join("circle")
        .attr("class", "pop")
        .attr("cx", (d) => d.px)
        .attr("cy", (d) => d.py)
        .attr("r", (d) => d.rr)
        .attr("fill", (d) => t.series[STATE_SLOT[d.p.st]])
        .attr("fill-opacity", 0.78)
        .attr("stroke", t.surface)
        .attr("stroke-width", 1.2);
      if (view.rolling) {
        const roll = rollingMedian(withRatio.filter((p) => p.st !== "WY"));
        plot
          .append("path")
          .attr("class", "draw")
          .attr("d", d3.line().x((d) => x(d.d)).y((d) => y(d.v)).curve(d3.curveMonotoneX)(roll))
          .attr("fill", "none")
          .attr("stroke", t.ink)
          .attr("stroke-width", 2.5)
          .attr("stroke-linejoin", "round");
        const lastRoll = roll.filter((d) => d.d <= x.domain()[1]).pop();
        if (lastRoll) g.append("text").attr("class", "label-strong halo fade").attr("x", Math.min(w - 4, x(lastRoll.d))).attr("y", y(lastRoll.v) - 10).attr("text-anchor", "end").text("Rolling median");
      }
      const ring = g.append("circle").attr("fill", "none").attr("stroke", t.ink).attr("stroke-width", 2).style("opacity", 0);
      const visiblePts = pts.filter((d) => d.px >= -2 && d.px <= w + 2);
      const delaunay = d3.Delaunay.from(visiblePts, (d) => d.px, (d) => d.py);
      g.append("rect")
        .attr("class", "hit")
        .attr("width", w)
        .attr("height", h)
        .on("pointermove", (event) => {
          const [mx, my] = d3.pointer(event);
          const d = visiblePts[delaunay.find(mx, my)];
          if (!d || Math.hypot(d.px - mx, d.py - my) > d.rr + 20) {
            ring.style("opacity", 0);
            hideTip();
            return;
          }
          ring.attr("cx", d.px).attr("cy", d.py).attr("r", d.rr + 3).style("opacity", 1);
          const p = d.p;
          showTip(event, {
            title: p.name || `Project at ${p.airport}`,
            subtitle: `${p.airport} · ${STATE_NAME[p.st]} · bid ${fullDate(p.date)}`,
            rows: [
              { value: num(p.ratio, 2), label: "low bid relative to estimate", color: t.series[STATE_SLOT[p.st]], shape: "dot", focus: true },
              { value: money(p.estimate), label: "engineer’s estimate" },
              { value: money(p.low), label: "low bid" },
              { value: p.bidders === null ? "n/a" : String(p.bidders), label: "bidders" },
              { value: count(p.items), label: "line items" },
            ],
          });
        })
        .on("pointerleave", () => {
          ring.style("opacity", 0);
          hideTip();
        });

      const cg = g.append("g").attr("transform", `translate(0,${h + 30})`);
      const cx = d3.scaleTime().domain(fullDomain).range([0, w]);
      const cy = d3.scaleLog().domain([0.3, 3.5]).range([contextH - 14, 0]);
      cg.append("rect").attr("width", w).attr("height", contextH - 14).attr("rx", 6).attr("fill", t.bandPre);
      cg.selectAll("circle")
        .data(data)
        .join("circle")
        .attr("cx", (p) => cx(p.d))
        .attr("cy", (p) => cy(p.ratio))
        .attr("r", 1.8)
        .attr("fill", (p) => t.series[STATE_SLOT[p.st]])
        .attr("fill-opacity", 0.7);
      cg.append("g").attr("class", "axis no-grid").attr("transform", `translate(0,${contextH - 14})`).call(d3.axisBottom(cx).ticks(w < 460 ? 4 : 8).tickSize(0).tickPadding(4));
      const brush = d3
        .brushX()
        .extent([[0, 0], [w, contextH - 14]])
        .on("end", (event) => {
          if (!event.sourceEvent) return;
          if (!event.selection) view.domain = null;
          else {
            const [a, c] = event.selection.map(cx.invert);
            view.domain = c - a < 1000 * 3600 * 24 * 60 ? null : [a, c];
          }
          projects.render();
        });
      const brushG = cg.append("g").attr("class", "brush").call(brush);
      brushG.selectAll(".selection").attr("fill", t.accent).attr("fill-opacity", 0.15).attr("stroke", t.accent);
      if (view.domain) brushG.call(brush.move, view.domain.map(cx));
      brushG.on("dblclick", () => {
        view.domain = null;
        projects.update();
      });
    },
  });

  const tnsc = withRatio.filter((p) => p.st !== "WY" && p.bidders !== null && p.bidders >= 1);
  const bidderCounts = d3.range(b.bidderModel.bidderRange[0], b.bidderModel.bidderRange[1] + 1);
  const perYear = d3
    .rollups(
      projectsAll.filter((p) => p.st !== "WY" && p.bidders !== null && p.bidders >= 1 && p.year),
      (v) => ({ mean: d3.mean(v, (p) => p.bidders), n: v.length }),
      (p) => p.year,
    )
    .map(([year, s]) => ({ year, ...s }))
    .sort((a, c) => a.year - c.year);
  const effect = 100 * (1 - Math.exp(b.bidderModel.coef));

  const bidders = card(document.getElementById("bid-bidders"), {
    figure: "Fig. 7b",
    title: "Bidders per project",
    subtitle: "Tennessee and South Carolina projects with yearly means",
    note: `Bidders per project averaged ${num(d3.min(perYear, (d) => d.mean), 1)} to ${num(d3.max(perYear, (d) => d.mean), 1)} per year from 2019 to 2026, without a sustained change after the IIJA. In the project model (Table 2), each additional bidder lowered the low bid relative to the estimate by ${pct(effect, 1)} (${pValue(b.bidderModel.p)}).`,
    height: (w) => Math.round(Math.max(320, Math.min(420, w * 0.82))),
    table: () =>
      view.bidderView === "time"
        ? { caption: "Mean bidders per project by bid year", columns: [{ label: "Year" }, { label: "Projects", num: true }, { label: "Mean bidders", num: true }], rows: perYear.map((d) => [String(d.year), count(d.n), num(d.mean, 2)]) }
        : {
            caption: "Low bid relative to estimate by number of bidders",
            columns: [{ label: "Bidders", num: true }, { label: "Projects", num: true }, { label: "Median ratio", num: true }],
            rows: bidderCounts.map((k) => {
              const v = tnsc.filter((p) => p.bidders === k).map((p) => p.ratio);
              return [String(k), count(v.length), v.length ? num(median(v), 2) : "n/a"];
            }),
          },
    render: (api, t) => {
      smallToggle(
        api,
        [
          { value: "time", label: "Over time" },
          { value: "ratio", label: "And the low bid" },
        ],
        view.bidderView,
        (v) => {
          view.bidderView = v;
          bidders.update();
        },
      );
      legend(api.legend, ["TN", "SC"].map((s) => ({ key: s, label: STATE_NAME[s], color: t.series[STATE_SLOT[s]], shape: "dot" })));
      if (view.bidderView === "time") {
        api.setTitle("Bidders per project");
        api.setSubtitle("Tennessee and South Carolina projects, jittered, with yearly means");
        const list = projectsAll.filter((p) => p.st !== "WY" && view.states.has(p.st) && p.bidders !== null && p.bidders >= 1 && p.d);
        const m = { top: 30, right: 10, bottom: 24, left: 34 };
        const { g, w, h } = frame(api, m);
        const x = d3.scaleTime().domain([new Date(2019, 0, 1), new Date(2026, 8, 1)]).range([0, w]);
        const y = d3.scaleLinear().domain([0.4, 8.6]).range([h, 0]);
        band(g, x(new Date(2022, 0, 1)), x(new Date(2025, 11, 31)), h, { fill: t.bandPost });
        yAxis(g, y, { width: w, values: [1, 2, 3, 4, 5, 6, 7, 8], format: (v) => String(v) });
        g.append("g").attr("class", "axis no-grid").attr("transform", `translate(0,${h})`).call(d3.axisBottom(x).ticks(w < 400 ? 4 : 8).tickSize(4).tickPadding(6));
        const pts = list.map((p, i) => ({ p, px: x(new Date(p.d.getTime() + jitter(i) * 40 * 864e5)), py: y(p.bidders + jitter(i + 7) * 0.36) }));
        g.append("g")
          .selectAll("circle")
          .data(pts)
          .join("circle")
          .attr("class", "pop")
          .attr("cx", (d) => d.px)
          .attr("cy", (d) => d.py)
          .attr("r", 3.6)
          .attr("fill", (d) => t.series[STATE_SLOT[d.p.st]])
          .attr("fill-opacity", 0.75)
          .attr("stroke", t.surface)
          .attr("stroke-width", 1);
        const meanPts = perYear.map((d) => ({ ...d, px: x(new Date(d.year, 6, 1)), py: y(d.mean) }));
        g.append("path").attr("class", "draw").attr("d", d3.line().x((d) => d.px).y((d) => d.py)(meanPts)).attr("fill", "none").attr("stroke", t.ink).attr("stroke-width", 2.2);
        meanPts.forEach((d) => {
          g.append("circle").attr("class", "pop").attr("cx", d.px).attr("cy", d.py).attr("r", 4.5).attr("fill", t.ink).attr("stroke", t.surface).attr("stroke-width", 2);
          g.append("text").attr("class", "label fade").attr("x", d.px).attr("y", -10).attr("text-anchor", "middle").text(num(d.mean, 1));
        });
        g.append("text").attr("class", "label-muted").attr("x", 0).attr("y", -22).text("Yearly mean");
        const ring = g.append("circle").attr("fill", "none").attr("stroke", t.ink).attr("stroke-width", 2).style("opacity", 0);
        const delaunay = d3.Delaunay.from(pts, (d) => d.px, (d) => d.py);
        g.append("rect")
          .attr("class", "hit")
          .attr("width", w)
          .attr("height", h)
          .on("pointermove", (event) => {
            const [mx, my] = d3.pointer(event);
            const d = pts[delaunay.find(mx, my)];
            if (!d || Math.hypot(d.px - mx, d.py - my) > 20) {
              ring.style("opacity", 0);
              hideTip();
              return;
            }
            ring.attr("cx", d.px).attr("cy", d.py).attr("r", 6.5).style("opacity", 1);
            const yr = perYear.find((o) => o.year === d.p.year);
            showTip(event, {
              title: d.p.name || `Project at ${d.p.airport}`,
              subtitle: `${d.p.airport} · ${STATE_NAME[d.p.st]} · bid ${fullDate(d.p.date)}`,
              rows: [
                { value: String(d.p.bidders), label: "bidders", color: t.series[STATE_SLOT[d.p.st]], shape: "dot", focus: true },
                yr ? { value: num(yr.mean, 2), label: `mean bidders in ${yr.year}` } : null,
              ],
            });
          })
          .on("pointerleave", () => {
            ring.style("opacity", 0);
            hideTip();
          });
        return;
      }
      api.setTitle("Competition and the low bid");
      api.setSubtitle(`Each additional bidder lowered the low bid relative to the estimate by ${pct(effect, 1)} (${pValue(b.bidderModel.p)})`);
      const list = tnsc.filter((p) => view.states.has(p.st));
      const m = { top: 24, right: 12, bottom: 40, left: 40 };
      const { g, w, h } = frame(api, m);
      const x = d3.scaleBand().domain(bidderCounts).range([0, w]).padding(0.2);
      const y = d3.scaleLog().domain([0.3, 3.5]).range([h, 0]);
      yAxis(g, y, { width: w, values: RATIO_TICKS, format: (v) => numTrim(v, 2) });
      xAxis(g, x, { height: h });
      g.append("text").attr("class", "axis-title").attr("x", w / 2).attr("y", h + 34).attr("text-anchor", "middle").text("Number of bidders");
      g.append("line").attr("class", "baseline").attr("x1", 0).attr("x2", w).attr("y1", y(1)).attr("y2", y(1));
      const pts = list.map((p, i) => ({ p, px: x(p.bidders) + x.bandwidth() / 2 + jitter(i) * x.bandwidth() * 0.7, py: y(p.ratio) }));
      g.append("g")
        .selectAll("circle")
        .data(pts)
        .join("circle")
        .attr("class", "pop")
        .attr("cx", (d) => d.px)
        .attr("cy", (d) => d.py)
        .attr("r", 4)
        .attr("fill", (d) => t.series[STATE_SLOT[d.p.st]])
        .attr("fill-opacity", 0.75)
        .attr("stroke", t.surface)
        .attr("stroke-width", 1);
      bidderCounts.forEach((k) => {
        const v = list.filter((p) => p.bidders === k).map((p) => p.ratio);
        g.append("text").attr("class", "label-muted").attr("x", x(k) + x.bandwidth() / 2).attr("y", -8).attr("text-anchor", "middle").text(`n ${v.length}`);
        if (v.length >= 3) g.append("line").attr("class", "fade").attr("x1", x(k) + x.bandwidth() * 0.12).attr("x2", x(k) + x.bandwidth() * 0.88).attr("y1", y(median(v))).attr("y2", y(median(v))).attr("stroke", t.ink).attr("stroke-width", 2.5).attr("stroke-linecap", "round");
      });
      const anchor = median(tnsc.map((p) => p.ratio));
      const fit = bidderCounts.map((k) => ({ k, v: anchor * Math.exp(b.bidderModel.coef * (k - b.bidderModel.meanBidders)) }));
      g.append("path").attr("class", "draw").attr("d", d3.line().x((d) => x(d.k) + x.bandwidth() / 2).y((d) => y(d.v))(fit)).attr("fill", "none").attr("stroke", t.series[3]).attr("stroke-width", 2.5);
      const lastFit = fit[fit.length - 1];
      g.append("text").attr("class", "label-strong halo fade").attr("x", x(lastFit.k) + x.bandwidth() / 2).attr("y", y(lastFit.v) + 18).attr("text-anchor", "end").text(`${pct(-effect, 1)} per bidder`);
      const ring = g.append("circle").attr("fill", "none").attr("stroke", t.ink).attr("stroke-width", 2).style("opacity", 0);
      const delaunay = d3.Delaunay.from(pts, (d) => d.px, (d) => d.py);
      g.append("rect")
        .attr("class", "hit")
        .attr("width", w)
        .attr("height", h)
        .on("pointermove", (event) => {
          const [mx, my] = d3.pointer(event);
          const d = pts[delaunay.find(mx, my)];
          if (!d || Math.hypot(d.px - mx, d.py - my) > 22) {
            ring.style("opacity", 0);
            hideTip();
            return;
          }
          ring.attr("cx", d.px).attr("cy", d.py).attr("r", 7).style("opacity", 1);
          showTip(event, {
            title: d.p.name || `Project at ${d.p.airport}`,
            subtitle: `${d.p.airport} · ${STATE_NAME[d.p.st]} · ${d.p.year}`,
            rows: [
              { value: num(d.p.ratio, 2), label: "low bid relative to estimate", color: t.series[STATE_SLOT[d.p.st]], shape: "dot", focus: true },
              { value: String(d.p.bidders), label: "bidders" },
              { value: money(d.p.estimate), label: "engineer’s estimate" },
            ],
          });
        })
        .on("pointerleave", () => {
          ring.style("opacity", 0);
          hideTip();
        });
    },
  });

  const indexCard = card(document.getElementById("bid-index"), {
    figure: "Fig. 7c",
    title: "Bid price index and producer price indexes",
    subtitle: "2021 = 100; the shaded band is the 95% confidence interval of the bid price index",
    note: "The index compares the same pay items across years and adjusts for quantity. The intervals include the PPI values in every year, so the gap should be read as indicative. 2026 includes bids opened through July 2026.",
    height: (w) => Math.round(Math.max(320, Math.min(540, w * 0.9))),
    table: () => {
      const s = spec();
      const years = d3.range(2018, 2027);
      return {
        caption: `${s.label} and producer price indexes (2021 = 100)`,
        columns: [{ label: "Year" }, { label: "Bid price index", num: true }, { label: "95% CI", num: true }, ...b.ppi.map((p) => ({ label: p.label, num: true }))],
        rows: years.map((yr) => {
          const pt = s.points.find((p) => p.year === yr);
          return [
            String(yr),
            pt ? num(pt.index, 1) : "",
            pt ? `${num(pt.lo, 1)} to ${num(pt.hi, 1)}` : "",
            ...b.ppi.map((p) => {
              const q = p.points.find((o) => o.year === yr);
              return q ? num(q.index, 1) : "";
            }),
          ];
        }),
      };
    },
    render: (api, t) => {
      const s = spec();
      const items = [{ key: "spec", label: s.key === "baseline" ? "Bid price index, capital projects" : `Bid price index, ${s.label.toLowerCase()}`, color: t.series[0], shape: "line" }, ...b.ppi.map((p) => ({ key: p.key, label: p.label, color: t.series[PPI_SLOT[p.key]], shape: "line" }))];
      const hidden = new Set(view.ppiHidden);
      if (view.specHidden) hidden.add("spec");
      legend(api.legend, items, {
        hidden,
        onToggle: (hset) => {
          view.specHidden = hset.has("spec");
          view.ppiHidden = new Set([...hset].filter((k) => k !== "spec"));
          indexCard.update();
        },
      });
      const ppis = b.ppi.filter((p) => !view.ppiHidden.has(p.key));
      const showSpec = !view.specHidden;
      const m = { top: 16, right: 46, bottom: 24, left: 40 };
      const { g, w, h } = frame(api, m);
      const x = d3.scaleLinear().domain([2018, 2026]).range([0, w]);
      const values = [...(showSpec ? s.points.map((p) => p.index) : []), ...ppis.flatMap((p) => p.points.map((q) => q.index)), 100];
      const bandTop = showSpec ? d3.max(s.points, (p) => p.hi) : 0;
      const yMax = Math.max(d3.max(values) * 1.12, Math.min(bandTop, 215));
      const yMin = Math.min(d3.min(values) * 0.9, showSpec ? Math.max(55, d3.min(s.points, (p) => p.lo)) : 1000);
      const y = d3.scaleLinear().domain([yMin, yMax]).nice(5).range([h, 0]);
      const clipId = `clip-bid-${Math.round(Math.random() * 1e9)}`;
      api.svg.append("defs").append("clipPath").attr("id", clipId).append("rect").attr("width", w).attr("height", h);
      band(g, x(2021.5), x(2025.5), h, { fill: t.bandPre, label: "Averaged, 2022 to 2025", labelY: 12 });
      yAxis(g, y, { width: w, ticks: 6 });
      xAxis(g, x, { height: h, values: d3.range(2018, 2027), format: (v) => (w < 420 && v % 2 ? "" : String(v)), tickSize: 4 });
      g.append("line").attr("class", "baseline").attr("x1", 0).attr("x2", w).attr("y1", y(100)).attr("y2", y(100));
      const plot = g.append("g").attr("clip-path", `url(#${clipId})`);
      const line = d3.line().x((p) => x(p.year)).y((p) => y(p.index));
      if (showSpec) plot.append("path").attr("class", "fade").attr("d", d3.area().x((p) => x(p.year)).y0((p) => y(p.lo)).y1((p) => y(p.hi))(s.points)).attr("fill", t.series[0]).attr("fill-opacity", 0.14);
      ppis.forEach((p) => {
        plot.append("path").attr("class", "draw").attr("d", line(p.points)).attr("fill", "none").attr("stroke", t.series[PPI_SLOT[p.key]]).attr("stroke-width", 2).attr("stroke-linejoin", "round");
      });
      if (showSpec) {
        plot.append("path").attr("class", "draw").attr("d", line(s.points)).attr("fill", "none").attr("stroke", t.series[0]).attr("stroke-width", 2.5).attr("stroke-linejoin", "round");
        plot.selectAll("circle.spec").data(s.points).join("circle").attr("class", "spec pop").attr("cx", (p) => x(p.year)).attr("cy", (p) => y(p.index)).attr("r", 4).attr("fill", t.series[0]).attr("stroke", t.surface).attr("stroke-width", 2);
      }
      const ends = [];
      if (showSpec) ends.push({ y: y(s.points[s.points.length - 1].index), text: num(s.points[s.points.length - 1].index, 0) });
      ppis.forEach((p) => ends.push({ y: y(p.points[p.points.length - 1].index), text: num(p.points[p.points.length - 1].index, 0) }));
      spreadLabels(ends, { minGap: 12, top: 4, bottom: h }).forEach((e) => g.append("text").attr("class", "label fade").attr("x", w + 8).attr("y", e.ly + 4).text(e.text));
      const hair = g.append("line").attr("class", "crosshair").attr("y1", 0).attr("y2", h).style("opacity", 0);
      const dots = g.append("g");
      g.append("rect")
        .attr("class", "hit")
        .attr("width", w)
        .attr("height", h)
        .on("pointermove", (event) => {
          const [mx] = d3.pointer(event);
          const yr = Math.max(2018, Math.min(2026, Math.round(x.invert(mx))));
          hair.attr("x1", x(yr)).attr("x2", x(yr)).style("opacity", 1);
          dots.selectAll("*").remove();
          const rows = [];
          const sp = s.points.find((p) => p.year === yr);
          if (showSpec && sp) {
            dots.append("circle").attr("cx", x(yr)).attr("cy", y(sp.index)).attr("r", 5).attr("fill", t.series[0]).attr("stroke", t.surface).attr("stroke-width", 2);
            rows.push({ value: num(sp.index, 1), label: "bid price index", color: t.series[0], focus: true });
            rows.push({ value: `${num(sp.lo, 1)} to ${num(sp.hi, 1)}`, label: "95% confidence interval" });
          }
          ppis.forEach((p) => {
            const q = p.points.find((o) => o.year === yr);
            if (!q) return;
            dots.append("circle").attr("cx", x(yr)).attr("cy", y(q.index)).attr("r", 4).attr("fill", t.series[PPI_SLOT[p.key]]).attr("stroke", t.surface).attr("stroke-width", 2);
            rows.push({ value: num(q.index, 1), label: p.label, color: t.series[PPI_SLOT[p.key]] });
          });
          showTip(event, { title: String(yr), subtitle: showSpec ? s.label : null, rows, note: yr === 2026 ? "2026 includes bids opened through July 2026" : null });
        })
        .on("pointerleave", () => {
          hair.style("opacity", 0);
          dots.selectAll("*").remove();
          hideTip();
        });
    },
  });

  const specBox = document.getElementById("bid-specs");
  function renderSpecs() {
    const t = tokens();
    specBox.replaceChildren();
    const title = el("h4", "chart-title");
    title.append(el("span", "fig-badge", "Table 3"), document.createTextNode("Bid price index by specification"));
    specBox.append(title, el("p", "chart-sub", `Mean index for 2022 to 2025 (2021 = 100). The dark tick marks the PPI for highway inputs (${num(highwayMean, 1)}). Select a specification to draw it in Fig. 7c.`));
    const list = el("div", "spec-list");
    list.setAttribute("role", "radiogroup");
    list.setAttribute("aria-label", "Bid price index specification");
    const lo = 80;
    const hi = 200;
    b.specs.forEach((s) => {
      const mean = periodMean(s);
      const label = el("label", `spec-option${s.key === view.spec ? " is-checked" : ""}`);
      const input = el("input");
      input.type = "radio";
      input.name = "bid-spec";
      input.value = s.key;
      input.checked = s.key === view.spec;
      input.addEventListener("change", () => {
        view.spec = s.key;
        view.specHidden = false;
        renderSpecs();
        indexCard.update();
      });
      const gauge = el("span", "spec-gauge");
      const fill = el("i");
      fill.style.width = `${Math.max(0, Math.min(100, (100 * (mean - lo)) / (hi - lo)))}%`;
      fill.style.background = s.key === "maintenance_only" || s.key === "all_states_pooled" ? t.other : t.series[0];
      const tick = el("b");
      tick.style.left = `${(100 * (highwayMean - lo)) / (hi - lo)}%`;
      gauge.append(fill, tick);
      label.append(input, el("span", "spec-name", s.label), el("span", "spec-value", num(mean, 1)), el("span", "spec-meta", `${count(s.items)} line items, ${count(s.projects)} projects`), gauge);
      list.append(label);
    });
    specBox.append(list, el("p", "chart-note", "The maintenance programs repeat the same seal and marking items and are indexed separately as a contrast. In every capital specification the mean stays above the highway input PPI."));
  }
  renderSpecs();
  onTheme(renderSpecs);

  const families = card(document.getElementById("bid-families"), {
    figure: "Fig. 7d",
    title: "Low bid relative to the estimate by pay item",
    subtitle: "Line items of Tennessee and South Carolina projects; the bar spans the middle half and the dot is the median",
    note: "Pay items with at least 30 line items. Airfield cable and lighting fixtures were most often above the estimate, and pavement marking and erosion control were furthest below it.",
    height: () => b.families.length * 26 + 50,
    table: () => ({
      caption: "Low bid relative to estimate by pay item family",
      columns: [{ label: "Specification" }, { label: "Pay item" }, { label: "Line items", num: true }, { label: "Projects", num: true }, { label: "Median", num: true }, { label: "Middle half", num: true }, { label: "Above estimate", num: true }],
      rows: b.families.map((f) => [f.spec, f.name, count(f.n), count(f.projects), { text: num(f.med, 2), sort: f.med }, `${num(f.q1, 2)} to ${num(f.q3, 2)}`, { text: pct(100 * f.over), sort: f.over }]),
    }),
    render: (api, t) => {
      smallToggle(
        api,
        [
          { value: "median", label: "Median" },
          { value: "over", label: "Above estimate" },
          { value: "n", label: "Line items" },
        ],
        view.famSort,
        (v) => {
          view.famSort = v;
          families.update();
        },
      );
      const rows = b.families.slice().sort((a, c) => (view.famSort === "median" ? c.med - a.med : view.famSort === "over" ? c.over - a.over : c.n - a.n));
      const labelW = Math.min(190, Math.max(...rows.map((f) => textWidth(`${f.name} (${f.spec})`, 11.5))) + 12);
      const m = { top: 20, right: 92, bottom: 26, left: labelW };
      const { g, w, h } = frame(api, m);
      const y = d3.scaleBand().domain(rows.map((f) => f.spec)).range([0, h]).padding(0.25);
      const x = d3.scaleLog().domain([0.35, 1.7]).range([0, w]);
      g.append("g").attr("class", "axis").attr("transform", `translate(0,${h})`).call(d3.axisBottom(x).tickValues([0.4, 0.6, 0.8, 1, 1.25, 1.5]).tickSize(-h).tickPadding(8).tickFormat((v) => numTrim(v, 2)));
      g.append("line").attr("class", "baseline").attr("x1", x(1)).attr("x2", x(1)).attr("y1", -6).attr("y2", h).attr("stroke-width", 1.5);
      g.append("text").attr("class", "label-muted").attr("x", x(1)).attr("y", -9).attr("text-anchor", "middle").text("Estimate");
      g.append("text").attr("class", "label-muted").attr("x", w + m.right - 2).attr("y", -9).attr("text-anchor", "end").text("Above estimate");
      const rowG = g.selectAll("g.row").data(rows).join("g").attr("class", "row mark").attr("transform", (f) => `translate(0,${y(f.spec) + y.bandwidth() / 2})`);
      rowG.append("rect").attr("x", -labelW).attr("y", -y.step() / 2).attr("width", w + labelW + m.right).attr("height", y.step()).attr("fill", "transparent");
      rowG.append("text").attr("class", "label").attr("x", -10).attr("y", 4).attr("text-anchor", "end").text((f) => `${f.name} (${f.spec})`);
      rowG.append("rect").attr("class", "grow-x").attr("x", (f) => x(Math.max(0.35, f.q1))).attr("y", -5).attr("width", (f) => Math.max(2, x(Math.min(1.7, f.q3)) - x(Math.max(0.35, f.q1)))).attr("height", 10).attr("rx", 5).attr("fill", t.series[0]).attr("fill-opacity", 0.28);
      rowG.append("circle").attr("class", "pop").attr("cx", (f) => x(f.med)).attr("r", 5).attr("fill", t.series[0]).attr("stroke", t.surface).attr("stroke-width", 2);
      rowG.append("text").attr("class", "label fade").attr("x", w + m.right - 2).attr("y", 4).attr("text-anchor", "end").text((f) => pct(100 * f.over));
      rowG
        .on("pointerenter pointermove", (event, f) => {
          rowG.classed("is-dim", (o) => o !== f);
          showTip(event, {
            title: `${f.name} (${f.spec})`,
            subtitle: `${count(f.n)} line items in ${count(f.projects)} projects`,
            rows: [
              { value: num(f.med, 2), label: "median low bid relative to estimate", color: t.series[0], shape: "dot", focus: true },
              { value: `${num(f.q1, 2)} to ${num(f.q3, 2)}`, label: "middle half" },
              { value: pct(100 * f.over), label: "of line items above the estimate" },
            ],
          });
        })
        .on("pointerleave", () => {
          rowG.classed("is-dim", false);
          hideTip();
        });
    },
  });

  [projects, bidders, indexCard, families].forEach((c) => c.render());
}
