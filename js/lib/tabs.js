// Real tabs at two levels: four panels across the top, and the lifecycle strip choosing one stage inside the
// lifecycle panel. One panel and one stage are in the document at a time, so the app never scrolls from one to
// the next. A hidden panel keeps its charts; they redraw when it is shown, because their width goes from zero to
// the real width and the observers in chart.js pick that up.

const KEYS = { ArrowRight: 1, ArrowDown: 1, ArrowLeft: -1, ArrowUp: -1 };
const STAGE_HOME = "lifecycle";

let tabs = [];
let panels = new Map();
let current = null;
let stageTabs = [];
let stagePanels = new Map();
let currentStage = null;

function askedFor() {
  const [panel, stage] = decodeURIComponent(location.hash.replace("#", "")).trim().split("/");
  return { panel, stage };
}

function writeHash() {
  const target = current === STAGE_HOME && currentStage ? `#${current}/${currentStage}` : `#${current}`;
  if (location.hash !== target) history.replaceState(null, "", target);
}

function select(list, id) {
  list.forEach((tab) => {
    const on = tab.dataset.panel === id || tab.dataset.stage === id;
    tab.setAttribute("aria-selected", String(on));
    tab.tabIndex = on ? 0 : -1;
    tab.classList.toggle("is-active", on);
  });
}

function keys(list, open) {
  list.forEach((tab, i) => {
    tab.addEventListener("keydown", (event) => {
      const step = KEYS[event.key];
      if (step) {
        event.preventDefault();
        open(list[(i + step + list.length) % list.length], true);
      } else if (event.key === "Home" || event.key === "End") {
        event.preventDefault();
        open(event.key === "Home" ? list[0] : list[list.length - 1], true);
      }
    });
  });
}

export function openStage(id, { focus = false, hash = true } = {}) {
  if (!stagePanels.has(id) || id === currentStage) return;
  currentStage = id;
  stagePanels.forEach((panel, key) => {
    panel.hidden = key !== id;
  });
  select(stageTabs, id);
  if (focus) {
    const tab = stageTabs.find((t) => t.dataset.stage === id);
    if (tab) tab.focus();
  }
  if (hash) writeHash();
  document.dispatchEvent(new CustomEvent("panel:shown", { detail: { id, stage: true } }));
}

export function openPanel(id, { focus = false, hash = true } = {}) {
  // a stage name opens the lifecycle panel at that stage, so links written before the stages moved still work
  if (!panels.has(id) && stagePanels.has(id)) {
    openPanel(STAGE_HOME, { focus, hash: false });
    openStage(id, { hash });
    return;
  }
  if (!panels.has(id) || id === current) {
    if (id === current) window.scrollTo({ top: 0, behavior: "auto" });
    return;
  }
  current = id;
  panels.forEach((panel, key) => {
    panel.hidden = key !== id;
  });
  select(tabs, id);
  if (focus) {
    const tab = tabs.find((t) => t.dataset.panel === id);
    if (tab) tab.focus();
  }
  if (hash) writeHash();
  window.scrollTo({ top: 0, behavior: "auto" });
  document.dispatchEvent(new CustomEvent("panel:shown", { detail: { id } }));
}

export function currentPanel() {
  return current;
}

// The lifecycle strip is written by the overview section once its data is in, so the stages are wired separately.
export function initStages() {
  const list = document.querySelector(".lifecycle");
  if (!list) return;
  stageTabs = [...list.querySelectorAll("[data-stage]")];
  stagePanels = new Map();
  stageTabs.forEach((tab) => {
    const panel = document.getElementById(tab.dataset.stage);
    if (panel) stagePanels.set(tab.dataset.stage, panel);
  });
  stageTabs.forEach((tab) => tab.addEventListener("click", () => openStage(tab.dataset.stage)));
  keys(stageTabs, (tab, focus) => openStage(tab.dataset.stage, { focus }));
  const { panel, stage } = askedFor();
  const start = stagePanels.has(stage) ? stage : stageTabs[0] && stageTabs[0].dataset.stage;
  openStage(start, { hash: panel === STAGE_HOME });
}

export function initTabs() {
  const list = document.querySelector(".stage-nav");
  if (!list) return;
  tabs = [...list.querySelectorAll("[data-panel]")];
  panels = new Map();
  tabs.forEach((tab) => {
    const panel = document.getElementById(tab.dataset.panel);
    if (panel) panels.set(tab.dataset.panel, panel);
  });
  tabs.forEach((tab) => tab.addEventListener("click", () => openPanel(tab.dataset.panel)));
  keys(tabs, (tab, focus) => openPanel(tab.dataset.panel, { focus }));
  window.addEventListener("hashchange", () => {
    const { panel, stage } = askedFor();
    if (panels.has(panel)) openPanel(panel, { hash: false });
    if (stagePanels.has(stage)) openStage(stage, { hash: false });
    else if (stagePanels.has(panel)) openPanel(panel, { hash: false });
  });
  const { panel } = askedFor();
  openPanel(panels.has(panel) ? panel : tabs[0].dataset.panel, { hash: false });
}
