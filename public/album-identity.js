export function normalizeAlbumGroupTitle(value) {
    return String(value || "")
        .normalize("NFKC")
        .replace(/[\u200B-\u200D\uFEFF]/g, "")
        .replace(/\s+/g, " ")
        .trim()
        .toLocaleLowerCase();
}

export function normalizeAlbumReleaseYear(value) {
    const match = String(value || "").match(/(?:19|20)\d{2}/);
    return match ? match[0] : "";
}

export function albumTitleYearIdentity(title, year) {
    const normalizedTitle = normalizeAlbumGroupTitle(title);
    if (!normalizedTitle) return "";
    const normalizedYear = normalizeAlbumReleaseYear(year);
    return `${normalizedTitle}|year:${normalizedYear || "unknown"}`;
}

export function albumReleaseYearsMatch(left, right) {
    const leftYear = normalizeAlbumReleaseYear(left);
    const rightYear = normalizeAlbumReleaseYear(right);
    return !leftYear || !rightYear || leftYear === rightYear;
}
