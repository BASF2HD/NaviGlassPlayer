import test from "node:test";
import assert from "node:assert/strict";
import { AudioOutputSelection } from "../public/audio-output.js";

function fixture(saved = null) {
    const values = new Map(saved ? [["naviglass-audio-output", JSON.stringify(saved)]] : []);
    const audio = { sinkId: "", currentTime: 37, src: "fixture.flac", paused: false,
        async setSinkId(id) { if (this.refuse === id) throw Object.assign(new Error(), { name: "NotAllowedError" }); this.sinkId = id; } };
    const media = { devices: [{ kind: "audiooutput", deviceId: "usb", label: "Fixture USB DAC" }],
        async enumerateDevices() { return this.devices; }, addEventListener() {}, removeEventListener() {} };
    const storage = { getItem: key => values.get(key), setItem: (key, value) => values.set(key, value), removeItem: key => values.delete(key) };
    const controller = new AudioOutputSelection(audio, { mediaDevices: media, storage });
    return { controller, audio, media, values };
}

test("selecting a USB output preserves source, playback position and playing state", async () => {
    const { controller, audio, values } = fixture();
    await controller.refresh(); await controller.apply("usb");
    assert.equal(audio.sinkId, "usb"); assert.equal(audio.currentTime, 37); assert.equal(audio.src, "fixture.flac"); assert.equal(audio.paused, false);
    assert.equal(JSON.parse(values.get("naviglass-audio-output")).id, "usb");
    await controller.apply(""); assert.equal(values.size, 0); assert.equal(audio.sinkId, "");
});
test("a saved DAC restores, disconnects to default and restores after reconnect", async () => {
    const { controller, audio, media, values } = fixture({ id: "usb", label: "Fixture USB DAC" });
    await controller.refresh(); assert.equal(audio.sinkId, "usb");
    media.devices = []; await controller.refresh(); assert.equal(audio.sinkId, ""); assert.match(controller.message, /unavailable/);
    assert.equal(JSON.parse(values.get("naviglass-audio-output")).id, "usb");
    media.devices = [{ kind: "audiooutput", deviceId: "usb", label: "Fixture USB DAC" }];
    await controller.refresh(); assert.equal(audio.sinkId, "usb");
});
test("denied switching preserves the previous choice and reports permission failure", async () => {
    const { controller, audio, values } = fixture(); await controller.refresh(); audio.refuse = "usb";
    await assert.rejects(controller.apply("usb")); assert.equal(audio.sinkId, ""); assert.equal(values.size, 0); assert.match(controller.message, /permission/);
});
test("only explicit device discovery requests permission, then stops all microphone tracks", async () => {
    const { controller, media } = fixture(); let captured = 0, stopped = 0;
    media.getUserMedia = async constraints => { captured++; assert.deepEqual(constraints, { audio: true, video: false }); return { getTracks: () => [{ stop() { stopped++; } }] }; };
    await controller.refresh(); assert.equal(captured, 0);
    await controller.discover(); assert.equal(captured, 1); assert.equal(stopped, 1);
});
test("the native browser picker routes the permitted output without microphone capture", async () => {
    const { controller, audio, media } = fixture();
    media.selectAudioOutput = async () => ({ deviceId: "usb", label: "Fixture USB DAC" });
    media.getUserMedia = () => { throw new Error("Microphone must not be requested"); };
    await controller.discover(); assert.equal(audio.sinkId, "usb"); assert.equal(controller.busy, false);
});
test("racing output selections finish on the newest choice", async () => {
    const { controller, audio } = fixture();
    await Promise.all([controller.apply("usb"), controller.apply("")]); assert.equal(audio.sinkId, ""); assert.equal(controller.preferred, null);
});
test("unsupported and insecure browsers retain system audio without requesting hardware", async () => {
    let enumerated = false;
    for (const secure of [false, true]) {
        const controller = new AudioOutputSelection({}, { secure, mediaDevices: { enumerateDevices() { enumerated = true; } } });
        await controller.refresh(); await controller.discover(); assert.equal(controller.supported, false);
    }
    assert.equal(enumerated, false);
});
