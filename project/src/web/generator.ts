import path from "node:path";
import type { MemoCompiler } from "../core/compiler.js";
import { hasErrors } from "../core/model.js";
import { DEFAULT_ROLE_ASSETS_DIR, safeFileStem } from "../generation.js";
import { materializeMemoAssets } from "../render/assets.js";
import { renderPdfFromHtml } from "../render/pdf.js";
import {
  renderMemoHtml,
  renderStorytellerMemoHtml,
} from "../render/template.js";

/** Готовит два PDF для скачивания или возвращает сообщение об ошибках сценария. */
export async function generateMemoDownloads(
  compiler: MemoCompiler,
  scriptJson: string,
  filename: string,
): Promise<FormData | string> {
  const result = compiler.compile(scriptJson, {
    sourceName: filename,
    locale: "ru",
  });
  if (result.value === null || hasErrors(result)) {
    const details = result.diagnostics
      .filter((item) => item.severity === "error")
      .slice(0, 5)
      .map((item) =>
        `${item.location?.jsonPointer ?? ""} ${item.message}`.trim(),
      );
    return ["Проверьте JSON сценария.", ...details].join("\n");
  }

  const memo = result.value;
  const materialized = await materializeMemoAssets(
    {
      ...memo,
      logo: embeddedImage(memo.logo),
      background: embeddedImage(memo.background),
      sections: memo.sections.map((section) => ({
        ...section,
        cards: section.cards.map((card) => ({
          ...card,
          image: embeddedImage(card.image),
        })),
      })),
    },
    {
      baseDir: DEFAULT_ROLE_ASSETS_DIR,
      assetsDir: DEFAULT_ROLE_ASSETS_DIR,
      fetchRemote: false,
    },
  );

  const fileStem = safeFileStem(memo.title ?? path.parse(filename).name);
  const [playersHtml, storytellerHtml] = await Promise.all([
    renderMemoHtml(materialized.memo),
    renderStorytellerMemoHtml(materialized.memo),
  ]);
  const downloads = new FormData();
  await appendPdf(downloads, "players", playersHtml, `${fileStem}.pdf`);
  await appendPdf(
    downloads,
    "storyteller",
    storytellerHtml,
    `${fileStem}.storyteller.pdf`,
  );
  return downloads;
}

function embeddedImage(source: string | null): string | null {
  const format =
    /^data:image\/(?:png|jpeg|gif|webp|avif);base64,[a-zA-Z0-9+/]+={0,2}$/;
  return source !== null && format.test(source) ? source : null;
}

async function appendPdf(
  downloads: FormData,
  key: string,
  html: string,
  filename: string,
): Promise<void> {
  const { data } = await renderPdfFromHtml(html);
  downloads.append(
    key,
    new Blob([new Uint8Array(data)], { type: "application/pdf" }),
    filename,
  );
}
