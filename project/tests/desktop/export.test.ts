import { mkdtemp, readFile, readdir, rm, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import path from "node:path";
import { afterEach, beforeEach, describe, expect, it } from "vitest";
import { saveMemoDownloads } from "../../src/desktop/export.js";

describe("Сохранение PDF в мастере Windows", () => {
  let folder: string;

  beforeEach(async () => {
    folder = await mkdtemp(path.join(tmpdir(), "botc-desktop-"));
  });

  afterEach(async () => {
    await rm(folder, { recursive: true, force: true });
  });

  it("сохраняет обе памятки с русскими именами", async () => {
    const files = await saveMemoDownloads(createDownloads("Сценарий"), folder);

    expect(files).toEqual([
      path.join(folder, "Сценарий.pdf"),
      path.join(folder, "Сценарий.storyteller.pdf"),
    ]);
    expect(
      await Promise.all(files.map((file) => readFile(file, "utf8"))),
    ).toEqual(["%PDF-players", "%PDF-storyteller"]);
  });

  it("сохраняет старый PDF при конфликте имён @allure.label.feature:Сохранение", async () => {
    const existing = path.join(folder, "Сценарий.storyteller.pdf");
    await writeFile(existing, "Готовая памятка", "utf8");

    await expect(
      saveMemoDownloads(createDownloads("Сценарий"), folder),
    ).rejects.toThrow("В этой папке уже есть PDF с таким именем.");
    expect(await readdir(folder)).toEqual(["Сценарий.storyteller.pdf"]);
    expect(await readFile(existing, "utf8")).toBe("Готовая памятка");
  });

  it("сохраняет разные сценарии с одинаковым названием @allure.label.feature:ПакетнаяГенерация", async () => {
    await saveMemoDownloads(
      createDownloads("Сценарий", "Первый"),
      folder,
      true,
    );
    await saveMemoDownloads(
      createDownloads("Сценарий", "Второй"),
      folder,
      true,
    );
    const files = await saveMemoDownloads(
      createDownloads("Сценарий", "Третий"),
      folder,
      true,
    );

    expect(files.map((file) => path.basename(file))).toEqual([
      "Сценарий (3).pdf",
      "Сценарий (3).storyteller.pdf",
    ]);
    expect(await readFile(path.join(folder, "Сценарий.pdf"), "utf8")).toBe(
      "%PDF-playersПервый",
    );
    expect(await readFile(path.join(folder, "Сценарий (2).pdf"), "utf8")).toBe(
      "%PDF-playersВторой",
    );
  });

  it("добавляет общий номер при конфликте только памятки рассказчика @allure.label.feature:ПакетнаяГенерация", async () => {
    const stem = "Сценарий.storyteller";
    const existing = path.join(folder, `${stem}.storyteller.pdf`);
    await writeFile(existing, "Готовая памятка", "utf8");

    const files = await saveMemoDownloads(createDownloads(stem), folder, true);

    expect(files.map((file) => path.basename(file))).toEqual([
      `${stem} (2).pdf`,
      `${stem} (2).storyteller.pdf`,
    ]);
    expect((await readdir(folder)).sort()).toEqual(
      [...files, existing].map((file) => path.basename(file)).sort(),
    );
    expect(await readFile(existing, "utf8")).toBe("Готовая памятка");
  });

  it("заменяет зарезервированные имена Windows", async () => {
    const files = await saveMemoDownloads(createDownloads("CON"), folder);

    expect(files.map((file) => path.basename(file))).toEqual([
      "BOTC-CON.pdf",
      "BOTC-CON.storyteller.pdf",
    ]);
  });
});

function createDownloads(stem: string, content: string = ""): FormData {
  const downloads = new FormData();
  downloads.append(
    "players",
    new Blob(["%PDF-players", content]),
    `${stem}.pdf`,
  );
  downloads.append(
    "storyteller",
    new Blob(["%PDF-storyteller", content]),
    `${stem}.storyteller.pdf`,
  );
  return downloads;
}
