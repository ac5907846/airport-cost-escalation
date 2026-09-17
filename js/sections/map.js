import { load, emit } from "../lib/data.js";
import { el, truncate } from "../lib/dom.js";
import { openPanel } from "../lib/tabs.js";
import { tokens, onTheme, diverging, sequential, binIndex } from "../lib/theme.js";
import { showTip, hideTip } from "../lib/tooltip.js";
import { segmented, chips, toggle, search } from "../lib/controls.js";
import { card, legend, renderTable, textWidth, barPath, reducedMotion, onReveal, intro } from "../lib/chart.js";
import { money, pct, num, compactCount, count, reportLabel, reportShort } from "../lib/format.js";

const STATE_NAME = { AK: "Alaska", GA: "Georgia", IL: "Illinois", KY: "Kentucky", OR: "Oregon",
  SC: "South Carolina", TN: "Tennessee", VT: "Vermont", WI: "Wisconsin", WY: "Wyoming" };
const CHANGE_BINS = [-50, -25, -10, 10, 50, 150];
const CHANGE_EDGES = ["−50%", "−25%", "−10%", "10%", "50%", "150%"];
const IIJA_BINS = [150, 300, 600, 1200];
const IIJA_EDGES = ["$150M", "$300M", "$600M", "$1.2B"];
const ATP_BINS = [5, 20, 50];
const ATP_EDGES = ["$0", "$5M", "$20M", "$50M"];
const RATIO_BINS = [0.85, 0.95, 1.05, 1.2];
const RATIO_EDGES = [".85", ".95", "1.05", "1.20"];
const CLASS_LABELS = ["Large and medium hubs", "Small hubs and nonhub primary", "Nonprimary commercial, reliever, and general aviation"];
const CHIP_LABELS = ["Large hub", "Medium hub", "Small hub", "Nonhub", "Nonprimary", "Reliever", "General aviation"];
const easeOut = (x) => 1 - Math.pow(1 - Math.max(0, Math.min(1, x)), 3);

function palettes(t) {
  const arm = [0.42, 0.7, 1];
  const neg = d3.interpolateLab(t.mid, t.neg);
  const pos = d3.interpolateLab(t.mid, t.pos);
  return {
    points: [neg(arm[2]), neg(arm[1]), neg(arm[0]), t.other, pos(arm[0]), pos(arm[1]), pos(arm[2])],
    stateChange: diverging(t, 3),
    ratio: diverging(t, 2),
    green: sequential(t.greenLo, t.greenHi, 5),
    orange: [t.other, ...sequential(t.orangeLo, t.orangeHi, 5).slice(1)],
    classes: [t.series[0], t.series[1], t.series[2]],
  };
}

function bigItem(value, label) {
  const div = el("div");
  div.append(el("strong", null, value), el("span", null, label));
  return div;
}

function scaleLegend(title, colors, edges) {
  const block = el("div", "legend-block");
  block.append(el("span", "legend-title", title));
  const scale = el("div", "legend-scale");
  const swatches = el("div", "legend-swatches");
  colors.forEach((c) => {
    const s = el("span");
    s.style.setProperty("--c", c);
    swatches.append(s);
  });
  const labels = el("div", "legend-edges");
  edges.forEach((text, i) => {
    const s = el("span", null, text);
    s.style.left = `${(i + 1) * 38 - 1}px`;
    labels.append(s);
  });
  scale.append(swatches, labels);
  block.append(scale);
  return block;
}

export async function initMap() {
  const stage = document.getElementById("map-stage");
  const legendBox = document.getElementById("map-legend");
  const detail = document.getElementById("map-detail");
  const controlsBox = document.getElementById("map-controls");
  const toolbar = stage.parentElement.querySelector(".map-buttons");
  stage.style.height = "520px";
  stage.append(el("div", "loading", "Loading the map"));
  const data = await load("map");
  stage.replaceChildren();

  const hubs = data.hubs;
  const reports = data.reports;
  const airports = data.airports.map((a) => ({ ...a, iija: (a.aig || 0) + (a.atp || 0), rDraw: 0, rFrom: 0, rTo: 0 }));
  const byId = new Map(airports.map((a) => [a.id, a]));
  const states = data.states.features;
  const stateByCode = new Map(states.map((f) => [f.properties.state, f]));
  const bidAirports = data.bidAirports;
  const view = { color: "change", size: "est", fill: "iija", report: 4, classes: new Set([0, 1, 2, 3, 4]), bids: false, selected: null, selectedState: null };
  const SIZE = {
    est: { title: () => `Circle size: estimate in the ${reportLabel(reports[view.report])} report`, value: (a) => a.est[view.report] || 0, max: () => d3.max(airports, (a) => d3.max(a.est, (v) => v || 0)), format: money, refs: [100, 500, 2000] },
    iija: { title: () => "Circle size: AIG and ATP dollars, FY2022 to FY2026", value: (a) => a.iija, max: () => d3.max(airports, (a) => a.iija), format: money, refs: [10, 100, 400] },
    enpl: { title: () => "Circle size: enplanements in 2019", value: (a) => a.enpl || 0, max: () => d3.max(airports, (a) => a.enpl || 0), format: compactCount, refs: [1e6, 1e7, 4e7] },
  };
  let t = tokens();
  let pal = palettes(t);
  let W = 0;
  let H = 0;
  let dpr = 1;
  let transform = d3.zoomIdentity;
  let projection = null;
  let path = null;
  let visible = [];
  let quadtree = null;
  let maxR = 20;
  let sizeScale = null;
  let hoverAirport = null;
  let hoverState = null;
  let frameRequest = 0;
  let introT = reducedMotion() ? 1 : 0;
  let revealed = false;
  let radiusAnim = 0;
  let playTimer = 0;

  const svg = d3.select(stage).append("svg").attr("class", "map-base").attr("role", "presentation");
  svg
    .append("defs")
    .append("filter")
    .attr("id", "map-shadow")
    .attr("x", "-5%")
    .attr("y", "-5%")
    .attr("width", "110%")
    .attr("height", "115%")
    .append("feDropShadow")
    .attr("dx", 0)
    .attr("dy", 1.5)
    .attr("stdDeviation", 2.5)
    .attr("flood-opacity", 0.16);
  const zoomLayer = svg.append("g");
  const stateLayer = zoomLayer.append("g").attr("filter", "url(#map-shadow)");
  const frameLayer = zoomLayer.append("g");
  const canvas = d3.select(stage).append("canvas").node();
  const ctx = canvas.getContext("2d");
  const overlay = d3.select(stage).append("svg").attr("class", "map-overlay");
  const stateLabelLayer = overlay.append("g");
  const labelLayer = overlay.append("g");
  const focusLayer = overlay.append("g");
  const yearTag = el("div", "map-year");
  yearTag.hidden = true;
  stage.append(yearTag);

  const tableWrap = el("div", "chart-table");
  tableWrap.hidden = true;
  tableWrap.style.marginTop = "10px";
  legendBox.after(tableWrap);

  segmented(controlsBox, {
    label: "Circle color",
    options: [
      { value: "change", label: "Change in estimate" },
      { value: "class", label: "Airport class" },
      { value: "atp", label: "Terminal award" },
    ],
    value: view.color,
    onChange: (v) => {
      view.color = v;
      recolor();
      drawCanvas();
      renderLegend();
    },
  });
  const sizeControl = segmented(controlsBox, {
    label: "Circle size",
    options: [
      { value: "est", label: "Estimate" },
      { value: "iija", label: "IIJA dollars" },
      { value: "enpl", label: "Enplanements" },
    ],
    value: view.size,
    onChange: (v) => {
      view.size = v;
      reportBox.hidden = v !== "est";
      stopPlay();
      rebuildSizes(true);
      rebuildVisible();
      redraw();
    },
  });
  segmented(controlsBox, {
    label: "State fill",
    options: [
      { value: "iija", label: "IIJA dollars" },
      { value: "change", label: "Change in need" },
      { value: "none", label: "None" },
    ],
    value: view.fill,
    onChange: (v) => {
      view.fill = v;
      paintStates();
      renderLegend();
    },
  });
  const classChips = chips(controlsBox, {
    label: "Airport classes",
    options: CHIP_LABELS.map((label, i) => ({ value: i, label, title: hubs[i] })),
    values: view.classes,
    onChange: (values) => {
      view.classes = values;
      rebuildVisible();
      redraw();
    },
  });
  const bidToggle = toggle(controlsBox, {
    label: "Bid tabulation airports",
    checked: false,
    onChange: (on) => {
      view.bids = on;
      drawCanvas();
      renderLegend();
    },
  });
  search(controlsBox, {
    label: "Find an airport",
    placeholder: "Name, city, or code",
    items: airports
      .filter((a) => a.est.some((v) => v))
      .sort((a, b) => (b.est[4] || 0) - (a.est[4] || 0))
      .map((a) => ({
        id: a.id,
        value: a.id,
        label: `${a.name} (${a.id})`,
        sub: `${a.city ? `${a.city}, ` : ""}${a.st} · ${hubs[a.hub]}`,
        key: `${a.id} ${a.name} ${a.city || ""} ${a.st}`.toLowerCase(),
      })),
    onSelect: (item) => selectAirport(byId.get(item.value), true),
  });

  toolbar.replaceChildren();
  const left = el("div", "report-control");
  left.append(el("span", "fig-badge", "Fig. 2a"));
  const reportBox = el("div", "report-control");
  const reportLabelNode = el("span", "control-label", "NPIAS report");
  reportLabelNode.id = "map-report-label";
  reportBox.append(reportLabelNode);
  const reportControl = segmented(reportBox, {
    small: true,
    options: reports.map((r, i) => ({ value: i, label: reportShort(r), title: `${reportLabel(r)} report` })),
    value: view.report,
    onChange: (v) => {
      stopPlay();
      setReport(v);
    },
  });
  reportControl.node.setAttribute("aria-labelledby", "map-report-label");
  const playBtn = el("button", "play-btn", "▶ Play reports");
  playBtn.type = "button";
  playBtn.setAttribute("aria-pressed", "false");
  playBtn.title = "Animate airport estimates across the five NPIAS reports";
  reportBox.append(playBtn);
  left.append(reportBox);
  const right = el("div", "map-tools");
  const figC = el("button", "btn-small", "Fig. 2c view");
  figC.type = "button";
  figC.title = "Show the airports with bid tabulations in Tennessee and South Carolina";
  const zoomBox = el("div", "map-zoom");
  const zoomIn = el("button", null, "+");
  zoomIn.type = "button";
  zoomIn.setAttribute("aria-label", "Zoom in");
  const zoomOut = el("button", null, "−");
  zoomOut.type = "button";
  zoomOut.setAttribute("aria-label", "Zoom out");
  zoomBox.append(zoomIn, zoomOut);
  const resetBtn = el("button", "btn-small", "Reset");
  resetBtn.type = "button";
  resetBtn.title = "Reset the view and selection";
  const tableBtn = el("button", "btn-small", "Table");
  tableBtn.type = "button";
  tableBtn.setAttribute("aria-pressed", "false");
  tableBtn.title = "List the airports shown on the map";
  right.append(figC, zoomBox, resetBtn, tableBtn);
  toolbar.append(left, right);

  const zoom = d3
    .zoom()
    .scaleExtent([1, 28])
    .on("start", () => stateLayer.attr("filter", null))
    .on("zoom", (event) => {
      transform = event.transform;
      zoomLayer.attr("transform", transform);
      schedule();
    })
    .on("end", () => {
      stateLayer.attr("filter", "url(#map-shadow)");
      placeLabels();
    });
  svg.call(zoom).on("dblclick.zoom", null);

  function schedule() {
    cancelAnimationFrame(frameRequest);
    frameRequest = requestAnimationFrame(() => {
      drawCanvas();
      drawFocus();
      placeLabels();
    });
  }

  zoomIn.addEventListener("click", () => svg.transition().duration(350).call(zoom.scaleBy, 1.8));
  zoomOut.addEventListener("click", () => svg.transition().duration(350).call(zoom.scaleBy, 1 / 1.8));
  resetBtn.addEventListener("click", () => {
    view.selected = null;
    view.selectedState = null;
    stateLayer.selectAll("path").classed("is-selected", false);
    svg.transition().duration(600).call(zoom.transform, d3.zoomIdentity);
    drawFocus();
    renderNational();
  });
  tableBtn.addEventListener("click", () => {
    const on = tableWrap.hidden;
    tableWrap.hidden = !on;
    tableBtn.setAttribute("aria-pressed", String(on));
    if (on) renderAirportTable();
  });
  figC.addEventListener("click", () => {
    view.bids = true;
    bidToggle.checked = true;
    drawCanvas();
    renderLegend();
    const feats = ["TN", "SC"].map((code) => stateByCode.get(code));
    const bounds = feats.map((f) => path.bounds(f));
    const x0 = d3.min(bounds, (b) => b[0][0]);
    const y0 = d3.min(bounds, (b) => b[0][1]);
    const x1 = d3.max(bounds, (b) => b[1][0]);
    const y1 = d3.max(bounds, (b) => b[1][1]);
    const k = Math.max(1, Math.min(10, 0.8 / Math.max((x1 - x0) / W, (y1 - y0) / H)));
    svg.transition().duration(900).call(zoom.transform, d3.zoomIdentity.translate(W / 2, H / 2).scale(k).translate(-(x0 + x1) / 2, -(y0 + y1) / 2));
  });
  playBtn.addEventListener("click", () => {
    if (playTimer) {
      stopPlay();
      return;
    }
    if (view.size !== "est") {
      view.size = "est";
      sizeControl.set("est");
      reportBox.hidden = false;
    }
    playBtn.setAttribute("aria-pressed", "true");
    playBtn.textContent = "❚❚ Pause";
    let i = view.report >= reports.length - 1 ? 0 : view.report + 1;
    const stepFn = () => {
      setReport(i);
      reportControl.set(i);
      if (i >= reports.length - 1) {
        playTimer = setTimeout(stopPlay, 1200);
        return;
      }
      i += 1;
      playTimer = setTimeout(stepFn, 1500);
    };
    stepFn();
  });

  function stopPlay() {
    clearTimeout(playTimer);
    playTimer = 0;
    playBtn.setAttribute("aria-pressed", "false");
    playBtn.textContent = "▶ Play reports";
    setTimeout(() => {
      if (!playTimer) yearTag.hidden = true;
    }, 1600);
  }

  function setReport(i) {
    view.report = i;
    yearTag.replaceChildren(el("span", null, "NPIAS report"), el("strong", null, reportLabel(reports[i])));
    yearTag.hidden = false;
    rebuildSizes(true);
    rebuildVisible();
    renderLegend();
    if (!tableWrap.hidden) renderAirportTable();
    if (view.selected) renderAirportDetail(view.selected);
  }

  function layout() {
    W = Math.floor(stage.clientWidth);
    if (!W) return false;
    H = Math.round(Math.max(340, Math.min(700, W * 0.62)));
    stage.style.height = `${H}px`;
    dpr = window.devicePixelRatio || 1;
    canvas.width = Math.round(W * dpr);
    canvas.height = Math.round(H * dpr);
    canvas.style.width = `${W}px`;
    canvas.style.height = `${H}px`;
    svg.attr("width", W).attr("height", H).attr("viewBox", `0 0 ${W} ${H}`);
    overlay.attr("width", W).attr("height", H).attr("viewBox", `0 0 ${W} ${H}`);
    projection = d3.geoIdentity().reflectY(true).fitExtent([[16, 16], [W - 16, H - 16]], data.states);
    path = d3.geoPath(projection);
    const dfw = byId.get("DFW");
    const origin = dfw ? projection([dfw.x, dfw.y]) : [W / 2, H / 2];
    let far = 1;
    airports.forEach((a) => {
      const p = projection([a.x, a.y]);
      a.px = p[0];
      a.py = p[1];
      a.dist = Math.hypot(p[0] - origin[0], p[1] - origin[1]);
      far = Math.max(far, a.dist);
    });
    airports.forEach((a) => {
      a.wave = a.dist / far;
    });
    bidAirports.forEach((b) => {
      const p = projection([b.x, b.y]);
      b.px = p[0];
      b.py = p[1];
    });
    maxR = Math.max(9, Math.min(26, W / 42));
    zoom.translateExtent([[0, 0], [W, H]]).extent([[0, 0], [W, H]]);
    return true;
  }

  function drawStates() {
    stateLayer
      .selectAll("path")
      .data(states, (f) => f.properties.state)
      .join("path")
      .attr("class", "state-path")
      .attr("d", path)
      .classed("is-selected", (f) => f.properties.state === view.selectedState);
    frameLayer
      .selectAll("rect")
      .data(["AK", "HI", "PR"].map((code) => stateByCode.get(code)).filter(Boolean))
      .join("rect")
      .attr("class", "inset-frame")
      .each(function (f) {
        const [[x0, y0], [x1, y1]] = path.bounds(f);
        d3.select(this).attr("x", x0 - 10).attr("y", y0 - 10).attr("width", x1 - x0 + 20).attr("height", y1 - y0 + 20).attr("rx", 8);
      });
    paintStates();
  }

  function stateFill(f) {
    const p = f.properties;
    if (view.fill === "iija") return pal.green[binIndex(p.iija, IIJA_BINS)];
    if (view.fill === "change") return pal.stateChange[binIndex(p.changePct, CHANGE_BINS)];
    return t.land;
  }

  function paintStates() {
    stateLayer.selectAll("path").attr("fill", stateFill);
  }

  function airportColor(a) {
    if (view.color === "class") return pal.classes[a.hub <= 1 ? 0 : a.hub <= 3 ? 1 : 2];
    if (view.color === "atp") return a.atp > 0 ? pal.orange[binIndex(a.atp, ATP_BINS) + 1] : pal.orange[0];
    if (a.chg === null || a.chg === undefined) return null;
    return pal.points[binIndex(a.chg, CHANGE_BINS)];
  }

  function recolor() {
    airports.forEach((a) => {
      a.fill = airportColor(a);
    });
  }

  function rebuildSizes(animate) {
    const opt = SIZE[view.size];
    sizeScale = d3.scaleSqrt().domain([0, opt.max() || 1]).range([0, maxR]);
    airports.forEach((a) => {
      const target = Math.max(a.hub <= 4 ? 2.2 : 1.5, sizeScale(opt.value(a)));
      a.rFrom = animate ? a.rDraw || target : target;
      a.rTo = target;
      if (!animate) a.rDraw = target;
    });
    if (animate && !reducedMotion()) {
      cancelAnimationFrame(radiusAnim);
      const start = performance.now();
      const tick = (now) => {
        const e = easeOut((now - start) / 700);
        airports.forEach((a) => {
          a.rDraw = a.rFrom + (a.rTo - a.rFrom) * e;
        });
        drawCanvas();
        drawFocus();
        if (e < 1) radiusAnim = requestAnimationFrame(tick);
        else placeLabels();
      };
      radiusAnim = requestAnimationFrame(tick);
    } else {
      airports.forEach((a) => {
        a.rDraw = a.rTo;
      });
    }
  }

  function rebuildVisible() {
    visible = airports.filter((a) => view.classes.has(a.hub)).sort((a, b) => b.rTo - a.rTo);
    quadtree = d3
      .quadtree()
      .x((a) => a.px)
      .y((a) => a.py)
      .addAll(visible);
  }

  function screen(a) {
    return [transform.applyX(a.px), transform.applyY(a.py)];
  }

  function radius(a) {
    return a.rDraw * Math.sqrt(transform.k);
  }

  function drawCanvas() {
    ctx.setTransform(dpr, 0, 0, dpr, 0, 0);
    ctx.clearRect(0, 0, W, H);
    const grow = Math.sqrt(transform.k);
    for (const a of visible) {
      const local = introT >= 1 ? 1 : easeOut((introT - a.wave * 0.6) / 0.4);
      if (local <= 0) continue;
      const sx = transform.applyX(a.px);
      const sy = transform.applyY(a.py);
      const r = a.rDraw * grow * local;
      if (sx < -r - 4 || sx > W + r + 4 || sy < -r - 4 || sy > H + r + 4) continue;
      ctx.beginPath();
      ctx.arc(sx, sy, Math.max(0.1, r), 0, Math.PI * 2);
      if (a.fill) {
        ctx.globalAlpha = 0.92 * local;
        ctx.fillStyle = a.fill;
        ctx.fill();
        ctx.globalAlpha = local;
        ctx.lineWidth = r > 5 ? 1.5 : 0.8;
        ctx.strokeStyle = t.surface;
        ctx.stroke();
      } else {
        ctx.globalAlpha = local;
        ctx.lineWidth = 1;
        ctx.strokeStyle = t.muted;
        ctx.stroke();
      }
      if (view.color !== "atp" && a.atp > 0 && r >= 3) {
        ctx.beginPath();
        ctx.arc(sx, sy, r + 1.6, 0, Math.PI * 2);
        ctx.lineWidth = 1;
        ctx.globalAlpha = 0.55 * local;
        ctx.strokeStyle = t.ink;
        ctx.stroke();
      }
      ctx.globalAlpha = 1;
    }
    if (view.bids) {
      const grow2 = Math.pow(transform.k, 0.35);
      for (const b of bidAirports) {
        const sx = transform.applyX(b.px);
        const sy = transform.applyY(b.py);
        const s = (3.2 + Math.sqrt(b.projects) * 1.5) * grow2;
        ctx.beginPath();
        ctx.moveTo(sx, sy - s);
        ctx.lineTo(sx + s, sy);
        ctx.lineTo(sx, sy + s);
        ctx.lineTo(sx - s, sy);
        ctx.closePath();
        ctx.fillStyle = b.ratio === null || b.ratio === undefined ? t.surface : pal.ratio[binIndex(b.ratio, RATIO_BINS)];
        ctx.fill();
        ctx.lineWidth = 1.1;
        ctx.strokeStyle = t.ink;
        ctx.stroke();
      }
    }
  }

  function runIntro() {
    if (reducedMotion()) {
      introT = 1;
      drawCanvas();
      return;
    }
    const start = performance.now();
    const tick = (now) => {
      introT = Math.min(1, (now - start) / 1500);
      drawCanvas();
      if (introT < 1) requestAnimationFrame(tick);
      else placeLabels();
    };
    requestAnimationFrame(tick);
  }

  function findAirport(mx, my) {
    if (!quadtree) return null;
    const [x0, y0] = transform.invert([mx, my]);
    const k = transform.k;
    const reach = (maxR * Math.sqrt(k) + 8) / k;
    let best = null;
    let bestScore = Infinity;
    quadtree.visit((node, x1, y1, x2, y2) => {
      if (!node.length) {
        let leaf = node;
        do {
          const a = leaf.data;
          const dist = Math.hypot(a.px - x0, a.py - y0) * k;
          const r = radius(a);
          const score = dist <= r ? r : dist - r <= 7 ? 1000 + dist - r : Infinity;
          if (score < bestScore) {
            bestScore = score;
            best = a;
          }
          leaf = leaf.next;
        } while (leaf);
      }
      return x1 > x0 + reach || x2 < x0 - reach || y1 > y0 + reach || y2 < y0 - reach;
    });
    return best;
  }

  function findBid(mx, my) {
    const grow2 = Math.pow(transform.k, 0.35);
    let best = null;
    let bestDist = Infinity;
    bidAirports.forEach((b) => {
      const [sx, sy] = screen(b);
      const s = (3.2 + Math.sqrt(b.projects) * 1.5) * grow2 + 3;
      const d = Math.abs(sx - mx) + Math.abs(sy - my);
      if (d <= s && d < bestDist) {
        bestDist = d;
        best = b;
      }
    });
    return best;
  }

  function drawFocus() {
    focusLayer.selectAll("*").remove();
    const ring = (a, extra, cls) => {
      if (!a || !view.classes.has(a.hub)) return;
      const [sx, sy] = screen(a);
      focusLayer.append("circle").attr("class", cls).attr("cx", sx).attr("cy", sy).attr("r", radius(a) + extra);
    };
    if (hoverAirport && hoverAirport !== view.selected) ring(hoverAirport, 2.5, "map-focus-ring is-hover");
    ring(view.selected, 4, "map-focus-ring");
  }

  function placeLabels() {
    labelLayer.selectAll("*").remove();
    stateLabelLayer.selectAll("*").remove();
    if (!W || !sizeScale || !path || introT < 1) return;
    const k = transform.k;
    const boxes = [];
    const hits = (b) => boxes.some((o) => b.x0 < o.x1 && b.x1 > o.x0 && b.y0 < o.y1 && b.y1 > o.y0);
    if (k >= 2) {
      states.forEach((f) => {
        const c = path.centroid(f);
        if (!Number.isFinite(c[0])) return;
        if (path.area(f) * k * k < 5000) return;
        const sx = transform.applyX(c[0]);
        const sy = transform.applyY(c[1]);
        if (sx < 20 || sx > W - 20 || sy < 12 || sy > H - 8) return;
        const text = f.properties.name.toUpperCase();
        const w = textWidth(text, 10, 600) + text.length * 0.5;
        const b = { x0: sx - w / 2, x1: sx + w / 2, y0: sy - 9, y1: sy + 2 };
        if (hits(b)) return;
        boxes.push(b);
        stateLabelLayer.append("text").attr("class", "map-label state").attr("x", sx).attr("y", sy).attr("text-anchor", "middle").text(text);
      });
    }
    const grow = Math.sqrt(k);
    const threshold = Math.max(2.2, 8 - k * 1.2);
    const budget = Math.round(10 + (W / 110) * Math.min(k, 6));
    const candidates = [];
    if (view.selected && view.classes.has(view.selected.hub)) candidates.push(view.selected);
    const dfw = byId.get("DFW");
    if (dfw && view.classes.has(dfw.hub) && dfw !== view.selected) candidates.push(dfw);
    for (const a of visible) {
      if (a.rDraw * grow < threshold) break;
      if (a !== view.selected && a !== dfw) candidates.push(a);
    }
    let placed = 0;
    for (const a of candidates) {
      if (placed >= budget) break;
      const [sx, sy] = screen(a);
      if (!Number.isFinite(sx) || sx < 0 || sx > W || sy < 0 || sy > H) continue;
      const r = radius(a);
      const selected = a === view.selected;
      const text = selected ? `${a.id} · ${truncate(a.name, 30)}` : a.id;
      const w = textWidth(text, 11, 650) + 2;
      const tries = [
        [sx + r + 3, sy + 4, "start"],
        [sx - r - 3, sy + 4, "end"],
        [sx, sy - r - 4, "middle"],
        [sx, sy + r + 12, "middle"],
      ];
      for (const [lx, ly, anchor] of tries) {
        const x0 = anchor === "end" ? lx - w : anchor === "middle" ? lx - w / 2 : lx;
        const b = { x0, x1: x0 + w, y0: ly - 10, y1: ly + 3 };
        if (b.x0 < 2 || b.x1 > W - 2 || b.y0 < 2 || b.y1 > H - 2) continue;
        if (!selected && hits(b)) continue;
        boxes.push(b);
        labelLayer.append("text").attr("class", "map-label").attr("x", lx).attr("y", ly).attr("text-anchor", anchor).text(text);
        placed += 1;
        break;
      }
    }
  }

  function redraw() {
    recolor();
    drawCanvas();
    drawFocus();
    placeLabels();
    renderLegend();
    if (!tableWrap.hidden) renderAirportTable();
  }

  function setHover(a, f) {
    if (a !== hoverAirport) {
      hoverAirport = a;
      drawFocus();
    }
    if (f !== hoverState) {
      hoverState = f;
      stateLayer.selectAll("path").classed("is-hover", (d) => d === f);
    }
  }

  function airportTip(event, a) {
    const shown = view.size === "est" && view.report !== 4 ? { value: money(a.est[view.report]), label: `Estimate, ${reportLabel(reports[view.report])} report`, focus: true } : null;
    showTip(event, {
      title: `${a.name} (${a.id})`,
      subtitle: `${a.city ? `${a.city}, ` : ""}${a.st} · ${hubs[a.hub]}`,
      rows: [
        shown,
        { value: money(a.est[4]), label: "Estimate, 2025 to 2029 report", color: a.fill || t.muted, shape: "dot" },
        { value: money(a.est[2]), label: "Estimate, 2021 to 2025 report" },
        { value: a.chg === null || a.chg === undefined ? "n/a" : pct(a.chg), label: "Change between the two reports" },
        { value: money(a.aig), label: "AIG allocations, FY2022 to FY2026" },
        { value: money(a.atp), label: "ATP awards, FY2022 to FY2026" },
        a.enpl ? { value: compactCount(a.enpl), label: "Enplanements, 2019" } : null,
      ],
      note: "Click for details",
    });
  }

  function stateTip(event, f) {
    const p = f.properties;
    showTip(event, {
      title: p.name,
      rows: [
        { value: money(p.iija), label: "AIG and ATP, FY2022 to FY2026", color: stateFill(f), shape: "dot" },
        { value: money(p.need25), label: "NPIAS need, 2025 to 2029 report" },
        { value: money(p.need21), label: "NPIAS need, 2021 to 2025 report" },
        { value: `${money(p.change)} (${pct(p.changePct)})`, label: "Change in need" },
      ],
      note: "Click to zoom in and list airports",
    });
  }

  function bidTip(event, b) {
    showTip(event, {
      title: b.name,
      subtitle: `${b.id} · ${STATE_NAME[b.st] || b.st} bid tabulations`,
      rows: [
        { value: count(b.projects), label: "Projects" },
        { value: count(b.withEst), label: "Projects with an engineer’s estimate" },
        { value: b.ratio === null || b.ratio === undefined ? "n/a" : num(b.ratio, 2), label: "Median low bid relative to estimate" },
        { value: b.years[0] === b.years[1] ? String(b.years[0]) : `${b.years[0]} to ${b.years[1]}`, label: "Bid years" },
      ],
    });
  }

  svg.on("pointermove", (event) => {
    const [mx, my] = d3.pointer(event, stage);
    if (view.bids) {
      const b = findBid(mx, my);
      if (b) {
        setHover(null, null);
        svg.style("cursor", "default");
        bidTip(event, b);
        return;
      }
    }
    const a = findAirport(mx, my);
    if (a) {
      setHover(a, null);
      svg.style("cursor", "pointer");
      airportTip(event, a);
      return;
    }
    svg.style("cursor", null);
    const target = event.target;
    const f = target && target.classList && target.classList.contains("state-path") ? d3.select(target).datum() : null;
    setHover(null, f);
    if (f) stateTip(event, f);
    else hideTip();
  });
  svg.on("pointerleave", () => {
    setHover(null, null);
    hideTip();
  });
  svg.on("click", (event) => {
    const [mx, my] = d3.pointer(event, stage);
    const a = findAirport(mx, my);
    if (a) {
      selectAirport(a, false);
      return;
    }
    const target = event.target;
    const f = target && target.classList && target.classList.contains("state-path") ? d3.select(target).datum() : null;
    if (f) selectState(f);
  });

  function zoomToPoint(a, k) {
    svg.transition().duration(750).call(zoom.transform, d3.zoomIdentity.translate(W / 2, H / 2).scale(k).translate(-a.px, -a.py));
  }

  function zoomToFeature(f) {
    const [[x0, y0], [x1, y1]] = path.bounds(f);
    const k = Math.max(1, Math.min(14, 0.82 / Math.max((x1 - x0) / W, (y1 - y0) / H)));
    svg.transition().duration(750).call(zoom.transform, d3.zoomIdentity.translate(W / 2, H / 2).scale(k).translate(-(x0 + x1) / 2, -(y0 + y1) / 2));
  }

  function selectAirport(a, zoomTo) {
    if (!a) return;
    view.selected = a;
    view.selectedState = null;
    stateLayer.selectAll("path").classed("is-selected", false);
    if (!view.classes.has(a.hub)) {
      view.classes.add(a.hub);
      classChips.set(view.classes);
      rebuildVisible();
      drawCanvas();
    }
    if (zoomTo) zoomToPoint(a, Math.max(transform.k, 6));
    drawFocus();
    placeLabels();
    renderAirportDetail(a);
  }

  function selectState(f) {
    view.selectedState = f.properties.state;
    view.selected = null;
    stateLayer.selectAll("path").classed("is-selected", (d) => d === f);
    zoomToFeature(f);
    drawFocus();
    renderStateDetail(f);
  }

  function detailHeader(kicker, title, sub) {
    detail.replaceChildren(el("p", "detail-kicker", kicker), el("h3", "detail-title", title));
    if (sub) detail.append(el("p", "detail-sub", sub));
  }

  function backButton() {
    const b = el("button", "btn ghost", "Back to national view");
    b.type = "button";
    b.addEventListener("click", () => resetBtn.click());
    return b;
  }

  function renderNational() {
    detailHeader("United States", "IIJA dollars and airport estimates", "NPIAS airports with a reference point in the 50 states, DC, and Puerto Rico");
    const big = el("div", "detail-big");
    big.append(
      bigItem(money(data.summary.states_iija_total_bn * 1000), "AIG and ATP, FY2022 to FY2026"),
      bigItem(money(data.summary.need_change_bn * 1000), "Increase in NPIAS need between the 2021 to 2025 and 2025 to 2029 reports"),
    );
    detail.append(big, el("p", "tool-sub", "Largest increases in need"));
    const list = el("ul", "detail-list");
    states
      .slice()
      .sort((a, b) => b.properties.change - a.properties.change)
      .slice(0, 8)
      .forEach((f) => {
        const p = f.properties;
        const li = el("li");
        const b = el("button");
        b.type = "button";
        b.append(el("span", "dl-name", p.name), el("span", "dl-value", money(p.change)), el("span", "dl-sub", `IIJA dollars ${money(p.iija)}`), el("span", "dl-sub", pct(p.changePct)));
        b.addEventListener("click", () => selectState(f));
        li.append(b);
        list.append(li);
      });
    detail.append(list, el("p", "chart-note", "Click a state or an airport on the map, or search for an airport above. Rings mark airports with Airport Terminals Program awards. Press play to watch estimates change across the five NPIAS reports."));
  }

  function miniLine(values, labels, color, highlight) {
    const width = Math.max(220, detail.clientWidth - 40);
    const height = 128;
    const m = { top: 14, right: 14, bottom: 22, left: 44 };
    const node = d3.create("svg").attr("width", width).attr("height", height).attr("viewBox", `0 0 ${width} ${height}`).attr("class", "chart-svg");
    const g = node.append("g").attr("transform", `translate(${m.left},${m.top})`);
    const w = width - m.left - m.right;
    const h = height - m.top - m.bottom;
    const x = d3.scalePoint().domain(labels).range([0, w]).padding(0.2);
    const y = d3.scaleLinear().domain([0, d3.max(values.filter((v) => v !== null)) || 1]).nice(4).range([h, 0]);
    g.append("g").attr("class", "axis").call(d3.axisLeft(y).ticks(4).tickSize(-w).tickFormat((v) => (v === 0 ? "0" : money(v))));
    g.append("g").attr("class", "axis no-grid").attr("transform", `translate(0,${h})`).call(d3.axisBottom(x).tickSize(0).tickPadding(7));
    const pts = values.map((v, i) => ({ v, label: labels[i], i })).filter((p) => p.v !== null);
    g.append("path")
      .attr("class", "draw")
      .attr("d", d3.line().x((p) => x(p.label)).y((p) => y(p.v))(pts))
      .attr("fill", "none")
      .attr("stroke", color)
      .attr("stroke-width", 2)
      .attr("stroke-linejoin", "round");
    g.selectAll("circle")
      .data(pts)
      .join("circle")
      .attr("cx", (p) => x(p.label))
      .attr("cy", (p) => y(p.v))
      .attr("r", (p) => (p.i === highlight ? 5.5 : 4))
      .attr("fill", color)
      .attr("stroke", (p) => (p.i === highlight ? t.ink : t.surface))
      .attr("stroke-width", 2)
      .on("pointerenter pointermove", (event, p) => showTip(event, { title: `${p.label} report`, rows: [{ value: money(p.v), label: "Five-year estimate" }] }))
      .on("pointerleave", hideTip);
    return node.node();
  }

  function miniBars(rows) {
    const box = el("div", "mini-bars");
    const top = d3.max(rows, (r) => r.value) || 1;
    rows.forEach((r) => {
      const track = el("span", "mb-track");
      const fill = el("span", "mb-fill");
      fill.style.width = `${Math.max(0, (100 * r.value) / top)}%`;
      fill.style.setProperty("--c", r.color);
      track.append(fill);
      box.append(el("span", "mb-label", r.label), track, el("span", "mb-value", r.text));
    });
    return box;
  }

  function renderAirportDetail(a) {
    detailHeader(hubs[a.hub], a.name, `${a.id} · ${a.city ? `${a.city}, ` : ""}${a.st}`);
    const big = el("div", "detail-big");
    big.append(bigItem(money(a.est[4]), "Estimate, 2025 to 2029 report"), bigItem(a.chg === null || a.chg === undefined ? "n/a" : pct(a.chg), "Change from the 2021 to 2025 report"));
    detail.append(big, el("p", "tool-sub", "Five-year estimate by NPIAS report"));
    const chart = miniLine(a.est, reports.map(reportShort), t.series[0], view.size === "est" ? view.report : 4);
    detail.append(chart);
    intro(chart);
    detail.append(el("p", "tool-sub", "IIJA dollars, FY2022 to FY2026"));
    detail.append(
      miniBars([
        { label: "AIG", value: a.aig || 0, text: money(a.aig), color: t.series[0] },
        { label: "ATP", value: a.atp || 0, text: money(a.atp), color: t.series[1] },
      ]),
    );
    if (a.enpl) detail.append(el("p", "chart-note", `${count(a.enpl)} enplanements in 2019.`));
    const actions = el("div", "detail-actions");
    const explore = el("button", "btn", "Open in airport explorer");
    explore.type = "button";
    explore.addEventListener("click", () => {
      emit("explore", { id: a.id });
      openPanel("tools");
    });
    const zoomBtn = el("button", "btn ghost", "Zoom to airport");
    zoomBtn.type = "button";
    zoomBtn.addEventListener("click", () => zoomToPoint(a, Math.max(transform.k, 8)));
    actions.append(explore, zoomBtn, backButton());
    detail.append(actions);
  }

  function renderStateDetail(f) {
    const p = f.properties;
    const inState = airports.filter((a) => a.st === p.state);
    const commercial = inState.filter((a) => a.hub <= 4).length;
    detailHeader("State", p.name, `${count(inState.length)} NPIAS airports on the map, ${count(commercial)} commercial service`);
    const big = el("div", "detail-big");
    big.append(bigItem(money(p.iija), "AIG and ATP, FY2022 to FY2026"), bigItem(money(p.change), `Change in NPIAS need (${pct(p.changePct)})`));
    detail.append(big);
    detail.append(
      miniBars([
        { label: "2021 to 2025 report", value: p.need21, text: money(p.need21), color: t.other },
        { label: "2025 to 2029 report", value: p.need25, text: money(p.need25), color: t.series[0] },
        { label: "AIG", value: p.aig, text: money(p.aig), color: t.series[2] },
        { label: "ATP", value: p.atp, text: money(p.atp), color: t.series[1] },
      ]),
    );
    detail.append(el("p", "tool-sub", "Largest airport estimates, 2025 to 2029 report"));
    const list = el("ul", "detail-list");
    inState
      .filter((a) => a.est[4])
      .sort((a, b) => b.est[4] - a.est[4])
      .slice(0, 10)
      .forEach((a) => {
        const li = el("li");
        const b = el("button");
        b.type = "button";
        b.append(el("span", "dl-name", `${a.name} (${a.id})`), el("span", "dl-value", money(a.est[4])), el("span", "dl-sub", hubs[a.hub]), el("span", "dl-sub", a.chg === null || a.chg === undefined ? "n/a" : pct(a.chg)));
        b.addEventListener("click", () => selectAirport(a, true));
        li.append(b);
        list.append(li);
      });
    const actions = el("div", "detail-actions");
    actions.append(backButton());
    detail.append(list, actions);
  }

  function renderLegend() {
    legendBox.replaceChildren();
    if (view.color === "change") legendBox.append(scaleLegend("Circle color: change in estimate, 2021 to 2025 report to 2025 to 2029 report", pal.points, CHANGE_EDGES));
    if (view.color === "atp") legendBox.append(scaleLegend("Circle color: ATP awards, FY2022 to FY2026 (gray: none)", pal.orange, ATP_EDGES));
    if (view.color === "class") {
      const block = el("div", "legend-block");
      block.append(el("span", "legend-title", "Circle color: airport class"));
      const row = el("div", "legend-row");
      CLASS_LABELS.forEach((label, i) => {
        const item = el("span");
        const sw = el("span", "legend-swatch legend-dot");
        sw.style.setProperty("--c", pal.classes[i]);
        item.append(sw, document.createTextNode(label));
        row.append(item);
      });
      block.append(row);
      legendBox.append(block);
    }
    const opt = SIZE[view.size];
    const sizeBlock = el("div", "legend-block legend-sizes");
    sizeBlock.append(el("span", "legend-title", opt.title()));
    const refs = opt.refs.filter((v) => sizeScale(v) <= maxR * 1.05);
    const rMax = sizeScale(refs[refs.length - 1]);
    const width = refs.reduce((acc, v) => acc + sizeScale(v) * 2 + 34, 0);
    const node = d3.create("svg").attr("width", width).attr("height", rMax * 2 + 16);
    let cx = 0;
    refs.forEach((v) => {
      const r = sizeScale(v);
      node.append("circle").attr("cx", cx + r).attr("cy", rMax * 2 - r + 1).attr("r", r).attr("fill", "none").attr("stroke", t.ink2).attr("stroke-width", 1);
      node.append("text").attr("class", "tick-label").attr("x", cx + r).attr("y", rMax * 2 + 13).attr("text-anchor", "middle").text(opt.format(v));
      cx += r * 2 + 34;
    });
    sizeBlock.append(node.node());
    legendBox.append(sizeBlock);
    if (view.fill === "iija") legendBox.append(scaleLegend("State fill: AIG and ATP dollars, FY2022 to FY2026", pal.green, IIJA_EDGES));
    if (view.fill === "change") legendBox.append(scaleLegend("State fill: change in NPIAS need", pal.stateChange, CHANGE_EDGES));
    const marks = el("div", "legend-block");
    marks.append(el("span", "legend-title", "Marks"));
    const row = el("div", "legend-row");
    if (view.color !== "atp") {
      const ring = el("span");
      const sw = el("span", "legend-swatch legend-ring");
      sw.style.setProperty("--c", t.ink2);
      ring.append(sw, document.createTextNode("Ring: ATP award"));
      row.append(ring);
    }
    if (view.color === "change") {
      const hollow = el("span");
      const sw = el("span", "legend-swatch legend-ring");
      sw.style.setProperty("--c", t.muted);
      hollow.append(sw, document.createTextNode("No estimate in one of the reports"));
      row.append(hollow);
    }
    marks.append(row);
    if (row.childNodes.length) legendBox.append(marks);
    if (view.bids) legendBox.append(scaleLegend("Diamonds (Fig. 2c): median low bid relative to the engineer’s estimate", pal.ratio, RATIO_EDGES));
  }

  function renderAirportTable() {
    const rows = visible
      .filter((a) => a.est[4] || a.est[2])
      .slice()
      .sort((a, b) => (b.est[4] || 0) - (a.est[4] || 0))
      .slice(0, 300)
      .map((a) => [
        `${a.name} (${a.id})`,
        a.st,
        hubs[a.hub],
        ...a.est.map((v) => ({ text: money(v), sort: v ?? -1 })),
        { text: a.chg === null || a.chg === undefined ? "n/a" : pct(a.chg), sort: a.chg ?? -1e9 },
        { text: money(a.aig), sort: a.aig ?? 0 },
        { text: money(a.atp), sort: a.atp ?? 0 },
      ]);
    renderTable(tableWrap, {
      caption: `Largest estimates among the airport classes shown (${count(rows.length)} airports). Click a column to sort.`,
      columns: [{ label: "Airport" }, { label: "State" }, { label: "Class" }, ...reports.map((r) => ({ label: reportLabel(r), num: true })), { label: "Change", num: true }, { label: "AIG, FY2022 to FY2026", num: true }, { label: "ATP, FY2022 to FY2026", num: true }],
      rows,
    });
  }

  function full() {
    if (!layout()) return;
    transform = d3.zoomIdentity;
    drawStates();
    rebuildSizes(false);
    rebuildVisible();
    svg.call(zoom.transform, d3.zoomIdentity);
    redraw();
  }

  let lastWidth = 0;
  new ResizeObserver(() => {
    const width = Math.floor(stage.clientWidth);
    if (!width || width === lastWidth) return;
    lastWidth = width;
    full();
  }).observe(stage);

  onTheme(() => {
    t = tokens();
    pal = palettes(t);
    paintStates();
    redraw();
    butterfly.render();
    if (view.selected) renderAirportDetail(view.selected);
    else if (view.selectedState) renderStateDetail(stateByCode.get(view.selectedState));
  });

  const top14 = states
    .slice()
    .sort((a, b) => b.properties.change - a.properties.change)
    .slice(0, 14);
  const butterfly = card(document.getElementById("map-states"), {
    figure: "Fig. 2b",
    title: "IIJA dollars and the increase in five-year need by state",
    subtitle: "The 14 states with the largest increases between the 2021 to 2025 and 2025 to 2029 NPIAS reports; click a row to show the state on the map",
    note: `All states and territories: ${money(data.summary.states_iija_total_bn * 1000)} in AIG and ATP dollars for FY2022 to FY2026 and a ${money(data.summary.need_change_bn * 1000)} increase in need. Florida, California, and Texas together added $9.2 billion of the increase.`,
    height: () => top14.length * 27 + 46,
    table: () => ({
      caption: "IIJA dollars and the change in NPIAS need by state",
      columns: [{ label: "State" }, { label: "AIG, FY2022 to FY2026", num: true }, { label: "ATP, FY2022 to FY2026", num: true }, { label: "Need, 2021 to 2025 report", num: true }, { label: "Need, 2025 to 2029 report", num: true }, { label: "Change", num: true }],
      rows: states.map((f) => {
        const p = f.properties;
        return [p.name, { text: money(p.aig), sort: p.aig }, { text: money(p.atp), sort: p.atp }, { text: money(p.need21), sort: p.need21 }, { text: money(p.need25), sort: p.need25 }, { text: money(p.change), sort: p.change }];
      }),
    }),
    render: (api, tk) => {
      legend(api.legend, [
        { key: "aig", label: "AIG allocations", color: tk.series[0] },
        { key: "atp", label: "ATP awards", color: tk.series[1] },
        { key: "need", label: "Increase in five-year need", color: tk.series[2] },
      ]);
      const m = { top: 4, right: 8, bottom: 30, left: 8 };
      const w = api.width - m.left - m.right;
      const h = api.height - m.top - m.bottom;
      const g = api.svg.append("g").attr("transform", `translate(${m.left},${m.top})`);
      const nameW = Math.min(150, Math.max(104, w * 0.16));
      const half = (w - nameW) / 2;
      const y = d3.scaleBand().domain(top14.map((f) => f.properties.state)).range([0, h]).padding(0.24);
      const maxIIJA = d3.max(top14, (f) => f.properties.aig + f.properties.atp);
      const maxNeed = d3.max(top14, (f) => f.properties.change);
      const xl = d3.scaleLinear().domain([0, maxIIJA]).nice(4).range([0, half - 44]);
      const xr = d3.scaleLinear().domain([0, maxNeed]).nice(4).range([0, half - 44]);
      const leftEdge = half;
      const rightEdge = half + nameW;
      const narrow = w < 560;
      xl.ticks(narrow ? 2 : 4).forEach((v) => {
        g.append("line").attr("x1", leftEdge - xl(v)).attr("x2", leftEdge - xl(v)).attr("y1", 0).attr("y2", h).attr("stroke", tk.grid);
        g.append("text").attr("class", "tick-label").attr("x", leftEdge - xl(v)).attr("y", h + 16).attr("text-anchor", "middle").text(v === 0 ? "0" : money(v));
      });
      xr.ticks(narrow ? 2 : 4).forEach((v) => {
        g.append("line").attr("x1", rightEdge + xr(v)).attr("x2", rightEdge + xr(v)).attr("y1", 0).attr("y2", h).attr("stroke", tk.grid);
        g.append("text").attr("class", "tick-label").attr("x", rightEdge + xr(v)).attr("y", h + 16).attr("text-anchor", "middle").text(v === 0 ? "0" : money(v));
      });
      g.append("text").attr("class", "axis-title").attr("x", leftEdge / 2).attr("y", h + 29).attr("text-anchor", "middle").text(narrow ? "IIJA dollars" : "AIG and ATP, FY2022 to FY2026");
      g.append("text").attr("class", "axis-title").attr("x", rightEdge + (w - rightEdge) / 2).attr("y", h + 29).attr("text-anchor", "middle").text("Increase in need");
      const bh = Math.min(16, y.bandwidth());
      const rows = g
        .selectAll("g.row")
        .data(top14)
        .join("g")
        .attr("class", "row mark")
        .attr("transform", (f) => `translate(0,${y(f.properties.state) + (y.bandwidth() - bh) / 2})`)
        .style("cursor", "pointer");
      rows.append("rect").attr("x", 0).attr("y", -(y.step() - bh) / 2).attr("width", w).attr("height", y.step()).attr("fill", "transparent");
      rows.each(function (f) {
        const p = f.properties;
        const row = d3.select(this);
        const aigW = xl(p.aig);
        const atpW = xl(p.aig + p.atp) - aigW;
        row.append("path").attr("class", "grow-left").attr("d", barPath(leftEdge - aigW, 0, aigW, bh, atpW > 1 ? 0 : 4, atpW > 1 ? "none" : "left")).attr("fill", tk.series[0]);
        if (atpW > 1) row.append("path").attr("class", "grow-left").attr("d", barPath(leftEdge - aigW - atpW - 2, 0, atpW, bh, 4, "left")).attr("fill", tk.series[1]);
        row.append("text").attr("class", "label").attr("x", leftEdge - aigW - atpW - 7).attr("y", bh / 2 + 4).attr("text-anchor", "end").text(money(p.aig + p.atp));
        row.append("path").attr("class", "grow-x").attr("d", barPath(rightEdge, 0, xr(p.change), bh, 4, "right")).attr("fill", tk.series[2]);
        row.append("text").attr("class", "label").attr("x", rightEdge + xr(p.change) + 6).attr("y", bh / 2 + 4).text(money(p.change));
        row.append("text").attr("class", "label-strong").attr("x", half + nameW / 2).attr("y", bh / 2 + 4).attr("text-anchor", "middle").text(p.name);
      });
      rows
        .on("pointerenter pointermove", (event, f) => {
          rows.classed("is-dim", (o) => o !== f);
          const p = f.properties;
          showTip(event, {
            title: p.name,
            rows: [
              { value: money(p.aig), label: "AIG allocations, FY2022 to FY2026", color: tk.series[0] },
              { value: money(p.atp), label: "ATP awards, FY2022 to FY2026", color: tk.series[1] },
              { value: money(p.need21), label: "need, 2021 to 2025 report" },
              { value: money(p.need25), label: "need, 2025 to 2029 report" },
              { value: `${money(p.change)} (${pct(p.changePct)})`, label: "increase in need", color: tk.series[2], focus: true },
            ],
            note: "Click to show on the map",
          });
        })
        .on("pointerleave", () => {
          rows.classed("is-dim", false);
          hideTip();
        })
        .on("click", (event, f) => {
          openPanel("map");
          setTimeout(() => selectState(f), 450);
        });
    },
  });

  renderNational();
  full();
  butterfly.render();
  onReveal(stage, () => {
    revealed = true;
    runIntro();
  }, 0.25);
  if (!revealed && introT < 1) drawCanvas();
}
