import { readFile, readdir } from "node:fs/promises";
import path from "node:path";
import { describe, expect, it } from "vitest";

const EXPECTED_ROLE_COUNT = 181;
const projectRoot = path.resolve(import.meta.dirname, "../..");

describe("local role icon catalog", () => {
  it("contains one valid WebP file for every role id and nothing else", async () => {
    const roles = JSON.parse(
      await readFile(path.join(projectRoot, "catalog/roles.ru.json"), "utf8"),
    ) as Array<{ id: string }>;
    const assetsDirectory = path.join(projectRoot, "assets/roles");
    const entries = await readdir(assetsDirectory, { withFileTypes: true });
    const expectedNames = roles.map((role) => `${role.id}.webp`).sort();

    expect(roles).toHaveLength(EXPECTED_ROLE_COUNT);
    expect(new Set(roles.map((role) => role.id)).size).toBe(
      EXPECTED_ROLE_COUNT,
    );
    expect(entries.every((entry) => entry.isFile())).toBe(true);
    expect(entries.map((entry) => entry.name).sort()).toEqual(expectedNames);

    const files = await Promise.all(
      expectedNames.map((name) =>
        readFile(path.join(assetsDirectory, name)).then((bytes) => ({
          name,
          bytes,
        })),
      ),
    );
    for (const { name, bytes } of files) {
      expect(bytes.length, `${name} must not be empty`).toBeGreaterThan(15);
      expect(bytes.subarray(0, 4).toString("ascii"), name).toBe("RIFF");
      expect(bytes.subarray(8, 12).toString("ascii"), name).toBe("WEBP");
      expect(["VP8 ", "VP8L", "VP8X"], name).toContain(
        bytes.subarray(12, 16).toString("ascii"),
      );
    }
  });
});
