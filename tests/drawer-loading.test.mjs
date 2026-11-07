import test from "node:test";
import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import { runInNewContext } from "node:vm";
import { createRequestQueue } from "../public/request-queue.js";

const source = await readFile(new URL("../public/app.js", import.meta.url), "utf8");
const section = (start, end) => source.slice(source.indexOf(start), source.indexOf(end));
const deferred = () => {
    let resolve, reject;
    const promise = new Promise((yes, no) => { resolve = yes; reject = no; });
    return { promise, resolve, reject };
};

function fixture() {
    const context = {
        entry: { kind: "album", key: "album", id: "album", title: "Album", groupAlbumIds: ["album"] },
        state: { drawerOpen: true, drawerContext: { items: [] } },
        drawerContextLoad: null, drawerLoadId: 0,
        getCurrentBrowseEntry: () => context.entry,
        renders: [], renderSongsDrawer: () => context.renders.push(context.state.drawerContext.loading),
        playbackDecisions: { prefetch() {} }, isServerCachedTrack: () => true,
        console: { warn() {} },
    };
    runInNewContext(section("function drawerContextSignature(", "async function connect("), context);
    return context;
}

const songs = { key: "album", items: [{ track: { id: "song" } }] };

test("repeated snaps share one pending drawer load and do not restart its spinner", async () => {
    const context = fixture();
    const request = deferred();
    let calls = 0;
    context.getDrawerContextForEntry = () => { calls += 1; return request.promise; };
    const first = context.ensureDrawerContext();
    const second = context.ensureDrawerContext();
    assert.equal(calls, 1);
    assert.deepEqual(context.renders, [true]);
    request.resolve(songs);
    await Promise.all([first, second]);
    assert.equal(context.state.drawerContext.loading, false);
    await context.ensureDrawerContext();
    assert.equal(calls, 1);
    assert.deepEqual(context.renders, [true, false]);
});

test("reopening a loaded drawer shows cached rows without a loading frame", async () => {
    const context = fixture();
    let calls = 0;
    context.getDrawerContextForEntry = async () => { calls += 1; return songs; };
    await context.ensureDrawerContext();
    context.state.drawerOpen = false;
    await context.ensureDrawerContext();
    context.state.drawerOpen = true;
    await context.ensureDrawerContext();
    assert.equal(calls, 1);
    assert.deepEqual(context.renders, [true, false]);
});

test("failed drawer requests exit loading and can be retried", async () => {
    const context = fixture();
    context.getDrawerContextForEntry = async () => { throw new Error("unavailable"); };
    await context.ensureDrawerContext();
    assert.equal(context.state.drawerContext.loading, false);
    assert.match(context.state.drawerContext.error, /retry/);
    context.getDrawerContextForEntry = async () => songs;
    await context.ensureDrawerContext();
    assert.equal(context.state.drawerContext.items.length, 1);
    assert.equal(context.state.drawerContext.error, undefined);
});

test("an empty or newer selection cannot be replaced by a late drawer response", async () => {
    for (const empty of [true, false]) {
        const context = fixture();
        const request = deferred();
        context.getDrawerContextForEntry = () => request.promise;
        const old = context.ensureDrawerContext();
        context.entry = empty ? null : { key: "new-album", id: "new-album" };
        context.getDrawerContextForEntry = async () => ({ items: [{ track: { id: "new-song" } }] });
        await context.ensureDrawerContext();
        request.resolve(songs);
        await old;
        assert.equal(context.state.drawerContext.key, empty ? "" : "new-album");
        assert.equal(context.state.drawerContext.items.length, empty ? 0 : 1);
    }
});

test("changed group membership reloads a drawer with the same album key", async () => {
    const context = fixture();
    let calls = 0;
    context.getDrawerContextForEntry = async () => { calls += 1; return songs; };
    await context.ensureDrawerContext();
    context.entry = { ...context.entry, groupAlbumIds: ["album", "second-disc"] };
    await context.ensureDrawerContext();
    assert.equal(calls, 2);
});

test("background requests are bounded and the newly selected cover moves ahead of queued artwork", async () => {
    const queue = createRequestQueue(2);
    const gates = Array.from({ length: 5 }, deferred);
    const started = [];
    let active = 0, peak = 0, selected = 4;
    const jobs = gates.map((gate, index) => queue.run(async () => {
        started.push(index);
        active += 1;
        peak = Math.max(peak, active);
        await gate.promise;
        active -= 1;
    }, { priority: () => selected === index ? 1 : 0 }));
    await Promise.resolve();
    assert.deepEqual(started, [0, 1]);
    gates[0].resolve();
    await jobs[0];
    await new Promise((resolve) => setImmediate(resolve));
    assert.deepEqual(started, [0, 1, 4]);
    selected = 3;
    gates.forEach((gate) => gate.resolve());
    await Promise.all(jobs);
    assert.equal(peak, 2);
    assert.deepEqual(started, [0, 1, 4, 3, 2]);
});

test("clearing obsolete prefetch requests leaves active requests alone and failures release slots", async () => {
    const queue = createRequestQueue(1);
    const gate = deferred();
    const first = queue.run(() => gate.promise);
    const dropped = queue.run(() => assert.fail("obsolete prefetch must not start"));
    queue.clear();
    assert.equal(await dropped, null);
    gate.reject(new Error("network failed"));
    await assert.rejects(first, /network failed/);
    assert.equal(await queue.run(() => "ready"), "ready");
});
