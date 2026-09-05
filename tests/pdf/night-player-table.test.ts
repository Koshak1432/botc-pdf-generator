import { rm } from "node:fs/promises";
import path from "node:path";
import { chromium, type Browser, type Page } from "playwright";
import { afterAll, afterEach, beforeAll, beforeEach, describe, expect, it } from "vitest";
import { generatePdfFromHtml, plainRichText, renderMemoHtml, type PlayerMemo, type RoleCard } from "../../src/index.js";

const pixelsPerMillimeter = 96 / 25.4;
const geometryTolerance = 0.6;
const blockedOutput = path.resolve(import.meta.dirname, "../../tmp/pdfs/night-player-table-blocked.pdf");

describe("Адаптивная таблица количества игроков на ночной странице", () => {
  let browser: Browser;
  let page: Page;

  beforeAll(async () => {
    browser = await chromium.launch({ headless: true });
  });

  beforeEach(async () => {
    page = await browser.newPage({ viewport: { width: 1120, height: 1584 } });
    await page.emulateMedia({ media: "print" });
  });

  afterEach(async () => {
    await page.close();
  });

  afterAll(async () => {
    await browser?.close();
    await rm(blockedOutput, { force: true });
  });

  it("показывает встроенное фото шириной 140 мм по центру в 5 мм от нижнего края", async () => {
    await loadNightMemo(page, createNightMemo());
    const geometry = await readTableGeometry(page);

    expect(geometry.state).toBe("ready");
    expect(Math.abs(geometry.width - 140 * pixelsPerMillimeter)).toBeLessThan(geometryTolerance);
    expect(geometry.embeddedJpeg).toBe(true);
    expect(geometry.naturalWidth).toBe(1280);
    expect(geometry.naturalHeight).toBe(415);
    expect(geometry.pages).toBe(2);
    assertSafeTableGeometry(geometry);
  });

  it("постепенно уменьшает фото при росте списков и размещает его между длинными столбцами", async () => {
    const widths: number[] = [];
    for (const roleCount of [4, 20, 22]) {
      await loadNightMemo(page, createNightMemo(roleCount));
      const geometry = await readTableGeometry(page);
      expect(geometry.state, `Количество ролей: ${roleCount}`).toBe("ready");
      assertSafeTableGeometry(geometry);
      widths.push(geometry.width);
    }

    expect(widths[0]! - widths[1]!).toBeGreaterThan(2 * pixelsPerMillimeter);
    expect(widths[1]! - widths[2]!).toBeGreaterThan(2 * pixelsPerMillimeter);
    expect(widths[2]).toBeGreaterThan(70 * pixelsPerMillimeter);
    const alongsideColumns = await page.locator("[data-night-sheet]").evaluate((element) => {
      const table = element.querySelector(".night-player-table img")!.getBoundingClientRect();
      return Array.from(element.querySelectorAll(".night-order-row")).some((row) => {
        return row.getBoundingClientRect().bottom > table.top;
      });
    });
    expect(alongsideColumns).toBe(true);
  });

  it("учитывает сглазы в центре независимо от длины ночных столбцов", async () => {
    await loadNightMemo(page, createNightMemo(4, 15));
    const geometry = await readTableGeometry(page);

    expect(geometry.state).toBe("ready");
    expect(geometry.width).toBeLessThan(139 * pixelsPerMillimeter);
    expect(geometry.width).toBeGreaterThan(70 * pixelsPerMillimeter);
    assertSafeTableGeometry(geometry);
  });

  it("пересчитывает размер после увеличения иконок и строк и восстанавливает исходный размер", async () => {
    await loadNightMemo(page, createNightMemo(19));
    const original = await readTableGeometry(page);
    expect(Math.abs(original.width - 140 * pixelsPerMillimeter)).toBeLessThan(geometryTolerance);

    await page.locator("[data-night-sheet]").evaluate((element) => {
      const nightPage = element as HTMLElement;
      nightPage.style.setProperty("--night-order-icon-size", "17mm");
      nightPage.style.setProperty("--night-order-row-height", "10mm");
    });
    await page.waitForFunction((originalWidth) => {
      const table = document.querySelector(".night-player-table img");
      return table !== null && table.getBoundingClientRect().width < originalWidth - 5;
    }, original.width);
    const enlargedIcons = await readTableGeometry(page);
    expect(enlargedIcons.state).toBe("ready");
    assertSafeTableGeometry(enlargedIcons);

    await page.locator("[data-night-sheet]").evaluate((element) => {
      const nightPage = element as HTMLElement;
      nightPage.style.removeProperty("--night-order-icon-size");
      nightPage.style.removeProperty("--night-order-row-height");
    });
    await page.waitForFunction((originalWidth) => {
      const table = document.querySelector(".night-player-table img");
      return table !== null && Math.abs(table.getBoundingClientRect().width - originalWidth) < 0.6;
    }, original.width);
    assertSafeTableGeometry(await readTableGeometry(page));
  });

  it("сохраняет безопасное размещение в предпросмотре и при переключении на печать", async () => {
    await page.emulateMedia({ media: "screen" });
    await loadNightMemo(page, createNightMemo(20));
    const screen = await readTableGeometry(page);
    assertSafeTableGeometry(screen);

    await page.emulateMedia({ media: "print" });
    await page.evaluate(() => {
      window.dispatchEvent(new Event("beforeprint"));
      document.dispatchEvent(new Event("botc:fit-night-tables"));
    });
    const printed = await readTableGeometry(page);
    expect(printed.state).toBe("ready");
    expect(Math.abs(printed.width - screen.width)).toBeLessThan(geometryTolerance);
    assertSafeTableGeometry(printed);
  });

  it("сохраняет размеры первой страницы и не добавляет таблицу без ночного порядка", async () => {
    const memo = createNightMemo();
    await loadNightMemo(page, memo);
    const originalIconWidth = await page.locator(".role-card .role-icon img").first().evaluate((element) => {
      return element.getBoundingClientRect().width;
    });
    expect(Math.abs(originalIconWidth - 19 * pixelsPerMillimeter)).toBeLessThan(geometryTolerance);

    await page.setContent(await renderMemoHtml({ ...memo, nightSheet: null }), { waitUntil: "load" });
    expect(await page.locator(".night-player-table").count()).toBe(0);
    expect(await page.locator(".memo-page").count()).toBe(1);
  });

  it("помечает нехватку места вместо незаметного уменьшения таблицы до нечитаемого размера", async () => {
    await loadNightMemo(page, createNightMemo(4, 17));

    await expect.poll(() => page.locator(".night-player-table").getAttribute("data-fit-state")).toBe("blocked");
    const caption = page.locator(".night-player-table figcaption");
    expect(await caption.isVisible()).toBe(true);
    expect((await caption.textContent())?.trim().length).toBeGreaterThan(0);
  });

  it("останавливает экспорт PDF с понятной ошибкой, если читаемая таблица не помещается", async () => {
    const html = await renderMemoHtml(createNightMemo(4, 17));
    await expect(generatePdfFromHtml(html, blockedOutput)).rejects.toThrow(/таблиц/i);
  });
});

async function loadNightMemo(page: Page, memo: PlayerMemo): Promise<void> {
  await page.setContent(await renderMemoHtml(memo), { waitUntil: "load" });
  await page.waitForFunction(() => {
    const state = document.querySelector(".night-player-table")?.getAttribute("data-fit-state");
    return state === "ready" || state === "blocked";
  });
}

async function readTableGeometry(page: Page) {
  return page.locator("[data-night-sheet]").evaluate((nightPage) => {
    const table = nightPage.querySelector<HTMLElement>(".night-player-table");
    const image = table?.querySelector<HTMLImageElement>("img");
    if (table === null || image === undefined || image === null) {
      throw new Error("На ночной странице отсутствует таблица количества игроков.");
    }
    const pageRect = nightPage.getBoundingClientRect();
    const imageRect = image.getBoundingClientRect();
    const gap = 3 * 96 / 25.4;
    const tolerance = 0.6;
    const obstacles = nightPage.querySelectorAll(
      ".night-order-row, .night-order-row img, .night-order-row svg, .night-side-heading, " +
      ".night-jinxes, .night-jinxes img, .night-jinxes svg",
    );
    const collisions = Array.from(obstacles).flatMap((element) => {
      const rect = element.getBoundingClientRect();
      if (rect.width === 0 || rect.height === 0) return [];
      const separated = imageRect.right + gap <= rect.left + tolerance ||
        imageRect.left - gap >= rect.right - tolerance || imageRect.bottom + gap <= rect.top + tolerance ||
        imageRect.top - gap >= rect.bottom - tolerance;
      return separated ? [] : [element.getAttribute("class") ?? element.tagName];
    });
    return {
      state: table.dataset.fitState,
      width: imageRect.width,
      height: imageRect.height,
      centerOffset: imageRect.left + imageRect.width / 2 - (pageRect.left + pageRect.width / 2),
      bottomGap: pageRect.bottom - imageRect.bottom,
      insidePage: imageRect.left >= pageRect.left && imageRect.right <= pageRect.right &&
        imageRect.top >= pageRect.top && imageRect.bottom <= pageRect.bottom,
      naturalWidth: image.naturalWidth,
      naturalHeight: image.naturalHeight,
      embeddedJpeg: image.src.startsWith("data:image/jpeg;base64,"),
      pages: document.querySelectorAll(".memo-page").length,
      collisions,
    };
  });
}

function assertSafeTableGeometry(geometry: Awaited<ReturnType<typeof readTableGeometry>>): void {
  expect(geometry.insidePage).toBe(true);
  expect(Math.abs(geometry.centerOffset)).toBeLessThan(geometryTolerance);
  expect(Math.abs(geometry.bottomGap - 5 * pixelsPerMillimeter)).toBeLessThan(geometryTolerance);
  expect(Math.abs(geometry.width / geometry.height - 1280 / 415)).toBeLessThan(0.005);
  expect(geometry.collisions, "Таблица должна сохранять зазор 3 мм до ролей, иконок и сглазов.").toEqual([]);
}

function createNightMemo(roleCount = 4, jinxCount = 0): PlayerMemo {
  const svg = '<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 100 100">' +
    '<circle cx="50" cy="50" r="46" fill="#146bb3"/></svg>';
  const image = `data:image/svg+xml;base64,${Buffer.from(svg).toString("base64")}`;
  const cards: RoleCard[] = Array.from({ length: roleCount }, (_, index) => ({
    id: `table-role-${index}`,
    team: "townsfolk",
    name: plainRichText(`Роль ${index + 1}`),
    ability: plainRichText("Каждую ночь вы узнаёте полезную информацию."),
    image,
    edition: null,
  }));
  const order = cards.map((card) => ({ kind: "role" as const, roleId: card.id }));
  return {
    title: "Таблица количества игроков",
    author: null,
    logo: null,
    background: null,
    sections: [{ team: "townsfolk", cards }],
    nightSheet: {
      firstNight: [
        { kind: "marker", id: "dusk" },
        { kind: "marker", id: "minioninfo" },
        { kind: "marker", id: "demoninfo" },
        ...order,
        { kind: "marker", id: "dawn" },
      ],
      otherNight: [{ kind: "marker", id: "dusk" }, ...order, { kind: "marker", id: "dawn" }],
      jinxes: Array.from({ length: jinxCount }, () => ({
        roleIds: ["table-role-0", "table-role-1"],
        reason: plainRichText("Обе роли взаимодействуют."),
      })),
    },
  };
}
