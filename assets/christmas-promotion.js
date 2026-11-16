(function () {
  "use strict";
  if (window.lazoyaChristmasPromotion) return;
  window.lazoyaChristmasPromotion = true;

  const dismissalKey = "lazoya.christmas2026.dismissedAt";
  const sessionKey = "lazoya.christmas2026.seenAt";
  const bookingKey = "lazoya.christmas2026.bookingStarted";
  const week = 7 * 24 * 60 * 60 * 1000;
  const expiresAt = Date.parse("2026-12-31T23:00:00Z"); // 1 January, midnight in Paris.
  const parisDate = new Intl.DateTimeFormat("en-CA", {
    timeZone: "Europe/Paris", year: "numeric", month: "2-digit", day: "2-digit"
  });
  function inSeason() {
    const parts = parisDate.formatToParts(new Date());
    const value = type => parts.find(part => part.type === type).value;
    const day = `${value("year")}-${value("month")}-${value("day")}`;
    return day >= "2026-11-15" && day <= "2026-12-31";
  }
  // Show the dated Sunday exception beside the usual hours, independently of popup dismissal.
  const sundayNotice = document.querySelector("[data-christmas-sunday]");
  if (sundayNotice) {
    let noticeTimer;
    const updateNotice = () => {
      sundayNotice.hidden = !inSeason();
      if (!sundayNotice.hidden) noticeTimer = window.setTimeout(updateNotice, Math.min(expiresAt - Date.now(), 2147483647));
    };
    updateNotice();
    window.addEventListener("pagehide", () => window.clearTimeout(noticeTimer));
    window.addEventListener("pageshow", event => { if (event.persisted) updateNotice(); });
  }
  function read(storage, key) {
    try { return window[storage].getItem(key); } catch { return null; }
  }
  function write(storage, key, value) {
    try { window[storage].setItem(key, String(value)); } catch { /* Optional storage may be unavailable. */ }
  }
  function recent(value) {
    const timestamp = Number(value);
    return Number.isFinite(timestamp) && timestamp > 0 && timestamp <= Date.now() && Date.now() - timestamp < week;
  }
  function bookingPage() {
    return /^\/(reservation|diagnostique|defi-ongles)(\/|$)/.test(window.location.pathname) ||
      /^(booking|reservation)$/.test(document.body.dataset.view || "") ||
      /^#(booking|reservation)$/.test(window.location.hash);
  }
  if (!inSeason() || bookingPage() || recent(read("localStorage", dismissalKey)) ||
      recent(read("sessionStorage", sessionKey)) || read("sessionStorage", bookingKey)) return;

  // Reuse an existing, explicitly marked salon booking link; never infer a new destination.
  const source = Array.from(document.querySelectorAll("a[data-planity-booking][href]")).find(link => {
    try {
      const url = new URL(link.getAttribute("href"), window.location.href);
      return url.protocol === "https:" && ["www.planity.com", "planity.com"].includes(url.hostname) &&
        /^\/lazoya-17000-la-rochelle\/?$/.test(url.pathname);
    } catch { return false; }
  });
  if (!source) return;

  const mobile = window.matchMedia("(max-width: 640px)");
  const readyAt = Date.now() + 3000;
  let dialog = null;
  let previousFocus = null;
  let shown = false;
  let stopped = false;
  let timer = null;
  let expiryTimer = null;
  const observer = new MutationObserver(schedule);

  function blocked() {
    const active = document.activeElement;
    return document.hidden || bookingPage() ||
      Boolean(active?.closest("input, textarea, select, [contenteditable='true']")) ||
      Array.from(document.querySelectorAll("#cookieBanner, .landing-consent, .modal-backdrop, dialog[open], .menu-button[aria-expanded='true']"))
        .some(element => element !== dialog && !element.hidden && element.getClientRects().length > 0);
  }
  function unlock() { document.documentElement.classList.remove("lazoya-promo-open"); }
  function stop(remember = false, restoreFocus = true) {
    if (stopped) return;
    stopped = true;
    if (remember) write("localStorage", dismissalKey, Date.now());
    window.clearTimeout(timer);
    window.clearTimeout(expiryTimer);
    observer.disconnect();
    document.removeEventListener("click", onClick, true);
    document.removeEventListener("keydown", onKeydown);
    document.removeEventListener("focusout", schedule);
    document.removeEventListener("visibilitychange", onVisibility);
    window.removeEventListener("storage", onStorage);
    window.removeEventListener("pagehide", onPageHide);
    window.removeEventListener("popstate", onNavigation);
    window.removeEventListener("hashchange", onNavigation);
    mobile.removeEventListener("change", onSize);
    if (dialog) {
      dialog.removeEventListener("cancel", onCancel);
      dialog.querySelector(".christmas-promo__close").removeEventListener("click", onClose);
      if (dialog.open) dialog.close();
      dialog.remove();
    }
    unlock();
    if (restoreFocus && previousFocus?.isConnected) previousFocus.focus({ preventScroll: true });
  }
  function onClose() { stop(true); }
  function onCancel(event) { event.preventDefault(); stop(true); }
  function onKeydown(event) {
    if (dialog?.open && event.key === "Escape") { event.preventDefault(); stop(true); }
  }
  function onPageHide() { stop(false, false); }
  function onStorage(event) {
    if (event.key === dismissalKey && recent(event.newValue)) stop(false);
  }
  function onNavigation() {
    if (bookingPage()) stop(false, false);
    else schedule();
  }
  function onVisibility() {
    if (!inSeason()) stop(false);
    else schedule();
  }
  function onClick(event) {
    const link = event.target.closest?.("a[href]");
    const href = link?.getAttribute("href") || "";
    const booking = link && (link.hasAttribute("data-planity-booking") || link.dataset.route === "booking" ||
      /^\/reservation\/?(?:[?#]|$)/.test(href) || /^(tel:|https:\/\/wa\.me\/)/.test(href));
    if (booking) {
      write("sessionStorage", bookingKey, "true");
      stop(Boolean(dialog?.open), false);
      return; // Leave navigation and the existing conversion handler in charge.
    }
    if (!dialog?.open) return;
    const outside = !dialog.contains(event.target) || (event.target === dialog && (() => {
      const rect = dialog.getBoundingClientRect();
      return event.clientX < rect.left || event.clientX > rect.right || event.clientY < rect.top || event.clientY > rect.bottom;
    })());
    if (outside) stop(true);
  }
  function onSize() {
    if (!dialog?.open) return;
    dialog.close();
    unlock();
    openDialog();
  }
  function openDialog() {
    if (mobile.matches) dialog.show();
    else {
      document.documentElement.classList.add("lazoya-promo-open");
      dialog.showModal();
    }
  }
  function show() {
    timer = null;
    if (stopped || shown) return;
    if (!inSeason()) { stop(); return; }
    if (bookingPage()) { stop(false, false); return; }
    if (recent(read("localStorage", dismissalKey))) { stop(); return; }
    if (blocked()) return; // Consent, forms and booking dialogs take precedence.
    shown = true;
    write("sessionStorage", sessionKey, Date.now());
    previousFocus = document.activeElement;
    dialog = document.createElement("dialog");
    dialog.className = "christmas-promo";
    dialog.setAttribute("aria-labelledby", "christmasPromoTitle");
    dialog.setAttribute("aria-describedby", "christmasPromoDescription");
    dialog.innerHTML = `<button class="christmas-promo__close" type="button" aria-label="Fermer l’offre de fin d’année" autofocus><span aria-hidden="true">×</span></button>
      <img class="christmas-promo__logo" src="/assets/lazoya-logo.png" alt="Lazoya" width="56" height="56" decoding="async">
      <p class="christmas-promo__eyebrow">OFFRE EXCLUSIVE DE FIN D'ANNÉE</p>
      <h2 id="christmasPromoTitle">-10 % SUR LA COIFFURE &amp; LA COLORATION</h2>
      <p id="christmasPromoDescription">Du 15 novembre au 31 décembre 2026, profitez de -10 % sur nos prestations de coiffure et coloration.</p>
      <p class="christmas-promo__sunday">✨ Le dimanche : coiffure et coloration uniquement, sur rendez-vous !</p>
      <a class="button primary christmas-promo__booking" data-planity-booking data-booking-notice-seen="true" target="_blank" rel="noreferrer">RÉSERVER MON RENDEZ-VOUS</a>
      <p class="christmas-promo__end">Offre valable jusqu'au 31 décembre 2026.</p>`;
    dialog.querySelector(".christmas-promo__booking").setAttribute("href", source.getAttribute("href"));
    dialog.querySelector(".christmas-promo__close").addEventListener("click", onClose);
    dialog.addEventListener("cancel", onCancel);
    document.body.append(dialog);
    openDialog();
  }
  function schedule() {
    if (stopped) return;
    if (dialog?.open && blocked()) { stop(false, false); return; }
    if (shown || timer !== null || blocked()) return;
    timer = window.setTimeout(show, Math.max(300, readyAt - Date.now()));
  }
  function expire() {
    if (!inSeason()) { stop(false); return; }
    expiryTimer = window.setTimeout(expire, Math.min(expiresAt - Date.now(), 2147483647));
  }
  document.addEventListener("click", onClick, true);
  document.addEventListener("keydown", onKeydown);
  document.addEventListener("focusout", schedule);
  document.addEventListener("visibilitychange", onVisibility);
  window.addEventListener("storage", onStorage);
  window.addEventListener("pagehide", onPageHide);
  window.addEventListener("popstate", onNavigation);
  window.addEventListener("hashchange", onNavigation);
  mobile.addEventListener("change", onSize);
  observer.observe(document.body, { subtree: true, attributes: true, attributeFilter: ["hidden", "open", "class", "data-view", "aria-expanded"] });
  expire();
  schedule();
}());
