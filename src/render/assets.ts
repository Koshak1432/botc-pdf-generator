import { access, mkdir, readFile, writeFile } from "node:fs/promises";
import path from "node:path";
import { fileURLToPath } from "node:url";
import type { PlayerMemo, RoleCard, RoleSection } from "../core/model.js";

const ROLE_ASSET_EXTENSIONS = [
  ".webp",
  ".png",
  ".jpg",
  ".jpeg",
  ".svg",
] as const;

export interface MaterializeAssetsOptions {
  readonly baseDir: string;
  readonly assetsDir?: string | null;
  readonly cacheDir?: string | null;
  readonly fetchRemote?: boolean;
  readonly timeoutMs?: number;
}

export interface MaterializedMemo {
  readonly memo: PlayerMemo;
  readonly warnings: readonly string[];
}

interface AssetContext {
  readonly baseDir: string;
  readonly assetsDir: string | null;
  readonly cacheDir: string | null;
  readonly fetchRemote: boolean;
  readonly timeoutMs: number;
  readonly warnings: string[];
}

export async function materializeMemoAssets(
  memo: PlayerMemo,
  options: MaterializeAssetsOptions,
): Promise<MaterializedMemo> {
  const warnings: string[] = [];
  const context: AssetContext = {
    baseDir: path.resolve(options.baseDir),
    assetsDir:
      options.assetsDir === undefined || options.assetsDir === null
        ? null
        : path.resolve(options.assetsDir),
    cacheDir:
      options.cacheDir === undefined || options.cacheDir === null
        ? null
        : path.resolve(options.cacheDir),
    fetchRemote: options.fetchRemote ?? true,
    timeoutMs: options.timeoutMs ?? 10_000,
    warnings,
  };

  const sections = await Promise.all(
    memo.sections.map(async (section): Promise<RoleSection> => ({
      ...section,
      cards: await Promise.all(
        section.cards.map((card) => materializeCard(card, context)),
      ),
    })),
  );
  const logo = await materializeImage(memo.logo, "script-logo", context);
  const background = await materializeImage(
    memo.background,
    "script-background",
    context,
  );
  return {
    memo: { ...memo, sections, logo, background },
    warnings,
  };
}

async function materializeCard(
  card: RoleCard,
  context: AssetContext,
): Promise<RoleCard> {
  const localAsset = await findRoleAsset(card.id, context.assetsDir);
  const source = localAsset ?? card.image;
  const image = await materializeImage(source, `role-${card.id}`, context);
  return { ...card, image };
}

async function findRoleAsset(
  id: string,
  assetsDir: string | null,
): Promise<string | null> {
  if (assetsDir === null) return null;
  for (const extension of ROLE_ASSET_EXTENSIONS) {
    const candidate = path.join(assetsDir, `${id}${extension}`);
    if (await fileExists(candidate)) return candidate;
  }
  return null;
}

async function materializeImage(
  source: string | null,
  cacheKey: string,
  context: AssetContext,
): Promise<string | null> {
  if (source === null) return null;
  if (source.startsWith("data:image/")) return source;

  if (source.startsWith("https://") || source.startsWith("http://")) {
    if (!context.fetchRemote) return source;
    return fetchRemoteImage(source, cacheKey, context);
  }

  if (source.startsWith("file://")) {
    try {
      return await localFileToDataUri(fileURLToPath(source));
    } catch (error) {
      context.warnings.push(
        `Cannot read image '${source}': ${errorMessage(error)}`,
      );
      return null;
    }
  }

  if (!path.isAbsolute(source) && /^[a-z][a-z0-9+.-]*:/i.test(source)) {
    context.warnings.push(`Unsupported image URI scheme in '${source}'.`);
    return null;
  }

  const localPath = path.isAbsolute(source)
    ? source
    : path.resolve(context.baseDir, source);
  try {
    return await localFileToDataUri(localPath);
  } catch (error) {
    context.warnings.push(
      `Cannot read image '${localPath}': ${errorMessage(error)}`,
    );
    return null;
  }
}

async function fetchRemoteImage(
  source: string,
  cacheKey: string,
  context: AssetContext,
): Promise<string | null> {
  const extension = safeRemoteExtension(source);
  const cachePath =
    context.cacheDir === null
      ? null
      : path.join(
          context.cacheDir,
          `${sanitizeCacheKey(cacheKey)}${extension}`,
        );
  if (cachePath !== null && (await fileExists(cachePath))) {
    try {
      return await localFileToDataUri(cachePath, mimeFromExtension(extension));
    } catch {
      // A stale cache entry is replaced by the network response below.
    }
  }

  try {
    const response = await fetch(source, {
      signal: AbortSignal.timeout(context.timeoutMs),
      headers: {
        accept: "image/avif,image/webp,image/png,image/jpeg,image/svg+xml",
      },
    });
    if (!response.ok) {
      throw new Error(`HTTP ${response.status}`);
    }
    const contentType =
      response.headers.get("content-type")?.split(";", 1)[0]?.trim() ??
      mimeFromExtension(extension);
    if (!contentType.startsWith("image/")) {
      throw new Error(`unexpected content type '${contentType}'`);
    }
    const bytes = Buffer.from(await response.arrayBuffer());
    if (cachePath !== null) {
      await mkdir(path.dirname(cachePath), { recursive: true });
      await writeFile(cachePath, bytes);
    }
    return toDataUri(bytes, contentType);
  } catch (error) {
    context.warnings.push(
      `Cannot download image '${source}': ${errorMessage(error)}`,
    );
    return null;
  }
}

async function localFileToDataUri(
  filePath: string,
  explicitMime: string | null = null,
): Promise<string> {
  const bytes = await readFile(filePath);
  const mime = explicitMime ?? mimeFromExtension(path.extname(filePath));
  return toDataUri(bytes, mime);
}

function toDataUri(bytes: Uint8Array, mime: string): string {
  return `data:${mime};base64,${Buffer.from(bytes).toString("base64")}`;
}

function safeRemoteExtension(source: string): string {
  try {
    const extension = path.extname(new URL(source).pathname).toLowerCase();
    return ROLE_ASSET_EXTENSIONS.includes(
      extension as (typeof ROLE_ASSET_EXTENSIONS)[number],
    )
      ? extension
      : ".webp";
  } catch {
    return ".webp";
  }
}

function mimeFromExtension(extension: string): string {
  switch (extension.toLowerCase()) {
    case ".png":
      return "image/png";
    case ".jpg":
    case ".jpeg":
      return "image/jpeg";
    case ".svg":
      return "image/svg+xml";
    case ".avif":
      return "image/avif";
    default:
      return "image/webp";
  }
}

function sanitizeCacheKey(value: string): string {
  return value.replace(/[^a-z0-9_-]+/gi, "_").slice(0, 80);
}

async function fileExists(filePath: string): Promise<boolean> {
  try {
    await access(filePath);
    return true;
  } catch {
    return false;
  }
}

function errorMessage(error: unknown): string {
  return error instanceof Error ? error.message : String(error);
}
