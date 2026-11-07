export function metadataText(...values) {
    for (const value of values) {
        const items = Array.isArray(value) ? value : [value];
        const names = items.map((item) => {
            if (item && typeof item === "object") {
                return metadataText(item.name, item.value, item.title);
            }
            const text = String(item ?? "").trim();
            return /^(unknown(?: album artist| artist| composer)?|\[unknown\])$/i.test(text) ? "" : text;
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
    };
}
