import test from "node:test";
import assert from "node:assert/strict";
import { browserPlaybackProfile, createPlaybackDecisions, decisionStreamParams } from "../public/navidrome-playback.js";

const chromeProbe = (mime) => mime.includes('codecs="alac"') ? "" : "probably";
const token = (expiry) => `header.${Buffer.from(JSON.stringify({ exp: expiry })).toString("base64url")}.signature`;
const decision = (expiry = 300) => ({ canDirectPlay: true, transcodeParams: token(expiry) });

test("codec probes distinguish ALAC from AAC despite sharing an MP4 container", () => {
    const profile = browserPlaybackProfile(chromeProbe, "Chrome Safari");
    assert.ok(profile.directPlayProfiles.some((item) => item.audioCodecs.includes("aac")));
    assert.ok(!profile.directPlayProfiles.some((item) => item.audioCodecs.includes("alac")));
    assert.deepEqual(profile.transcodingProfiles.map((item) => item.audioCodec), ["flac", "opus", "mp3"]);
    assert.ok(profile.directPlayProfiles.some((item) => item.audioCodecs.includes("wav")));
});

test("generic container support alone never advertises AAC or ALAC", () => {
    const profile = browserPlaybackProfile((mime) => mime === "audio/mp4" ? "probably" : "");
    assert.deepEqual(profile.directPlayProfiles, []);
});

test("Safari and decoder-failure compatibility profiles use MP3 conversions", () => {
    assert.deepEqual(browserPlaybackProfile(chromeProbe, "Version Safari").transcodingProfiles.map((item) => item.audioCodec), ["mp3"]);
    const compatibility = browserPlaybackProfile(chromeProbe, "Chrome Safari", true);
    assert.deepEqual(compatibility.directPlayProfiles, []);
    assert.deepEqual(compatibility.transcodingProfiles.map((item) => item.audioCodec), ["mp3"]);
});

test("signed stream parameters require a usable server decision", () => {
    const selected = decision();
    assert.deepEqual(decisionStreamParams("song", selected), { mediaId: "song", mediaType: "song", transcodeParams: selected.transcodeParams });
    assert.equal(decisionStreamParams("song", selected, 125.7).offset, 125);
    assert.equal(decisionStreamParams("song", selected, 0).offset, undefined);
    assert.throws(() => decisionStreamParams("song", { errorReason: "No encoder", transcodeParams: "x" }), /No encoder/);
    assert.throws(() => decisionStreamParams("song", null));
});

test("deduplicates preparation, expires signed tokens early and separates compatibility decisions", async () => {
    let now = 0;
    const calls = [];
    const normal = { name: "normal" }, compatibility = { name: "compatible" };
    const service = createPlaybackDecisions(async (id, profile) => {
        calls.push([id, profile.name]);
        return decision(now / 1000 + 300);
    }, normal, compatibility, () => now);
    await Promise.all([service.resolve("song"), service.resolve("song")]);
    await service.resolve("song");
    assert.equal(calls.length, 1);
    await service.resolve("song", true);
    assert.deepEqual(calls[1], ["song", "compatible"]);
    now = 241000;
    assert.equal(service.peek("song"), null);
    await service.resolve("song");
    assert.equal(calls.length, 3);
    service.invalidate("song");
    assert.equal(service.peek("song", true), null);
});

test("credential changes cannot repopulate the decision cache from old requests", async () => {
    let complete;
    const service = createPlaybackDecisions(() => new Promise((resolve) => { complete = resolve; }), {}, {}, () => 0);
    const old = service.resolve("song");
    await Promise.resolve();
    service.invalidate();
    complete(decision());
    await old;
    assert.equal(service.peek("song"), null);
});

test("prefetch is bounded and preparation failures can be retried", async () => {
    const calls = [];
    const service = createPlaybackDecisions(async (id) => {
        calls.push(id);
        if (calls.length === 1) throw new Error("temporarily offline");
        return decision();
    }, {}, {}, () => 0);
    await service.prefetch(["a", "a", "b", "c", "d"]);
    assert.deepEqual(calls, ["a", "b", "c"]);
    await service.resolve("a");
    assert.equal(calls.length, 4);
});
