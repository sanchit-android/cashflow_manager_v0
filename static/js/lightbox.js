// Image popup for public pages. Any <a data-lightbox href="full.png"> with an <img> inside
// opens in a modal instead of navigating. Closes on ×, Esc or a click outside the image;
// ← / → step through the other data-lightbox links on the page.
(() => {
  const links = [...document.querySelectorAll("a[data-lightbox]")];
  if (!links.length || !window.HTMLDialogElement) return;

  const dlg = document.createElement("dialog");
  dlg.className = "lightbox";
  dlg.setAttribute("aria-label", "Image preview");
  dlg.innerHTML = `<div class="lb-inner">
      <button type="button" class="lb-close" aria-label="Close">×</button>
      <img alt="">
      <p class="lb-caption"></p>
      ${links.length > 1 ? `<button type="button" class="lb-nav lb-prev" aria-label="Previous">‹</button>
      <button type="button" class="lb-nav lb-next" aria-label="Next">›</button>` : ""}
    </div>`;
  document.body.appendChild(dlg);
  const img = dlg.querySelector("img"), cap = dlg.querySelector(".lb-caption");
  let at = 0;

  const show = (i) => {
    at = (i + links.length) % links.length;
    const a = links[at], thumb = a.querySelector("img");
    img.src = (thumb && thumb.currentSrc) || a.href;
    img.alt = thumb ? thumb.alt : "";
    const title = a.closest("figure")?.querySelector("figcaption strong");
    cap.textContent = title ? title.textContent : "";
  };
  const close = () => dlg.close();

  links.forEach((a, i) => a.addEventListener("click", (e) => {
    if (e.ctrlKey || e.metaKey || e.shiftKey || e.button !== 0) return; // keep "open in new tab"
    e.preventDefault();
    show(i);
    document.documentElement.classList.add("lb-open");
    dlg.showModal();
  }));
  dlg.addEventListener("close", () => document.documentElement.classList.remove("lb-open"));
  dlg.addEventListener("click", (e) => {
    if (e.target.closest(".lb-close")) return close();
    if (e.target.closest(".lb-prev")) return show(at - 1);
    if (e.target.closest(".lb-next")) return show(at + 1);
    if (!e.target.closest("img, .lb-caption")) close(); // click outside the picture
  });
  dlg.addEventListener("keydown", (e) => {
    if (links.length < 2) return;
    if (e.key === "ArrowLeft") show(at - 1);
    if (e.key === "ArrowRight") show(at + 1);
  });
})();
