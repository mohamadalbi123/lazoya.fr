(function () {
  const planityUrlPart = "planity.com/lazoya-17000-la-rochelle";
  const whatsappUrlPart = "wa.me/33956673009";
  const directionsUrlPart = "google.com/maps";
  const phoneUrl = "tel:+33956673009";
  const planityConversion = {
    send_to: "AW-18308603892/ROS3CNr5ic4cEPS_nJpE",
    value: 1.0,
    currency: "EUR"
  };
  const phoneConversion = {
    send_to: "AW-18308603892/LzxDCNSIis4cEPS_nJpE",
    value: 1.0,
    currency: "EUR"
  };
  const whatsappConversion = {
    send_to: "AW-18308603892/Nh_WCMewjc4cEPS_nJpE",
    value: 1.0,
    currency: "EUR"
  };
  const directionsConversion = {
    send_to: "AW-18308603892/w7uqCMi6jc4cEPS_nJpE",
    value: 1.0,
    currency: "EUR"
  };

  function conversionForHref(href) {
    if (href.includes(planityUrlPart)) {
      return { name: "planity", conversion: planityConversion };
    }

    if (href === phoneUrl) {
      return { name: "phone", conversion: phoneConversion };
    }

    if (href.includes(whatsappUrlPart)) {
      return { name: "whatsapp", conversion: whatsappConversion };
    }

    if (href.includes(directionsUrlPart)) {
      return { name: "directions", conversion: directionsConversion };
    }

    return null;
  }

  function once(callback) {
    let called = false;
    return function runOnce() {
      if (called) return;
      called = true;
      if (typeof callback === "function") callback();
    };
  }

  function trackConversion(match, options = {}) {
    const done = once(options.callback);

    if (typeof window.gtag !== "function") {
      done();
      return false;
    }

    const payload = {
      ...match.conversion,
      event_category: "Lazoya reservation",
      event_label: options.label || match.name,
      event_callback: done,
      event_timeout: 1200
    };

    window.gtag("event", "conversion", payload);
    window.setTimeout(done, 1300);
    return true;
  }

  function trackHref(href, options = {}) {
    const match = conversionForHref(href || "");
    if (!match) {
      if (typeof options.callback === "function") options.callback();
      return false;
    }

    return trackConversion(match, options);
  }

  window.lazoyaTrackConversionForHref = trackHref;

  document.addEventListener("click", (event) => {
    if (event.defaultPrevented) return;

    const link = event.target.closest && event.target.closest("a[href]");
    if (!link) return;

    const href = link.getAttribute("href") || "";
    const match = conversionForHref(href);
    if (!match) return;

    if (link.target === "_blank" || event.metaKey || event.ctrlKey || event.shiftKey || event.altKey) {
      trackConversion(match);
      return;
    }

    event.preventDefault();
    trackConversion(match, {
      callback: () => {
        window.location.href = href;
      }
    });
  });
}());
