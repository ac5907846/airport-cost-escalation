import { load } from "../lib/data.js";
import { el } from "../lib/dom.js";
import { count } from "../lib/format.js";

const METHODS = [
  {
    title: "Funding",
    text: "AIP grant histories for FY2008 to FY2025 were combined into one grant file, and each project line was assigned a work category from its description. Pandemic relief grants are identified separately and excluded from funding totals.",
  },
  {
    title: "Planning estimates",
    text: "Airport-level five-year development estimates from 12 NPIAS reports were linked by location identifier. Revisions are log changes between consecutive reports, and development categories come from the narrative tables of each report. The dose analysis relates revisions to AIG allocations and ATP awards, with a pre-IIJA placebo and a stacked model with airport fixed effects.",
  },
  {
    title: "Bids",
    text: "All fifty states were screened for airport bid tabulations at the line item level, and the nine that post bidder unit prices were parsed: Alaska, Georgia, Illinois, Kentucky, Oregon, South Carolina, Tennessee, Vermont and Wisconsin. A hedonic model with pay item fixed effects and a quantity term gives a yearly unit price index (2021 = 100) for their capital projects, with the Wyoming and Oregon maintenance programs as a contrast. Estimate accuracy compares low bids with engineer’s estimates for line items and projects.",
  },
  {
    title: "Award",
    text: "DFW Board action pages were parsed into awards, increases, decreases, and change order allowances. Construction awards were tagged by delivery method, and growth within 24 months compares later increases with the base award.",
  },
  {
    title: "After award",
    text: "Amendment histories of AIP construction grants were followed for 36 months after award. A logit model with era, work category, airport class, and grant size gives adjusted probabilities of added and returned funds.",
  },
  {
    title: "Lifecycle synthesis",
    text: "Yearly indicators for each stage are compared between 2017 to 2021 and 2022 to 2025, aligned by fiscal year, bid year, award year, award cohort, or report publication year.",
  },
];

export async function initAbout() {
  const meta = await load("meta");
  const methods = document.getElementById("methods");
  methods.replaceChildren(el("h3", null, "How the indicators were built"));
  METHODS.forEach((m) => {
    methods.append(el("h4", null, m.title), el("p", null, m.text));
  });
  methods.append(el("p", null, "The map places airports with FAA NASR reference points on US Census Bureau state boundaries, with Alaska, Hawaii, and Puerto Rico shown as insets."));

  const sources = document.getElementById("sources");
  sources.replaceChildren(el("h3", null, "Sources"));
  const list = el("ul");
  meta.sources.forEach((s) => {
    const li = el("li");
    const a = el("a", null, s.name);
    a.href = s.url;
    a.target = "_blank";
    a.rel = "noopener";
    li.append(a);
    list.append(li);
  });
  sources.append(list);
  const c = meta.counts;
  sources.append(el("h4", null, "Records in the study"));
  const facts = el("ul");
  [
    `${count(c.aip_grants)} AIP grants from FY${c.aip_fy_min} to FY${c.aip_fy_max}, with ${count(c.work_items)} work items in ${c.work_categories} categories`,
    `${c.npias_reports} NPIAS reports with about ${count(c.npias_airports_mean)} airports each`,
    `${count(c.aig_allocation_rows)} AIG allocation rows for ${count(c.aig_airports)} airports and ${count(c.atp_awards)} ATP awards`,
    `${count(c.usaspending_awards)} USAspending awards under Assistance Listing 20.106 with ${count(c.usaspending_transactions)} transactions, including ${count(c.construction_grants_36m)} AIP construction grants observed for at least 36 months`,
    `${c.bid_projects} bid tabulations with ${count(c.bid_line_items)} line items and ${count(c.bid_prices)} bid prices`,
    `${count(c.dfw_actions)} DFW Board actions, including ${count(c.dfw_construction_awards)} construction awards`,
    `${c.ppi_series} producer price index series`,
  ].forEach((text) => facts.append(el("li", null, text)));
  sources.append(facts);
  sources.append(el("p", null, "Numbers in this app are rounded from the processed outputs of the study. Where a value differs slightly from the paper, the paper takes precedence."));
}
