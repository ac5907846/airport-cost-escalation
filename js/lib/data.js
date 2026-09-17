const cache = new Map();

export function load(name) {
  if (!cache.has(name)) {
    cache.set(
      name,
      fetch(`data/${name}.json`).then((response) => {
        if (!response.ok) throw new Error(`data/${name}.json returned ${response.status}`);
        return response.json();
      }),
    );
  }
  return cache.get(name);
}

export const bus = new EventTarget();

export function emit(type, detail) {
  bus.dispatchEvent(new CustomEvent(type, { detail }));
}

export function on(type, fn) {
  bus.addEventListener(type, (event) => fn(event.detail));
}
