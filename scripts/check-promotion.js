// Network-free regression tests for the real promotion and conversion scripts.
const assert = require("node:assert/strict");
const fs = require("node:fs");
const vm = require("node:vm");
const path = require("node:path");
const root = path.join(__dirname, "..");
const url = "https://www.planity.com/lazoya-17000-la-rochelle";
const week = 7 * 86400000;
function browser(options = {}) {
  let now = Date.parse(options.date || "2026-11-16T12:00:00Z"), nextId = 0, disconnected = false;
  const timers = new Map(), nodes = [], listeners = new Map(), windowListeners = new Map(), events = [];
  const local = new Map(Object.entries(options.local || {})), session = new Map(Object.entries(options.session || {}));
  const classes = new Set();
  let focused = false;
  const previous = { isConnected: true, closest: () => null, focus() { focused = true; } };
  const listen = (map, name, fn, capture) => { const list = map.get(name) || []; list.push({ fn, capture }); map.set(name, list); };
  const unlisten = (map, name, fn) => map.set(name, (map.get(name) || []).filter(x => x.fn !== fn));
  function element(type = "a") {
    const attrs = {}, handlers = new Map();
    return { type, attrs, handlers, dataset: {}, hidden: false, open: false, isConnected: true,
      setAttribute(k, v) { attrs[k] = v; }, getAttribute: k => attrs[k] || null,
      hasAttribute: k => Object.hasOwn(attrs, k), closest() { return this.type === "a" ? this : null; },
      addEventListener(name, fn) { handlers.set(name, fn); }, removeEventListener(name) { handlers.delete(name); },
      getClientRects: () => [1], getBoundingClientRect: () => ({ left: 20, right: 480, top: 20, bottom: 600 }),
      focus() {}, contains(target) { return target === this || target === this.cta || target === this.closeButton; },
      show() { this.open = true; this.modal = false; }, showModal() { this.open = true; this.modal = true; },
      close() { this.open = false; }, remove() { this.open = false; this.isConnected = false; }
    };
  }
  const source = element();source.setAttribute("href", url);source.setAttribute("data-planity-booking", "");
  source.target = "_blank";
  const cookie = element("section");
  const mobile = { matches: !!options.mobile, addEventListener() {}, removeEventListener() {} };
  const controls = Object.fromEntries(["#bookingNoticeModal", "#closeBookingNotice", "#continueBooking"].map(id => [id, element("button")]));
  controls["#bookingNoticeModal"].hidden = true;
  const document = { querySelector: selector => controls[selector], body: { dataset: {}, append(node) { nodes.push(node); } }, activeElement: previous, hidden: false,
    documentElement: { classList: { add: s => classes.add(s), remove: s => classes.delete(s) } },
    querySelectorAll(selector) {
      if (selector === "a[data-planity-booking][href]") return [source];
      return options.blocked ? [cookie] : [];
    },
    addEventListener: (n, fn, cap) => listen(listeners, n, fn, cap), removeEventListener: (n, fn) => unlisten(listeners, n, fn),
    createElement(type) {
      const node = element(type);node.cta = element();node.cta.target = "_blank";
      node.cta.setAttribute("data-planity-booking", "");node.cta.dataset.bookingNoticeSeen = "true";
      node.closeButton = element("button");
      node.querySelector = selector => selector === ".christmas-promo__booking" ? node.cta : node.closeButton;
      return node;
    }
  };
  let mutation;
  class FakeDate extends Date { constructor(...args) { super(...(args.length ? args : [now])); } static now() { return now; } }
  const storage = map => ({ getItem(key) { if (options.storageFails) throw Error("blocked"); return map.get(key) || null; }, setItem(key, val) { if (options.storageFails) throw Error("blocked"); map.set(key, val); } });
  const window = { location: { pathname: options.pathname || "/", hash: "", href: "https://www.lazoya.fr/" },
    localStorage: storage(local), sessionStorage: storage(session), matchMedia: () => mobile,
    lazoyaCookieConsent: options.consent || { analytics: true, marketing: true }, gtag: (...args) => events.push(args),
    setTimeout(fn, ms) { const id = ++nextId; timers.set(id, { fn, at: now + ms }); return id; }, clearTimeout: id => timers.delete(id),
    addEventListener: (n, fn) => listen(windowListeners, n, fn), removeEventListener: (n, fn) => unlisten(windowListeners, n, fn)
  };
  const context = vm.createContext({ window, document, Date: FakeDate, Intl, URL, console,
    MutationObserver: class { constructor(fn) { mutation = fn; } observe() {} disconnect() { disconnected = true; } } });
  if (options.home) {
    const app = fs.readFileSync(path.join(root, "app.js"), "utf8");
    const notice = app.slice(app.indexOf("function wireBookingNotice()"), app.indexOf("function wireSuccessModal()"));
    vm.runInContext(notice + "\nwireBookingNotice();", context);
  }
  vm.runInContext(fs.readFileSync(path.join(root, "assets/conversions.js"), "utf8"), context);
  vm.runInContext(fs.readFileSync(path.join(root, "assets/christmas-promotion.js"), "utf8"), context);
  function advance(ms) {
    const end = now + ms;
    while (true) {
      const due = [...timers].filter(([, t]) => t.at <= end).sort((a, b) => a[1].at - b[1].at)[0];
      if (!due) break;
      now = due[1].at;timers.delete(due[0]);due[1].fn();
    }
    now = end;
  }
  function dispatch(name, event) {
    for (const capture of [true, undefined]) {
      for (const item of [...(listeners.get(name) || [])].filter(x => x.capture === capture)) item.fn(event);
    }
  }
  return { nodes, timers, classes, local, session, events, source, advance, mobile, options, controls,
    get restored() { return focused; }, get disconnected() { return disconnected; },
    mutation: () => mutation?.(),
    dismiss() { nodes[0].closeButton.handlers.get("click")(); },
    click(target, coords = {}) { dispatch("click", { target, clientX: 0, clientY: 0, ...coords, defaultPrevented: false, preventDefault() { this.defaultPrevented = true; } }); },
    escape() { dispatch("keydown", { key: "Escape", preventDefault() {} }); },
    ads: () => events.filter(x => x[0] === "event" && x[1] === "conversion")
  };
}
const dismissal = "lazoya.christmas2026.dismissedAt", sessionKey = "lazoya.christmas2026.seenAt";
const b = browser(); b.advance(2999);assert.equal(b.nodes.length, 0);b.advance(1);
assert.equal(b.nodes.length, 1);assert.equal(b.nodes[0].modal, true);assert.ok(b.classes.has("lazoya-promo-open"));
assert.equal(b.ads().length, 0);b.dismiss();assert.equal(b.nodes[0].open, false);assert.ok(b.local.has(dismissal));assert.ok(b.restored);assert.ok(b.disconnected);assert.equal(b.timers.size, 0);assert.equal(b.ads().length, 0);
for (const mode of ["escape", "outside"]) {
  const t = browser();t.advance(3000);if (mode === "escape") t.escape();else t.click(t.nodes[0]);
  assert.ok(t.local.has(dismissal));assert.equal(t.nodes[0].open, false);assert.equal(t.ads().length, 0);
}
const mobile = browser({ mobile: true });mobile.advance(3000);assert.equal(mobile.nodes[0].modal, false);assert.equal(mobile.classes.size, 0);
const booked = browser();booked.advance(3000);const cta = booked.nodes[0].cta;
assert.equal(cta.getAttribute("href"), url);assert.equal(cta.dataset.bookingNoticeSeen, "true");booked.click(cta);
assert.equal(booked.ads().length, 1);assert.equal(booked.ads()[0][2].send_to, "AW-18308603892/5tRVCPLrls4cEPS_nJpE");assert.ok(booked.local.has(dismissal));
const busy = browser();busy.click(busy.source);busy.advance(4000);assert.equal(busy.nodes.length, 0);
const cookies = browser({ blocked: true });cookies.advance(4000);assert.equal(cookies.nodes.length, 0);cookies.options.blocked = false;cookies.mutation();cookies.advance(300);assert.equal(cookies.nodes.length, 1);
const now = Date.parse("2026-11-16T12:00:00Z");
for (const options of [{ pathname: "/reservation/" }, { pathname: "/diagnostique/" }, { local: { [dismissal]: String(now - week + 1) } }, { session: { [sessionKey]: String(now - 1000) } }, { session: { "lazoya.christmas2026.bookingStarted": "true" } }, { date: "2026-11-14T22:59:59Z" }, { date: "2026-12-31T23:00:00Z" }]) {
  const t = browser(options);t.advance(4000);assert.equal(t.nodes.length, 0, JSON.stringify(options));
}
for (const options of [{ local: { [dismissal]: String(now - week) } }, { date: "2026-11-14T23:00:00Z" }, { storageFails: true }]) {
  const t = browser(options);t.advance(3000);assert.equal(t.nodes.length, 1, JSON.stringify(options));
}
const expiry = browser({ date: "2026-11-30T22:59:55Z" });expiry.advance(3000);assert.equal(expiry.nodes[0].open, true);expiry.advance(2000);assert.equal(expiry.nodes[0].open, false);assert.equal(expiry.timers.size, 0);
console.log("Promotion checks passed: 3-second delay, Paris date boundaries/automatic expiry, 7-day persistence, session navigation, cookie priority, mobile panel, close/outside/Escape, focus restoration, cleanup and one existing Ads event on booking only. No network requests made.");

for (const consent of [{ analytics: false, marketing: false }, { analytics: true, marketing: false }, { analytics: false, marketing: true }, { analytics: true, marketing: true }]) {
  const home = browser({ home: true, consent });home.advance(3000);home.click(home.nodes[0].cta);
  assert.equal(home.controls["#bookingNoticeModal"].hidden, true, "Popup booking goes directly to Planity without the homepage notice");
  assert.equal(home.ads().length, consent.marketing ? 1 : 0);
  assert.equal(home.events.filter(x => x[1] === "booking_intent").length, consent.analytics ? 1 : 0);
}
console.log("Homepage integration passed: popup CTA bypasses only the booking notice and uses the unchanged consent-gated tracking once.");

const november = browser({ date: "2026-11-30T22:59:55Z" });
november.advance(3000);
assert.ok(november.nodes[0].innerHTML.includes("Du 15 au 30 novembre 2026"));
assert.ok(november.nodes[0].innerHTML.includes("-10 %"));
assert.ok(!/dimanche|sunday/i.test(november.nodes[0].innerHTML));
november.advance(2000);
assert.equal(november.nodes[0].open, false, "Discount popup closes at midnight Paris on 1 December");
for (const date of ["2026-11-30T23:00:00Z", "2026-12-15T12:00:00Z"]) {
  const december = browser({ date });december.advance(4000);
  assert.equal(december.nodes.length, 0, "No December Sunday-opening popup");
  assert.equal(december.timers.size, 0);
}
const homepage = fs.readFileSync(path.join(root, "index.html"), "utf8");
assert.ok(!homepage.includes("data-christmas-sunday"));
assert.ok(homepage.includes("Dimanche & lundi"));
console.log("Sunday announcement removed; November discount preserved and expires at midnight Paris on 1 December; no December popup.");
