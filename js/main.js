import { initTabs, initStages } from "./lib/tabs.js";
import { el } from "./lib/dom.js";
import { initOverview } from "./sections/overview.js";
import { initMap } from "./sections/map.js";
import { initFunding } from "./sections/funding.js";
import { initPlanning } from "./sections/planning.js";
import { initBids } from "./sections/bids.js";
import { initAward } from "./sections/award.js";
import { initPostaward } from "./sections/postaward.js";
import { initSynthesis } from "./sections/synthesis.js";
import { initEstimator } from "./tools/estimator.js";
import { initExplorer } from "./tools/explorer.js";
import { initAbout } from "./sections/about.js";

function fail(sectionId, error) {
  console.error(error);
  const section = document.getElementById(sectionId);
  const wrap = section && section.querySelector(".wrap");
  if (!wrap) return;
  wrap.append(el("div", "error-box", `This part of the page could not be drawn (${error.message}). Reload the page to try again.`));
}

function run(sectionId, init) {
  return Promise.resolve()
    .then(init)
    .catch((error) => fail(sectionId, error));
}

function start() {
  if (typeof d3 === "undefined") {
    fail("map", new Error("the D3 library did not load"));
    return;
  }
  initTabs();
  run("lifecycle", initOverview).then(initStages);
  run("map", initMap);
  run("lifecycle", initFunding);
  run("lifecycle", initPlanning);
  run("lifecycle", initBids);
  run("lifecycle", initAward);
  run("lifecycle", initPostaward);
  run("lifecycle", initSynthesis);
  run("tools", initEstimator);
  run("tools", initExplorer);
  run("data", initAbout);
}

start();
