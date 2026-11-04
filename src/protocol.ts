// Shared types and the message protocol between background, content scripts
// and the popup. Every message has a `type`; each sender gets a typed reply.

export type SyncMode = "off" | "ratio" | "delta";
export type Side = "left" | "right";
export type CommandName = "toggle-sync" | "toggle-link" | "focus-other" | "swap-sides";

export interface SplitOptions {
  sync: SyncMode;
  /** Mode restored when sync is toggled back on. */
  lastSync: Exclude<SyncMode, "off">;
  /** Tab whose plain link clicks open in the other pane. */
  linkSource: number | null;
}

/** What a content script needs to know about its pane. */
export interface PaneState {
  type: "state";
  inSplit: boolean;
  side?: Side;
  sync: SyncMode;
  linkSource: boolean;
  linkTarget: boolean;
}

export interface ScrollPosition {
  ratioY: number;
  ratioX: number;
  dy: number;
  dx: number;
}

export interface Pair {
  id: string;
  name: string;
  urls: [string, string];
  sync: SyncMode;
  linkSide: Side | null;
  createdAt: number;
}

export interface PaneInfo {
  id: number;
  title: string | undefined;
  url: string | undefined;
  favIconUrl: string | undefined;
  /** Whether the content script answers in this pane. */
  ready: boolean;
}

export interface Status {
  split: { id: number; left: PaneInfo; right: PaneInfo; activeSide: Side } | null;
  options?: SplitOptions;
  pairs: Pair[];
  hostGranted: boolean;
}

// ---------------------------------------------------------------------------
// Messages handled by the background script, with their reply types.

interface BackgroundMessages {
  hello: { msg: { type: "hello" }; reply: PaneState };
  scroll: { msg: { type: "scroll"; position: ScrollPosition }; reply: void };
  link: { msg: { type: "link"; url: string }; reply: { routed: boolean } };
  getStatus: { msg: { type: "getStatus"; tabId: number }; reply: Status };
  setOptions: {
    msg: { type: "setOptions"; tabId: number; patch: Partial<SplitOptions> };
    reply: SplitOptions | null;
  };
  command: { msg: { type: "command"; tabId: number; command: CommandName }; reply: true };
  savePair: { msg: { type: "savePair"; tabId: number }; reply: Pair | null };
  deletePair: { msg: { type: "deletePair"; id: string }; reply: void };
  restorePair: {
    msg: { type: "restorePair"; id: string };
    reply: { leftId: number; rightId: number } | null;
  };
}

export type BackgroundMessage = BackgroundMessages[keyof BackgroundMessages]["msg"];
export type BackgroundReply<T extends BackgroundMessage["type"]> = BackgroundMessages[T]["reply"];

export function sendToBackground<M extends BackgroundMessage>(msg: M): Promise<BackgroundReply<M["type"]>> {
  return browser.runtime.sendMessage(msg);
}

// ---------------------------------------------------------------------------
// Messages handled by content scripts.

export type ContentMessage =
  | PaneState
  | ({ type: "applyScroll"; mode: Exclude<SyncMode, "off"> } & ScrollPosition)
  | { type: "ping" };

export function sendToTab(tabId: number, msg: ContentMessage): Promise<unknown> {
  return browser.tabs.sendMessage(tabId, msg);
}
