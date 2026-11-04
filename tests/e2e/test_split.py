# /// script
# requires-python = ">=3.11"
# dependencies = ["selenium>=4.25"]
# ///
"""End-to-end checks against a real Firefox with a real native split view.

Run:  uv run tests/e2e/test_split.py            (headless; builds dist/ first)
      HEADED=1 uv run tests/e2e/test_split.py   (watch it, plus native-key shortcut tests)

Splits are created through the chrome context (gBrowser.addTabSplitView),
the same call Firefox's own "Open in Split View" menu makes. Everything the
extension does is then observed only through pages and extension APIs.
"""

import functools
import http.server
import json
import os
import pathlib
import socketserver
import subprocess
import sys
import threading
import time

from selenium import webdriver
from selenium.webdriver.common.by import By
from selenium.webdriver.firefox.options import Options
from selenium.webdriver.firefox.service import Service

ROOT = pathlib.Path(__file__).resolve().parents[2]
DIST = ROOT / "dist"
FIXTURES = pathlib.Path(__file__).parent / "fixtures"
FIREFOX = os.environ.get("FIREFOX_BIN", "/Applications/Firefox.app/Contents/MacOS/firefox")
ADDON_ID = "{762e7a0e-a0e4-4939-93c3-71fc01c441d7}"

results = []


def check(name, ok, detail=""):
    results.append((name, bool(ok), detail))
    print(f"{'PASS' if ok else 'FAIL'}  {name}  {detail}", flush=True)


def wait_until(fn, timeout=5.0, interval=0.05):
    end = time.time() + timeout
    last = None
    while time.time() < end:
        last = fn()
        if last:
            return last
        time.sleep(interval)
    return last


# ---------------------------------------------------------------------------
# Fixture server


def start_server():
    handler = functools.partial(http.server.SimpleHTTPRequestHandler, directory=str(FIXTURES))
    handler.log_message = lambda *a: None
    httpd = socketserver.TCPServer(("127.0.0.1", 0), handler)
    threading.Thread(target=httpd.serve_forever, daemon=True).start()
    return httpd, f"http://127.0.0.1:{httpd.server_address[1]}"


# ---------------------------------------------------------------------------
# Browser helpers


class Harness:
    def __init__(self, base, prefs=None):
        self.base = base
        opts = Options()
        opts.binary_location = FIREFOX
        if not os.environ.get("HEADED"):
            opts.add_argument("-headless")
        opts.set_preference("browser.tabs.splitView.enabled", True)
        for name, value in (prefs or {}).items():
            opts.set_preference(name, value)
        # Chrome-context scripts (used only to create splits) need system access.
        self.d = webdriver.Firefox(options=opts, service=Service(service_args=["--allow-system-access"]))
        self.d.set_window_size(1400, 900)
        self.d.install_addon(str(DIST), temporary=True)  # noqa: deprecated alias, still supported
        self.uuid = wait_until(self._addon_uuid, timeout=10)
        assert self.uuid, "extension did not install"
        # A non-split tab hosting an extension page, used to call extension APIs.
        self.d.get(f"moz-extension://{self.uuid}/popup.html")
        self.ext_handle = self.d.current_window_handle

    def _addon_uuid(self):
        with self.d.context(self.d.CONTEXT_CHROME):
            raw = self.d.execute_script(
                "return Services.prefs.getStringPref('extensions.webextensions.uuids', '{}')"
            )
        return json.loads(raw).get(ADDON_ID)

    def chrome(self, script, *args):
        with self.d.context(self.d.CONTEXT_CHROME):
            return self.d.execute_script(
                "const win = Services.wm.getMostRecentWindow('navigator:browser');"
                "const gB = win.gBrowser;" + script,
                *args,
            )

    def ext(self, body, *args):
        """Run async code in the extension page; `browser` is the WebExtension API."""
        self.d.switch_to.window(self.ext_handle)
        return self.d.execute_async_script(
            "const done = arguments[arguments.length - 1];"
            "const browser = window.wrappedJSObject?.browser ?? window.browser;"
            "const args = Array.from(arguments).slice(0, -1);"
            f"(async () => {{ {body} }})().then(r => done(JSON.parse(JSON.stringify(r ?? null))),"
            " e => done({__error: String(e)}));",
            *args,
        )

    def send(self, msg):
        return self.ext("return browser.runtime.sendMessage(args[0]);", msg)

    def make_split(self, left_path, right_path):
        """Open two tabs and join them into a native split. Returns (leftId, rightId) extension tab ids."""
        urls = [f"{self.base}/{left_path}", f"{self.base}/{right_path}"]
        self.chrome(
            "const a = gB.addTrustedTab(arguments[0]);"
            "const b = gB.addTrustedTab(arguments[1]);"
            "gB.addTabSplitView([a, b], { insertBefore: a });"
            "gB.selectedTab = a;",
            *urls,
        )
        ids = wait_until(
            lambda: self.ext(
                "const tabs = await browser.tabs.query({});"
                "const a = tabs.find(t => t.url === args[0] && t.splitViewId > -1 && t.status === 'complete');"
                "const b = tabs.find(t => t.url === args[1] && t.splitViewId === a?.splitViewId && t.status === 'complete');"
                "return a && b ? [a.id, b.id] : null;",
                *urls,
            ),
            timeout=10,
        )
        assert ids, f"split for {urls} not observed"
        return ids

    def handle_for(self, url_part):
        for h in self.d.window_handles:
            self.d.switch_to.window(h)
            if url_part in self.d.current_url:
                return h
        raise AssertionError(f"no tab with {url_part}")

    def in_tab(self, handle, script, *args):
        self.d.switch_to.window(handle)
        return self.d.execute_script(script, *args)

    def unsplit_all(self):
        self.chrome("for (const t of gB.tabs) t.splitview?.unsplitTabs();")

    def close_tabs_except_ext(self):
        for h in list(self.d.window_handles):
            if h != self.ext_handle:
                self.d.switch_to.window(h)
                self.d.close()
        self.d.switch_to.window(self.ext_handle)


SCROLL_POS = """
const el = arguments[0] ? document.querySelector(arguments[0]) : document.scrollingElement;
const max = el.scrollHeight - el.clientHeight;
return { top: el.scrollTop, max, ratio: max > 0 ? el.scrollTop / max : 0 };
"""


def pos(h, handle, sel=None):
    return h.in_tab(handle, SCROLL_POS, sel)


# ---------------------------------------------------------------------------
# Tests


def test_detect(h):
    left, right = h.make_split("long.html", "short.html")
    st = h.send({"type": "getStatus", "tabId": left})
    ok = st and st["split"] and st["split"]["left"]["id"] == left and st["split"]["right"]["id"] == right
    check("split detected with correct sides", ok, json.dumps(st.get("split", {}) if st else st)[:160])
    check("host permission granted on temporary install", st and st["hostGranted"])
    return left, right


def test_sync_ratio(h, left, right):
    h.send({"type": "setOptions", "tabId": left, "patch": {"sync": "ratio"}})
    hl, hr = h.handle_for("long.html"), h.handle_for("short.html")
    errors = []
    for target in (0.25, 0.5, 0.9, 0.0):
        h.in_tab(hl, "const el=document.scrollingElement; el.scrollTo(0, target=arguments[0]*(el.scrollHeight-el.clientHeight));", target)
        got = wait_until(lambda: (lambda p: p if abs(p["ratio"] - target) < 0.01 else None)(pos(h, hr)), timeout=3)
        p = pos(h, hr)
        errors.append(abs(p["ratio"] - target) * p["max"])
        if not got:
            break
    check("ratio sync: right follows left", max(errors) <= 2, f"max error {max(errors):.1f}px over {len(errors)} moves")

    # Reverse direction: the right pane drives too.
    h.in_tab(hr, "const el=document.scrollingElement; el.scrollTo(0, 0.6*(el.scrollHeight-el.clientHeight));")
    got = wait_until(lambda: abs(pos(h, hl)["ratio"] - 0.6) < 0.01, timeout=3)
    check("ratio sync: left follows right", got, f"left ratio {pos(h, hl)['ratio']:.3f}")

    # No feedback loop: positions stay put once settled.
    before = (pos(h, hl)["top"], pos(h, hr)["top"])
    time.sleep(1.0)
    after = (pos(h, hl)["top"], pos(h, hr)["top"])
    check("no echo / drift after settling", before == after, f"{before} -> {after}")


def test_sync_delta(h, left, right):
    h.send({"type": "setOptions", "tabId": left, "patch": {"sync": "off"}})
    hl, hr = h.handle_for("long.html"), h.handle_for("short.html")
    h.in_tab(hl, "document.scrollingElement.scrollTo(0, 1000)")
    h.in_tab(hr, "document.scrollingElement.scrollTo(0, 200)")
    time.sleep(0.3)
    unchanged = pos(h, hl)["top"] == 1000
    check("sync off: panes independent", unchanged, f"left top {pos(h, hl)['top']}")
    h.send({"type": "setOptions", "tabId": left, "patch": {"sync": "delta"}})
    time.sleep(0.2)
    h.in_tab(hl, "document.scrollingElement.scrollBy(0, 300)")
    got = wait_until(lambda: pos(h, hr)["top"] == 500, timeout=3)
    check("delta sync keeps manual offset", got, f"right top {pos(h, hr)['top']} (want 500)")


def test_appshell(h):
    left, right = h.make_split("appshell.html", "long.html")
    h.send({"type": "setOptions", "tabId": left, "patch": {"sync": "ratio"}})
    hl, hr = h.handle_for("appshell.html"), h.handle_for("long.html")
    time.sleep(0.2)
    h.in_tab(hl, "const m=document.querySelector('#main'); m.scrollTo(0, 0.5*(m.scrollHeight-m.clientHeight));")
    got = wait_until(lambda: abs(pos(h, hr)["ratio"] - 0.5) < 0.01, timeout=3)
    check("inner-scroller page drives document page", got, f"right ratio {pos(h, hr)['ratio']:.3f}")
    h.in_tab(hr, "const el=document.scrollingElement; el.scrollTo(0, 0.2*(el.scrollHeight-el.clientHeight));")
    got = wait_until(lambda: abs(pos(h, hl, "#main")["ratio"] - 0.2) < 0.01, timeout=3)
    check("document page drives inner-scroller page", got, f"left inner ratio {pos(h, hl, '#main')['ratio']:.3f}")
    return left, right


def test_link_mode(h):
    left, right = h.make_split("links.html", "long.html")
    h.send({"type": "setOptions", "tabId": left, "patch": {"linkSource": left}})
    hl = h.handle_for("links.html")
    time.sleep(0.2)
    h.d.switch_to.window(hl)
    h.d.find_element(By.ID, "go").click()
    routed = wait_until(
        lambda: h.ext("return (await browser.tabs.get(args[0])).url;", right).endswith("/target.html"), timeout=5
    )
    left_url = h.ext("return (await browser.tabs.get(args[0])).url;", left)
    check("link mode: click opens in other pane", routed, f"right -> {h.ext('return (await browser.tabs.get(args[0])).url;', right)}")
    check("link mode: source pane stays put", left_url.endswith("/links.html"), left_url)

    badge_l = h.ext("return browser.action.getBadgeText({tabId: args[0]});", left)
    badge_r = h.ext("return browser.action.getBadgeText({tabId: args[0]});", right)
    check("badges show link direction", badge_l == "→" and badge_r == "←", f"{badge_l!r} / {badge_r!r}")

    MARKER = "const m = document.querySelector('split-companion-marker'); return m && [m.dataset.side, m.style.right, m.style.left];"
    check("source pane shows arrow on edge facing target", h.in_tab(hl, MARKER) == ["left", "0px", ""], str(h.in_tab(hl, MARKER)))
    hr_now = h.handle_for("target.html")
    check("target pane shows no marker", h.in_tab(hr_now, MARKER) is None)

    # Clicks in the target pane are not routed back.
    h.d.switch_to.window(h.handle_for("target.html"))
    h.d.execute_script("location.href = arguments[0]", f"{h.base}/long.html")
    hr = h.handle_for("long.html")
    wait_until(lambda: h.in_tab(hr, "return document.readyState") == "complete")
    time.sleep(0.3)
    h.d.switch_to.window(hr)
    h.d.find_element(By.ID, "to-short").click()
    time.sleep(0.5)
    right_url = h.ext("return (await browser.tabs.get(args[0])).url;", right)
    left_url = h.ext("return (await browser.tabs.get(args[0])).url;", left)
    check("target pane navigates normally", right_url.endswith("/short.html") and left_url.endswith("/links.html"), f"L {left_url[-12:]} R {right_url[-12:]}")
    return left, right


def test_link_exclusions(h):
    left, right = h.make_split("long.html", "target.html")
    h.send({"type": "setOptions", "tabId": left, "patch": {"linkSource": left}})
    hl = h.handle_for("long.html")
    time.sleep(0.2)
    h.d.switch_to.window(hl)
    h.d.find_element(By.ID, "hash").click()
    time.sleep(0.4)
    left_url = h.ext("return (await browser.tabs.get(args[0])).url;", left)
    right_url = h.ext("return (await browser.tabs.get(args[0])).url;", right)
    check("in-page #hash links stay in source pane", left_url.endswith("#s10") and right_url.endswith("/target.html"), f"L {left_url[-14:]} R {right_url[-12:]}")


def test_swap(h, left, right):
    h.send({"type": "command", "tabId": left, "command": "swap-sides"})
    st = wait_until(
        lambda: (lambda s: s if s["split"] and s["split"]["left"]["id"] == right else None)(
            h.send({"type": "getStatus", "tabId": left})
        ),
        timeout=3,
    )
    check("swap reverses the split", st, "" if st else json.dumps(h.send({"type": "getStatus", "tabId": left})["split"])[:120])
    still = h.ext("const [a,b] = await Promise.all(args.map(id => browser.tabs.get(id))); return a.splitViewId > -1 && a.splitViewId === b.splitViewId;", left, right)
    check("swap keeps tabs in the same split", still)


def test_focus_other(h, left, right):
    # One script: switching Selenium back to the extension tab would change the active tab.
    active = h.ext(
        "await browser.runtime.sendMessage({type: 'command', tabId: args[0], command: 'focus-other'});"
        "return (await browser.tabs.get(args[1])).active;",
        left,
        right,
    )
    check("focus-other activates partner pane", active)


def test_save_restore(h, left, right):
    h.send({"type": "setOptions", "tabId": left, "patch": {"sync": "delta", "linkSource": left}})
    pair = h.send({"type": "savePair", "tabId": left})
    check("pair saved", pair and pair["sync"] == "delta" and pair["linkSide"] in ("left", "right"), json.dumps(pair)[:160])
    # Restore and inspect in one script so Selenium doesn't reselect the extension tab.
    res = h.ext(
        "const r = await browser.runtime.sendMessage({type: 'restorePair', id: args[0]});"
        "const [a, b] = await Promise.all([r.leftId, r.rightId].map(id => browser.tabs.get(id)));"
        "return {...r, state: [a.highlighted, b.highlighted, b.index - a.index]};",
        pair["id"],
    )
    lid, rid, hl = res["leftId"], res["rightId"], res["state"]
    check("restore opens both tabs adjacent and selected", hl == [True, True, 1], str(hl))
    # The user's single step, as the popup instructs: Alt/Option+click the right tab.
    h.chrome(
        "const [left, right] = gB.selectedTabs;"
        "if (gB.selectedTab !== left) throw new Error('left tab should be active');"
        "right.dispatchEvent(new win.MouseEvent('click', { button: 0, altKey: true, bubbles: true }));"
    )
    st = wait_until(
        lambda: (lambda s: s if s["split"] and s["options"]["sync"] == "delta" else None)(
            h.send({"type": "getStatus", "tabId": lid})
        ),
        timeout=5,
    )
    want_source = lid if pair["linkSide"] == "left" else rid
    check(
        "saved options auto-apply when split forms",
        st and st["options"]["linkSource"] == want_source,
        json.dumps(st["options"] if st else None),
    )


def test_unsplit_clears(h, left, right):
    h.send({"type": "setOptions", "tabId": left, "patch": {"sync": "ratio"}})
    h.unsplit_all()
    st = wait_until(lambda: (lambda s: s if s["split"] is None else None)(h.send({"type": "getStatus", "tabId": left})), timeout=3)
    badge = h.ext("return browser.action.getBadgeText({tabId: args[0]});", left)
    check("unsplit clears split state and badge", st and badge == "", f"badge {badge!r}")


# macOS virtual key codes / nsIWidget native modifier flags, as Firefox's own
# EventUtils.synthesizeNativeKey uses them. WebDriver key actions never reach
# chrome-level shortcuts, so a native event is the only faithful test.
MAC_KEY = {"L": 0x25, "S": 0x01}
MAC_SHIFT, MAC_OPTION = 0x0100, 0x1000


def press_option_shift(h, letter, chars):
    h.chrome(
        "win.windowUtils.sendNativeKeyEvent(0, arguments[0], arguments[1], arguments[2], arguments[3], null);",
        MAC_KEY[letter],
        MAC_SHIFT | MAC_OPTION,
        chars,
        letter,
    )


def test_shortcuts(h):
    if sys.platform != "darwin" or not os.environ.get("HEADED"):
        print("SKIP  shortcut tests (need macOS and HEADED=1: native key events require a visible window)")
        return
    left, right = h.make_split("links.html", "long.html")
    h.d.switch_to.window(h.handle_for("links.html"))  # focus the left pane
    press_option_shift(h, "L", "\u00d2")
    opts = wait_until(lambda: (lambda o: o if o["linkSource"] else None)(h.send({"type": "getStatus", "tabId": left})["options"]), timeout=3)
    check("Option+Shift+L makes the focused pane the link source", opts and opts["linkSource"] == left, json.dumps(opts))
    h.d.switch_to.window(h.handle_for("links.html"))
    press_option_shift(h, "S", "\u00cd")
    opts = wait_until(lambda: (lambda o: o if o["sync"] != "off" else None)(h.send({"type": "getStatus", "tabId": left})["options"]), timeout=3)
    check("Option+Shift+S turns on sync scrolling", opts and opts["sync"] == "ratio", json.dumps(opts))


def test_unavailable_page_reported(h):
    # Content scripts never run on file:// pages; the popup must say so.
    file_base = "file://" + str(FIXTURES)
    urls = [f"{h.base}/long.html", f"{file_base}/short.html"]
    h.chrome(
        "const a = gB.addTrustedTab(arguments[0]); const b = gB.addTrustedTab(arguments[1]);"
        "gB.addTabSplitView([a, b], { insertBefore: a }); gB.selectedTab = a;",
        *urls,
    )
    left = wait_until(
        lambda: h.ext(
            "const t = (await browser.tabs.query({})).find(t => t.url === args[0] && t.splitViewId > -1 && t.status === 'complete'); return t?.id;",
            urls[0],
        ),
        timeout=10,
    )
    time.sleep(0.5)
    st = h.send({"type": "getStatus", "tabId": left})
    ready = (st["split"]["left"]["ready"], st["split"]["right"]["ready"])
    check("popup status flags pane where extension can't run", ready == (True, False), str(ready))


def main():
    # Test what ships: the bundled extension, not the TypeScript sources.
    subprocess.run(["npm", "run", "-s", "build"], cwd=ROOT, check=True, stdout=subprocess.DEVNULL)
    httpd, base = start_server()
    h = Harness(base)
    try:
        left, right = test_detect(h)
        test_sync_ratio(h, left, right)
        test_sync_delta(h, left, right)
        test_swap(h, left, right)
        test_focus_other(h, left, right)
        test_save_restore(h, left, right)
        test_unsplit_clears(h, left, right)
        h.close_tabs_except_ext()
        test_appshell(h)
        h.unsplit_all()
        h.close_tabs_except_ext()
        test_link_mode(h)
        h.unsplit_all()
        h.close_tabs_except_ext()
        test_link_exclusions(h)
        h.unsplit_all()
        h.close_tabs_except_ext()
        test_unavailable_page_reported(h)
        h.unsplit_all()
        h.close_tabs_except_ext()
        test_shortcuts(h)
    except Exception as e:  # report what ran so far
        check("harness", False, repr(e))
    finally:
        h.d.quit()
        httpd.shutdown()
    failed = [r for r in results if not r[1]]
    print(f"\n{len(results) - len(failed)}/{len(results)} passed")
    sys.exit(1 if failed else 0)


if __name__ == "__main__":
    main()
