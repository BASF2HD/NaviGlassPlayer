export function resolveVerticalMenuPlacement({
    hostTop,
    hostBottom,
    anchorTop,
    anchorBottom,
    menuHeight,
    padding = 8,
}) {
    const safePadding = Math.max(0, Number(padding) || 0);
    const downwardSpace = Math.max(0, hostBottom - safePadding - anchorTop);
    const upwardSpace = Math.max(0, anchorBottom - (hostTop + safePadding));
    const opensUp = downwardSpace < menuHeight && upwardSpace > downwardSpace;

    return {
        opensUp,
        availableHeight: opensUp ? upwardSpace : downwardSpace,
    };
}
