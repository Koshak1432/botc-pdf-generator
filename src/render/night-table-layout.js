(() => {
  const obstacleSelector = [
    ".night-page-header", ".night-order-row", ".night-order-row img", ".night-order-row svg",
    ".night-side-heading", ".night-bootlegger", ".night-jinxes", ".jinx-item img",
  ].join(", ");

  function fitTables() {
    for (const page of document.querySelectorAll("[data-night-sheet]")) {
      const table = page.querySelector(".night-player-table");
      const image = table?.querySelector("img");
      if (!table || !image) continue;

      // Каждый раз начинаем с заданной ширины, чтобы таблица могла увеличиться обратно.
      table.style.removeProperty("width");
      const pageStyle = getComputedStyle(page);
      const tableStyle = getComputedStyle(table);
      const pageRect = page.getBoundingClientRect();
      const initialRect = table.getBoundingClientRect();
      const center = initialRect.left + initialRect.width / 2;
      const bottom = initialRect.bottom;
      const gap = Number.parseFloat(pageStyle.getPropertyValue("--night-table-gap-mm")) * 96 / 25.4;
      const minimum = Number.parseFloat(tableStyle.minWidth);
      const ratio = image.naturalWidth / image.naturalHeight;
      if (!Number.isFinite(ratio) || ratio <= 0 || !Number.isFinite(gap) || !Number.isFinite(minimum)) {
        table.dataset.fitState = "blocked";
        continue;
      }

      const left = pageRect.left + Number.parseFloat(pageStyle.paddingLeft);
      const right = pageRect.right - Number.parseFloat(pageStyle.paddingRight);
      const top = pageRect.top + Number.parseFloat(pageStyle.paddingTop);
      const obstacles = Array.from(page.querySelectorAll(obstacleSelector), (element) => element.getBoundingClientRect())
        .filter((rect) => rect.width > 0 && rect.height > 0);
      const preferred = Math.min(initialRect.width, 2 * (center - left), 2 * (right - center), (bottom - top) * ratio);
      const fits = (width) => {
        const tableLeft = center - width / 2;
        const tableRight = center + width / 2;
        const tableTop = bottom - width / ratio;
        return obstacles.every((rect) => tableRight + gap <= rect.left || tableLeft - gap >= rect.right ||
          bottom + gap <= rect.top || tableTop - gap >= rect.bottom);
      };

      if (preferred < minimum || !fits(minimum)) {
        table.style.width = `${minimum}px`;
        table.dataset.fitState = "blocked";
        continue;
      }

      let width = preferred;
      if (!fits(preferred)) {
        // Прямоугольники вложены друг в друга: двоичный поиск даёт плавное уменьшение без ступеней.
        let low = minimum;
        let high = preferred;
        for (let iteration = 0; iteration < 24; iteration += 1) {
          const middle = (low + high) / 2;
          if (fits(middle)) low = middle;
          else high = middle;
        }
        width = low;
      }
      table.style.width = `${Math.floor(width * 100) / 100}px`;
      table.dataset.fitState = "ready";
    }
  }

  let scheduled = false;
  const scheduleFit = () => {
    if (scheduled) return;
    scheduled = true;
    requestAnimationFrame(() => {
      scheduled = false;
      fitTables();
    });
  };
  document.addEventListener("botc:fit-night-tables", fitTables);
  window.addEventListener("beforeprint", fitTables);
  window.addEventListener("resize", scheduleFit);

  Promise.all([
    document.fonts.ready,
    ...Array.from(document.images, (image) => image.decode().catch(() => undefined)),
  ]).then(() => {
    fitTables();
    const resizeObserver = new ResizeObserver(scheduleFit);
    const observed = new WeakSet();
    const observeContent = () => {
      for (const page of document.querySelectorAll("[data-night-sheet]")) {
        for (const element of [page, ...page.querySelectorAll(obstacleSelector)]) {
          if (observed.has(element)) continue;
          observed.add(element);
          resizeObserver.observe(element);
        }
      }
    };
    observeContent();
    const contentObserver = new MutationObserver(() => {
      observeContent();
      scheduleFit();
    });
    for (const page of document.querySelectorAll("[data-night-sheet]")) {
      contentObserver.observe(page, { attributes: true });
      const content = page.querySelector(".night-layout");
      if (content) contentObserver.observe(content, { subtree: true, childList: true, characterData: true, attributes: true });
    }
    const styleObserver = new MutationObserver(scheduleFit);
    styleObserver.observe(document.head, { subtree: true, childList: true, characterData: true, attributes: true });
  });
})();
