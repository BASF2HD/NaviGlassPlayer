import test from "node:test";
import assert from "node:assert/strict";

import {
    resolveDrawerDisplayNumber,
    stepDrawerSelectionIndex,
} from "../public/drawer-navigation.js";

test("uses album track metadata when available", () => {
    assert.equal(resolveDrawerDisplayNumber({ trackNo: 7, rowIndex: 0 }), 7);
});

test("uses the visible row when track metadata is absent or playlist order is required", () => {
    assert.equal(resolveDrawerDisplayNumber({ trackNo: 0, rowIndex: 4 }), 5);
    assert.equal(resolveDrawerDisplayNumber({ trackNo: 1004, rowIndex: 2, forceRowOrder: true }), 3);
});

test("moves drawer selection within the available rows", () => {
    assert.equal(stepDrawerSelectionIndex(null, 1, 5), 0);
    assert.equal(stepDrawerSelectionIndex(1, 1, 5), 2);
    assert.equal(stepDrawerSelectionIndex(4, 1, 5), 4);
    assert.equal(stepDrawerSelectionIndex(0, -1, 5), 0);
    assert.equal(stepDrawerSelectionIndex(null, -1, 5), 4);
    assert.equal(stepDrawerSelectionIndex(0, 1, 0), -1);
});
