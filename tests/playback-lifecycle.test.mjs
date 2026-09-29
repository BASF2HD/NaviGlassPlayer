import test from "node:test";
import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import { runInNewContext } from "node:vm";
import { isTimeInRanges, needsServerOffsetSeek, streamElapsed, streamDuration } from "../public/audio-seek.js";

const source = await readFile(new URL("../public/app.js", import.meta.url), "utf8");
const section = (start, end) => source.slice(source.indexOf(start), source.indexOf(end));
const audioSetup = section("function setupAudio()", "function setupInput()");
const failure = section("function reportPlaybackFailure(error)", "function setAudioCurrentTime(seconds)");
const playList = section("async function playTrackList(tracks, index, queueKey)", "async function cmdPlayPause()");
const seekCommands = section("async function restartTranscodedAt(target, prepareId)", "function syncVolumeFromSlider()");
const setTime = section("function setAudioCurrentTime(seconds)", "function waitForAudioReady(");
const earlyEnd = section("function didAudioEndEarly()", "function getTrackRecoveryKey(");
const ranges = (...values) => ({ length: values.length, start: (i) => values[i][0], end: (i) => values[i][1] });

function fixture() {
    const listeners = new Map();
    const audio = {
        currentTime: 0, src: "", paused: true, readyState: 0, duration: Infinity,
        buffered: ranges(), seekable: ranges(), playCalls: 0,
        addEventListener: (name, handler) => listeners.set(name, handler),
        pause() { this.paused = true; },
        load() { this.currentTime = 0; this.readyState = 0; }, removeAttribute() { this.src = ""; },
        async play() { this.paused = false; this.playCalls += 1; },
    };
    const context = {
        Date, Number, Boolean, Math, DOMException,
        console: { error() {} }, window: { clearTimeout() {} },
        elements: { audioPlayer: audio }, state: { currentTrack: null },
        playbackState: {}, playbackLoadId: 0, playbackIntentPlaying: false,
        playbackDecision: null, playbackCompatibility: false, playbackFallback: null,
        playbackStreamOffset: 0, streamElapsed, streamDuration, needsServerOffsetSeek, isTimeInRanges,
        pendingSeek: null, seekPrepareId: 0, seekRetryTimerId: 0,
        radioPreviewReconnectTimer: 0, streamRecoveryAttempts: 0,
        flashStatus() {}, updateUI() {}, updatePlaybackStripUI() {}, positionInfoPanel() {},
        scheduleSnapBackToPlaying() {}, clearSnapBackTimer() {}, scheduleStreamCacheHandoff() {},
        clearStreamCacheHandoffTimer() {}, scheduleSeekCommitCheck() {},
        getTrackRecoveryKey: (track) => (track || context.state.currentTrack)?.id,
        isServerCachedTrack: (track) => Boolean(track?.id),
        hasPlaybackDecision: () => Boolean(context.playbackDecision),
        usesCachedPlaybackRoute: () => false,
        getSeekDuration: () => streamDuration(audio.duration, context.state.currentTrack?.duration || 0, context.playbackStreamOffset),
        fallbackToCompatibleStream: async () => false,
        scheduleRadioPreviewReconnect: () => false, didAudioEndEarly: () => false,
        recoverInterruptedTrackPlayback: async () => false, cmdNext() {},
        clamp: (value, min, max) => Math.min(max, Math.max(min, value)),
        updateNowPlayingMeta() {}, syncBrowseToTrack() {},
        playbackUrl: (track) => `/stream/${track.id}${context.playbackStreamOffset ? `?offset=${context.playbackStreamOffset}` : ""}`,
        playbackDecisions: { resolve: async () => ({ canDirectPlay: true }), prefetch() {} },
    };
    runInNewContext(`${failure}\n${setTime}\n${earlyEnd}\n${seekCommands}\n${audioSetup}\n${playList}\nsetupAudio();`, context);
    return { audio, context, emit: (name) => listeners.get(name)() };
}

test("play requests and buffering never pretend audio is actually playing", () => {
    const { audio, context, emit } = fixture();
    emit("play");
    assert.equal(context.playbackIntentPlaying, true);
    assert.equal(context.playbackState.playing, false);
    emit("playing");
    assert.equal(context.playbackState.playing, true);
    audio.currentTime = 42;
    emit("waiting");
    assert.equal(context.playbackState.playing, false);
    assert.equal(context.playbackState.elapsed, 42);
    assert.equal(context.playbackIntentPlaying, true);
});

test("terminal decoder failures stop playback and clear pending seeking", async () => {
    const { audio, context, emit } = fixture();
    context.pendingSeek = { target: 90 };
    context.playbackState.playing = true;
    audio.paused = false;
    audio.error = { code: 4, message: "unsupported codec" };
    await emit("error");
    assert.equal(audio.paused, true);
    assert.equal(context.playbackState.playing, false);
    assert.equal(context.playbackIntentPlaying, false);
    assert.equal(context.pendingSeek, null);
});

test("an old asynchronous error cannot stop a newly selected song", async () => {
    const { audio, context, emit } = fixture();
    let complete;
    context.fallbackToCompatibleStream = () => new Promise((resolve) => { complete = resolve; });
    audio.error = { code: 2 };
    const error = emit("error");
    context.playbackLoadId += 1;
    audio.paused = false;
    context.playbackState.playing = true;
    complete(false);
    await error;
    assert.equal(audio.paused, false);
    assert.equal(context.playbackState.playing, true);
});

test("rapid song switching discards the previous song's late stream decision", async () => {
    const { audio, context } = fixture();
    let completeFirst;
    context.playbackDecisions.resolve = (id) => id === "first"
        ? new Promise((resolve) => { completeFirst = resolve; }) : Promise.resolve({ canDirectPlay: true });
    const first = context.playTrackList([{ id: "first" }], 0, "queue");
    await context.playTrackList([{ id: "second" }], 0, "queue");
    completeFirst({ canDirectPlay: true });
    await first;
    assert.equal(audio.src, "/stream/second");
    assert.equal(context.state.currentTrack.id, "second");
    assert.equal(audio.paused, false);
});

function liveConversion() {
    const result = fixture();
    result.context.state.currentTrack = { id: "hires", duration: 247 };
    result.context.playbackDecision = { canTranscode: true };
    result.context.playbackDecisions.resolve = async () => ({ canTranscode: true });
    result.audio.readyState = 4;
    result.audio.buffered = ranges([0, 12]);
    result.audio.currentTime = 2;
    result.audio.src = "/stream/hires";
    return result;
}

test("a far live-conversion seek starts at the requested server offset, not the beginning", async () => {
    const { audio, context, emit } = liveConversion();
    audio.paused = false;
    await context.cmdSeek(195.5);
    assert.equal(audio.src, "/stream/hires?offset=195");
    assert.equal(context.playbackStreamOffset, 195);
    audio.readyState = 1;
    emit("loadedmetadata");
    assert.equal(audio.currentTime, 0.5);
    assert.equal(context.playbackState.duration, 247);
    assert.notEqual(context.pendingSeek, null);
    emit("seeked");
    assert.notEqual(context.pendingSeek, null, "metadata alone must not mark a silent seek complete");
    audio.readyState = 4;
    emit("playing");
    assert.equal(context.pendingSeek, null);
    assert.equal(context.playbackState.elapsed, 195.5);
});

test("seeking while paused does not resume audio, and buffered near seeks do not replace the source", async () => {
    const { audio, context } = liveConversion();
    await context.cmdSeek(200);
    assert.equal(audio.playCalls, 0);
    assert.equal(audio.paused, true);
    audio.buffered = ranges([0, 12]);
    const sourceAtSeek = audio.src;
    await context.cmdSeek(204);
    assert.equal(audio.src, sourceAtSeek);
    assert.equal(audio.currentTime, 4);
});

test("the latest random seek wins over an earlier pending stream decision", async () => {
    const { audio, context } = liveConversion();
    let completeFirst;
    let calls = 0;
    context.playbackDecisions.resolve = () => ++calls === 1
        ? new Promise((resolve) => { completeFirst = resolve; }) : Promise.resolve({ canTranscode: true });
    const first = context.cmdSeek(120);
    await context.cmdSeek(220);
    completeFirst({ canTranscode: true });
    await first;
    assert.equal(audio.src, "/stream/hires?offset=220");
    assert.equal(context.pendingSeek.target, 220);
});

test("switching songs cancels a pending offset seek and resets its timeline", async () => {
    const { audio, context } = liveConversion();
    let complete;
    context.playbackDecisions.resolve = (id) => id === "hires"
        ? new Promise((resolve) => { complete = resolve; }) : Promise.resolve({ canDirectPlay: true });
    const seek = context.cmdSeek(195);
    await context.playTrackList([{ id: "next", duration: 100 }], 0, "queue");
    complete({ canTranscode: true });
    await seek;
    assert.equal(audio.src, "/stream/next");
    assert.equal(context.playbackStreamOffset, 0);
});

test("the end of an offset stream is the end of the full song, not a premature ending to replay", async () => {
    const { audio, context, emit } = liveConversion();
    context.playbackStreamOffset = 218;
    audio.currentTime = 29;
    assert.equal(context.didAudioEndEarly(), false);
    let nextCalls = 0;
    context.cmdNext = () => { nextCalls += 1; };
    await emit("ended");
    assert.equal(nextCalls, 1);
    audio.currentTime = 1;
    assert.equal(context.didAudioEndEarly(), true);
});
