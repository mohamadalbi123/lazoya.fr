// No network calls: exercise the real tracking scripts against isolated browser stubs.
const assert = require("node:assert/strict");
const fs = require("node:fs");
const path = require("node:path");
const vm = require("node:vm");
const root = path.join(__dirname, "..");
const analytics = "G-3E9C5ZGQRW";
const ads = "AW-18308603892";
const destinations = {
  planity: "https://www.planity.com/lazoya-17000-la-rochelle",
  whatsapp: "https://wa.me/33956673009",
  phone: "tel:+33956673009",
  directions: "https://www.google.com/maps/search/?api=1&query=Lazoya"
};
function browser(consent) {
  const scripts = [], handlers = [], timers = [];
  const window = { dataLayer: [], location: { pathname: "/ongles/" }, setTimeout: fn => timers.push(fn) };
  const context = vm.createContext({ window, Date, Boolean, JSON,
    document: { head: { appendChild: script => scripts.push(script) }, createElement: () => ({}), addEventListener: (name, fn) => { if (name === "click") handlers.push(fn); } },
    console
  });
  window.localStorage = { getItem: () => consent ? JSON.stringify(consent) : null };
  for (const file of ["tracking-consent.js", "conversions.js"]) {
    vm.runInContext(fs.readFileSync(path.join(root, "assets", file), "utf8"), context);
  }
  const events = name => window.dataLayer.map(args => Array.from(args)).filter(args => args[0] === "event" && args[1] === name);
  function click(href, prevented = false) {
    const link = { target: "_blank", getAttribute: () => href };
    const event = { defaultPrevented: prevented, target: { closest: () => link }, preventDefault() { this.defaultPrevented = true; } };
    handlers.forEach(fn => fn(event));
  }
  return { window, scripts, events, click, timers };
}
for (const consent of [null, { analytics: false, marketing: false }, { analytics: true, marketing: false }, { analytics: false, marketing: true }, { analytics: true, marketing: true }]) {
  const b = browser(consent);
  assert.equal(b.scripts.length, consent && (consent.analytics || consent.marketing) ? 1 : 0);
  for (const [channel, href] of Object.entries(destinations)) b.click(href);
  assert.equal(b.events("booking_intent").length, consent?.analytics ? 4 : 0);
  assert.equal(b.events("conversion").length, consent?.marketing ? 4 : 0);
  for (const event of b.events("booking_intent")) {
    assert.equal(event[2].send_to, analytics);
    assert.equal(event[2].page_path, "/ongles/");
    assert.ok(Object.keys(destinations).includes(event[2].booking_channel));
  }
  const current = consent || { analytics: false, marketing: false };
  b.window.lazoyaApplyCookieConsent(current);
  b.window.lazoyaApplyCookieConsent(current);
  const configs = b.window.dataLayer.map(args => Array.from(args)).filter(args => args[0] === "config");
  assert.equal(configs.filter(args => args[1] === analytics).length, current.analytics ? 1 : 0);
  assert.equal(configs.filter(args => args[1] === ads).length, current.marketing ? 1 : 0);
  assert.equal(b.scripts.length, current.analytics || current.marketing ? 1 : 0);
}
const modal = browser({ analytics: true, marketing: true });
modal.click(destinations.planity, true);
assert.equal(modal.events("conversion").length, 0);
modal.window.lazoyaTrackConversionForHref(destinations.planity, { label: "booking_notice_continue" });
assert.equal(modal.events("conversion").length, 1);
assert.equal(modal.events("booking_intent").length, 1);
assert.equal(modal.events("conversion")[0][2].send_to, "AW-18308603892/5tRVCPLrls4cEPS_nJpE");
modal.window.lazoyaApplyCookieConsent({ analytics: false, marketing: false });
modal.click(destinations.planity);
assert.equal(modal.events("conversion").length, 1);
assert.equal(modal.events("booking_intent").length, 1);
let navigations = 0;
modal.window.lazoyaTrackConversionForHref(destinations.phone, { callback: () => navigations++ });
assert.equal(navigations, 1);
assert.equal(modal.events("purchase").length, 0);
console.log("Tracking checks passed: four intent channels, five consent states, single loader/config, modal deduplication, revocation and existing Ads IDs.");
