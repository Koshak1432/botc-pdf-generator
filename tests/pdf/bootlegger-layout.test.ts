import { readFile } from "node:fs/promises";
import path from "node:path";
import { chromium, type Browser, type Page } from "playwright";
import { afterAll, afterEach, beforeAll, beforeEach, describe, expect, it } from "vitest";
import {
  createMemoCompiler,
  materializeMemoAssets,
  renderMemoHtml,
  type MemoCompiler,
  type PlayerMemo,
} from "../../src/index.js";

const projectDir = path.resolve(import.meta.dirname, "../..");
const pixelsPerMillimeter = 96 / 25.4;
const geometryTolerance = 0.6;

interface ScriptEntry {
  readonly id: string;
  readonly bootlegger?: readonly string[];
}

describe("Правила Бутлегера на странице ночного порядка", () => {
  let browser: Browser;
  let page: Page;
  let compiler: MemoCompiler;
  let script: ScriptEntry[];

  beforeAll(async () => {
    const [scriptJson, catalogJson, nightOrderJson, jinxesJson] = await Promise.all([
      readFile(path.join(projectDir, "scripts_json/teensyville/The-nightmare-king.json"), "utf8"),
      readFile(path.join(projectDir, "catalog/roles.ru.json"), "utf8"),
      readFile(path.join(projectDir, "catalog/nightsheet.json"), "utf8"),
      readFile(path.join(projectDir, "catalog/jinxes.ru.json"), "utf8"),
    ]);
    script = JSON.parse(scriptJson) as ScriptEntry[];
    const result = createMemoCompiler(catalogJson, { nightOrderJson, jinxesJson });
    if (result.value === null) throw new Error("Не удалось загрузить каталоги для проверки Бутлегера.");
    compiler = result.value;
    browser = await chromium.launch({ headless: true });
  });

  beforeEach(async () => {
    page = await browser.newPage({ viewport: { width: 1120, height: 1584 } });
    await page.context().setOffline(true);
    await page.emulateMedia({ media: "print" });
  });

  afterEach(async () => {
    await page.close();
  });

  afterAll(async () => {
    await browser?.close();
  });

  it("переносит Бутлегера во вторую страницу и выводит правило из настоящего сценария над сглазами", async () => {
    const memo = await compileMemo(compiler, script);
    await loadMemo(page, memo);
    const rules = script.find((entry) => entry.id === "_meta")?.bootlegger;
    expect(rules).toHaveLength(1);
    expect(await page.locator(".memo-page").count()).toBe(2);
    expect(await page.locator(".memo-page").first().locator('[data-role-id="bootlegger"]').count()).toBe(0);
    expect(await page.locator(".memo-page").first().locator("[data-bootlegger]").count()).toBe(0);
    expect(await page.locator(".memo-page").nth(1).locator(".night-center > [data-bootlegger]").count()).toBe(1);
    expect(await page.locator("[data-bootlegger] > h2").textContent()).toBe("Бутлегер");
    expect(await page.locator("[data-bootlegger] > p").allTextContents()).toEqual(rules);
    expect(await page.locator("body").textContent()).not.toContain("В сценарии присутствуют особые роли или правила.");

    const geometry = await readCenterGeometry(page);
    expect(geometry.firstSection).toBe("night-bootlegger");
    expect(geometry.jinxCount).toBeGreaterThan(0);
    expect(geometry.bootleggerBottom).not.toBeNull();
    expect(geometry.jinxTop - geometry.bootleggerBottom!).toBeGreaterThanOrEqual(3 * pixelsPerMillimeter - geometryTolerance);
    assertSafeGeometry(geometry);
  });

  it("не оставляет заголовка и пустого места над сглазами, если Бутлегера нет среди ролей", async () => {
    await loadMemo(page, await compileMemo(compiler, script));
    const withBootlegger = await readCenterGeometry(page);

    const withoutBootlegger = script.filter((entry) => entry.id !== "bootlegger");
    await loadMemo(page, await compileMemo(compiler, withoutBootlegger));
    const geometry = await readCenterGeometry(page);

    expect(await page.locator("[data-bootlegger]").count()).toBe(0);
    expect(geometry.firstSection).toBe("night-jinxes");
    expect(geometry.bootleggerBottom).toBeNull();
    expect(geometry.jinxCount).toBe(withBootlegger.jinxCount);
    expect(Math.abs(geometry.jinxTop - geometry.layoutTop)).toBeLessThan(geometryTolerance);
    expect(Math.abs(geometry.jinxHeadingTop - geometry.layoutTop - geometry.jinxPaddingTop)).toBeLessThan(geometryTolerance);
    expect(withBootlegger.jinxTop - geometry.jinxTop).toBeGreaterThan(10 * pixelsPerMillimeter);
    assertSafeGeometry(geometry);
  });

  it("размещает несколько длинных правил без наложений на сглазы, ночные столбцы и таблицу игроков", async () => {
    await loadMemo(page, await compileMemo(compiler, script));
    const original = await readCenterGeometry(page);
    const rules = [
      "Первое особое правило. Рассказчик сообщает всем игрокам об изменении взаимодействия ролей перед началом партии. " +
        "Если несколько способностей срабатывают одновременно, их порядок определяется обычным ночным порядком. " +
        "Игроки сохраняют свои роли, команды и всю ранее полученную информацию до следующего пробуждения.",
      "Второе особое правило. После обсуждения игрок может один раз за игру объявить свой выбор публично. " +
        "Рассказчик подтверждает только допустимость выбора, а результат объявляет в начале следующего дня. " +
        "До этого момента остальные способности продолжают действовать по своим обычным правилам.",
      "Третье особое правило. Если выбранный игрок погибает до разрешения способности, выбор сохраняется. " +
        "Все участники узнают об этом исключении заранее, но не получают дополнительных сведений о роли игрока. " +
        "Это правило применяется независимо от того, какую команду выбрал игрок в начале текущего дня.",
    ];
    const extendedScript = script.map((entry) => entry.id === "_meta" ? { ...entry, bootlegger: rules } : entry);
    await loadMemo(page, await compileMemo(compiler, extendedScript));
    const geometry = await readCenterGeometry(page);

    expect(await page.locator("[data-bootlegger] > p").allTextContents()).toEqual(rules);
    expect(geometry.jinxTop - original.jinxTop).toBeGreaterThan(50 * pixelsPerMillimeter);
    expect(geometry.tableWidth).toBeLessThanOrEqual(original.tableWidth + geometryTolerance);
    expect(geometry.paragraphOverlaps).toEqual([]);
    assertSafeGeometry(geometry);
  });
});

async function compileMemo(compiler: MemoCompiler, script: readonly ScriptEntry[]): Promise<PlayerMemo> {
  const result = compiler.compile(JSON.stringify(script), { locale: "ru" });
  if (result.value === null) throw new Error("Не удалось собрать памятку сценария с Бутлегером.");
  const materialized = await materializeMemoAssets(result.value, {
    baseDir: projectDir,
    assetsDir: path.join(projectDir, "assets/roles"),
    fetchRemote: false,
  });
  expect(materialized.warnings).toEqual([]);
  for (const card of materialized.memo.sections.flatMap((section) => section.cards)) {
    expect(card.image, `Локальная иконка роли: ${card.id}`).toMatch(/^data:image\//);
  }
  return materialized.memo;
}

async function loadMemo(page: Page, memo: PlayerMemo): Promise<void> {
  await page.setContent(await renderMemoHtml(memo, { locale: "ru" }), { waitUntil: "load" });
  await page.evaluate(async () => {
    await document.fonts.ready;
    await Promise.all(Array.from(document.images, (image) => image.decode()));
    document.dispatchEvent(new Event("botc:fit-night-tables"));
  });
  await page.waitForFunction(() => document.querySelector(".night-player-table")?.getAttribute("data-fit-state") !== "pending");
}

async function readCenterGeometry(page: Page) {
  return page.locator("[data-night-sheet]").evaluate((nightPage) => {
    const layout = nightPage.querySelector<HTMLElement>(".night-layout");
    const center = nightPage.querySelector<HTMLElement>(".night-center");
    const jinxes = nightPage.querySelector<HTMLElement>("[data-jinxes]");
    const jinxHeading = jinxes?.querySelector("h2");
    const table = nightPage.querySelector<HTMLElement>(".night-player-table");
    const tableImage = table?.querySelector("img");
    if (!layout || !center || !jinxes || !jinxHeading || !table || !tableImage) {
      throw new Error("На ночной странице отсутствуют центральная колонка, сглазы или таблица игроков.");
    }
    const bootlegger = center.querySelector<HTMLElement>("[data-bootlegger]");
    const pageRect = nightPage.getBoundingClientRect();
    const tableRect = tableImage.getBoundingClientRect();
    const tolerance = 0.6;
    const gap = 3 * 96 / 25.4;
    const describeElement = (element: Element) => element.getAttribute("class") ?? element.tagName;
    const insidePage = (rect: DOMRect) => rect.left >= pageRect.left - tolerance && rect.right <= pageRect.right + tolerance &&
      rect.top >= pageRect.top - tolerance && rect.bottom <= pageRect.bottom + tolerance;
    const intersect = (first: DOMRect, second: DOMRect, spacing = 0) => {
      return first.left < second.right + spacing - tolerance && first.right > second.left - spacing + tolerance &&
        first.top < second.bottom + spacing - tolerance && first.bottom > second.top - spacing + tolerance;
    };
    const obstacles = Array.from(nightPage.querySelectorAll(
      ".night-page-header, .night-order-row, .night-order-row img, .night-order-row svg, " +
      ".night-side-heading, .night-bootlegger, .night-jinxes, .jinx-item img",
    )).filter((element) => {
      const rect = element.getBoundingClientRect();
      return rect.width > 0 && rect.height > 0;
    });
    const sideElements = Array.from(nightPage.querySelectorAll(".night-order-row, .night-order-row img, .night-side-heading"));
    const centerElements = Array.from(center.querySelectorAll("h2, p, .jinx-icons img"));
    const paragraphRects = Array.from(bootlegger?.querySelectorAll("p") ?? [], (element) => element.getBoundingClientRect());
    return {
      firstSection: center.firstElementChild?.className,
      layoutTop: layout.getBoundingClientRect().top,
      jinxTop: jinxes.getBoundingClientRect().top,
      jinxHeadingTop: jinxHeading.getBoundingClientRect().top,
      jinxPaddingTop: Number.parseFloat(getComputedStyle(jinxes).paddingTop),
      jinxCount: jinxes.querySelectorAll(".jinx-item").length,
      bootleggerBottom: bootlegger?.getBoundingClientRect().bottom ?? null,
      tableState: table.dataset.fitState,
      tableWidth: tableRect.width,
      tableInsidePage: insidePage(tableRect),
      tableCollisions: obstacles.filter((element) => intersect(tableRect, element.getBoundingClientRect(), gap)).map(describeElement),
      outsidePage: [...obstacles, ...centerElements].filter((element) => !insidePage(element.getBoundingClientRect())).map(describeElement),
      sideCollisions: centerElements.filter((element) => {
        return sideElements.some((side) => intersect(element.getBoundingClientRect(), side.getBoundingClientRect()));
      }).map(describeElement),
      paragraphOverlaps: paragraphRects.flatMap((rect, index) => {
        return index > 0 && intersect(paragraphRects[index - 1]!, rect) ? [index] : [];
      }),
      horizontalOverflow: nightPage.scrollWidth - nightPage.clientWidth,
      verticalOverflow: nightPage.scrollHeight - nightPage.clientHeight,
    };
  });
}

function assertSafeGeometry(geometry: Awaited<ReturnType<typeof readCenterGeometry>>): void {
  expect(geometry.tableState).toBe("ready");
  expect(geometry.tableInsidePage).toBe(true);
  expect(geometry.tableCollisions, "Между таблицей и содержимым страницы должен сохраняться зазор 3 мм.").toEqual([]);
  expect(geometry.outsidePage, "Правила, сглазы и ночной порядок должны помещаться внутри страницы.").toEqual([]);
  expect(geometry.sideCollisions, "Центральная колонка не должна перекрывать ночной порядок.").toEqual([]);
  expect(geometry.horizontalOverflow).toBeLessThanOrEqual(1);
  expect(geometry.verticalOverflow).toBeLessThanOrEqual(1);
}
