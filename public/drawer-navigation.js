export function resolveDrawerDisplayNumber({ trackNo, rowIndex, forceRowOrder = false }) {
    const normalizedRowIndex = Number.isInteger(rowIndex) && rowIndex >= 0 ? rowIndex : 0;
    const normalizedTrackNo = Number(trackNo);
    if (!forceRowOrder && Number.isFinite(normalizedTrackNo) && normalizedTrackNo > 0) {
        return Math.trunc(normalizedTrackNo);
    }
    return normalizedRowIndex + 1;
}

export function stepDrawerSelectionIndex(currentIndex, delta, itemCount) {
    const count = Math.max(0, Number(itemCount) || 0);
    if (!count) return -1;
    const current = Number.isInteger(currentIndex) && currentIndex >= 0 && currentIndex < count
        ? currentIndex
        : (delta < 0 ? count : -1);
    return Math.max(0, Math.min(count - 1, current + delta));
}
