import test from "node:test";
import assert from "node:assert/strict";

import {
    albumReleaseYearsMatch,
    albumTitleYearIdentity,
} from "../public/album-identity.js";

test("same album title from different years has a different identity", () => {
    assert.notEqual(
        albumTitleYearIdentity("Greatest Hits", "1998"),
        albumTitleYearIdentity("Greatest Hits", "2024")
    );
});

test("title normalization still merges equivalent names from the same year", () => {
    assert.equal(
        albumTitleYearIdentity("  Greatest   Hits ", "Released 2024"),
        albumTitleYearIdentity("Greatest Hits", 2024)
    );
});

test("current-playing title fallback rejects a conflicting release year", () => {
    assert.equal(albumReleaseYearsMatch("1998", "2024"), false);
    assert.equal(albumReleaseYearsMatch("2024", "2024-01-01"), true);
    assert.equal(albumReleaseYearsMatch("", "2024"), true);
});
