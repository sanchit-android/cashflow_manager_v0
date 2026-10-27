// Public site header navigation: mobile menu sync, dropdown exclusivity, and outside-click / Escape dismissal.
const h = document.querySelector("header.site-top");
if (h) {
  const m = h.querySelector("details.menu");
  const dds = h.querySelectorAll("details.dd");
  const mq = matchMedia("(min-width: 861px)");
  const sync = () => { m.open = mq.matches; };
  const closeAll = () => {
    dds.forEach((d) => { d.open = false; });
    if (!mq.matches) m.open = false;
  };
  dds.forEach((d) => {
    d.addEventListener("toggle", () => {
      if (d.open) dds.forEach((other) => { if (other !== d) other.open = false; });
    });
  });
  document.addEventListener("click", (e) => {
    if (!h.contains(e.target) || e.target.closest("a")) {
      closeAll();
      return;
    }
    dds.forEach((d) => {
      if (d.open && !d.contains(e.target)) d.open = false;
    });
  });
  document.addEventListener("keydown", (e) => {
    if (e.key === "Escape") closeAll();
  });
  sync();
  mq.addEventListener("change", sync);
}

