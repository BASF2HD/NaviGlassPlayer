import test from "node:test";
import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import { runInNewContext } from "node:vm";
import { resolveDrawerDisplayNumber } from "../public/drawer-navigation.js";

const source = await readFile(new URL("../public/app.js", import.meta.url), "utf8");
const section = (start, end) => source.slice(source.indexOf(start), source.indexOf(end));

test("playback-only updates skip full menu and drawer rendering", () => {
    const calls = [];
    const context = Object.fromEntries([
        "updateBrowseSummary", "updatePlaybackSummary", "updateSongsDrawerPlaybackState",
        "renderBrowseMenus", "renderSongsDrawer",
    ].map((name) => [name, () => calls.push(name)]));
    runInNewContext(section("function updateUI(", "function fitInfoPanelTypography("), context);
    context.updateUI({ playbackOnly: true });
    assert.deepEqual(calls, ["updateBrowseSummary", "updatePlaybackSummary", "updateSongsDrawerPlaybackState"]);
    calls.length = 0;
    context.updateUI();
    assert.deepEqual(calls, ["updateBrowseSummary", "updatePlaybackSummary", "renderBrowseMenus", "renderSongsDrawer"]);
});

function element() {
    const classes = new Set();
    const attributes = new Map();
    return {
        classes, attributes,
        classList: { toggle(name, on) { if (on) classes.add(name); else classes.delete(name); } },
        setAttribute(name, value) { attributes.set(name, value); },
        removeAttribute(name) { attributes.delete(name); },
    };
}

function fixture(tracks) {
    const rows = tracks.map((track, index) => {
        const cell = {
            text: String(track.trackNo || index + 1), writes: 0, marker: null,
            querySelector() { return this.marker; },
            get firstElementChild() { return this.marker; },
            set innerHTML(value) { this.writes += 1; this.marker = element(); },
            set textContent(value) { this.writes += 1; this.text = value; this.marker = null; },
        };
        return { ...element(), dataset: { songIndex: String(index) }, cell, querySelector: () => cell };
    });
    const tbody = {
        set innerHTML(value) { assert.fail("playback must preserve existing drawer rows"); },
        querySelectorAll: () => rows.filter((row) => row.classes.has("is-current") || row.classes.has("is-keyboard-selected")),
        querySelector: (selector) => rows[Number(selector.match(/="(-?\d+)"/)[1])] || null,
    };
    const context = {
        state: { drawerContext: { items: tracks.map((track) => ({ track })) }, drawerOpen: true, drawerSelectionIndex: null },
        playbackState: { playing: false }, elements: { songsTableBody: tbody }, resolveDrawerDisplayNumber,
    };
    runInNewContext(
        `${section("function getCurrentDrawerTrackIndex(", "function scrollDrawerSelectionIntoView(")}\n`
        + section("function updateSongsDrawerPlaybackState()", "function renderSongsDrawer()"), context
    );
    return { context, rows };
}

test("switching in a large drawer changes only relevant markers, preserving other rows", () => {
    const tracks = Array.from({ length: 10000 }, (_, i) => ({ id: String(i), trackNo: i + 1 }));
    const { context, rows } = fixture(tracks);
    context.state.currentTrack = tracks[42];
    context.updateSongsDrawerPlaybackState();
    assert.equal(rows[42].cell.marker.attributes.get("aria-label"), "Current track");
    context.state.currentTrack = tracks[43];
    context.state.drawerSelectionIndex = 43;
    context.playbackState.playing = true;
    context.updateSongsDrawerPlaybackState();
    assert.equal(rows[42].cell.text, "43");
    assert.equal(rows[42].cell.marker, null);
    assert.equal(rows[42].attributes.has("aria-current"), false);
    assert.equal(rows[43].cell.marker.attributes.get("aria-label"), "Now playing");
    assert.equal(rows[43].attributes.get("aria-selected"), "true");
    assert.equal(rows.filter((row) => row.cell.writes > 0).length, 2);
    const marker = rows[43].cell.marker;
    context.playbackState.playing = false;
    context.updateSongsDrawerPlaybackState();
    assert.equal(rows[43].cell.marker, marker, "pause must reuse the marker");
    assert.equal(marker.classes.has("is-paused"), true);
});

test("playlist duplicate song markers remain consistent with a full drawer render", () => {
    const { context, rows } = fixture([{ id: "same", trackNo: 1004 }, { id: "same", trackNo: 1004 }, { id: "next" }]);
    context.state.drawerContext.playlistId = "playlist";
    context.state.currentTrack = { id: "same" };
    context.updateSongsDrawerPlaybackState();
    assert.ok(rows[0].cell.marker);
    assert.ok(rows[1].cell.marker);
    context.state.currentTrack = { id: "next" };
    context.updateSongsDrawerPlaybackState();
    assert.equal(rows[0].cell.text, "1");
    assert.equal(rows[1].cell.text, "2");
});

test("loading or empty drawers are not overwritten by playback events", () => {
    const { context, rows } = fixture([{ id: "first" }]);
    context.state.currentTrack = { id: "first" };
    context.state.drawerContext.loading = true;
    context.updateSongsDrawerPlaybackState();
    assert.equal(rows[0].cell.writes, 0);
    context.state.drawerContext = { items: [] };
    context.updateSongsDrawerPlaybackState();
    assert.equal(rows[0].cell.writes, 0);
});
