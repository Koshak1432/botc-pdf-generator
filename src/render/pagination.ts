import type { PlayerMemo, RoleCard, RoleTeam } from "../core/model.js";

export interface PageSection {
  readonly team: RoleTeam;
  readonly cards: readonly RoleCard[];
  readonly continued: boolean;
}

export interface MemoPage {
  readonly sections: readonly PageSection[];
  readonly roleCount: number;
}

export function paginateMemo(
  memo: PlayerMemo,
  cardsPerPage = 25,
): readonly MemoPage[] {
  if (!Number.isSafeInteger(cardsPerPage) || cardsPerPage < 1) {
    throw new RangeError("cardsPerPage must be a positive integer");
  }

  const pages: MutablePage[] = [{ sections: [], roleCount: 0 }];
  const bootleggerOnNightSheet = (memo.nightSheet?.bootlegger?.length ?? 0) > 0;
  let remaining = cardsPerPage;
  for (const section of memo.sections) {
    const cards = bootleggerOnNightSheet ? section.cards.filter((card) => card.id !== "bootlegger") : section.cards;
    let offset = 0;
    while (offset < cards.length) {
      if (remaining === 0) {
        pages.push({ sections: [], roleCount: 0 });
        remaining = cardsPerPage;
      }
      const count = Math.min(remaining, cards.length - offset);
      const page = pages[pages.length - 1];
      if (page === undefined) throw new Error("Pagination invariant failed");
      page.sections.push({
        team: section.team,
        cards: cards.slice(offset, offset + count),
        continued: offset > 0,
      });
      page.roleCount += count;
      offset += count;
      remaining -= count;
    }
  }

  if (pages.length === 1 && pages[0]?.roleCount === 0) {
    return [{ sections: [], roleCount: 0 }];
  }
  return pages;
}

interface MutablePage {
  readonly sections: PageSection[];
  roleCount: number;
}
