import { load } from "cheerio";
import { describe, expect, it } from "vitest";
import {
  plainRichText,
  renderStorytellerMemoHtml,
  type PlayerMemo,
  type RoleCard,
  type RoleTeam,
} from "../../src/index.js";

describe("Памятка рассказчика", () => {
  it("выводит две ночи с локализованными напоминаниями и цветами команд", async () => {
    const memo = createMemo();
    const html = await renderStorytellerMemoHtml(memo, { locale: "ru" });
    const $ = load(html);
    const pages = $(".memo-page--storyteller");

    expect(pages).toHaveLength(2);
    expect(pages.eq(0).attr("data-storyteller-night")).toBe("first");
    expect(pages.eq(1).attr("data-storyteller-night")).toBe("other");
    expect(pages.eq(0).find(".storyteller-page-subtitle").text()).toBe(
      "Памятка рассказчика - Первая ночь",
    );
    expect(pages.eq(1).find(".storyteller-page-subtitle").text()).toBe(
      "Памятка рассказчика - Последующие ночи",
    );

    const firstReminder = pages
      .eq(0)
      .find('[data-night-role-id="good-role"] .storyteller-order-reminder')
      .text();
    const otherReminder = pages
      .eq(1)
      .find('[data-night-role-id="good-role"] .storyteller-order-reminder')
      .text();
    expect(firstReminder).toContain("Первое действие");
    expect(firstReminder).toContain("Теперь вы");
    expect(firstReminder).not.toContain("ТЕПЕРЬ ВЫ");
    expect(firstReminder).not.toContain("Следующее действие");
    expect(otherReminder).toContain("Следующее действие");
    expect(otherReminder).not.toContain("Первое действие");
    expect(firstReminder).toContain("●");
    expect(firstReminder).not.toContain(":reminder:");
    expect(
      pages.eq(0).find('[data-night-role-id="good-role"] strong').text(),
    ).toBe("Теперь вы");

    expect(
      pages.find('[data-night-role-id="good-role"]').hasClass("team-townsfolk"),
    ).toBe(true);
    expect(
      pages.find('[data-night-role-id="evil-role"]').hasClass("team-minion"),
    ).toBe(true);
    expect(
      pages
        .find('[data-night-role-id="neutral-role"]')
        .hasClass("team-traveller"),
    ).toBe(true);
    expect(html).toMatch(
      /\.storyteller-order-row\.team-traveller,[^}]*--team:\s*#171717;/s,
    );
    expect(pages.eq(0).find('[data-marker-id="minioninfo"]')).toHaveLength(1);
    expect(
      pages
        .eq(0)
        .find(
          '[data-marker-id="minioninfo"] .storyteller-order-reminder strong',
        )
        .text(),
    ).toBe("Это Демон");
    expect(pages.eq(1).find('[data-marker-id="minioninfo"]')).toHaveLength(0);
  });
});

function createMemo(): PlayerMemo {
  const cards = [
    createRole("good-role", "townsfolk", "Добрая роль"),
    createRole("evil-role", "minion", "Злая роль"),
    createRole("neutral-role", "traveller", "Нейтральная роль"),
  ];
  const roleOrder = cards.map((card) => ({
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
        { kind: "marker", id: "minioninfo" },
        ...roleOrder,
        { kind: "marker", id: "dawn" },
      ],
      otherNight: [
        { kind: "marker", id: "dusk" },
        ...roleOrder,
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
    firstNightReminder: {
      plainText: "Первое действие. ТЕПЕРЬ ВЫ :reminder:",
      runs: [
        {
          text: "Первое действие. ",
          style: { bold: false, color: null },
        },
        { text: "ТЕПЕРЬ ВЫ", style: { bold: true, color: null } },
        { text: " :reminder:", style: { bold: false, color: null } },
      ],
    },
    otherNightReminder: plainRichText("Следующее действие."),
    image: null,
    edition: null,
  };
}
