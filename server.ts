import "dotenv/config";

import * as http from "node:http";
import { createRequestListener } from "@remix-run/node-fetch-server";

import { router } from "./app/router.ts";

let server = http.createServer(
  createRequestListener(async (request) => {
    try {
      return await router.fetch(request);
    } catch (error) {
      console.error(error);
      return new Response("Internal Server Error", { status: 500 });
    }
  }),
);

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
