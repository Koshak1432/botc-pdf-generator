import { ROLE_TEAMS, type RoleTeam } from "./model.js";

export type JsonObject = Record<string, unknown>;

export const ROLE_ID_PATTERN = /^[a-z0-9][a-z0-9_-]{0,49}$/;

export function isJsonObject(value: unknown): value is JsonObject {
  return value !== null && typeof value === "object" && !Array.isArray(value);
}

export function normalizeRoleId(raw: string): string | null {
  const normalized = raw.trim().toLowerCase();
  return ROLE_ID_PATTERN.test(normalized) ? normalized : null;
}

export function parseRoleTeam(raw: string): RoleTeam | null {
  const normalized = raw.trim().toLowerCase();
  return ROLE_TEAMS.includes(normalized as RoleTeam)
    ? (normalized as RoleTeam)
    : null;
}

export function escapeJsonPointer(value: string): string {
  return value.replaceAll("~", "~0").replaceAll("/", "~1");
}

export function jsonErrorMessage(error: unknown): string {
  return error instanceof Error ? error.message : String(error);
}
