import { execFile } from "node:child_process";
import { readFile } from "node:fs/promises";
import {
  createServer,
  type IncomingMessage,
  type ServerResponse,
} from "node:http";
import { hasErrors } from "../core/model.js";
import { loadMemoCompiler } from "../generation.js";
import { PdfLayoutError } from "../render/pdf.js";
import { generateMemoDownloads } from "./generator.js";

const HOST = "127.0.0.1";
const PORT = 4173;
const ADDRESS = `http://${HOST}:${PORT}`;
const MAX_UPLOAD_BYTES = 5 * 1024 * 1024;

await startServer().catch((error: unknown) => {
  console.error("Failed to start the PDF server.", error);
  process.exitCode = 1;
});

async function startServer(): Promise<void> {
  const [compilerResult, page, client] = await Promise.all([
    loadMemoCompiler(),
    readFile(new URL("./index.html", import.meta.url)),
    readFile(new URL("./client.js", import.meta.url)),
  ]);
  if (compilerResult.value === null || hasErrors(compilerResult)) {
    throw new Error("Не удалось загрузить каталог ролей и справочники.");
  }
  const compiler = compilerResult.value;

  let generating = false;
  const server = createServer(
    { requestTimeout: 30_000 },
    (request, response) => {
      void handleRequest(request, response).catch((error: unknown) => {
        if (error instanceof PdfLayoutError) {
          sendError(
            response,
            422,
            `Содержимое не поместилось на страницах ${error.pages.join(", ")}. Сократите текст в сценарии.`,
          );
          return;
        }
        console.error("PDF request failed.", error);
        sendError(
          response,
          500,
          "Не удалось создать PDF. Проверьте установку Chromium и сообщения в терминале.",
        );
      });
    },
  );
  server.on("error", (error: Error) => {
    console.error("PDF server error.", error);
    process.exitCode = 1;
  });
  server.listen(PORT, HOST, () => {
    console.log(`PDF generator: ${ADDRESS}`);
    if (process.platform === "win32" && process.argv.includes("--open")) {
      execFile(
        process.env.ComSpec ?? "cmd.exe",
        ["/d", "/c", "start", ADDRESS],
        { windowsHide: true },
        (error) => {
          if (error)
            console.warn(`Could not open the browser. Go to ${ADDRESS}.`);
        },
      );
    }
  });

  async function handleRequest(
    request: IncomingMessage,
    response: ServerResponse,
  ): Promise<void> {
    if (request.headers.host !== `${HOST}:${PORT}`) {
      sendError(response, 403, "Откройте адрес, указанный в терминале.");
      return;
    }

    response.setHeader("Cache-Control", "no-store");
    response.setHeader("X-Content-Type-Options", "nosniff");
    const url = new URL(request.url ?? "/", ADDRESS);

    if (request.method === "GET" && url.pathname === "/") {
      response.setHeader(
        "Content-Security-Policy",
        "default-src 'none'; script-src 'self'; connect-src 'self'; style-src 'unsafe-inline'; " +
          "base-uri 'none'; form-action 'none'; frame-ancestors 'none'",
      );
      response.writeHead(200, { "Content-Type": "text/html; charset=utf-8" });
      response.end(page);
      return;
    }
    if (request.method === "GET" && url.pathname === "/client.js") {
      response.writeHead(200, {
        "Content-Type": "text/javascript; charset=utf-8",
      });
      response.end(client);
      return;
    }
    if (request.method !== "POST" || url.pathname !== "/generate") {
      sendError(response, 404, "Страница не найдена.");
      return;
    }
    const contentType = request.headers["content-type"]?.split(";", 1)[0];
    if (contentType !== "application/json") {
      sendError(response, 415, "Загрузите файл JSON.");
      return;
    }
    if (generating) {
      sendError(response, 503, "Генератор занят. Попробуйте ещё раз.");
      return;
    }

    generating = true;
    try {
      const scriptJson = await readUpload(request);
      if (scriptJson === null) {
        response.setHeader("Connection", "close");
        sendError(response, 413, "Размер файла превышает 5 МБ.");
        return;
      }
      const filename = url.searchParams.get("filename") || "script.json";
      const result = await generateMemoDownloads(
        compiler,
        scriptJson,
        filename,
      );
      if (typeof result === "string") {
        sendError(response, 400, result);
        return;
      }

      const encoded = new Response(result);
      const body = Buffer.from(await encoded.arrayBuffer());
      encoded.headers.forEach((value, name) => response.setHeader(name, value));
      response.writeHead(200, { "Content-Length": body.length });
      response.end(body);
    } finally {
      generating = false;
    }
  }
}

async function readUpload(request: IncomingMessage): Promise<string | null> {
  const chunks: Buffer[] = [];
  let size = 0;
  const stream: AsyncIterable<Buffer> = request.iterator({
    destroyOnReturn: false,
  });
  for await (const chunk of stream) {
    size += chunk.length;
    if (size > MAX_UPLOAD_BYTES) return null;
    chunks.push(chunk);
  }
  return new TextDecoder().decode(Buffer.concat(chunks, size));
}

function sendError(
  response: ServerResponse,
  status: number,
  message: string,
): void {
  if (response.destroyed) return;
  response.writeHead(status, { "Content-Type": "text/plain; charset=utf-8" });
  response.end(message);
}
