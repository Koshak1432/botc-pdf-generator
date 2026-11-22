import { open, unlink } from "node:fs/promises";
import path from "node:path";

/** Сохраняет обе памятки и при разрешении подбирает общий номер для пары с занятыми именами. */
export async function saveMemoDownloads(
  downloads: FormData,
  outputDir: string,
  renameDuplicates: boolean = false,
): Promise<readonly string[]> {
  const players = downloads.get("players");
  const storyteller = downloads.get("storyteller");
  if (!(players instanceof File) || !(storyteller instanceof File)) {
    throw new Error("Генератор не вернул обе памятки.");
  }

  const targets = [
    { pdf: players, suffix: ".pdf" },
    { pdf: storyteller, suffix: ".storyteller.pdf" },
  ];
  for (let attempt = 1; ; attempt += 1) {
    const created: string[] = [];
    try {
      for (const { pdf, suffix } of targets) {
        const name = outputFileName(pdf.name, suffix, attempt);
        const destination = path.resolve(outputDir, name);
        const file = await open(destination, "wx");
        created.push(destination);
        try {
          await file.writeFile(new Uint8Array(await pdf.arrayBuffer()));
        } finally {
          await file.close();
        }
      }
      return created;
    } catch (error) {
      await Promise.all(created.map((file) => unlink(file)));
      if (
        error instanceof Error &&
        "code" in error &&
        error.code === "EEXIST"
      ) {
        if (renameDuplicates) continue;
        throw new Error(
          "В этой папке уже есть PDF с таким именем. Выберите другую папку.",
        );
      }
      throw new Error("Не удалось сохранить PDF в выбранную папку.", {
        cause: error,
      });
    }
  }
}

function outputFileName(name: string, suffix: string, attempt: number): string {
  const safeName = windowsFileName(path.win32.basename(name));
  if (attempt === 1) return safeName;
  const extension = safeName.endsWith(suffix) ? suffix : path.extname(safeName);
  const stem = safeName.slice(0, safeName.length - extension.length);
  return `${stem} (${attempt})${extension}`;
}

function windowsFileName(name: string): string {
  const reserved = /^(?:con|prn|aux|nul|com[1-9¹²³]|lpt[1-9¹²³])(?:\.|$)/i;
  return reserved.test(name) ? `BOTC-${name}` : name;
}
