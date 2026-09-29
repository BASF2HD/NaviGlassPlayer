export function audioStreamParams(track, canPlayType = () => "", forceTranscode = false) {
    const suffix = String(track?.suffix || "").toLowerCase();
    // A container's bitrate cannot identify its codec. Decoder errors trigger
    // the compatibility fallback when metadata cannot describe the codec.
    const mimeTypes = { mp3: "audio/mpeg", flac: "audio/flac", m4a: "audio/mp4", mp4: "audio/mp4", aac: "audio/aac", ogg: "audio/ogg", opus: "audio/ogg; codecs=opus", wav: "audio/wav" };
    // Keep native files seekable; transcode only formats this browser cannot play.
    const original = !forceTranscode && (suffix === "mp3" || Boolean(mimeTypes[suffix] && canPlayType(mimeTypes[suffix])));
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

export function needsSeekRecovery(audio, target) {
    if (audio.seeking) return !isTimeInRanges(audio.buffered, target);
    // Playback may have advanced after a successful seek. Never rewind it.
    return !Number.isFinite(audio.currentTime) || Math.abs(audio.currentTime - target) > 3;
}
