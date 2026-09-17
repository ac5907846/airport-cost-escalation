import { el } from "./dom.js";
import { tokens, onTheme } from "./theme.js";
import { hideTip } from "./tooltip.js";

const registry = new Set();
onTheme(() => registry.forEach((api) => api.render()));
const EASE = "cubic-bezier(.2,.75,.25,1)";

export function reducedMotion() {
  return matchMedia("(prefers-reduced-motion: reduce)").matches;
}

export function intro(root) {
  if (!root || reducedMotion() || typeof Element.prototype.animate !== "function") return;
  let i = 0;
  root.querySelectorAll(".grow-y, .grow-down, .grow-x, .grow-left").forEach((node) => {
    const horizontal = node.classList.contains("grow-x") || node.classList.contains("grow-left");
    node.animate([{ transform: horizontal ? "scaleX(0)" : "scaleY(0)" }, { transform: "none" }], { duration: 650, delay: Math.min(520, (i += 1) * 14), easing: EASE, fill: "backwards" });
  });
  root.querySelectorAll(".draw").forEach((node) => {
    const length = typeof node.getTotalLength === "function" ? node.getTotalLength() : 0;
    if (!length) return;
    node.style.strokeDasharray = `${length} ${length}`;
    const anim = node.animate([{ strokeDashoffset: length }, { strokeDashoffset: 0 }], { duration: 1150, delay: 120, easing: EASE, fill: "backwards" });
    anim.onfinish = () => {
      node.style.strokeDasharray = "";
    };
  });
  let j = 0;
  root.querySelectorAll(".pop").forEach((node) => {
    node.animate([{ opacity: 0, transform: "scale(0.2)" }, { opacity: 1, transform: "none" }], { duration: 460, delay: 220 + Math.min(700, (j += 1) * 7), easing: EASE, fill: "backwards" });
  });
  let k = 0;
  root.querySelectorAll(".fade").forEach((node) => {
    node.animate([{ opacity: 0 }, { opacity: 1 }], { duration: 520, delay: 380 + Math.min(500, (k += 1) * 25), easing: "ease-out", fill: "backwards" });
  });
}

export function card(root, opts) {
  root.classList.add("chart-card");
  root.replaceChildren();
  const head = el("figcaption", "chart-head");
  const titles = el("div", "chart-titles");
  const title = el("h4", "chart-title");
  if (opts.figure) {
    const badge = el("span", "fig-badge", opts.figure);
    badge.title = `Corresponds to ${opts.figure.replace("Fig.", "Figure")} in the paper`;
    title.append(badge);
  }
  const titleText = el("span", null, opts.title || "");
  title.append(titleText);
  const sub = el("p", "chart-sub", opts.subtitle || "");
  titles.append(title, sub);
  const tools = el("div", "chart-tools");
  head.append(titles, tools);
  const legendBox = el("div", "chart-legend");
  const body = el("div", "chart-body");
  const tableWrap = el("div", "chart-table");
  tableWrap.hidden = true;
  const note = el("p", "chart-note", opts.note || "");
  root.append(head, legendBox, body, tableWrap, note);
  const svg = d3.select(body).append("svg").attr("class", "chart-svg").attr("role", "img");
  if (opts.title) svg.attr("aria-label", opts.title);
  const api = { root, head, tools, legend: legendBox, body, note, svg, width: 0, height: 0, revealed: false, animateNext: false };
  let tableOn = false;

  function fillTable() {
    renderTable(tableWrap, opts.table(api));
  }

  if (opts.table) {
    const btn = el("button", "tool-btn", "Table");
    btn.type = "button";
    btn.setAttribute("aria-pressed", "false");
    btn.title = "Show the data behind this chart as a table";
    btn.addEventListener("click", () => {
      tableOn = !tableOn;
      btn.setAttribute("aria-pressed", String(tableOn));
      body.hidden = tableOn;
      tableWrap.hidden = !tableOn;
      if (tableOn) fillTable();
      else api.update();
    });
    api.tableButton = btn;
    tools.append(btn);
  }

  api.render = () => {
    if (tableOn) {
      fillTable();
      return;
    }
    const width = Math.floor(body.clientWidth);
    if (!width) return;
    api.width = width;
    const height = typeof opts.height === "function" ? opts.height(width) : opts.height || 300;
    api.height = height;
    svg.attr("width", width).attr("height", height).attr("viewBox", `0 0 ${width} ${height}`);
    svg.selectAll("*").remove();
    hideTip();
    opts.render(api, tokens());
    if (api.animateNext && api.revealed) intro(svg.node());
    api.animateNext = false;
  };
  api.update = () => {
    api.animateNext = true;
    api.render();
  };
  api.setTitle = (text) => {
    titleText.textContent = text;
    svg.attr("aria-label", text);
  };
  api.setSubtitle = (text) => {
    sub.textContent = text;
  };
  api.setNote = (text) => {
    note.textContent = text;
  };
  api.addTool = (node) => {
    if (api.tableButton) tools.insertBefore(node, api.tableButton);
    else tools.append(node);
  };

  let last = 0;
  let frame = 0;
  new ResizeObserver(() => {
    const width = Math.floor(body.clientWidth);
    if (!width || width === last) return;
    last = width;
    cancelAnimationFrame(frame);
    frame = requestAnimationFrame(api.render);
  }).observe(body);
  const observer = new IntersectionObserver(
    (entries) => {
      if (!entries.some((e) => e.isIntersecting)) return;
      observer.disconnect();
      api.revealed = true;
      requestAnimationFrame(api.update);
    },
    { threshold: 0.18 },
  );
  observer.observe(root);
  registry.add(api);
  return api;
}

export function onReveal(node, fn, threshold = 0.2) {
  const observer = new IntersectionObserver(
    (entries) => {
      if (!entries.some((e) => e.isIntersecting)) return;
      observer.disconnect();
      fn();
    },
    { threshold },
  );
  observer.observe(node);
}

export function renderTable(wrap, spec) {
  const { columns, rows, caption } = spec;
  wrap.replaceChildren();
  const table = el("table", "data-table");
  if (caption) table.append(el("caption", null, caption));
  const thead = el("thead");
  const headRow = el("tr");
  const tbody = el("tbody");
  let sortIndex = -1;
  let ascending = true;

  const sortValue = (cell) => {
    if (cell && typeof cell === "object") return cell.sort ?? cell.text;
    return cell;
  };

  function fill() {
    const data = rows.slice();
    if (sortIndex >= 0) {
      data.sort((a, b) => {
        const va = sortValue(a[sortIndex]);
        const vb = sortValue(b[sortIndex]);
        if (va === vb) return 0;
        if (va === null || va === undefined || va === "") return 1;
        if (vb === null || vb === undefined || vb === "") return -1;
        const cmp = typeof va === "number" && typeof vb === "number" ? va - vb : String(va).localeCompare(String(vb));
        return ascending ? cmp : -cmp;
      });
    }
    tbody.replaceChildren(
      ...data.map((row) => {
        const tr = el("tr");
        row.forEach((cell, i) => {
          const td = el("td", columns[i].num ? "num" : null);
          td.textContent = cell && typeof cell === "object" ? cell.text : cell ?? "";
          tr.append(td);
        });
        return tr;
      }),
    );
  }

  columns.forEach((column, i) => {
    const th = el("th", column.num ? "num" : null);
    th.setAttribute("scope", "col");
    const b = el("button", null, column.label);
    b.type = "button";
    b.addEventListener("click", () => {
      if (sortIndex === i) ascending = !ascending;
      else {
        sortIndex = i;
        ascending = !column.num;
      }
      headRow.querySelectorAll("th").forEach((node, j) => {
        node.setAttribute("aria-sort", j === sortIndex ? (ascending ? "ascending" : "descending") : "none");
      });
      fill();
    });
    th.append(b);
    headRow.append(th);
  });
  thead.append(headRow);
  table.append(thead, tbody);
  fill();
  wrap.append(table);
}

export function legend(container, items, { hidden = null, onToggle = null, shape = "rect" } = {}) {
  container.replaceChildren();
  const interactive = Boolean(onToggle && hidden);
  items.forEach((item) => {
    const node = el(interactive ? "button" : "span", "legend-item");
    if (interactive) {
      node.type = "button";
      node.setAttribute("aria-pressed", String(!hidden.has(item.key)));
      node.title = "Click to show or hide. Double click to show only this series.";
      node.addEventListener("click", () => {
        if (hidden.has(item.key)) hidden.delete(item.key);
        else hidden.add(item.key);
        if (hidden.size >= items.length) hidden.clear();
        onToggle(hidden);
      });
      node.addEventListener("dblclick", () => {
        hidden.clear();
        items.forEach((other) => {
          if (other.key !== item.key) hidden.add(other.key);
        });
        onToggle(hidden);
      });
    }
    const swatch = el("span", `legend-swatch legend-${item.shape || shape}`);
    swatch.style.setProperty("--c", item.color);
    node.append(swatch, document.createTextNode(item.label));
    container.append(node);
  });
  if (interactive && hidden.size) {
    const reset = el("button", "legend-reset", "Show all");
    reset.type = "button";
    reset.addEventListener("click", () => {
      hidden.clear();
      onToggle(hidden);
    });
    container.append(reset);
  }
}

export function smallToggle(api, options, value, onChange) {
  if (api.tools.querySelector(".segmented")) return;
  const holder = el("div");
  const group = el("div", "segmented small");
  group.setAttribute("role", "radiogroup");
  let current = value;
  const buttons = options.map((opt) => {
    const b = el("button", null, opt.label);
    b.type = "button";
    b.setAttribute("role", "radio");
    b.addEventListener("click", () => {
      if (current === opt.value) return;
      current = opt.value;
      sync();
      onChange(opt.value);
    });
    group.append(b);
    return b;
  });
  function sync() {
    buttons.forEach((b, i) => {
      b.setAttribute("aria-checked", String(options[i].value === current));
      b.tabIndex = options[i].value === current ? 0 : -1;
    });
  }
  sync();
  holder.append(group);
  api.addTool(group);
}

export function frame(api, margin) {
  const g = api.svg.append("g").attr("transform", `translate(${margin.left},${margin.top})`);
  return { g, w: Math.max(10, api.width - margin.left - margin.right), h: Math.max(10, api.height - margin.top - margin.bottom) };
}

export function yAxis(g, y, { width, ticks = 5, format = null, values = null, className = "" } = {}) {
  const axis = d3.axisLeft(y).tickSize(-width).tickPadding(8);
  if (values) axis.tickValues(values);
  else axis.ticks(ticks);
  if (format) axis.tickFormat(format);
  return g.append("g").attr("class", `axis axis-y ${className}`).call(axis);
}

export function xAxis(g, x, { height, ticks = null, format = null, values = null, tickSize = 0, className = "" } = {}) {
  const axis = d3.axisBottom(x).tickSize(tickSize).tickPadding(tickSize ? 6 : 8);
  if (values) axis.tickValues(values);
  else if (ticks) axis.ticks(ticks);
  if (format) axis.tickFormat(format);
  return g.append("g").attr("class", `axis axis-x no-grid ${className}`).attr("transform", `translate(0,${height})`).call(axis);
}

export function thin(values, width, minSpacing = 52) {
  const step = Math.max(1, Math.ceil((values.length * minSpacing) / Math.max(1, width)));
  return values.filter((v, i) => (values.length - 1 - i) % step === 0);
}

export function barPath(x, y, w, h, r = 4, dir = "up") {
  if (!(w > 0) || !(h > 0)) return "";
  const rr = Math.max(0, Math.min(r, w / 2, h));
  if (dir === "up") return `M${x},${y + h}V${y + rr}Q${x},${y} ${x + rr},${y}H${x + w - rr}Q${x + w},${y} ${x + w},${y + rr}V${y + h}Z`;
  if (dir === "down") return `M${x},${y}V${y + h - rr}Q${x},${y + h} ${x + rr},${y + h}H${x + w - rr}Q${x + w},${y + h} ${x + w},${y + h - rr}V${y}Z`;
  if (dir === "right") return `M${x},${y}H${x + w - rr}Q${x + w},${y} ${x + w},${y + rr}V${y + h - rr}Q${x + w},${y + h} ${x + w - rr},${y + h}H${x}Z`;
  if (dir === "left") return `M${x + w},${y}H${x + rr}Q${x},${y} ${x},${y + rr}V${y + h - rr}Q${x},${y + h} ${x + rr},${y + h}H${x + w}Z`;
  return `M${x},${y}h${w}v${h}h${-w}Z`;
}

export function nearest(values, target) {
  let best = 0;
  let dist = Infinity;
  values.forEach((v, i) => {
    const d = Math.abs(v - target);
    if (d < dist) {
      dist = d;
      best = i;
    }
  });
  return best;
}

export function band(g, x0, x1, h, { fill, label = null, labelY = 10, className = "", align = "start" } = {}) {
  const group = g.append("g").attr("class", `period-band ${className}`);
  group.append("rect").attr("x", Math.min(x0, x1)).attr("y", 0).attr("width", Math.abs(x1 - x0)).attr("height", h).attr("fill", fill);
  if (label) {
    group
      .append("text")
      .attr("class", "band-label")
      .attr("x", align === "end" ? Math.max(x0, x1) - 5 : Math.min(x0, x1) + 5)
      .attr("text-anchor", align === "end" ? "end" : "start")
      .attr("y", labelY)
      .text(label);
  }
  return group;
}

export function spreadLabels(items, { minGap = 13, top = 0, bottom = Infinity } = {}) {
  const sorted = items.slice().sort((a, b) => a.y - b.y);
  sorted.forEach((item, i) => {
    item.ly = Math.max(item.y, i ? sorted[i - 1].ly + minGap : top);
  });
  for (let i = sorted.length - 1; i >= 0; i -= 1) {
    const limit = i === sorted.length - 1 ? bottom : sorted[i + 1].ly - minGap;
    if (sorted[i].ly > limit) sorted[i].ly = limit;
  }
  return sorted;
}

export function textWidth(text, size = 11, weight = 400) {
  const canvas = textWidth.canvas || (textWidth.canvas = document.createElement("canvas"));
  const ctx = canvas.getContext("2d");
  ctx.font = `${weight} ${size}px system-ui, -apple-system, "Segoe UI", sans-serif`;
  return ctx.measureText(text).width;
}

export function median(values) {
  const v = values.filter((x) => Number.isFinite(x)).sort((a, b) => a - b);
  if (!v.length) return null;
  const m = v.length / 2;
  return v.length % 2 ? v[Math.floor(m)] : (v[m - 1] + v[m]) / 2;
}

export function mean(values) {
  const v = values.filter((x) => Number.isFinite(x));
  return v.length ? v.reduce((a, b) => a + b, 0) / v.length : null;
}

export function jitter(i) {
  const s = Math.sin((i + 1) * 12.9898) * 43758.5453;
  return s - Math.floor(s) - 0.5;
}
