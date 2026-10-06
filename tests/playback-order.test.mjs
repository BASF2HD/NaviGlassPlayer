import test from "node:test";
import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import { runInNewContext } from "node:vm";
import {
    normalizeRepeatMode, nextRepeatMode, buildPlaybackOrder, playbackStep, samePlaybackQueue,
} from "../public/playback-order.js";

test("repeat cycles off, all, song, off and rejects invalid saved values", () => {
    assert.equal(normalizeRepeatMode("invalid"), "off");
    assert.equal(nextRepeatMode("off"), "all");
    assert.equal(nextRepeatMode("all"), "song");
    assert.equal(nextRepeatMode("song"), "off");
});

test("shuffle keeps the current track first and visits every queue position once", () => {
    for (const length of [0, 1, 2, 12, 10000]) {
        const current = Math.max(0, length - 2);
        const order = buildPlaybackOrder(length, current, true, () => 0);
        assert.equal(order.length, length);
        assert.equal(new Set(order).size, length);
        if (length) assert.equal(order[0], current);
        assert.deepEqual([...order].sort((a, b) => a - b), buildPlaybackOrder(length, current, false));
        let index = current;
        const visited = length ? [index] : [];
        for (let count = 1; count < length; count += 1) {
            index = playbackStep(order, index, 1, "off", true);
            visited.push(index);
        }
        assert.deepEqual(visited, order);
        assert.equal(playbackStep(order, index, 1, "off", true), null);
    }
});

test("repeat all wraps in both directions; repeat song affects only automatic advance", () => {
    const order = [2, 0, 1];
    assert.equal(playbackStep(order, 1, 1, "all", true), 2);
    assert.equal(playbackStep(order, 2, -1, "all"), 1);
    assert.equal(playbackStep(order, 0, 1, "song", true), 0);
    assert.equal(playbackStep(order, 0, 1, "song"), 1);
    assert.equal(playbackStep(order, 1, 1, "off", true), null);
    assert.equal(playbackStep([0], 0, 1, "all", true), 0);
    assert.equal(playbackStep([], -1, 1, "all", true), null);
});

test("queue identity includes order, duplicates, and radio stream URLs", () => {
    const queue = [{ id: "a" }, { id: "a" }, { id: "b" }];
    assert.equal(samePlaybackQueue(queue, queue.map((track) => ({ ...track }))), true);
    assert.equal(samePlaybackQueue(queue, [queue[0], queue[2], queue[1]]), false);
    assert.equal(samePlaybackQueue(queue, queue.slice(1)), false);
    assert.equal(samePlaybackQueue([{ streamUrl: "one" }], [{ streamUrl: "two" }]), false);
});

const source = await readFile(new URL("../public/app.js", import.meta.url), "utf8");
const section = (start, end) => source.slice(source.indexOf(start), source.indexOf(end));
const commands = section("async function cmdPrev()", "function previewSeekFromClientX(");

function commandFixture({ repeatMode = "off", shuffle = false, index = 2, order = [0, 1, 2] } = {}) {
    const played = [];
    const adjacent = [];
    let paused = false;
    const state = {
        playbackQueue: [{ id: "a" }, { id: "b" }, { id: "c" }],
        playbackOrder: order, playbackIndex: index, playbackQueueKey: "album",
        settings: { repeatMode, shuffle }, currentTrack: { id: "c" },
    };
    const context = {
        state, playbackStep, playbackState: {}, playbackIntentPlaying: true,
        elements: { audioPlayer: { pause: () => { paused = true; } } },
        playTrackList: async (_tracks, target, key) => { played.push({ target, key }); },
        playAdjacentBrowseEntry: async (_track, direction) => { adjacent.push(direction); return true; },
        cmdSeek: async () => {}, updateUI() {}, updatePlaybackStripUI() {}, clearStreamCacheHandoffTimer() {},
    };
    runInNewContext(commands, context);
    return { context, played, adjacent, isPaused: () => paused };
}

test("automatic repeat song reloads the current track, but manual Next skips it", async () => {
    const { context, played, adjacent } = commandFixture({ repeatMode: "song", index: 1 });
    await context.cmdNext({ automatic: true });
    await context.cmdNext();
    assert.deepEqual(played, [{ target: 1, key: "album" }, { target: 2, key: "album" }]);
    assert.deepEqual(adjacent, []);
});

test("repeat all loops the queue rather than jumping into the next album", async () => {
    const { context, played, adjacent } = commandFixture({ repeatMode: "all" });
    await context.cmdNext({ automatic: true });
    assert.deepEqual(played, [{ target: 0, key: "album" }]);
    assert.deepEqual(adjacent, []);
});

test("shuffle Next and Previous follow the same order; repeat off stops at its end", async () => {
    const { context, played, adjacent, isPaused } = commandFixture({ shuffle: true, order: [1, 0, 2] });
    await context.cmdPrev();
    assert.deepEqual(played, [{ target: 0, key: "album" }]);
    await context.cmdNext({ automatic: true });
    assert.deepEqual(adjacent, []);
    assert.equal(isPaused(), true);
    assert.equal(context.playbackIntentPlaying, false);
});

test("normal playback retains existing next-album navigation", async () => {
    const { context, adjacent } = commandFixture();
    await context.cmdNext({ automatic: true });
    assert.deepEqual(adjacent, [1]);
});

test("the volume popup follows native and fallback fullscreen and returns to body", () => {
    const body = { appendChild: (el) => { el.parentElement = body; } };
    const app = { appendChild: (el) => { el.parentElement = app; } };
    const nativeHost = { appendChild: (el) => { el.parentElement = nativeHost; } };
    let fullscreen = null;
    const popover = { parentElement: body, classList: { add() {}, contains: () => false } };
    const context = {
        document: { body }, state: { playerFullscreen: false },
        elements: { app, volumePopover: popover }, getFullscreenElement: () => fullscreen,
        positionVolumePopover() {},
    };
    runInNewContext(section("function syncVolumePopoverHost()", "function getFullscreenElement()"), context);
    context.state.playerFullscreen = true;
    context.syncVolumePopoverHost();
    assert.equal(popover.parentElement, app);
    fullscreen = nativeHost;
    context.syncVolumePopoverHost();
    assert.equal(popover.parentElement, nativeHost);
    fullscreen = null;
    context.state.playerFullscreen = false;
    context.syncVolumePopoverHost();
    assert.equal(popover.parentElement, body);
});
