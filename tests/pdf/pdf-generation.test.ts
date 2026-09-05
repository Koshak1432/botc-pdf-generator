import { readFile, rm } from "node:fs/promises";
import path from "node:path";
import { afterAll, describe, expect, it } from "vitest";
import {
  generatePdfFromHtml,
  plainRichText,
  renderMemoHtml,
  type PlayerMemo,
} from "../../src/index.js";

const outputPath = path.resolve(
  import.meta.dirname,
  "../../tmp/pdfs/botc-pdf-smoke.pdf",
);
const nightOutputPath = path.resolve(
  import.meta.dirname,
  "../../tmp/pdfs/botc-pdf-night-smoke.pdf",
);

afterAll(async () => {
  await Promise.all([
    rm(outputPath, { force: true }),
    rm(nightOutputPath, { force: true }),
  ]);
});

describe("PDF generation", () => {
  it("creates a real one-page PDF without network access", async () => {
    const svg = Buffer.from(
      '<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 100 100">' +
        '<circle cx="50" cy="50" r="46" fill="#e6d5ae"/>' +
        '<path d="M50 15v35l23 14" fill="none" stroke="#6a4326" stroke-width="8"/>' +
        "</svg>",
    ).toString("base64");
    const memo: PlayerMemo = {
      title: "Smoke Test",
      author: "Codex",
      logo: null,
      background: null,
      nightSheet: null,
      sections: [
        {
          team: "townsfolk",
          cards: [
            {
              id: "clockmaker",
              team: "townsfolk",
              name: plainRichText("Clockmaker"),
              ability: plainRichText(
                "You start knowing that PDF generation works.",
              ),
              image: `data:image/svg+xml;base64,${svg}`,
              edition: "snv",
            },
          ],
        },
      ],
    };
    const html = await renderMemoHtml(memo);
    const report = await generatePdfFromHtml(html, outputPath);
    const bytes = await readFile(outputPath);

    expect(report.pageCount).toBe(1);
    expect(report.bytes).toBeGreaterThan(10_000);
    expect(bytes.subarray(0, 4).toString("ascii")).toBe("%PDF");
    const pdfSource = bytes.toString("latin1");
    expect(pdfSource).toMatch(/\/BaseFont \/[A-Z]{6}\+Dumbledor3Thin/);
    expect(pdfSource).toContain("/FontFile2");
  });

  it("creates one physical night-sheet page after the player page", async () => {
    const memo: PlayerMemo = {
      title: "Night Sheet Smoke Test",
      author: null,
      logo: null,
      background: null,
      sections: [
        {
          team: "townsfolk",
          cards: [
            {
              id: "clockmaker",
              team: "townsfolk",
              name: plainRichText("Clockmaker"),
              ability: plainRichText("You start knowing the night order."),
              image: null,
              edition: "snv",
            },
          ],
        },
      ],
      nightSheet: {
        firstNight: [
          { kind: "marker", id: "dusk" },
          { kind: "role", roleId: "clockmaker" },
          { kind: "marker", id: "dawn" },
        ],
        otherNight: [
          { kind: "marker", id: "dusk" },
          { kind: "role", roleId: "clockmaker" },
          { kind: "marker", id: "dawn" },
        ],
        jinxes: [],
      },
    };
    const html = await renderMemoHtml(memo);
    const report = await generatePdfFromHtml(html, nightOutputPath);
    const bytes = await readFile(nightOutputPath);

    expect(report.pageCount).toBe(2);
    expect(report.bytes).toBeGreaterThan(10_000);
    expect(bytes.subarray(0, 4).toString("ascii")).toBe("%PDF");
  });
});
