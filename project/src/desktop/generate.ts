import { readFile } from "node:fs/promises";
import path from "node:path";
import { hasErrors } from "../core/model.js";
import { loadMemoCompiler } from "../generation.js";
import { PdfLayoutError } from "../render/pdf.js";
import { generateMemoDownloads } from "../web/generator.js";
import { saveMemoDownloads } from "./export.js";

await generate().catch((error: unknown) => {
  if (error instanceof PdfLayoutError) {
    console.error(
      `Содержимое не поместилось на страницах ${error.pages.join(", ")}. Сократите текст в сценарии.`,
    );
  } else {
    console.error(error instanceof Error ? error.message : String(error));
  }
  process.exitCode = 1;
});

async function generate(): Promise<void> {
  const input = process.env.BOTC_DESKTOP_SCRIPT;
  const outputDir = process.env.BOTC_DESKTOP_OUTPUT;
  if (!input || !outputDir) {
    throw new Error("Выберите файл сценария и папку для PDF в мастере.");
  }

  const [script, compiler] = await Promise.all([
    readFile(input, "utf8").catch(() => {
      throw new Error("Не удалось прочитать файл сценария.");
    }),
    loadMemoCompiler(),
  ]);
  if (compiler.value === null || hasErrors(compiler)) {
    throw new Error(
      "Не удалось загрузить встроенный каталог ролей и справочники.",
    );
  }

  const downloads = await generateMemoDownloads(
    compiler.value,
    script.replace(/^\uFEFF/, ""),
    path.basename(input),
  );
  if (typeof downloads === "string") throw new Error(downloads);

  const renameDuplicates = process.env.BOTC_DESKTOP_RENAME_DUPLICATES === "1";
  for (const file of await saveMemoDownloads(
    downloads,
    outputDir,
    renameDuplicates,
  )) {
    console.log(file);
  }
}
