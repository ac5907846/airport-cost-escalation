const listeners = new Set();
let cache = null;

const NAMES = {
  page: "--page",
  surface: "--surface",
  raised: "--surface-raised",
  ink: "--ink",
  ink2: "--ink-2",
  muted: "--muted",
  grid: "--grid",
  axis: "--axis",
  accent: "--accent",
  other: "--other",
  context: "--context",
  neg: "--div-neg",
  pos: "--div-pos",
  mid: "--div-mid",
  seqLo: "--seq-lo",
  seqHi: "--seq-hi",
  greenLo: "--green-lo",
  greenHi: "--green-hi",
  orangeLo: "--orange-lo",
  orangeHi: "--orange-hi",
  bandPre: "--band-pre",
  bandPost: "--band-post",
  land: "--map-land",
  water: "--map-water",
  mapStroke: "--map-stroke",
};

export function currentTheme() {
  return "light";
}


export function tokens() {
  if (cache) return cache;
  const style = getComputedStyle(document.documentElement);
  const read = (name) => style.getPropertyValue(name).trim();
  const out = { dark: false };
  Object.entries(NAMES).forEach(([key, name]) => {
    out[key] = read(name);
  });
  out.series = [1, 2, 3, 4, 5, 6, 7, 8].map((i) => read(`--s${i}`));
  cache = out;
  return out;
}

export function diverging(t, perArm = 3) {
  const neg = d3.interpolateLab(t.mid, t.neg);
  const pos = d3.interpolateLab(t.mid, t.pos);
  const left = d3.range(perArm, 0, -1).map((k) => neg(k / perArm));
  const right = d3.range(1, perArm + 1).map((k) => pos(k / perArm));
  return [...left, t.mid, ...right];
}

export function sequential(lo, hi, n) {
  return d3.quantize(d3.interpolateLab(lo, hi), n);
}

export function binIndex(value, bins) {
  let i = 0;
  while (i < bins.length && value >= bins[i]) i += 1;
  return i;
}

export function inkOn(fill) {
  const c = d3.color(fill);
  if (!c) return "#0b0b0b";
  const { r, g, b } = c.rgb();
  const lum = (0.2126 * r + 0.7152 * g + 0.0722 * b) / 255;
  return lum > 0.55 ? "#0b0b0b" : "#ffffff";
}

export function onTheme(fn) {
  listeners.add(fn);
  return () => listeners.delete(fn);
}

function emit() {
  cache = null;
  listeners.forEach((fn) => fn());
}
