const navToggle = document.querySelector(".nav-toggle");
const navLinks = document.querySelector(".nav-links");
const topButton = document.querySelector("[data-to-top]");

if (navToggle && navLinks) {
  navToggle.addEventListener("click", () => {
    const expanded = navToggle.getAttribute("aria-expanded") === "true";
    navToggle.setAttribute("aria-expanded", String(!expanded));
    document.body.classList.toggle("nav-open", !expanded);
  });
}

if (topButton) {
  window.addEventListener("scroll", () => {
    topButton.classList.toggle("is-visible", window.scrollY > 520);
  });

  topButton.addEventListener("click", () => {
    window.scrollTo({ top: 0, behavior: "smooth" });
  });
}
