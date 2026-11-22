import { mkdir, readFile, readdir, stat, writeFile } from "node:fs/promises";
import path from "node:path";
import { fileURLToPath } from "node:url";

const OFFICIAL_CHARACTER_ASSET_BASE_URL =
  "https://release.botc.app/resources/characters";
const EXPECTED_ROLE_COUNT = 181;
const DEFAULT_CATALOG = fileURLToPath(
  new URL("../catalog/roles.ru.json", import.meta.url),
);
const DEFAULT_OUTPUT = fileURLToPath(
  new URL("../assets/roles", import.meta.url),
);
const VALID_TEAMS = new Set([
  "townsfolk",
  "outsider",
  "minion",
  "demon",
  "traveller",
  "fabled",
  "loric",
]);

const options = readArguments(process.argv.slice(2));
const catalogPath = path.resolve(options.catalog);
const outputDirectory = path.resolve(options.output);
const roles = await readCatalog(catalogPath);

if (!options.check) {
  await mkdir(outputDirectory, { recursive: true });
  const result = await downloadAll(roles, outputDirectory, options.force);
  console.log(
    `Role icons: ${result.downloaded} downloaded, ${result.reused} reused.`,
  );
}

const audit = await auditAssets(roles, outputDirectory);
console.log(
  `Verified ${audit.count} WebP role icons in ${outputDirectory} ` +
    `(${formatBytes(audit.totalBytes)} total, ` +
    `${formatBytes(audit.minBytes)}-${formatBytes(audit.maxBytes)} each).`,
);

function readArguments(args) {
  const options = {
    catalog: DEFAULT_CATALOG,
    output: DEFAULT_OUTPUT,
    check: false,
    force: false,
  };

  for (let index = 0; index < args.length; index += 1) {
    const name = args[index];
    if (name === "--check") {
      options.check = true;
      continue;
    }
    if (name === "--force") {
      options.force = true;
      continue;
    }
    if (name === "--catalog" || name === "--out") {
      const value = args[index + 1];
      if (value === undefined || value.startsWith("--")) {
        throw new Error(`${name} requires a path.`);
      }
      if (name === "--catalog") options.catalog = value;
      else options.output = value;
      index += 1;
      continue;
    }
    throw new Error(`Unknown argument '${name}'.`);
  }

  if (options.check && options.force) {
    throw new Error("--check and --force cannot be used together.");
  }
  return options;
}

async function readCatalog(catalogPath) {
  const parsed = JSON.parse(await readFile(catalogPath, "utf8"));
  if (!Array.isArray(parsed)) {
    throw new Error(`Catalog '${catalogPath}' must contain a JSON array.`);
  }
  if (parsed.length !== EXPECTED_ROLE_COUNT) {
    throw new Error(
      `Catalog must contain exactly ${EXPECTED_ROLE_COUNT} roles; found ${parsed.length}.`,
    );
  }

  const seen = new Set();
  for (const [index, role] of parsed.entries()) {
    if (role === null || typeof role !== "object" || Array.isArray(role)) {
      throw new Error(`Catalog role at index ${index} must be an object.`);
    }
    if (typeof role.id !== "string" || !/^[a-z0-9][a-z0-9_-]*$/.test(role.id)) {
      throw new Error(
        `Catalog role at index ${index} has invalid id '${role.id}'.`,
      );
    }
    if (seen.has(role.id)) throw new Error(`Duplicate role id '${role.id}'.`);
    seen.add(role.id);
    if (
      typeof role.edition !== "string" ||
      !/^[a-z0-9][a-z0-9_-]*$/.test(role.edition)
    ) {
      throw new Error(
        `Role '${role.id}' has invalid edition '${role.edition}'.`,
      );
    }
    if (typeof role.team !== "string" || !VALID_TEAMS.has(role.team)) {
      throw new Error(`Role '${role.id}' has invalid team '${role.team}'.`);
    }
  }
  return parsed;
}

async function downloadAll(roles, outputDirectory, force) {
  let downloaded = 0;
  let reused = 0;
  await mapConcurrent(roles, 8, async (role) => {
    const destination = path.join(outputDirectory, `${role.id}.webp`);
    if (!force && (await isValidWebPFile(destination))) {
      reused += 1;
      return;
    }

    const source = officialRoleImageUrl(role);
    const response = await fetchWithRetries(source);
    const contentType = response.headers
      .get("content-type")
      ?.split(";", 1)[0]
      ?.trim()
      .toLowerCase();
    if (contentType !== "image/webp") {
      throw new Error(
        `Expected image/webp for role '${role.id}', received '${contentType ?? "none"}'.`,
      );
    }
    const bytes = Buffer.from(await response.arrayBuffer());
    assertWebP(bytes, role.id);
    const contentLength = response.headers.get("content-length");
    if (contentLength !== null && Number(contentLength) !== bytes.length) {
      throw new Error(
        `Content length mismatch for role '${role.id}': ` +
          `${contentLength} header bytes, ${bytes.length} received.`,
      );
    }
    await writeFile(destination, bytes);
    downloaded += 1;
  });
  return { downloaded, reused };
}

async function auditAssets(roles, outputDirectory) {
  const expectedFiles = new Set(roles.map((role) => `${role.id}.webp`));
  let directoryEntries;
  try {
    directoryEntries = await readdir(outputDirectory, { withFileTypes: true });
  } catch (error) {
    throw new Error(
      `Cannot read role assets directory '${outputDirectory}': ${errorMessage(error)}`,
    );
  }

  const actualFiles = directoryEntries
    .filter((entry) => entry.isFile())
    .map((entry) => entry.name);
  const unexpectedEntries = directoryEntries
    .filter((entry) => !entry.isFile() || !expectedFiles.has(entry.name))
    .map((entry) => entry.name)
    .sort();
  const missingFiles = [...expectedFiles]
    .filter((name) => !actualFiles.includes(name))
    .sort();

  if (missingFiles.length > 0 || unexpectedEntries.length > 0) {
    const details = [];
    if (missingFiles.length > 0) {
      details.push(`missing: ${missingFiles.join(", ")}`);
    }
    if (unexpectedEntries.length > 0) {
      details.push(`unexpected: ${unexpectedEntries.join(", ")}`);
    }
    throw new Error(`Role asset set is not exact (${details.join("; ")}).`);
  }
  if (actualFiles.length !== EXPECTED_ROLE_COUNT) {
    throw new Error(
      `Expected exactly ${EXPECTED_ROLE_COUNT} role icon files; found ${actualFiles.length}.`,
    );
  }

  const sizes = await Promise.all(
    roles.map(async (role) => {
      const filePath = path.join(outputDirectory, `${role.id}.webp`);
      const bytes = await readFile(filePath);
      assertWebP(bytes, role.id);
      return (await stat(filePath)).size;
    }),
  );
  return {
    count: sizes.length,
    totalBytes: sizes.reduce((sum, size) => sum + size, 0),
    minBytes: Math.min(...sizes),
    maxBytes: Math.max(...sizes),
  };
}

function officialRoleImageUrl(role) {
  const suffix =
    role.team === "townsfolk" || role.team === "outsider"
      ? "_g"
      : role.team === "minion" || role.team === "demon"
        ? "_e"
        : "";
  return `${OFFICIAL_CHARACTER_ASSET_BASE_URL}/${role.edition}/${role.id}${suffix}.webp`;
}

async function fetchWithRetries(url) {
  let lastError;
  for (let attempt = 1; attempt <= 3; attempt += 1) {
    try {
      const response = await fetch(url, {
        headers: { accept: "image/webp" },
        signal: AbortSignal.timeout(20_000),
      });
      if (response.ok) return response;
      lastError = new Error(
        `HTTP ${response.status} ${response.statusText} for ${url}`,
      );
    } catch (error) {
      lastError = error;
    }
    if (attempt < 3) await delay(250 * 2 ** (attempt - 1));
  }
  throw lastError;
}

async function isValidWebPFile(filePath) {
  try {
    assertWebP(await readFile(filePath), path.basename(filePath));
    return true;
  } catch {
    return false;
  }
}

function assertWebP(bytes, roleId) {
  const isWebP =
    bytes.length >= 16 &&
    bytes.subarray(0, 4).toString("ascii") === "RIFF" &&
    bytes.subarray(8, 12).toString("ascii") === "WEBP" &&
    ["VP8 ", "VP8L", "VP8X"].includes(bytes.subarray(12, 16).toString("ascii"));
  if (!isWebP) {
    throw new Error(`Role icon '${roleId}' is not a valid WebP container.`);
  }
}

async function mapConcurrent(items, concurrency, worker) {
  let nextIndex = 0;
  await Promise.all(
    Array.from({ length: Math.min(concurrency, items.length) }, async () => {
      while (nextIndex < items.length) {
        const item = items[nextIndex];
        nextIndex += 1;
        await worker(item);
      }
    }),
  );
}

function delay(milliseconds) {
  return new Promise((resolve) => setTimeout(resolve, milliseconds));
}

function formatBytes(bytes) {
  if (bytes < 1024) return `${bytes} B`;
  if (bytes < 1024 * 1024) return `${(bytes / 1024).toFixed(1)} KiB`;
  return `${(bytes / 1024 / 1024).toFixed(2)} MiB`;
}

function errorMessage(error) {
  return error instanceof Error ? error.message : String(error);
}
