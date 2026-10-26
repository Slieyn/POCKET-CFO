const CONFETTI_COLORS = ["#4c63f0", "#33d6b0", "#f7c25c", "#8ff0d0", "#ffffff"];

/**
 * A tiny, dependency-free celebration burst. It only runs in the browser and
 * quietly does nothing when the visitor prefers reduced motion.
 */
export function celebrate() {
  if (typeof window === "undefined") return;
  if (window.matchMedia("(prefers-reduced-motion: reduce)").matches) return;

  const previous = document.querySelector(".confetti-layer");
  previous?.remove();

  const layer = document.createElement("div");
  layer.className = "confetti-layer";
  layer.setAttribute("aria-hidden", "true");

  const originX = window.innerWidth / 2;
  const originY = Math.min(window.innerHeight * 0.34, 280);
  const pieces = 30;

  for (let index = 0; index < pieces; index += 1) {
    const piece = document.createElement("span");
    const angle = (Math.PI * 2 * index) / pieces + Math.random() * 0.5;
    const distance = 90 + Math.random() * 190;

    piece.className = "confetti-piece";
    piece.style.left = `${originX}px`;
    piece.style.top = `${originY}px`;
    piece.style.setProperty("--confetti-x", `${Math.cos(angle) * distance}px`);
    piece.style.setProperty("--confetti-y", `${Math.sin(angle) * distance - 70}px`);
    piece.style.setProperty("--confetti-r", `${Math.random() * 760 - 380}deg`);
    piece.style.setProperty("--confetti-delay", `${Math.round(Math.random() * 130)}ms`);
    piece.style.setProperty("--confetti-color", CONFETTI_COLORS[index % CONFETTI_COLORS.length]);
    layer.appendChild(piece);
  }

  document.body.appendChild(layer);
  window.setTimeout(() => layer.remove(), 1900);
}
