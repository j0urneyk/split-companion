# /// script
# requires-python = ">=3.11"
# dependencies = ["selenium>=4.25", "pillow>=11"]
# ///
"""Capture AMO listing screenshots from a real Firefox with a real split view.

Run:  uv run store/screenshots.py   (opens a visible Firefox window; takes ~30s)

Output: store/screenshots/*.png at 1280x800. The popup can't be captured as
part of the window (it's a separate panel), so it's rendered as a page for the
same tab (popup.html?tabId=N), captured, and composited under the toolbar icon.
"""

import functools
import http.server
import io
import os
import pathlib
import socketserver
import sys
import threading
import time

from PIL import Image, ImageDraw, ImageFilter
from selenium.webdriver.common.by import By

HERE = pathlib.Path(__file__).resolve().parent
sys.path.insert(0, str(HERE.parent / "tests" / "e2e"))
os.environ["HEADED"] = "1"  # chrome-context screenshots need a real window
import test_split as T  # noqa: E402

OUT = HERE / "screenshots"
SIZE = (1280, 800)
WIDGET = "_" + T.ADDON_ID.strip("{}") + "_-browser-action"


def serve(directory):
    handler = functools.partial(http.server.SimpleHTTPRequestHandler, directory=str(directory))
    handler.log_message = lambda *a: None
    httpd = socketserver.TCPServer(("127.0.0.1", 0), handler)
    threading.Thread(target=httpd.serve_forever, daemon=True).start()
    return httpd, f"http://localhost:{httpd.server_address[1]}"


def capture_popup(h, tab_id):
    """Render the popup for tab_id in its own window and return it as an image."""
    main = h.d.current_window_handle
    h.d.switch_to.new_window("window")
    h.d.get(f"moz-extension://{h.uuid}/popup.html?tabId={tab_id}")
    time.sleep(0.8)
    png = h.d.find_element(By.TAG_NAME, "body").screenshot_as_png
    h.d.close()
    h.d.switch_to.window(main)
    return Image.open(io.BytesIO(png)).convert("RGBA")


def select_left_pane(h):
    h.chrome("gB.selectedTab = gB.tabs.filter(t => t.splitview).sort((a, b) => a._tPos - b._tPos)[0];")


def capture_window(h):
    """Screenshot the whole browser window with only the split tabs visible.

    The chrome-level snapshot leaves out some page content (the link-mode arrow,
    a fixed element in a shadow root), so each pane is re-captured from its own
    page and pasted over its area: every pixel is still a real capture.
    """
    # Pane rects are only laid out while the split is the selected tab.
    select_left_pane(h)
    time.sleep(0.5)
    panes = h.chrome(
        "return gB.tabs.filter(t => t.splitview).map(t => {"
        "  const r = t.linkedBrowser.getBoundingClientRect();"
        "  return [t.linkedBrowser.currentURI.spec, r.left, r.top, r.width, r.height];"
        "});"
    )
    shots = []
    for url, *rect in panes:
        h.d.switch_to.window(h.handle_for(url))
        time.sleep(0.4)
        shots.append((rect, Image.open(io.BytesIO(h.d.get_screenshot_as_png())).convert("RGBA")))
    # Select a split tab before hiding the extension page: the selected tab can't be hidden.
    select_left_pane(h)
    h.chrome("for (const t of gB.tabs) if (t.linkedBrowser.currentURI.spec.startsWith('moz-extension:')) gB.hideTab(t);")
    time.sleep(1.5)  # let the tab strip and focus outline settle
    with h.d.context(h.d.CONTEXT_CHROME):
        png = h.d.get_screenshot_as_png()
    icon = h.chrome(f"const r = win.document.getElementById('{WIDGET}').getBoundingClientRect(); return [r.left, r.bottom, r.right];")
    width = h.chrome("return win.innerWidth;")
    h.chrome("for (const t of gB.tabs) if (t.hidden) gB.showTab(t);")
    img = Image.open(io.BytesIO(png)).convert("RGBA")
    dpr = img.width / width
    for (left, top, w, hgt), shot in shots:
        box = (round(left * dpr), round(top * dpr), round((left + w) * dpr), round((top + hgt) * dpr))
        img.paste(shot.resize((box[2] - box[0], box[3] - box[1]), Image.LANCZOS), box[:2])
    return img, icon, dpr  # icon rect in CSS px, device pixel ratio


def composite(window, icon, dpr, popup, name):
    """Place the popup under the toolbar icon, right-aligned like Firefox does."""
    left, bottom, right = (v * dpr for v in icon)
    x = int(min(right + 8 * dpr, window.width - 8 * dpr) - popup.width)
    y = int(bottom + 4 * dpr)
    radius = int(8 * dpr)
    mask = Image.new("L", popup.size, 0)
    ImageDraw.Draw(mask).rounded_rectangle([0, 0, *popup.size], radius, fill=255)
    shadow = Image.new("RGBA", window.size, (0, 0, 0, 0))
    ImageDraw.Draw(shadow).rounded_rectangle(
        [x, y + int(4 * dpr), x + popup.width, y + popup.height + int(4 * dpr)], radius, fill=(0, 0, 0, 110)
    )
    out = Image.alpha_composite(window, shadow.filter(ImageFilter.GaussianBlur(12 * dpr)))
    out.paste(popup, (x, y), mask)
    OUT.mkdir(exist_ok=True)
    out.convert("RGB").resize(SIZE, Image.LANCZOS).save(OUT / name, optimize=True)
    print("saved", OUT / name)


def reset(h):
    h.unsplit_all()
    h.close_tabs_except_ext()


def main():
    httpd, base = serve(HERE / "demo")
    h = T.Harness(base, prefs={"intl.locale.requested": "en-US"})
    try:
        h.d.set_window_size(*SIZE)
        # Pin the toolbar button so the badge and popup anchor are visible.
        h.chrome(f"win.CustomizableUI.addWidgetToArea('{WIDGET}', win.CustomizableUI.AREA_NAVBAR);")

        # 1. Sync scrolling: an article and its translation at the same relative position.
        left, right = h.make_split("bicycle-en.html", "bicycle-ko.html")
        h.send({"type": "setOptions", "tabId": left, "patch": {"sync": "ratio"}})
        hl = h.handle_for("bicycle-en.html")
        time.sleep(0.3)
        h.in_tab(hl, "const el = document.scrollingElement; el.scrollTo(0, 0.42 * (el.scrollHeight - el.clientHeight));")
        time.sleep(0.6)
        popup = capture_popup(h, left)
        window, icon, dpr = capture_window(h)
        composite(window, icon, dpr, popup, "1-sync-scrolling.png")
        reset(h)

        # 2. Link mode: a reading list on the left opens articles on the right.
        left, right = h.make_split("reading-list.html", "bicycle-en.html")
        h.send({"type": "setOptions", "tabId": left, "patch": {"linkSource": left}})
        hl = h.handle_for("reading-list.html")
        time.sleep(0.3)
        h.d.switch_to.window(hl)
        h.d.find_element(By.LINK_TEXT, "How Lighthouses Work").click()
        T.wait_until(lambda: h.ext("return (await browser.tabs.get(args[0])).url;", right).endswith("lighthouse.html"))
        time.sleep(0.6)
        popup = capture_popup(h, left)
        window, icon, dpr = capture_window(h)
        composite(window, icon, dpr, popup, "2-link-mode.png")

        # 3. The same split without the popup: the arrow and badge on their own.
        window, _, _ = capture_window(h)
        OUT.mkdir(exist_ok=True)
        window.convert("RGB").resize(SIZE, Image.LANCZOS).save(OUT / "3-link-arrow.png", optimize=True)
        print("saved", OUT / "3-link-arrow.png")
    finally:
        h.d.quit()
        httpd.shutdown()


if __name__ == "__main__":
    main()
