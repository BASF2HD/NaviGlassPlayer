import test from "node:test";
import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import { runInNewContext } from "node:vm";

const source = await readFile(new URL("../public/app.js", import.meta.url), "utf8");
const counts = source.slice(source.indexOf("function getBrowseMenuCountText("),
    source.indexOf("function renderBrowseDropdownHeader("));

function fixture(mode, entries) {
    const albumCount = { textContent: "" };
    const songCount = { textContent: "" };
    const artistCount = { textContent: "" };
    const playlistCount = { textContent: "" };
    const moreCount = { textContent: "" };
    const context = {
        state: { connected: true, browseMode: mode,
            artistOptions: [], albumArtistOptions: [], composerOptions: [], playlistOptions: [],
            settings: { songsBrowseScope: "all", songsDisplayMode: "song", albumBrowseScope: "all", artistPanel: "artist" } },
        BROWSE_MODE: { SONGS: "songs", ALBUM: "album", ARTIST: "artist", ALBUM_ARTIST: "albumArtist",
            COMPOSER: "composer", PLAYLIST: "playlist", YEAR: "year", GENRE: "genre", RADIO: "radio" },
        browseEntries: entries, browseCountFailed: false, progressiveAlbumLoad: null,
        elements: {
            albumDropdown: { querySelector: () => albumCount },
            songsDropdown: { querySelector: () => songCount },
            artistDropdown: { querySelector: () => artistCount },
            playlistDropdown: { querySelector: () => playlistCount },
            moreDropdown: { querySelector: () => moreCount },
        },
    };
    context.getBrowseEntryCacheKey = (view) => view === "songs"
        ? `${view}:${context.state.settings.songsBrowseScope}:${context.state.settings.songsDisplayMode}`
        : `${view}:${context.state.settings.albumBrowseScope}`;
    context.browseCountKey = context.getBrowseEntryCacheKey(mode);
    const artistMode = source.slice(source.indexOf("function browseModeForArtistPanel("),
        source.indexOf("function normalizeTrackDisplayMode("));
    runInNewContext(`${artistMode}\n${counts}`, context);
    return { context, albumCount, songCount, artistCount, playlistCount, moreCount };
}

test("Songs counts selected songs rather than album covers in both display modes", () => {
    const tracks = [{ kind: "song", starred: true }, { kind: "song", starred: false }, { kind: "song", starred: true }];
    const { context } = fixture("songs", tracks);
    assert.equal(context.getBrowseMenuCountText("songs"), "3");
    context.state.settings.songsDisplayMode = "album";
    context.browseCountKey = context.getBrowseEntryCacheKey("songs");
    context.browseEntries = [{ kind: "album", groupTracks: tracks.slice(0, 2) },
        { kind: "album", groupTracks: tracks.slice(2) }];
    assert.equal(context.getBrowseMenuCountText("songs"), "3");
    context.state.settings.songsBrowseScope = "favourite";
    // Keep the old total hidden while a new selection loads.
    assert.equal(context.getBrowseMenuCountText("songs"), "Loading…");
    context.browseCountKey = context.getBrowseEntryCacheKey("songs");
    assert.equal(context.getBrowseMenuCountText("songs"), "2");
    tracks[0].starred = false;
    context.updateBrowseMenuCounts();
    assert.equal(context.elements.songsDropdown.querySelector().textContent, "1");
});

test("Albums counts grouped albums and follows the favourite selection", () => {
    const { context, albumCount } = fixture("album", [
        { kind: "album", groupAlbumIds: ["a", "b"], starred: true },
        { kind: "album", starred: false },
    ]);
    assert.equal(context.getBrowseMenuCountText("album"), "2");
    context.state.settings.albumBrowseScope = "favourite";
    context.browseCountKey = context.getBrowseEntryCacheKey("album");
    context.updateBrowseMenuCounts();
    assert.equal(albumCount.textContent, "1");
    context.browseEntries[0].starred = false;
    context.updateBrowseMenuCounts();
    assert.equal(albumCount.textContent, "0");
});

test("album totals update as pages load and drop the partial marker on completion", () => {
    const { context, albumCount } = fixture("album", [{ kind: "album" }, { kind: "album" }]);
    context.progressiveAlbumLoad = { done: false };
    context.updateBrowseMenuCounts();
    assert.equal(albumCount.textContent, "2+");
    context.browseEntries.push({ kind: "album" });
    context.updateBrowseMenuCounts();
    assert.equal(albumCount.textContent, "3+");
    context.progressiveAlbumLoad.done = true;
    context.updateBrowseMenuCounts();
    assert.equal(albumCount.textContent, "3");
});

test("unloaded, failed and disconnected selections do not show a stale total", () => {
    const { context } = fixture("songs", [{ kind: "song" }]);
    context.browseCountKey = "";
    assert.equal(context.getBrowseMenuCountText("songs"), "Loading…");
    context.browseCountFailed = true;
    assert.equal(context.getBrowseMenuCountText("songs"), "Unavailable");
    context.state.connected = false;
    assert.equal(context.getBrowseMenuCountText("songs"), "—");
});

test("Artists counts follow the artist, album artist and composer lists", () => {
    const { context, artistCount } = fixture("artist", []);
    context.state.artistOptions = [{ id: "a" }, { id: "b" }];
    context.state.albumArtistOptions = [{ value: "album artist" }];
    context.state.composerOptions = [{ value: "one" }, { value: "two" }, { value: "three" }];
    context.updateBrowseMenuCounts();
    assert.equal(artistCount.textContent, "2");
    context.state.settings.artistPanel = "albumArtist";
    context.updateBrowseMenuCounts();
    assert.equal(artistCount.textContent, "1");
    context.state.settings.artistPanel = "composer";
    context.updateBrowseMenuCounts();
    assert.equal(artistCount.textContent, "3");
});

test("Playlists shows the number of available playlists and updates as the list changes", () => {
    const { context, playlistCount } = fixture("playlist", []);
    context.updateBrowseMenuCounts();
    assert.equal(playlistCount.textContent, "0");
    context.state.playlistOptions = [{ id: "a", songCount: 100 }, { id: "b", songCount: 200 }];
    context.updateBrowseMenuCounts();
    assert.equal(playlistCount.textContent, "2");
    context.state.playlistOptions.pop();
    context.updateBrowseMenuCounts();
    assert.equal(playlistCount.textContent, "1");
});

test("More counts results for selected year, genre and saved radio filters", () => {
    for (const [mode, kind] of [["year", "album"], ["genre", "album"], ["radio", "radio"]]) {
        const { context, moreCount } = fixture(mode, [{ kind }, { kind }]);
        context.updateBrowseMenuCounts();
        assert.equal(moreCount.textContent, "2", "reopening More keeps the current filter total");
        context.state.activeMorePanel = mode;
        context.updateBrowseMenuCounts();
        assert.equal(moreCount.textContent, "2");
        context.state.browseMode = "songs";
        context.updateBrowseMenuCounts();
        assert.equal(moreCount.textContent, "—", "an unselected filter must not pretend to be loading");
    }
});
