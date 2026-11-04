# Split Companion

A Firefox extension that adds what the native tab Split View doesn't do.

| Feature | What it does | Shortcut |
|---|---|---|
| Sync scrolling · proportional | Keeps both panes at the same relative position. Good for documents of different lengths, like an original and its translation. | `Alt+Shift+S` (toggle) |
| Sync scrolling · same distance | Scrolls both panes by the same number of pixels. Align once, then lock; good for comparing two versions of a page. | Popup |
| Link mode | Plain clicks on links in the pane you're in open in the other pane. Hold any modifier key to click normally. | `Alt+Shift+L` |
| Focus other pane | Moves focus to the other pane. | `Alt+Shift+O` |
| Swap sides | Swaps the left and right panes. | `Alt+Shift+X` |
| Saved pairs | Saves both URLs and the settings. Restoring opens both tabs; one Option+click turns them into a split. | Popup |

Not every app scrolls the whole document. On app-shell pages where an inner element scrolls instead (SPAs like Gmail or Notion), the extension finds the largest scrollable area and syncs that.

On macOS, `Alt` is the Option (⌥) key.

## Platform limits

Firefox gives extensions only `tabs.Tab.splitViewId` (read) and `tabs.move` (swap sides). **Extensions cannot create a split.** So restoring a pair stops at opening both tabs; the user then **holds ⌥ Option (Alt on Windows/Linux) and clicks the right-hand tab**. That's a native Firefox gesture that joins the current tab and the clicked tab into a split. Right-click a tab → **Open in Split View** works too. Once the split forms, the saved settings apply automatically.

Creating a split by dragging a tab isn't possible either: Firefox itself doesn't support it, and the extension API can't add it (as of Firefox 159).

Extension content scripts never run on local files (`file://`) or browser pages (`about:`, addons.mozilla.org). The popup says so when a pane is one of these.

## Development

Written in TypeScript and bundled into `dist/` with esbuild. `dist/` is the complete extension; web-ext runs, lints and packages that folder.

```bash
npm install
```

```bash
npm run dev
```

`npm run dev` starts esbuild in watch mode, a local server for the test pages (`http://127.0.0.1:8765`), and web-ext together. Edits rebuild and the extension reloads automatically. The test pages are served over `http://` because Firefox doesn't run extension content scripts on `file://` pages.

| Command | What it does |
|---|---|
| `npm run build` | Builds `dist/` |
| `npm run typecheck` | `tsc --noEmit` (the build doesn't check types) |
| `npm run lint` | Builds, then runs the AMO validator (`web-ext lint`) |
| `npm run test:e2e` | End-to-end tests |
| `npm run package` | Creates the release zip in `artifacts/` |

### End-to-end tests

The tests create a real native split in a real Firefox (via `gBrowser.addTabSplitView` in the chrome context) and observe the extension only through pages and extension APIs. They build `dist/` first and install that build.

```bash
uv run tests/e2e/test_split.py
```

With `HEADED=1` the browser window is visible, and on macOS the shortcut tests also run, using OS-level native key events (they're skipped in headless mode, where native key events aren't delivered). Set `FIREFOX_BIN` to use a different Firefox.

### Submitting to AMO

When the uploaded code is bundled, Mozilla asks for the original source and build instructions. `dist/` isn't minified so reviewers can read it. Submit the source with `package-lock.json` and these build steps:

```bash
npm ci && npm run build
```

## Layout

- `src/background.ts`: split tracking, state (`storage.session`), message routing, shortcuts, saved pairs
- `src/content.ts`: scroll measurement and syncing (with echo suppression), link interception, the link-direction arrow
- `src/popup.ts`: controls for the current split, saved pairs list
- `src/protocol.ts`: shared types and the message protocol; each message has a typed reply
- `src/firefox-split.d.ts`: Firefox 159 split view API types missing from `@types/firefox-webext-browser` (Firefox 143)
- `static/`: `manifest.json`, `popup.html`/`popup.css`, `_locales/{en,ko}`, icon; copied into `dist/` on build
- `scripts/build.mjs`: esbuild build; `scripts/dev.sh`: development runner
- `tests/e2e/`: end-to-end tests and fixture pages
