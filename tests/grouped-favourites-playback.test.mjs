import test from "node:test";
import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import { runInNewContext } from "node:vm";
import {
    albumReleaseYearsMatch, albumTitleYearIdentity, normalizeAlbumGroupTitle,
} from "../public/album-identity.js";
import { buildPlaybackOrder, playbackStep } from "../public/playback-order.js";

const source = await readFile(new URL("../public/app.js", import.meta.url), "utf8");
const section = (start, end) => source.slice(source.indexOf(start), source.indexOf(end));

async function fixture(tracks) {
    const played = [];
    const state = {
        browseMode: "songs", browseIndex: 0, activeEntryKey: "",
        settings: { songsBrowseScope: "favourite", songsDisplayMode: "album", songsBrowseSort: "year-desc",
            shuffle: false, repeatMode: "off" },
        playbackQueue: [], playbackOrder: [], playbackIndex: -1,
    };
    const context = {
        state, browseEntries: [], played, playbackState: {}, playbackIntentPlaying: true,
        BROWSE_MODE: { SONGS: "songs" },
        albumReleaseYearsMatch, albumTitleYearIdentity, normalizeAlbumGroupTitle,
        buildPlaybackOrder, playbackStep,
        alphaCollator: new Intl.Collator(undefined, { numeric: true, sensitivity: "base" }),
        pickText: (...values) => values.find((value) => String(value || "").trim()) || "",
        isUnknownAlbumTitle: (title) => normalizeAlbumGroupTitle(title) === "unknown album",
        normalizeBrowseSort: (sort) => sort,
        clamp: (value, min, max) => Math.min(max, Math.max(min, value)),
        ensureAlbumDetails: () => assert.fail("favourite groups must use only their selected songs"),
        ensureTextureAtIndex: async () => {},
        elements: { audioPlayer: { pause() {} } },
        cmdSeek: async () => {}, clearStreamCacheHandoffTimer() {}, updatePlaybackStripUI() {}, updateUI() {},
        async playTrackList(queue, index, key) {
            state.playbackQueue = queue;
            state.playbackQueueKey = key;
            state.playbackIndex = index;
            state.playbackOrder = buildPlaybackOrder(queue.length, index, false);
            state.currentTrack = queue[index];
            played.push(state.currentTrack.id);
        },
    };
    runInNewContext([
        section("async function buildAlbumGroupEntries(", "function groupAlbumEntriesByTitle("),
        section("function browseSortText(", "function entryMatchesSearch("),
        section("async function getDrawerContextForEntry(", "async function ensureDrawerContext("),
        section("function trackIdentityMatches(", "function syncBrowseToTrack("),
        section("async function getPlaybackContextForEntry(", "async function playTrackList("),
        section("async function cmdPrev()", "function previewSeekFromClientX("),
    ].join("\n"), context);
    context.browseEntries = context.sortBrowseEntriesForCurrentMode(
        await context.buildAlbumGroupEntries(tracks, { source: "songs", contextId: "favourite" })
    );
    return { context, state, played };
}

function song(id, album, year, extra = {}) {
    return { id, kind: "song", title: id, album, year, albumId: album,
        trackNo: 1, starred: true, ...extra };
}

test("favourite album groups reject non-member songs even when album metadata matches", async () => {
    const { context } = await fixture([song("selected", "Album", "2024")]);
    const group = context.browseEntries[0];
    assert.equal(context.entryContainsPlaybackTrack(group, { ...group.groupTracks[0] }), true);
    assert.equal(context.entryContainsPlaybackTrack(group, song("unselected", "Album", "2024")), false);
    assert.equal(context.entryContainsPlaybackTrack({ ...group, groupTracks: [] }, group.groupTracks[0]), false);
    // Whole-album browsing still accepts album identity when there is no explicit song selection.
    assert.equal(context.entryContainsPlaybackTrack({ ...group, groupTracks: undefined },
        song("unselected", "Album", "2024")), true);
});

const scenarios = [
    { name: "different song years share an album ID", tracks: [
        song("newer", "Compilation", "2024"), song("older", "Compilation", "1998"),
    ] },
    { name: "an unknown song year shares an album ID", tracks: [
        song("newer", "Compilation", "2024"), song("older", "Compilation", ""),
    ] },
    { name: "different albums share artwork", tracks: [
        song("newer", "New Album", "2024", { coverArt: "shared-cover" }),
        song("older", "Old Album", "1998", { coverArt: "shared-cover" }),
    ] },
    { name: "same album title has different IDs and an unknown year", tracks: [
        song("newer", "Compilation", "2024", { albumId: "new-id" }),
        song("older", "Compilation", "", { albumId: "old-id" }),
    ] },
];

for (const { name, tracks } of scenarios) {
    test(`year descending advances through favourite groups once when ${name}`, async () => {
        const songs = [
            ...tracks.map((track) => ({ ...track, trackNo: 2 })),
            ...tracks.map((track) => ({ ...track, id: `${track.id}-first`, trackNo: 1 })),
            song("next-album", "ZZZ Album", ""),
        ];
        const { context, state, played } = await fixture(songs);
        const expected = ["newer-first", "newer", "older-first", "older", "next-album"];
        assert.equal(context.browseEntries.length, 3);
        const start = await context.getPlaybackContextForEntry(context.browseEntries[0]);
        await context.playTrackList(start.tracks, start.startIndex, start.key);
        // Browsing away must not change which album follows the playing group.
        state.browseIndex = 0;
        state.activeEntryKey = context.browseEntries[0].key;
        for (let count = 1; count < songs.length; count += 1) {
            await context.cmdNext({ automatic: true });
        }
        assert.deepEqual(played, [...expected]);
        await context.cmdNext({ automatic: true });
        assert.equal(context.playbackIntentPlaying, false);
        assert.equal(played.length, songs.length);
    });
}

test("Previous from a favourite group starts the preceding group's last selected song", async () => {
    const { context, played } = await fixture([
        song("new-first", "Compilation", "2024"),
        song("new-last", "Compilation", "2024", { trackNo: 5 }),
        song("old", "Compilation", "1998"),
    ]);
    const start = await context.getPlaybackContextForEntry(context.browseEntries[1]);
    await context.playTrackList(start.tracks, start.startIndex, start.key);
    await context.cmdPrev();
    assert.deepEqual(played, ["old", "new-last"]);
});
