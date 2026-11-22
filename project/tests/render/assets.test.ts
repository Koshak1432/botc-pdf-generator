import path from "node:path";
import { describe, expect, it } from "vitest";
import {
  materializeMemoAssets,
  plainRichText,
  type PlayerMemo,
} from "../../src/index.js";

describe("local role assets", () => {
  it("embeds an icon from an absolute assets directory without network access", async () => {
    const assetsDir = path.resolve(import.meta.dirname, "../../assets/roles");
    const memo: PlayerMemo = {
      title: "Asset test",
      author: null,
      logo: null,
      background: null,
      sections: [
        {
          team: "townsfolk",
          cards: [
            {
              id: "general",
              team: "townsfolk",
              name: plainRichText("General"),
              ability: plainRichText("Test"),
              image: "https://example.invalid/general.webp",
              edition: "carousel",
            },
          ],
        },
      ],
    };

    const result = await materializeMemoAssets(memo, {
      baseDir: import.meta.dirname,
      assetsDir,
      cacheDir: null,
      fetchRemote: false,
    });

    expect(result.warnings).toEqual([]);
    expect(result.memo.sections[0]?.cards[0]?.image).toMatch(
      /^data:image\/webp;base64,/,
    );
  });
});
