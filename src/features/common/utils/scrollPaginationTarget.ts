/**
 * Scroll vers le haut de la page applicative (titre du shell).
 *
 * Le défilement vit dans `.content` (AppShell), pas dans `window`.
 * On remonte toujours tout en haut (barre de titre), pas au seul haut d’un panneau.
 * Double `requestAnimationFrame` : après le re-rendu React (changement de page),
 * pour éviter que l’ancrage de défilement du navigateur recale le pied de tableau.
 */

/**
 * Fait défiler le shell (`.content`) jusqu’à l’origine, après peinture.
 */
export function scrollPaginationTarget() {
  const apply = () => {
    const content = document.querySelector(".content");
    if (content instanceof HTMLElement) {
      content.scrollTo({ top: 0, behavior: "smooth" });
    }
    const topbar = document.querySelector(".topbar");
    if (topbar instanceof HTMLElement) {
      topbar.scrollIntoView({ behavior: "smooth", block: "start" });
    }
    window.scrollTo({ top: 0, behavior: "smooth" });
  };
  requestAnimationFrame(() => {
    requestAnimationFrame(apply);
  });
}
