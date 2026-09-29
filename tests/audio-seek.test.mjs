import test from "node:test";
import assert from "node:assert/strict";
import { audioStreamParams, isTimeInRanges, needsSeekRecovery } from "../public/audio-seek.js";

const ranges = (...values) => ({ length: values.length, start: (i) => values[i][0], end: (i) => values[i][1] });

test("streams original MP3s without transcoding, retaining compatibility for other formats", () => {
    assert.deepEqual(audioStreamParams({ id: "song", suffix: "MP3" }), { id: "song", format: "raw", maxBitRate: 0, suffix: "mp3" });
    for (const suffix of ["flac", "ogg", "", undefined]) {
        assert.deepEqual(audioStreamParams({ id: "song", suffix }), { id: "song", format: "mp3", maxBitRate: 320 });
    }
});

test("uses native FLAC/AAC only when the actual browser supports the source format", () => {
    const supported = (mime) => ["audio/flac", "audio/mp4"].includes(mime) ? "probably" : "";
    assert.deepEqual(audioStreamParams({ id: "lossless", suffix: "flac" }, supported), { id: "lossless", format: "raw", maxBitRate: 0, suffix: "flac" });
    assert.deepEqual(audioStreamParams({ id: "aac", suffix: "m4a" }, supported), { id: "aac", format: "raw", maxBitRate: 0, suffix: "m4a" });
    assert.deepEqual(audioStreamParams({ id: "mp4-aac", suffix: "mp4" }, supported), { id: "mp4-aac", format: "raw", maxBitRate: 0, suffix: "mp4" });
    assert.deepEqual(audioStreamParams({ id: "high-bitrate-mp4", suffix: "m4a", bitRate: 950 }, supported), { id: "high-bitrate-mp4", format: "raw", maxBitRate: 0, suffix: "m4a" });
    assert.equal(audioStreamParams({ suffix: "ogg" }, supported).format, "mp3");
    assert.equal(audioStreamParams({ suffix: "unknown" }, () => "probably").format, "mp3");
    assert.deepEqual(audioStreamParams({ id: "alac", suffix: "m4a" }, supported, true), { id: "alac", format: "mp3", maxBitRate: 320 });
});

test("requests original WAV bytes when the browser supports WAV", () => {
    const supported = (mime) => mime === "audio/wav" ? "probably" : "";
    assert.deepEqual(audioStreamParams({ id: "wav", suffix: "WAV" }, supported), { id: "wav", format: "raw", maxBitRate: 0, suffix: "wav" });
    assert.equal(audioStreamParams({ suffix: "wav" }, () => "").format, "mp3");
});

test("recognizes buffered ranges and gaps without treating the last buffered byte as available", () => {
    const buffered = ranges([0, 20], [50, 70]);
    assert.equal(isTimeInRanges(buffered, 10), true);
    assert.equal(isTimeInRanges(buffered, 20), false);
    assert.equal(isTimeInRanges(buffered, 30), false);
    assert.equal(isTimeInRanges(buffered, 60), true);
    assert.equal(isTimeInRanges(buffered, NaN), false);
});

test("does not reload buffered seeks or rewind playback that has already resumed", () => {
    assert.equal(needsSeekRecovery({ seeking: true, buffered: ranges([0, 180]), currentTime: 90 }, 90), false);
    assert.equal(needsSeekRecovery({ seeking: false, buffered: ranges(), currentTime: 91.5 }, 90), false);
});

test("recovers stalled unbuffered transcode seeks and seeks that returned to the old position", () => {
    assert.equal(needsSeekRecovery({ seeking: true, buffered: ranges([0, 20]), currentTime: 90 }, 90), true);
    assert.equal(needsSeekRecovery({ seeking: false, buffered: ranges([0, 20]), currentTime: 5 }, 90), true);
});
