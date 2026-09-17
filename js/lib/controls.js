import { el } from "./dom.js";

let uid = 0;

function holder(container, label, full) {
  if (!label) return { wrap: container, labelId: null };
  const wrap = el("div", `control${full ? " full" : ""}`);
  const id = `control-${(uid += 1)}`;
  const lab = el("span", "control-label", label);
  lab.id = id;
  wrap.append(lab);
  container.append(wrap);
  return { wrap, labelId: id };
}

export function segmented(container, { label, options, value, onChange, small = false, full = false }) {
  const h = holder(container, label, full);
  const group = el("div", `segmented${small ? " small" : ""}`);
  group.setAttribute("role", "radiogroup");
  if (h.labelId) group.setAttribute("aria-labelledby", h.labelId);
  else if (label === undefined && options.ariaLabel) group.setAttribute("aria-label", options.ariaLabel);
  let current = value;
  const buttons = options.map((opt, i) => {
    const b = el("button", null, opt.label);
    b.type = "button";
    b.setAttribute("role", "radio");
    if (opt.title) b.title = opt.title;
    b.addEventListener("click", () => set(opt.value, true));
    b.addEventListener("keydown", (event) => {
      let next = null;
      if (event.key === "ArrowRight" || event.key === "ArrowDown") next = (i + 1) % options.length;
      if (event.key === "ArrowLeft" || event.key === "ArrowUp") next = (i - 1 + options.length) % options.length;
      if (next === null) return;
      event.preventDefault();
      set(options[next].value, true);
      buttons[next].focus();
    });
    group.append(b);
    return b;
  });
  function set(v, fire) {
    const changed = v !== current;
    current = v;
    buttons.forEach((b, i) => {
      const on = options[i].value === v;
      b.setAttribute("aria-checked", String(on));
      b.tabIndex = on ? 0 : -1;
    });
    if (fire && changed && onChange) onChange(v);
  }
  set(value, false);
  h.wrap.append(group);
  return {
    get value() {
      return current;
    },
    set: (v) => set(v, false),
    node: group,
  };
}

export function chips(container, { label, options, values, onChange, max = Infinity, full = false }) {
  const h = holder(container, label, full);
  const group = el("div", "chips");
  group.setAttribute("role", "group");
  if (h.labelId) group.setAttribute("aria-labelledby", h.labelId);
  const selected = new Set(values);
  const nodes = new Map();
  options.forEach((opt) => {
    const b = el("button", "chip");
    b.type = "button";
    const dot = el("span", "chip-dot");
    if (opt.color) dot.style.setProperty("--c", opt.color);
    else dot.hidden = true;
    b.append(dot, document.createTextNode(opt.label));
    if (opt.title) b.title = opt.title;
    b.addEventListener("click", () => {
      if (selected.has(opt.value)) {
        selected.delete(opt.value);
      } else {
        if (selected.size >= max) selected.delete(selected.values().next().value);
        selected.add(opt.value);
      }
      sync();
      if (onChange) onChange(new Set(selected));
    });
    nodes.set(opt.value, { button: b, dot });
    group.append(b);
  });
  function sync() {
    nodes.forEach((n, value) => n.button.setAttribute("aria-pressed", String(selected.has(value))));
  }
  sync();
  h.wrap.append(group);
  return {
    get values() {
      return new Set(selected);
    },
    set(vals) {
      selected.clear();
      vals.forEach((v) => selected.add(v));
      sync();
    },
    setColor(value, color) {
      const n = nodes.get(value);
      if (!n) return;
      n.dot.hidden = !color;
      if (color) n.dot.style.setProperty("--c", color);
    },
    node: group,
  };
}

export function select(container, { label, options, value, onChange, full = false }) {
  const h = holder(container, label, full);
  const s = el("select", "select");
  if (h.labelId) s.setAttribute("aria-labelledby", h.labelId);
  options.forEach((o) => {
    if (o.group) {
      const og = el("optgroup");
      og.label = o.group;
      o.options.forEach((inner) => {
        const op = el("option", null, inner.label);
        op.value = String(inner.value);
        og.append(op);
      });
      s.append(og);
    } else {
      const op = el("option", null, o.label);
      op.value = String(o.value);
      s.append(op);
    }
  });
  s.value = String(value);
  s.addEventListener("change", () => {
    if (onChange) onChange(s.value);
  });
  h.wrap.append(s);
  return s;
}

export function toggle(container, { label, checked, onChange }) {
  const wrap = el("div", "control");
  const lab = el("label", "switch");
  const input = el("input");
  input.type = "checkbox";
  input.checked = checked;
  input.setAttribute("role", "switch");
  lab.append(input, document.createTextNode(label));
  input.addEventListener("change", () => {
    if (onChange) onChange(input.checked);
  });
  wrap.append(lab);
  container.append(wrap);
  return input;
}

export function search(container, { label, placeholder, items, onSelect, limit = 8, full = false }) {
  const h = holder(container, label, full);
  const box = el("div", "search");
  const icon = el("span", "search-icon", "⌕");
  icon.setAttribute("aria-hidden", "true");
  const input = el("input", "text-input");
  input.type = "search";
  input.placeholder = placeholder || "Search";
  input.autocomplete = "off";
  input.spellcheck = false;
  input.setAttribute("role", "combobox");
  input.setAttribute("aria-autocomplete", "list");
  input.setAttribute("aria-expanded", "false");
  if (h.labelId) input.setAttribute("aria-labelledby", h.labelId);
  const list = el("ul", "search-list");
  list.id = `listbox-${(uid += 1)}`;
  list.setAttribute("role", "listbox");
  list.hidden = true;
  input.setAttribute("aria-controls", list.id);
  box.append(icon, input, list);
  h.wrap.append(box);
  let pool = items;
  let matches = [];
  let active = -1;

  function rank(q) {
    const exact = [];
    const starts = [];
    const within = [];
    for (const item of pool) {
      const key = item.key;
      if (item.id && item.id.toLowerCase() === q) exact.push(item);
      else if (key.startsWith(q) || key.includes(` ${q}`)) starts.push(item);
      else if (key.includes(q)) within.push(item);
      if (exact.length + starts.length >= limit * 3) break;
    }
    return [...exact, ...starts, ...within].slice(0, limit);
  }

  function render() {
    list.replaceChildren();
    matches.forEach((item, i) => {
      const li = el("li");
      li.id = `${list.id}-${i}`;
      li.setAttribute("role", "option");
      li.setAttribute("aria-selected", String(i === active));
      li.append(el("span", "search-main", item.label));
      if (item.sub) li.append(el("span", "search-sub", item.sub));
      li.addEventListener("mousedown", (event) => {
        event.preventDefault();
        choose(item);
      });
      list.append(li);
    });
    list.hidden = matches.length === 0;
    input.setAttribute("aria-expanded", String(!list.hidden));
    if (active >= 0) input.setAttribute("aria-activedescendant", `${list.id}-${active}`);
    else input.removeAttribute("aria-activedescendant");
  }

  function update() {
    const q = input.value.trim().toLowerCase();
    active = -1;
    matches = q ? rank(q) : [];
    render();
  }

  function close() {
    matches = [];
    active = -1;
    render();
  }

  function choose(item) {
    if (!item) return;
    input.value = item.label;
    close();
    onSelect(item);
  }

  input.addEventListener("input", update);
  input.addEventListener("focus", () => {
    if (input.value) update();
  });
  input.addEventListener("blur", () => setTimeout(close, 120));
  input.addEventListener("keydown", (event) => {
    if (event.key === "ArrowDown" && matches.length) {
      event.preventDefault();
      active = (active + 1) % matches.length;
      render();
    } else if (event.key === "ArrowUp" && matches.length) {
      event.preventDefault();
      active = (active - 1 + matches.length) % matches.length;
      render();
    } else if (event.key === "Enter") {
      event.preventDefault();
      choose(matches[active >= 0 ? active : 0]);
    } else if (event.key === "Escape") {
      close();
    }
  });

  return {
    input,
    setItems(next) {
      pool = next;
    },
    setValue(text) {
      input.value = text;
    },
  };
}

export function slider(container, { label, min, max, step = 1, value, format = String, onChange, full = false }) {
  const h = holder(container, label, full);
  const row = el("div", "range-row");
  const input = el("input");
  input.type = "range";
  input.min = String(min);
  input.max = String(max);
  input.step = String(step);
  input.value = String(value);
  if (h.labelId) input.setAttribute("aria-labelledby", h.labelId);
  const out = el("output", "range-value", format(value));
  input.addEventListener("input", () => {
    out.textContent = format(Number(input.value));
    input.setAttribute("aria-valuetext", out.textContent);
    if (onChange) onChange(Number(input.value));
  });
  row.append(input, out);
  h.wrap.append(row);
  return input;
}
