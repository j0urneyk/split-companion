# AMO listing

Copy each block into the matching field on addons.mozilla.org. English is the default locale; add Korean under "Manage localizations" (언어 관리) on the listing page.

## Settings

| Field | Value |
|---|---|
| Name | Split Companion |
| Slug (URL) | `split-companion` |
| Category | Tabs |
| Tags | split view, tabs, scroll, sync scroll, side by side, compare |
| License | Your choice (MPL-2.0 matches Firefox; MIT is the most permissive) |
| Privacy policy | Not needed: the add-on collects no data |
| Support email / website | Your choice |
| Requires payment / experimental | No / No |

## Screenshots

Files in `store/screenshots/` (1280×800, regenerate with `uv run store/screenshots.py`). Upload in this order with these captions:

| File | Caption (English) | 캡션 (Korean) |
|---|---|---|
| `1-sync-scrolling.png` | Sync scrolling: an article and its translation stay aligned. | 동기 스크롤: 원문과 번역문이 같은 위치에 맞춰집니다. |
| `2-link-mode.png` | Link mode: a link clicked in the list opens on the right. | 링크 모드: 왼쪽 목록에서 누른 링크가 오른쪽에서 열립니다. |
| `3-link-arrow.png` | The arrow on the pane's edge shows where links open. | 창 가장자리의 화살표가 링크가 열리는 쪽을 가리킵니다. |

## English

### Summary (≤ 250 characters)

```
Synced scrolling and link routing for Firefox's built-in split view.
```

### Description

```
Firefox's split view puts two tabs side by side, but the two panes don't know about each other. This add-on connects them.

Turn on sync scrolling and scrolling one pane scrolls the other. It can keep both at the same relative position (for a document and its translation) or move them by the same distance (for comparing two versions of a page).

Link mode makes one pane the list and the other the reader: click a link on the left, it opens on the right. It suits search results, issue lists and documentation indexes. Hold a modifier key to click normally.

Alt+Shift+S toggles sync scrolling, Alt+Shift+L link mode, Alt+Shift+O jumps to the other pane, Alt+Shift+X swaps them. On a Mac, Alt is Option. You can change the shortcuts in about:addons. Pairs of pages you open often can be saved and reopened.

What it can't do: add-ons can't create a split, so you make it yourself (hold Option/Alt and click a second tab). It also doesn't run on about: pages or local files, and it needs Firefox 159 or newer. It collects no data.
```

### Release notes for 0.1.0

```
First release: sync scrolling (proportional and same distance), link mode, shortcuts, saved pairs.
```

### Release notes for 0.1.1

```
New icon.
```

## 한국어 (Korean localization)

### 요약 (250자 이하)

```
Firefox 분할 화면에서 두 탭을 같이 스크롤하고, 링크를 반대쪽 탭에서 엽니다.
```

### 설명

```
Firefox의 분할 화면은 탭 두 개를 나란히 보여 주지만, 두 탭은 서로 연결되어 있지 않습니다. 이 확장이 둘을 연결합니다.

동기 스크롤을 켜면 한쪽을 스크롤할 때 다른 쪽도 따라갑니다. 같은 비율로 맞추는 방식(원문과 번역문처럼 길이가 다른 문서)과 같은 거리만큼 움직이는 방식(같은 페이지의 두 버전을 비교할 때)이 있습니다.

링크 모드를 켜면 한쪽은 목록, 다른 쪽은 본문이 됩니다. 왼쪽에서 링크를 누르면 오른쪽에서 열립니다. 검색 결과, 이슈 목록, 문서 목차를 볼 때 쓸 만합니다. 보조키를 누른 채 누르면 평소처럼 열립니다.

Alt+Shift+S는 동기 스크롤, L은 링크 모드, O는 반대쪽 탭으로 이동, X는 좌우 바꾸기입니다. Mac에서는 Alt가 Option입니다. 단축키는 about:addons에서 바꿀 수 있습니다. 자주 보는 두 페이지는 저장해 두고 다시 열 수 있습니다.

안 되는 것: 확장이 분할 화면을 직접 만들 수는 없어서 분할은 직접 하셔야 합니다(Option/Alt 키를 누른 채 다른 탭 클릭, 또는 탭 우클릭 후 '분할 화면 추가'). about: 페이지와 로컬 파일에서는 동작하지 않고, Firefox 159 이상이 필요합니다. 데이터는 수집하지 않습니다.
```

### 0.1.0 출시 노트

```
첫 출시: 동기 스크롤, 링크 모드, 단축키, 짝 저장.
```

### 0.1.1 출시 노트

```
새 아이콘.
```

## Notes to reviewer

```
Build: Node 22+, then `npm ci && npm run build`. Output is dist/, identical to the uploaded package. Bundled with esbuild, not minified.

Permissions:
- <all_urls>: the content script syncs scrolling between the two panes of Firefox's native Split View and routes link clicks from one pane to the other; it must run on whatever pages the user splits.
- tabs: reads tabs.Tab.splitViewId to find split partners, opens/moves tabs for saved pairs and the swap command.
No data is collected or sent anywhere; settings stay in storage.local/storage.session.

To test: open two tabs, Option/Alt+click the second tab to split them, then use the toolbar popup (sync scrolling, link mode).
```
