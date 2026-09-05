(() => {
  const pageSelector = ".memo-page[data-page-role-count]";
  const ownStyles = new WeakMap();
  const observedPages = new WeakSet();
  const tolerance = 0.5;

  function fits(page) {
    const sections = page.querySelector(".page-sections");
    const footer = page.querySelector(".page-footer");
    if (!sections || !footer) return false;
    const pageRect = page.getBoundingClientRect();
    const footerRect = footer.getBoundingClientRect();
    const style = getComputedStyle(page);
    const bottom = pageRect.bottom - Number.parseFloat(style.paddingBottom);
    if (footerRect.bottom > bottom + tolerance || page.scrollHeight > page.clientHeight + tolerance ||
        page.scrollWidth > page.clientWidth + tolerance) return false;

    const content = [sections, ...sections.querySelectorAll(".role-icon img, .role-copy, .section-heading")];
    return content.every((element) => {
      const rect = element.getBoundingClientRect();
      return rect.left >= pageRect.left - tolerance && rect.right <= pageRect.right + tolerance &&
        rect.top >= pageRect.top - tolerance && rect.bottom <= footerRect.top - 4 &&
        element.scrollWidth <= element.clientWidth + tolerance;
    });
  }

  function fitRolePages() {
    for (const page of document.querySelectorAll(pageSelector)) {
      observePage(page);
      const probe = page.querySelector(".role-size-probe");
      if (!probe) continue;
      const dimensions = getComputedStyle(probe);
      const preferredSize = Number.parseFloat(dimensions.width);
      const minimumSize = Number.parseFloat(dimensions.height);
      page.style.removeProperty("--role-icon-scale");
      if (!Number.isFinite(preferredSize) || !Number.isFinite(minimumSize) ||
          minimumSize <= 0 || preferredSize < minimumSize) {
        page.dataset.roleFitState = "blocked";
        ownStyles.set(page, page.getAttribute("style"));
        continue;
      }

      // Уменьшаем только иконки и занимаемые ими места, сохраняя размер шрифта.
      const applyScale = (scale) => page.style.setProperty("--role-icon-scale", String(scale));
      if (!fits(page)) {
        let low = minimumSize / preferredSize;
        let high = 1;
        applyScale(low);
        if (fits(page)) {
          // Ищем наибольший размер, при котором все карточки ещё помещаются.
          for (let iteration = 0; iteration < 20; iteration += 1) {
            const middle = (low + high) / 2;
            applyScale(middle);
            if (fits(page)) low = middle;
            else high = middle;
          }
          applyScale(low);
        }
      }
      page.dataset.roleFitState = fits(page) ? "ready" : "blocked";
      ownStyles.set(page, page.getAttribute("style"));
    }
  }

  let scheduled = false;
  const scheduleFit = () => {
    if (scheduled) return;
    scheduled = true;
    requestAnimationFrame(() => {
      scheduled = false;
      fitRolePages();
    });
  };
  const contentObserver = new MutationObserver((records) => {
    const changed = records.some((record) => {
      // Не запускаем расчёт повторно из-за собственного изменения масштаба.
      return record.type !== "attributes" || record.attributeName !== "style" ||
        !record.target.matches(pageSelector) || record.target.getAttribute("style") !== ownStyles.get(record.target);
    });
    if (changed) scheduleFit();
  });
  const resizeObserver = new ResizeObserver(scheduleFit);
  function observePage(page) {
    if (observedPages.has(page)) return;
    observedPages.add(page);
    contentObserver.observe(page, { subtree: true, childList: true, characterData: true,
      attributes: true, attributeFilter: ["style", "class", "src"] });
    resizeObserver.observe(page);
    for (const element of page.querySelectorAll(".page-header, .page-sections, .page-footer")) resizeObserver.observe(element);
    page.addEventListener("load", scheduleFit, true);
  }

  document.addEventListener("botc:fit-role-pages", fitRolePages);
  window.addEventListener("beforeprint", fitRolePages);
  window.addEventListener("resize", scheduleFit);
  document.fonts.addEventListener("loadingdone", scheduleFit);
  const styleObserver = new MutationObserver(scheduleFit);
  styleObserver.observe(document.head, { subtree: true, childList: true, characterData: true, attributes: true });
  const documentObserver = new MutationObserver(scheduleFit);
  const memo = document.querySelector(".memo-document");
  if (memo) documentObserver.observe(memo, { childList: true });
  Promise.all([
    document.fonts.ready,
    ...Array.from(document.images, (image) => image.decode().catch(() => undefined)),
  ]).then(fitRolePages);
})();
