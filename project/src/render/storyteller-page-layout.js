(() => {
  const minimumScale = 0.62;
  const fitTolerance = 1;

  function fits(page) {
    const order = page.querySelector(".storyteller-order");
    if (!(order instanceof HTMLElement)) return false;
    const pageRect = page.getBoundingClientRect();
    const orderRect = order.getBoundingClientRect();
    return (
      orderRect.left >= pageRect.left - fitTolerance &&
      orderRect.right <= pageRect.right + fitTolerance &&
      orderRect.bottom <= pageRect.bottom - fitTolerance
    );
  }

  function setScale(page, scale) {
    page.style.setProperty("--storyteller-scale", scale.toFixed(4));
  }

  function fitPage(page) {
    setScale(page, 1);
    if (fits(page)) {
      page.dataset.storytellerFitState = "ready";
      return;
    }

    setScale(page, minimumScale);
    if (!fits(page)) {
      page.dataset.storytellerFitState = "blocked";
      return;
    }

    let low = minimumScale;
    let high = 1;
    for (let index = 0; index < 14; index += 1) {
      const middle = (low + high) / 2;
      setScale(page, middle);
      if (fits(page)) low = middle;
      else high = middle;
    }
    setScale(page, low);
    page.dataset.storytellerFitState = "ready";
  }

  function fitPages() {
    document
      .querySelectorAll(".memo-page--storyteller")
      .forEach((page) => fitPage(page));
  }

  document.addEventListener("botc:fit-storyteller-pages", fitPages);
  window.addEventListener("load", fitPages, { once: true });
})();
