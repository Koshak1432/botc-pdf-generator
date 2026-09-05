import {
  importOfficialCatalogJson,
  type CatalogImportOptions,
} from "./catalog.js";
import { MemoCompiler } from "./memo.js";
import type { CoreResult } from "./model.js";
import { importJinxesJson, importNightOrderJson } from "./night-data.js";

export interface CreateMemoCompilerOptions extends CatalogImportOptions {
  readonly nightOrderJson?: string;
  readonly nightOrderSourceName?: string | null;
  readonly jinxesJson?: string;
  readonly jinxesSourceName?: string | null;
}

export function createMemoCompiler(
  catalogJson: string,
  options: CreateMemoCompilerOptions = {},
): CoreResult<MemoCompiler> {
  const importedCatalog = importOfficialCatalogJson(catalogJson, options);
  const importedNightOrder =
    options.nightOrderJson === undefined
      ? null
      : importNightOrderJson(
          options.nightOrderJson,
          options.nightOrderSourceName ?? null,
        );
  const importedJinxes =
    options.jinxesJson === undefined
      ? null
      : importJinxesJson(options.jinxesJson, options.jinxesSourceName ?? null);
  const diagnostics = [
    ...importedCatalog.diagnostics,
    ...(importedNightOrder?.diagnostics ?? []),
    ...(importedJinxes?.diagnostics ?? []),
  ];
  const optionalImportFailed =
    importedNightOrder?.value === null || importedJinxes?.value === null;

  return {
    value:
      importedCatalog.value === null || optionalImportFailed
        ? null
        : new MemoCompiler(
            importedCatalog.value,
            diagnostics,
            importedNightOrder?.value ?? null,
            importedJinxes?.value ?? null,
          ),
    diagnostics,
  };
}

export {
  importOfficialCatalogJson,
  InMemoryRoleCatalog,
  OFFICIAL_CHARACTER_ASSET_BASE_URL,
  resolveOfficialRoleImage,
  type CatalogImportOptions,
  type RoleCatalog,
} from "./catalog.js";
export {
  MemoCompiler,
  assemblePlayerMemo,
  type AssemblePlayerMemoOptions,
  type CompileOptions,
} from "./memo.js";
export {
  importJinxesJson,
  importNightOrderJson,
  selectLocalizedJinxReason,
  type JinxData,
  type JinxDefinition,
  type NightOrderData,
} from "./night-data.js";
export { importScriptJson } from "./script-importer.js";
export { resolveScript, type ResolveScriptOptions } from "./resolver.js";
export { parsePresentationOverrides } from "./overrides.js";
export { parseRichText } from "./rich-text.js";
export { classifySao, codePointLength, sortRolesBySao } from "./sao.js";
