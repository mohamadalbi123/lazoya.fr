(function () {
  const consentKey = "lazoya.cookies";
  const analyticsId = "G-3E9C5ZGQRW";
  const adsId = "AW-18308603892";
  let scriptLoaded = false;
  let configuredAnalytics = false;
  let configuredAds = false;

  window.dataLayer = window.dataLayer || [];
  window.gtag = window.gtag || function gtag() {
    window.dataLayer.push(arguments);
  };
  window.gtag("consent", "default", {
    ad_storage: "denied",
    ad_user_data: "denied",
    ad_personalization: "denied",
    analytics_storage: "denied"
  });

  function readConsent() {
    try {
      return JSON.parse(window.localStorage.getItem(consentKey) || "null");
    } catch {
      return null;
    }
  }

  function loadGoogleTag(callback) {
    if (scriptLoaded) {
      if (typeof callback === "function") callback();
      return;
    }

    scriptLoaded = true;
    const script = document.createElement("script");
    script.async = true;
    script.src = `https://www.googletagmanager.com/gtag/js?id=${adsId}`;
    script.onload = () => {
      window.gtag("js", new Date());
      if (typeof callback === "function") callback();
    };
    document.head.appendChild(script);
  }

  function applyConsent(consent) {
    const analyticsAllowed = Boolean(consent && consent.analytics);
    const marketingAllowed = Boolean(consent && consent.marketing);
    window.lazoyaCookieConsent = {
      necessary: true,
      analytics: analyticsAllowed,
      marketing: marketingAllowed
    };
    const consentUpdate = {
      ad_storage: marketingAllowed ? "granted" : "denied",
      ad_user_data: marketingAllowed ? "granted" : "denied",
      ad_personalization: marketingAllowed ? "granted" : "denied",
      analytics_storage: analyticsAllowed ? "granted" : "denied"
    };

    window["ga-disable-" + analyticsId] = !analyticsAllowed;
    window["ga-disable-" + adsId] = !marketingAllowed;
    window.gtag("consent", "update", consentUpdate);

    if (!analyticsAllowed && !marketingAllowed) return;

    loadGoogleTag(() => {
      if (analyticsAllowed && !configuredAnalytics) {
        window.gtag("config", analyticsId, { anonymize_ip: true });
        configuredAnalytics = true;
      }

      if (marketingAllowed && !configuredAds) {
        window.gtag("config", adsId);
        configuredAds = true;
      }
    });
  }

  window.lazoyaApplyCookieConsent = applyConsent;
  applyConsent(readConsent());
}());
