import {
  diagnostic,
  DiagnosticCodes,
  location,
  type Diagnostic,
} from "./diagnostics.js";
import { isJsonObject, jsonErrorMessage } from "./json.js";
import type { CoreResult, RoleDefinition, RoleTeam } from "./model.js";
import { decodeRoleDefinition } from "./role-decoder.js";

export const OFFICIAL_CHARACTER_ASSET_BASE_URL =
  "https://release.botc.app/resources/characters";

export interface RoleCatalog {
  get(id: string): RoleDefinition | null;
  all(): readonly RoleDefinition[];
}

export class InMemoryRoleCatalog implements RoleCatalog {
  readonly #rolesById: ReadonlyMap<string, RoleDefinition>;

  constructor(roles: Iterable<RoleDefinition>) {
    this.#rolesById = new Map([...roles].map((role) => [role.id, role]));
  }

  get(id: string): RoleDefinition | null {
    return this.#rolesById.get(id) ?? null;
  }

  all(): readonly RoleDefinition[] {
    return [...this.#rolesById.values()];
  }
}

export interface CatalogImportOptions {
  readonly sourceName?: string | null;
  readonly assetBaseUrl?: string;
}

export function importOfficialCatalogJson(
  input: string,
  options: CatalogImportOptions = {},
): CoreResult<InMemoryRoleCatalog> {
  const sourceName = options.sourceName ?? null;
  let root: unknown;
  try {
    root = JSON.parse(input) as unknown;
  } catch (error) {
    return {
      value: null,
      diagnostics: [
        diagnostic(
          DiagnosticCodes.CATALOG_JSON_INVALID,
          "error",
          `Invalid catalog JSON: ${jsonErrorMessage(error)}`,
          location(sourceName),
        ),
      ],
    };
  }
  if (!Array.isArray(root)) {
    return {
      value: null,
      diagnostics: [
        diagnostic(
          DiagnosticCodes.CATALOG_ROOT_NOT_ARRAY,
          "error",
          "Official role catalog root must be a JSON array.",
          location(sourceName, ""),
        ),
      ],
    };
  }

  const diagnostics: Diagnostic[] = [];
  const rolesById = new Map<string, RoleDefinition>();
  root.forEach((element, index) => {
    const pointer = `/${index}`;
    if (!isJsonObject(element)) {
      diagnostics.push(
        diagnostic(
          DiagnosticCodes.CATALOG_ROLE_INVALID,
          "error",
          "Catalog element must be a role object.",
          location(sourceName, pointer),
        ),
      );
      return;
    }
    const decoded = decodeRoleDefinition(element, {
      sourceName,
      pointer,
      invalidCode: DiagnosticCodes.CATALOG_ROLE_INVALID,
      officialIndex: index,
    });
    diagnostics.push(...decoded.diagnostics);
    if (decoded.value === null) return;

    const role =
      decoded.value.image === null
        ? {
            ...decoded.value,
            image: resolveOfficialRoleImage(
              decoded.value,
              options.assetBaseUrl,
            ),
          }
        : decoded.value;
    if (rolesById.has(role.id)) {
      diagnostics.push(
        diagnostic(
          DiagnosticCodes.CATALOG_DUPLICATE_ID,
          "error",
          `Catalog contains duplicate role id '${role.id}'.`,
          location(sourceName, `${pointer}/id`),
        ),
      );
      return;
    }
    rolesById.set(role.id, role);
  });

  return {
    value: new InMemoryRoleCatalog(rolesById.values()),
    diagnostics,
  };
}

export function resolveOfficialRoleImage(
  role: Pick<RoleDefinition, "id" | "edition" | "team">,
  baseUrl: string = OFFICIAL_CHARACTER_ASSET_BASE_URL,
): string | null {
  const edition = role.edition;
  if (edition === null || !/^[a-z0-9][a-z0-9_-]*$/.test(edition)) return null;
  const suffix = alignmentSuffix(role.team);
  return `${baseUrl.replace(/\/$/, "")}/${edition}/${role.id}${suffix}.webp`;
}

function alignmentSuffix(team: RoleTeam): string {
  switch (team) {
    case "townsfolk":
    case "outsider":
      return "_g";
    case "minion":
    case "demon":
      return "_e";
    default:
      return "";
  }
}
