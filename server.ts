import "dotenv/config";

import * as http from "node:http";
import { createRequestListener } from "@remix-run/node-fetch-server";

import { router } from "./app/router.ts";

let server = http.createServer(
  createRequestListener((request) => router.fetch(request)),
);

let port = process.env.PORT ? parseInt(process.env.PORT, 10) : 8080;

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
