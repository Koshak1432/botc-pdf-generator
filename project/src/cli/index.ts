#!/usr/bin/env node

import { mkdir, readFile, writeFile } from "node:fs/promises";
import path from "node:path";
import { fileURLToPath } from "node:url";
import { Command, InvalidArgumentError } from "commander";
import {
  DEFAULT_ROLE_ASSETS_DIR,
  DEFAULT_ROLE_CATALOG,
  loadMemoCompiler,
  safeFileStem,
} from "../generation.js";
import {
  formatDiagnostic,
  generatePdfFromHtml,
  hasErrors,
  materializeMemoAssets,
  parsePresentationOverrides,
  renderMemoHtml,
  renderStorytellerMemoHtml,
  saveHtmlPreview,
  type CoreResult,
  type PlayerMemo,
  type PresentationOverride,
} from "../index.js";

interface GenerateOptions {
  readonly catalog: string;
  readonly out: string | undefined;
  readonly storytellerOut: string | undefined;
  readonly locale: string;
  readonly overrides: string | undefined;
  readonly assetsDir: string | undefined;
  readonly cacheDir: string;
  readonly fetchAssets: boolean;
  readonly html: string | undefined;
  readonly storytellerHtml: string | undefined;
  readonly memoJson: string | undefined;
  readonly cardsPerPage: number;
  readonly subtitle: string | undefined;
  readonly allowPartial: boolean;
}

const DEFAULT_PDF_DIR = fileURLToPath(
  new URL("../../../output/pdf/", import.meta.url),
);
const program = new Command();
program
  .name("botc-pdf")
  .description("Generate print-ready BOTC player references from script JSON.")
  .version("0.1.0");

program
  .command("generate")
  .description("Compile a script and render an A4 PDF through Chromium.")
  .argument("<script>", "BOTC script JSON file")
  .option(
    "-c, --catalog <file>",
    "role catalog JSON; defaults to the bundled Russian catalog",
    DEFAULT_ROLE_CATALOG,
  )
  .option(
    "-o, --out <file>",
    "output PDF; defaults to output/pdf/<script-name>.pdf at the repository root",
  )
  .option(
    "--storyteller-out <file>",
    "PDF памятки рассказчика; по умолчанию рядом с основной памяткой с суффиксом .storyteller",
  )
  .option(
    "-l, --locale <tag>",
    "translation locale from the role catalog",
    "ru",
  )
  .option(
    "--overrides <file>",
    "presentation overrides JSON with [b] and [color=#RRGGBB]",
  )
  .option(
    "--assets-dir <dir>",
    "local role icons named <role-id>.webp/png/jpg/svg",
  )
  .option(
    "--cache-dir <dir>",
    "download cache for remote role icons",
    ".cache/assets",
  )
  .option("--no-fetch-assets", "do not download and embed remote images")
  .option("--html <file>", "also save the complete HTML preview")
  .option(
    "--storyteller-html <file>",
    "дополнительно сохранить HTML-превью памятки рассказчика",
  )
  .option(
    "--memo-json <file>",
    "also save the compiled renderer-neutral memo JSON",
  )
  .option(
    "--cards-per-page <number>",
    "maximum number of role cards per A4 page",
    parsePositiveInteger,
    25,
  )
  .option("--subtitle <text>", "replace the default page subtitle")
  .option(
    "--allow-partial",
    "render even when recoverable input errors were reported",
    false,
  )
  .addHelpText(
    "after",
    `
Examples:
  npm run generate -- examples/a-grimm-chorus.json

  botc-pdf generate "A Grimm Chorus.json" --catalog roles.json \\
    --locale ru --overrides formatting.json --html preview.html
`,
  )
  .action(async (script: string, options: GenerateOptions) => {
    try {
      await generate(script, options);
    } catch (error) {
      const message = error instanceof Error ? error.message : String(error);
      console.error(`ERROR: ${message}`);
      process.exitCode = 1;
    }
  });

await program.parseAsync(process.argv);

async function generate(
  scriptFile: string,
  options: GenerateOptions,
): Promise<void> {
  const scriptPath = path.resolve(scriptFile);
  const [scriptJson, compilerResult] = await Promise.all([
    readFile(scriptPath, "utf8"),
    loadMemoCompiler(path.resolve(options.catalog)),
  ]);
  if (compilerResult.value === null) {
    printDiagnostics(compilerResult);
    throw new Error("Role catalog could not be imported.");
  }

  const overrides = await loadOverrides(options.overrides);
  const memoResult = compilerResult.value.compile(scriptJson, {
    sourceName: scriptPath,
    locale: options.locale,
    overrides,
  });
  printDiagnostics(memoResult);
  if (memoResult.value === null) {
    throw new Error("Script compilation did not produce a memo.");
  }
  if (hasErrors(memoResult) && !options.allowPartial) {
    throw new Error(
      "Input contains errors; PDF was not generated. Fix them or pass --allow-partial.",
    );
  }

  const materialized = await materializeMemoAssets(memoResult.value, {
    baseDir: path.dirname(scriptPath),
    assetsDir: options.assetsDir ?? DEFAULT_ROLE_ASSETS_DIR,
    cacheDir: options.cacheDir,
    fetchRemote: options.fetchAssets,
  });
  materialized.warnings.forEach((warning) =>
    console.warn(`WARNING ASSET: ${warning}`),
  );

  const [html, storytellerHtml] = await Promise.all([
    renderMemoHtml(materialized.memo, {
      locale: options.locale,
      cardsPerPage: options.cardsPerPage,
      subtitle: options.subtitle ?? null,
    }),
    renderStorytellerMemoHtml(materialized.memo, {
      locale: options.locale,
    }),
  ]);
  const fileStem = safeFileStem(
    materialized.memo.title ?? path.parse(scriptPath).name,
  );
  const pdfPath = path.resolve(
    options.out ?? path.join(DEFAULT_PDF_DIR, `${fileStem}.pdf`),
  );
  const storytellerPdfPath = path.resolve(
    options.storytellerOut ?? addFileSuffix(pdfPath, ".storyteller"),
  );
  if (storytellerPdfPath === pdfPath) {
    throw new Error(
      "Пути памятки игроков и памятки рассказчика должны различаться.",
    );
  }

  if (options.html !== undefined) {
    const htmlPath = await saveHtmlPreview(html, options.html);
    console.log(`HTML: ${htmlPath}`);
  }
  if (options.memoJson !== undefined) {
    const jsonPath = await saveMemoJson(materialized.memo, options.memoJson);
    console.log(`Memo JSON: ${jsonPath}`);
  }
  if (options.storytellerHtml !== undefined) {
    const htmlPath = await saveHtmlPreview(
      storytellerHtml,
      options.storytellerHtml,
    );
    console.log(`Storyteller HTML: ${htmlPath}`);
  }

  const report = await generatePdfFromHtml(html, pdfPath);
  console.log(
    `PDF: ${report.outputPath} (${report.pageCount} pages, ${formatBytes(report.bytes)})`,
  );
  if (report.failedImageRequests.length > 0) {
    console.warn(
      `WARNING: ${report.failedImageRequests.length} image request(s) failed in Chromium.`,
    );
  }
  const storytellerReport = await generatePdfFromHtml(
    storytellerHtml,
    storytellerPdfPath,
  );
  console.log(
    `Storyteller PDF: ${storytellerReport.outputPath} ` +
      `(${storytellerReport.pageCount} pages, ${formatBytes(storytellerReport.bytes)})`,
  );
  if (storytellerReport.failedImageRequests.length > 0) {
    console.warn(
      `WARNING: ${storytellerReport.failedImageRequests.length} storyteller image request(s) failed in Chromium.`,
    );
  }
}

async function loadOverrides(
  filePath: string | undefined,
): Promise<Readonly<Record<string, PresentationOverride>>> {
  if (filePath === undefined) return {};
  const absolutePath = path.resolve(filePath);
  const parsed = parsePresentationOverrides(
    await readFile(absolutePath, "utf8"),
    absolutePath,
  );
  printDiagnostics(parsed);
  if (parsed.value === null || hasErrors(parsed)) {
    throw new Error("Presentation overrides could not be imported.");
  }
  return parsed.value;
}

function printDiagnostics(result: CoreResult<unknown>): void {
  for (const item of result.diagnostics) {
    const output = formatDiagnostic(item);
    if (item.severity === "error") console.error(output);
    else if (item.severity === "warning") console.warn(output);
    else console.log(output);
  }
}

async function saveMemoJson(
  memo: PlayerMemo,
  filePath: string,
): Promise<string> {
  const absolutePath = path.resolve(filePath);
  await mkdir(path.dirname(absolutePath), { recursive: true });
  await writeFile(absolutePath, `${JSON.stringify(memo, null, 2)}\n`, "utf8");
  return absolutePath;
}

function addFileSuffix(filePath: string, suffix: string): string {
  const parsed = path.parse(filePath);
  const extension = parsed.ext.length > 0 ? parsed.ext : ".pdf";
  const stem = parsed.ext.length > 0 ? parsed.name : parsed.base;
  return path.join(parsed.dir, `${stem}${suffix}${extension}`);
}

function parsePositiveInteger(value: string): number {
  const parsed = Number(value);
  if (!Number.isSafeInteger(parsed) || parsed < 1) {
    throw new InvalidArgumentError("must be a positive integer");
  }
  return parsed;
}

function formatBytes(bytes: number): string {
  if (bytes < 1024) return `${bytes} B`;
  if (bytes < 1024 * 1024) return `${(bytes / 1024).toFixed(1)} KiB`;
  return `${(bytes / 1024 / 1024).toFixed(1)} MiB`;
}
