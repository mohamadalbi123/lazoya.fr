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
  const context = vm.createContext({ window, Date, Boolean, JSON, URL,
    document: { head: { appendChild: script => scripts.push(script) }, createElement: () => ({}), addEventListener: (name, fn) => { if (name === "click") handlers.push(fn); } },
    console
  });
  window.localStorage = { getItem: () => consent ? JSON.stringify(consent) : null };
  for (const file of ["tracking-consent.js", "conversions.js"]) {
    vm.runInContext(fs.readFileSync(path.join(root, "assets", file), "utf8"), context);
  }
  const events = name => window.dataLayer.map(args => Array.from(args)).filter(args => args[0] === "event" && args[1] === name);
  function click(href, prevented = false, booking = true, target = "_blank", modifiers = {}) {
    const link = { target, dataset: {}, hasAttribute: name => name === "data-planity-booking" && booking,
      getAttribute: name => name === "href" ? href : name === "target" ? target : null };
    const event = { ...modifiers, defaultPrevented: prevented, target: { closest: () => link }, preventDefault() { this.defaultPrevented = true; } };
    handlers.forEach(fn => fn(event));
    return event;
  }
  return { window, scripts, events, click, timers, context, handlers };
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
modal.window.lazoyaTrackConversionForHref(destinations.planity, { label: "booking_notice_continue", planityBooking: true });
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
console.log("Original tracking checks passed: four intent channels, five consent states, single loader/config, modal deduplication, revocation and existing Ads IDs.");

// Review/catalogue links retain existing GA4 events but never send an Ads conversion.
for (const consent of [null, { analytics: true, marketing: false }, { analytics: false, marketing: true }, { analytics: true, marketing: true }]) {
  const b = browser(consent);
  b.click(destinations.planity, false, false);
  b.window.lazoyaTrackConversionForHref(destinations.planity, { label: "booking_notice_continue", planityBooking: false });
  b.window.lazoyaTrackConversionForHref(destinations.planity); // No implicit opt-in through helper.
  b.click("/reservation/");
  b.click("https://example.com/");
  b.click("https://example.com/?next=" + destinations.planity);
  b.click(destinations.planity + "/reviews");
  assert.equal(b.events("conversion").length, 0);
  assert.equal(b.events("booking_intent").length, consent?.analytics ? 5 : 0);
}
const direct = browser({ analytics: true, marketing: true });
assert.equal(direct.events("conversion").length, 0); // Loading a page is not a conversion.
assert.equal(direct.click(destinations.planity).defaultPrevented, false);
assert.equal(direct.click(destinations.planity, false, true, "", { ctrlKey: true }).defaultPrevented, false);
assert.equal(direct.click(destinations.planity, false, true, "").defaultPrevented, true);
const bookingEvents = direct.events("conversion");
assert.equal(bookingEvents.length, 3);
for (const [, , payload] of bookingEvents) {
  assert.equal(payload.send_to, "AW-18308603892/5tRVCPLrls4cEPS_nJpE");
  assert.equal(payload.value, 1);
  assert.equal(payload.currency, "EUR");
}
bookingEvents[2][2].event_callback();
direct.timers.forEach(fn => fn());
assert.equal(direct.window.location.href, destinations.planity);

// Execute the actual homepage notice, before the delegated conversion handler.
const home = browser({ analytics: true, marketing: true });
const controls = Object.fromEntries(["#bookingNoticeModal", "#closeBookingNotice", "#continueBooking"].map(id =>
  [id, { hidden: true, listeners: {}, addEventListener(name, fn) { this.listeners[name] = fn; } }]));
home.context.document.querySelector = id => controls[id];
const app = fs.readFileSync(path.join(root, "app.js"), "utf8");
const notice = app.slice(app.indexOf("function wireBookingNotice()"), app.indexOf("function wireSuccessModal()"));
vm.runInContext(notice + "\nwireBookingNotice();", home.context);
home.handlers.unshift(home.handlers.pop());
let opened = 0;
home.window.open = () => opened++;
home.click(destinations.planity, false, false);
controls["#continueBooking"].listeners.click();
assert.equal(home.events("conversion").length, 0);
assert.equal(opened, 1);
home.click(destinations.planity, false, true);
assert.equal(home.events("conversion").length, 0);
controls["#continueBooking"].listeners.click();
assert.equal(home.events("conversion").length, 1);
assert.equal(opened, 2);
assert.equal(home.events("conversion")[0][2].event_label, "booking_notice_continue");
home.click("/reservation/");
controls["#continueBooking"].listeners.click();
assert.equal(home.events("conversion").length, 1);
assert.equal(opened, 3);
console.log("Booking-only Ads checks passed: explicit opt-in, exact destination, review/catalogue exclusions, unchanged GA4, navigation and real homepage notice.");

// Keep the HTML booking opt-ins and non-booking exclusions covered by regression checks.
let markedLinks = 0, reviewLinks = 0;
for (const file of fs.readdirSync(root, { recursive: true }).filter(file => /(^|\/)index\.html$/.test(file) && !/(^|\/)(node_modules|\.git|public)\//.test(file))) {
  const html = fs.readFileSync(path.join(root, file), "utf8");
  for (const [anchor] of html.matchAll(/<a\b[^>]*href="https:\/\/www\.planity\.com\/lazoya-17000-la-rochelle"[^>]*>[\s\S]*?<\/a>/g)) {
    const marked = /\bdata-planity-booking\b/.test(anchor);
    const text = anchor.replace(/<[^>]+>/g, " ").trim();
    if (/Réserver|Choisir sur Planity|Voir les créneaux|Planity Lazoya/.test(text)) assert.ok(marked, `${file}: missing booking marker`);
    if (/Voir sur Planity|Voir le catalogue Planity/.test(text) || (text === "Planity" && !/class="button primary"/.test(anchor))) {
      assert.equal(marked, false, `${file}: browsing link incorrectly marked`);
      if (text === "Voir sur Planity") reviewLinks++;
    }
    if (marked) markedLinks++;
  }
}
assert.equal(reviewLinks, 13);
assert.ok(markedLinks > 0);
assert.ok(app.includes('data-planity-booking href="https://www.planity.com/lazoya-17000-la-rochelle"'));
console.log(`HTML tracking checks passed: ${markedLinks} explicit booking links; ${reviewLinks} review links excluded; dynamic booking template marked.`);
