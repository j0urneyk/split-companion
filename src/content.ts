import type { ContentMessage, PaneState } from "./protocol";
import { sendToBackground } from "./protocol";

declare global {
  interface Window {
    __splitCompanion?: boolean;
  }
}

interface Position {
  top: number;
  left: number;
  ratioY: number;
  ratioX: number;
}

let state: PaneState = { type: "state", inSplit: false, sync: "off", linkSource: false, linkTarget: false };

// ---------------------------------------------------------------------------
// Main scroller: the document itself, or, for app-shell pages whose document
// doesn't scroll, the largest scrollable element.

let cachedScroller: Element | null = null;

function isScrollable(el: Element): boolean {
  if (el.scrollHeight <= el.clientHeight + 1 && el.scrollWidth <= el.clientWidth + 1) return false;
  const style = getComputedStyle(el);
  return /(auto|scroll|overlay)/.test(style.overflowY + style.overflowX);
}

function rootScroller(): Element {
  return document.scrollingElement ?? document.documentElement;
}

function findMainScroller(): Element {
  const root = rootScroller();
  if (root.scrollHeight > root.clientHeight + 1) return root;
  let best: Element | null = null;
  let bestArea = 0;
  for (const el of document.querySelectorAll("body *")) {
    if (el.clientHeight < 100 || !isScrollable(el)) continue;
    const area = el.clientWidth * el.clientHeight;
    if (area > bestArea) {
      best = el;
      bestArea = area;
    }
  }
  return best ?? root;
}

function mainScroller(): Element {
  if (!cachedScroller?.isConnected) cachedScroller = findMainScroller();
  return cachedScroller;
}

function readPosition(el: Element): Position {
  const maxY = el.scrollHeight - el.clientHeight;
  const maxX = el.scrollWidth - el.clientWidth;
  return {
    top: el.scrollTop,
    left: el.scrollLeft,
    ratioY: maxY > 0 ? el.scrollTop / maxY : 0,
    ratioX: maxX > 0 ? el.scrollLeft / maxX : 0,
  };
}

// ---------------------------------------------------------------------------
// Sync scrolling

let last: Position | null = null; // last known position of the main scroller
let pending = false;
let echo: { top: number; left: number; until: number } | null = null; // set while applying a remote scroll

// Position is tracked even while sync is off, so the first scroll after
// enabling "same distance" mode has a correct baseline.
function onScroll(event: Event): void {
  const target = event.target === document ? rootScroller() : event.target;
  if (target !== mainScroller()) {
    // The cached scroller may be stale (layout changed); re-detect once.
    if (target instanceof Element && target.clientHeight >= 100 && findMainScroller() === target) {
      cachedScroller = target;
      last = null;
    } else {
      return;
    }
  }
  if (pending) return;
  pending = true;
  requestAnimationFrame(() => {
    pending = false;
    const pos = readPosition(mainScroller());
    const prev = last ?? pos;
    last = pos;
    if (echo && performance.now() < echo.until && Math.abs(pos.top - echo.top) <= 1 && Math.abs(pos.left - echo.left) <= 1) {
      return;
    }
    echo = null;
    if (state.sync === "off") return;
    const dy = pos.top - prev.top;
    const dx = pos.left - prev.left;
    if (state.sync === "delta" && dy === 0 && dx === 0) return;
    sendToBackground({ type: "scroll", position: { ratioY: pos.ratioY, ratioX: pos.ratioX, dy, dx } }).catch(() => {});
  });
}

function applyScroll(msg: Extract<ContentMessage, { type: "applyScroll" }>): void {
  const el = mainScroller();
  if (msg.mode === "ratio") {
    const maxY = el.scrollHeight - el.clientHeight;
    const maxX = el.scrollWidth - el.clientWidth;
    el.scrollTo({ top: msg.ratioY * maxY, left: msg.ratioX * maxX, behavior: "instant" });
  } else {
    el.scrollBy({ top: msg.dy, left: msg.dx, behavior: "instant" });
  }
  const pos = readPosition(el);
  last = pos;
  echo = { top: pos.top, left: pos.left, until: performance.now() + 300 };
}

// ---------------------------------------------------------------------------
// Link mode: plain left-clicks on links in the source pane open in the other pane.

function routableLink(event: MouseEvent): string | null {
  if (!state.linkSource) return null;
  if (event.button !== 0 || event.altKey || event.ctrlKey || event.metaKey || event.shiftKey) return null;
  const a = event
    .composedPath()
    .find((n): n is HTMLAnchorElement | SVGAElement => n instanceof HTMLAnchorElement || n instanceof SVGAElement);
  if (!a || a.hasAttribute("download")) return null;
  const rawHref = a instanceof SVGAElement ? a.href.baseVal : a.getAttribute("href");
  if (!rawHref) return null;
  let url: URL;
  try {
    url = new URL(rawHref, document.baseURI);
  } catch {
    return null;
  }
  if (!/^(https?|file):$/.test(url.protocol)) return null;
  // In-page anchors stay in this pane.
  const here = new URL(location.href);
  if (url.hash && url.origin === here.origin && url.pathname === here.pathname && url.search === here.search) {
    return null;
  }
  return url.href;
}

function onClick(event: MouseEvent): void {
  const url = routableLink(event);
  if (!url) return;
  // Capture phase: runs before page handlers, so SPA routers see defaultPrevented.
  event.preventDefault();
  event.stopImmediatePropagation();
  sendToBackground({ type: "link", url }).then(
    (res) => {
      if (!res?.routed) location.href = url;
    },
    () => {
      location.href = url;
    },
  );
}

// ---------------------------------------------------------------------------
// Visual hint: an arrow tab on the source pane's edge, pointing at the pane
// links open in. Teal, so it can't be mistaken for Firefox's purple
// focused-pane outline. Shadow DOM keeps page CSS out.

const MARKER_CSS = `
  :host { all: initial; position: fixed; top: 50%; z-index: 2147483647; pointer-events: none; }
  div {
    transform: translateY(-50%);
    padding: 14px 7px;
    background: #0d7d6c;
    color: #fff;
    font: 700 17px/1 system-ui, sans-serif;
    box-shadow: 0 1px 4px rgb(0 0 0 / 0.3);
    opacity: 0.9;
  }
  :host([data-side="left"]) div { border-radius: 6px 0 0 6px; }
  :host([data-side="right"]) div { border-radius: 0 6px 6px 0; }
`;

let marker: { host: HTMLElement; arrow: HTMLDivElement } | null = null;

function createMarker(): { host: HTMLElement; arrow: HTMLDivElement } {
  const host = document.createElement("split-companion-marker");
  host.setAttribute("aria-hidden", "true");
  const shadow = host.attachShadow({ mode: "closed" });
  const style = document.createElement("style");
  style.textContent = MARKER_CSS;
  const arrow = document.createElement("div");
  shadow.append(style, arrow);
  return { host, arrow };
}

function renderMarker(): void {
  if (!state.linkSource) {
    marker?.host.remove();
    marker = null;
    return;
  }
  marker ??= createMarker();
  // The left pane's arrow sits on its right edge and points right, and vice versa.
  const left = state.side === "left";
  marker.host.dataset.side = state.side;
  marker.host.style.right = left ? "0" : "";
  marker.host.style.left = left ? "" : "0";
  marker.arrow.textContent = left ? "→" : "←";
  (document.body ?? document.documentElement).appendChild(marker.host);
}

function setState(next: PaneState): void {
  state = next;
  renderMarker();
}

// ---------------------------------------------------------------------------

function main(): void {
  document.addEventListener("scroll", onScroll, { capture: true, passive: true });
  window.addEventListener("click", onClick, { capture: true });

  browser.runtime.onMessage.addListener((msg: ContentMessage) => {
    switch (msg.type) {
      case "state":
        setState(msg);
        return;
      case "applyScroll":
        applyScroll(msg);
        return;
      case "ping":
        return Promise.resolve(true);
    }
  });

  sendToBackground({ type: "hello" })
    .then(setState)
    .catch(() => {});
}

// Top frame only, and once per page (an extension reload may inject again).
if (window.top === window && !window.__splitCompanion) {
  window.__splitCompanion = true;
  main();
}
