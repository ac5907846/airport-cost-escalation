const MINUS = "−";
const MONTHS = ["Jan", "Feb", "Mar", "Apr", "May", "Jun", "Jul", "Aug", "Sep", "Oct", "Nov", "Dec"];
const MONTHS_LONG = ["January", "February", "March", "April", "May", "June", "July", "August", "September", "October", "November", "December"];

function finite(v) {
  return v !== null && v !== undefined && Number.isFinite(v);
}

function digitsText(abs, digits) {
  if (Number(abs.toFixed(digits)) === 0) return "0";
  let s = abs.toLocaleString("en-US", { minimumFractionDigits: digits, maximumFractionDigits: digits });
  if (s.startsWith("0.")) s = s.slice(1);
  return s;
}

function trimmed(abs, digits) {
  if (Number(abs.toFixed(digits)) === 0) return "0";
  let s = abs.toLocaleString("en-US", { maximumFractionDigits: digits });
  if (s.startsWith("0.")) s = s.slice(1);
  return s;
}

function signOf(v, digits) {
  return v < 0 && Number(Math.abs(v).toFixed(digits)) !== 0 ? MINUS : "";
}

export function num(v, digits = 0) {
  if (!finite(v)) return "n/a";
  return signOf(v, digits) + digitsText(Math.abs(v), digits);
}

export function numTrim(v, digits = 1) {
  if (!finite(v)) return "n/a";
  return signOf(v, digits) + trimmed(Math.abs(v), digits);
}

export function pct(v, digits = 0) {
  if (!finite(v)) return "n/a";
  return `${num(v, digits)}%`;
}

export function share(v, digits = 0) {
  if (!finite(v)) return "n/a";
  return pct(v * 100, digits);
}

export function money(m, digits) {
  if (!finite(m)) return "n/a";
  const a = Math.abs(m);
  let body;
  let d;
  if (a >= 1000) {
    d = digits ?? (a >= 100000 ? 0 : a >= 10000 ? 1 : 2);
    body = `$${trimmed(a / 1000, d)}B`;
  } else if (a >= 1) {
    d = digits ?? (a >= 100 ? 0 : a >= 10 ? 1 : 2);
    body = `$${trimmed(a, d)}M`;
  } else if (a >= 0.0005) {
    d = digits ?? 0;
    body = `$${trimmed(a * 1000, d)}K`;
  } else {
    return "$0";
  }
  return (m < 0 ? MINUS : "") + body;
}

export function moneyLong(m) {
  if (!finite(m)) return "n/a";
  const a = Math.abs(m);
  const sign = m < 0 ? MINUS : "";
  if (a >= 1000) return `${sign}$${trimmed(a / 1000, a >= 10000 ? 1 : 2)} billion`;
  if (a >= 1) return `${sign}$${trimmed(a, a >= 100 ? 0 : 1)} million`;
  return `${sign}$${trimmed(a * 1000, 0)} thousand`;
}

export function dollars(v) {
  if (!finite(v)) return "n/a";
  return `${v < 0 ? MINUS : ""}$${Math.round(Math.abs(v)).toLocaleString("en-US")}`;
}

export function count(v) {
  if (!finite(v)) return "n/a";
  return Math.round(v).toLocaleString("en-US");
}

export function compactCount(v) {
  if (!finite(v)) return "n/a";
  const a = Math.abs(v);
  if (a >= 1e6) return `${trimmed(a / 1e6, 1)}M`;
  if (a >= 1e4) return `${trimmed(a / 1e3, 0)}K`;
  return count(v);
}

export function ratio(v, digits = 2) {
  return num(v, digits);
}

export function logToPct(v) {
  return finite(v) ? (Math.exp(v) - 1) * 100 : null;
}

export function pValue(p) {
  if (!finite(p)) return "n/a";
  if (p < 0.001) return "p < .001";
  return `p = ${num(p, p < 0.01 ? 3 : 2)}`;
}

export function reportLabel(cycle) {
  return String(cycle).replace("-", " to ");
}

export function reportShort(cycle) {
  const [a, b] = String(cycle).split("-");
  return `${a}–${b.slice(2)}`;
}

export function parseDate(s) {
  if (!s) return null;
  const [y, m, d] = s.split("-").map(Number);
  return new Date(y, (m || 1) - 1, d || 1);
}

export function monthYear(s) {
  const d = typeof s === "string" ? parseDate(s) : s;
  return d ? `${MONTHS[d.getMonth()]} ${d.getFullYear()}` : "n/a";
}

export function fullDate(s) {
  const d = typeof s === "string" ? parseDate(s) : s;
  return d ? `${MONTHS_LONG[d.getMonth()]} ${d.getDate()}, ${d.getFullYear()}` : "n/a";
}

export function yearsLabel(a, b, prefix = "") {
  return a === b ? `${prefix}${a}` : `${prefix}${a} to ${prefix}${b}`;
}

export function eraLabel(era) {
  return String(era).replace(/FY(\d{4})–(\d{4})/, "FY$1 to FY$2");
}
