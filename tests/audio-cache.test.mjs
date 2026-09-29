import test, { before, after } from "node:test";
import assert from "node:assert/strict";
import { createServer } from "node:http";
import { mkdtemp, rm, readdir } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { once } from "node:events";

let player, upstream, origin, cacheDir;
const requests = new Map();
const audio = Buffer.alloc(4096, 42);
let finishSlowStream;

before(async () => {
    upstream = createServer((req, res) => {
        const url = new URL(req.url, "http://localhost");
        if (url.pathname === "/rest/getTranscodeDecision") {
            assert.equal(req.method, "POST");
            let body = "";
            req.on("data", (chunk) => { body += chunk; });
            req.on("end", () => {
                assert.equal(JSON.parse(body).name, "NaviGlassPlayer");
                res.writeHead(200, { "content-type": "application/json" });
                res.end(JSON.stringify({ "subsonic-response": { status: "ok", transcodeDecision: { canDirectPlay: true, transcodeParams: "signed-token" } } }));
            });
            return;
        }
        if (url.pathname === "/rest/getTranscodeStream") {
            if (url.searchParams.get("transcodeParams") === "expired") {
                res.writeHead(410); res.end(); return;
            }
            if (url.searchParams.has("offset")) {
                assert.equal(url.searchParams.get("offset"), "172");
                assert.equal(req.headers.range, undefined);
                res.writeHead(200, { "content-type": "audio/flac", "accept-ranges": "none" });
                res.end(audio.subarray(0, 100));
                return;
            }
            assert.equal(req.headers.range, "bytes=100-199");
            res.writeHead(206, { "content-type": "audio/flac", "accept-ranges": "bytes", "content-length": 100, "content-range": "bytes 100-199/4096" });
            res.end(audio.subarray(100, 200));
            return;
        }
        if (url.pathname === "/rest/ping.view") {
            res.writeHead(200, { "content-type": "application/json" });
            res.end(JSON.stringify({ "subsonic-response": { status: url.searchParams.get("p") === "test-password" ? "ok" : "failed" } }));
            return;
        }
        const id = url.searchParams.get("id");
        requests.set(id, (requests.get(id) || 0) + 1);
        if (id === "xml") {
            res.writeHead(200, { "content-type": "text/xml" });
            res.end("<subsonic-response status='failed'/>");
            return;
        }
        const raw = url.searchParams.get("format") === "raw";
        const range = req.headers.range?.match(/^bytes=(\d+)-(\d*)$/);
        if (raw && range) {
            const start = Number(range[1]);
            const end = range[2] ? Number(range[2]) : audio.length - 1;
            res.writeHead(206, { "content-type": "audio/mpeg", "accept-ranges": "bytes", "content-length": end - start + 1, "content-range": `bytes ${start}-${end}/${audio.length}` });
            res.end(audio.subarray(start, end + 1));
            return;
        }
        res.writeHead(200, { "content-type": "audio/mpeg", ...(raw ? { "accept-ranges": "bytes", "content-length": audio.length } : {}) });
        if (id === "slow" || id === "cold-range") {
            res.write(audio.subarray(0, 64));
            finishSlowStream = () => res.end(audio.subarray(64));
        } else res.end(audio);
    });
    upstream.listen(0, "127.0.0.1");
    await once(upstream, "listening");
    cacheDir = await mkdtemp(join(tmpdir(), "naviglass-audio-test-"));
    process.env.NAVIDROME_ORIGIN = `http://127.0.0.1:${upstream.address().port}`;
    process.env.AUDIO_CACHE_DIR = cacheDir;
    process.env.AUDIO_CACHE_SEEK_WAIT_MS = "1000";
    ({ server: player } = await import("../server.mjs"));
    player.listen(0, "127.0.0.1");
    await once(player, "listening");
    origin = `http://127.0.0.1:${player.address().port}`;
});

after(async () => {
    finishSlowStream?.();
    player?.closeAllConnections();
    upstream?.closeAllConnections();
    await Promise.all([player, upstream].filter(Boolean).map((server) => new Promise((resolve) => server.close(resolve))));
    if (cacheDir) await rm(cacheDir, { recursive: true, force: true });
});

const url = (path, id, format = "raw") => `${origin}/api/cache/navidrome/${path}?u=test-user&p=test-password&id=${id}&format=${format}&maxBitRate=${format === "raw" ? 0 : 320}&suffix=mp3`;

async function ready(id, format = "raw") {
    for (let attempt = 0; attempt < 100; attempt += 1) {
        const status = await fetch(url("stream-status", id, format)).then((res) => res.json());
        if (status.ready) return status;
        await new Promise((resolve) => setTimeout(resolve, 10));
    }
    assert.fail(`cache did not finish for ${id}`);
}

test("initial playback fills the cache with only one upstream download", async () => {
    const response = await fetch(url("stream", "single"));
    assert.equal(response.status, 200);
    assert.deepEqual(Buffer.from(await response.arrayBuffer()), audio);
    await ready("single");
    assert.equal(requests.get("single"), 1);
    const seek = await fetch(url("stream", "single"), { headers: { range: "bytes=100-199" } });
    assert.equal(seek.status, 206);
    assert.equal(seek.headers.get("content-range"), "bytes 100-199/4096");
    assert.equal(seek.headers.get("content-type"), "audio/mpeg");
    assert.deepEqual(Buffer.from(await seek.arrayBuffer()), audio.subarray(100, 200));
    assert.equal(requests.get("single"), 1);
});

test("a cold original-file seek forwards the real byte range without waiting for a full download", async () => {
    const seek = await fetch(url("stream", "cold-range"), { headers: { range: "bytes=2000-2099" } });
    assert.equal(seek.status, 206);
    assert.equal(seek.headers.get("content-range"), "bytes 2000-2099/4096");
    assert.equal((await seek.arrayBuffer()).byteLength, 100);
    const status = await fetch(url("stream-status", "cold-range")).then((res) => res.json());
    assert.equal(status.ready, false);
    assert.equal(status.caching, true);
    finishSlowStream();
    await ready("cold-range");
});

test("playback begins progressively before the full file is cached; disconnect does not cancel warming", async () => {
    const abort = new AbortController();
    const response = await fetch(url("stream", "slow"), { signal: abort.signal });
    const firstChunk = await response.body.getReader().read();
    assert.equal(firstChunk.value.length, 64);
    const status = await fetch(url("stream-status", "slow")).then((res) => res.json());
    assert.equal(status.ready, false);
    assert.equal(status.caching, true);
    assert.equal(requests.get("slow"), 1);
    abort.abort();
    finishSlowStream();
    await ready("slow");
});

test("live transcoding does not falsely advertise byte-range support", async () => {
    const response = await fetch(url("stream", "transcode", "mp3"));
    assert.equal(response.headers.get("accept-ranges"), null);
    await response.arrayBuffer();
    await ready("transcode", "mp3");
    const seek = await fetch(url("stream", "transcode", "mp3"), { headers: { range: "bytes=-64" } });
    assert.equal(seek.status, 206);
    assert.equal((await seek.arrayBuffer()).byteLength, 64);
});

test("cached files reject invalid ranges", async () => {
    const response = await fetch(url("stream", "single"), { headers: { range: "bytes=99999-" } });
    assert.equal(response.status, 416);
    assert.equal(response.headers.get("content-range"), "bytes */4096");
    await response.arrayBuffer();
});

test("HTTP-200 XML failures are never cached as songs", async () => {
    const response = await fetch(url("stream", "xml"));
    assert.equal(response.status, 502);
    await response.json();
    const status = await fetch(url("stream-status", "xml")).then((res) => res.json());
    assert.equal(status.ready, false);
    assert.equal(status.caching, false);
});

test("a cached song cannot be retrieved with missing or incorrect credentials", async () => {
    for (const password of [null, "incorrect-password"]) {
        const requestUrl = new URL(url("stream", "single"));
        if (password === null) requestUrl.searchParams.delete("p");
        else requestUrl.searchParams.set("p", password);
        const response = await fetch(requestUrl);
        assert.equal(response.status, 401);
        await response.json();
    }
});

test("decision POSTs and signed byte-range streams pass through without a second audio cache", async () => {
    const filesBefore = await readdir(cacheDir);
    const response = await fetch(`${origin}/navidrome/rest/getTranscodeDecision?mediaId=song&f=json`, {
        method: "POST", headers: { "content-type": "application/json" }, body: JSON.stringify({ name: "NaviGlassPlayer" }),
    });
    assert.equal((await response.json())["subsonic-response"].transcodeDecision.canDirectPlay, true);
    const stream = await fetch(`${origin}/navidrome/rest/getTranscodeStream?mediaId=song&transcodeParams=signed-token`, { headers: { range: "bytes=100-199" } });
    assert.equal(stream.status, 206);
    assert.equal(stream.headers.get("content-type"), "audio/flac");
    assert.equal(stream.headers.get("content-range"), "bytes 100-199/4096");
    assert.deepEqual(Buffer.from(await stream.arrayBuffer()), audio.subarray(100, 200));
    const offset = await fetch(`${origin}/navidrome/rest/getTranscodeStream?mediaId=song&transcodeParams=signed-token&offset=172`);
    assert.equal(offset.status, 200);
    assert.equal(offset.headers.get("content-type"), "audio/flac");
    assert.equal(offset.headers.get("accept-ranges"), "none");
    assert.equal((await offset.arrayBuffer()).byteLength, 100);
    assert.deepEqual(await readdir(cacheDir), filesBefore);
    const expired = await fetch(`${origin}/navidrome/rest/getTranscodeStream?transcodeParams=expired`);
    assert.equal(expired.status, 410);
    await expired.arrayBuffer();
});
