import { readFile } from "node:fs/promises";
import { fileURLToPath } from "node:url";
import { createMemoCompiler, type MemoCompiler } from "./core/compiler.js";
import type { CoreResult } from "./core/model.js";

export const DEFAULT_ROLE_ASSETS_DIR = fileURLToPath(
  new URL("../assets/roles/", import.meta.url),
);
export const DEFAULT_ROLE_CATALOG = fileURLToPath(
  new URL("../catalog/roles.ru.json", import.meta.url),
);
const DEFAULT_NIGHT_ORDER = fileURLToPath(
  new URL("../catalog/nightsheet.json", import.meta.url),
);
const DEFAULT_JINX_CATALOG = fileURLToPath(
  new URL("../catalog/jinxes.ru.json", import.meta.url),
);

/** Загружает каталог ролей, ночной порядок и сглазы для генерации памяток. */
export async function loadMemoCompiler(
  catalogPath: string = DEFAULT_ROLE_CATALOG,
): Promise<CoreResult<MemoCompiler>> {
  const [catalogJson, nightOrderJson, jinxesJson] = await Promise.all([
    readFile(catalogPath, "utf8"),
    readFile(DEFAULT_NIGHT_ORDER, "utf8"),
    readFile(DEFAULT_JINX_CATALOG, "utf8"),
  ]);
  return createMemoCompiler(catalogJson, {
    sourceName: catalogPath,
    nightOrderJson,
    nightOrderSourceName: DEFAULT_NIGHT_ORDER,
    jinxesJson,
    jinxesSourceName: DEFAULT_JINX_CATALOG,
  });
}

/** Очищает заголовок сценария для имени выходного файла. */
export function safeFileStem(value: string): string {
  const result = value
    .normalize("NFC")
    .replace(/[<>:"/\\|?*\u0000-\u001F]/g, "-")
    .replace(/\s+/g, " ")
    .trim()
    .replace(/[. ]+$/g, "");
  return result.length === 0 ? "botc-memo" : result.slice(0, 100);
}
