import { normalizeAlbumReleaseYear } from "./album-identity.js?v=1";

export function metadataText(...values) {
    for (const value of values) {
        const items = Array.isArray(value) ? value : [value];
        const names = items.map((item) => {
            if (item && typeof item === "object") {
                return metadataText(item.name, item.value, item.title);
            }
            const text = String(item ?? "").trim();
            return /^(unknown(?: album artist| artist| composer| singer| vocalist)?|\[unknown\])$/i.test(text) ? "" : text;
        }).filter(Boolean);
        if (names.length) return [...new Set(names)].join(", ");
    }
    return "";
}

export function readMusicMetadata(record = {}, options = {}) {
    const albumArtist = metadataText(
        record.displayAlbumArtist, record.albumArtist, record.albumArtistName, record.albumArtists,
        options.albumArtist,
        options.isAlbum ? metadataText(record.displayArtist, record.artists, record.artist) : ""
    );
    const contributors = Array.isArray(record.contributors) ? record.contributors : [];
    const taggedSinger = metadataText(
        record.displaySinger, record.singer, record.singers,
        record.displayVocalist, record.vocalist, record.vocalists,
        contributors.filter((item) => {
            const role = String(item?.role || "").trim().toLowerCase();
            const subRole = String(item?.subRole || "").trim().toLowerCase();
            return ["singer", "vocalist", "vocal", "vocals"].includes(role)
                || (role === "performer" && ["singer", "vocalist", "vocal", "vocals"].includes(subRole));
        }).map((item) => item.artist)
    );
    const taggedArtist = options.isAlbum ? "" : metadataText(
        record.displayArtist, record.artist, record.artistName, record.artists
    );
    const taggedComposer = metadataText(
        record.displayComposer, record.composer, record.composers,
        contributors.filter((item) => String(item?.role || "").toLowerCase() === "composer")
            .map((item) => item.artist),
        options.composer
    );
    return {
        albumArtist,
        composer: taggedComposer || albumArtist,
        composerSource: taggedComposer ? "tag" : albumArtist ? "albumArtist" : "",
        singer: taggedSinger || taggedArtist,
        singerSource: taggedSinger ? "tag" : taggedArtist ? "artist" : "",
    };
}

export function commonAlbumYear(values = []) {
    const years = [...new Set(values.map(normalizeAlbumReleaseYear).filter(Boolean))];
    return years.length === 1 ? years[0] : "";
}

export function albumTitleWithYear(title, year) {
    const text = String(title || "Songs");
    const releaseYear = normalizeAlbumReleaseYear(year);
    return releaseYear && !text.trimEnd().endsWith(`(${releaseYear})`)
        ? `${text} (${releaseYear})` : text;
}
