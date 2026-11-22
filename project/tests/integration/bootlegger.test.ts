import { readFile } from "node:fs/promises";

import { describe, expect, it } from "vitest";
import { createMemoCompiler } from "../../src/index.js";

describe("Правила Бутлегера из The Nightmare King", () => {
  it("переносит правило из JSON в ночную страницу и заменяет базовую способность", async () => {
    const [scriptJson, catalogJson, nightOrderJson, jinxesJson] = await Promise.all([
      readFile(new URL("../../scripts_json/teensyville/The-nightmare-king.json", import.meta.url), "utf8"),
      readFile(new URL("../../catalog/roles.ru.json", import.meta.url), "utf8"),
      readFile(new URL("../../catalog/nightsheet.json", import.meta.url), "utf8"),
      readFile(new URL("../../catalog/jinxes.ru.json", import.meta.url), "utf8"),
    ]);
    const compiler = createMemoCompiler(catalogJson, { nightOrderJson, jinxesJson });
    const result = compiler.value?.compile(scriptJson, { locale: "ru" });
    const rule = "The Marionette and good players do not learn the Marionette when holding Lil' Monsta.";
    const cards = result?.value?.sections.flatMap((section) => section.cards);

    expect(compiler.diagnostics).toEqual([]);
    expect(result?.diagnostics).toEqual([]);
    expect(result?.value?.nightSheet?.bootlegger?.map((item) => item.plainText)).toEqual([rule]);
    expect(cards?.find((card) => card.id === "bootlegger")?.ability.plainText).toBe(rule);
    expect(cards?.find((card) => card.id === "sentinel")).toBeDefined();
    expect(result?.value?.nightSheet?.jinxes.length).toBeGreaterThan(0);
  });
});
