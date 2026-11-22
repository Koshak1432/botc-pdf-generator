import { load } from "cheerio";
import { describe, expect, it } from "vitest";
import { createMemoCompiler, hasErrors, paginateMemo, renderMemoHtml, type PlayerMemo } from "../../src/index.js";

const basicAbility = "В сценарии присутствуют особые роли или правила.";
const catalogJson = JSON.stringify([
  { id: "soldier", name: "Солдат", team: "townsfolk", ability: "Вы защищены от Демона." },
  { id: "bootlegger", name: "Бутлегер", team: "loric", ability: basicAbility },
]);

function compileMemo(rules: readonly string[], includeBootlegger = true, includeNightSheet = true): PlayerMemo {
  const nightOptions = includeNightSheet
    ? {
        nightOrderJson: JSON.stringify({ firstNight: ["dusk", "dawn"], otherNight: ["dusk", "dawn"] }),
        jinxesJson: "[]",
      }
    : {};
  const compiler = createMemoCompiler(catalogJson, nightOptions).value;
  const result = compiler?.compile(
    JSON.stringify([
      { id: "_meta", name: "Проверка Бутлегера", bootlegger: rules },
      "soldier",
      ...(includeBootlegger ? ["bootlegger"] : []),
    ]),
  );
  if (result?.value === null || result?.value === undefined || hasErrors(result)) {
    throw new Error("Не удалось собрать сценарий для проверки Бутлегера.");
  }
  return result.value;
}

describe("Бутлегер на ночной странице", () => {
  it("показывает все правила над сглазами и убирает карточку, пустую команду и лишнюю страницу", async () => {
    const rules = ["Первое особое правило.", "Второе особое правило."];
    const memo = compileMemo(rules);
    const pages = paginateMemo(memo, 1);
    const $ = load(await renderMemoHtml(memo, { cardsPerPage: 1 }));

    expect(pages).toHaveLength(1);
    expect(pages[0]?.roleCount).toBe(1);
    expect(pages[0]?.sections.map((section) => section.team)).toEqual(["townsfolk"]);
    expect($(".memo-page")).toHaveLength(2);
    expect($('[data-role-id="bootlegger"]')).toHaveLength(0);
    expect($("[data-bootlegger] h2").text()).toBe("Бутлегер");
    expect(
      $("[data-bootlegger] p")
        .map((_, element) => $(element).text())
        .get(),
    ).toEqual(rules);
    expect($("[data-bootlegger]").parent().attr("class")).toBe("night-center");
    expect($("[data-bootlegger]").next().is("[data-jinxes]")).toBe(true);
    expect($("[data-bootlegger]").closest(".memo-page").index()).toBe(1);
    expect($("body").text()).not.toContain(basicAbility);
  });

  it("сохраняет безопасное форматирование и экранирует HTML в правилах", async () => {
    const rule = '[b]Важно[/b]: [color=#3297F4]добрый[/color] игрок. <img src=x onerror="alert(1)">';
    const $ = load(await renderMemoHtml(compileMemo([rule])));
    const block = $("[data-bootlegger]");

    expect(block.find("strong").text()).toBe("Важно");
    expect(block.find("span[style]").attr("style")).toBe("color:var(--role-good-highlight-color)");
    expect(block.find("img,script")).toHaveLength(0);
    expect(block.text()).toContain('<img src=x onerror="alert(1)">');
  });

  it("не создаёт блок и шапку Бутлегера без роли даже при заполненных метаданных", async () => {
    const $ = load(await renderMemoHtml(compileMemo(["Лишнее правило."], false)));

    expect($("[data-bootlegger]")).toHaveLength(0);
    expect($(".night-center").children()).toHaveLength(1);
    expect($(".night-center").children().first().is("[data-jinxes]")).toBe(true);
    expect($(".night-center h2").text()).not.toContain("Бутлегер");
    expect($("body").text()).not.toContain("Лишнее правило.");
  });

  it("оставляет пользовательское описание в карточке при отсутствии ночной страницы", async () => {
    const memo = compileMemo(["Первое правило.", "Второе правило."], true, false);
    const $ = load(await renderMemoHtml(memo));

    expect($("[data-bootlegger], [data-night-sheet]")).toHaveLength(0);
    expect($('[data-role-id="bootlegger"] .role-ability').text()).toBe("Первое правило.\nВторое правило.");
    expect(paginateMemo(memo, 1)).toHaveLength(2);
  });

  it("переносит обычное описание над сглазами, если собственных правил нет", async () => {
    const $ = load(await renderMemoHtml(compileMemo([])));

    expect($("[data-bootlegger] p").text()).toBe(basicAbility);
    expect($('[data-role-id="bootlegger"]')).toHaveLength(0);
  });
});
