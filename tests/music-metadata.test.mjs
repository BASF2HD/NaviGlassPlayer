import test from "node:test";
import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import { runInNewContext } from "node:vm";
import { metadataText, readMusicMetadata } from "../public/music-metadata.js";

const source = await readFile(new URL("../public/app.js", import.meta.url), "utf8");
const section = (start, end) => source.slice(source.indexOf(start), source.indexOf(end));

function fixture() {
    const context = {
        metadataText, readMusicMetadata,
        pickText: (...values) => values.map((value) => String(value ?? "").trim()).find(Boolean) || "",
        ensureArray: (value) => Array.isArray(value) ? value : value ? [value] : [],
        BROWSE_MODE: { PLAYLIST: "playlist" },
        escapeHtml: (value) => String(value), formatClock: (value) => String(value),
        formatBitrate: (value) => String(value), formatSongCount: (value) => String(value),
        getLibraryCacheScope: () => "test-scope", albumDetailsLoadPromises: new Map(),
        state: { detailsCache: new Map() },
    };
    runInNewContext([
        section("function normalizeAlbum(", "function inferStreamSuffix("),
        section("function buildSongInfoRows(", "async function resolveAlbumInfoDetails("),
        section("function normalizeComposerOptions(", "async function ensureComposerOptions("),
        section("async function ensureAlbumDetails(", "function albumDetailIdsForEntry("),
    ].join("\n"), context);
    return context;
}

test("Navidrome display fields and structured album artists remain separate from the singer", () => {
    const context = fixture();
    for (const fields of [
        { displayAlbumArtist: "Film Composer" },
        { albumArtists: [{ id: "composer-id", name: "Film Composer" }] },
        { albumArtist: "Film Composer" },
    ]) {
        const song = context.normalizeTrack({ id: "song", artist: "Playback Singer", ...fields,
            displayComposer: "Tagged Composer" });
        assert.equal(song.artist, "Playback Singer");
        assert.equal(song.albumArtist, "Film Composer");
        assert.equal(song.composer, "Tagged Composer");
        assert.equal(song.composerSource, "tag");
        assert.match(context.buildSongInfoRows(song, 0), /Album Artist.*Film Composer/s);
    }
});

test("composer contributors are read and explicit composer tags take precedence", () => {
    const fields = { albumArtists: [{ name: "Album Artist" }], contributors: [
        { role: "lyricist", artist: { name: "Lyric Writer" } },
        { role: "composer", artist: { name: "Role Composer" } },
    ] };
    assert.equal(readMusicMetadata(fields).composer, "Role Composer");
    assert.equal(readMusicMetadata({ ...fields, displayComposer: "Tagged Composer" }).composer, "Tagged Composer");
    assert.equal(readMusicMetadata({ ...fields, composer: "Legacy Composer" }).composer, "Legacy Composer");
});

test("missing composer falls back to a known album artist and identifies the fallback", () => {
    const context = fixture();
    const song = context.normalizeTrack({ artist: "Singer", displayComposer: "Unknown",
        displayAlbumArtist: "Music Director" });
    assert.equal(song.composer, "Music Director");
    assert.equal(song.composerSource, "albumArtist");
    assert.match(context.buildSongInfoRows(song, 0), /Music Director \(Album Artist\)/);
    const composers = context.normalizeComposerOptions([song]);
    assert.equal(composers[0].value, "Music Director");
});

test("missing album artist is not inferred from the singer or an opaque contributor ID", () => {
    const context = fixture();
    const song = context.normalizeTrack({ artist: "Singer", albumArtists: [{ id: "opaque-id" }] });
    assert.equal(song.artist, "Singer");
    assert.equal(song.albumArtist, "");
    assert.equal(song.composer, "");
    assert.equal(metadataText(" Unknown Album Artist ", [{ name: "Known Artist" }]), "Known Artist");
});

test("album details retain album artist, genre and inherited metadata for legacy songs", async () => {
    const context = fixture();
    let calls = 0;
    context.fetchServerCachedJson = async () => {
        calls += 1;
        return { album: { id: "album", name: "Soundtrack", artist: "Other Artist",
            displayAlbumArtist: "Music Director", genre: "Tamil Soundtrack", song: [
                { id: "song", title: "Song", artist: "Singer" },
            ] } };
    };
    const [album, again] = await Promise.all([context.ensureAlbumDetails("album"), context.ensureAlbumDetails("album")]);
    assert.equal(calls, 1);
    assert.equal(album, again);
    assert.equal(album.artist, "Music Director");
    assert.equal(album.genre, "Tamil Soundtrack");
    assert.equal(album.tracks[0].artist, "Singer");
    assert.equal(album.tracks[0].albumArtist, "Music Director");
    assert.equal(album.tracks[0].composer, "Music Director");
    assert.match(context.buildAlbumInfoRows(album), /Album Artist.*Music Director/s);
    assert.match(context.buildAlbumInfoRows(album), /Music Director \(Album Artist\)/);
});

test("album info prefers actual song composers to an album-artist fallback", () => {
    const context = fixture();
    const album = { albumArtist: "Album Artist", composer: "Album Artist", composerSource: "albumArtist",
        tracks: [context.normalizeTrack({ artist: "Singer", albumArtist: "Album Artist", displayComposer: "Actual Composer" })] };
    const html = context.buildAlbumInfoRows(album);
    assert.match(html, /Composer.*Actual Composer/s);
    assert.doesNotMatch(html, /Album Artist \(Album Artist\)/);
});

test("an old account's pending album details cannot refill the new account cache", async () => {
    const context = fixture();
    let finish;
    context.fetchServerCachedJson = () => new Promise((resolve) => { finish = resolve; });
    const old = context.ensureAlbumDetails("album");
    context.getLibraryCacheScope = () => "new-scope";
    context.albumDetailsLoadPromises.clear();
    const newer = Promise.resolve("new-request");
    context.albumDetailsLoadPromises.set("album:album", newer);
    finish({ album: { id: "album", artist: "Old Account Artist", song: [] } });
    await old;
    assert.equal(context.state.detailsCache.size, 0);
    assert.equal(context.albumDetailsLoadPromises.get("album:album"), newer);
});
