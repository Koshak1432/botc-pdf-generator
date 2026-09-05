import { chromium, type Browser, type Page } from "playwright";
import { afterAll, beforeAll, describe, expect, it } from "vitest";
import { plainRichText, renderMemoHtml, type PlayerMemo, type RoleCard } from "../../src/index.js";

const pixelsPerMillimeter = 96 / 25.4;
const geometryTolerance = 0.5;

describe("Расположение увеличенных иконок ночного порядка", () => {
  let browser: Browser | undefined;
  let page: Page;

  beforeAll(async () => {
    browser = await chromium.launch({ headless: true });
    page = await browser.newPage({ viewport: { width: 1120, height: 1584 } });
    await page.emulateMedia({ media: "print" });
    await page.setContent(await renderMemoHtml(createDenseMemo(), { locale: "ru" }), { waitUntil: "load" });
    await page.evaluate(async () => {
      await document.fonts.ready;
      await Promise.all(Array.from(document.images, (image) => image.decode()));
    });
  });

  afterAll(async () => {
    await browser?.close();
  });

  it("центрирует иконки, названия и штрихи в обоих столбцах без горизонтального наложения", async () => {
    const rows = await page.locator(".night-order-row").evaluateAll((elements) => {
      return elements.map((element) => {
        const name = element.querySelector<HTMLElement>(".night-order-name");
        const stroke = element.querySelector<HTMLElement>(".night-team-stroke");
        const icon = element.querySelector<HTMLElement>(".night-role-icon img, .night-marker-icon img, .night-marker-icon svg");
        if (name === null || stroke === null || icon === null) {
          throw new Error("В строке ночного порядка отсутствует название, штрих или иконка.");
        }
        const rowRect = element.getBoundingClientRect();
        const nameRect = name.getBoundingClientRect();
        const strokeRect = stroke.getBoundingClientRect();
        const iconRect = icon.getBoundingClientRect();
        const first = element.closest(".night-side--first") !== null;
        return {
          id: element.getAttribute("data-night-role-id") ?? element.getAttribute("data-marker-id"),
          first,
          role: element.classList.contains("night-order-row--role"),
          rowCenter: rowRect.top + rowRect.height / 2,
          nameCenter: nameRect.top + nameRect.height / 2,
          strokeCenter: strokeRect.top + strokeRect.height / 2,
          iconCenter: iconRect.top + iconRect.height / 2,
          iconWidth: iconRect.width,
          iconHeight: iconRect.height,
          iconNameGap: first ? nameRect.left - iconRect.right : iconRect.left - nameRect.right,
          nameStrokeGap: first ? strokeRect.left - nameRect.right : nameRect.left - strokeRect.right,
          nameLines: nameRect.height / Number.parseFloat(getComputedStyle(name).lineHeight),
          nameColor: getComputedStyle(name).color,
          nameWeight: getComputedStyle(name).fontWeight,
          strokeColor: getComputedStyle(stroke).backgroundColor,
        };
      });
    });

    expect(rows.filter((row) => row.first)).toHaveLength(23);
    expect(rows.filter((row) => !row.first)).toHaveLength(23);
    for (const row of rows) {
      const context = `${row.first ? "Первая ночь" : "Последующие ночи"}: ${row.id}`;
      const iconScale = row.id === "dusk" || row.id === "dawn" ? 0.85 : 1;
      const expectedIconSize = 13 * iconScale * pixelsPerMillimeter;
      expect(Math.abs(row.iconCenter - row.rowCenter), context).toBeLessThan(geometryTolerance);
      expect(Math.abs(row.nameCenter - row.iconCenter), context).toBeLessThan(geometryTolerance);
      expect(Math.abs(row.strokeCenter - row.iconCenter), context).toBeLessThan(geometryTolerance);
      expect(row.iconNameGap, context).toBeGreaterThanOrEqual(-geometryTolerance);
      expect(row.nameStrokeGap, context).toBeGreaterThanOrEqual(-geometryTolerance);
      expect(Math.abs(row.iconWidth - expectedIconSize), context).toBeLessThan(geometryTolerance);
      expect(Math.abs(row.iconHeight - expectedIconSize), context).toBeLessThan(geometryTolerance);
    }
    const markers = rows.filter((row) => !row.role);
    expect([...new Set(markers.map((row) => row.id))].sort()).toEqual(["dawn", "demoninfo", "dusk", "minioninfo"]);
    for (const marker of markers) {
      const context = `Маркер ночного порядка: ${marker.id}`;
      expect(marker.nameColor, context).toBe("rgb(23, 23, 23)");
      expect(marker.strokeColor, context).toBe("rgb(23, 23, 23)");
      expect(marker.nameWeight, context).toBe("400");
    }
    const multilineNames = rows.filter((row) => row.id === "layout-role-0");
    expect(multilineNames).toHaveLength(2);
    for (const row of multilineNames) {
      expect(row.nameLines, "Длинное русское название должно занимать две строки.").toBeCloseTo(2, 1);
    }
  });

  it("вмещает плотные столбцы на A4 и сохраняет размеры иконок сглазов и первой страницы", async () => {
    const geometry = await page.evaluate(() => {
      const nightPage = document.querySelector<HTMLElement>("[data-night-sheet]");
      const playerIcon = document.querySelector<HTMLElement>(".role-card .role-icon img");
      if (nightPage === null || playerIcon === null) {
        throw new Error("В памятке отсутствует ночная страница или иконка на странице описаний.");
      }
      const pageRect = nightPage.getBoundingClientRect();
      const content = Array.from(nightPage.querySelectorAll<HTMLElement>(
        ".night-order-row, .night-order-row img, .night-order-row svg",
      ));
      const contentRects = content.map((element) => element.getBoundingClientRect());
      const jinxImages = Array.from(nightPage.querySelectorAll<HTMLElement>(".jinx-icons img"));
      return {
        pages: document.querySelectorAll(".memo-page").length,
        pageWidth: pageRect.width,
        pageHeight: pageRect.height,
        horizontalOverflow: nightPage.scrollWidth - nightPage.clientWidth,
        verticalOverflow: nightPage.scrollHeight - nightPage.clientHeight,
        insidePage: contentRects.every((rect) => {
          return rect.left >= pageRect.left && rect.right <= pageRect.right &&
            rect.top >= pageRect.top && rect.bottom <= pageRect.bottom;
        }),
        playerIconWidth: playerIcon.getBoundingClientRect().width,
        jinxIcons: jinxImages.map((element) => {
          const rect = element.getBoundingClientRect();
          return { width: rect.width, height: rect.height };
        }),
      };
    });

    expect(geometry.pages).toBe(2);
    expect(Math.abs(geometry.pageWidth - 210 * pixelsPerMillimeter)).toBeLessThan(geometryTolerance);
    expect(Math.abs(geometry.pageHeight - 297 * pixelsPerMillimeter)).toBeLessThan(geometryTolerance);
    expect(geometry.insidePage).toBe(true);
    expect(geometry.horizontalOverflow).toBeLessThanOrEqual(1);
    expect(geometry.verticalOverflow).toBeLessThanOrEqual(1);
    expect(Math.abs(geometry.playerIconWidth - 19 * pixelsPerMillimeter)).toBeLessThan(geometryTolerance);
    expect(geometry.jinxIcons).toHaveLength(2);
    for (const [index, icon] of geometry.jinxIcons.entries()) {
      const expectedSize = (index === 0 ? 14 : 11.5) * pixelsPerMillimeter;
      expect(Math.abs(icon.width - expectedSize)).toBeLessThan(geometryTolerance);
      expect(Math.abs(icon.height - expectedSize)).toBeLessThan(geometryTolerance);
    }
  });
});

function createDenseMemo(): PlayerMemo {
  const svg = '<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 100 100">' +
    '<circle cx="50" cy="50" r="28" fill="#146bb3"/></svg>';
  const image = `data:image/svg+xml;base64,${Buffer.from(svg).toString("base64")}`;
  const cards: RoleCard[] = Array.from({ length: 21 }, (_, index) => ({
    id: `layout-role-${index}`,
    team: index === 20 ? "minion" : "townsfolk",
    name: plainRichText(index === 0 ? "Охотник за головами" : `Роль ${index + 1}`),
    ability: plainRichText("Каждую ночь вы узнаёте полезную информацию."),
    image,
    edition: null,
  }));
  const order = cards.map((card) => ({ kind: "role" as const, roleId: card.id }));
  return {
    title: "Проверка ночного порядка",
    author: null,
    logo: null,
    background: null,
    sections: [
      { team: "townsfolk", cards: cards.filter((card) => card.team === "townsfolk") },
      { team: "minion", cards: cards.filter((card) => card.team === "minion") },
    ],
    nightSheet: {
      firstNight: [
        { kind: "marker", id: "dusk" },
        { kind: "marker", id: "minioninfo" },
        { kind: "marker", id: "demoninfo" },
        ...order.slice(0, 19),
        { kind: "marker", id: "dawn" },
      ],
      otherNight: [{ kind: "marker", id: "dusk" }, ...order, { kind: "marker", id: "dawn" }],
      jinxes: [{
        roleIds: ["layout-role-0", "layout-role-20"],
        reason: plainRichText("Сглаз сохраняет прежний размер иконок и не влияет на ночной порядок."),
      }],
    },
  };
}
