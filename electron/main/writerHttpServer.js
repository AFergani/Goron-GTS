function createWriterHttpServerService(deps) {
  const {
    http,
    writerMaxBodyBytes,
    writerSigHeader,
    writerTsHeader,
    writerNonceHeader,
    writerReplayWindowMs,
    getWriterRuntime,
    setWriterRuntime,
    getLocalSourceContext,
    appendWriterTransitLog,
    verifyWriterHmac,
    ensureStore,
    getUserStore
  } = deps;
  const seenNonces = new Map();

  function purgeExpiredNonces(nowMs) {
    const ttlMs = Math.max(1000, Number(writerReplayWindowMs) || 60000);
    for (const [nonce, seenAt] of seenNonces) {
      if (nowMs - seenAt > ttlMs) {
        seenNonces.delete(nonce);
      }
    }
  }

  function readHeaderValue(headers, name) {
    const raw = headers ? headers[name] : null;
    if (Array.isArray(raw)) {
      return String(raw[0] || "").trim();
    }
    return String(raw || "").trim();
  }

  function stopWriterServer() {
    const writerRuntime = getWriterRuntime();
    if (writerRuntime.server) {
      writerRuntime.server.close();
      setWriterRuntime({ ...writerRuntime, server: null });
    }
  }

  function startWriterServer() {
    const writerRuntime = getWriterRuntime();
    if (writerRuntime.server || (writerRuntime.role !== "master" && writerRuntime.role !== "backup")) return;
    const server = http.createServer(async (req, res) => {
      const runtime = getWriterRuntime();
      if (req.method === "GET" && req.url === "/writer/health") {
        res.statusCode = 200;
        res.setHeader("content-type", "application/json");
        res.end(
          JSON.stringify({
            ok: true,
            role: runtime.role,
            host: getLocalSourceContext().hostname
          })
        );
        return;
      }
      if (req.method !== "POST" || req.url !== "/writer/mainCourante/create") {
        res.statusCode = 404;
        res.end(JSON.stringify({ error: "Not found" }));
        return;
      }
      let raw = "";
      let bodyOverflow = false;
      req.on("data", (chunk) => {
        if (bodyOverflow) return;
        raw += chunk.toString("utf-8");
        if (Buffer.byteLength(raw, "utf-8") > writerMaxBodyBytes) {
          bodyOverflow = true;
          res.statusCode = 413;
          res.setHeader("content-type", "application/json");
          res.end(JSON.stringify({ error: "Corps de requête trop volumineux" }));
          req.destroy();
        }
      });
      req.on("end", async () => {
        if (bodyOverflow) return;
        const currentRuntime = getWriterRuntime();
        // Vérification HMAC : obligatoire si un secret est configuré sur ce nœud writer.
        if (!currentRuntime.secret) {
          appendWriterTransitLog({
            event: "writer_received_create",
            writerNode: getLocalSourceContext(),
            result: "REJECTED",
            reason: "writer_secret_missing"
          });
          res.statusCode = 503;
          res.setHeader("content-type", "application/json");
          res.end(JSON.stringify({ error: "Secret writer manquant sur le nœud receveur" }));
          return;
        }
        const sigHeader = readHeaderValue(req.headers, writerSigHeader);
        const tsHeader = readHeaderValue(req.headers, writerTsHeader);
        const nonceHeader = readHeaderValue(req.headers, writerNonceHeader);
        const requestTs = Number(tsHeader);
        const nowMs = Date.now();
        const replayWindowMs = Math.max(1000, Number(writerReplayWindowMs) || 60000);
        if (!Number.isFinite(requestTs) || !nonceHeader) {
          appendWriterTransitLog({
            event: "writer_received_create",
            writerNode: getLocalSourceContext(),
            result: "REJECTED",
            reason: "missing_replay_headers"
          });
          res.statusCode = 400;
          res.setHeader("content-type", "application/json");
          res.end(JSON.stringify({ error: "En-têtes de sécurité writer manquants" }));
          return;
        }
        if (Math.abs(nowMs - requestTs) > replayWindowMs) {
          appendWriterTransitLog({
            event: "writer_received_create",
            writerNode: getLocalSourceContext(),
            result: "REJECTED",
            reason: "expired_request"
          });
          res.statusCode = 401;
          res.setHeader("content-type", "application/json");
          res.end(JSON.stringify({ error: "Requête writer expirée" }));
          return;
        }
        purgeExpiredNonces(nowMs);
        if (seenNonces.has(nonceHeader)) {
          appendWriterTransitLog({
            event: "writer_received_create",
            writerNode: getLocalSourceContext(),
            result: "REJECTED",
            reason: "replay_detected"
          });
          res.statusCode = 409;
          res.setHeader("content-type", "application/json");
          res.end(JSON.stringify({ error: "Rejeu détecté" }));
          return;
        }
        const signedPayload = `${tsHeader}.${nonceHeader}.${raw}`;
        if (!verifyWriterHmac(currentRuntime.secret, signedPayload, sigHeader)) {
          appendWriterTransitLog({
            event: "writer_received_create",
            writerNode: getLocalSourceContext(),
            result: "REJECTED",
            reason: "invalid_signature"
          });
          res.statusCode = 401;
          res.setHeader("content-type", "application/json");
          res.end(JSON.stringify({ error: "Signature writer invalide" }));
          return;
        }
        seenNonces.set(nonceHeader, nowMs);
        try {
          ensureStore();
          const data = raw ? JSON.parse(raw) : {};
          const requestId = data?.requestId || "no-request-id";
          const source = data?.source || {};
          const payload = data?.payload || {};
          const userStore = getUserStore();
          const result = await userStore.createMainCouranteEntry(payload);
          appendWriterTransitLog({
            event: "writer_received_create",
            requestId,
            source,
            writerNode: getLocalSourceContext(),
            result: "SUCCESS",
            entryId: result?.id || payload?.id || null
          });
          res.statusCode = 200;
          res.setHeader("content-type", "application/json");
          res.end(JSON.stringify({ result }));
        } catch (error) {
          appendWriterTransitLog({
            event: "writer_received_create",
            writerNode: getLocalSourceContext(),
            result: "ERROR",
            error: error?.message || "Writer error"
          });
          res.statusCode = 500;
          res.setHeader("content-type", "application/json");
          res.end(JSON.stringify({ error: error?.message || "Writer error" }));
        }
      });
    });
    const runtime = getWriterRuntime();
    const listenPort =
      runtime.role === "backup"
        ? Number(runtime.backupPort || 4811)
        : Number(runtime.masterPort || 4711);
    server.listen(listenPort, "0.0.0.0", () => {
      const latestRuntime = getWriterRuntime();
      appendWriterTransitLog({
        event: "writer_server_started",
        role: latestRuntime.role,
        host: latestRuntime.role === "backup" ? latestRuntime.backupHost : latestRuntime.masterHost,
        port: listenPort
      });
    });
    setWriterRuntime({ ...runtime, server });
  }

  return {
    startWriterServer,
    stopWriterServer
  };
}

module.exports = {
  createWriterHttpServerService
};
