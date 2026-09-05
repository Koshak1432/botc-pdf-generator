import { describe, expect, it } from "vitest";

import {
  DiagnosticCodes,
  createMemoCompiler,
  emptyMetadata,
  importScriptJson,
  type PlayerMemo,
} from "../../src/index.js";

const BASE_ABILITY = "Вы можете изменить правила игры.";
const LOCALIZED_ABILITY = "Рассказчик может изменить правила игры.";

function createCompiler(includeNightSheet = true) {
  const result = createMemoCompiler(
    JSON.stringify([
      { id: "soldier", name: "Солдат", team: "townsfolk", ability: "Вы защищены от демона." },
      { id: "sentinel", name: "Часовой", team: "fabled", ability: "Состав игры может измениться." },
      {
        id: "bootlegger",
        name: "Бутлегер",
        team: "loric",
        ability: BASE_ABILITY,
        translations: { ru: { name: "Бутлегер", ability: LOCALIZED_ABILITY } },
      },
    ]),
    includeNightSheet
      ? { nightOrderJson: JSON.stringify({ firstNight: ["dusk", "dawn"], otherNight: ["dusk", "dawn"] }), jinxesJson: "[]" }
      : {},
  );
  if (result.value === null) throw new Error("Не удалось создать компилятор для проверки Бутлегера.");
  return result.value;
}

function bootleggerCard(memo: PlayerMemo | null | undefined) {
  return memo?.sections.flatMap((section) => section.cards).find((card) => card.id === "bootlegger");
}

describe("Импорт правил Бутлегера", () => {
  it("сохраняет все правила и разметку в порядке JSON", () => {
    const rules = ["  [b]Первое[/b] правило.  ", "[color=#123456]Второе[/color] правило."];
    const result = importScriptJson(JSON.stringify([{ id: "_meta", name: "Правила", bootlegger: rules }, "bootlegger"]));

    expect(result.diagnostics).toEqual([]);
    expect(result.value?.metadata.bootlegger).toEqual(rules);
  });

  it("возвращает пустой массив без метаданных, без поля или при пустом массиве", () => {
    expect(emptyMetadata().bootlegger).toEqual([]);
    for (const script of [
      ["bootlegger"],
      [{ id: "_meta", name: "Правила" }, "bootlegger"],
      [{ id: "_meta", name: "Правила", bootlegger: [] }, "bootlegger"],
    ]) {
      const result = importScriptJson(JSON.stringify(script));
      expect(result.diagnostics).toEqual([]);
      expect(result.value?.metadata.bootlegger).toEqual([]);
    }
  });

  it.each([null, "Правило", 42, {}, true])("отклоняет значение %j вместо массива с точным указателем", (bootlegger) => {
    const result = importScriptJson(
      JSON.stringify(["soldier", { id: "_meta", name: "Правила", bootlegger }]), "script.json",
    );

    expect(result.value?.metadata.bootlegger).toEqual([]);
    expect(result.diagnostics).toEqual([
      expect.objectContaining({
        code: DiagnosticCodes.SCRIPT_META_INVALID,
        severity: "error",
        location: { source: "script.json", jsonPointer: "/1/bootlegger" },
      }),
    ]);
  });

  it("отклоняет пустые строки и значения других типов, сохраняя допустимые правила", () => {
    const result = importScriptJson(
      JSON.stringify([{ id: "_meta", name: "Правила", bootlegger: ["Первое", "", " \n ", null, 42, {}, [], "Второе"] }]),
      "script.json",
    );

    expect(result.value?.metadata.bootlegger).toEqual(["Первое", "Второе"]);
    expect(result.diagnostics.map((item) => [item.code, item.location?.jsonPointer])).toEqual(
      [1, 2, 3, 4, 5, 6].map((index) => [DiagnosticCodes.SCRIPT_META_INVALID, `/0/bootlegger/${index}`]),
    );
  });
});

describe("Правила Бутлегера в памятке", () => {
  it("заменяет базовую способность всеми правилами, сохраняет разметку и порядок ролей", () => {
    const compiler = createCompiler();
    const rules = ["[b]Первое[/b] правило.", "[color=#123abc]Второе[/color] правило."];
    const roles = ["bootlegger", "soldier", "sentinel"];
    const result = compiler.compile(JSON.stringify([{ id: "_meta", name: "Правила", bootlegger: rules }, ...roles]), {
      overrides: { bootlegger: { nameMarkup: "[b]Бутлегер[/b]", abilityMarkup: "Переопределение.", image: "bootlegger.webp" } },
    });
    const baseline = compiler.compile(JSON.stringify(roles));
    const card = bootleggerCard(result.value);

    expect(result.diagnostics).toEqual([]);
    expect(result.value?.nightSheet?.bootlegger?.map((rule) => rule.plainText)).toEqual(["Первое правило.", "Второе правило."]);
    expect(result.value?.nightSheet?.bootlegger?.[0]?.runs[0]).toEqual({
      text: "Первое", style: { bold: true, color: null },
    });
    expect(result.value?.nightSheet?.bootlegger?.[1]?.runs[0]).toEqual({
      text: "Второе", style: { bold: false, color: "#123ABC" },
    });
    expect(card?.ability.plainText).toBe("Первое правило.\nВторое правило.");
    expect(card?.ability.runs.some((run) => run.style.color === "#123ABC")).toBe(true);
    expect(card?.name.runs[0]?.style.bold).toBe(true);
    expect(card?.image).toBe("bootlegger.webp");
    expect(result.value?.sections.map((section) => [section.team, section.cards.map((item) => item.id)])).toEqual(
      baseline.value?.sections.map((section) => [section.team, section.cards.map((item) => item.id)]),
    );
  });

  it("сохраняет пользовательские правила в карточке без ночной страницы", () => {
    const result = createCompiler(false).compile(JSON.stringify([
      { id: "_meta", name: "Правила", bootlegger: ["[b]Первое[/b] правило.", "Второе правило."] }, "bootlegger",
    ]));

    expect(result.diagnostics).toEqual([]);
    expect(result.value?.nightSheet).toBeNull();
    expect(bootleggerCard(result.value)?.ability.plainText).toBe("Первое правило.\nВторое правило.");
    expect(bootleggerCard(result.value)?.ability.runs[0]?.style.bold).toBe(true);
  });

  it("использует базовое локализованное описание при отсутствии правил", () => {
    const compiler = createCompiler();
    for (const script of [
      ["bootlegger"],
      [{ id: "_meta", name: "Правила", bootlegger: [] }, "bootlegger"],
    ]) {
      const result = compiler.compile(JSON.stringify(script), { locale: "ru" });
      expect(result.diagnostics).toEqual([]);
      expect(result.value?.nightSheet?.bootlegger?.map((rule) => rule.plainText)).toEqual([LOCALIZED_ABILITY]);
      expect(bootleggerCard(result.value)?.ability.plainText).toBe(LOCALIZED_ABILITY);
    }
  });

  it("не добавляет правила или диагностику разметки без роли Бутлегера", () => {
    const result = createCompiler().compile(JSON.stringify([
      { id: "_meta", name: "Правила", bootlegger: ["[b]Неиспользуемое правило."] }, "soldier",
    ]));

    expect(result.diagnostics).toEqual([]);
    expect(result.value?.nightSheet?.bootlegger).toEqual([]);
    expect(bootleggerCard(result.value)).toBeUndefined();
  });

  it("сообщает об ошибке разметки правила один раз", () => {
    const result = createCompiler().compile(JSON.stringify([
      { id: "_meta", name: "Правила", bootlegger: ["Первое правило.", "[b]Незакрытое правило."] }, "bootlegger",
    ]));

    expect(result.diagnostics).toHaveLength(1);
    expect(result.diagnostics[0]).toMatchObject({
      code: DiagnosticCodes.MARKUP_UNCLOSED_TAG,
      location: { source: "_meta/bootlegger/1" },
    });
  });
});
