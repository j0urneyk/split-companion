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
| `1-sync-scrolling.png` | Sync scrolling keeps an article and its translation at the same place. | 동기 스크롤로 원문과 번역문을 같은 위치에 맞춰요. |
| `2-link-mode.png` | Link mode: click in the reading list, read on the right. | 링크 모드: 왼쪽 목록에서 클릭하면 오른쪽에서 열려요. |
| `3-link-arrow.png` | The arrow on the pane's edge shows where links open. | 창 가장자리의 화살표가 링크가 열리는 방향을 보여줘요. |

## English

### Summary (≤ 250 characters)

```
Adds what Firefox's built-in Split View is missing: synced scrolling between the two panes, a link mode that opens links from one pane in the other, keyboard shortcuts, and saved pairs you can reopen in one click.
```

### Description

```
Firefox now lets you view two tabs side by side. Split Companion makes that split view work harder.

SYNC SCROLLING
- Proportional: both panes stay at the same relative position. Great for an original and its translation, or two documents of different lengths.
- Same distance: both panes scroll by the same amount. Line them up once and compare two versions of a page.
- Works on app-style sites where an inner panel scrolls instead of the page.

LINK MODE
Click links in one pane and they open in the other, while the first pane stays put. Keep a list of search results, emails or docs on the left and read each item on the right. Hold any modifier key to click a link normally. A small arrow on the pane's edge shows which way links go.

SHORTCUTS (Option on macOS)
- Alt+Shift+S: sync scrolling on/off
- Alt+Shift+L: link mode on/off (the pane you're in becomes the source)
- Alt+Shift+O: focus the other pane
- Alt+Shift+X: swap left and right
You can change them in Add-ons → ⚙ → Manage Extension Shortcuts.

SAVED PAIRS
Save the two pages and their settings, and reopen them later. Firefox doesn't let add-ons create a split, so the add-on opens both tabs and you hold Option (Alt on Windows/Linux) and click the second tab. Your saved settings apply automatically.

GOOD TO KNOW
- Requires Firefox 159 or later with Split View. To split two tabs, hold Option/Alt and click another tab, or right-click a tab → Add Split View.
- Add-ons can't run on local files (file://) or Firefox's own pages (about:, addons.mozilla.org). The popup tells you when a pane is one of these.

PRIVACY
No data is collected or sent anywhere. Settings stay in your browser.
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
Firefox 기본 탭 스플릿에 없는 기능을 더해요. 두 창 동기 스크롤, 한쪽 창의 링크를 반대쪽에서 여는 링크 모드, 단축키, 클릭 한 번으로 다시 여는 짝 저장을 지원해요.
```

### 설명

```
이제 Firefox에서 탭 두 개를 나란히 볼 수 있어요. Split Companion은 그 스플릿 화면을 더 쓸모 있게 만들어요.

동기 스크롤
- 비율: 두 창을 같은 상대 위치로 맞춰요. 원문과 번역문처럼 길이가 다른 문서에 좋아요.
- 같은 거리: 두 창을 같은 만큼 스크롤해요. 한 번 맞춰 두고 두 버전의 페이지를 비교할 때 좋아요.
- 페이지 전체가 아니라 안쪽 영역이 스크롤되는 웹앱에서도 동작해요.

링크 모드
한쪽 창에서 링크를 클릭하면 그 창은 그대로 두고 반대쪽 창에서 열려요. 왼쪽에 검색 결과나 메일 목록, 문서 목차를 두고 오른쪽에서 하나씩 읽을 수 있어요. 보조키를 누르고 클릭하면 평소처럼 열려요. 창 가장자리의 작은 화살표가 링크가 열리는 방향을 보여줘요.

단축키 (macOS에서는 Alt 대신 Option)
- Alt+Shift+S: 동기 스크롤 켜기/끄기
- Alt+Shift+L: 링크 모드 켜기/끄기 (지금 있는 창이 출발점이 돼요)
- Alt+Shift+O: 반대쪽 창으로 포커스 이동
- Alt+Shift+X: 좌우 바꾸기
부가 기능 → ⚙ → 확장 기능 단축키 관리에서 바꿀 수 있어요.

짝 저장
두 페이지와 설정을 저장해 두고 나중에 다시 열 수 있어요. Firefox는 부가 기능이 스플릿을 직접 만드는 걸 허용하지 않아서, 두 탭을 열어 두면 Option(Windows/Linux는 Alt) 키를 누른 채 두 번째 탭을 클릭하면 돼요. 저장한 설정은 자동으로 적용돼요.

알아두세요
- 탭 스플릿 기능이 있는 Firefox 159 이상이 필요해요. Option/Alt 키를 누른 채 다른 탭을 클릭하거나, 탭 우클릭 → Add Split View로 스플릿을 만들 수 있어요.
- 로컬 파일(file://)과 Firefox 내부 페이지(about:, addons.mozilla.org)에서는 부가 기능이 동작할 수 없어요. 그런 창이면 팝업에서 알려줘요.

개인정보
어떤 데이터도 수집하거나 전송하지 않아요. 설정은 브라우저 안에만 저장돼요.
```

### 0.1.0 출시 노트

```
첫 출시: 동기 스크롤(비율, 같은 거리), 링크 모드, 단축키, 짝 저장.
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
