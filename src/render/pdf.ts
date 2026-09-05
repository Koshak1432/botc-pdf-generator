import { mkdir, stat, writeFile } from "node:fs/promises";
import path from "node:path";
import { chromium, type Browser } from "playwright";

export interface GeneratePdfOptions {
  readonly imageTimeoutMs?: number;
  readonly navigationTimeoutMs?: number;
}

export interface PdfGenerationReport {
  readonly outputPath: string;
  readonly pageCount: number;
  readonly bytes: number;
  readonly failedImageRequests: readonly string[];
}

export class PdfLayoutError extends Error {
  readonly pages: readonly number[];

  constructor(pages: readonly number[]) {
    super(
      `Содержимое не помещается на страницах: ${pages.join(", ")}. ` +
      "Уменьшите количество ролей на странице параметром --cards-per-page или сократите текст.",
    );
    this.name = "PdfLayoutError";
    this.pages = pages;
  }
}

export async function generatePdfFromHtml(
  html: string,
  outputPath: string,
  options: GeneratePdfOptions = {},
): Promise<PdfGenerationReport> {
  const absoluteOutput = path.resolve(outputPath);
  await mkdir(path.dirname(absoluteOutput), { recursive: true });
  const browser = await launchChromium();
  const failedImageRequests: string[] = [];
  try {
    const page = await browser.newPage({
      viewport: { width: 1120, height: 1584 },
      deviceScaleFactor: 1,
    });
    page.setDefaultNavigationTimeout(options.navigationTimeoutMs ?? 30_000);
    page.on("requestfailed", (request) => {
      if (request.resourceType() === "image")
        failedImageRequests.push(request.url());
    });
    await page.emulateMedia({ media: "print" });
    await page.setContent(html, {
      waitUntil: "load",
      timeout: options.navigationTimeoutMs ?? 30_000,
    });
    await page.evaluate(async (timeoutMs) => {
      await document.fonts.ready;
      const images = Array.from(document.images);
      const loaded = Promise.all(
        images.map(async (image) => {
          if (!image.complete) {
            await new Promise<void>((resolve) => {
              image.addEventListener("load", () => resolve(), { once: true });
              image.addEventListener("error", () => resolve(), { once: true });
            });
          }
          await image.decode().catch(() => undefined);
        }),
      );
      await Promise.race([
        loaded,
        new Promise<void>((resolve) => setTimeout(resolve, timeoutMs)),
      ]);
    }, options.imageTimeoutMs ?? 12_000);

    const roleFailures = await page.evaluate(() => {
      document.dispatchEvent(new Event("botc:fit-role-pages"));
      return Array.from(document.querySelectorAll(".memo-page"))
        .map((element, index) => ({ page: index + 1, state: element.getAttribute("data-role-fit-state") }))
        .filter(({ state }) => state !== null && state !== "ready")
        .map(({ page }) => page);
    });
    if (roleFailures.length > 0) throw new PdfLayoutError(roleFailures);

    const tableFailures = await page.evaluate(() => {
      document.dispatchEvent(new Event("botc:fit-night-tables"));
      return Array.from(document.querySelectorAll(".memo-page"))
        .map((element, index) => ({ page: index + 1, table: element.querySelector<HTMLElement>(".night-player-table") }))
        .filter(({ table }) => table !== null && table.dataset.fitState !== "ready")
        .map(({ page }) => page);
    });
    if (tableFailures.length > 0) {
      throw new Error(
        `Не удалось разместить таблицу количества игроков на страницах: ${tableFailures.join(", ")}. ` +
        "Уменьшите размеры ночного порядка или текста правил и сглазов; проверьте загрузку изображения таблицы.",
      );
    }

    const overflowPages = await page.evaluate(() =>
      Array.from(document.querySelectorAll<HTMLElement>(".memo-page"))
        .map((element, index) => {
          const pageRect = element.getBoundingClientRect();
          const watchedRects = Array.from(
            element.querySelectorAll<HTMLElement>("[data-overflow-watch]"),
          ).map((watched) => watched.getBoundingClientRect());
          const outsidePage = watchedRects.some(
            (rect) =>
              rect.left < pageRect.left - 2 ||
              rect.right > pageRect.right + 2 ||
              rect.top < pageRect.top - 2 ||
              rect.bottom > pageRect.bottom + 2,
          );
          const sectionsRect = element
            .querySelector<HTMLElement>(".page-sections")
            ?.getBoundingClientRect();
          const footerRect = element
            .querySelector<HTMLElement>(".page-footer")
            ?.getBoundingClientRect();
          const overlapsFooter =
            sectionsRect !== undefined &&
            footerRect !== undefined &&
            sectionsRect.bottom > footerRect.top - 4;
          const clipped =
            element.scrollWidth > element.clientWidth + 2 ||
            element.scrollHeight > element.clientHeight + 2;
          return {
            page: index + 1,
            overflowing: outsidePage || overlapsFooter || clipped,
          };
        })
        .filter((entry) => entry.overflowing)
        .map((entry) => entry.page),
    );
    if (overflowPages.length > 0) throw new PdfLayoutError(overflowPages);

    const pageCount = await page.locator(".memo-page").count();
    await page.pdf({
      path: absoluteOutput,
      format: "A4",
      printBackground: true,
      preferCSSPageSize: true,
      tagged: true,
      outline: false,
      margin: { top: "0", right: "0", bottom: "0", left: "0" },
    });
    const file = await stat(absoluteOutput);
    return {
      outputPath: absoluteOutput,
      pageCount,
      bytes: file.size,
      failedImageRequests,
    };
  } finally {
    await browser.close();
  }
}

export async function saveHtmlPreview(
  html: string,
  outputPath: string,
): Promise<string> {
  const absoluteOutput = path.resolve(outputPath);
  await mkdir(path.dirname(absoluteOutput), { recursive: true });
  await writeFile(absoluteOutput, html, "utf8");
  return absoluteOutput;
}

async function launchChromium(): Promise<Browser> {
  try {
    return await chromium.launch({ headless: true });
  } catch (error) {
    const message = error instanceof Error ? error.message : String(error);
    if (
      message.includes("Executable doesn't exist") ||
      message.includes("browserType.launch")
    ) {
      throw new Error(
        "Playwright Chromium is not installed. Run 'npm run install:browser' " +
          "in the project root and try again.",
        { cause: error },
      );
    }
    throw error;
  }
}
