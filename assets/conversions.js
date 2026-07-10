(function () {
  const planityUrlPart = "planity.com/lazoya-17000-la-rochelle";
  const planityConversion = {
    send_to: "AW-18308603892/ROS3CNr5ic4cEPS_nJpE",
    value: 1.0,
    currency: "EUR"
  };

  function trackPlanityClick() {
    if (typeof window.gtag !== "function") return;
    window.gtag("event", "conversion", planityConversion);
  }

  document.addEventListener("click", (event) => {
    const link = event.target.closest && event.target.closest("a[href]");
    if (!link) return;

    const href = link.getAttribute("href") || "";
    if (!href.includes(planityUrlPart)) return;

    trackPlanityClick();
  });
}());
