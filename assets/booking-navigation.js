(function () {
  const button = document.querySelector(".menu-button");
  const header = document.querySelector(".topbar");
  if (!button || !header) return;
  const close = () => {
    button.setAttribute("aria-expanded", "false");
    header.classList.remove("menu-active");
    document.body.classList.remove("menu-open");
  };
  button.addEventListener("click", () => {
    const open = button.getAttribute("aria-expanded") !== "true";
    button.setAttribute("aria-expanded", String(open));
    header.classList.toggle("menu-active", open);
    document.body.classList.toggle("menu-open", open);
  });
  document.addEventListener("keydown", event => { if (event.key === "Escape") close(); });
  document.addEventListener("click", event => { if (!header.contains(event.target)) close(); });
}());
