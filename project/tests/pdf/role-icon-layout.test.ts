import { readFile, rm } from "node:fs/promises";
import path from "node:path";
import { chromium, type Browser, type Page } from "playwright";
import { afterAll, afterEach, beforeAll, beforeEach, describe, expect, it } from "vitest";
import {
  createMemoCompiler, generatePdfFromHtml, materializeMemoAssets, PdfLayoutError, plainRichText, renderMemoHtml, type PlayerMemo,
} from "../../src/index.js";

const pixelsPerMillimeter = 96 / 25.4;
const tolerance = 0.6;
const outputPath = path.resolve(import.meta.dirname, "../../tmp/pdfs/adaptive-role-icons.pdf");
const blockedPath = path.resolve(import.meta.dirname, "../../tmp/pdfs/adaptive-role-icons-blocked.pdf");
const image = "data:image/svg+xml;base64," + Buffer.from(
  '<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 100 100"><circle cx="50" cy="50" r="28" fill="#146bb3"/></svg>',
).toString("base64");

describe("Автоматический размер иконок на страницах ролей", () => {
  let browser: Browser;
  let page: Page;

  beforeAll(async () => {
    browser = await chromium.launch({ headless: true });
  });

  beforeEach(async () => {
    page = await browser.newPage({ viewport: { width: 1120, height: 1584 } });
    await page.context().setOffline(true);
    await page.emulateMedia({ media: "print" });
  });

  afterEach(async () => { await page.close(); });

  afterAll(async () => {
    await browser?.close();
    await Promise.all([rm(outputPath, { force: true }), rm(blockedPath, { force: true })]);
  });

  it("сохраняет 19 мм на свободной странице и прежние размеры текста и ночных иконок", async () => {
    await loadMemo(page, createMemo(4));
    const geometry = (await readGeometry(page))[0]!;
    expect(Math.abs(geometry.iconSize - 19 * pixelsPerMillimeter)).toBeLessThan(tolerance);
    assertFits(geometry);
    expect(await page.locator(".night-role-icon img").evaluate((icon) => icon.getBoundingClientRect().width)).toBeCloseTo(
      13 * pixelsPerMillimeter, 1,
    );
    const previous = geometry.iconSize;
    await page.evaluate(() => document.dispatchEvent(new Event("botc:fit-role-pages")));
    expect((await readGeometry(page))[0]!.iconSize).toBe(previous);
  });

  it("подбирает максимально возможный размер и создаёт PDF с 40 ролями без уменьшения шрифта", async () => {
    const html = await loadMemo(page, createMemo(40));
    const geometry = (await readGeometry(page))[0]!;
    expect(geometry.iconSize).toBeLessThan(18.5 * pixelsPerMillimeter);
    expect(geometry.iconSize).toBeGreaterThan(12 * pixelsPerMillimeter - tolerance);
    expect(geometry.roleCount).toBe(40);
    expect(geometry.contentFooterGap).toBeLessThan(4.6);
    assertFits(geometry);

    const report = await generatePdfFromHtml(html, outputPath);
    expect(report.pageCount).toBe(2);
    expect(report.failedImageRequests).toEqual([]);
    expect((await readFile(outputPath)).subarray(0, 4).toString("ascii")).toBe("%PDF");
  });

  it("учитывает разную плотность страниц отдельно", async () => {
    await loadMemo(page, createMemo(44), 40);
    const [dense, sparse] = await readGeometry(page);
    expect(dense!.iconSize).toBeLessThan(18.5 * pixelsPerMillimeter);
    expect(Math.abs(sparse!.iconSize - 19 * pixelsPerMillimeter)).toBeLessThan(tolerance);
    expect(dense!.roleCount).toBe(40);
    expect(sparse!.roleCount).toBe(4);
    assertFits(dense!);
    assertFits(sparse!);
  });

  it("вмещает реальный Lunar Eclipse с 25 ролями, который не помещается с иконками 19 мм", async () => {
    const root = path.resolve(import.meta.dirname, "../..");
    const [scriptJson, catalogJson] = await Promise.all([
      readFile(path.join(root, "scripts_json/Lunar Eclipse v1.6.json"), "utf8"),
      readFile(path.join(root, "catalog/roles.ru.json"), "utf8"),
    ]);
    const compiled = createMemoCompiler(catalogJson).value?.compile(scriptJson, { locale: "ru" });
    expect(compiled?.diagnostics).toEqual([]);
    if (!compiled?.value) throw new Error("Не удалось собрать сценарий Lunar Eclipse для проверки размеров иконок.");
    const { memo } = await materializeMemoAssets(compiled.value, {
      baseDir: root, assetsDir: path.join(root, "assets/roles"), fetchRemote: false,
    });
    await loadMemo(page, memo, 25);
    const geometry = (await readGeometry(page))[0]!;
    expect(geometry.roleCount).toBe(25);
    expect(geometry.iconSize).toBeLessThan(19 * pixelsPerMillimeter - tolerance);
    expect(geometry.iconSize).toBeGreaterThanOrEqual(12 * pixelsPerMillimeter - tolerance);
    assertFits(geometry);
    await page.addStyleTag({ content: ":root { --role-icon-min-size: 19mm; }" });
    await page.evaluate(() => document.dispatchEvent(new Event("botc:fit-role-pages")));
    expect((await readGeometry(page))[0]!.state).toBe("blocked");
  });

  it("останавливается на минимальных 12 мм, если даже они не позволяют вместить роли", async () => {
    const html = await loadMemo(page, createMemo(60));
    const geometry = (await readGeometry(page))[0]!;
    expect(geometry.state).toBe("blocked");
    expect(Math.abs(geometry.iconSize - 12 * pixelsPerMillimeter)).toBeLessThan(tolerance);
    expect(geometry.nameFont).toBe(24);
    expect(geometry.abilityFont).toBeCloseTo(14.5 * 96 / 72, 3);
    await expect(generatePdfFromHtml(html, blockedPath)).rejects.toBeInstanceOf(PdfLayoutError);
    await expect(readFile(blockedPath)).rejects.toMatchObject({ code: "ENOENT" });
  });

  it("соблюдает настроенную нижнюю границу и пересчитывает размер после изменения содержимого", async () => {
    await loadMemo(page, createMemo(40));
    const original = (await readGeometry(page))[0]!;
    await page.locator("[data-page-role-count]").evaluate((element) => {
      (element as HTMLElement).style.setProperty("--role-icon-min-size", "18mm");
    });
    await page.waitForFunction(() => document.querySelector("[data-role-fit-state]")?.getAttribute("data-role-fit-state") === "blocked");
    expect(Math.abs((await readGeometry(page))[0]!.iconSize - 18 * pixelsPerMillimeter)).toBeLessThan(tolerance);

    await page.locator("[data-page-role-count]").evaluate((element) => {
      (element as HTMLElement).style.removeProperty("--role-icon-min-size");
    });
    await page.waitForFunction(() => document.querySelector("[data-role-fit-state]")?.getAttribute("data-role-fit-state") === "ready");
    expect(Math.abs((await readGeometry(page))[0]!.iconSize - original.iconSize)).toBeLessThan(tolerance);

    await page.locator(".memo-page--first .section-column").evaluateAll((columns) => {
      for (const column of columns) for (const card of Array.from(column.children).slice(2)) card.remove();
    });
    await page.waitForFunction(() => {
      const icon = document.querySelector(".role-icon img");
      return icon !== null && icon.getBoundingClientRect().width > 18.9 * 96 / 25.4;
    });
    assertFits((await readGeometry(page))[0]!);
  });

  it("сохраняет расчёт в предпросмотре и при печати", async () => {
    await page.emulateMedia({ media: "screen" });
    await loadMemo(page, createMemo(40));
    const screen = (await readGeometry(page))[0]!;
    assertFits(screen);
    await page.emulateMedia({ media: "print" });
    await page.evaluate(() => window.dispatchEvent(new Event("beforeprint")));
    const print = (await readGeometry(page))[0]!;
    assertFits(print);
    expect(Math.abs(print.iconSize - screen.iconSize)).toBeLessThan(tolerance);
  });
});

function createMemo(count: number): PlayerMemo {
  return {
    title: "Проверка размеров иконок", author: null, logo: null, background: null,
    sections: [{ team: "townsfolk", cards: Array.from({ length: count }, (_, index) => ({
      id: `role-${index}`, team: "townsfolk", name: plainRichText(`Роль ${index + 1}`),
      ability: plainRichText("Каждую ночь вы узнаёте полезную информацию."), image, edition: null,
    })) }],
    nightSheet: {
      firstNight: [{ kind: "marker", id: "dusk" }, { kind: "role", roleId: "role-0" }, { kind: "marker", id: "dawn" }],
      otherNight: [{ kind: "marker", id: "dusk" }, { kind: "marker", id: "dawn" }], jinxes: [],
    },
  };
}

async function loadMemo(page: Page, memo: PlayerMemo, cardsPerPage = 100): Promise<string> {
  const html = await renderMemoHtml(memo, { cardsPerPage });
  await page.setContent(html, { waitUntil: "load" });
  await page.evaluate(async () => {
    await document.fonts.ready;
    await Promise.all(Array.from(document.images, (image) => image.decode()));
    document.dispatchEvent(new Event("botc:fit-role-pages"));
  });
  return html;
}

async function readGeometry(page: Page) {
  return page.locator("[data-page-role-count]").evaluateAll((pages) => pages.map((element) => {
    const pageRect = element.getBoundingClientRect();
    const icon = element.querySelector<HTMLElement>(".role-icon img")!;
    const name = element.querySelector<HTMLElement>(".role-name")!;
    const ability = element.querySelector<HTMLElement>(".role-ability")!;
    const footer = element.querySelector(".page-footer")!.getBoundingClientRect();
    const sections = element.querySelector(".page-sections")!.getBoundingClientRect();
    const content = Array.from(element.querySelectorAll(".role-copy, .role-icon img, .section-heading"));
    return {
      state: element.getAttribute("data-role-fit-state"), roleCount: element.querySelectorAll(".role-card").length,
      iconSize: icon.getBoundingClientRect().width,
      nameFont: Number.parseFloat(getComputedStyle(name).fontSize), abilityFont: Number.parseFloat(getComputedStyle(ability).fontSize),
      footerGap: footer.top - sections.bottom,
      contentFooterGap: footer.top - Math.max(sections.bottom, ...content.map((item) => item.getBoundingClientRect().bottom)),
      outsidePage: content.filter((item) => {
        const rect = item.getBoundingClientRect();
        return rect.left < pageRect.left - 0.6 || rect.right > pageRect.right + 0.6 || rect.top < pageRect.top - 0.6 ||
          rect.bottom > footer.top - 3.4;
      }).map((item) => item.className),
      horizontalOverflow: element.scrollWidth - element.clientWidth, verticalOverflow: element.scrollHeight - element.clientHeight,
    };
  }));
}

function assertFits(geometry: Awaited<ReturnType<typeof readGeometry>>[number]): void {
  expect(geometry.state).toBe("ready");
  expect(geometry.nameFont).toBe(24);
  expect(geometry.abilityFont).toBeCloseTo(14.5 * 96 / 72, 3);
  expect(geometry.outsidePage).toEqual([]);
  expect(geometry.footerGap).toBeGreaterThanOrEqual(3.4);
  expect(geometry.horizontalOverflow).toBeLessThanOrEqual(1);
  expect(geometry.verticalOverflow).toBeLessThanOrEqual(1);
}
