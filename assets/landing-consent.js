(function () {
  // The main app already provides its own consent controls.
  if (document.querySelector("#cookieBanner")) return;
  const key = "lazoya.cookies";
  function savedConsent() {
    try { return JSON.parse(localStorage.getItem(key) || "null"); }
    catch { return null; }
  }

  const banner = document.createElement("section");
  banner.className = "landing-consent";
  banner.setAttribute("aria-label", "Préférences cookies");
  banner.innerHTML = `<div><strong>Préférences cookies</strong><p>Les statistiques et la mesure publicitaire restent désactivées sans votre accord. Vous pouvez modifier votre choix à tout moment.</p></div>
    <div class="landing-consent-actions"><button type="button" data-consent-settings>Personnaliser</button><button type="button" data-consent-reject>Refuser les options</button><button type="button" data-consent-accept>Tout accepter</button></div>`;
  banner.hidden = Boolean(savedConsent());
  const dialog = document.createElement("dialog");
  dialog.className = "landing-consent-dialog";
  dialog.setAttribute("aria-labelledby", "landingConsentTitle");
  dialog.innerHTML = `<h2 id="landingConsentTitle">Options cookies</h2>
    <p>Les préférences nécessaires au fonctionnement du site restent actives.</p>
    <label><input type="checkbox" data-consent-analytics> Statistiques Google Analytics</label>
    <label><input type="checkbox" data-consent-marketing> Mesure des conversions Google Ads</label>
    <p><a href="/confidentialite/">Politique de confidentialité</a></p>
    <div class="landing-consent-actions"><button type="button" data-consent-close>Fermer</button><button type="button" data-consent-save>Enregistrer mes choix</button></div>`;
  document.body.append(banner, dialog);

  function save(analytics, marketing) {
    const consent = { necessary: true, analytics, marketing };
    try { localStorage.setItem(key, JSON.stringify(consent)); } catch { /* Consent still applies to this page. */ }
    window.lazoyaApplyCookieConsent?.(consent);
    banner.hidden = true;
    dialog.close();
  }
  function open() {
    const consent = window.lazoyaCookieConsent || savedConsent();
    dialog.querySelector("[data-consent-analytics]").checked = Boolean(consent?.analytics);
    dialog.querySelector("[data-consent-marketing]").checked = Boolean(consent?.marketing);
    dialog.showModal();
  }
  banner.querySelector("[data-consent-settings]").addEventListener("click", open);
  banner.querySelector("[data-consent-reject]").addEventListener("click", () => save(false, false));
  banner.querySelector("[data-consent-accept]").addEventListener("click", () => save(true, true));
  dialog.querySelector("[data-consent-close]").addEventListener("click", () => dialog.close());
  dialog.querySelector("[data-consent-save]").addEventListener("click", () => save(
    dialog.querySelector("[data-consent-analytics]").checked,
    dialog.querySelector("[data-consent-marketing]").checked
  ));
  document.querySelectorAll("[data-open-cookies]").forEach(button => button.addEventListener("click", open));
}());
