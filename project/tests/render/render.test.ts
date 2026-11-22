import { readFile } from "node:fs/promises";
import path from "node:path";
import { load } from "cheerio";
import { beforeAll, describe, expect, it } from "vitest";
import {
  createMemoCompiler,
  paginateMemo,
  parseRichText,
  plainRichText,
  renderMemoHtml,
  type PlayerMemo,
} from "../../src/index.js";

describe("HTML renderer", () => {
  let memo: PlayerMemo;

  beforeAll(async () => {
    const fixtureRoot = path.resolve(import.meta.dirname, "../../examples");
    const [scriptJson, catalogJson] = await Promise.all([
      readFile(path.join(fixtureRoot, "a-grimm-chorus.json"), "utf8"),
      readFile(path.join(fixtureRoot, "a-grimm-chorus-roles.ru.json"), "utf8"),
    ]);
    const compiler = createMemoCompiler(catalogJson).value;
    const compiled = compiler?.compile(scriptJson, { locale: "ru" }).value;
    if (compiled === null || compiled === undefined)
      throw new Error("Fixture did not compile");
    memo = compiled;
  });

  it("renders all 25 Russian roles on one explicit A4 page", async () => {
    const html = await renderMemoHtml(memo, { locale: "ru" });

    expect(load(html)(".role-card[data-role-id]")).toHaveLength(25);
    expect(html.match(/<article class="memo-page /g) ?? []).toHaveLength(1);
    expect(html.match(/class="section-column"/g) ?? []).toHaveLength(8);
    expect(html).toContain("Генерал");
    expect(html).toContain("Ягатрёп");
    expect(html).toContain('font-family: "Memo Dumbledor"');
    expect(html).toContain("data:font/ttf;base64,");
    expect(html).not.toContain("Memo Fraktur");
    expect(html).not.toContain("role-icon__fallback");
    expect(html.indexOf('data-role-id="amnesiac"')).toBeLessThan(
      html.indexOf('data-role-id="nightwatchman"'),
    );
    expect(html).not.toContain("1 / 2");
  });

  it("escapes user text and only emits safe rich-text elements", async () => {
    const dangerous = "<script>alert('xss')</script>";
    const rich = parseRichText(
      `[b]Bold[/b] [color=#3297F4]good[/color] [color=#8C0E12]evil[/color] [color=#C00000]other[/color] ${dangerous}`,
    ).value;
    if (rich === null) throw new Error("Rich text did not parse");
    const customMemo: PlayerMemo = {
      title: dangerous,
      author: "Hidden Author",
      logo: null,
      background: null,
      nightSheet: null,
      sections: [
        {
          team: "townsfolk",
          cards: [
            {
              id: "safe",
              team: "townsfolk",
              name: plainRichText(dangerous),
              ability: rich,
              image: null,
              edition: null,
            },
          ],
        },
      ],
    };
    const html = await renderMemoHtml(customMemo);

    expect(html).not.toContain("<script>alert");
    expect(html).toContain("&lt;script&gt;alert");
    expect(html).toContain("<strong>Bold</strong>");
    expect(html).not.toContain("Hidden Author");
    expect(html).not.toContain('class="author"');
    expect(html).toContain("--role-good-highlight-color: #146bb3");
    expect(html).toContain("--role-evil-highlight-color: #991c35");
    expect(html).toContain("color:var(--role-good-highlight-color)");
    expect(html).toContain("color:var(--role-evil-highlight-color)");
    expect(html).toContain("color:#C00000");
  });

  it("appends a mirrored night sheet with ordered roles and active jinxes", async () => {
    const richReason = parseRichText(
      "[color=#3297F4]Дамочка[/color] и [color=#8C0E12]Крёстный отец[/color] взаимодействуют.",
    ).value;
    if (richReason === null) throw new Error("Jinx text did not parse");
    const icon =
      "data:image/svg+xml;base64," +
      Buffer.from(
        '<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 10 10">' +
          '<circle cx="5" cy="5" r="4" fill="#777"/></svg>',
      ).toString("base64");
    const nightMemo: PlayerMemo = {
      title: "Ночной тест",
      author: "Hidden Author",
      logo: null,
      background: null,
      sections: [
        {
          team: "townsfolk",
          cards: [
            {
              id: "amnesiac",
              team: "townsfolk",
              name: plainRichText("Амнезиак"),
              ability: plainRichText("Способность"),
              image: icon,
              edition: null,
            },
          ],
        },
        {
          team: "outsider",
          cards: [
            {
              id: "damsel",
              team: "outsider",
              name: plainRichText("Дамочка"),
              ability: plainRichText("Способность"),
              image: icon,
              edition: null,
            },
          ],
        },
        {
          team: "minion",
          cards: [
            {
              id: "godfather",
              team: "minion",
              name: plainRichText("Крёстный отец"),
              ability: plainRichText("Способность"),
              image: icon,
              edition: null,
            },
          ],
        },
        {
          team: "traveller",
          cards: [
            {
              id: "scapegoat",
              team: "traveller",
              name: plainRichText("Козёл отпущения"),
              ability: plainRichText("Способность"),
              image: icon,
              edition: null,
            },
          ],
        },
      ],
      nightSheet: {
        firstNight: [
          { kind: "marker", id: "dusk" },
          { kind: "marker", id: "minioninfo" },
          { kind: "marker", id: "demoninfo" },
          { kind: "role", roleId: "amnesiac" },
          { kind: "marker", id: "dawn" },
        ],
        otherNight: [
          { kind: "marker", id: "dusk" },
          { kind: "role", roleId: "godfather" },
          { kind: "role", roleId: "damsel" },
          { kind: "role", roleId: "amnesiac" },
          { kind: "marker", id: "dawn" },
        ],
        jinxes: [
          {
            roleIds: ["damsel", "godfather"],
            reason: richReason,
          },
        ],
      },
    };

    const html = await renderMemoHtml(nightMemo, { locale: "ru-RU" });
    const $ = load(html);
    const nightPage = $("[data-night-sheet]");

    expect($(".memo-page")).toHaveLength(2);
    expect(nightPage).toHaveLength(1);
    expect(nightPage.find("[data-overflow-watch]")).toHaveLength(3);
    expect(nightPage.find(".night-player-table img")).toHaveLength(1);
    expect(nightPage.find(".night-player-table img").attr("src")).toMatch(
      /^data:image\/png;base64,/,
    );
    expect(
      nightPage.find(".night-side--first .night-side-heading").text(),
    ).toBe("Первая ночь");
    expect(
      nightPage.find(".night-side--other .night-side-heading").text(),
    ).toBe("Последующие ночи");
    expect(
      nightPage
        .find('[data-night-list="otherNight"] [data-night-role-id]')
        .map((_, element) => $(element).attr("data-night-role-id"))
        .get(),
    ).toEqual(["godfather", "damsel", "amnesiac"]);
    expect(
      nightPage
        .find('[data-night-list="firstNight"] [data-marker-id]')
        .map((_, element) => $(element).attr("data-marker-id"))
        .get(),
    ).toEqual(["dusk", "minioninfo", "demoninfo", "dawn"]);
    expect(
      nightPage
        .find('[data-night-role-id="amnesiac"]')
        .first()
        .hasClass("team-townsfolk"),
    ).toBe(true);
    expect(
      nightPage
        .find('[data-night-role-id="damsel"]')
        .first()
        .hasClass("team-outsider"),
    ).toBe(true);
    expect(
      nightPage
        .find('[data-night-role-id="godfather"]')
        .first()
        .hasClass("team-minion"),
    ).toBe(true);
    expect(
      nightPage.find('[data-marker-id="dusk"]').first().attr("class"),
    ).not.toContain("team-");

    const minionMarker = nightPage.find(
      '[data-marker-id="minioninfo"] .night-marker-icon img',
    );
    const demonMarker = nightPage.find(
      '[data-marker-id="demoninfo"] .night-marker-icon img',
    );
    expect(minionMarker).toHaveLength(1);
    expect(minionMarker.attr("src")).toMatch(/^data:image\/webp;base64,/);
    expect(demonMarker).toHaveLength(1);
    expect(demonMarker.attr("src")).toMatch(/^data:image\/webp;base64,/);
    expect(
      nightPage.find('[data-marker-id="dusk"] .night-marker-icon svg'),
    ).toHaveLength(2);
    expect(
      nightPage.find('[data-marker-id="dawn"] .night-marker-icon svg'),
    ).toHaveLength(2);
    expect(
      nightPage.find('[data-marker-id="dusk"] .night-marker-icon img'),
    ).toHaveLength(0);
    expect(html).toMatch(
      /\.night-team-stroke\s*\{[^}]*height:\s*6\.7mm;[^}]*background:\s*var\(--team, #171717\);/s,
    );
    expect(html).not.toMatch(/\.night-order-row\s*\{[^}]*--team:/s);
    expect(html).toMatch(
      /\.night-order-row--marker \.night-order-name\s*\{[^}]*color:\s*#171717;[^}]*font-weight:\s*400;/s,
    );
    expect(html).toMatch(/\.night-jinxes > h2\s*\{[^}]*font-size:\s*15pt;/s);
    expect(html).toMatch(
      /\.jinx-item\s*\{[^}]*grid-template-columns:\s*21mm minmax\(0, 1fr\);[^}]*column-gap:\s*0\.4mm;/s,
    );
    expect(html).toMatch(
      /\.jinx-icons\s*\{[^}]*grid-template-columns:\s*9\.5mm 11\.5mm;[^}]*width:\s*21mm;/s,
    );
    expect(html).toMatch(
      /\.jinx-icons \.night-role-icon\s*\{[^}]*width:\s*11\.5mm;[^}]*height:\s*11\.5mm;/s,
    );
    expect(html).toMatch(
      /\.jinx-icons \.night-role-icon:first-child,[^}]*\{[^}]*width:\s*14mm;[^}]*height:\s*14mm;/s,
    );
    expect(html).toMatch(/\.jinx-item p\s*\{[^}]*font-size:\s*12pt;/s);
    expect(
      nightPage.find('[data-jinx-role-ids="damsel,godfather"]'),
    ).toHaveLength(1);
    expect(nightPage.text()).toContain("Сглазы");
    expect(nightPage.text()).toContain("Дамочка");
    expect(nightPage.text()).not.toContain("Козёл отпущения");
    expect(nightPage.text()).not.toContain("Рекомендуемые странники");
    expect(nightPage.find(".page-footer,.page-number,.author")).toHaveLength(0);
    expect(nightPage.html()).toContain(
      "color:var(--role-good-highlight-color)",
    );
    expect(nightPage.html()).toContain(
      "color:var(--role-evil-highlight-color)",
    );

    const english = load(await renderMemoHtml(nightMemo, { locale: "en" }));
    expect(english(".night-side--first .night-side-heading").text()).toBe(
      "First night",
    );
    expect(
      english('[data-marker-id="dusk"] .night-order-name').first().text(),
    ).toBe("Dusk");
  });
  it("uses the short Russian section labels and a centered-only legend", async () => {
    const html = await renderMemoHtml(memo, { locale: "ru-RU" });
    const $ = load(html);
    const footer = $(".page-footer");

    expect(html).toContain("Горожане");
    expect(html).toContain("Изгои");
    expect(html).toContain("Приспешники");
    expect(footer.children()).toHaveLength(1);
    expect(footer.find(".night-legend").text()).toBe("* Не в первую ночь");
    expect(footer.find(".page-number")).toHaveLength(0);
    expect(footer.text()).not.toContain(memo.title ?? "");
    expect(html).not.toContain("Создано BOTC PDF");
  });

  it("does not render page numbers in multi-page footers", async () => {
    const html = await renderMemoHtml(memo, {
      locale: "ru-RU",
      cardsPerPage: 12,
    });
    const $ = load(html);

    expect($(".page-footer")).toHaveLength(3);
    expect(
      $(".page-footer .night-legend")
        .map((_, element) => $(element).text())
        .get(),
    ).toEqual([
      "* Не в первую ночь",
      "* Не в первую ночь",
      "* Не в первую ночь",
    ]);
    expect($(".page-footer .page-number")).toHaveLength(0);
    expect(html).not.toContain("1 / 3");
    expect(html).not.toContain("Создано BOTC PDF");
  });
});

describe("pagination", () => {
  it("preserves section order and marks split sections as continued", () => {
    const cards = Array.from({ length: 5 }, (_, index) => ({
      id: `role-${index}`,
      team: "townsfolk" as const,
      name: plainRichText(`Role ${index}`),
      ability: plainRichText("You are a role."),
      image: null,
      edition: null,
    }));
    const memo: PlayerMemo = {
      title: "Test",
      author: null,
      logo: null,
      background: null,
      nightSheet: null,
      sections: [{ team: "townsfolk", cards }],
    };

    const pages = paginateMemo(memo, 3);

    expect(pages.map((page) => page.roleCount)).toEqual([3, 2]);
    expect(pages[0]?.sections[0]?.continued).toBe(false);
    expect(pages[1]?.sections[0]?.continued).toBe(true);
  });
});
