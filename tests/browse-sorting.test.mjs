import test from "node:test";
import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import { runInNewContext } from "node:vm";
import { albumTitleYearIdentity, normalizeAlbumGroupTitle } from "../public/album-identity.js";

const source = await readFile(new URL("../public/app.js", import.meta.url), "utf8");
const section = (start, end) => source.slice(source.indexOf(start), source.indexOf(end));
const album = (id, year, title = id) => ({ kind: "album", id, key: id, title, year });

function fixture({ cached = false, sort = "year-desc" } = {}) {
    const entries = [album("old", 1998), album("new", 2026), album("middle", 2012)];
    const context = {
        state: {
            connected: true, browseMode: "album", browseIndex: 0, activeEntryKey: "old",
            currentTrack: { id: "playing" },
            settings: { albumBrowseSort: sort },
        },
        BROWSE_MODE: { ALBUM: "album", SONGS: "songs", PLAYLIST: "playlist", SEARCH: "search" },
        browseEntries: entries, textures: [], browseLoadId: 0, progressiveAlbumLoad: null,
        browseEntryCache: new Map(),
        alphaCollator: new Intl.Collator(undefined, { numeric: true, sensitivity: "base" }),
        normalizeAlbumGroupTitle, albumTitleYearIdentity,
        pickText: (...values) => values.find((value) => String(value || "").trim()) || "",
        isUnknownAlbumTitle: (title) => normalizeAlbumGroupTitle(title) === "unknown album",
        normalizeBrowseSort: (sort) => sort, isArtistBrowseMode: () => false,
        clamp: (value, min, max) => Math.min(max, Math.max(min, value)),
        getBrowseEntryCacheKey: () => "album-cache",
        getBrowseEntryCache: () => cached ? { entries, browseIndex: 0, activeEntryKey: "old" } : null,
        getPersistentBrowseEntryCache: async () => null,
        getAlbumShelfRequestForMode: async () => null,
        fetchBrowseEntriesForMode: async () => entries,
        keyForTrackInCurrentMode: () => context.browseEntries.find((entry) => entry.id === "old")?.key,
        collectTextureLookup: () => new Map(), buildTexturesForEntries: () => [],
        getDefaultTexture: () => null,
        setAlbumData() {}, ensureTextures() {}, jumpTo() {}, navigateTo() {},
        showStatus() {}, hideStatus() {}, updateUI() {}, positionInfoPanel() {},
        updateBrowseMenuCounts() {}, updateBrowseStripUI() {}, setBrowseEntryCache() {},
        resumeProgressiveAlbumLoad() {}, console,
        flashStatus: (message) => assert.fail(message),
    };
    runInNewContext([
        section("function albumShelfGroupKey(", "function normalizeArtistOptions("),
        section("function browseSortText(", "function sortDrawerItemsAtoZ("),
        section("function appendBrowseEntries(", "function beginProgressiveAlbumLoad("),
        section("async function reloadBrowseEntries(", "function getCurrentBrowseEntry("),
    ].join("\n"), context);
    return context;
}

for (const cached of [false, true]) {
    for (const [sort, expected] of [
        ["year-desc", ["new", "middle", "old"]],
        ["year-asc", ["old", "middle", "new"]],
    ]) {
        test(`${sort} opens at the first album with ${cached ? "cached" : "fresh"} results`, async () => {
            const context = fixture({ cached, sort });
            const playing = context.state.currentTrack;
            await context.reloadBrowseEntries({ resetPosition: true });
            assert.deepEqual(Array.from(context.browseEntries, (entry) => entry.id), expected);
            assert.equal(context.state.browseIndex, 0);
            assert.equal(context.state.activeEntryKey, context.browseEntries[0].key);
            assert.equal(context.state.currentTrack, playing);
        });
    }
}

test("normal library reloads retain the selected album", async () => {
    const context = fixture();
    await context.reloadBrowseEntries();
    assert.equal(context.browseEntries[context.state.browseIndex].id, "old");
});

test("year sorting keeps unknown years last and equal years in title order", () => {
    const context = fixture();
    const entries = [album("undated", ""), album("b", "2026-04-10", "Beta"),
        album("a", 2026, "Alpha"), album("old", 1998), album("invalid", "unknown")];
    assert.deepEqual(Array.from(context.sortBrowseEntriesForCurrentMode(entries), (entry) => entry.id),
        ["a", "b", "old", "invalid", "undated"]);
    context.state.settings.albumBrowseSort = "year-asc";
    assert.deepEqual(Array.from(context.sortBrowseEntriesForCurrentMode(entries), (entry) => entry.id),
        ["old", "a", "b", "invalid", "undated"]);
});

test("later album pages stay sorted while preserving the selected cover", () => {
    const context = fixture();
    context.browseEntries = context.groupRawAlbumEntriesIfNeeded([album("middle", 2012)]);
    context.state.activeEntryKey = context.browseEntries[0].key;
    const selected = context.state.activeEntryKey;
    const page = Array.from({ length: 220 }, (_, index) => album(`album-${index}`, 1800 + index));
    context.appendBrowseEntries([...page, album("new", 2026), album("unknown", "")]);
    const years = Array.from(context.browseEntries, (entry) => context.parseYearForSort(entry.year));
    assert.equal(years[0], 2026);
    assert.equal(years.at(-1), null);
    assert.ok(years.slice(0, -1).every((year, index, known) => !index || known[index - 1] >= year));
    assert.equal(context.browseEntries[context.state.browseIndex].key, selected);
});
