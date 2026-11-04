// Firefox's native split view exposes only `tabs.Tab.splitViewId` to extensions:
// splits can be observed and reordered (tabs.move), but not created. This script
// tracks splits and layers sync scrolling, link routing and saved pairs on top.

import type {
  BackgroundMessage,
  BackgroundReply,
  CommandName,
  Pair,
  PaneInfo,
  PaneState,
  Side,
  SplitOptions,
  Status,
  SyncMode,
} from "./protocol";
import { sendToTab } from "./protocol";

type Tab = browser.tabs.Tab;
type SplitTab = Tab & { id: number };

interface Split {
  id: number;
  windowId: number;
  left: SplitTab;
  right: SplitTab;
}

interface PendingRestore {
  sync: SyncMode;
  linkSide: Side | null;
}

const SPLIT_NONE = -1;
const DEFAULT_OPTIONS: SplitOptions = { sync: "off", lastSync: "ratio", linkSource: null };

// tabId -> { splitId, partnerId }. Rebuilt lazily; the event page may unload.
const partnerCache = new Map<number, { splitId: number; partnerId: number }>();

function inSplit(tab: Tab): tab is Tab & { splitViewId: number } {
  return tab.splitViewId != null && tab.splitViewId !== SPLIT_NONE;
}

function optionsKey(splitId: number): string {
  return `split:${splitId}`;
}

async function getOptions(splitId: number): Promise<SplitOptions> {
  const key = optionsKey(splitId);
  const stored = await browser.storage.session.get(key);
  return { ...DEFAULT_OPTIONS, ...(stored[key] as Partial<SplitOptions> | undefined) };
}

async function setOptions(split: Split, patch: Partial<SplitOptions>): Promise<SplitOptions> {
  const options = { ...(await getOptions(split.id)), ...patch };
  if (options.sync !== "off") options.lastSync = options.sync;
  await browser.storage.session.set({ [optionsKey(split.id)]: options });
  await broadcast(split, options);
  return options;
}

/** The split containing a tab, with panes ordered by their visual position. */
async function getSplitForTab(tabOrId: Tab | number): Promise<Split | null> {
  const tab = typeof tabOrId === "number" ? await browser.tabs.get(tabOrId) : tabOrId;
  if (!inSplit(tab) || tab.windowId == null) return null;
  const tabs = await browser.tabs.query({ windowId: tab.windowId, splitViewId: tab.splitViewId });
  const [left, right] = tabs.sort((a, b) => a.index - b.index);
  if (tabs.length !== 2 || left?.id == null || right?.id == null) return null;
  return { id: tab.splitViewId, windowId: tab.windowId, left: left as SplitTab, right: right as SplitTab };
}

function partnerOf(split: Split, tabId: number): SplitTab {
  return split.left.id === tabId ? split.right : split.left;
}

async function getPartnerId(tabId: number) {
  const cached = partnerCache.get(tabId);
  if (cached) return cached;
  const split = await getSplitForTab(tabId);
  if (!split) return null;
  const entry = { splitId: split.id, partnerId: partnerOf(split, tabId).id };
  partnerCache.set(tabId, entry);
  return entry;
}

function stateFor(split: Split, tabId: number, options: SplitOptions): PaneState {
  return {
    type: "state",
    inSplit: true,
    side: split.left.id === tabId ? "left" : "right",
    sync: options.sync,
    linkSource: options.linkSource === tabId,
    linkTarget: options.linkSource != null && options.linkSource !== tabId,
  };
}

const OFF_STATE: PaneState = { type: "state", inSplit: false, sync: "off", linkSource: false, linkTarget: false };

function sendState(tabId: number, state: PaneState): Promise<unknown> {
  // Content scripts are absent on privileged pages (about:, AMO); that's fine.
  return sendToTab(tabId, state).catch(() => {});
}

function badgeText(options: SplitOptions, tabId: number): string {
  let text = "";
  if (options.sync !== "off") text += "⇅";
  if (options.linkSource === tabId) text += "→";
  else if (options.linkSource != null) text += "←";
  return text;
}

function setBadge(tabId: number, options: SplitOptions): Promise<void> {
  return browser.action.setBadgeText({ tabId, text: badgeText(options, tabId) }).catch(() => {});
}

async function broadcast(split: Split, options: SplitOptions): Promise<void> {
  await Promise.all(
    [split.left, split.right].map(async (tab) => {
      await sendState(tab.id, stateFor(split, tab.id, options));
      await setBadge(tab.id, options);
    }),
  );
}

async function clearTab(tabId: number): Promise<void> {
  partnerCache.delete(tabId);
  await sendState(tabId, OFF_STATE);
  await browser.action.setBadgeText({ tabId, text: "" }).catch(() => {});
}

// Drop options for splits that no longer exist.
async function pruneOptions(): Promise<void> {
  const tabs = await browser.tabs.query({});
  const live = new Set(tabs.filter(inSplit).map((t) => t.splitViewId));
  const all = await browser.storage.session.get(null);
  const stale = Object.keys(all).filter((k) => k.startsWith("split:") && !live.has(Number(k.slice(6))));
  if (stale.length) await browser.storage.session.remove(stale);
}

// ---------------------------------------------------------------------------
// Saved pairs

async function getPairs(): Promise<Pair[]> {
  const { pairs = [] } = await browser.storage.local.get("pairs");
  return pairs as Pair[];
}

async function savePair(split: Split): Promise<Pair> {
  const options = await getOptions(split.id);
  const pairs = await getPairs();
  const pair: Pair = {
    id: crypto.randomUUID(),
    name: `${split.left.title} | ${split.right.title}`,
    urls: [split.left.url ?? "about:blank", split.right.url ?? "about:blank"],
    sync: options.sync,
    linkSide: options.linkSource == null ? null : options.linkSource === split.left.id ? "left" : "right",
    createdAt: Date.now(),
  };
  pairs.unshift(pair);
  await browser.storage.local.set({ pairs });
  return pair;
}

async function deletePair(id: string): Promise<void> {
  const pairs = (await getPairs()).filter((p) => p.id !== id);
  await browser.storage.local.set({ pairs });
}

async function getPending(): Promise<Record<string, PendingRestore>> {
  const { pending = {} } = await browser.storage.session.get("pending");
  return pending as Record<string, PendingRestore>;
}

// Extensions cannot create a split, so restoring opens both tabs next to each
// other with the left one active; Alt/Option+clicking the right tab (or "Open in
// Split View" on the multi-selection) finishes the job, and the saved options
// are applied when the split forms.
async function restorePair(id: string): Promise<{ leftId: number; rightId: number } | null> {
  const pair = (await getPairs()).find((p) => p.id === id);
  if (!pair) return null;
  const left = await browser.tabs.create({ url: pair.urls[0], active: true });
  const right = await browser.tabs.create({
    url: pair.urls[1],
    index: left.index + 1,
    windowId: left.windowId,
    active: false,
  });
  if (left.id == null || right.id == null) return null;
  await browser.tabs.highlight({ windowId: left.windowId, tabs: [left.index, right.index] });
  const pending = await getPending();
  pending[`${left.id},${right.id}`] = { sync: pair.sync, linkSide: pair.linkSide };
  await browser.storage.session.set({ pending });
  return { leftId: left.id, rightId: right.id };
}

async function applyPendingRestore(split: Split): Promise<boolean> {
  const pending = await getPending();
  const key = Object.keys(pending).find((k) => {
    const ids = k.split(",").map(Number);
    return ids.includes(split.left.id) && ids.includes(split.right.id);
  });
  const saved = key && pending[key];
  if (!key || !saved) return false;
  delete pending[key];
  await browser.storage.session.set({ pending });
  // Sides follow the split's actual order, which the user may have changed.
  const savedLeftId = Number(key.split(",")[0]);
  let linkSource: number | null = null;
  if (saved.linkSide) {
    const savedLeftIsLeft = split.left.id === savedLeftId;
    const wantLeft = (saved.linkSide === "left") === savedLeftIsLeft;
    linkSource = wantLeft ? split.left.id : split.right.id;
  }
  await setOptions(split, { sync: saved.sync, linkSource });
  return true;
}

// ---------------------------------------------------------------------------
// Split lifecycle

// "splitViewId" is a valid filter property in Firefox 159, but the bundled
// typings' UpdatePropertyName union predates it and a type alias can't be augmented.
const SPLIT_VIEW_FILTER = { properties: ["splitViewId"] } as unknown as browser.tabs.UpdateFilter;

browser.tabs.onUpdated.addListener(async (tabId, changeInfo, tab) => {
  if (!("splitViewId" in changeInfo)) return;
  partnerCache.delete(tabId);
  if (changeInfo.splitViewId === SPLIT_NONE) {
    await clearTab(tabId);
    await pruneOptions();
    return;
  }
  const split = await getSplitForTab(tab);
  if (!split) return;
  for (const t of [split.left, split.right]) partnerCache.delete(t.id);
  if (!(await applyPendingRestore(split))) {
    await broadcast(split, await getOptions(split.id));
  }
}, SPLIT_VIEW_FILTER);

// Navigation resets per-tab badges; restore ours (e.g. after link mode routes
// a page into the target pane).
browser.tabs.onUpdated.addListener(
  async (tabId, _changeInfo, tab) => {
    if (!inSplit(tab)) return;
    await setBadge(tabId, await getOptions(tab.splitViewId));
  },
  { properties: ["url", "status"] },
);

// Reversing a split (native menu or our swap) moves tabs without changing
// splitViewId; re-send state so each pane learns its new side.
browser.tabs.onMoved.addListener(async (tabId) => {
  const split = await getSplitForTab(tabId).catch(() => null);
  if (split) await broadcast(split, await getOptions(split.id));
});

browser.tabs.onRemoved.addListener((tabId) => {
  partnerCache.delete(tabId);
});

// ---------------------------------------------------------------------------
// Commands

async function runCommand(command: CommandName, tab: Tab): Promise<void> {
  const split = await getSplitForTab(tab);
  if (!split || tab.id == null) return;
  const options = await getOptions(split.id);
  switch (command) {
    case "toggle-sync":
      await setOptions(split, { sync: options.sync === "off" ? options.lastSync : "off" });
      break;
    case "toggle-link":
      // The pane you're in drives the other one.
      await setOptions(split, { linkSource: options.linkSource === tab.id ? null : tab.id });
      break;
    case "focus-other":
      await browser.tabs.update(partnerOf(split, tab.id).id, { active: true });
      break;
    case "swap-sides":
      // Moving the right tab onto the left tab's index reverses the split in place.
      await browser.tabs.move(split.right.id, { index: split.left.index });
      break;
  }
}

browser.commands.onCommand.addListener(async (command, tab) => {
  const target = tab ?? (await browser.tabs.query({ active: true, currentWindow: true }))[0];
  if (target) await runCommand(command as CommandName, target);
});

// ---------------------------------------------------------------------------
// Messages from content scripts and the popup

// Content scripts can't run on some pages (local files, about:, AMO); the
// popup says so instead of the features silently doing nothing.
async function describeTab(tab: SplitTab): Promise<PaneInfo> {
  const ready = await sendToTab(tab.id, { type: "ping" }).catch(() => false);
  return { id: tab.id, title: tab.title, url: tab.url, favIconUrl: tab.favIconUrl, ready: ready === true };
}

async function getStatus(tabId: number): Promise<Status> {
  const tab = await browser.tabs.get(tabId);
  const split = await getSplitForTab(tab);
  const hostGranted = await browser.permissions.contains({ origins: ["<all_urls>"] });
  const pairs = await getPairs();
  if (!split) return { split: null, pairs, hostGranted };
  return {
    split: {
      id: split.id,
      left: await describeTab(split.left),
      right: await describeTab(split.right),
      activeSide: split.left.id === tabId ? "left" : "right",
    },
    options: await getOptions(split.id),
    pairs,
    hostGranted,
  };
}

type Sender = browser.runtime.MessageSender;
type Handlers = {
  [T in BackgroundMessage["type"]]: (
    msg: Extract<BackgroundMessage, { type: T }>,
    sender: Sender,
  ) => Promise<BackgroundReply<T>>;
};

const handlers: Handlers = {
  async hello(_msg, sender) {
    const tabId = sender.tab?.id;
    const split = tabId == null ? null : await getSplitForTab(tabId);
    if (!split || tabId == null) return OFF_STATE;
    return stateFor(split, tabId, await getOptions(split.id));
  },
  async scroll(msg, sender) {
    const tabId = sender.tab?.id;
    const entry = tabId == null ? null : await getPartnerId(tabId);
    if (!entry) return;
    const options = await getOptions(entry.splitId);
    if (options.sync === "off") return;
    await sendToTab(entry.partnerId, { type: "applyScroll", mode: options.sync, ...msg.position }).catch(() => {});
  },
  async link(msg, sender) {
    const tabId = sender.tab?.id;
    const split = tabId == null ? null : await getSplitForTab(tabId);
    if (!split || tabId == null) return { routed: false };
    const options = await getOptions(split.id);
    if (options.linkSource !== tabId) return { routed: false };
    await browser.tabs.update(partnerOf(split, tabId).id, { url: msg.url });
    return { routed: true };
  },
  getStatus: (msg) => getStatus(msg.tabId),
  async setOptions(msg) {
    const split = await getSplitForTab(msg.tabId);
    return split ? setOptions(split, msg.patch) : null;
  },
  async command(msg) {
    await runCommand(msg.command, await browser.tabs.get(msg.tabId));
    return true;
  },
  async savePair(msg) {
    const split = await getSplitForTab(msg.tabId);
    return split ? savePair(split) : null;
  },
  deletePair: (msg) => deletePair(msg.id),
  restorePair: (msg) => restorePair(msg.id),
};

browser.runtime.onMessage.addListener((msg: BackgroundMessage, sender: Sender) => {
  const handler = handlers[msg.type] as (msg: BackgroundMessage, sender: Sender) => Promise<unknown>;
  return handler(msg, sender);
});

// Teal, so the badge stands out against the indigo icon.
browser.action.setBadgeBackgroundColor({ color: "#0d7d6c" });
