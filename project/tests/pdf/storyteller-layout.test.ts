import { chromium, type Browser, type Page } from "playwright";
import { afterAll, beforeAll, describe, expect, it } from "vitest";
import {
  plainRichText,
  renderStorytellerMemoHtml,
  type PlayerMemo,
  type RoleCard,
  type RoleTeam,
} from "../../src/index.js";

const pixelsPerMillimeter = 96 / 25.4;
const geometryTolerance = 0.5;

describe("Вёрстка памятки рассказчика", () => {
  let browser: Browser | undefined;
  let page: Page;

  beforeAll(async () => {
    browser = await chromium.launch({ headless: true });
    page = await browser.newPage({ viewport: { width: 1120, height: 1584 } });
    await page.emulateMedia({ media: "print" });
    await page.setContent(await renderStorytellerMemoHtml(createMemo()), {
      waitUntil: "load",
    });
    await page.evaluate(async () => {
      await document.fonts.ready;
      await Promise.all(Array.from(document.images, (image) => image.decode()));
      document.dispatchEvent(new Event("botc:fit-storyteller-pages"));
    });
  });

  afterAll(async () => {
    await browser?.close();
  });

  it("создаёт ровно две страницы A4 без переполнения", async () => {
    const pages = await page
      .locator(".memo-page--storyteller")
      .evaluateAll((elements) =>
        elements.map((element) => {
          const rect = element.getBoundingClientRect();
          const orderRect = element
            .querySelector(".storyteller-order")
            ?.getBoundingClientRect();
          if (orderRect === undefined) {
            throw new Error(
              "На странице рассказчика отсутствует порядок ночи.",
            );
          }
          return {
            width: rect.width,
            height: rect.height,
            orderBottom: orderRect.bottom,
            pageBottom: rect.bottom,
            state: element.getAttribute("data-storyteller-fit-state"),
          };
        }),
      );

    expect(pages).toHaveLength(2);
    for (const memoPage of pages) {
      expect(memoPage.state).toBe("ready");
      expect(memoPage.orderBottom).toBeLessThanOrEqual(
        memoPage.pageBottom + geometryTolerance,
      );
      expect(Math.abs(memoPage.width - 210 * pixelsPerMillimeter)).toBeLessThan(
        geometryTolerance,
      );
      expect(
        Math.abs(memoPage.height - 297 * pixelsPerMillimeter),
      ).toBeLessThan(geometryTolerance);
    }
  });

  it("окрашивает названия и штрихи добрых, злых и нейтральных ролей", async () => {
    const colors = await page
      .locator('[data-storyteller-night="first"] [data-night-role-id]')
      .evaluateAll((elements) =>
        Object.fromEntries(
          elements.map((element) => {
            const name = element.querySelector<HTMLElement>(
              ".storyteller-order-name",
            );
            const stroke =
              element.querySelector<HTMLElement>(".night-team-stroke");
            if (name === null || stroke === null) {
              throw new Error("У роли отсутствует название или штрих команды.");
            }
            return [
              element.getAttribute("data-night-role-id"),
              {
                name: getComputedStyle(name).color,
                stroke: getComputedStyle(stroke).backgroundColor,
              },
            ];
          }),
        ),
      );

    expect(colors["good-role"]).toEqual({
      name: "rgb(20, 107, 179)",
      stroke: "rgb(20, 107, 179)",
    });
    expect(colors["evil-role"]).toEqual({
      name: "rgb(153, 28, 53)",
      stroke: "rgb(153, 28, 53)",
    });
    expect(colors["neutral-role"]).toEqual({
      name: "rgb(23, 23, 23)",
      stroke: "rgb(23, 23, 23)",
    });
  });

  it("использует увеличенные иконки и плотные строки", async () => {
    const geometry = await page
      .locator(
        '[data-storyteller-night="first"] [data-night-role-id="good-role"]',
      )
      .evaluate((element) => {
        const row = element.getBoundingClientRect();
        const icon = element
          .querySelector<HTMLElement>(".night-role-icon")
          ?.getBoundingClientRect();
        const name = element
          .querySelector<HTMLElement>(".storyteller-order-name")
          ?.getBoundingClientRect();
        if (icon === undefined || name === undefined) {
          throw new Error("У роли отсутствует иконка или название.");
        }
        return {
          rowHeight: row.height,
          iconWidth: icon.width,
          iconNameGap: name.left - icon.right,
        };
      });

    expect(
      Math.abs(geometry.rowHeight - 12.2 * pixelsPerMillimeter),
    ).toBeLessThan(geometryTolerance);
    expect(
      Math.abs(geometry.iconWidth - 17 * pixelsPerMillimeter),
    ).toBeLessThan(geometryTolerance);
    expect(geometry.iconNameGap).toBeLessThan(1 * pixelsPerMillimeter);
  });

  it("совмещает центры иконок с названиями и оставляет зазор до штриха", async () => {
    const geometry = await page
      .locator('[data-storyteller-night="first"] .storyteller-order-row')
      .evaluateAll((elements) =>
        elements.map((element) => {
          const icon = element
            .querySelector<HTMLElement>(".night-role-icon, .night-marker-icon")
            ?.getBoundingClientRect();
          const name = element
            .querySelector<HTMLElement>(".storyteller-order-name")
            ?.getBoundingClientRect();
          const stroke = element
            .querySelector<HTMLElement>(".night-team-stroke")
            ?.getBoundingClientRect();
          if (
            icon === undefined ||
            name === undefined ||
            stroke === undefined
          ) {
            throw new Error(
              "У строки рассказчика отсутствует иконка, название или штрих.",
            );
          }
          return {
            centerOffset:
              icon.top + icon.height / 2 - name.top - name.height / 2,
            nameStrokeGap: stroke.left - name.right,
          };
        }),
      );

    for (const row of geometry) {
      expect(Math.abs(row.centerOffset)).toBeLessThan(geometryTolerance);
      expect(row.nameStrokeGap).toBeGreaterThan(0.9 * pixelsPerMillimeter);
    }
  });
});

function createMemo(): PlayerMemo {
  const cards = [
    createRole("good-role", "townsfolk", "Добрая роль"),
    createRole("evil-role", "minion", "Злая роль"),
    createRole("neutral-role", "traveller", "Нейтральная роль"),
  ];
  const order = cards.map((card) => ({
    kind: "role" as const,
    roleId: card.id,
  }));
  return {
    title: "Проверка памятки",
    author: null,
    logo: null,
    background: null,
    sections: [
      { team: "townsfolk", cards: [cards[0]!] },
      { team: "minion", cards: [cards[1]!] },
      { team: "traveller", cards: [cards[2]!] },
    ],
    nightSheet: {
      firstNight: [
        { kind: "marker", id: "dusk" },
        ...order,
        { kind: "marker", id: "dawn" },
      ],
      otherNight: [
        { kind: "marker", id: "dusk" },
        ...order,
        { kind: "marker", id: "dawn" },
      ],
      jinxes: [],
    },
  };
}

function createRole(id: string, team: RoleTeam, name: string): RoleCard {
  return {
    id,
    team,
    name: plainRichText(name),
    ability: plainRichText("Способность"),
    firstNightReminder: plainRichText("Действие первой ночи."),
    otherNightReminder: plainRichText("Действие последующих ночей."),
    image: null,
    edition: null,
  };
}
