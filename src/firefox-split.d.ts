// Firefox 159 split view additions missing from @types/firefox-webext-browser
// (generated from Firefox 143 schemas). Source of truth: the browser's own
// chrome/browser/content/browser/schemas/tabs.json.

declare namespace browser.tabs {
  /** `tabs.SPLIT_VIEW_ID_NONE`: the tab is not in a split view. */
  const SPLIT_VIEW_ID_NONE: -1;

  interface Tab {
    /** The split view the tab belongs to, or `SPLIT_VIEW_ID_NONE`. */
    splitViewId?: number | undefined;
  }

  interface _QueryQueryInfo {
    splitViewId?: number | undefined;
  }

  interface _OnUpdatedChangeInfo {
    splitViewId?: number | undefined;
  }
}
