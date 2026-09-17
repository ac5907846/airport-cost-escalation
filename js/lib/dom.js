export function el(tag, className, text) {
  const node = document.createElement(tag);
  if (className) node.className = className;
  if (text !== undefined && text !== null) node.textContent = text;
  return node;
}

export function debounce(fn, wait = 120) {
  let timer = 0;
  return (...args) => {
    clearTimeout(timer);
    timer = setTimeout(() => fn(...args), wait);
  };
}

export function onResize(node, fn) {
  let last = 0;
  let frame = 0;
  const observer = new ResizeObserver(() => {
    const width = Math.floor(node.clientWidth);
    if (!width || width === last) return;
    last = width;
    cancelAnimationFrame(frame);
    frame = requestAnimationFrame(() => fn(width));
  });
  observer.observe(node);
  return observer;
}

export function truncate(text, max) {
  if (!text) return "";
  return text.length > max ? `${text.slice(0, max - 1).trimEnd()}…` : text;
}

