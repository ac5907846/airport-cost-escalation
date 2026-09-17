import { el } from "./dom.js";

let node = null;

function tip() {
  if (!node) node = document.getElementById("tooltip");
  return node;
}

function build({ title, subtitle, rows = [], note }) {
  const frag = document.createDocumentFragment();
  if (title) frag.append(el("div", "tt-title", title));
  if (subtitle) frag.append(el("div", "tt-sub", subtitle));
  const visible = rows.filter(Boolean);
  if (visible.length) {
    const list = el("div", "tt-rows");
    visible.forEach((row) => {
      const line = el("div", `tt-row${row.focus ? " is-focus" : ""}${row.muted ? " is-muted" : ""}`);
      const key = el("span", row.color ? `tt-key${row.shape === "dot" ? " tt-key-dot" : ""}` : "tt-key tt-key-none");
      if (row.color) key.style.background = row.color;
      line.append(key, el("span", "tt-value", row.value), el("span", "tt-label", row.label));
      list.append(line);
    });
    frag.append(list);
  }
  if (note) frag.append(el("div", "tt-note", note));
  return frag;
}

function place(anchor) {
  const t = tip();
  const pad = 14;
  const box = t.getBoundingClientRect();
  const vw = window.innerWidth;
  const vh = window.innerHeight;
  let x;
  let y;
  if (anchor && typeof anchor.clientX === "number" && (anchor.clientX || anchor.clientY)) {
    x = anchor.clientX + pad;
    y = anchor.clientY + pad;
    if (x + box.width > vw - 8) x = anchor.clientX - box.width - pad;
    if (y + box.height > vh - 8) y = anchor.clientY - box.height - pad;
  } else {
    const target = anchor && anchor.getBoundingClientRect ? anchor : anchor && anchor.target;
    const r = target && target.getBoundingClientRect ? target.getBoundingClientRect() : { right: vw / 2, top: vh / 2, left: vw / 2 };
    x = r.right + pad;
    y = r.top;
    if (x + box.width > vw - 8) x = r.left - box.width - pad;
    if (y + box.height > vh - 8) y = vh - box.height - 8;
  }
  x = Math.max(8, Math.min(x, vw - box.width - 8));
  y = Math.max(8, y);
  t.style.transform = `translate(${Math.round(x)}px, ${Math.round(y)}px)`;
}

export function showTip(anchor, content) {
  const t = tip();
  t.replaceChildren(build(content));
  t.hidden = false;
  place(anchor);
}

export function moveTip(anchor) {
  if (!tip().hidden) place(anchor);
}

export function hideTip() {
  tip().hidden = true;
}

export function bindTip(selection, content) {
  selection
    .attr("tabindex", 0)
    .on("pointerenter pointermove", function (event, d) {
      showTip(event, content(d, this));
    })
    .on("pointerleave blur", hideTip)
    .on("focus", function (event, d) {
      showTip(this, content(d, this));
    });
}
