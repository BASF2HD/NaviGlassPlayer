import assert from "node:assert/strict";
import test from "node:test";

import { resolveVerticalMenuPlacement } from "../public/context-menu-position.js";

test("keeps a row menu below when the visible drawer has enough room", () => {
    assert.deepEqual(
        resolveVerticalMenuPlacement({
            hostTop: 100,
            hostBottom: 600,
            anchorTop: 180,
            anchorBottom: 220,
            menuHeight: 180,
        }),
        { opensUp: false, availableHeight: 412 }
    );
});

test("opens a last-row menu upward when the drawer bottom would clip it", () => {
    assert.deepEqual(
        resolveVerticalMenuPlacement({
            hostTop: 100,
            hostBottom: 600,
            anchorTop: 540,
            anchorBottom: 580,
            menuHeight: 180,
        }),
        { opensUp: true, availableHeight: 472 }
    );
});

test("uses the roomier direction and reports its height for oversized menus", () => {
    assert.deepEqual(
        resolveVerticalMenuPlacement({
            hostTop: 100,
            hostBottom: 400,
            anchorTop: 260,
            anchorBottom: 300,
            menuHeight: 500,
        }),
        { opensUp: true, availableHeight: 192 }
    );
});
