(function () {
  const planityUrlPart = "planity.com/lazoya-17000-la-rochelle";
  const whatsappUrlPart = "wa.me/33956673009";
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

  function trackConversion(conversion) {
    if (typeof window.gtag !== "function") return;
    window.gtag("event", "conversion", conversion);
  }

  document.addEventListener("click", (event) => {
    const link = event.target.closest && event.target.closest("a[href]");
    if (!link) return;

    const href = link.getAttribute("href") || "";
    if (href.includes(planityUrlPart)) {
      trackConversion(planityConversion);
      return;
    }

    if (href === phoneUrl) {
      trackConversion(phoneConversion);
      return;
    }

    if (href.includes(whatsappUrlPart)) {
      trackConversion(whatsappConversion);
    }
  });
}());
