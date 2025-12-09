import "dotenv/config";

import * as http from "node:http";
import { Readable } from "node:stream";

import { router } from "./app/router.ts";

async function nodeRequestToFetchRequest(
  req: http.IncomingMessage,
): Promise<Request> {
  const url = `http://${req.headers.host}${req.url}`;
  const hasBody = req.method !== "GET" && req.method !== "HEAD";

  // Convert IncomingHttpHeaders to Headers object
  const headers = new Headers();
  for (const [key, value] of Object.entries(req.headers)) {
    if (value !== undefined) {
      if (Array.isArray(value)) {
        for (const v of value) {
          headers.append(key, v);
        }
      } else {
        headers.set(key, value);
      }
    }
  }

  const requestInit: RequestInit = {
    method: req.method || "GET",
    headers,
  };

  if (hasBody) {
    // Convert Node.js ReadableStream to Web ReadableStream
    // Readable.toWeb returns a stream compatible with Request, but TypeScript
    // sees Node.js and Web ReadableStream as different types. We create a
    // proper Web ReadableStream by wrapping the Node.js stream.
    const nodeStream = Readable.toWeb(req);
    requestInit.body = new ReadableStream({
      async start(controller) {
        const reader = nodeStream.getReader();
        try {
          while (true) {
            const { done, value } = await reader.read();
            if (done) {
              controller.close();
              break;
            }
            controller.enqueue(value);
          }
        } catch (error) {
          controller.error(error);
        } finally {
          reader.releaseLock();
        }
      },
    });
  }

  return new Request(url, requestInit);
}

async function fetchResponseToNodeResponse(
  res: http.ServerResponse,
  fetchResponse: Response,
): Promise<void> {
  res.statusCode = fetchResponse.status;
  res.statusMessage = fetchResponse.statusText;

  fetchResponse.headers.forEach((value, key) => {
    res.setHeader(key, value);
  });

  if (fetchResponse.body) {
    const reader = fetchResponse.body.getReader();
    const pump = async () => {
      while (true) {
        const { done, value } = await reader.read();
        if (done) break;
        res.write(value);
      }
      res.end();
    };
    await pump();
  } else {
    res.end();
  }
}

let server = http.createServer(async (req, res) => {
  try {
    const request = await nodeRequestToFetchRequest(req);
    const response = await router.fetch(request);
    await fetchResponseToNodeResponse(res, response);
  } catch (error) {
    console.error(error);
    res.statusCode = 500;
    res.end("Internal Server Error");
  }
});

let port = process.env.PORT ? parseInt(process.env.PORT, 10) : 44100;

server.listen(port, () => {
  console.log(`Newsletter Archive demo is running on http://localhost:${port}`);
});

process.on("SIGINT", () => {
  server.close(() => {
    process.exit(0);
  });
});

process.on("SIGTERM", () => {
  server.close(() => {
    process.exit(0);
  });
});
