import { createServer } from "node:http";
import { request as httpRequest } from "node:http";
import { request as httpsRequest } from "node:https";
import { createReadStream, createWriteStream } from "node:fs";
import { mkdir, rename, stat, unlink } from "node:fs/promises";
import { extname, join, normalize } from "node:path";
import { createHash, randomBytes } from "node:crypto";
import { fileURLToPath } from "node:url";

const rootDir = fileURLToPath(new URL(".", import.meta.url));
const publicDir = join(rootDir, "public");
const host = process.env.HOST || "127.0.0.1";
const port = Number(process.env.PORT || 8787);
const defaultNavidromeOrigin =
  process.env.NAVIDROME_ORIGIN || "http://100.121.7.84:4533";
const allowClientOriginOverride = /^(1|true|yes)$/i.test(
  process.env.ALLOW_CLIENT_ORIGIN_OVERRIDE || ""
);
const radioBrowserOrigins = [
  "https://de1.api.radio-browser.info",
  "https://fi1.api.radio-browser.info",
  "https://nl1.api.radio-browser.info"
];
const radioSearchCache = new Map();
const radioSearchCacheTtlMs = 5 * 60 * 1000;
const communityRadioStreams = new Map();
const communityRadioStreamTtlMs = 60 * 60 * 1000;
const navidromeAlbumCache = new Map();
const navidromeAlbumInflight = new Map();
const navidromeAlbumCacheTtlMs = Number(process.env.ALBUM_CACHE_TTL_MS || 6 * 60 * 60 * 1000);
const navidromeAlbumCacheMaxItems = Number(process.env.ALBUM_CACHE_MAX_ITEMS || 5000);
const navidromeAlbumWarmMaxItems = Number(process.env.ALBUM_CACHE_WARM_MAX_ITEMS || 32);
const audioCacheDir = process.env.AUDIO_CACHE_DIR || join(rootDir, ".cache", "audio");
const audioCacheInflight = new Map();
const audioCacheSeekWaitMs = Number(process.env.AUDIO_CACHE_SEEK_WAIT_MS || 12000);

const mimeTypes = {
  ".css": "text/css; charset=utf-8",
  ".html": "text/html; charset=utf-8",
  ".js": "application/javascript; charset=utf-8",
  ".json": "application/json; charset=utf-8",
  ".svg": "image/svg+xml",
  ".png": "image/png",
  ".jpg": "image/jpeg",
  ".jpeg": "image/jpeg",
  ".gif": "image/gif",
  ".ico": "image/x-icon",
  ".webp": "image/webp"
};

function getNavidromeTarget(rawOrigin) {
  try {
    const target = new URL(rawOrigin || defaultNavidromeOrigin);
    if (!/^https?:$/.test(target.protocol)) {
      throw new Error("Unsupported protocol");
    }
    target.search = "";
    target.hash = "";
    return target;
  } catch {
    return new URL(defaultNavidromeOrigin);
  }
}

function navidromeScopeFromRequest(requestUrl) {
  const origin = getNavidromeTarget(
    allowClientOriginOverride ? requestUrl.searchParams.get("__origin") : ""
  );
  const user = String(requestUrl.searchParams.get("u") || "").trim().toLocaleLowerCase();
  return `${origin.toString()}|${user}`;
}

function navidromeAlbumCacheKey(requestUrl, albumId) {
  return `${navidromeScopeFromRequest(requestUrl)}|album:${albumId}`;
}

function pruneNavidromeAlbumCache() {
  if (navidromeAlbumCache.size <= navidromeAlbumCacheMaxItems) {
    return;
  }
  const records = [...navidromeAlbumCache.entries()]
    .sort((left, right) => Number(left[1].lastUsed || 0) - Number(right[1].lastUsed || 0));
  for (const [key] of records.slice(0, Math.max(0, records.length - navidromeAlbumCacheMaxItems))) {
    navidromeAlbumCache.delete(key);
  }
}

function buildNavidromeUrlFromClientRequest(requestUrl, path) {
  const origin = getNavidromeTarget(
    allowClientOriginOverride ? requestUrl.searchParams.get("__origin") : ""
  );
  const upstreamParams = new URLSearchParams(requestUrl.searchParams);
  upstreamParams.delete("__origin");
  upstreamParams.delete("ids");
  const originBasePath = origin.pathname.replace(/\/$/, "");
  const upstreamPath = `${originBasePath}${path}`.replace(/\/{2,}/g, "/");
  const upstreamUrl = new URL(upstreamPath, origin);
  upstreamUrl.search = upstreamParams.toString();
  return upstreamUrl;
}

async function fetchNavidromeJsonFromClientRequest(requestUrl, path) {
  const payload = await requestJson(buildNavidromeUrlFromClientRequest(requestUrl, path));
  const envelope = payload?.["subsonic-response"];
  if (!envelope || envelope.status !== "ok") {
    const message = envelope?.error?.message || payload?.error || "Navidrome request failed";
    throw new Error(message);
  }
  return payload;
}

async function getCachedNavidromeAlbum(requestUrl, albumId) {
  const key = navidromeAlbumCacheKey(requestUrl, albumId);
  const now = Date.now();
  const cached = navidromeAlbumCache.get(key);
  if (cached && now - cached.createdAt < navidromeAlbumCacheTtlMs) {
    cached.lastUsed = now;
    return cached.payload;
  }
  if (navidromeAlbumInflight.has(key)) {
    return navidromeAlbumInflight.get(key);
  }

  const albumRequestUrl = new URL(requestUrl.toString());
  albumRequestUrl.searchParams.set("id", albumId);
  const loadPromise = fetchNavidromeJsonFromClientRequest(albumRequestUrl, "/rest/getAlbum.view")
    .then((payload) => {
      navidromeAlbumCache.set(key, { createdAt: Date.now(), lastUsed: Date.now(), payload });
      pruneNavidromeAlbumCache();
      return payload;
    })
    .finally(() => {
      navidromeAlbumInflight.delete(key);
    });
  navidromeAlbumInflight.set(key, loadPromise);
  return loadPromise;
}

function warmCachedNavidromeAlbums(requestUrl, albumIds) {
  const uniqueIds = [...new Set(albumIds.map((id) => String(id || "").trim()).filter(Boolean))]
    .slice(0, navidromeAlbumWarmMaxItems);
  for (const albumId of uniqueIds) {
    const key = navidromeAlbumCacheKey(requestUrl, albumId);
    const cached = navidromeAlbumCache.get(key);
    if (cached && Date.now() - cached.createdAt < navidromeAlbumCacheTtlMs) {
      cached.lastUsed = Date.now();
      continue;
    }
    if (navidromeAlbumInflight.has(key)) {
      continue;
    }
    getCachedNavidromeAlbum(requestUrl, albumId).catch(() => {});
  }
  return uniqueIds.length;
}

function audioCacheInfoFromRequest(requestUrl) {
  const trackId = String(requestUrl.searchParams.get("id") || "").trim();
  if (!trackId) {
    return null;
  }
  const format = String(requestUrl.searchParams.get("format") || "mp3").trim().toLowerCase();
  const maxBitRate = String(requestUrl.searchParams.get("maxBitRate") || "320").trim();
  const scope = navidromeScopeFromRequest(requestUrl);
  const digest = createHash("sha256")
    .update(`${scope}|stream:${trackId}|${format}|${maxBitRate}`)
    .digest("hex");
  const extension = format && /^[a-z0-9]{2,5}$/.test(format) ? format : "mp3";
  return {
    trackId,
    format,
    maxBitRate,
    key: digest,
    filePath: join(audioCacheDir, `${digest}.${extension}`),
    tmpPath: join(audioCacheDir, `${digest}.${process.pid}.tmp`),
    contentType: extension === "mp3" ? "audio/mpeg" : "application/octet-stream"
  };
}

async function cachedAudioReady(info) {
  try {
    const fileStats = await stat(info.filePath);
    return fileStats.isFile() && fileStats.size > 0 ? fileStats : null;
  } catch {
    return null;
  }
}

function downloadAudioToCache(requestUrl, info) {
  const existing = audioCacheInflight.get(info.key);
  if (existing) {
    return existing;
  }

  const upstreamUrl = buildNavidromeUrlFromClientRequest(requestUrl, "/rest/stream.view");
  upstreamUrl.searchParams.set("id", info.trackId);
  upstreamUrl.searchParams.set("format", info.format || "mp3");
  upstreamUrl.searchParams.set("maxBitRate", info.maxBitRate || "320");
  upstreamUrl.searchParams.delete("estimateContentLength");

  const promise = mkdir(audioCacheDir, { recursive: true })
    .then(() => new Promise((resolve, reject) => {
      const requestImpl = upstreamUrl.protocol === "https:" ? httpsRequest : httpRequest;
      const upstreamReq = requestImpl(
        upstreamUrl,
        {
          headers: {
            accept: "audio/*,*/*;q=0.8",
            "user-agent": "NaviGlassPlayer/0.1"
          }
        },
        (upstreamRes) => {
          if ((upstreamRes.statusCode || 500) >= 400) {
            upstreamRes.resume();
            reject(new Error(`Navidrome stream returned HTTP ${upstreamRes.statusCode}`));
            return;
          }
          const writer = createWriteStream(info.tmpPath);
          upstreamRes.pipe(writer);
          upstreamRes.on("error", reject);
          writer.on("error", reject);
          writer.on("finish", resolve);
        }
      );
      upstreamReq.setTimeout(120000, () => {
        upstreamReq.destroy(new Error("Audio cache download timed out"));
      });
      upstreamReq.on("error", reject);
      upstreamReq.end();
    }))
    .then(async () => {
      await rename(info.tmpPath, info.filePath);
      return info.filePath;
    })
    .catch(async (error) => {
      await unlink(info.tmpPath).catch(() => {});
      throw error;
    })
    .finally(() => {
      audioCacheInflight.delete(info.key);
    });

  audioCacheInflight.set(info.key, promise);
  return promise;
}

function parseByteRange(rangeHeader, fileSize) {
  const match = String(rangeHeader || "").match(/^bytes=(\d*)-(\d*)$/);
  if (!match) {
    return null;
  }
  let start = match[1] ? Number(match[1]) : 0;
  let end = match[2] ? Number(match[2]) : fileSize - 1;
  if (!match[1] && match[2]) {
    const suffixLength = Number(match[2]);
    start = Math.max(0, fileSize - suffixLength);
    end = fileSize - 1;
  }
  if (!Number.isFinite(start) || !Number.isFinite(end) || start < 0 || end < start || start >= fileSize) {
    return null;
  }
  return { start, end: Math.min(end, fileSize - 1) };
}

function requestedRangeStart(rangeHeader) {
  const match = String(rangeHeader || "").match(/^bytes=(\d*)-(\d*)$/);
  if (!match || !match[1]) {
    return 0;
  }
  const start = Number(match[1]);
  return Number.isFinite(start) ? start : 0;
}

async function waitForCachedAudio(info, timeoutMs = audioCacheSeekWaitMs) {
  const cachePromise = audioCacheInflight.get(info.key);
  if (!cachePromise) {
    return null;
  }
  try {
    await Promise.race([
      cachePromise,
      new Promise((resolve) => setTimeout(resolve, timeoutMs))
    ]);
  } catch {
    return null;
  }
  return cachedAudioReady(info);
}

function serveCachedAudioFile(req, res, info, fileSize) {
  const range = parseByteRange(req.headers.range, fileSize);
  const headers = {
    "content-type": info.contentType,
    "accept-ranges": "bytes",
    "cache-control": "private, max-age=86400"
  };

  if (req.headers.range && !range) {
    res.writeHead(416, {
      ...headers,
      "content-range": `bytes */${fileSize}`
    });
    res.end();
    return;
  }

  if (range) {
    const contentLength = range.end - range.start + 1;
    res.writeHead(206, {
      ...headers,
      "content-length": contentLength,
      "content-range": `bytes ${range.start}-${range.end}/${fileSize}`
    });
    if (req.method === "HEAD") {
      res.end();
      return;
    }
    createReadStream(info.filePath, { start: range.start, end: range.end }).pipe(res);
    return;
  }

  res.writeHead(200, {
    ...headers,
    "content-length": fileSize
  });
  if (req.method === "HEAD") {
    res.end();
    return;
  }
  createReadStream(info.filePath).pipe(res);
}

function proxyAudioToNavidrome(req, res, requestUrl) {
  const upstreamUrl = buildNavidromeUrlFromClientRequest(requestUrl, "/rest/stream.view");
  const requestImpl = upstreamUrl.protocol === "https:" ? httpsRequest : httpRequest;
  const headers = { ...req.headers };
  delete headers.host;
  delete headers.connection;

  const upstreamReq = requestImpl(
    upstreamUrl,
    {
      method: req.method,
      headers
    },
    (proxyRes) => {
      const responseHeaders = { ...proxyRes.headers };
      delete responseHeaders["content-security-policy"];
      responseHeaders["accept-ranges"] = responseHeaders["accept-ranges"] || "bytes";
      responseHeaders["cache-control"] = "no-store";
      res.writeHead(proxyRes.statusCode || 502, responseHeaders);
      proxyRes.pipe(res);
      proxyRes.on("error", (error) => {
        if (!res.headersSent) {
          writeJson(res, 502, {
            error: "Interrupted Navidrome stream",
            details: error.message
          });
        } else {
          res.destroy(error);
        }
      });
    }
  );

  upstreamReq.on("error", (error) => {
    if (res.destroyed) {
      return;
    }
    if (res.headersSent) {
      res.destroy(error);
      return;
    }
    writeJson(res, 502, {
      error: "Unable to stream from Navidrome",
      details: error.message
    });
  });

  res.on("close", () => {
    upstreamReq.destroy();
  });

  req.pipe(upstreamReq);
}

async function serveCachedAudio(req, res, requestUrl) {
  const info = audioCacheInfoFromRequest(requestUrl);
  if (!info) {
    writeJson(res, 400, { error: "Missing track id" });
    return;
  }
  const ready = await cachedAudioReady(info);
  if (ready) {
    serveCachedAudioFile(req, res, info, ready.size);
    return;
  }
  const cachePromise = downloadAudioToCache(requestUrl, info);
  if (req.headers.range && requestedRangeStart(req.headers.range) > 0) {
    const warmed = await waitForCachedAudio(info);
    if (warmed) {
      serveCachedAudioFile(req, res, info, warmed.size);
      return;
    }
  }
  cachePromise.catch(() => {});
  proxyAudioToNavidrome(req, res, requestUrl);
}

async function getAudioCacheStatus(requestUrl) {
  const info = audioCacheInfoFromRequest(requestUrl);
  if (!info) {
    return null;
  }
  const ready = await cachedAudioReady(info);
  return {
    ok: true,
    ready: Boolean(ready),
    caching: audioCacheInflight.has(info.key),
    size: ready?.size || 0
  };
}

async function warmCachedAudio(requestUrl) {
  const info = audioCacheInfoFromRequest(requestUrl);
  if (!info) {
    return null;
  }
  const ready = await cachedAudioReady(info);
  if (ready) {
    return { ok: true, ready: true, caching: false, size: ready.size };
  }
  downloadAudioToCache(requestUrl, info).catch(() => {});
  return { ok: true, ready: false, caching: true, size: 0 };
}

function writeJson(res, statusCode, payload) {
  res.writeHead(statusCode, {
    "content-type": "application/json; charset=utf-8",
    "cache-control": "no-store"
  });
  res.end(JSON.stringify(payload, null, 2));
}

function requestJson(url, timeoutMs = 12000) {
  return new Promise((resolve, reject) => {
    const requestImpl = url.protocol === "https:" ? httpsRequest : httpRequest;
    const upstreamReq = requestImpl(
      url,
      {
        headers: {
          accept: "application/json",
          "user-agent": "NaviGlassPlayer/0.1"
        }
      },
      (upstreamRes) => {
        const chunks = [];
        let size = 0;
        upstreamRes.on("data", (chunk) => {
          size += chunk.length;
          if (size > 3_000_000) {
            upstreamReq.destroy(new Error("Radio search response was too large"));
            return;
          }
          chunks.push(chunk);
        });
        upstreamRes.on("end", () => {
          if ((upstreamRes.statusCode || 500) >= 400) {
            reject(new Error(`Radio Browser returned HTTP ${upstreamRes.statusCode}`));
            return;
          }
          try {
            resolve(JSON.parse(Buffer.concat(chunks).toString("utf8")));
          } catch {
            reject(new Error("Radio Browser returned invalid JSON"));
          }
        });
      }
    );
    upstreamReq.setTimeout(timeoutMs, () => {
      upstreamReq.destroy(new Error("Radio Browser request timed out"));
    });
    upstreamReq.on("error", reject);
    upstreamReq.end();
  });
}

function normalizeRadioBrowserStation(station) {
  const streamUrl = String(station?.url_resolved || station?.url || "").trim();
  const name = String(station?.name || "").trim();
  if (!streamUrl || !name || !/^https?:\/\//i.test(streamUrl)) {
    return null;
  }
  const token = randomBytes(18).toString("base64url");
  communityRadioStreams.set(token, {
    streamUrl,
    favicon: String(station.favicon || ""),
    expiresAt: Date.now() + communityRadioStreamTtlMs
  });
  return {
    id: String(station.stationuuid || streamUrl),
    externalUuid: String(station.stationuuid || ""),
    name,
    streamUrl,
    previewUrl: `/api/radio/stream?token=${encodeURIComponent(token)}`,
    iconUrl: `/api/radio/icon?token=${encodeURIComponent(token)}`,
    homePageUrl: String(station.homepage || ""),
    favicon: String(station.favicon || ""),
    country: String(station.countrycode || station.country || ""),
    language: String(station.language || "").replaceAll(";", ", "),
    tags: String(station.tags || "").replaceAll(";", ", "),
    codec: String(station.codec || ""),
    bitRate: Number(station.bitrate || 0),
    clickCount: Number(station.clickcount || 0),
    source: "radio-browser"
  };
}

function proxyCommunityRadioIcon(req, res, token, redirectCount = 0) {
  const station = communityRadioStreams.get(token);
  if (!station || station.expiresAt < Date.now() || !/^https?:\/\//i.test(station.favicon || "")) {
    writeJson(res, 404, { error: "Radio station logo unavailable" });
    return;
  }

  const upstreamUrl = new URL(station.favicon);
  const requestImpl = upstreamUrl.protocol === "https:" ? httpsRequest : httpRequest;
  const upstreamReq = requestImpl(
    upstreamUrl,
    {
      headers: {
        accept: "image/*,*/*;q=0.8",
        "user-agent": "NaviGlassPlayer/0.1"
      }
    },
    (upstreamRes) => {
      const location = upstreamRes.headers.location;
      if (location && [301, 302, 303, 307, 308].includes(upstreamRes.statusCode || 0)) {
        upstreamRes.resume();
        if (redirectCount >= 5) {
          writeJson(res, 502, { error: "Radio logo redirected too many times" });
          return;
        }
        station.favicon = new URL(location, upstreamUrl).toString();
        proxyCommunityRadioIcon(req, res, token, redirectCount + 1);
        return;
      }
      const contentType = String(upstreamRes.headers["content-type"] || "");
      if (!contentType.startsWith("image/")) {
        upstreamRes.resume();
        writeJson(res, 404, { error: "Radio station logo unavailable" });
        return;
      }
      res.writeHead(upstreamRes.statusCode || 502, {
        "content-type": contentType,
        "cache-control": "public, max-age=86400"
      });
      upstreamRes.pipe(res);
      upstreamRes.on("error", (error) => res.destroy(error));
    }
  );
  upstreamReq.setTimeout(12000, () => upstreamReq.destroy(new Error("Radio logo timed out")));
  upstreamReq.on("error", (error) => {
    if (!res.headersSent) {
      writeJson(res, 502, { error: "Unable to load radio logo", details: error.message });
    } else {
      res.destroy(error);
    }
  });
  res.on("close", () => upstreamReq.destroy());
  upstreamReq.end();
}

function proxyCommunityRadioStream(req, res, token, redirectCount = 0) {
  const stream = communityRadioStreams.get(token);
  if (!stream || stream.expiresAt < Date.now()) {
    communityRadioStreams.delete(token);
    writeJson(res, 404, { error: "Radio preview expired. Search for the station again." });
    return;
  }

  const upstreamUrl = new URL(stream.streamUrl);
  const requestImpl = upstreamUrl.protocol === "https:" ? httpsRequest : httpRequest;
  const upstreamReq = requestImpl(
    upstreamUrl,
    {
      headers: {
        accept: "audio/*,*/*;q=0.8",
        "user-agent": "NaviGlassPlayer/0.1"
      }
    },
    (upstreamRes) => {
      const location = upstreamRes.headers.location;
      if (location && [301, 302, 303, 307, 308].includes(upstreamRes.statusCode || 0)) {
        upstreamRes.resume();
        if (redirectCount >= 5) {
          writeJson(res, 502, { error: "Radio stream redirected too many times" });
          return;
        }
        communityRadioStreams.set(token, {
          ...stream,
          streamUrl: new URL(location, upstreamUrl).toString(),
          expiresAt: Date.now() + communityRadioStreamTtlMs
        });
        proxyCommunityRadioStream(req, res, token, redirectCount + 1);
        return;
      }

      const headers = { ...upstreamRes.headers };
      delete headers["content-security-policy"];
      delete headers["content-length"];
      res.writeHead(upstreamRes.statusCode || 502, headers);
      upstreamRes.pipe(res);
      upstreamRes.on("error", (error) => res.destroy(error));
    }
  );
  upstreamReq.setTimeout(15000, () => upstreamReq.destroy(new Error("Radio stream timed out")));
  upstreamReq.on("error", (error) => {
    if (!res.headersSent) {
      writeJson(res, 502, { error: "Unable to open radio stream", details: error.message });
    } else {
      res.destroy(error);
    }
  });
  res.on("close", () => upstreamReq.destroy());
  upstreamReq.end();
}

async function searchCommunityRadio(requestUrl) {
  for (const [token, stream] of communityRadioStreams) {
    if (stream.expiresAt < Date.now()) {
      communityRadioStreams.delete(token);
    }
  }
  const query = String(requestUrl.searchParams.get("q") || "").trim();
  const streamUrl = String(requestUrl.searchParams.get("streamUrl") || "").trim();
  const limit = Math.max(1, Math.min(80, Number(requestUrl.searchParams.get("limit") || 40)));
  const offset = Math.max(0, Number(requestUrl.searchParams.get("offset") || 0));
  if (query.length < 2 && !/^https?:\/\//i.test(streamUrl)) {
    return { stations: [], limit, offset, hasMore: false };
  }

  const cacheKey = `${query.toLocaleLowerCase()}|${streamUrl}|${limit}|${offset}`;
  const cached = radioSearchCache.get(cacheKey);
  if (cached && Date.now() - cached.createdAt < radioSearchCacheTtlMs) {
    return cached.payload;
  }

  let lastError = new Error("Community radio search failed");
  for (const origin of radioBrowserOrigins) {
    try {
      let rawStations = [];
      if (/^https?:\/\//i.test(streamUrl)) {
        try {
          rawStations = await requestJson(
            new URL(`/json/stations/byurl/${encodeURIComponent(streamUrl)}`, origin)
          );
        } catch {
          rawStations = [];
        }
      }
      if ((!Array.isArray(rawStations) || !rawStations.length) && query.length >= 2) {
        const url = new URL("/json/stations/search", origin);
        url.searchParams.set("name", query);
        url.searchParams.set("limit", String(limit));
        url.searchParams.set("offset", String(offset));
        url.searchParams.set("hidebroken", "true");
        url.searchParams.set("order", "clickcount");
        url.searchParams.set("reverse", "true");
        rawStations = await requestJson(url);
      }
      const stations = Array.isArray(rawStations)
        ? rawStations.map(normalizeRadioBrowserStation).filter(Boolean)
        : [];
      const payload = {
        stations,
        limit,
        offset,
        hasMore: stations.length >= limit
      };
      radioSearchCache.set(cacheKey, { createdAt: Date.now(), payload });
      return payload;
    } catch (error) {
      lastError = error;
    }
  }
  throw lastError;
}

async function serveStatic(req, res, requestUrl) {
  const requestedPath =
    requestUrl.pathname === "/" ? "/index.html" : requestUrl.pathname;
  const relativePath = normalize(requestedPath)
    .replace(/^(\.\.(\/|\\|$))+/, "")
    .replace(/^[/\\]+/, "");
  const filePath = join(publicDir, relativePath);

  if (!filePath.startsWith(publicDir)) {
    writeJson(res, 403, { error: "Forbidden" });
    return;
  }

  try {
    const fileStats = await stat(filePath);
    if (!fileStats.isFile()) {
      writeJson(res, 404, { error: "Not found" });
      return;
    }

    const ext = extname(filePath).toLowerCase();
    const contentType = mimeTypes[ext] || "application/octet-stream";

    res.writeHead(200, {
      "content-type": contentType,
      "cache-control": "no-store"
    });

    if (req.method === "HEAD") {
      res.end();
      return;
    }

    createReadStream(filePath).pipe(res);
  } catch {
    writeJson(res, 404, { error: "Not found" });
  }
}

function proxyToNavidrome(req, res, requestUrl) {
  const origin = getNavidromeTarget(
    allowClientOriginOverride ? requestUrl.searchParams.get("__origin") : ""
  );
  requestUrl.searchParams.delete("__origin");

  const originBasePath = origin.pathname.replace(/\/$/, "");
  const requestPath = requestUrl.pathname.replace(/^\/navidrome/, "") || "/";
  const upstreamPath = `${originBasePath}${requestPath}`.replace(/\/{2,}/g, "/");
  const upstreamUrl = new URL(upstreamPath, origin);
  upstreamUrl.search = requestUrl.searchParams.toString();

  const requestImpl = upstreamUrl.protocol === "https:" ? httpsRequest : httpRequest;
  const headers = { ...req.headers };
  delete headers.host;
  delete headers.connection;

  const proxyReq = requestImpl(
    upstreamUrl,
    {
      method: req.method,
      headers
    },
    (proxyRes) => {
      const responseHeaders = { ...proxyRes.headers };
      delete responseHeaders["content-security-policy"];

      res.writeHead(proxyRes.statusCode || 502, responseHeaders);
      proxyRes.pipe(res);
      proxyRes.on("error", (error) => {
        if (!res.headersSent) {
          writeJson(res, 502, {
            error: "Interrupted Navidrome stream",
            details: error.message
          });
        } else {
          res.destroy(error);
        }
      });
    }
  );

  proxyReq.on("error", (error) => {
    if (res.destroyed) {
      return;
    }
    if (res.headersSent) {
      res.destroy(error);
      return;
    }
    writeJson(res, 502, {
      error: "Unable to reach Navidrome",
      details: error.message
    });
  });

  res.on("close", () => {
    proxyReq.destroy();
  });

  req.pipe(proxyReq);
}

createServer(async (req, res) => {
  const requestUrl = new URL(req.url || "/", `http://${req.headers.host || host}`);

  if (requestUrl.pathname.startsWith("/navidrome/")) {
    proxyToNavidrome(req, res, requestUrl);
    return;
  }

  if (requestUrl.pathname === "/api/radio/search") {
    try {
      writeJson(res, 200, await searchCommunityRadio(requestUrl));
    } catch (error) {
      writeJson(res, 502, {
        error: "Unable to search community radio",
        details: error.message
      });
    }
    return;
  }

  if (requestUrl.pathname === "/api/cache/navidrome/album") {
    const albumId = String(requestUrl.searchParams.get("id") || "").trim();
    if (!albumId) {
      writeJson(res, 400, { error: "Missing album id" });
      return;
    }
    try {
      writeJson(res, 200, await getCachedNavidromeAlbum(requestUrl, albumId));
    } catch (error) {
      writeJson(res, 502, {
        error: "Unable to load cached album details",
        details: error.message
      });
    }
    return;
  }

  if (requestUrl.pathname === "/api/cache/navidrome/stream") {
    serveCachedAudio(req, res, requestUrl).catch((error) => {
      if (!res.headersSent) {
        writeJson(res, 502, {
          error: "Unable to serve cached audio",
          details: error.message
        });
      } else {
        res.destroy(error);
      }
    });
    return;
  }

  if (requestUrl.pathname === "/api/cache/navidrome/stream-status") {
    try {
      const status = await getAudioCacheStatus(requestUrl);
      if (!status) {
        writeJson(res, 400, { error: "Missing track id" });
        return;
      }
      writeJson(res, 200, status);
    } catch (error) {
      writeJson(res, 502, {
        error: "Unable to inspect audio cache",
        details: error.message
      });
    }
    return;
  }

  if (requestUrl.pathname === "/api/cache/navidrome/warm-stream") {
    try {
      const status = await warmCachedAudio(requestUrl);
      if (!status) {
        writeJson(res, 400, { error: "Missing track id" });
        return;
      }
      writeJson(res, 202, status);
    } catch (error) {
      writeJson(res, 502, {
        error: "Unable to warm audio cache",
        details: error.message
      });
    }
    return;
  }

  if (requestUrl.pathname === "/api/cache/navidrome/warm-albums") {
    const albumIds = String(requestUrl.searchParams.get("ids") || "")
      .split(",")
      .map((id) => id.trim())
      .filter(Boolean);
    try {
      const queued = warmCachedNavidromeAlbums(requestUrl, albumIds);
      writeJson(res, 202, { ok: true, queued });
    } catch (error) {
      writeJson(res, 502, {
        error: "Unable to warm album cache",
        details: error.message
      });
    }
    return;
  }

  if (requestUrl.pathname === "/api/radio/stream") {
    proxyCommunityRadioStream(req, res, String(requestUrl.searchParams.get("token") || ""));
    return;
  }

  if (requestUrl.pathname === "/api/radio/icon") {
    proxyCommunityRadioIcon(req, res, String(requestUrl.searchParams.get("token") || ""));
    return;
  }

  serveStatic(req, res, requestUrl);
}).listen(port, host, () => {
  console.log(
    `NaviGlassPlayer running at http://${host}:${port} (default proxy target: ${defaultNavidromeOrigin})`
  );
});
