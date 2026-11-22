import { beforeEach, describe, expect, it, vi } from "vitest";
import { createMemoCompiler } from "../../src/core/compiler.js";
import { renderPdfFromHtml } from "../../src/render/pdf.js";
import { generateMemoDownloads } from "../../src/web/generator.js";

vi.mock("../../src/render/pdf.js", () => ({ renderPdfFromHtml: vi.fn() }));

const { value: compiler } = createMemoCompiler(
  JSON.stringify([
    {
      id: "soldier",
      name: "Soldier",
      team: "townsfolk",
      ability: "You are safe from the Demon.",
    },
  ]),
  {
    nightOrderJson: JSON.stringify({
      firstNight: ["dusk", "dawn"],
      otherNight: ["dusk", "dawn"],
    }),
  },
);
if (compiler === null)
  throw new Error("Не удалось подготовить тестовый каталог.");

const printPdf = vi.mocked(renderPdfFromHtml);

describe("Генерация памяток для скачивания", () => {
  beforeEach(() => {
    printPdf.mockReset();
    printPdf.mockResolvedValue({
      data: Buffer.from("%PDF-fixture"),
      pageCount: 1,
      failedImageRequests: [],
    });
  });

  it.each([
    { issue: "некорректный JSON", script: "[", detail: "Invalid script JSON" },
    {
      issue: "неизвестная роль",
      script: '["unknown-role"]',
      detail: "/0 Role 'unknown-role'",
    },
  ])("отклоняет сценарий с ошибкой «$issue»", async ({ script, detail }) => {
    const result = await generateMemoDownloads(compiler, script, "script.json");

    expect(result).toContain("Проверьте JSON сценария.");
    expect(result).toContain(detail);
    expect(printPdf).not.toHaveBeenCalled();
  });

  it("возвращает оба PDF с именами сценария", async () => {
    const result = await generateMemoDownloads(
      compiler,
      JSON.stringify([
        {
          id: "_meta",
          name: "Ночной: патруль",
          logo: "https://example.invalid/logo.png",
        },
        "soldier",
      ]),
      "script.json",
    );
    if (typeof result === "string") throw new Error(result);
    const downloads = await new Response(result).formData();

    const players = downloads.get("players");
    const storyteller = downloads.get("storyteller");
    if (!(players instanceof File) || !(storyteller instanceof File)) {
      throw new Error("Ожидались два файла для скачивания.");
    }
    expect(players.name).toBe("Ночной- патруль.pdf");
    expect(storyteller.name).toBe("Ночной- патруль.storyteller.pdf");
    expect(players.type).toBe("application/pdf");
    expect(storyteller.type).toBe("application/pdf");
    expect(await players.text()).toBe("%PDF-fixture");
    expect(await storyteller.text()).toBe("%PDF-fixture");
    expect(printPdf).toHaveBeenCalledTimes(2);
    expect(printPdf.mock.calls[0]?.[0]).toMatch(
      /class="role-icon"[^>]*><img[^>]*src="data:image\/webp;base64,/,
    );
    expect(printPdf.mock.calls[0]?.[0]).not.toContain(
      "https://example.invalid/logo.png",
    );
    expect(printPdf.mock.calls[1]?.[0]).not.toContain(
      "https://example.invalid/logo.png",
    );
  });

  it("использует имя файла при отсутствии заголовка", async () => {
    const result = await generateMemoDownloads(
      compiler,
      '["soldier"]',
      "Мой сценарий.json",
    );
    if (typeof result === "string") throw new Error(result);

    expect(result.get("players")).toMatchObject({ name: "Мой сценарий.pdf" });
    expect(result.get("storyteller")).toMatchObject({
      name: "Мой сценарий.storyteller.pdf",
    });
  });
});
