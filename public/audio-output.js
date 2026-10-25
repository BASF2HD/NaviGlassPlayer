const OUTPUT_KEY = "naviglass-audio-output";

/** Routes the existing media element; never replaces its source or playback queue. */
export class AudioOutputSelection {
    constructor(audio, { mediaDevices, storage, secure = true, changed = () => {} } = {}) {
        this.audio = audio;
        this.media = mediaDevices;
        this.storage = storage;
        this.changed = changed;
        this.supported = secure && typeof audio.setSinkId === "function" && !!mediaDevices?.enumerateDevices;
        this.devices = [];
        this.preferred = null;
        this.busy = false;
        this.message = !secure ? "Use HTTPS or localhost to choose an output. Otherwise use system sound settings."
            : !this.supported ? "This browser uses the output selected in system sound settings." : "";
        this.route = Promise.resolve();
        this.revision = 0;
        try {
            const saved = JSON.parse(storage?.getItem(OUTPUT_KEY) || "null");
            if (typeof saved?.id === "string" && saved.id.length <= 2048 && saved.id)
                this.preferred = { id: saved.id, label: String(saved.label || "Saved output").slice(0, 160) };
        } catch { /* Storage may be unavailable in private browsing. */ }
        this.deviceChanged = () => this.refresh().catch(() => {});
        this.media?.addEventListener?.("devicechange", this.deviceChanged);
    }
    snapshot() {
        return { supported: this.supported, busy: this.busy, devices: this.devices,
            selected: this.audio.sinkId || "", message: this.message,
            discoverLabel: this.media?.selectAudioOutput ? "Choose output…" : "Allow device discovery" };
    }
    emit() { this.changed(this.snapshot()); }
    save() {
        try {
            if (this.preferred) this.storage?.setItem(OUTPUT_KEY, JSON.stringify(this.preferred));
            else this.storage?.removeItem(OUTPUT_KEY);
        } catch { /* Output still works for this session. */ }
    }
    error(error) {
        this.message = error?.name === "NotAllowedError" ? "Device permission was not granted. Choose an output again or use system sound settings."
            : error?.name === "NotFoundError" ? "That output is no longer connected. Refresh the device list."
            : "Could not switch audio output. Check the device connection and system sound settings.";
        this.emit();
    }
    async apply(id, remember = true, label = "") {
        if (!this.supported) return;
        const revision = ++this.revision;
        this.busy = true; this.emit();
        const operation = this.route.catch(() => {}).then(async () => {
            if (revision !== this.revision) return;
            await this.audio.setSinkId(id);
            if (revision !== this.revision) return;
            if (remember) {
                this.preferred = id ? { id, label: label || this.devices.find(d => d.id === id)?.label || "Selected output" } : null;
                this.save();
            }
            this.message = id ? "Selected: " + (label || this.devices.find(d => d.id === id)?.label || "Audio output") : "Using system default.";
        });
        this.route = operation;
        try { await operation; }
        catch (error) { if (revision === this.revision) this.error(error); throw error; }
        finally { if (revision === this.revision) { this.busy = false; this.emit(); } }
    }
    async refresh() {
        if (!this.supported) { this.emit(); return; }
        const revision = this.revision;
        try {
            const devices = await this.media.enumerateDevices();
            this.devices = devices.filter(d => d.kind === "audiooutput" && d.deviceId && d.deviceId !== "default")
                .filter((d, i, all) => all.findIndex(x => x.deviceId === d.deviceId) === i)
                .map((d, i) => ({ id: d.deviceId, label: d.label || "Audio output " + (i + 1) }));
            if (revision !== this.revision) { this.emit(); return; }
            if (this.preferred) {
                const saved = this.devices.find(d => d.id === this.preferred.id);
                if (saved && this.audio.sinkId !== saved.id) await this.apply(saved.id, false, saved.label);
                else if (!saved) {
                    if (this.audio.sinkId) await this.apply("", false);
                    this.message = this.preferred.label + " is unavailable. Using system default; reconnect it or choose an output again.";
                }
            }
            this.emit();
        } catch (error) { this.error(error); }
    }
    async discover() {
        if (!this.supported || this.busy) return;
        this.busy = true; this.emit();
        try {
            if (this.media.selectAudioOutput) {
                // Invoked directly from a click, preserving browser user activation.
                const device = await this.media.selectAudioOutput(this.preferred ? { deviceId: this.preferred.id } : {});
                await this.apply(device.deviceId, true, device.label);
            } else {
                // Chromium may require microphone permission to expose output devices.
                // Request only on this explicitly labelled button, then immediately stop capture.
                const stream = await this.media.getUserMedia({ audio: true, video: false });
                stream.getTracks().forEach(track => track.stop());
                this.message = "Choose a device from the output list.";
            }
            await this.refresh();
        } catch (error) { this.error(error); }
        finally { this.busy = false; this.emit(); }
    }
    destroy() { this.media?.removeEventListener?.("devicechange", this.deviceChanged); }
}

export function createAudioOutputSettings(audio) {
    const root = document.createElement("div"); root.className = "audio-output-settings";
    const label = document.createElement("label"); label.textContent = "Audio output / USB DAC";
    const select = document.createElement("select"); select.id = "audio-output-select"; label.htmlFor = select.id;
    const buttons = document.createElement("div"); buttons.className = "settings-stepper";
    const choose = document.createElement("button"); choose.type = "button"; choose.className = "settings-step-btn";
    const refresh = document.createElement("button"); refresh.type = "button"; refresh.className = "settings-step-btn"; refresh.textContent = "Refresh devices";
    const hint = document.createElement("p"); hint.className = "audio-output-hint";
    const status = document.createElement("p"); status.className = "audio-output-status"; status.setAttribute("role", "status");
    buttons.append(choose, refresh); root.append(label, select, buttons, hint, status);
    let storage; try { storage = window.localStorage; } catch {}
    const controller = new AudioOutputSelection(audio, { mediaDevices: navigator.mediaDevices, storage,
        secure: window.isSecureContext, changed(data) {
            select.replaceChildren(new Option("System default", ""));
            for (const d of data.devices) select.add(new Option(d.label, d.id));
            select.value = data.selected;
            select.disabled = !data.supported || data.busy;
            choose.textContent = data.discoverLabel;
            choose.disabled = !data.supported || data.busy || (!navigator.mediaDevices?.selectAudioOutput && !navigator.mediaDevices?.getUserMedia);
            refresh.disabled = !data.supported || data.busy;
            hint.textContent = data.supported && !navigator.mediaDevices?.selectAudioOutput
                ? "Device discovery may ask for microphone permission to list outputs. No audio is recorded or sent." : "Choose a DAC connected to this device.";
            status.textContent = data.message;
        } });
    select.onchange = () => controller.apply(select.value).catch(() => {});
    choose.onclick = () => controller.discover(); refresh.onclick = () => controller.refresh();
    controller.emit(); void controller.refresh();
    return root;
}
