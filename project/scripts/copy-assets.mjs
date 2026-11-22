import { copyFile, mkdir } from "node:fs/promises";
import path from "node:path";
import { pathToFileURL } from "node:url";

const outputDir =
  process.argv[2] === undefined
    ? new URL("../dist/", import.meta.url)
    : pathToFileURL(path.resolve(process.argv[2]) + path.sep);
const distRender = new URL("render/", outputDir);
const distFonts = new URL("fonts/", distRender);
const distWeb = new URL("web/", outputDir);
await Promise.all([
  mkdir(distRender, { recursive: true }),
  mkdir(distFonts, { recursive: true }),
  mkdir(distWeb, { recursive: true }),
]);

await Promise.all([
  copyFile(
    new URL("../src/render/role-page-layout.js", import.meta.url),
    new URL("role-page-layout.js", distRender),
  ),
  copyFile(
    new URL("../src/render/night-table-layout.js", import.meta.url),
    new URL("night-table-layout.js", distRender),
  ),
  copyFile(
    new URL("../src/render/storyteller-page-layout.js", import.meta.url),
    new URL("storyteller-page-layout.js", distRender),
  ),
  copyFile(
    new URL("../src/render/print.css", import.meta.url),
    new URL("print.css", distRender),
  ),
  copyFile(
    new URL("../src/render/fonts/Dumbledor3Thin.ttf", import.meta.url),
    new URL("Dumbledor3Thin.ttf", distFonts),
  ),
  copyFile(
    new URL("../src/render/fonts/ACharmingFontExpanded.ttf", import.meta.url),
    new URL("ACharmingFontExpanded.ttf", distFonts),
  ),
  copyFile(
    new URL("../src/web/index.html", import.meta.url),
    new URL("index.html", distWeb),
  ),
  copyFile(
    new URL("../src/web/client.js", import.meta.url),
    new URL("client.js", distWeb),
  ),
]);
