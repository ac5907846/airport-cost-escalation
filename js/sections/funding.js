import { load } from "../lib/data.js";
import { el } from "../lib/dom.js";
import { card, legend, frame, yAxis, xAxis, barPath, band, spreadLabels, textWidth } from "../lib/chart.js";
import { segmented, toggle } from "../lib/controls.js";
import { showTip, hideTip } from "../lib/tooltip.js";
import { money, pct, num, count } from "../lib/format.js";

const SLOT = { Pavement: 0, Terminals: 1, "Lighting and safety": 2, "Buildings and equipment": 3, "Planning and land": 4, "Block grants and other": -1, "Pandemic relief": 6 };
const SHORT = {
  "Airfield pavement: runway": "Runway pavement",
  "Airfield pavement: taxiway": "Taxiway pavement",
  "Airfield pavement: apron": "Apron pavement",
  "Terminal building": "Terminal building",
  "Lighting and NAVAIDs": "Lighting and NAVAIDs",
  "Safety and security": "Safety and security",
  "Support buildings and utilities": "Support buildings",
  "Equipment (SRE, ARFF)": "Equipment (SRE, ARFF)",
  "Planning and environmental": "Planning",
  "Noise mitigation": "Noise mitigation",
  "Land acquisition": "Land acquisition",
  "Landside access": "Landside access",
  "Drainage and environment": "Drainage",
  Other: "Other",
  "State block grant (unspecified)": "State block grants",
};

function colorOf(t, group) {
  const slot = SLOT[group];
  return slot === undefined || slot < 0 ? t.other : t.series[slot];
}

function meanOver(values, years, from, to) {
  let sum = 0;
  let n = 0;
  years.forEach((y, i) => {
    if (y >= from && y <= to) {
      sum += values[i];
      n += 1;
    }
  });
  return n ? sum / n : 0;
}

export async function initFunding() {
  const f = await load("funding");
  const years = f.years;
  const groups = f.groups;
  const baseGroups = groups.filter((g) => g !== "Pandemic relief");
  const categories = f.categories.filter((c) => c !== "Pandemic relief");
  const view = { measure: "dollars", pandemic: false, hidden: new Set(), catMeasure: "share", catScale: "shared", sizeSort: "change", focusYear: null };

  const controls = document.getElementById("funding-controls");
  segmented(controls, {
    label: "Measure",
    options: [
      { value: "dollars", label: "Dollars" },
      { value: "share", label: "Share of each year" },
    ],
    value: view.measure,
    onChange: (v) => {
      view.measure = v;
      bars.update();
    },
  });
  toggle(controls, {
    label: "Include pandemic relief",
    checked: view.pandemic,
    onChange: (on) => {
      view.pandemic = on;
      bars.update();
    },
  });

  const bars = card(document.getElementById("funding-bars"), {
    figure: "Fig. 3a",
    title: "Federal airport grants by work group, FY2008 to FY2025",
    subtitle: "Hover a column to read every group for that year",
    note: "Work groups combine the work categories assigned to AIP grant line items. Pandemic relief grants are shown only when switched on and are excluded from the totals quoted in the paper.",
    height: (w) => Math.round(Math.max(270, Math.min(380, w * 0.52))),
    table: () => ({
      caption: "Federal airport grant dollars by work group and fiscal year",
      columns: [{ label: "Fiscal year" }, ...groups.map((g) => ({ label: g, num: true })), { label: "Total excluding pandemic relief", num: true }],
      rows: years.map((y, i) => [
        String(y),
        ...groups.map((g) => ({ text: money(f.byGroup[g][i]), sort: f.byGroup[g][i] })),
        { text: money(d3.sum(baseGroups, (g) => f.byGroup[g][i])), sort: d3.sum(baseGroups, (g) => f.byGroup[g][i]) },
      ]),
    }),
    render: (api, t) => {
      const shown = groups.filter((g) => (view.pandemic || g !== "Pandemic relief") && !view.hidden.has(g));
      legend(
        api.legend,
        groups.filter((g) => view.pandemic || g !== "Pandemic relief").map((g) => ({ key: g, label: g, color: colorOf(t, g) })),
        {
          hidden: view.hidden,
          onToggle: () => bars.update(),
        },
      );
      const share = view.measure === "share";
      const m = { top: 24, right: 6, bottom: 24, left: share ? 40 : 50 };
      const { g, w, h } = frame(api, m);
      const rows = years.map((year, i) => {
        const values = shown.map((grp) => f.byGroup[grp][i]);
        const total = d3.sum(values);
        let acc = 0;
        const segs = shown
          .map((grp, k) => {
            const raw = values[k];
            const v = share ? (total ? (100 * raw) / total : 0) : raw;
            const seg = { group: grp, raw, v, y0: acc, y1: acc + v };
            acc += v;
            return seg;
          })
          .filter((s) => s.v > 0);
        return { year, i, total, segs, top: acc };
      });
      const x = d3.scaleBand().domain(years).range([0, w]).paddingInner(0.3).paddingOuter(0.12);
      const y = d3.scaleLinear().domain([0, share ? 100 : d3.max(rows, (r) => r.top) || 1]).nice(5).range([h, 0]);
      const bw = Math.min(24, x.bandwidth());
      const off = (x.bandwidth() - bw) / 2;
      band(g, x(2009) - 3, x(2010) + x.bandwidth() + 3, h, { fill: t.bandPre, label: "ARRA", labelY: -8 });
      band(g, x(2022) - 3, x(2025) + x.bandwidth() + 3, h, { fill: t.bandPost, label: "IIJA", labelY: -8, align: "end" });
      yAxis(g, y, { width: w, ticks: 5, format: share ? (v) => `${v}%` : (v) => (v === 0 ? "0" : money(v)) });
      const every = w < 420 ? 4 : 2;
      xAxis(g, x, { height: h, values: years.filter((yr) => (yr - 2008) % every === 0 || yr === 2025) });
      const cols = g.append("g");
      rows.forEach((r) => {
        const col = cols.append("g").attr("class", "mark grow-y").attr("data-year", r.year);
        r.segs.forEach((s, k) => {
          const top = k === r.segs.length - 1;
          const y0 = y(s.y0);
          const y1 = y(s.y1);
          const gap = k > 0 && y0 - y1 > 3 ? 2 : 0;
          const hgt = Math.max(0, y0 - y1 - gap);
          col
            .append("path")
            .attr("d", top ? barPath(x(r.year) + off, y1, bw, hgt, 4, "up") : barPath(x(r.year) + off, y1, bw, hgt, 0, "none"))
            .attr("fill", colorOf(t, s.group));
        });
      });
      const last = rows[rows.length - 1];
      const readout = g
        .append("text")
        .attr("class", "label-strong halo")
        .attr("text-anchor", "middle")
        .attr("x", x(last.year) + x.bandwidth() / 2)
        .attr("y", y(last.top) - 6)
        .text(share ? "" : money(last.total));
      g.append("rect")
        .attr("class", "hit")
        .attr("width", w)
        .attr("height", h)
        .on("pointermove", (event) => {
          const [mx, my] = d3.pointer(event);
          const idx = Math.max(0, Math.min(years.length - 1, Math.round((mx - x(years[0]) - x.bandwidth() / 2) / x.step())));
          const r = rows[idx];
          cols.selectAll(".mark").classed("is-dim", function () {
            return Number(this.getAttribute("data-year")) !== r.year;
          });
          const value = y.invert(my);
          const hovered = r.segs.find((s) => value >= s.y0 && value <= s.y1);
          readout.attr("x", x(r.year) + x.bandwidth() / 2).attr("y", y(r.top) - 6).text(share ? "" : money(r.total));
          showTip(event, {
            title: `FY${r.year}`,
            subtitle: share ? "Share of grant dollars shown" : `Total ${money(r.total)}`,
            rows: r.segs
              .slice()
              .reverse()
              .map((s) => ({
                value: share ? pct(s.v, 1) : money(s.raw),
                label: s.group,
                color: colorOf(t, s.group),
                shape: "dot",
                focus: hovered && hovered.group === s.group,
              })),
          });
        })
        .on("pointerleave", () => {
          cols.selectAll(".mark").classed("is-dim", false);
          readout.attr("x", x(last.year) + x.bandwidth() / 2).attr("y", y(last.top) - 6).text(share ? "" : money(last.total));
          hideTip();
        });
    },
  });

  const pre = Object.fromEntries(baseGroups.map((g) => [g, meanOver(f.byGroup[g], years, 2017, 2021)]));
  const post = Object.fromEntries(baseGroups.map((g) => [g, meanOver(f.byGroup[g], years, 2022, 2025)]));
  const preTotal = d3.sum(Object.values(pre));
  const postTotal = d3.sum(Object.values(post));

  const shift = card(document.getElementById("funding-shift"), {
    figure: "Fig. 3a",
    title: "Share of grant dollars before and after the IIJA",
    subtitle: `Average per year: ${money(preTotal)} in FY2017 to FY2021 and ${money(postTotal)} in FY2022 to FY2025`,
    note: "Pandemic relief excluded. Hover a band to compare dollars and shares.",
    height: (w) => Math.round(Math.max(300, Math.min(380, w * 0.78))),
    table: () => ({
      caption: "Average annual grant dollars and shares by work group",
      columns: [{ label: "Work group" }, { label: "FY2017 to FY2021", num: true }, { label: "Share", num: true }, { label: "FY2022 to FY2025", num: true }, { label: "Share", num: true }, { label: "Change in dollars", num: true }],
      rows: baseGroups.map((g) => [g, { text: money(pre[g]), sort: pre[g] }, { text: pct((100 * pre[g]) / preTotal), sort: pre[g] / preTotal }, { text: money(post[g]), sort: post[g] }, { text: pct((100 * post[g]) / postTotal), sort: post[g] / postTotal }, { text: pct(100 * (post[g] / pre[g] - 1)), sort: post[g] / pre[g] }]),
    }),
    render: (api, t) => {
      legend(api.legend, baseGroups.map((g) => ({ key: g, label: g, color: colorOf(t, g) })));
      const labelSpace = Math.min(150, Math.max(112, api.width * 0.34));
      const m = { top: 26, right: labelSpace, bottom: 8, left: 4 };
      const { g, w, h } = frame(api, m);
      const bw = 26;
      const gap = 3;
      const avail = h - gap * (baseGroups.length - 1);
      const x0 = 0;
      const x1 = w - bw;
      const nodes = [];
      let a = 0;
      let b = 0;
      baseGroups.forEach((grp) => {
        const hp = (avail * pre[grp]) / preTotal;
        const hq = (avail * post[grp]) / postTotal;
        nodes.push({ grp, p0: a, p1: a + hp, q0: b, q1: b + hq });
        a += hp + gap;
        b += hq + gap;
      });
      g.append("text").attr("class", "label").attr("x", x0).attr("y", -10).text("FY2017 to FY2021");
      g.append("text").attr("class", "label").attr("x", x1 + bw).attr("y", -10).attr("text-anchor", "end").text("FY2022 to FY2025");
      const mid = (x0 + bw + x1) / 2;
      const ribbons = g
        .append("g")
        .selectAll("path")
        .data(nodes)
        .join("path")
        .attr("class", "mark fade")
        .attr("d", (n) => `M${x0 + bw},${n.p0}C${mid},${n.p0} ${mid},${n.q0} ${x1},${n.q0}L${x1},${n.q1}C${mid},${n.q1} ${mid},${n.p1} ${x0 + bw},${n.p1}Z`)
        .attr("fill", (n) => colorOf(t, n.grp))
        .attr("fill-opacity", 0.26);
      const blocks = g.append("g");
      nodes.forEach((n) => {
        blocks.append("path").attr("class", "mark grow-y").attr("data-g", n.grp).attr("d", barPath(x0, n.p0, bw, Math.max(0.5, n.p1 - n.p0), 0, "none")).attr("fill", colorOf(t, n.grp));
        blocks.append("path").attr("class", "mark grow-y").attr("data-g", n.grp).attr("d", barPath(x1, n.q0, bw, Math.max(0.5, n.q1 - n.q0), 0, "none")).attr("fill", colorOf(t, n.grp));
      });
      const labels = spreadLabels(
        nodes.map((n) => ({ n, y: (n.q0 + n.q1) / 2 })),
        { minGap: 30, top: 8, bottom: h - 18 },
      );
      const lab = g.append("g");
      labels.forEach((item) => {
        const n = item.n;
        const lx = x1 + bw + 10;
        lab.append("path").attr("d", `M${x1 + bw + 2},${(n.q0 + n.q1) / 2}L${lx - 3},${item.ly}`).attr("stroke", t.axis).attr("fill", "none");
        lab.append("text").attr("class", "label").attr("x", lx).attr("y", item.ly - 2).text(n.grp);
        lab.append("text").attr("class", "label-strong").attr("x", lx).attr("y", item.ly + 12).text(`${pct((100 * pre[n.grp]) / preTotal)} to ${pct((100 * post[n.grp]) / postTotal)}`);
      });
      const focus = (grp) => {
        ribbons.classed("is-dim", (n) => grp && n.grp !== grp);
        blocks.selectAll("path").classed("is-dim", function () {
          return grp && this.getAttribute("data-g") !== grp;
        });
      };
      const tip = (event, grp) => {
        showTip(event, {
          title: grp,
          rows: [
            { value: money(pre[grp]), label: "per year, FY2017 to FY2021", color: colorOf(t, grp), shape: "dot" },
            { value: pct((100 * pre[grp]) / preTotal, 1), label: "share, FY2017 to FY2021" },
            { value: money(post[grp]), label: "per year, FY2022 to FY2025" },
            { value: pct((100 * post[grp]) / postTotal, 1), label: "share, FY2022 to FY2025" },
            { value: pct(100 * (post[grp] / pre[grp] - 1)), label: "change in dollars per year" },
          ],
        });
      };
      ribbons
        .on("pointerenter pointermove", (event, n) => {
          focus(n.grp);
          tip(event, n.grp);
        })
        .on("pointerleave", () => {
          focus(null);
          hideTip();
        });
      blocks
        .selectAll("path")
        .on("pointerenter pointermove", function (event) {
          const grp = this.getAttribute("data-g");
          focus(grp);
          tip(event, grp);
        })
        .on("pointerleave", () => {
          focus(null);
          hideTip();
        });
    },
  });

  const catControls = document.getElementById("category-controls");
  segmented(catControls, {
    label: "Work category measure",
    options: [
      { value: "share", label: "Share of grants" },
      { value: "dollars", label: "Dollars" },
      { value: "grants", label: "Number of grants" },
    ],
    value: view.catMeasure,
    onChange: (v) => {
      view.catMeasure = v;
      trend.update();
    },
  });
  segmented(catControls, {
    label: "Scale",
    options: [
      { value: "shared", label: "Shared" },
      { value: "own", label: "Each category" },
    ],
    value: view.catScale,
    onChange: (v) => {
      view.catScale = v;
      trend.update();
    },
  });

  const measureValue = (c, i) => {
    const s = f.categorySeries[c];
    if (view.catMeasure === "share") return 100 * s.share[i];
    if (view.catMeasure === "dollars") return s.dollars[i];
    return s.grants[i];
  };
  const measureText = (v) => (view.catMeasure === "share" ? pct(v, 1) : view.catMeasure === "dollars" ? money(v) : count(v));

  const trend = card(document.getElementById("category-trend"), {
    figure: "Fig. 3b",
    title: "Work categories over time",
    subtitle: "Share of grants in each fiscal year by work category; hover to read all categories in the same year",
    note: "Share of grants counts grant line items. Colors follow the work groups above.",
    height: (w) => {
      const cols = w >= 640 ? 3 : 2;
      return Math.ceil(categories.length / cols) * 92 + 18;
    },
    table: () => ({
      caption: "Work category values by fiscal year",
      columns: [{ label: "Work category" }, ...years.map((y) => ({ label: String(y), num: true }))],
      rows: categories.map((c) => [SHORT[c] || c, ...years.map((y, i) => ({ text: measureText(measureValue(c, i)), sort: measureValue(c, i) }))]),
    }),
    render: (api, t) => {
      api.setSubtitle(
        `${view.catMeasure === "share" ? "Share of grants" : view.catMeasure === "dollars" ? "Grant dollars" : "Number of grants"} by work category and fiscal year; hover to read every category in the same year`,
      );
      const cols = api.width >= 640 ? 3 : 2;
      const gapX = 18;
      const cellW = (api.width - gapX * (cols - 1)) / cols;
      const cellH = 92;
      const m = { top: 20, right: 34, bottom: 16, left: 4 };
      const x = d3.scaleLinear().domain([2008, 2025]).range([m.left, cellW - m.right]);
      const sharedMax = d3.max(categories, (c) => d3.max(years, (yr, i) => measureValue(c, i)));
      const cells = [];
      categories.forEach((c, idx) => {
        const col = idx % cols;
        const row = Math.floor(idx / cols);
        const gx = col * (cellW + gapX);
        const gy = row * cellH;
        const cg = api.svg.append("g").attr("transform", `translate(${gx},${gy})`);
        const maxV = view.catScale === "shared" ? sharedMax : d3.max(years, (yr, i) => measureValue(c, i));
        const y = d3.scaleLinear().domain([0, maxV || 1]).range([cellH - m.bottom, m.top + 8]);
        const color = colorOf(t, f.categorySeries[c].group);
        cg.append("rect").attr("x", x(2021.5)).attr("y", m.top + 4).attr("width", x(2025) - x(2021.5) + 3).attr("height", cellH - m.bottom - m.top - 4).attr("fill", t.bandPost);
        cg.append("line").attr("class", "baseline").attr("x1", m.left).attr("x2", cellW - m.right).attr("y1", cellH - m.bottom).attr("y2", cellH - m.bottom);
        cg.append("text").attr("class", "label-strong").attr("x", m.left).attr("y", 12).text(SHORT[c] || c);
        const pts = years.map((yr, i) => ({ yr, v: measureValue(c, i) }));
        cg.append("path")
          .attr("d", d3.area().x((p) => x(p.yr)).y0(cellH - m.bottom).y1((p) => y(p.v)).curve(d3.curveMonotoneX)(pts))
          .attr("class", "fade")
          .attr("fill", color)
          .attr("fill-opacity", 0.12);
        cg.append("path")
          .attr("class", "draw")
          .attr("d", d3.line().x((p) => x(p.yr)).y((p) => y(p.v)).curve(d3.curveMonotoneX)(pts))
          .attr("fill", "none")
          .attr("stroke", color)
          .attr("stroke-width", 2)
          .attr("stroke-linejoin", "round");
        const end = pts[pts.length - 1];
        const dot = cg.append("circle").attr("cx", x(end.yr)).attr("cy", y(end.v)).attr("r", 3.5).attr("fill", color).attr("stroke", t.surface).attr("stroke-width", 1.5);
        const value = cg.append("text").attr("class", "label").attr("x", x(end.yr) + 6).attr("y", y(end.v) + 4).text(measureText(end.v));
        const hair = cg.append("line").attr("class", "crosshair").attr("y1", m.top + 4).attr("y2", cellH - m.bottom).style("opacity", 0);
        cg.append("text").attr("class", "label-muted").attr("x", cellW - m.right).attr("y", 12).attr("text-anchor", "end").text(idx === 0 ? "2008 to 2025" : "");
        cells.push({ c, cg, y, pts, dot, value, hair, color, gx, gy });
      });
      const move = (year) => {
        cells.forEach((cell) => {
          const p = cell.pts.find((q) => q.yr === year) || cell.pts[cell.pts.length - 1];
          cell.hair.attr("x1", x(p.yr)).attr("x2", x(p.yr)).style("opacity", year ? 1 : 0);
          cell.dot.attr("cx", x(p.yr)).attr("cy", cell.y(p.v));
          const tx = x(p.yr) + 6;
          cell.value.attr("x", Math.min(tx, cellW - 4)).attr("text-anchor", tx > cellW - 30 ? "end" : "start").attr("y", cell.y(p.v) - 6).text(measureText(p.v));
        });
      };
      api.svg
        .append("rect")
        .attr("class", "hit")
        .attr("width", api.width)
        .attr("height", api.height)
        .on("pointermove", (event) => {
          const [mx, my] = d3.pointer(event);
          const col = Math.max(0, Math.min(cols - 1, Math.floor(mx / (cellW + gapX))));
          const row = Math.max(0, Math.floor(my / cellH));
          const idx = Math.min(categories.length - 1, row * cols + col);
          const local = mx - col * (cellW + gapX);
          const year = Math.max(2008, Math.min(2025, Math.round(x.invert(local))));
          move(year);
          const c = categories[idx];
          const i = years.indexOf(year);
          const s = f.categorySeries[c];
          showTip(event, {
            title: `${SHORT[c] || c}, FY${year}`,
            subtitle: s.group,
            rows: [
              { value: pct(100 * s.share[i], 1), label: "of grants", color: colorOf(t, s.group), shape: "dot", focus: view.catMeasure === "share" },
              { value: money(s.dollars[i]), label: "grant dollars", focus: view.catMeasure === "dollars" },
              { value: count(s.grants[i]), label: "grants", focus: view.catMeasure === "grants" },
            ],
          });
        })
        .on("pointerleave", () => {
          cells.forEach((cell) => {
            const end = cell.pts[cell.pts.length - 1];
            cell.hair.style("opacity", 0);
            cell.dot.attr("cx", x(end.yr)).attr("cy", cell.y(end.v));
            cell.value.attr("x", x(end.yr) + 6).attr("text-anchor", "start").attr("y", cell.y(end.v) + 4).text(measureText(end.v));
          });
          hideTip();
        });
    },
  });

  const sizeRows = categories
    .map((c) => ({ c, pre: f.categorySeries[c].medianPre, post: f.categorySeries[c].medianPost, group: f.categorySeries[c].group }))
    .filter((r) => r.pre && r.post);

  const size = card(document.getElementById("category-size"), {
    figure: "Fig. 3c",
    title: "Median grant size by work category",
    subtitle: "FY2014 to FY2019 (ring) and FY2022 to FY2025 (dot), logarithmic scale",
    note: "Grant sizes reflect scope as well as prices, so they describe the funding environment rather than unit cost escalation.",
    height: () => sizeRows.length * 26 + 44,
    table: () => ({
      caption: "Median grant size by work category",
      columns: [{ label: "Work category" }, { label: "FY2014 to FY2019", num: true }, { label: "FY2022 to FY2025", num: true }, { label: "Change", num: true }],
      rows: sizeRows.map((r) => [SHORT[r.c] || r.c, { text: money(r.pre), sort: r.pre }, { text: money(r.post), sort: r.post }, { text: pct(100 * (r.post / r.pre - 1)), sort: r.post / r.pre }]),
    }),
    render: (api, t) => {
      const sortSel = api.tools.querySelector(".segmented");
      if (!sortSel) {
        const holder = el("div");
        segmented(holder, {
          small: true,
          options: [
            { value: "change", label: "By change" },
            { value: "post", label: "By size" },
          ],
          value: view.sizeSort,
          onChange: (v) => {
            view.sizeSort = v;
            size.update();
          },
        });
        api.addTool(holder.firstChild);
      }
      const rows = sizeRows.slice().sort((a, b) => (view.sizeSort === "change" ? b.post / b.pre - a.post / a.pre : b.post - a.post));
      const labelW = Math.min(150, Math.max(...rows.map((r) => textWidth(SHORT[r.c] || r.c, 11.5))) + 10);
      const m = { top: 8, right: 52, bottom: 26, left: labelW };
      const { g, w, h } = frame(api, m);
      const y = d3.scaleBand().domain(rows.map((r) => r.c)).range([0, h]).padding(0.2);
      const x = d3.scaleLog().domain([0.15, 10]).range([0, w]);
      const ticks = [0.2, 0.5, 1, 2, 5, 10];
      g.append("g").attr("class", "axis").attr("transform", `translate(0,${h})`).call(d3.axisBottom(x).tickValues(ticks).tickSize(-h).tickPadding(8).tickFormat((v) => money(v)));
      const rowG = g
        .selectAll("g.row")
        .data(rows)
        .join("g")
        .attr("class", "row mark")
        .attr("transform", (r) => `translate(0,${y(r.c) + y.bandwidth() / 2})`);
      rowG.append("rect").attr("x", -labelW).attr("y", -y.step() / 2).attr("width", w + labelW + m.right).attr("height", y.step()).attr("fill", "transparent");
      rowG.append("text").attr("class", "label").attr("x", -10).attr("y", 4).attr("text-anchor", "end").text((r) => SHORT[r.c] || r.c);
      rowG.append("line").attr("class", "draw").attr("x1", (r) => x(r.pre)).attr("x2", (r) => x(r.post)).attr("stroke", t.axis).attr("stroke-width", 2);
      rowG.append("circle").attr("cx", (r) => x(r.pre)).attr("r", 4.5).attr("fill", t.surface).attr("stroke", t.ink2).attr("stroke-width", 1.5);
      rowG.append("circle").attr("class", "pop").attr("cx", (r) => x(r.post)).attr("r", 5).attr("fill", (r) => colorOf(t, r.group)).attr("stroke", t.surface).attr("stroke-width", 2);
      rowG.append("text").attr("class", "label").attr("x", w + m.right - 2).attr("y", 4).attr("text-anchor", "end").text((r) => pct(100 * (r.post / r.pre - 1)));
      rowG
        .on("pointerenter pointermove", function (event, r) {
          rowG.classed("is-dim", (o) => o !== r);
          showTip(event, {
            title: SHORT[r.c] || r.c,
            subtitle: r.group,
            rows: [
              { value: money(r.pre), label: "median, FY2014 to FY2019" },
              { value: money(r.post), label: "median, FY2022 to FY2025", color: colorOf(t, r.group), shape: "dot" },
              { value: pct(100 * (r.post / r.pre - 1)), label: "change" },
            ],
          });
        })
        .on("pointerleave", () => {
          rowG.classed("is-dim", false);
          hideTip();
        });
    },
  });

  [bars, shift, trend, size].forEach((c) => c.render());
}
