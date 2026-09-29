const CODECS = [
    { codec: "mp3", container: "mp3", mime: ['audio/mpeg; codecs="mp3"'] },
    { codec: "opus", container: "ogg", mime: ['audio/ogg; codecs="opus"'] },
    { codec: "vorbis", container: "ogg", mime: ['audio/ogg; codecs="vorbis"'] },
    { codec: "flac", container: "flac", mime: ["audio/flac", 'audio/flac; codecs="flac"'] },
    { codec: "wav", container: "wav", mime: ['audio/wav; codecs="1"'] },
    { codec: "alac", container: "mp4", mime: ['audio/mp4; codecs="alac"'] },
    { codec: "aac", container: "mp4", mime: ['audio/mp4; codecs="mp4a.40.2"'] },
];

export function browserPlaybackProfile(canPlayType, userAgent = "", compatibility = false) {
    const supports = (probe) => probe.mime.some((mime) => ["probably", "maybe"].includes(canPlayType(mime)));
    const safari = userAgent.includes("Safari") && !/Chrome|Chromium/.test(userAgent);
    const targets = compatibility || safari ? ["mp3"] : ["flac", "opus", "mp3"];
    return {
        name: "NaviGlassPlayer",
        platform: userAgent,
        directPlayProfiles: compatibility ? [] : CODECS.filter(supports).map(({ codec, container }) => ({
            containers: [container], audioCodecs: [codec], protocols: ["http"],
        })),
        transcodingProfiles: targets.flatMap((codec) => {
            const probe = CODECS.find((item) => item.codec === codec);
            return supports(probe) || codec === "mp3"
                ? [{ container: probe.container, audioCodec: codec, protocol: "http" }] : [];
        }),
        codecProfiles: [],
    };
}

function tokenExpiry(token) {
    try {
        const payload = token.split(".")[1].replace(/-/g, "+").replace(/_/g, "/");
        const { exp } = JSON.parse(atob(payload));
        return Number.isFinite(exp) ? exp * 1000 : 0;
    } catch {
        return 0;
    }
}

export function decisionStreamParams(trackId, decision, offset = 0) {
    if (!decision?.transcodeParams || (!decision.canDirectPlay && !decision.canTranscode)) {
        throw new Error(decision?.errorReason || "Navidrome could not select a playable audio format.");
    }
    return {
        mediaId: trackId, mediaType: "song", transcodeParams: decision.transcodeParams,
        ...(offset > 0 ? { offset: Math.floor(offset) } : {}),
    };
}

export function createPlaybackDecisions(fetchDecision, profile, compatibilityProfile, now = Date.now) {
    const cache = new Map();
    const pending = new Map();
    let generation = 0;
    const keyFor = (id, compatibility) => `${id}|${Boolean(compatibility)}`;
    const fresh = (decision) => tokenExpiry(decision?.transcodeParams || "") > now() + 60000;

    function peek(id, compatibility = false) {
        const decision = cache.get(keyFor(id, compatibility));
        return fresh(decision) ? decision : null;
    }

    async function resolve(id, compatibility = false) {
        const key = keyFor(id, compatibility);
        if (peek(id, compatibility)) return peek(id, compatibility);
        if (pending.has(key)) return pending.get(key);
        const requestedGeneration = generation;
        const request = Promise.resolve().then(() => fetchDecision(id, compatibility ? compatibilityProfile : profile))
            .then((decision) => {
                if (decision) decisionStreamParams(id, decision);
                if (requestedGeneration === generation && decision) {
                    cache.set(key, decision);
                    if (cache.size > 200) cache.delete(cache.keys().next().value);
                }
                return decision;
            }).finally(() => {
                if (pending.get(key) === request) pending.delete(key);
            });
        pending.set(key, request);
        return request;
    }

    function invalidate(id) {
        generation += 1;
        if (id == null) { cache.clear(); pending.clear(); }
        else for (const compatibility of [false, true]) {
            cache.delete(keyFor(id, compatibility));
            pending.delete(keyFor(id, compatibility));
        }
    }

    return {
        resolve, peek, invalidate,
        prefetch: (ids) => Promise.allSettled([...new Set(ids)].slice(0, 3).map((id) => resolve(id))),
    };
}
