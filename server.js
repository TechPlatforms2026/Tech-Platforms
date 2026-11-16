import "dotenv/config";
import fs from "node:fs";
import http from "node:http";
import path from "node:path";
import express from "express";
import { createServer as createViteServer } from "vite";
import { WebSocket, WebSocketServer } from "ws";
import { createApiRouter, processIncomingChatMessage } from "./server/apiRouter.js";
import { getDb } from "./server/store.js";
const PORT = 3e3;
async function startServer() {
  const app = express();
  const httpServer = http.createServer(app);
  app.use(express.json({ limit: "25mb" }));
  const wss = new WebSocketServer({ server: httpServer, path: "/ws/chat" });
  function broadcastWs(payload) {
    const raw = JSON.stringify(payload);
    for (const client of wss.clients) {
      if (client.readyState === WebSocket.OPEN) {
        client.send(raw);
      }
    }
  }
  function broadcastPresence() {
    broadcastWs({ type: "chat:presence", onlineCount: wss.clients.size });
  }
  wss.on("connection", (ws) => {
    const db = getDb();
    ws.send(
      JSON.stringify({
        type: "chat:init",
        messages: db.messages.slice(-120),
        onlineCount: wss.clients.size
      })
    );
    broadcastPresence();
    ws.on("message", async (rawData) => {
      try {
        const parsed = JSON.parse(String(rawData));
        if (parsed.type === "chat:send") {
          const result = await processIncomingChatMessage({
            userId: parsed.userId,
            text: parsed.text,
            askAi: parsed.askAi,
            channel: parsed.channel,
            onBroadcast: (msg) => broadcastWs({ type: "chat:message", message: msg })
          });
          if (!result.ok) {
            ws.send(
              JSON.stringify({
                type: "chat:error",
                error: result.error,
                banned: result.banned,
                bannedUntil: result.bannedUntil
              })
            );
          }
        }
      } catch {
        ws.send(JSON.stringify({ type: "chat:error", error: "Geçersiz sohbet verisi." }));
      }
    });
    ws.on("close", () => {
      broadcastPresence();
    });
  });
  app.use(
    "/api",
    createApiRouter({
      getOnlineClients: () => Math.max(1, wss.clients.size),
      onChatBroadcast: (msg) => broadcastWs({ type: "chat:message", message: msg }),
      runtimeMode: "Node Full-Stack (Express + WebSocket)"
    })
  );
  app.get(/^\/google[a-z0-9]+\.html$/i, (req, res, next) => {
    const safeName = path.basename(req.path);
    const candidatePublic = path.join(process.cwd(), "public", safeName);
    const candidateDist = path.join(process.cwd(), "dist", safeName);
    const target = fs.existsSync(candidatePublic) ? candidatePublic : fs.existsSync(candidateDist) ? candidateDist : null;
    if (target) {
      res.type("text/html; charset=utf-8").sendFile(target);
      return;
    }
    next();
  });
  app.get("/.well-known/assetlinks.json", (_req, res, next) => {
    const candidatePublic = path.join(process.cwd(), "public", ".well-known", "assetlinks.json");
    const candidateDist = path.join(process.cwd(), "dist", ".well-known", "assetlinks.json");
    const target = fs.existsSync(candidatePublic) ? candidatePublic : fs.existsSync(candidateDist) ? candidateDist : null;
    if (target) {
      res.type("application/json; charset=utf-8").sendFile(target);
      return;
    }
    next();
  });
  const distDir = path.resolve(process.cwd(), "dist");
  const isProd = process.env.NODE_ENV === "production" && fs.existsSync(distDir);
  if (isProd) {
    app.use(express.static(distDir));
    app.get("*", (_req, res) => {
      res.sendFile(path.join(distDir, "index.html"));
    });
  } else {
    const vite = await createViteServer({
      server: { middlewareMode: true },
      appType: "spa"
    });
    app.use(vite.middlewares);
  }
  httpServer.listen(PORT, "0.0.0.0", () => {
    console.log(`TechCore server running on http://0.0.0.0:${PORT}`);
  });
}
startServer().catch((err) => {
  console.error("Failed to start TechCore server:", err);
  process.exit(1);
});
