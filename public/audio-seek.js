export function audioStreamParams(track, canPlayType = () => "", forceTranscode = false) {
    const suffix = String(track?.suffix || "").toLowerCase();
    // Older servers lack the decision API. An unknown MP4 codec is not proof
    // of AAC support: require support for both common codecs to send it raw.
    const mp4Supported = canPlayType('audio/mp4; codecs="mp4a.40.2"')
        && canPlayType('audio/mp4; codecs="alac"');
    const mimeTypes = { mp3: "audio/mpeg", flac: "audio/flac", aac: "audio/aac", ogg: "audio/ogg", opus: "audio/ogg; codecs=opus", wav: "audio/wav" };
    // Keep native files seekable; transcode only formats this browser cannot play.
    const original = !forceTranscode && (suffix === "mp3" || Boolean(
        ["m4a", "mp4"].includes(suffix) ? mp4Supported : mimeTypes[suffix] && canPlayType(mimeTypes[suffix])
    ));
    return {
        id: track?.id,
        format: original ? "raw" : "mp3",
        maxBitRate: original ? 0 : 320,
        ...(original ? { suffix } : {}),
    };
}

export function isTimeInRanges(ranges, seconds) {
    if (!Number.isFinite(seconds) || !ranges) return false;
    for (let index = 0; index < ranges.length; index += 1) {
        if (seconds >= ranges.start(index) && seconds < ranges.end(index)) return true;
    }
    return false;
}

export function streamElapsed(currentTime, offset = 0) {
    return Math.max(0, Number.isFinite(currentTime) ? currentTime : 0) + offset;
}

export function streamDuration(mediaDuration, knownDuration, offset = 0) {
    if (offset > 0 && Number.isFinite(knownDuration) && knownDuration > 0) return knownDuration;
    if (Number.isFinite(mediaDuration) && mediaDuration > 0) return mediaDuration + offset;
    return Number.isFinite(knownDuration) && knownDuration > 0 ? knownDuration : 0;
}

export function needsServerOffsetSeek(decision, audio, target, offset = 0) {
    if (!decision?.canTranscode || decision.canDirectPlay) return false;
    const localTime = target - offset;
    if (localTime < 0) return true;
    if (isTimeInRanges(audio.buffered, localTime)) return false;
    // Live conversions may have no duration/seek table even when the original
    // song's duration is known. Ask the server to start at the requested time.
    return !Number.isFinite(audio.duration) || !isTimeInRanges(audio.seekable, localTime);
}

export function needsSeekRecovery(audio, target) {
    if (audio.seeking) return !isTimeInRanges(audio.buffered, target);
    // Playback may have advanced after a successful seek. Never rewind it.
    return !Number.isFinite(audio.currentTime) || Math.abs(audio.currentTime - target) > 3;
}
