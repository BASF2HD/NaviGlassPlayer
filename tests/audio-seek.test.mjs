import test from "node:test";
import assert from "node:assert/strict";
import { audioStreamParams, isTimeInRanges, needsSeekRecovery, needsServerOffsetSeek, streamElapsed, streamDuration } from "../public/audio-seek.js";

const ranges = (...values) => ({ length: values.length, start: (i) => values[i][0], end: (i) => values[i][1] });

test("streams original MP3s without transcoding, retaining compatibility for other formats", () => {
    assert.deepEqual(audioStreamParams({ id: "song", suffix: "MP3" }), { id: "song", format: "raw", maxBitRate: 0, suffix: "mp3" });
    for (const suffix of ["flac", "ogg", "", undefined]) {
        assert.deepEqual(audioStreamParams({ id: "song", suffix }), { id: "song", format: "mp3", maxBitRate: 320 });
    }
});

test("legacy streams do not confuse generic MP4 support with AAC and ALAC support", () => {
    const supported = (mime) => ["audio/flac", "audio/mp4"].includes(mime) ? "probably" : "";
    assert.deepEqual(audioStreamParams({ id: "lossless", suffix: "flac" }, supported), { id: "lossless", format: "raw", maxBitRate: 0, suffix: "flac" });
    for (const suffix of ["m4a", "mp4"]) {
        assert.equal(audioStreamParams({ suffix }, supported).format, "mp3");
        assert.equal(audioStreamParams({ suffix }, (mime) => mime.includes("codecs=") ? "maybe" : "").format, "raw");
        assert.equal(audioStreamParams({ suffix, bitRate: 950 }, supported).format, "mp3");
    }
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

test("far seeks on live conversions use server offsets; originals and buffered audio keep native seeking", () => {
    const converted = { canTranscode: true, canDirectPlay: false };
    const audio = { duration: Infinity, buffered: ranges([0, 10]), seekable: ranges([0, 10]) };
    assert.equal(needsServerOffsetSeek(converted, audio, 5), false);
    assert.equal(needsServerOffsetSeek(converted, audio, 150), true);
    assert.equal(needsServerOffsetSeek({ canDirectPlay: true }, audio, 150), false);
    assert.equal(needsServerOffsetSeek(converted, { ...audio, duration: 240, seekable: ranges([0, 240]) }, 150), false);
});

test("offset-relative seeks handle jumping backward and forward without losing the full-song clock", () => {
    const converted = { canTranscode: true };
    const audio = { duration: Infinity, buffered: ranges([0, 10]), seekable: ranges() };
    assert.equal(needsServerOffsetSeek(converted, audio, 152, 150), false);
    assert.equal(needsServerOffsetSeek(converted, audio, 30, 150), true);
    assert.equal(needsServerOffsetSeek(converted, audio, 220, 150), true);
    assert.equal(streamElapsed(2.5, 150), 152.5);
    assert.equal(streamDuration(90, 240, 150), 240);
    assert.equal(streamDuration(Infinity, 240, 150), 240);
    assert.equal(streamDuration(90, 0, 150), 240);
    assert.equal(streamDuration(240, 0, 0), 240);
});
