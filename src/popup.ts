import type { Side, Status, SyncMode } from "./protocol";
import { sendToBackground } from "./protocol";

const SIDES: readonly Side[] = ["left", "right"];

function $<T extends HTMLElement = HTMLElement>(selector: string): T {
  const el = document.querySelector<T>(selector);
  if (!el) throw new Error(`popup.html is missing ${selector}`);
  return el;
}

const t = (key: string, ...subs: string[]): string => browser.i18n.getMessage(key, subs);

for (const el of document.querySelectorAll<HTMLElement>("[data-i18n]")) el.textContent = t(el.dataset.i18n ?? "");
for (const el of document.querySelectorAll<HTMLElement>("[data-i18n-title]")) el.title = t(el.dataset.i18nTitle ?? "");

let tabId: number;
let status: Status;

function setChecked(group: HTMLElement, value: string): void {
  for (const b of group.querySelectorAll<HTMLButtonElement>("button")) {
    b.setAttribute("role", "radio");
    b.setAttribute("aria-checked", String(b.dataset.value === value));
  }
}

function clickedValue(event: Event): string | undefined {
  return (event.target as Element).closest<HTMLButtonElement>("button")?.dataset.value;
}

function renderSplit(split: NonNullable<Status["split"]>): void {
  const options = status.options;
  if (!options) return;
  for (const side of SIDES) {
    const pane = $(`#pane-${side}`);
    pane.querySelector(".name")!.textContent = split[side].title || split[side].url || "";
    pane.title = split[side].url ?? "";
    pane.classList.toggle("active", split.activeSide === side);
    pane.classList.toggle("unavailable", !split[side].ready);
  }
  const blocked = SIDES.filter((side) => !split[side].ready);
  const notReady = $("#not-ready");
  notReady.hidden = blocked.length === 0;
  if (blocked.length) {
    const sides = blocked.map((side) => t(side)).join(", ");
    const isFile = blocked.some((side) => split[side].url?.startsWith("file:"));
    notReady.textContent = t(isFile ? "notReadyFile" : "notReady", sides);
  }
  setChecked($("#sync"), options.sync);
  $("#sync-hint").textContent =
    options.sync === "ratio" ? t("syncRatioHint") : options.sync === "delta" ? t("syncDeltaHint") : "";
  const link = options.linkSource == null ? "off" : options.linkSource === split.left.id ? "left" : "right";
  setChecked($("#link"), link);
}

function renderPairs(): void {
  const list = $("#pairs");
  list.replaceChildren();
  for (const pair of status.pairs) {
    const li = document.createElement("li");
    const name = document.createElement("span");
    name.className = "pair-name";
    name.textContent = pair.name;
    name.title = pair.urls.join("\n");
    const open = document.createElement("button");
    open.textContent = t("restore");
    open.addEventListener("click", async () => {
      await sendToBackground({ type: "restorePair", id: pair.id });
      $("#restore-hint").hidden = false;
    });
    const del = document.createElement("button");
    del.textContent = t("delete");
    del.addEventListener("click", async () => {
      await sendToBackground({ type: "deletePair", id: pair.id });
      await refresh();
    });
    li.append(name, open, del);
    list.append(li);
  }
  $("#no-pairs").hidden = status.pairs.length > 0;
}

async function refresh(): Promise<void> {
  status = await sendToBackground({ type: "getStatus", tabId });
  $("#grant").hidden = status.hostGranted;
  $("#split").hidden = !status.split;
  $("#no-split").hidden = !!status.split;
  if (status.split) renderSplit(status.split);
  renderPairs();
}

$("#sync").addEventListener("click", async (e) => {
  const value = clickedValue(e) as SyncMode | undefined;
  if (!value) return;
  await sendToBackground({ type: "setOptions", tabId, patch: { sync: value } });
  await refresh();
});

$("#link").addEventListener("click", async (e) => {
  const value = clickedValue(e) as Side | "off" | undefined;
  if (!value || !status.split) return;
  const linkSource = value === "off" ? null : status.split[value].id;
  await sendToBackground({ type: "setOptions", tabId, patch: { linkSource } });
  await refresh();
});

$("#swap").addEventListener("click", async () => {
  await sendToBackground({ type: "command", tabId, command: "swap-sides" });
  await refresh();
});

$("#save").addEventListener("click", async () => {
  await sendToBackground({ type: "savePair", tabId });
  $("#save").textContent = t("saved");
  await refresh();
});

$("#grant-btn").addEventListener("click", async () => {
  // permissions.request must be the first await in the click handler to count as a user action.
  await browser.permissions.request({ origins: ["<all_urls>"] });
  await refresh();
});

(async () => {
  // Firefox's own gesture: Alt/Option+click a tab joins it with the current one.
  const { os } = await browser.runtime.getPlatformInfo();
  const key = os === "mac" ? "⌥ Option" : "Alt";
  for (const id of ["notInSplitHint", "restoreHint"]) $(`[data-i18n="${id}"]`).textContent = t(id, key);
  // popup.html?tabId=N shows tab N's split when the popup is opened as a page
  // (store screenshots, debugging); normally it's the active tab.
  const forced = Number(new URLSearchParams(location.search).get("tabId"));
  const [active] = forced ? [{ id: forced }] : await browser.tabs.query({ active: true, currentWindow: true });
  if (active?.id == null) return;
  tabId = active.id;
  await refresh();
})();
