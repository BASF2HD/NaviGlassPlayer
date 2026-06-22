import {
    initScene,
    setAlbumData,
    setTextureAtIndex,
    navigateTo,
    jumpTo,
    renderOnce,
    onSnap,
    loadTexture,
    textureFromCanvas,
    getDefaultTexture,
    getSideCount,
    getActiveCoverBounds,
    getCenterCoverMetrics,
    setNaviGlassPlayerOffsetY,
    worldToScreenX,
    worldToScreenY,
} from "./renderer.js";

const STORAGE_KEY = "naviglassplayer-settings";
const SESSION_PASSWORD_KEY = "naviglassplayer-session-password";
const CLIENT_NAME = "naviglassplayer";
const API_VERSION = "1.16.1";
const UNLIMITED_BROWSE_LIMIT = 0;
const ALBUM_PAGE_SIZE = 200;
const ALBUM_APPEND_YIELD_MS = 0;
const SONG_PAGE_SIZE = 250;
const LARGE_BATCH_SIZE = 10000;
const MAX_BROWSE_ENTRY_CACHE_ITEMS = 16;
const MAX_HOT_TEXTURE_CACHE_ITEMS = 500;
const TEXTURE_PRELOAD_EXTRA_COVERS = 10;
const TEXTURE_PRELOAD_MAX_RADIUS = 32;
const CACHE_DB_NAME = "naviglassplayer-cache";
const CACHE_DB_VERSION = 1;
const BROWSE_CACHE_STORE = "browseViews";
const ARTWORK_CACHE_STORE = "artwork";
const PERSISTENT_BROWSE_CACHE_TTL_MS = 7 * 24 * 60 * 60 * 1000;
const MAX_PERSISTENT_ARTWORK_ITEMS = 3500;
const DEFAULT_FONT_SCALE = 1;
const MIN_FONT_SCALE = 0.5;
const MAX_FONT_SCALE = 1.6;
const MIN_YEAR = 1950;
const VALID_ALBUM_SHELVES = new Set([
    "alphabeticalByName",
    "alphabeticalByArtist",
    "recent",
    "newest",
    "frequent",
    "random",
    "highest",
]);
const TRACK_DISPLAY_MODE = Object.freeze({
    ALBUM: "album",
    SONG: "song",
});
const VALID_TRACK_DISPLAY_MODES = new Set(Object.values(TRACK_DISPLAY_MODE));
const alphaCollator = new Intl.Collator(undefined, { numeric: true, sensitivity: "base" });

const BROWSE_MODE = Object.freeze({
    ALBUM: "album",
    SONGS: "songs",
    ARTIST: "artist",
    COMPOSER: "composer",
    PLAYLIST: "playlist",
    SEARCH: "search",
    YEAR: "year",
    GENRE: "genre",
    RATING: "rating",
    STARRED: "starred",
    RADIO: "radio",
});

const DEFAULT_BROWSE_SORT = "year-asc";
const SORT_DEFAULTS_VERSION = 1;

const defaultSettings = {
    serverUrl: "http://127.0.0.1:4533",
    username: "",
    password: "",
    shelf: "alphabeticalByName",
    albumLimit: UNLIMITED_BROWSE_LIMIT,
    fontScale: DEFAULT_FONT_SCALE,
    viewMode: BROWSE_MODE.ALBUM,
    selectedArtistId: "",
    selectedArtistName: "",
    selectedComposer: "",
    artistPanel: "artist",
    artistBrowseSort: DEFAULT_BROWSE_SORT,
    artistDisplayMode: TRACK_DISPLAY_MODE.ALBUM,
    selectedPlaylistId: "",
    moreMode: "",
    selectedGenre: "",
    selectedYear: "",
    albumBrowseScope: "all",
    albumBrowseSort: DEFAULT_BROWSE_SORT,
    songsBrowseScope: "all",
    songsBrowseSort: DEFAULT_BROWSE_SORT,
    songsDisplayMode: TRACK_DISPLAY_MODE.ALBUM,
    playlistBrowseSort: DEFAULT_BROWSE_SORT,
    playlistDisplayMode: TRACK_DISPLAY_MODE.ALBUM,
    sortDefaultsVersion: SORT_DEFAULTS_VERSION,
};

const HEART_ICON_OUTLINE_PATH =
    "M16.5 3c-1.74 0-3.41.81-4.5 2.09C10.91 3.81 9.24 3 7.5 3 4.42 3 2 5.42 2 8.5c0 3.78 3.4 6.86 8.55 11.54L12 21.35l1.45-1.32C18.6 15.36 22 12.28 22 8.5 22 5.42 19.58 3 16.5 3zm-4.4 15.55-.1.1-.1-.1C7.14 14.24 4 11.39 4 8.5 4 6.5 5.5 5 7.5 5c1.54 0 3.04.99 3.57 2.36h1.87C13.46 5.99 14.96 5 16.5 5 18.5 5 20 6.5 20 8.5c0 2.89-3.14 5.74-7.9 10.05z";
const HEART_ICON_FILLED_PATH =
    "m12 21.35-1.45-1.32C5.4 15.36 2 12.28 2 8.5 2 5.42 4.42 3 7.5 3c1.74 0 3.41.81 4.5 2.09C13.09 3.81 14.76 3 16.5 3 19.58 3 22 5.42 22 8.5c0 3.78-3.4 6.86-8.55 11.54z";

const elements = {
    app: document.getElementById("app"),
    container: document.getElementById("naviglassplayer-container"),
    playbackStrip: document.getElementById("playback-strip"),
    infoPanel: document.getElementById("info-panel"),
    trackTitle: document.getElementById("track-title"),
    trackArtist: document.getElementById("track-artist"),
    btnInfoMenu: document.getElementById("btn-info-menu"),
    infoContextMenu: document.getElementById("info-context-menu"),
    btnDrawer: document.getElementById("btn-drawer"),
    btnPrev: document.getElementById("btn-prev"),
    btnPlay: document.getElementById("btn-play"),
    btnFsPrev: document.getElementById("btn-fs-prev"),
    btnFsPlay: document.getElementById("btn-fs-play"),
    btnFsNext: document.getElementById("btn-fs-next"),
    fullscreenTransport: document.getElementById("fullscreen-transport"),
    btnBrowsePrev: document.getElementById("btn-browse-prev"),
    browseStrip: document.getElementById("browse-strip"),
    btnNext: document.getElementById("btn-next"),
    btnBrowseNext: document.getElementById("btn-browse-next"),
    btnDrawerClose: document.getElementById("btn-drawer-close"),
    btnDrawerFavourite: document.getElementById("btn-drawer-favourite"),
    songsDrawer: document.getElementById("songs-drawer"),
    songsDrawerBackdrop: document.getElementById("songs-drawer-backdrop"),
    songsDrawerCount: document.getElementById("songs-drawer-count"),
    songsDrawerEyebrow: document.getElementById("songs-drawer-eyebrow"),
    songsDrawerTitle: document.getElementById("songs-drawer-title"),
    songsDrawerSubtitle: document.getElementById("songs-drawer-subtitle"),
    drawerFavouriteIconPath: document.getElementById("drawer-favourite-icon-path"),
    songsTableBody: document.getElementById("songs-table-body"),
    songInfoModal: document.getElementById("song-info-modal"),
    songInfoCard: document.querySelector("#song-info-modal .song-info-card"),
    songInfoContent: document.getElementById("song-info-content"),
    songInfoEyebrow: document.getElementById("song-info-eyebrow"),
    songInfoTitle: document.getElementById("song-info-title"),
    btnSongInfoClose: document.getElementById("btn-song-info-close"),
    iconPlay: document.getElementById("icon-play"),
    iconPause: document.getElementById("icon-pause"),
    iconFsPlay: document.getElementById("icon-fs-play"),
    iconFsPause: document.getElementById("icon-fs-pause"),
    seekTime: document.getElementById("seek-time"),
    seekTrack: document.getElementById("seek-track"),
    seekFill: document.getElementById("seek-fill"),
    seekHandle: document.getElementById("seek-handle"),
    btnSearch: document.getElementById("btn-search"),
    btnPlayerFullscreen: document.getElementById("btn-player-fullscreen"),
    searchPanel: document.getElementById("search-panel"),
    searchInput: document.getElementById("search-input"),
    btnSearchClear: document.getElementById("btn-search-clear"),
    btnSearchClose: document.getElementById("btn-search-close"),
    searchMeta: document.getElementById("search-meta"),
    searchResults: document.getElementById("search-results"),
    btnVolume: document.getElementById("btn-volume"),
    volumePopover: document.getElementById("volume-popover"),
    volumeIconPath: document.getElementById("volume-icon-path"),
    volumeSlider: document.getElementById("volume-slider"),
    controls: document.getElementById("controls"),
    controlsMain: document.getElementById("controls-main"),
    transport: document.getElementById("transport"),
    browseBarShell: document.getElementById("browse-bar-shell"),
    browseBar: document.getElementById("browse-bar"),
    statusOverlay: document.getElementById("status-overlay"),
    statusText: document.getElementById("status-text"),
    browseAlbum: document.getElementById("browse-album"),
    albumDropdown: document.getElementById("album-dropdown"),
    browseSongs: document.getElementById("browse-songs"),
    songsDropdown: document.getElementById("songs-dropdown"),
    browseArtist: document.getElementById("browse-artist"),
    artistDropdown: document.getElementById("artist-dropdown"),
    browsePlaylist: document.getElementById("browse-playlist"),
    playlistDropdown: document.getElementById("playlist-dropdown"),
    browseMore: document.getElementById("browse-more"),
    moreDropdown: document.getElementById("more-dropdown"),
    browseSettings: document.getElementById("browse-settings"),
    settingsDropdown: document.getElementById("settings-dropdown"),
    connectModal: document.getElementById("connect-modal"),
    connectUrlInput: document.getElementById("connect-url-input"),
    connectUsernameInput: document.getElementById("connect-username-input"),
    connectPasswordInput: document.getElementById("connect-password-input"),
    btnConnectPasswordToggle: document.getElementById("btn-connect-password-toggle"),
    connectHelper: document.getElementById("connect-helper"),
    btnConnectClose: document.getElementById("btn-connect-close"),
    btnConnectCancel: document.getElementById("btn-connect-cancel"),
    btnConnectSave: document.getElementById("btn-connect-save"),
    connectForm: document.getElementById("connect-form"),
    audioPlayer: document.getElementById("audio-player"),
};

const browseButtons = [
    elements.browseAlbum,
    elements.browseSongs,
    elements.browseArtist,
    elements.browsePlaylist,
    elements.browseMore,
    elements.browseSettings,
];

const initialSettings = loadSettings();

let albumInfoFontScale = initialSettings.fontScale;
let browseEntries = [];
let textures = [];
let textureLoadPromises = new Map();
let activeCoverHitBox = null;
let statusHideTimer = null;
let browseLoadId = 0;
let drawerLoadId = 0;
let progressiveAlbumLoad = null;
let searchTimerId = 0;
let searchLoadId = 0;
let searchBaseLoadId = 0;
let searchBaseEntries = [];
let searchBaseTextures = new Map();
let searchBaseMode = BROWSE_MODE.ALBUM;
let lastSearchClickIndex = -1;
let lastSearchClickAt = 0;
let playlistMembershipCache = new Map();
let radioCoverLookupPromises = new Map();
let browseEntryCache = new Map();
let activeBrowseEntryCacheKey = "";
let coverTextureCache = new Map();
let cacheDbPromise = null;
let activeLibraryCacheScope = "";
let persistentArtworkWriteCount = 0;
const blockedPersistentBrowseCacheKeys = new Set();
const blockedPersistentBrowseCachePrefixes = new Set();
const freshPersistentBrowseCacheKeys = new Set();
let blockAllPersistentBrowseCaches = false;

const state = {
    settings: initialSettings,
    authMode: "token",
    browseMode: normalizeBrowseMode(initialSettings.viewMode),
    browseIndex: 0,
    activeEntryKey: null,
    activeDropdown: null,
    activeMorePanel: null,
    searchOpen: false,
    searchQuery: "",
    searchLoading: false,
    radioInternetSearch: false,
    radioSearchResults: [],
    radioSearchError: "",
    radioSearchHasMore: false,
    radioSearchLoadingMore: false,
    radioSearchOffset: 0,
    activeRadioSearchMenuIndex: null,
    savedRadioStations: [],
    playerFullscreen: false,
    drawerOpen: false,
    drawerContext: { key: "", title: "Songs", subtitle: "", items: [], loading: false, albumId: "", albumStarred: false },
    activeSongMenuIndex: null,
    activeSongMenuMode: "actions",
    activeInfoMenuMode: "closed",
    activeInfoMenuSubject: null,
    infoTrackIndex: null,
    connected: false,
    artistOptions: [],
    composerOptions: [],
    composerSongCache: [],
    playlistOptions: [],
    genreOptions: [],
    detailsCache: new Map(),
    playbackQueue: [],
    playbackQueueKey: "",
    playbackIndex: -1,
    currentTrack: null,
    currentAlbumId: "",
};

const playbackState = {
    playing: false,
    volume: 100,
    title: "",
    artist: "",
    album: "",
    qualityPrimary: "Connect to Navidrome",
    qualitySecondary: "Browser playback",
    elapsed: 0,
    duration: 0,
    timelineUpdatedAt: 0,
};

initScene(elements.container);
onSnap(handleSnap);
setupAudio();
setupInput();
portalBrowseDropdowns();
updatePlaybackStripUI();
updateBrowseStripUI();
renderBrowseMenus();
renderSongsDrawer();
positionInfoPanel();

if (state.settings.username && state.settings.password) {
    connect().catch((error) => {
        console.error(error);
        showConnectError(error.message || "Could not connect to Navidrome.");
    });
} else {
    setConnectModalOpen(true);
}

let resizeLayoutTimer = 0;
function scheduleResizeLayout() {
    if (resizeLayoutTimer) {
        window.clearTimeout(resizeLayoutTimer);
    }
    resizeLayoutTimer = window.setTimeout(() => {
        resizeLayoutTimer = 0;
        positionInfoPanel();
    }, 120);
}

window.addEventListener("resize", scheduleResizeLayout);
window.addEventListener("orientationchange", scheduleResizeLayout);
let nativePlayerFullscreenActive = false;

function handleNativeFullscreenChange() {
    const nativeActive = Boolean(getFullscreenElement());
    if (nativeActive) {
        nativePlayerFullscreenActive = true;
        state.playerFullscreen = true;
    } else if (nativePlayerFullscreenActive) {
        nativePlayerFullscreenActive = false;
        state.playerFullscreen = false;
    }
    syncPlayerFullscreenState();
}

document.addEventListener("fullscreenchange", handleNativeFullscreenChange);
document.addEventListener("webkitfullscreenchange", handleNativeFullscreenChange);

function normalizeBrowseMode(value) {
    return Object.values(BROWSE_MODE).includes(value) ? value : BROWSE_MODE.ALBUM;
}

function normalizeAlbumShelf(value) {
    return VALID_ALBUM_SHELVES.has(value) ? value : defaultSettings.shelf;
}

function normalizeMoreMode(value) {
    return [
        BROWSE_MODE.YEAR,
        BROWSE_MODE.GENRE,
        BROWSE_MODE.RADIO,
    ].includes(value)
        ? value
        : "";
}

function normalizeTrackDisplayMode(value) {
    return VALID_TRACK_DISPLAY_MODES.has(value) ? value : TRACK_DISPLAY_MODE.ALBUM;
}

function normalizeBrowseSort(value) {
    return ["title", "year-asc", "year-desc"].includes(value) ? value : DEFAULT_BROWSE_SORT;
}

function loadSettings() {
    try {
        const storedRaw = JSON.parse(window.localStorage.getItem(STORAGE_KEY) || "{}");
        const { selectedFolderPath: _selectedFolderPath, password: storedPassword, ...stored } = storedRaw;
        if (storedPassword) {
            const sanitized = { ...storedRaw };
            delete sanitized.password;
            delete sanitized.selectedFolderPath;
            window.localStorage.setItem(STORAGE_KEY, JSON.stringify(sanitized));
        }
        const shouldUseNewSortDefaults = stored.sortDefaultsVersion !== SORT_DEFAULTS_VERSION;
        const sessionPassword = window.sessionStorage.getItem(SESSION_PASSWORD_KEY) || "";
        const savedSortOrDefault = (value) =>
            normalizeBrowseSort(shouldUseNewSortDefaults ? DEFAULT_BROWSE_SORT : value || DEFAULT_BROWSE_SORT);
        return {
            ...defaultSettings,
            ...stored,
            password: sessionPassword,
            serverUrl: normalizeServerUrl(stored.serverUrl || defaultSettings.serverUrl),
            shelf: normalizeAlbumShelf(stored.shelf || defaultSettings.shelf),
            // Force unlimited browsing by default; older saved limits are intentionally ignored.
            albumLimit: UNLIMITED_BROWSE_LIMIT,
            fontScale: clampNumber(Number(stored.fontScale) || DEFAULT_FONT_SCALE, MIN_FONT_SCALE, MAX_FONT_SCALE),
            viewMode: normalizeBrowseMode(stored.viewMode || defaultSettings.viewMode),
            moreMode: normalizeMoreMode(stored.moreMode || ""),
            selectedArtistId: String(stored.selectedArtistId || ""),
            selectedArtistName: String(stored.selectedArtistName || ""),
            selectedComposer: String(stored.selectedComposer || ""),
            artistPanel: stored.artistPanel === "composer" ? "composer" : "artist",
            artistBrowseSort: savedSortOrDefault(stored.artistBrowseSort),
            artistDisplayMode: normalizeTrackDisplayMode(stored.artistDisplayMode || defaultSettings.artistDisplayMode),
            selectedPlaylistId: String(stored.selectedPlaylistId || ""),
            selectedGenre: String(stored.selectedGenre || ""),
            selectedYear: String(stored.selectedYear || ""),
            albumBrowseScope: stored.albumBrowseScope === "favourite" ? "favourite" : "all",
            albumBrowseSort: savedSortOrDefault(stored.albumBrowseSort),
            songsBrowseScope: stored.songsBrowseScope === "favourite" ? "favourite" : "all",
            songsBrowseSort: savedSortOrDefault(stored.songsBrowseSort),
            songsDisplayMode: normalizeTrackDisplayMode(stored.songsDisplayMode || defaultSettings.songsDisplayMode),
            playlistBrowseSort: savedSortOrDefault(stored.playlistBrowseSort),
            playlistDisplayMode: normalizeTrackDisplayMode(stored.playlistDisplayMode || defaultSettings.playlistDisplayMode),
            sortDefaultsVersion: SORT_DEFAULTS_VERSION,
        };
    } catch {
        return { ...defaultSettings };
    }
}

function saveSettings() {
    state.settings.fontScale = albumInfoFontScale;
    state.settings.viewMode = state.browseMode === BROWSE_MODE.SEARCH ? BROWSE_MODE.ALBUM : state.browseMode;
    state.settings.moreMode = normalizeMoreMode(
        [
            BROWSE_MODE.YEAR,
            BROWSE_MODE.GENRE,
            BROWSE_MODE.RADIO,
        ].includes(state.browseMode)
            ? state.browseMode
            : ""
    );
    state.settings.albumBrowseScope = state.settings.albumBrowseScope === "favourite" ? "favourite" : "all";
    state.settings.albumBrowseSort = normalizeBrowseSort(state.settings.albumBrowseSort);
    state.settings.songsBrowseScope = state.settings.songsBrowseScope === "favourite" ? "favourite" : "all";
    state.settings.songsBrowseSort = normalizeBrowseSort(state.settings.songsBrowseSort);
    state.settings.songsDisplayMode = normalizeTrackDisplayMode(state.settings.songsDisplayMode);
    state.settings.playlistBrowseSort = normalizeBrowseSort(state.settings.playlistBrowseSort);
    state.settings.playlistDisplayMode = normalizeTrackDisplayMode(state.settings.playlistDisplayMode);
    state.settings.artistPanel = state.settings.artistPanel === "composer" ? "composer" : "artist";
    state.settings.selectedArtistId = String(state.settings.selectedArtistId || "");
    state.settings.selectedArtistName = String(state.settings.selectedArtistName || "");
    state.settings.selectedComposer = String(state.settings.selectedComposer || "");
    state.settings.artistBrowseSort = normalizeBrowseSort(state.settings.artistBrowseSort);
    state.settings.artistDisplayMode = normalizeTrackDisplayMode(state.settings.artistDisplayMode);
    state.settings.sortDefaultsVersion = SORT_DEFAULTS_VERSION;
    const { password: _password, ...persistedSettings } = state.settings;
    if (state.settings.password) {
        window.sessionStorage.setItem(SESSION_PASSWORD_KEY, state.settings.password);
    } else {
        window.sessionStorage.removeItem(SESSION_PASSWORD_KEY);
    }
    window.localStorage.setItem(STORAGE_KEY, JSON.stringify(persistedSettings));
}

function normalizeServerUrl(value) {
    let normalized = String(value || defaultSettings.serverUrl).trim();
    if (!normalized) {
        return defaultSettings.serverUrl;
    }
    if (!/^https?:\/\//i.test(normalized)) {
        normalized = `http://${normalized}`;
    }
    return normalized.replace(/\/+$/, "");
}

function clamp(value, min, max) {
    return Math.min(max, Math.max(min, value));
}

function isTextEntryTarget(target) {
    if (!(target instanceof HTMLElement)) {
        return false;
    }
    const tagName = target.tagName.toLowerCase();
    return tagName === "input" || tagName === "textarea" || target.isContentEditable;
}

function clampNumber(value, min, max) {
    return Math.min(max, Math.max(min, value));
}

function pickText(...values) {
    for (const value of values) {
        const text = String(value ?? "").trim();
        if (text) {
            return text;
        }
    }
    return "";
}

function pickMetadataText(...values) {
    for (const value of values) {
        const parts = ensureArray(value)
            .map((item) => {
                if (item && typeof item === "object") {
                    return pickText(item.name, item.value, item.title, item.id);
                }
                return pickText(item);
            })
            .filter(Boolean);
        if (parts.length) {
            return [...new Set(parts)].join(", ");
        }
    }
    return "";
}

function ensureArray(value) {
    return Array.isArray(value) ? value : value ? [value] : [];
}

function isCacheDbAvailable() {
    return typeof window !== "undefined" && "indexedDB" in window;
}

function openCacheDb() {
    if (!isCacheDbAvailable()) {
        return Promise.resolve(null);
    }
    if (cacheDbPromise) {
        return cacheDbPromise;
    }

    cacheDbPromise = new Promise((resolve) => {
        const request = window.indexedDB.open(CACHE_DB_NAME, CACHE_DB_VERSION);
        request.onupgradeneeded = () => {
            const db = request.result;
            if (!db.objectStoreNames.contains(BROWSE_CACHE_STORE)) {
                const store = db.createObjectStore(BROWSE_CACHE_STORE, { keyPath: "scopedKey" });
                store.createIndex("scope", "scope", { unique: false });
            }
            if (!db.objectStoreNames.contains(ARTWORK_CACHE_STORE)) {
                const store = db.createObjectStore(ARTWORK_CACHE_STORE, { keyPath: "scopedKey" });
                store.createIndex("scope", "scope", { unique: false });
                store.createIndex("lastUsed", "lastUsed", { unique: false });
            }
        };
        request.onsuccess = () => resolve(request.result);
        request.onerror = () => {
            console.warn("IndexedDB cache unavailable", request.error);
            resolve(null);
        };
        request.onblocked = () => resolve(null);
    });

    return cacheDbPromise;
}

function runCacheStore(storeName, mode, callback) {
    return openCacheDb().then((db) => {
        if (!db) {
            return null;
        }
        return new Promise((resolve) => {
            const tx = db.transaction(storeName, mode);
            const store = tx.objectStore(storeName);
            let result = null;
            tx.oncomplete = () => resolve(result);
            tx.onerror = () => resolve(null);
            tx.onabort = () => resolve(null);
            result = callback(store);
        });
    });
}

function requestToPromise(request) {
    return new Promise((resolve) => {
        request.onsuccess = () => resolve(request.result ?? null);
        request.onerror = () => resolve(null);
    });
}

function getLibraryCacheScope() {
    return [
        normalizeServerUrl(state.settings.serverUrl),
        String(state.settings.username || "").trim().toLocaleLowerCase(),
    ].join("|");
}

function scopedCacheKey(key) {
    return `${getLibraryCacheScope()}::${key}`;
}

function getEntryCoverCacheKey(entry, size = 512) {
    if (!entry) {
        return "";
    }
    if (entry.kind === "radio") {
        const radioId = pickText(entry.streamUrl, entry.externalUuid, entry.id, entry.title, entry.key);
        return radioId ? `radio:${radioId}:${size}` : "";
    }
    const id = pickText(entry.coverArt, entry.albumId, entry.id, entry.key);
    return id ? `art:${id}:${size}` : "";
}

function getTextureLookupKeys(entry, size = 512) {
    return [
        entry?.key || "",
        getEntryCoverCacheKey(entry, size),
    ].filter(Boolean);
}

function rememberTextureForEntry(entry, texture, size = 512) {
    const key = getEntryCoverCacheKey(entry, size);
    if (!key || !texture) {
        return;
    }
    coverTextureCache.delete(key);
    coverTextureCache.set(key, texture);
    while (coverTextureCache.size > MAX_HOT_TEXTURE_CACHE_ITEMS) {
        coverTextureCache.delete(coverTextureCache.keys().next().value);
    }
}

function getHotTextureForEntry(entry, size = 512) {
    const key = getEntryCoverCacheKey(entry, size);
    if (!key || !coverTextureCache.has(key)) {
        return null;
    }
    const texture = coverTextureCache.get(key);
    coverTextureCache.delete(key);
    coverTextureCache.set(key, texture);
    return texture;
}

function buildTexturesForEntries(entries, previousTextures = new Map()) {
    return entries.map((entry) => {
        const hotTexture = getHotTextureForEntry(entry);
        if (hotTexture) {
            return hotTexture;
        }
        for (const key of getTextureLookupKeys(entry)) {
            const texture = previousTextures.get(key);
            if (texture) {
                rememberTextureForEntry(entry, texture);
                return texture;
            }
        }
        return null;
    });
}

function collectTextureLookup(entries, entryTextures) {
    const lookup = new Map();
    entries.forEach((entry, index) => {
        const texture = entryTextures[index];
        if (!texture) {
            return;
        }
        for (const key of getTextureLookupKeys(entry)) {
            lookup.set(key, texture);
        }
        rememberTextureForEntry(entry, texture);
    });
    return lookup;
}

function isPersistentBrowseCacheBlocked(cacheKey) {
    if (freshPersistentBrowseCacheKeys.has(cacheKey)) {
        return false;
    }
    if (blockAllPersistentBrowseCaches || blockedPersistentBrowseCacheKeys.has(cacheKey)) {
        return true;
    }
    for (const prefix of blockedPersistentBrowseCachePrefixes) {
        if (cacheKey === prefix || cacheKey.startsWith(prefix)) {
            return true;
        }
    }
    return false;
}

function markPersistentBrowseCacheFresh(cacheKey) {
    if (cacheKey) {
        freshPersistentBrowseCacheKeys.add(cacheKey);
    }
}

function blockPersistentBrowseCache(mode = "") {
    if (!mode) {
        blockAllPersistentBrowseCaches = true;
        freshPersistentBrowseCacheKeys.clear();
        return;
    }
    const prefix = `${browseCachePart(mode)}|`;
    blockedPersistentBrowseCacheKeys.add(mode);
    blockedPersistentBrowseCachePrefixes.add(prefix);
}

async function getPersistentBrowseEntryCache(cacheKey) {
    if (!cacheKey || isPersistentBrowseCacheBlocked(cacheKey)) {
        return null;
    }
    const record = await runCacheStore(BROWSE_CACHE_STORE, "readonly", (store) =>
        requestToPromise(store.get(scopedCacheKey(cacheKey)))
    );
    if (!record?.value || Date.now() - Number(record.updatedAt || 0) > PERSISTENT_BROWSE_CACHE_TTL_MS) {
        return null;
    }
    return record.value;
}

function persistBrowseEntryCache(cacheKey, value) {
    if (!cacheKey || !value) {
        return;
    }
    const scope = getLibraryCacheScope();
    void runCacheStore(BROWSE_CACHE_STORE, "readwrite", (store) => {
        store.put({
            scopedKey: scopedCacheKey(cacheKey),
            scope,
            cacheKey,
            updatedAt: Date.now(),
            value,
        });
        return true;
    });
}

function deletePersistentBrowseEntryCaches(mode = "") {
    const scope = getLibraryCacheScope();
    const prefix = mode ? `${browseCachePart(mode)}|` : "";
    void runCacheStore(BROWSE_CACHE_STORE, "readwrite", (store) => {
        const request = store.openCursor();
        request.onsuccess = () => {
            const cursor = request.result;
            if (!cursor) {
                return;
            }
            const record = cursor.value;
            const sameScope = record?.scope === scope;
            const cacheKey = String(record?.cacheKey || "");
            const matchesMode = !mode || cacheKey === mode || cacheKey.startsWith(prefix);
            if (sameScope && matchesMode) {
                cursor.delete();
            }
            cursor.continue();
        };
        return true;
    });
}

async function getPersistentArtworkBlob(coverKey) {
    if (!coverKey) {
        return null;
    }
    const record = await runCacheStore(ARTWORK_CACHE_STORE, "readonly", (store) =>
        requestToPromise(store.get(scopedCacheKey(coverKey)))
    );
    if (record) {
        void runCacheStore(ARTWORK_CACHE_STORE, "readwrite", (store) => {
            store.put({ ...record, lastUsed: Date.now() });
            return true;
        });
    }
    return record?.blob || null;
}

function persistArtworkBlob(coverKey, blob) {
    if (!coverKey || !blob || !String(blob.type || "").startsWith("image/")) {
        return;
    }
    const scope = getLibraryCacheScope();
    persistentArtworkWriteCount += 1;
    void runCacheStore(ARTWORK_CACHE_STORE, "readwrite", (store) => {
        store.put({
            scopedKey: scopedCacheKey(coverKey),
            scope,
            coverKey,
            blob,
            updatedAt: Date.now(),
            lastUsed: Date.now(),
        });
        return true;
    });
    if (persistentArtworkWriteCount % 75 === 0) {
        void prunePersistentArtworkCache();
    }
}

async function prunePersistentArtworkCache() {
    const scope = getLibraryCacheScope();
    await runCacheStore(ARTWORK_CACHE_STORE, "readwrite", (store) => {
        const records = [];
        const request = store.openCursor();
        request.onsuccess = () => {
            const cursor = request.result;
            if (!cursor) {
                records
                    .filter((record) => record.scope === scope)
                    .sort((left, right) => Number(left.lastUsed || 0) - Number(right.lastUsed || 0))
                    .slice(0, Math.max(0, records.filter((record) => record.scope === scope).length - MAX_PERSISTENT_ARTWORK_ITEMS))
                    .forEach((record) => store.delete(record.scopedKey));
                return;
            }
            records.push(cursor.value);
            cursor.continue();
        };
        return true;
    });
}

async function loadTextureFromBlob(blob) {
    if (!blob) {
        return null;
    }
    const objectUrl = URL.createObjectURL(blob);
    try {
        return await loadTexture(objectUrl);
    } finally {
        window.setTimeout(() => URL.revokeObjectURL(objectUrl), 1000);
    }
}

async function loadArtworkTexture(entry, coverUrl, coverKey) {
    if (!coverUrl) {
        return null;
    }
    if (entry?.kind !== "radio") {
        const cachedBlob = await getPersistentArtworkBlob(coverKey);
        const cachedTexture = await loadTextureFromBlob(cachedBlob);
        if (cachedTexture && cachedTexture !== getDefaultTexture()) {
            return cachedTexture;
        }
        try {
            const response = await fetch(coverUrl, { headers: { accept: "image/*" } });
            if (response.ok) {
                const blob = await response.blob();
                persistArtworkBlob(coverKey, blob);
                const texture = await loadTextureFromBlob(blob);
                if (texture && texture !== getDefaultTexture()) {
                    return texture;
                }
            }
        } catch {
            // Fall back to the image loader below; remote artwork can be CORS-sensitive.
        }
    }
    return loadTexture(coverUrl);
}

function formatSongCount(count) {
    const safeCount = Math.max(0, Number(count || 0));
    return `${safeCount} ${safeCount === 1 ? "song" : "songs"}`;
}

function randomSalt(length = 12) {
    const alphabet = "abcdefghijklmnopqrstuvwxyz0123456789";
    const bytes = new Uint8Array(length);
    crypto.getRandomValues(bytes);
    return Array.from(bytes, (value) => alphabet[value % alphabet.length]).join("");
}

function authParams({ expectsJson = true, authMode = "token" } = {}) {
    const params = {
        u: state.settings.username,
        v: API_VERSION,
        c: CLIENT_NAME,
    };

    if (expectsJson) {
        params.f = "json";
    }

    if (authMode === "token") {
        const salt = randomSalt();
        params.s = salt;
        params.t = md5Utf8(`${state.settings.password}${salt}`);
    } else {
        params.p = encodePassword(state.settings.password);
    }

    return params;
}

function encodePassword(password) {
    return `enc:${Array.from(new TextEncoder().encode(password))
        .map((value) => value.toString(16).padStart(2, "0"))
        .join("")}`;
}

function buildProxyUrl(path, extraParams = {}, options = {}) {
    const expectsJson = options.expectsJson ?? true;
    const authMode = options.authMode || state.authMode;
    const params = new URLSearchParams({
        ...authParams({ expectsJson, authMode }),
        ...Object.fromEntries(
            Object.entries(extraParams).map(([key, value]) => [key, String(value)])
        ),
        __origin: state.settings.serverUrl,
    });
    return `/navidrome${path}?${params.toString()}`;
}

async function fetchJson(path, params = {}) {
    const modes = state.authMode === "token" ? ["token", "encoded"] : [state.authMode];
    let lastError;

    for (const authMode of modes) {
        const response = await fetch(buildProxyUrl(path, params, { authMode }), {
            headers: { accept: "application/json" },
        });

        let payload;
        try {
            payload = await response.json();
        } catch {
            throw new Error("Navidrome returned an invalid response.");
        }

        const envelope = payload["subsonic-response"];
        const message =
            envelope?.error?.message || payload?.error || payload?.details || `HTTP ${response.status}`;

        if (response.ok && envelope?.status === "ok") {
            state.authMode = authMode;
            return envelope;
        }

        lastError = new Error(message || "Navidrome request failed.");
        if (!/wrong username or password/i.test(message || "")) {
            throw lastError;
        }
    }

    throw new Error(
        `${lastError?.message || "Wrong username or password"}. Use your Navidrome app login, not the Linux SSH password.`
    );
}

function coverArtUrl(entry, size = 700) {
    const id = entry?.coverArt || entry?.albumId || entry?.id;
    if (!id) {
        return null;
    }
    return buildProxyUrl("/rest/getCoverArt.view", { id, size }, { expectsJson: false });
}

function streamUrl(trackId) {
    return buildProxyUrl("/rest/stream.view", { id: trackId, format: "mp3", maxBitRate: 320 }, { expectsJson: false });
}

function playbackUrl(track) {
    return track?.previewUrl || track?.streamUrl || streamUrl(track?.id);
}

function normalizeAlbum(album) {
    const artist = pickText(album.artist, "Unknown Artist");
    const year = String(album.year || "").trim();
    const userRating = Number(album.userRating || album.rating || 0);
    const averageRating = Number(album.averageRating || 0);
    return {
        kind: "album",
        key: `album:${album.id}`,
        id: String(album.id || ""),
        title: pickText(album.name, "Untitled Album"),
        subtitle: [artist, year].filter(Boolean).join("  ·  "),
        artist,
        coverArt: album.coverArt || album.id,
        songCount: Number(album.songCount || 0),
        year,
        duration: Number(album.duration || 0),
        starred: Boolean(album.starred),
        rating: Number.isFinite(userRating) ? userRating : 0,
        averageRating: Number.isFinite(averageRating) ? averageRating : 0,
    };
}

function hasAlbumRating(album) {
    return Number(album?.rating || 0) > 0 || Number(album?.averageRating || 0) > 0;
}

function shouldFallbackFromEmptyMode(mode) {
    void mode;
    return false;
}

function normalizeTrack(track, options = {}) {
    const id = String(track.id || options.fallbackId || "");
    const albumId = String(track.albumId || track.parent || options.albumId || "");
    const artist = pickText(track.artist, track.artistName, track.albumArtist, options.artist, "Unknown Artist");
    const albumArtist = pickText(track.albumArtist, track.albumArtistName, options.albumArtist, artist);
    const album = pickText(
        track.album,
        track.albumName,
        track.albumTitle,
        track.displayAlbum,
        track.parentTitle,
        options.albumTitle,
        "Unknown Album"
    );
    const year = String(track.year || options.year || "");
    const genre = pickText(track.genre, options.genre);
    const composer = pickMetadataText(track.displayComposer, track.composer, track.composers, options.composer);

    return {
        kind: "song",
        key:
            options.key ||
            `song:${options.source || "library"}:${options.contextId || albumId || "item"}:${id || options.index || 0}`,
        id,
        title: pickText(track.title, `Track ${(options.index || 0) + 1}`),
        subtitle: [artist, album].filter(Boolean).join("  ·  "),
        artist,
        albumArtist,
        album,
        albumId,
        coverArt: track.coverArt || options.coverArt || albumId || id || "",
        duration: Number(track.duration || 0),
        trackNo: Number(track.track || options.trackNo || options.index + 1 || 0),
        bitRate: Number(track.bitRate || track.bitrate || 0),
        suffix: pickText(track.suffix, options.suffix),
        year,
        genre,
        composer,
        starred: Boolean(track.starred),
        file: pickText(track.path, track.file),
        source: options.source || "library",
        contextId: String(options.contextId || ""),
        playlistId: String(options.playlistId || ""),
        playlistName: pickText(options.playlistName),
        playlistIndex: options.source === BROWSE_MODE.PLAYLIST ? Number(options.playlistIndex ?? options.index ?? -1) : -1,
        artistContext: pickText(options.artistContext),
        drawerAlbumId: String(options.drawerAlbumId || albumId || ""),
    };
}

function inferStreamSuffix(streamUrl) {
    try {
        const extension = new URL(streamUrl).pathname.split(".").pop();
        return extension && extension.length <= 5 ? extension : "";
    } catch {
        const extension = String(streamUrl || "").split("?")[0].split(".").pop();
        return extension && extension.length <= 5 ? extension : "";
    }
}

function hashText(value) {
    let hash = 2166136261;
    for (const char of String(value || "")) {
        hash ^= char.charCodeAt(0);
        hash = Math.imul(hash, 16777619);
    }
    return hash >>> 0;
}

function stationInitials(title) {
    const words = String(title || "Radio")
        .split(/[\s\-_/.:]+/)
        .map((word) => Array.from(word.trim())[0])
        .filter(Boolean);
    return (words.slice(0, 2).join("") || Array.from(title || "R")[0] || "R").toUpperCase();
}

function coverInitials(title) {
    const words = String(title || "Music")
        .split(/[\s\-_/.:()[\]]+/)
        .map((word) => Array.from(word.trim())[0])
        .filter(Boolean);
    return (words.slice(0, 2).join("") || Array.from(title || "M")[0] || "M").toUpperCase();
}

function wrapCoverText(ctx, text, maxWidth, maxLines) {
    const words = String(text || "Radio").split(/\s+/).filter(Boolean);
    const lines = [];
    let current = "";

    for (const word of words.length ? words : [text]) {
        const next = current ? `${current} ${word}` : word;
        if (ctx.measureText(next).width <= maxWidth || !current) {
            current = next;
            continue;
        }
        lines.push(current);
        current = word;
        if (lines.length === maxLines - 1) {
            break;
        }
    }

    if (current && lines.length < maxLines) {
        lines.push(current);
    }

    while (lines.length > maxLines) {
        lines.pop();
    }

    const lastIndex = lines.length - 1;
    if (lastIndex >= 0 && ctx.measureText(lines[lastIndex]).width > maxWidth) {
        const chars = Array.from(lines[lastIndex]);
        while (chars.length > 1 && ctx.measureText(`${chars.join("")}...`).width > maxWidth) {
            chars.pop();
        }
        lines[lastIndex] = `${chars.join("")}...`;
    }

    return lines;
}

function createGeneratedCoverTexture(entry) {
    const size = 512;
    const title = pickText(entry?.title, entry?.album, "Untitled");
    const artist = pickText(entry?.artist, entry?.subtitle, entry?.genre, "Unknown Artist");
    const label = entry?.kind === "song" ? "Song" : entry?.kind === "radio" ? "Radio" : "Album";
    const hash = hashText(`${entry?.kind || ""}:${title}:${artist}:${entry?.id || entry?.key || ""}`);
    const palette = [
        ["#171923", "#3b536f", "#c7d7ff"],
        ["#1d1722", "#75445e", "#ffd0e2"],
        ["#13201c", "#3c725f", "#cff8df"],
        ["#211b13", "#866b35", "#ffe0a3"],
        ["#141c26", "#7c4c42", "#ffd1bd"],
        ["#171926", "#5f5aa2", "#ddd9ff"],
    ];
    const [baseColor, accentColor, textAccent] = palette[hash % palette.length];
    const canvas = document.createElement("canvas");
    canvas.width = size;
    canvas.height = size;
    const ctx = canvas.getContext("2d");
    const gradient = ctx.createLinearGradient(0, 0, size, size);
    gradient.addColorStop(0, baseColor);
    gradient.addColorStop(0.6, accentColor);
    gradient.addColorStop(1, "#05070d");
    ctx.fillStyle = gradient;
    ctx.fillRect(0, 0, size, size);

    ctx.fillStyle = "rgba(255,255,255,0.09)";
    ctx.beginPath();
    ctx.arc(94, 88, 142, 0, Math.PI * 2);
    ctx.fill();
    ctx.fillStyle = "rgba(0,0,0,0.20)";
    ctx.beginPath();
    ctx.arc(420, 390, 172, 0, Math.PI * 2);
    ctx.fill();

    ctx.strokeStyle = "rgba(255,255,255,0.20)";
    ctx.lineWidth = 10;
    ctx.strokeRect(38, 38, size - 76, size - 76);
    ctx.strokeStyle = "rgba(255,255,255,0.10)";
    ctx.lineWidth = 5;
    ctx.strokeRect(56, 56, size - 112, size - 112);

    ctx.fillStyle = textAccent;
    ctx.font = "800 118px system-ui, -apple-system, BlinkMacSystemFont, sans-serif";
    ctx.textAlign = "center";
    ctx.textBaseline = "middle";
    ctx.fillText(coverInitials(title), size / 2, 206);

    ctx.fillStyle = "rgba(0,0,0,0.28)";
    ctx.fillRect(0, 320, size, 192);
    ctx.fillStyle = "#ffffff";
    ctx.font = "800 40px system-ui, -apple-system, BlinkMacSystemFont, sans-serif";
    const titleLines = wrapCoverText(ctx, title, 420, 2);
    const titleStartY = titleLines.length > 1 ? 370 : 388;
    titleLines.forEach((line, index) => {
        ctx.fillText(line, size / 2, titleStartY + index * 44);
    });

    ctx.fillStyle = "rgba(255,255,255,0.70)";
    ctx.font = "700 22px system-ui, -apple-system, BlinkMacSystemFont, sans-serif";
    const artistLines = wrapCoverText(ctx, artist, 390, 1);
    ctx.fillText(artistLines[0] || label, size / 2, 470);

    ctx.fillStyle = "rgba(255,255,255,0.62)";
    ctx.font = "800 18px system-ui, -apple-system, BlinkMacSystemFont, sans-serif";
    ctx.fillText(label.toUpperCase(), size / 2, 88);

    return textureFromCanvas(canvas);
}

function createRadioCoverTexture(station) {
    const size = 512;
    const title = pickText(station?.title, "Radio");
    const genre = pickText(station?.genre, "Internet Radio");
    const hash = hashText(`${title}:${station?.streamUrl || station?.id || ""}`);
    const palette = [
        ["#111827", "#2f6f8f", "#9fd8ff"],
        ["#191724", "#6f4aa3", "#f4c2ff"],
        ["#101820", "#b35d24", "#ffd08a"],
        ["#10231d", "#2f8f72", "#b7f4da"],
        ["#20131c", "#9c315f", "#ffc0d9"],
        ["#151a2d", "#5263c7", "#c7d2ff"],
    ];
    const [baseColor, accentColor, textAccent] = palette[hash % palette.length];
    const canvas = document.createElement("canvas");
    canvas.width = size;
    canvas.height = size;
    const ctx = canvas.getContext("2d");
    const gradient = ctx.createLinearGradient(0, 0, size, size);
    gradient.addColorStop(0, baseColor);
    gradient.addColorStop(0.55, accentColor);
    gradient.addColorStop(1, "#05070d");
    ctx.fillStyle = gradient;
    ctx.fillRect(0, 0, size, size);

    ctx.fillStyle = "rgba(255,255,255,0.10)";
    ctx.beginPath();
    ctx.arc(82, 74, 132, 0, Math.PI * 2);
    ctx.fill();
    ctx.fillStyle = "rgba(0,0,0,0.22)";
    ctx.beginPath();
    ctx.arc(418, 402, 180, 0, Math.PI * 2);
    ctx.fill();

    ctx.strokeStyle = "rgba(255,255,255,0.36)";
    ctx.lineWidth = 14;
    ctx.beginPath();
    ctx.arc(256, 218, 76, Math.PI * 1.18, Math.PI * 1.82);
    ctx.stroke();
    ctx.lineWidth = 10;
    ctx.beginPath();
    ctx.arc(256, 218, 116, Math.PI * 1.15, Math.PI * 1.85);
    ctx.stroke();

    ctx.fillStyle = "rgba(0,0,0,0.24)";
    ctx.fillRect(0, 326, size, 186);
    ctx.fillStyle = textAccent;
    ctx.font = "700 120px system-ui, -apple-system, BlinkMacSystemFont, sans-serif";
    ctx.textAlign = "center";
    ctx.textBaseline = "middle";
    ctx.fillText(stationInitials(title), size / 2, 218);

    ctx.fillStyle = "#ffffff";
    ctx.font = "800 42px system-ui, -apple-system, BlinkMacSystemFont, sans-serif";
    const titleLines = wrapCoverText(ctx, title, 420, 2);
    const titleStartY = titleLines.length > 1 ? 374 : 390;
    titleLines.forEach((line, index) => {
        ctx.fillText(line, size / 2, titleStartY + index * 46);
    });

    ctx.fillStyle = "rgba(255,255,255,0.72)";
    ctx.font = "700 22px system-ui, -apple-system, BlinkMacSystemFont, sans-serif";
    ctx.fillText(genre.toUpperCase(), size / 2, 474);

    return textureFromCanvas(canvas);
}

function normalizeRadioStation(station, index = 0) {
    const id = String(station.id || station.streamUrl || station.name || index);
    const title = pickText(station.name, `Radio ${index + 1}`);
    const stream = pickText(station.streamUrl);
    const homePage = pickText(station.homePageUrl, station.homepageUrl);
    const rawSuffix = pickText(station.suffix, station.codec, station.contentType, inferStreamSuffix(stream));
    const suffix = rawSuffix.toLocaleUpperCase() === "UNKNOWN" ? "" : rawSuffix;
    const bitRate = Number(station.bitRate || station.bitrate || station.bitRateKbps || 0);
    const genre = pickText(station.genre, station.tags, station.category, "Radio");
    return {
        kind: "radio",
        key: `radio:${id}`,
        id,
        title,
        subtitle: homePage || "Internet radio",
        artist: title,
        album: "Radio",
        albumId: "",
        coverArt: "",
        duration: 0,
        trackNo: index + 1,
        bitRate,
        suffix,
        year: "",
        genre,
        composer: "",
        starred: false,
        file: stream,
        source: BROWSE_MODE.RADIO,
        contextId: BROWSE_MODE.RADIO,
        playlistId: "",
        playlistName: "",
        playlistIndex: -1,
        artistContext: "",
        drawerAlbumId: "",
        streamUrl: stream,
        previewUrl: pickText(station.previewUrl),
        iconUrl: pickText(station.iconUrl),
        homePageUrl: homePage,
        favicon: pickText(station.favicon, station.artUrl),
        country: pickText(station.country),
        language: pickText(station.language),
        tags: pickText(station.tags),
        externalUuid: pickText(station.externalUuid, station.stationuuid),
        source: pickText(station.source, BROWSE_MODE.RADIO),
    };
}

function normalizeIdentityText(value) {
    return pickText(value).trim().toLocaleLowerCase();
}

function tracksReferToSameSong(left, right) {
    if (!left || !right) {
        return false;
    }

    const leftId = String(left.id || "");
    const rightId = String(right.id || "");
    if (leftId && rightId && leftId === rightId) {
        return true;
    }

    const leftFile = normalizeIdentityText(left.file);
    const rightFile = normalizeIdentityText(right.file);
    if (leftFile && rightFile && leftFile === rightFile) {
        return true;
    }

    const leftTitle = normalizeIdentityText(left.title);
    const rightTitle = normalizeIdentityText(right.title);
    const leftArtist = normalizeIdentityText(left.artist);
    const rightArtist = normalizeIdentityText(right.artist);
    const leftAlbum = normalizeIdentityText(left.album);
    const rightAlbum = normalizeIdentityText(right.album);
    const leftDuration = Math.round(Number(left.duration || 0));
    const rightDuration = Math.round(Number(right.duration || 0));
    const durationsMatch =
        leftDuration > 0 && rightDuration > 0
            ? Math.abs(leftDuration - rightDuration) <= 2
            : leftDuration === rightDuration;

    return Boolean(leftTitle && rightTitle) &&
        leftTitle === rightTitle &&
        leftArtist === rightArtist &&
        leftAlbum === rightAlbum &&
        durationsMatch;
}

function getTrackPlaylistMembershipCacheKey(track) {
    const id = String(track?.id || "");
    if (id) {
        return `id:${id}`;
    }
    return [
        normalizeIdentityText(track?.file),
        normalizeIdentityText(track?.title),
        normalizeIdentityText(track?.artist),
        normalizeIdentityText(track?.album),
        Math.round(Number(track?.duration || 0)),
    ].join("|");
}

function clearTrackPlaylistMembershipCache(track) {
    const key = getTrackPlaylistMembershipCacheKey(track);
    if (key) {
        playlistMembershipCache.delete(key);
    }
}

async function loadTrackPlaylistMemberships(track, { force = false } = {}) {
    const key = getTrackPlaylistMembershipCacheKey(track);
    if (!key) {
        return new Map();
    }
    if (!force && playlistMembershipCache.has(key)) {
        return playlistMembershipCache.get(key);
    }

    const playlists = await ensurePlaylistOptions();
    const memberships = new Map();
    for (const playlistOption of playlists) {
        const playlistId = String(playlistOption.id || "");
        if (!playlistId) {
            continue;
        }
        const playlist = await ensurePlaylistDetails(playlistId);
        const index = playlist.tracks.findIndex((playlistTrack) => tracksReferToSameSong(playlistTrack, track));
        if (index >= 0) {
            memberships.set(playlistId, {
                playlistId,
                index,
                title: playlist.title || playlistOption.title || "playlist",
            });
        }
    }
    playlistMembershipCache.set(key, memberships);
    return memberships;
}

async function buildAlbumGroupEntries(tracks, { source, contextId = source } = {}) {
    const groups = new Map();
    for (const track of tracks) {
        if (!track?.id) {
            continue;
        }
        const albumKey = songAlbumGroupKey(track);
        if (!groups.has(albumKey)) {
            groups.set(albumKey, {
                kind: "album",
                key: `album-group:${source}:${contextId}:${albumKey}`,
                id: track.albumId || albumKey,
                title: pickText(track.album, "Unknown Album"),
                artist: pickText(track.artist, "Unknown Artist"),
                subtitle: "",
                coverArt: track.coverArt || track.albumId || track.id,
                year: track.year || "",
                source,
                contextId: String(contextId || source),
                groupTracks: [],
            });
        }
        groups.get(albumKey).groupTracks.push(track);
    }

    const entries = [...groups.values()].map((entry) => ({
        ...entry,
        subtitle: `${entry.artist}  ·  ${entry.groupTracks.length} ${entry.groupTracks.length === 1 ? "song" : "songs"}`,
        songCount: entry.groupTracks.length,
        duration: entry.groupTracks.reduce((total, track) => total + Number(track.duration || 0), 0),
        groupTracks: sortBrowseEntriesAtoZ(entry.groupTracks),
    }));

    await Promise.all(
        entries.map(async (entry) => {
            if (!entry.id || entry.title !== "Unknown Album") {
                return;
            }
            try {
                const album = await ensureAlbumDetails(entry.id);
                entry.title = album.title || entry.title;
                entry.artist = album.artist || entry.artist;
                entry.coverArt = album.coverArt || entry.coverArt;
                entry.year = album.year || entry.year;
                entry.subtitle = `${entry.artist}  ·  ${entry.songCount} ${entry.songCount === 1 ? "song" : "songs"}`;
            } catch {
                // Keep the song-derived fallback if this album id cannot be fetched.
            }
        })
    );

    return entries;
}

function albumShelfGroupKey({ title = "", fallback = "" } = {}) {
    const albumTitle = pickText(title);
    if (albumTitle && albumTitle !== "Unknown Album") {
        return `album-shelf:${albumTitle.toLowerCase()}`;
    }
    return `fallback:${pickText(fallback)}`;
}

function songAlbumGroupKey(track) {
    const albumTitle = pickText(track?.album);
    if (albumTitle && albumTitle !== "Unknown Album") {
        return `song-album-title:${albumTitle.toLowerCase()}`;
    }
    const albumId = pickText(track?.albumId);
    if (albumId) {
        return `song-album-id:${albumId}`;
    }
    return `song-fallback:${pickText(track?.coverArt, track?.id)}`;
}

function groupAlbumEntriesByTitle(entries) {
    const groups = new Map();
    const passthrough = [];

    for (const entry of entries) {
        if (entry?.kind !== "album" || Array.isArray(entry.groupTracks)) {
            passthrough.push(entry);
            continue;
        }

        const groupKey = albumShelfGroupKey({
            title: entry.title,
            fallback: pickText(entry.coverArt, entry.key),
        });
        if (!groups.has(groupKey)) {
            groups.set(groupKey, {
                ...entry,
                key: `album-title-group:${groupKey}`,
                groupAlbumIds: Array.isArray(entry.groupAlbumIds)
                    ? [...entry.groupAlbumIds]
                    : entry.id ? [entry.id] : [],
                songCount: Number(entry.songCount || 0),
                duration: Number(entry.duration || 0),
            });
            continue;
        }

        const existing = groups.get(groupKey);
        const nextAlbumIds = Array.isArray(entry.groupAlbumIds)
            ? entry.groupAlbumIds
            : entry.id ? [entry.id] : [];
        for (const albumId of nextAlbumIds) {
            if (albumId && !existing.groupAlbumIds.includes(albumId)) {
                existing.groupAlbumIds.push(albumId);
            }
        }
        existing.songCount += Number(entry.songCount || 0);
        existing.duration += Number(entry.duration || 0);
        existing.starred = Boolean(existing.starred || entry.starred);
        existing.year = existing.year || entry.year || "";
    }

    return passthrough.concat([...groups.values()]);
}

function groupRawAlbumEntriesIfNeeded(entries) {
    return entries.some((entry) => entry?.kind === "album" && !Array.isArray(entry.groupTracks))
        ? groupAlbumEntriesByTitle(entries)
        : entries;
}

function normalizeArtistOptions(payload) {
    const artists = [];
    for (const indexGroup of ensureArray(payload.artists?.index)) {
        for (const artist of ensureArray(indexGroup.artist)) {
            artists.push({
                id: String(artist.id || artist.name || ""),
                title: pickText(artist.name, "Unknown Artist"),
                subtitle: `${artist.albumCount || 0} ${Number(artist.albumCount || 0) === 1 ? "album" : "albums"}`,
                value: pickText(artist.name, "Unknown Artist"),
            });
        }
    }
    artists.sort((left, right) =>
        left.title.localeCompare(right.title, undefined, { numeric: true, sensitivity: "base" })
    );
    return artists;
}

async function ensureArtistOptions(force = false) {
    if (!force && state.artistOptions.length) {
        return state.artistOptions;
    }
    const payload = await fetchJson("/rest/getArtists.view");
    state.artistOptions = normalizeArtistOptions(payload);
    const selectedById = state.artistOptions.find((artist) => artist.id === state.settings.selectedArtistId);
    const selectedName = String(state.settings.selectedArtistName || "").toLocaleLowerCase();
    const selectedByName = selectedName
        ? state.artistOptions.find((artist) => artist.title.toLocaleLowerCase() === selectedName)
        : null;

    if (selectedById) {
        state.settings.selectedArtistName = selectedById.title || state.settings.selectedArtistName;
        saveSettings();
    } else if (selectedByName) {
        state.settings.selectedArtistId = selectedByName.id;
        state.settings.selectedArtistName = selectedByName.title;
        saveSettings();
    } else if (!state.settings.selectedArtistId && !state.settings.selectedArtistName) {
        const firstUsefulArtist =
            state.artistOptions.find((artist) => artist.title && artist.title !== "Unknown Artist") ||
            state.artistOptions[0];
        state.settings.selectedArtistId = firstUsefulArtist?.id || "";
        state.settings.selectedArtistName = firstUsefulArtist?.title || "";
        saveSettings();
    }
    return state.artistOptions;
}

function normalizeComposerOptions(tracks) {
    const composers = new Map();
    for (const track of tracks) {
        const names = String(track?.composer || "")
            .split(/[;,]/)
            .map((name) => name.trim())
            .filter(Boolean);
        for (const name of names) {
            const key = name.toLocaleLowerCase();
            const existing = composers.get(key) || { value: name, title: name, songCount: 0, albumIds: new Set() };
            existing.songCount += 1;
            if (track.albumId) {
                existing.albumIds.add(track.albumId);
            }
            composers.set(key, existing);
        }
    }

    return [...composers.values()]
        .map((composer) => {
            const albumCount = composer.albumIds.size;
            return {
                value: composer.value,
                title: composer.title,
                songCount: composer.songCount,
                albumCount,
                subtitle: albumCount
                    ? `${albumCount} ${albumCount === 1 ? "album" : "albums"}`
                    : formatSongCount(composer.songCount),
            };
        })
        .sort((left, right) =>
            left.title.localeCompare(right.title, undefined, { numeric: true, sensitivity: "base" })
        );
}

async function ensureComposerOptions(force = false) {
    if (!force && state.composerOptions.length) {
        return state.composerOptions;
    }
    if (force || !state.composerSongCache.length) {
        state.composerSongCache = await fetchLibrarySongTracks({
            source: BROWSE_MODE.COMPOSER,
            contextId: BROWSE_MODE.COMPOSER,
            keyPrefix: "composer-source",
            maxItems: LARGE_BATCH_SIZE,
        });
    }
    state.composerOptions = normalizeComposerOptions(state.composerSongCache);
    if (!state.composerOptions.some((composer) => composer.value === state.settings.selectedComposer)) {
        state.settings.selectedComposer = state.composerOptions[0]?.value || "";
        saveSettings();
    }
    return state.composerOptions;
}

async function ensurePlaylistOptions(force = false) {
    if (!force && state.playlistOptions.length) {
        return state.playlistOptions;
    }
    const payload = await fetchJson("/rest/getPlaylists.view");
    state.playlistOptions = ensureArray(payload.playlists?.playlist)
        .map((playlist) => {
            const songCount = Math.max(0, Number(playlist.songCount || 0));
            return {
                id: String(playlist.id || ""),
                title: pickText(playlist.name, "Playlist"),
                songCount,
                subtitle: formatSongCount(songCount),
                value: String(playlist.id || ""),
            };
        })
        .sort((left, right) =>
            left.title.localeCompare(right.title, undefined, { numeric: true, sensitivity: "base" })
        );
    await refreshEmptyPlaylistCounts();
    if (!state.playlistOptions.some((playlist) => playlist.id === state.settings.selectedPlaylistId)) {
        state.settings.selectedPlaylistId = state.playlistOptions[0]?.id || "";
        saveSettings();
    }
    return state.playlistOptions;
}

async function refreshEmptyPlaylistCounts() {
    const emptyPlaylists = state.playlistOptions.filter((playlist) => playlist.id && playlist.songCount === 0);
    await Promise.all(
        emptyPlaylists.map(async (playlist) => {
            try {
                const details = await ensurePlaylistDetails(playlist.id);
                const songCount = details.tracks.length;
                if (songCount > 0) {
                    playlist.songCount = songCount;
                    playlist.subtitle = formatSongCount(songCount);
                }
            } catch (error) {
                console.warn(`Unable to refresh playlist count for ${playlist.title}`, error);
            }
        })
    );
}

async function ensureGenreOptions(force = false) {
    if (!force && state.genreOptions.length) {
        return state.genreOptions;
    }
    const payload = await fetchJson("/rest/getGenres.view");
    const rawGenres = Array.isArray(payload.genres)
        ? payload.genres
        : ensureArray(payload.genres?.genre);
    state.genreOptions = rawGenres
        .map((genre) => ({
            value: String(genre.value || "").trim(),
            title: String(genre.value || "").trim(),
            subtitle: `${genre.albumCount || 0} ${Number(genre.albumCount || 0) === 1 ? "album" : "albums"}`,
        }))
        .filter((genre) => genre.value)
        .sort((left, right) =>
            left.title.localeCompare(right.title, undefined, { numeric: true, sensitivity: "base" })
        );
    if (!state.genreOptions.some((genre) => genre.value === state.settings.selectedGenre)) {
        state.settings.selectedGenre = state.genreOptions[0]?.value || "";
        saveSettings();
    }
    return state.genreOptions;
}

function buildYearOptions() {
    const years = [];
    const currentYear = new Date().getFullYear();
    for (let year = currentYear; year >= MIN_YEAR; year -= 1) {
        years.push(String(year));
    }
    if (state.settings.selectedYear && !years.includes(state.settings.selectedYear)) {
        years.unshift(state.settings.selectedYear);
    }
    return years;
}

async function getAlbumShelfRequestForMode(mode) {
    switch (mode) {
        case BROWSE_MODE.YEAR:
            if (!state.settings.selectedYear) {
                state.settings.selectedYear = buildYearOptions()[0] || "";
                saveSettings();
            }
            return {
                type: "byYear",
                extraParams: {
                    fromYear: state.settings.selectedYear,
                    toYear: state.settings.selectedYear,
                },
            };
        case BROWSE_MODE.GENRE:
            if (!state.settings.selectedGenre) {
                await ensureGenreOptions();
            }
            return {
                type: "byGenre",
                extraParams: { genre: state.settings.selectedGenre },
            };
        case BROWSE_MODE.RATING:
            return { type: "highest", extraParams: { requireRated: true } };
        case BROWSE_MODE.ALBUM:
            if (state.settings.albumBrowseScope === "favourite") {
                return null;
            }
            if (normalizeBrowseSort(state.settings.albumBrowseSort) !== "title") {
                return null;
            }
            return {
                type: normalizeAlbumShelf(state.settings.shelf),
                extraParams: {},
            };
        default:
            return null;
    }
}

async function fetchAlbumShelfPage(type, offset = 0, size = ALBUM_PAGE_SIZE, extraParams = {}) {
    if (size <= 0) {
        return [];
    }
    const { requireRated = false, ...requestParams } = extraParams;
    const payload = await fetchJson("/rest/getAlbumList2.view", {
        type,
        size,
        offset,
        ...requestParams,
    });
    const batch = ensureArray(payload.albumList2?.album);
    const albums = [];
    const seen = new Set();
    for (const album of batch) {
        const id = String(album.id || "");
        if (!id || seen.has(id)) {
            continue;
        }
        seen.add(id);
        const normalized = normalizeAlbum(album);
        if (requireRated && !hasAlbumRating(normalized)) {
            continue;
        }
        albums.push(normalized);
    }
    return albums;
}

async function fetchAlbumShelf(type, extraParams = {}) {
    const albums = [];
    const seen = new Set();
    const maxItems = state.settings.albumLimit > 0 ? state.settings.albumLimit : Number.POSITIVE_INFINITY;

    for (let offset = 0; ; offset += ALBUM_PAGE_SIZE) {
        const remaining = Number.isFinite(maxItems) ? Math.max(0, maxItems - albums.length) : ALBUM_PAGE_SIZE;
        const pageSize = Number.isFinite(maxItems) ? Math.min(ALBUM_PAGE_SIZE, remaining) : ALBUM_PAGE_SIZE;
        if (pageSize <= 0) {
            break;
        }
        const batch = await fetchAlbumShelfPage(type, offset, pageSize, extraParams);
        for (const album of batch) {
            if (!album.id || seen.has(album.id)) {
                continue;
            }
            seen.add(album.id);
            albums.push(album);
        }
        if (type === "random" || batch.length < pageSize || (Number.isFinite(maxItems) && albums.length >= maxItems)) {
            break;
        }
    }

    return albums;
}

async function fetchLibrarySongTracks({ source, contextId = source, keyPrefix = source, maxItems } = {}) {
    const songs = [];
    const seen = new Set();
    const limit = Number.isFinite(maxItems)
        ? maxItems
        : state.settings.albumLimit > 0 ? state.settings.albumLimit : Number.POSITIVE_INFINITY;

    for (let offset = 0; ; offset += SONG_PAGE_SIZE) {
        const remaining = Number.isFinite(limit) ? Math.max(0, limit - songs.length) : SONG_PAGE_SIZE;
        const pageSize = Number.isFinite(limit) ? Math.min(SONG_PAGE_SIZE, remaining) : SONG_PAGE_SIZE;
        if (pageSize <= 0) {
            break;
        }

        const payload = await fetchJson("/rest/search3.view", {
            query: "",
            songCount: pageSize,
            songOffset: offset,
            albumCount: 0,
            artistCount: 0,
        });
        const batch = ensureArray(payload.searchResult3?.song);

        for (const track of batch) {
            const songId = String(track.id || "");
            if (songId && seen.has(songId)) {
                continue;
            }
            if (songId) {
                seen.add(songId);
            }
            songs.push(
                normalizeTrack(track, {
                    source,
                    contextId,
                    key: `song:${keyPrefix}:${songId || offset + songs.length}`,
                    index: songs.length,
                })
            );
        }

        if (batch.length < pageSize || (Number.isFinite(limit) && songs.length >= limit)) {
            break;
        }
    }

    return songs;
}

async function fetchSongs() {
    if (state.settings.songsBrowseScope === "favourite") {
        const songs = await fetchStarredSongs();
        return state.settings.songsDisplayMode === TRACK_DISPLAY_MODE.ALBUM
            ? await buildAlbumGroupEntries(songs, { source: BROWSE_MODE.SONGS, contextId: "favourite" })
            : songs;
    }

    const songs = await fetchLibrarySongTracks({
        source: BROWSE_MODE.SONGS,
        contextId: BROWSE_MODE.SONGS,
        keyPrefix: "songs",
    });

    return state.settings.songsDisplayMode === TRACK_DISPLAY_MODE.ALBUM
        ? await buildAlbumGroupEntries(songs, { source: BROWSE_MODE.SONGS, contextId: BROWSE_MODE.SONGS })
        : songs;
}

async function fetchArtistSongs() {
    const artists = await ensureArtistOptions();
    const selectedName = String(state.settings.selectedArtistName || "").toLocaleLowerCase();
    const selectedArtist =
        artists.find((artist) => artist.id === state.settings.selectedArtistId) ||
        (selectedName ? artists.find((artist) => artist.title.toLocaleLowerCase() === selectedName) : null) ||
        artists.find((artist) => artist.title && artist.title !== "Unknown Artist") ||
        artists[0];
    if (!selectedArtist) {
        return [];
    }
    state.settings.selectedArtistId = selectedArtist.id;
    state.settings.selectedArtistName = selectedArtist.title || selectedArtist.value || "";
    saveSettings();

    const normalize = (track, index, overrides = {}) =>
        normalizeTrack(track, {
            source: BROWSE_MODE.ARTIST,
            contextId: selectedArtist.value,
            artistContext: selectedArtist.value,
            key: `song:artist:${selectedArtist.id}:${track.id || index}`,
            index,
            ...overrides,
        });

    if (state.settings.artistDisplayMode === TRACK_DISPLAY_MODE.SONG) {
        try {
            const payload = await fetchJson("/rest/getTopSongs.view", {
                artist: selectedArtist.value,
                count: state.settings.albumLimit > 0 ? Math.max(state.settings.albumLimit, 50) : LARGE_BATCH_SIZE,
            });
            const topSongs = ensureArray(payload.topSongs?.song);
            if (topSongs.length) {
                return topSongs.map(normalize);
            }
        } catch (error) {
            // Fall through to album-based fallback.
        }
    }

    // Fetch artist albums and flatten their tracks. Grouped mode needs this
    // path because getTopSongs often omits reliable album metadata.
    const artistPayload = await fetchJson("/rest/getArtist.view", { id: selectedArtist.id });
    const albums = ensureArray(artistPayload.artist?.album);
    if (!albums.length) {
        return [];
    }
    const albumPayloads = await Promise.all(
        albums.map((album) =>
            fetchJson("/rest/getAlbum.view", { id: album.id }).catch(() => null)
        )
    );
    const songs = [];
    for (const ap of albumPayloads) {
        const album = ap?.album;
        if (!album) continue;
        for (const track of ensureArray(album.song)) {
            songs.push(normalize(track, songs.length, {
                albumId: album.id,
                albumTitle: album.title || album.name,
                artist: pickText(track.artist, album.artist, selectedArtist.value),
                albumArtist: pickText(album.artist, selectedArtist.value),
                year: album.year,
                coverArt: album.coverArt,
            }));
        }
    }
    return state.settings.artistDisplayMode === TRACK_DISPLAY_MODE.ALBUM
        ? await buildAlbumGroupEntries(songs, { source: BROWSE_MODE.ARTIST, contextId: selectedArtist.value })
        : songs;
}

async function fetchComposerSongs() {
    const composers = await ensureComposerOptions();
    const selectedComposer =
        composers.find((composer) => composer.value === state.settings.selectedComposer) || composers[0];
    if (!selectedComposer) {
        return [];
    }
    state.settings.selectedComposer = selectedComposer.value;
    saveSettings();

    if (!state.composerSongCache.length) {
        state.composerSongCache = await fetchLibrarySongTracks({
            source: BROWSE_MODE.COMPOSER,
            contextId: selectedComposer.value,
            keyPrefix: "composer-source",
            maxItems: LARGE_BATCH_SIZE,
        });
    }
    const selectedKey = selectedComposer.value.toLocaleLowerCase();
    const songs = state.composerSongCache
        .filter((track) =>
            String(track?.composer || "")
                .split(/[;,]/)
                .map((name) => name.trim().toLocaleLowerCase())
                .includes(selectedKey)
        )
        .map((track, index) => ({
            ...track,
            source: BROWSE_MODE.COMPOSER,
            contextId: selectedComposer.value,
            key: `song:composer:${selectedKey}:${track.id || index}`,
            index,
        }));

    return state.settings.artistDisplayMode === TRACK_DISPLAY_MODE.ALBUM
        ? await buildAlbumGroupEntries(songs, { source: BROWSE_MODE.COMPOSER, contextId: selectedComposer.value })
        : songs;
}

async function fetchPlaylistSongs() {
    const playlists = await ensurePlaylistOptions();
    const selectedPlaylist =
        playlists.find((playlist) => playlist.id === state.settings.selectedPlaylistId) || playlists[0];
    if (!selectedPlaylist) {
        return [];
    }
    state.settings.selectedPlaylistId = selectedPlaylist.id;
    saveSettings();
    const payload = await fetchJson("/rest/getPlaylist.view", { id: selectedPlaylist.id });
    const songs = ensureArray(payload.playlist?.entry).map((track, index) =>
        normalizeTrack(track, {
            source: BROWSE_MODE.PLAYLIST,
            contextId: selectedPlaylist.id,
            playlistId: selectedPlaylist.id,
            playlistName: selectedPlaylist.title,
            key: `song:playlist:${selectedPlaylist.id}:${track.id || index}`,
            index,
        })
    );
    return state.settings.playlistDisplayMode === TRACK_DISPLAY_MODE.ALBUM
        ? await buildAlbumGroupEntries(songs, { source: BROWSE_MODE.PLAYLIST, contextId: selectedPlaylist.id })
        : songs;
}

async function fetchStarredSongs() {
    const payload = await fetchJson("/rest/getStarred2.view");
    return ensureArray(payload.starred2?.song).map((track, index) =>
        normalizeTrack(track, {
            source: BROWSE_MODE.STARRED,
            contextId: BROWSE_MODE.STARRED,
            key: `song:starred:${track.id || index}`,
            index,
        })
    );
}

async function fetchStarredAlbums() {
    const payload = await fetchJson("/rest/getStarred2.view");
    const albums = ensureArray(payload.starred2?.album).map(normalizeAlbum);
    if (albums.length) {
        return albums;
    }

    const songs = ensureArray(payload.starred2?.song).map((track, index) =>
        normalizeTrack(track, {
            source: BROWSE_MODE.ALBUM,
            contextId: "favourite",
            key: `song:album-favourite:${track.id || index}`,
            index,
        })
    );
    return await buildAlbumGroupEntries(songs, { source: BROWSE_MODE.ALBUM, contextId: "favourite" });
}

async function fetchRadioStations() {
    const payload = await fetchJson("/rest/getInternetRadioStations.view");
    const stations = ensureArray(payload.internetRadioStations?.internetRadioStation)
        .map(normalizeRadioStation)
        .filter((station) => station.streamUrl);
    state.savedRadioStations = stations;
    return stations;
}

async function ensureSavedRadioStations(force = false) {
    if (!force && state.savedRadioStations.length) {
        return state.savedRadioStations;
    }
    return fetchRadioStations();
}

function isRadioStationSaved(entry) {
    const streamUrl = normalizeIdentityText(entry?.streamUrl);
    return Boolean(streamUrl) && state.savedRadioStations.some(
        (station) => normalizeIdentityText(station.streamUrl) === streamUrl
    );
}

async function fetchCommunityRadioStations(query, streamUrl = "", { limit = 60, offset = 0 } = {}) {
    const params = new URLSearchParams({
        q: query,
        limit: String(limit),
        offset: String(offset),
    });
    if (streamUrl) {
        params.set("streamUrl", streamUrl);
    }
    const response = await fetch(`/api/radio/search?${params.toString()}`, {
        headers: { accept: "application/json" },
    });
    const payload = await response.json().catch(() => ({}));
    if (!response.ok) {
        throw new Error(payload.details || payload.error || "Community radio search failed");
    }
    return {
        stations: ensureArray(payload.stations).map(normalizeRadioStation).filter((station) => station.streamUrl),
        hasMore: Boolean(payload.hasMore),
        nextOffset: Number(payload.offset || offset) + ensureArray(payload.stations).length,
    };
}

async function resolveRadioCoverUrl(entry) {
    if (entry?.iconUrl) {
        return entry.iconUrl;
    }
    const key = normalizeIdentityText(entry?.streamUrl || entry?.title);
    if (!key) {
        return "";
    }
    if (radioCoverLookupPromises.has(key)) {
        return radioCoverLookupPromises.get(key);
    }

    const lookup = fetchCommunityRadioStations(entry.title, entry.streamUrl, { limit: 20 })
        .then(({ stations }) => {
            const streamUrl = normalizeIdentityText(entry.streamUrl);
            const title = normalizeIdentityText(entry.title);
            const match = stations.find((station) =>
                streamUrl && normalizeIdentityText(station.streamUrl) === streamUrl
            ) || stations.find((station) =>
                title && normalizeIdentityText(station.title) === title
            );
            if (match?.iconUrl) {
                entry.iconUrl = match.iconUrl;
                entry.favicon = match.favicon || entry.favicon;
                return match.iconUrl;
            }
            return "";
        })
        .catch(() => "")
        .finally(() => {
            radioCoverLookupPromises.delete(key);
        });
    radioCoverLookupPromises.set(key, lookup);
    return lookup;
}

async function addRadioStationToNavidrome(entry) {
    if (!entry?.streamUrl) {
        return;
    }
    await ensureSavedRadioStations(true);
    if (isRadioStationSaved(entry)) {
        flashStatus(`${entry.title} is already saved in Navidrome`, 2400);
        renderSearchPanel();
        return;
    }
    await fetchJson("/rest/createInternetRadioStation.view", {
        streamUrl: entry.streamUrl,
        name: entry.title,
        homepageUrl: entry.homePageUrl || "",
    });
    invalidateBrowseEntryCache(BROWSE_MODE.RADIO);
    await ensureSavedRadioStations(true);
    renderSearchPanel();
    flashStatus(`Added ${entry.title} to Navidrome`, 2400);
}

async function removeSavedRadioStation(entry) {
    const stationId = String(entry?.id || "");
    if (!stationId) {
        flashStatus("Could not identify this radio station.", 2200);
        return;
    }

    await fetchJson("/rest/deleteInternetRadioStation.view", { id: stationId });
    invalidateBrowseEntryCache(BROWSE_MODE.RADIO);
    radioCoverLookupPromises.delete(normalizeIdentityText(entry.streamUrl || entry.title));
    await ensureSavedRadioStations(true);

    state.activeSongMenuIndex = null;
    state.activeSongMenuMode = "actions";
    state.activeInfoMenuMode = "closed";
    state.activeInfoMenuSubject = null;

    if (state.drawerContext.key === entry.key || state.drawerContext.key === state.activeEntryKey) {
        setSongsDrawerOpen(false);
    }

    if (state.browseMode === BROWSE_MODE.RADIO) {
        await reloadBrowseEntries({ animate: false });
    } else {
        renderSongsDrawer();
        renderInfoActionMenu();
        renderBrowseMenus();
    }
    renderSearchPanel();
    flashStatus(`Removed ${entry.title || "radio station"}`, 2200);
}

async function fetchSearchEntries(query) {
    const trimmed = query.trim();
    if (!trimmed) {
        return [];
    }
    const payload = await fetchJson("/rest/search3.view", {
        query: trimmed,
        albumCount: 80,
        songCount: 120,
        artistCount: 0,
    });
    const albums = ensureArray(payload.searchResult3?.album).map(normalizeAlbum);
    const songs = ensureArray(payload.searchResult3?.song).map((track, index) =>
        normalizeTrack(track, {
            source: BROWSE_MODE.SEARCH,
            contextId: trimmed,
            key: `song:search:${trimmed}:${track.id || index}`,
            index,
        })
    );
    const seen = new Set();
    return sortBrowseEntriesAtoZ([...albums, ...songs]).filter((entry) => {
        if (!entry?.key || seen.has(entry.key)) {
            return false;
        }
        seen.add(entry.key);
        return true;
    });
}

async function fetchBrowseEntriesForMode(mode) {
    switch (mode) {
        case BROWSE_MODE.SONGS:
            return fetchSongs();
        case BROWSE_MODE.ARTIST:
            return fetchArtistSongs();
        case BROWSE_MODE.COMPOSER:
            return fetchComposerSongs();
        case BROWSE_MODE.PLAYLIST:
            return fetchPlaylistSongs();
        case BROWSE_MODE.YEAR:
            if (!state.settings.selectedYear) {
                state.settings.selectedYear = buildYearOptions()[0] || "";
                saveSettings();
            }
            return fetchAlbumShelf("byYear", {
                fromYear: state.settings.selectedYear,
                toYear: state.settings.selectedYear,
            });
        case BROWSE_MODE.GENRE:
            if (!state.settings.selectedGenre) {
                await ensureGenreOptions();
            }
            return fetchAlbumShelf("byGenre", { genre: state.settings.selectedGenre });
        case BROWSE_MODE.RATING:
            return fetchAlbumShelf("highest");
        case BROWSE_MODE.STARRED:
            return fetchStarredSongs();
        case BROWSE_MODE.RADIO:
            return fetchRadioStations();
        case BROWSE_MODE.ALBUM:
        default:
            if (state.settings.albumBrowseScope === "favourite") {
                return fetchStarredAlbums();
            }
            return fetchAlbumShelf(normalizeAlbumShelf(state.settings.shelf));
    }
}

function browseCachePart(value) {
    return encodeURIComponent(String(value ?? ""));
}

function getBrowseEntryCacheKey(mode = state.browseMode) {
    const settings = state.settings;
    const limit = Number(settings.albumLimit || 0);
    switch (mode) {
        case BROWSE_MODE.ALBUM:
            return [
                mode,
                settings.albumBrowseScope === "favourite" ? "favourite" : "all",
                normalizeBrowseSort(settings.albumBrowseSort),
                normalizeAlbumShelf(settings.shelf),
                limit,
            ].map(browseCachePart).join("|");
        case BROWSE_MODE.SONGS:
            return [
                mode,
                settings.songsBrowseScope === "favourite" ? "favourite" : "all",
                normalizeTrackDisplayMode(settings.songsDisplayMode),
                normalizeBrowseSort(settings.songsBrowseSort),
                limit,
            ].map(browseCachePart).join("|");
        case BROWSE_MODE.ARTIST:
            return [
                mode,
                settings.selectedArtistId,
                settings.selectedArtistName,
                normalizeTrackDisplayMode(settings.artistDisplayMode),
                normalizeBrowseSort(settings.artistBrowseSort),
                limit,
            ].map(browseCachePart).join("|");
        case BROWSE_MODE.COMPOSER:
            return [
                mode,
                settings.selectedComposer,
                normalizeTrackDisplayMode(settings.artistDisplayMode),
                normalizeBrowseSort(settings.artistBrowseSort),
                limit,
            ].map(browseCachePart).join("|");
        case BROWSE_MODE.PLAYLIST:
            return [
                mode,
                settings.selectedPlaylistId,
                normalizeTrackDisplayMode(settings.playlistDisplayMode),
                normalizeBrowseSort(settings.playlistBrowseSort),
            ].map(browseCachePart).join("|");
        case BROWSE_MODE.YEAR:
            return [mode, settings.selectedYear, limit].map(browseCachePart).join("|");
        case BROWSE_MODE.GENRE:
            return [mode, settings.selectedGenre, limit].map(browseCachePart).join("|");
        case BROWSE_MODE.RATING:
        case BROWSE_MODE.STARRED:
        case BROWSE_MODE.RADIO:
            return [mode, limit].map(browseCachePart).join("|");
        default:
            return "";
    }
}

function getBrowseEntryCache(cacheKey = getBrowseEntryCacheKey()) {
    const key = cacheKey;
    return key ? browseEntryCache.get(key) || null : null;
}

function setBrowseEntryCache(cacheKey = activeBrowseEntryCacheKey) {
    const key = cacheKey;
    if (!key) {
        return;
    }
    const cacheValue = {
        entries: browseEntries.slice(),
        browseIndex: clamp(state.browseIndex, 0, Math.max(0, browseEntries.length - 1)),
        activeEntryKey: state.activeEntryKey || "",
        progressive: progressiveAlbumLoad
            ? {
                type: progressiveAlbumLoad.type,
                extraParams: { ...progressiveAlbumLoad.extraParams },
                nextOffset: progressiveAlbumLoad.nextOffset,
                maxItems: progressiveAlbumLoad.maxItems,
                done: progressiveAlbumLoad.done,
            }
            : null,
    };
    browseEntryCache.delete(key);
    browseEntryCache.set(key, cacheValue);
    markPersistentBrowseCacheFresh(key);
    persistBrowseEntryCache(key, cacheValue);
    while (browseEntryCache.size > MAX_BROWSE_ENTRY_CACHE_ITEMS) {
        browseEntryCache.delete(browseEntryCache.keys().next().value);
    }
}

function invalidateBrowseEntryCache(mode = "", { persistent = true } = {}) {
    if (!mode) {
        browseEntryCache.clear();
        activeBrowseEntryCacheKey = "";
        if (persistent) {
            blockPersistentBrowseCache();
            deletePersistentBrowseEntryCaches();
        }
        return;
    }
    const prefix = `${browseCachePart(mode)}|`;
    for (const key of [...browseEntryCache.keys()]) {
        if (key === mode || key.startsWith(prefix)) {
            browseEntryCache.delete(key);
        }
    }
    if (activeBrowseEntryCacheKey === mode || activeBrowseEntryCacheKey.startsWith(prefix)) {
        activeBrowseEntryCacheKey = "";
    }
    if (persistent) {
        blockPersistentBrowseCache(mode);
        deletePersistentBrowseEntryCaches(mode);
    }
}

function invalidateLibraryCaches({ persistent = true } = {}) {
    invalidateBrowseEntryCache("", { persistent });
    textureLoadPromises.clear();
    radioCoverLookupPromises.clear();
    playlistMembershipCache.clear();
    state.detailsCache.clear();
    state.artistOptions = [];
    state.composerOptions = [];
    state.composerSongCache = [];
    state.playlistOptions = [];
    state.genreOptions = [];
}

async function ensureAlbumDetails(albumId) {
    const key = `album:${albumId}`;
    if (state.detailsCache.has(key)) {
        return state.detailsCache.get(key);
    }
    const payload = await fetchJson("/rest/getAlbum.view", { id: albumId });
    const album = normalizeAlbum(payload.album || {});
    album.tracks = ensureArray(payload.album?.song).map((track, index) =>
        normalizeTrack(track, {
            source: "album",
            contextId: album.id,
            albumId: album.id,
            albumTitle: album.title,
            artist: album.artist,
            coverArt: album.coverArt || album.id,
            year: album.year,
            key: `song:album:${album.id}:${track.id || index}`,
            index,
        })
    );
    state.detailsCache.set(key, album);
    return album;
}

async function ensurePlaylistDetails(playlistId) {
    const key = `playlist:${playlistId}`;
    if (state.detailsCache.has(key)) {
        return state.detailsCache.get(key);
    }
    const playlistLabel =
        state.playlistOptions.find((playlist) => playlist.id === playlistId)?.title || "Playlist";
    const payload = await fetchJson("/rest/getPlaylist.view", { id: playlistId });
    const playlist = {
        id: String(payload.playlist?.id || playlistId),
        title: pickText(payload.playlist?.name, playlistLabel),
        tracks: ensureArray(payload.playlist?.entry).map((track, index) =>
            normalizeTrack(track, {
                source: BROWSE_MODE.PLAYLIST,
                contextId: String(playlistId),
                playlistId: String(playlistId),
                playlistName: pickText(payload.playlist?.name, playlistLabel),
                key: `song:playlist:${playlistId}:${track.id || index}`,
                index,
            })
        ),
    };
    const playlistOption = state.playlistOptions.find((option) => option.id === playlist.id);
    if (playlistOption) {
        playlistOption.title = playlist.title;
        playlistOption.songCount = playlist.tracks.length;
        playlistOption.subtitle = formatSongCount(playlist.tracks.length);
    }
    state.detailsCache.set(key, playlist);
    return playlist;
}

async function ensureArtistTopSongs(artistName) {
    const key = `artist:${artistName}`;
    if (state.detailsCache.has(key)) {
        return state.detailsCache.get(key);
    }
    const payload = await fetchJson("/rest/getTopSongs.view", {
        artist: artistName,
        count: state.settings.albumLimit > 0 ? Math.max(state.settings.albumLimit, 50) : LARGE_BATCH_SIZE,
    });
    const tracks = ensureArray(payload.topSongs?.song).map((track, index) =>
        normalizeTrack(track, {
            source: BROWSE_MODE.ARTIST,
            contextId: artistName,
            artistContext: artistName,
            key: `song:artist:${artistName}:${track.id || index}`,
            index,
        })
    );
    const result = { title: artistName, tracks };
    state.detailsCache.set(key, result);
    return result;
}

async function getDrawerContextForEntry(entry) {
    if (!entry) {
        return { key: "", title: "Songs", subtitle: "", items: [] };
    }

    if (Array.isArray(entry.groupTracks)) {
        const items = sortDrawerItemsByTrackNumber(
            entry.groupTracks.map((track, index) => ({
                track,
                index: track.playlistIndex >= 0 ? track.playlistIndex : index,
            }))
        );
        return {
            key: entry.key,
            title: entry.title,
            subtitle: entry.subtitle || entry.artist,
            playlistId: entry.source === BROWSE_MODE.PLAYLIST ? String(entry.contextId || "") : "",
            playlistName: "",
            albumId: entry.id,
            items,
        };
    }

    if (Array.isArray(entry.groupAlbumIds) && entry.groupAlbumIds.length) {
        const albums = await Promise.all(
            entry.groupAlbumIds.map((albumId) => ensureAlbumDetails(albumId).catch(() => null))
        );
        const tracks = albums
            .filter(Boolean)
            .flatMap((album) => album.tracks || []);
        return {
            key: entry.key,
            title: entry.title,
            subtitle: entry.subtitle || entry.artist,
            albumId: entry.groupAlbumIds[0] || entry.id,
            albumStarred: Boolean(entry.starred),
            items: sortDrawerItemsByTrackNumber(tracks.map((track, index) => ({ track, index }))),
        };
    }

    if (entry.kind === "album") {
        const album = await ensureAlbumDetails(entry.id);
        return {
            key: entry.key,
            title: album.title,
            subtitle: album.artist,
            albumId: album.id,
            albumStarred: Boolean(album.starred),
            items: sortDrawerItemsByTrackNumber(album.tracks.map((track, index) => ({ track, index }))),
        };
    }

    if (entry.source === BROWSE_MODE.PLAYLIST && entry.playlistId) {
        const playlist = await ensurePlaylistDetails(entry.playlistId);
        return {
            key: entry.key,
            title: playlist.title,
            subtitle: `${playlist.tracks.length} ${playlist.tracks.length === 1 ? "song" : "songs"}`,
            playlistId: playlist.id,
            playlistName: playlist.title,
            items: sortDrawerItemsAtoZ(
                playlist.tracks.map((track, index) => ({ track, index }))
            ),
        };
    }

    if (entry.source === BROWSE_MODE.ARTIST && entry.kind === "song") {
        return {
            key: entry.key,
            title: entry.title,
            subtitle: entry.subtitle,
            items: [{ track: entry, index: 0 }],
        };
    }

    if (entry.source === BROWSE_MODE.SONGS && entry.kind === "song") {
        return {
            key: entry.key,
            title: entry.title,
            subtitle: entry.subtitle,
            items: [{ track: entry, index: 0 }],
        };
    }

    if (entry.drawerAlbumId || entry.albumId) {
        const album = await ensureAlbumDetails(entry.drawerAlbumId || entry.albumId);
        return {
            key: entry.key,
            title: album.title,
            subtitle: album.artist,
            albumId: album.id,
            albumStarred: Boolean(album.starred),
            items: sortDrawerItemsByTrackNumber(album.tracks.map((track, index) => ({ track, index }))),
        };
    }

    return {
        key: entry.key,
        title: entry.title,
        subtitle: entry.subtitle,
        items: [{ track: entry, index: 0 }],
    };
}

async function ensureDrawerContext() {
    const entry = getCurrentBrowseEntry();
    const entryKey = entry?.key || "";

    if (!entry) {
        state.drawerContext = { key: "", title: "Songs", subtitle: "", items: [], loading: false, albumId: "", albumStarred: false };
        renderSongsDrawer();
        return state.drawerContext;
    }

    if (!state.drawerOpen && state.drawerContext.key === entryKey && !state.drawerContext.loading) {
        return state.drawerContext;
    }

    const requestId = ++drawerLoadId;
    state.drawerContext = {
        key: entryKey,
        title: entry.title,
        subtitle: entry.subtitle,
        items: [],
        loading: true,
        albumId: "",
        albumStarred: false,
    };
    renderSongsDrawer();

    const context = await getDrawerContextForEntry(entry);
    if (requestId !== drawerLoadId) {
        return state.drawerContext;
    }

    state.drawerContext = {
        ...context,
        key: entryKey,
        loading: false,
    };
    renderSongsDrawer();
    return state.drawerContext;
}

async function connect({ onAuthenticated } = {}) {
    state.settings.serverUrl = normalizeServerUrl(state.settings.serverUrl);
    saveSettings();
    const nextCacheScope = getLibraryCacheScope();
    if (activeLibraryCacheScope && activeLibraryCacheScope !== nextCacheScope) {
        invalidateLibraryCaches({ persistent: false });
        coverTextureCache.clear();
    }
    state.connected = false;
    showStatus("Connecting to Navidrome...");
    await fetchJson("/rest/ping.view");
    state.connected = true;
    activeLibraryCacheScope = nextCacheScope;
    onAuthenticated?.();
    // The all-songs shelf is intentionally a full-library view, so restoring
    // it immediately on connect makes startup feel much slower. Artist and
    // Composer are scoped selections and should persist normally.
    if (state.browseMode === BROWSE_MODE.SONGS) {
        state.browseMode = BROWSE_MODE.ALBUM;
    }
    hideStatus();
    renderBrowseMenus();
    await reloadBrowseEntries({ animate: false });
    warmMenus();
    flashStatus(`Connected to ${state.settings.serverUrl}`);
}

async function warmMenus() {
    await Promise.allSettled([
        ensureArtistOptions(),
        ensureComposerOptions(),
        ensurePlaylistOptions(),
        ensureGenreOptions(),
    ]);
    renderBrowseMenus();
}

function appendBrowseEntries(nextEntries) {
    if (!nextEntries.length) {
        return 0;
    }

    if (nextEntries.some((entry) => entry?.kind === "album" && !Array.isArray(entry.groupTracks))) {
        const activeKey = state.activeEntryKey || browseEntries[state.browseIndex]?.key || "";
        const existingTextures = collectTextureLookup(browseEntries, textures);
        const previousLength = browseEntries.length;
        browseEntries = groupAlbumEntriesByTitle(browseEntries.concat(nextEntries));
        textures = buildTexturesForEntries(browseEntries, existingTextures);
        const nextIndex = activeKey ? browseEntries.findIndex((entry) => entry.key === activeKey) : -1;
        if (nextIndex >= 0) {
            state.browseIndex = nextIndex;
            state.activeEntryKey = browseEntries[nextIndex]?.key || null;
        }
        setAlbumData(browseEntries.map((_, index) => textures[index] || getDefaultTexture()));
        if (nextIndex >= 0) {
            jumpTo(nextIndex);
        }
        updateBrowseStripUI();
        ensureTextures();
        return Math.max(0, browseEntries.length - previousLength);
    }

    const existingKeys = new Set(browseEntries.map((entry) => entry.key));
    const uniqueEntries = nextEntries.filter((entry) => {
        if (!entry?.key || existingKeys.has(entry.key)) {
            return false;
        }
        existingKeys.add(entry.key);
        return true;
    });

    if (!uniqueEntries.length) {
        return 0;
    }

    const activeKey = state.activeEntryKey || browseEntries[state.browseIndex]?.key || "";
    const existingTextures = collectTextureLookup(browseEntries, textures);
    browseEntries = sortBrowseEntriesForCurrentMode(browseEntries.concat(uniqueEntries));
    textures = buildTexturesForEntries(browseEntries, existingTextures);
    const nextIndex = activeKey ? browseEntries.findIndex((entry) => entry.key === activeKey) : -1;
    if (nextIndex >= 0) {
        state.browseIndex = nextIndex;
        state.activeEntryKey = browseEntries[nextIndex]?.key || null;
    }
    setAlbumData(browseEntries.map((_, index) => textures[index] || getDefaultTexture()));
    if (nextIndex >= 0) {
        jumpTo(nextIndex);
    }
    updateBrowseStripUI();
    ensureTextures();
    return uniqueEntries.length;
}

function beginProgressiveAlbumLoad(requestId, shelfRequest, initialCount, cacheKey) {
    const maxItems = state.settings.albumLimit > 0 ? state.settings.albumLimit : Number.POSITIVE_INFINITY;
    progressiveAlbumLoad = {
        requestId,
        cacheKey,
        type: shelfRequest.type,
        extraParams: shelfRequest.extraParams || {},
        nextOffset: initialCount,
        maxItems,
        done:
            shelfRequest.type === "random" ||
            initialCount < ALBUM_PAGE_SIZE ||
            (Number.isFinite(maxItems) && initialCount >= maxItems),
    };

    if (!progressiveAlbumLoad.done) {
        void continueProgressiveAlbumLoad(progressiveAlbumLoad);
    }
}

function resumeProgressiveAlbumLoad(requestId, cachedProgressive) {
    if (!cachedProgressive || cachedProgressive.done) {
        return;
    }
    progressiveAlbumLoad = {
        requestId,
        cacheKey: activeBrowseEntryCacheKey,
        type: cachedProgressive.type,
        extraParams: { ...cachedProgressive.extraParams },
        nextOffset: cachedProgressive.nextOffset,
        maxItems: cachedProgressive.maxItems,
        done: false,
    };
    void continueProgressiveAlbumLoad(progressiveAlbumLoad);
}

async function continueProgressiveAlbumLoad(loadState) {
    while (progressiveAlbumLoad === loadState && !loadState.done) {
        const remaining = Number.isFinite(loadState.maxItems)
            ? Math.max(0, loadState.maxItems - loadState.nextOffset)
            : ALBUM_PAGE_SIZE;
        const pageSize = Number.isFinite(loadState.maxItems)
            ? Math.min(ALBUM_PAGE_SIZE, remaining)
            : ALBUM_PAGE_SIZE;

        if (pageSize <= 0) {
            loadState.done = true;
            break;
        }

        let batch = [];
        try {
            batch = await fetchAlbumShelfPage(
                loadState.type,
                loadState.nextOffset,
                pageSize,
                loadState.extraParams
            );
        } catch (error) {
            if (progressiveAlbumLoad === loadState) {
                console.error(error);
            }
            loadState.done = true;
            break;
        }

        if (progressiveAlbumLoad !== loadState || loadState.requestId !== browseLoadId) {
            return;
        }

        loadState.nextOffset += pageSize;
        appendBrowseEntries(batch);

        if (batch.length < pageSize || loadState.type === "random") {
            loadState.done = true;
            setBrowseEntryCache(loadState.cacheKey);
            break;
        }
        setBrowseEntryCache(loadState.cacheKey);

        await new Promise((resolve) => window.setTimeout(resolve, ALBUM_APPEND_YIELD_MS));
    }
}

async function reloadBrowseEntries({ preferredKey = null, animate = false } = {}) {
    if (!state.connected) {
        return;
    }

    const requestId = ++browseLoadId;
    progressiveAlbumLoad = null;
    let nextBrowseMode = state.browseMode;
    const nextBrowseCacheKey = getBrowseEntryCacheKey(nextBrowseMode);
    let cachedBrowse = getBrowseEntryCache(nextBrowseCacheKey);
    if (!cachedBrowse) {
        cachedBrowse = await getPersistentBrowseEntryCache(nextBrowseCacheKey);
        if (cachedBrowse) {
            browseEntryCache.delete(nextBrowseCacheKey);
            browseEntryCache.set(nextBrowseCacheKey, cachedBrowse);
        }
    }
    if (cachedBrowse) {
        activeBrowseEntryCacheKey = nextBrowseCacheKey;
        browseEntries = cachedBrowse.entries.slice();
        textures = buildTexturesForEntries(browseEntries);

        const currentTrackKey = keyForTrackInCurrentMode(state.currentTrack);
        const fallbackKey =
            preferredKey ||
            currentTrackKey ||
            state.activeEntryKey ||
            cachedBrowse.activeEntryKey ||
            browseEntries[cachedBrowse.browseIndex]?.key ||
            browseEntries[0]?.key ||
            null;

        let nextIndex = fallbackKey ? browseEntries.findIndex((entry) => entry.key === fallbackKey) : -1;
        if (nextIndex < 0 && browseEntries.length > 0) {
            nextIndex = clamp(cachedBrowse.browseIndex, 0, browseEntries.length - 1);
        }
        if (nextIndex < 0) {
            nextIndex = 0;
        }

        state.browseIndex = browseEntries.length ? nextIndex : 0;
        state.activeEntryKey = browseEntries[state.browseIndex]?.key || null;
        setAlbumData(browseEntries.map((_, index) => textures[index] || getDefaultTexture()));
        ensureTextures();

        if (browseEntries.length === 0) {
            jumpTo(0);
            state.drawerContext = { key: "", title: "Songs", subtitle: "", items: [], loading: false, albumId: "", albumStarred: false };
        } else if (animate) {
            navigateTo(state.browseIndex);
        } else {
            jumpTo(state.browseIndex);
        }

        hideStatus();
        updateUI();
        positionInfoPanel();
        resumeProgressiveAlbumLoad(requestId, cachedBrowse.progressive);
        return;
    }

    const previousTextures = collectTextureLookup(browseEntries, textures);

    showStatus("Loading library...");

    try {
        let progressiveShelfRequest = await getAlbumShelfRequestForMode(nextBrowseMode);
        let entries = progressiveShelfRequest
            ? await fetchAlbumShelfPage(progressiveShelfRequest.type, 0, ALBUM_PAGE_SIZE, progressiveShelfRequest.extraParams)
            : await fetchBrowseEntriesForMode(nextBrowseMode);
        let fetchedEntryCount = entries.length;

        if (!entries.length && nextBrowseMode !== BROWSE_MODE.ALBUM && shouldFallbackFromEmptyMode(nextBrowseMode)) {
            const fallbackShelfRequest = await getAlbumShelfRequestForMode(BROWSE_MODE.ALBUM);
            const albumEntries = fallbackShelfRequest
                ? await fetchAlbumShelfPage(fallbackShelfRequest.type, 0, ALBUM_PAGE_SIZE, fallbackShelfRequest.extraParams)
                : await fetchBrowseEntriesForMode(BROWSE_MODE.ALBUM);
            if (albumEntries.length) {
                nextBrowseMode = BROWSE_MODE.ALBUM;
                entries = albumEntries;
                fetchedEntryCount = albumEntries.length;
                progressiveShelfRequest = fallbackShelfRequest;
                state.browseMode = BROWSE_MODE.ALBUM;
                saveSettings();
                renderBrowseMenus();
                flashStatus("Loaded albums instead of an empty saved view.", 2200);
            }
        }

        if (requestId !== browseLoadId) {
            return;
        }

        const resolvedBrowseCacheKey = getBrowseEntryCacheKey(nextBrowseMode);
        browseEntries = sortBrowseEntriesForCurrentMode(groupRawAlbumEntriesIfNeeded(entries));
        textures = buildTexturesForEntries(browseEntries, previousTextures);

        const currentTrackKey = keyForTrackInCurrentMode(state.currentTrack);
        const fallbackKey =
            preferredKey ||
            currentTrackKey ||
            state.activeEntryKey ||
            browseEntries[0]?.key ||
            null;

        let nextIndex = fallbackKey ? browseEntries.findIndex((entry) => entry.key === fallbackKey) : -1;
        if (nextIndex < 0 && browseEntries.length > 0) {
            nextIndex = clamp(state.browseIndex, 0, browseEntries.length - 1);
        }
        if (nextIndex < 0) {
            nextIndex = 0;
        }

        state.browseIndex = browseEntries.length ? nextIndex : 0;
        state.activeEntryKey = browseEntries[state.browseIndex]?.key || null;
        setAlbumData(browseEntries.map((_, index) => textures[index] || getDefaultTexture()));
        ensureTextures();

        if (browseEntries.length === 0) {
            jumpTo(0);
            state.drawerContext = { key: "", title: "Songs", subtitle: "", items: [], loading: false, albumId: "", albumStarred: false };
        } else if (animate) {
            navigateTo(state.browseIndex);
        } else {
            jumpTo(state.browseIndex);
        }

        hideStatus();
        updateUI();
        positionInfoPanel();
        if (progressiveShelfRequest && browseEntries.length && requestId === browseLoadId) {
            beginProgressiveAlbumLoad(requestId, progressiveShelfRequest, fetchedEntryCount, resolvedBrowseCacheKey);
        }
        activeBrowseEntryCacheKey = resolvedBrowseCacheKey;
        setBrowseEntryCache(resolvedBrowseCacheKey);
    } catch (error) {
        if (requestId !== browseLoadId) {
            return;
        }
        console.error(error);
        hideStatus();
        flashStatus(error.message || "Could not load library.", 2600);
        if (!browseEntries.length) {
            state.activeEntryKey = null;
            state.drawerContext = { key: "", title: "Songs", subtitle: "", items: [], loading: false, albumId: "", albumStarred: false };
            renderSongsDrawer();
            updateUI();
        }
    }
}

function getCurrentBrowseEntry() {
    return browseEntries[state.browseIndex] || null;
}

function entryMatchesCurrentTrackInCurrentMode(entry = getCurrentBrowseEntry()) {
    const currentTrackKey = keyForTrackInCurrentMode(state.currentTrack);
    return Boolean(
        state.currentTrack &&
        entry?.key &&
        currentTrackKey &&
        entry.key === currentTrackKey
    );
}

function getEmptyBrowseLines() {
    switch (state.browseMode) {
        case BROWSE_MODE.YEAR:
            return {
                title: state.settings.selectedYear
                    ? `No albums for ${state.settings.selectedYear}`
                    : "No albums for this year",
                subtitle: "Choose another year",
            };
        case BROWSE_MODE.GENRE:
            return {
                title: state.settings.selectedGenre
                    ? `No albums in ${state.settings.selectedGenre}`
                    : "No albums in this genre",
                subtitle: "Choose another genre",
            };
        case BROWSE_MODE.PLAYLIST:
            return {
                title: "No songs in this playlist",
                subtitle: "Choose another playlist",
            };
        case BROWSE_MODE.RATING:
            return {
                title: "No top rated albums",
                subtitle: "Rate albums in Navidrome",
            };
        case BROWSE_MODE.STARRED:
            return {
                title: "No favourites",
                subtitle: "Star songs or albums in Navidrome",
            };
        case BROWSE_MODE.RADIO:
            return {
                title: "No radio stations",
                subtitle: "Add stations in Navidrome",
            };
        case BROWSE_MODE.SEARCH:
            return {
                title: "No search results",
                subtitle: "Try another search",
            };
        default:
            return {
                title: "Nothing loaded",
                subtitle: "\u00A0",
            };
    }
}

function formatInfoPanelSubtitle(...parts) {
    const seen = new Set();
    const cleanParts = parts
        .map((part) => pickText(part))
        .filter(Boolean)
        .filter((part) => {
            const key = part.toLocaleLowerCase();
            if (seen.has(key)) {
                return false;
            }
            seen.add(key);
            return true;
        });
    return cleanParts.length ? cleanParts.join(" | ") : "\u00A0";
}

function getInfoPanelLines() {
    const activeEntry = getCurrentBrowseEntry();
    const songTitle = pickText(state.currentTrack?.title, playbackState.title);
    const albumName = pickText(state.currentTrack?.album, playbackState.album);
    const trackYear = pickText(state.currentTrack?.year, activeEntry?.year);
    const isCenteredOnCurrentTrack = entryMatchesCurrentTrackInCurrentMode(activeEntry);
    const shouldShowNowPlaying = Boolean(songTitle || albumName) && (!activeEntry || isCenteredOnCurrentTrack);

    if (shouldShowNowPlaying) {
        return {
            title: songTitle || activeEntry?.title || "Nothing loaded",
            subtitle: formatInfoPanelSubtitle(albumName, trackYear),
        };
    }

    if (activeEntry?.kind === "song") {
        return {
            title: activeEntry.title || "Nothing loaded",
            subtitle: formatInfoPanelSubtitle(activeEntry.album, activeEntry.year),
        };
    }

    if (activeEntry) {
        return {
            title: activeEntry.title || "Nothing loaded",
            subtitle: activeEntry.kind === "album"
                ? formatInfoPanelSubtitle(activeEntry.artist, activeEntry.year)
                : formatInfoPanelSubtitle(activeEntry.subtitle, activeEntry.year),
        };
    }

    return {
        ...getEmptyBrowseLines(),
    };
}

function getInfoActionSubject() {
    const entry = getCurrentBrowseEntry();
    if (entry?.kind === "radio") {
        return { type: "song", track: entry };
    }
    if (state.currentTrack?.id && playbackState.playing && entry && entryMatchesCurrentTrackInCurrentMode(entry)) {
        return { type: "song", track: state.currentTrack };
    }
    if (entry?.kind === "album" && (entry.id || entry.albumId || entry.groupAlbumIds?.length)) {
        return { type: "album", entry };
    }
    if (entry?.kind === "song" && entry.id) {
        return { type: "song", track: entry };
    }
    if (state.currentTrack?.id) {
        return { type: "song", track: state.currentTrack };
    }
    return null;
}

function getInfoPlaylistRemovalContext(subject) {
    if (subject?.type !== "song" || !subject.track?.id) {
        return null;
    }

    const track = subject.track;
    const trackPlaylistId = String(track.playlistId || "");
    const trackPlaylistIndex = Number(track.playlistIndex);
    if (trackPlaylistId && Number.isInteger(trackPlaylistIndex) && trackPlaylistIndex >= 0) {
        return { playlistId: trackPlaylistId, index: trackPlaylistIndex };
    }

    const drawerPlaylistId = String(state.drawerContext.playlistId || "");
    if (drawerPlaylistId) {
        const drawerItem = state.drawerContext.items.find((item) => item.track?.id === track.id);
        if (drawerItem && Number.isInteger(Number(drawerItem.index))) {
            return { playlistId: drawerPlaylistId, index: Number(drawerItem.index) };
        }
    }

    if (state.browseMode === BROWSE_MODE.PLAYLIST && state.settings.selectedPlaylistId) {
        const playlistEntry = browseEntries.find((entry) => entry?.id === track.id);
        const playlistIndex = Number(playlistEntry?.playlistIndex);
        if (Number.isInteger(playlistIndex) && playlistIndex >= 0) {
            return { playlistId: String(state.settings.selectedPlaylistId), index: playlistIndex };
        }
    }

    return null;
}

function renderActionButton({
    action,
    actionAttr,
    label,
    rowIndex = null,
    playlistId = "",
    playlistIndex = null,
    className = "",
}) {
    const rowIndexAttr = Number.isInteger(rowIndex) ? ` data-index="${rowIndex}"` : "";
    const playlistIdAttr = playlistId ? ` data-playlist-id="${escapeHtml(playlistId)}"` : "";
    const playlistIndexAttr = playlistIndex != null
        ? ` data-playlist-index="${escapeHtml(String(playlistIndex))}"`
        : "";
    const classAttr = className ? ` class="${escapeHtml(className)}"` : "";
    return `<button${classAttr} ${actionAttr}="${escapeHtml(action)}"${rowIndexAttr}${playlistIdAttr}${playlistIndexAttr}>${escapeHtml(label)}</button>`;
}

function getSubjectFavouriteLabel(subject) {
    if (subject?.type === "album") {
        return subject.entry?.starred ? "Remove Favourite" : "Favourite";
    }
    return subject?.track?.starred ? "Remove Favourite" : "Favourite";
}

function getSubjectPlaylistMemberships(subject, playlistPickerOpen) {
    if (!playlistPickerOpen || subject?.type !== "song") {
        return new Map();
    }
    return playlistMembershipCache.get(getTrackPlaylistMembershipCacheKey(subject.track)) || new Map();
}

function renderPlaylistTargetActionButtons(subject, options) {
    const memberships = getSubjectPlaylistMemberships(subject, options.playlistPickerOpen);
    return state.playlistOptions
        .map((playlist) => {
            const membership = memberships.get(String(playlist.id || ""));
            const playlistCount = formatSongCount(playlist.songCount);
            return renderActionButton({
                action: membership ? "remove-from-playlist-target" : "select-playlist-target",
                actionAttr: options.actionAttr,
                label: membership ? `Remove from ${playlist.title} (${playlistCount})` : `${playlist.title} (${playlistCount})`,
                rowIndex: options.rowIndex,
                playlistId: playlist.id,
                playlistIndex: membership?.index ?? -1,
            });
        })
        .join("");
}

function renderSharedActionMenuContent(subject, options) {
    const playlistPickerOpen = options.mode === "playlist-picker";
    const rowIndex = options.rowIndex;
    const isRadio = subject?.type === "song" && subject.track?.kind === "radio";
    if (playlistPickerOpen) {
        return `
            ${renderActionButton({ action: options.backAction, actionAttr: options.actionAttr, label: "Back", rowIndex })}
            ${renderActionButton({
                action: "create-playlist",
                actionAttr: options.actionAttr,
                label: "New Playlist",
                rowIndex,
                className: "song-menu-create",
            })}
            ${renderPlaylistTargetActionButtons(subject, { ...options, playlistPickerOpen }) || ""}
        `;
    }

    const isAlbum = subject?.type === "album";
    const canRemoveFromContext = Boolean(options.canRemoveFromContext);
    if (isRadio) {
        return `
            ${renderActionButton({
                action: "remove-radio-station",
                actionAttr: options.actionAttr,
                label: "Remove station",
                rowIndex,
            })}
            ${renderActionButton({
                action: "more-info",
                actionAttr: options.actionAttr,
                label: "More info",
                rowIndex,
            })}
        `;
    }
    return `
        ${renderActionButton({
            action: "add-to-playlist",
            actionAttr: options.actionAttr,
            label: isAlbum ? "Add album to playlist" : "Add to playlist",
            rowIndex,
        })}
        ${canRemoveFromContext
            ? renderActionButton({
                action: "remove-from-playlist",
                actionAttr: options.actionAttr,
                label: "Remove from playlist",
                rowIndex,
            })
            : ""}
        ${renderActionButton({
            action: "toggle-favourite",
            actionAttr: options.actionAttr,
            label: getSubjectFavouriteLabel(subject),
            rowIndex,
        })}
        ${renderActionButton({
            action: "more-info",
            actionAttr: options.actionAttr,
            label: "More info",
            rowIndex,
        })}
    `;
}

function renderInfoActionMenu() {
    const resolvedSubject = getInfoActionSubject();
    if (state.activeInfoMenuMode !== "closed" && !state.activeInfoMenuSubject) {
        state.activeInfoMenuSubject = resolvedSubject;
    }
    const subject = state.activeInfoMenuMode !== "closed"
        ? state.activeInfoMenuSubject || resolvedSubject
        : resolvedSubject;
    const hasSubject = Boolean(subject);
    const menuOpen = hasSubject && state.activeInfoMenuMode !== "closed";
    const playlistPickerOpen = menuOpen && state.activeInfoMenuMode === "playlist-picker";

    elements.infoPanel.classList.toggle("has-actions", hasSubject);
    elements.btnInfoMenu.classList.toggle("hidden", !hasSubject);
    elements.btnInfoMenu.classList.toggle("is-menu-open", menuOpen);
    elements.btnInfoMenu.setAttribute("aria-expanded", String(menuOpen));

    if (!hasSubject || state.activeInfoMenuMode === "closed") {
        if (state.activeInfoMenuMode === "closed") {
            state.activeInfoMenuSubject = null;
        }
        elements.infoContextMenu.classList.add("hidden");
        elements.infoContextMenu.classList.remove("is-playlist-picker");
        elements.infoContextMenu.innerHTML = "";
        return;
    }

    const playlistRemovalContext = getInfoPlaylistRemovalContext(subject);

    elements.infoContextMenu.classList.toggle("is-playlist-picker", playlistPickerOpen);
    elements.infoContextMenu.innerHTML = renderSharedActionMenuContent(subject, {
        mode: state.activeInfoMenuMode,
        actionAttr: "data-info-action",
        backAction: "back-info-menu",
        canRemoveFromContext: Boolean(playlistRemovalContext),
    });
    elements.infoContextMenu.classList.remove("hidden");
}

function isContextMenuTarget(target) {
    return Boolean(target.closest?.(".song-context-menu"));
}

function renderDropdownOptions(dropdown, entries, selectedValue, datasetAttr, emptyLabel) {
    if (!dropdown) {
        return;
    }

    if (!entries.length) {
        dropdown.innerHTML = `
            <button class="browse-dropdown-item" disabled>
                <span class="browse-dropdown-label">${escapeHtml(emptyLabel)}</span>
            </button>
        `;
        return;
    }

    dropdown.innerHTML = entries
        .map(
            (entry) => `
                <button class="browse-dropdown-item ${entry.value === selectedValue || entry.id === selectedValue ? "is-selected" : ""}" ${datasetAttr}="${escapeHtml(entry.value || entry.id)}">
                    <span class="browse-dropdown-label">${escapeHtml(entry.title)}</span>
                    <span class="browse-dropdown-meta">${escapeHtml(entry.subtitle || "\u00A0")}</span>
                </button>
            `
        )
        .join("");
}

function renderDropdownCheck(checked) {
    if (!checked) {
        return `<span class="browse-dropdown-check" aria-hidden="true"></span>`;
    }
    return `<span class="browse-dropdown-check is-checked" aria-hidden="true"><svg viewBox="0 0 16 16" width="14" height="14"><path fill="currentColor" d="M6.2 11.6 2.8 8.2l1.2-1.2 2.2 2.2 5.8-5.8 1.2 1.2z"/></svg></span>`;
}

function renderBrowseDropdownHeader(title) {
    return `
        <div class="browse-dropdown-header">
            <span class="browse-dropdown-title">${escapeHtml(title)}</span>
            <button class="browse-dropdown-close" type="button" data-close-browse-dropdown aria-label="Close ${escapeHtml(title)} menu" title="Close">
                <svg viewBox="0 0 24 24" aria-hidden="true">
                    <path fill="currentColor" d="M18.3 5.71 12 12l6.3 6.29-1.41 1.41L10.59 13.4 4.29 19.7 2.88 18.29 9.17 12 2.88 5.71 4.29 4.29l6.3 6.3 6.29-6.3z"/>
                </svg>
            </button>
        </div>
    `;
}

function finalizeBrowseDropdown(dropdown, title) {
    const scrollContent = document.createElement("div");
    scrollContent.className = "browse-dropdown-scroll";
    while (dropdown.firstChild) {
        scrollContent.appendChild(dropdown.firstChild);
    }
    dropdown.innerHTML = renderBrowseDropdownHeader(title);
    dropdown.appendChild(scrollContent);
}

function renderTrackDisplayModeOptions(mode, actionName) {
    return `
        <button class="browse-dropdown-item browse-dropdown-display-mode ${mode === TRACK_DISPLAY_MODE.ALBUM ? "is-selected" : ""}" data-display-action="${actionName}" data-display-mode="${TRACK_DISPLAY_MODE.ALBUM}">
            <span class="browse-dropdown-label-row">
                <span class="browse-dropdown-label">Group by album</span>
                ${renderDropdownCheck(mode === TRACK_DISPLAY_MODE.ALBUM)}
            </span>
            <span class="browse-dropdown-meta">One cover per album</span>
        </button>
        <button class="browse-dropdown-item browse-dropdown-display-mode ${mode === TRACK_DISPLAY_MODE.SONG ? "is-selected" : ""}" data-display-action="${actionName}" data-display-mode="${TRACK_DISPLAY_MODE.SONG}">
            <span class="browse-dropdown-label-row">
                <span class="browse-dropdown-label">All Songs</span>
                ${renderDropdownCheck(mode === TRACK_DISPLAY_MODE.SONG)}
            </span>
            <span class="browse-dropdown-meta">One cover per song</span>
        </button>
    `;
}

function renderSortOptions(sort, actionName) {
    const activeSort = normalizeBrowseSort(sort);
    return `
        <button class="browse-dropdown-item browse-dropdown-display-mode ${activeSort === "year-asc" ? "is-selected" : ""}" data-sort-action="${actionName}" data-sort-mode="year-asc">
            <span class="browse-dropdown-label-row">
                <span class="browse-dropdown-label">Year: Low to High</span>
                ${renderDropdownCheck(activeSort === "year-asc")}
            </span>
            <span class="browse-dropdown-meta">Oldest first</span>
        </button>
        <button class="browse-dropdown-item browse-dropdown-display-mode ${activeSort === "year-desc" ? "is-selected" : ""}" data-sort-action="${actionName}" data-sort-mode="year-desc">
            <span class="browse-dropdown-label-row">
                <span class="browse-dropdown-label">Year: High to Low</span>
                ${renderDropdownCheck(activeSort === "year-desc")}
            </span>
            <span class="browse-dropdown-meta">Newest first</span>
        </button>
        <button class="browse-dropdown-item browse-dropdown-display-mode ${activeSort === "title" ? "is-selected" : ""}" data-sort-action="${actionName}" data-sort-mode="title">
            <span class="browse-dropdown-label-row">
                <span class="browse-dropdown-label">Title (A-Z)</span>
                ${renderDropdownCheck(activeSort === "title")}
            </span>
            <span class="browse-dropdown-meta">Sort by name</span>
        </button>
    `;
}

function renderAlbumDropdown() {
    const allSelected = state.browseMode === BROWSE_MODE.ALBUM && state.settings.albumBrowseScope !== "favourite";
    const favouriteSelected = state.browseMode === BROWSE_MODE.ALBUM && state.settings.albumBrowseScope === "favourite";
    elements.albumDropdown.innerHTML = `
        <div class="browse-dropdown-section">
            <button class="browse-dropdown-item ${allSelected ? "is-selected" : ""}" data-album-scope="all">
                <span class="browse-dropdown-label-row">
                    <span class="browse-dropdown-label">All Albums</span>
                    ${renderDropdownCheck(allSelected)}
                </span>
                <span class="browse-dropdown-meta">Browse your full library</span>
            </button>
            <button class="browse-dropdown-item ${favouriteSelected ? "is-selected" : ""}" data-album-scope="favourite">
                <span class="browse-dropdown-label-row">
                    <span class="browse-dropdown-label">Favourite</span>
                    ${renderDropdownCheck(favouriteSelected)}
                </span>
                <span class="browse-dropdown-meta">Browse starred albums</span>
            </button>
        </div>
        <div class="browse-dropdown-section">
            ${renderSortOptions(state.settings.albumBrowseSort, "album-sort")}
        </div>
    `;
    finalizeBrowseDropdown(elements.albumDropdown, "Albums");
}

function renderSongsDropdown() {
    const allSelected = state.browseMode === BROWSE_MODE.SONGS &&
        state.settings.songsBrowseScope !== "favourite" &&
        state.settings.songsDisplayMode === TRACK_DISPLAY_MODE.SONG;
    const groupedSelected = state.browseMode === BROWSE_MODE.SONGS &&
        state.settings.songsDisplayMode === TRACK_DISPLAY_MODE.ALBUM;
    const favouriteSelected = state.browseMode === BROWSE_MODE.SONGS && state.settings.songsBrowseScope === "favourite";
    elements.songsDropdown.innerHTML = `
        <div class="browse-dropdown-section">
            <button class="browse-dropdown-item browse-dropdown-display-mode ${allSelected ? "is-selected" : ""}" data-songs-mode="all-songs">
                <span class="browse-dropdown-label-row">
                    <span class="browse-dropdown-label">All Songs</span>
                    ${renderDropdownCheck(allSelected)}
                </span>
                <span class="browse-dropdown-meta">One cover per song</span>
            </button>
            <button class="browse-dropdown-item browse-dropdown-display-mode ${groupedSelected ? "is-selected" : ""}" data-display-action="songs-display" data-display-mode="${TRACK_DISPLAY_MODE.ALBUM}">
                <span class="browse-dropdown-label-row">
                    <span class="browse-dropdown-label">Group by album</span>
                    ${renderDropdownCheck(groupedSelected)}
                </span>
                <span class="browse-dropdown-meta">One cover per album</span>
            </button>
        </div>
        <div class="browse-dropdown-section">
            <button class="browse-dropdown-item ${favouriteSelected ? "is-selected" : ""}" data-songs-scope="favourite">
                <span class="browse-dropdown-label-row">
                    <span class="browse-dropdown-label">Favourite</span>
                    ${renderDropdownCheck(favouriteSelected)}
                </span>
                <span class="browse-dropdown-meta">Browse starred songs</span>
            </button>
        </div>
        <div class="browse-dropdown-section">
            ${renderSortOptions(state.settings.songsBrowseSort, "songs-sort")}
        </div>
    `;
    finalizeBrowseDropdown(elements.songsDropdown, "Songs");
}

function renderArtistDropdown() {
    const activePanel = state.settings.artistPanel === "composer" ? "composer" : "artist";
    const artistItems = state.artistOptions.length
        ? state.artistOptions.map((artist) => `
            <button class="browse-dropdown-item ${state.browseMode === BROWSE_MODE.ARTIST && (artist.id === state.settings.selectedArtistId || artist.title === state.settings.selectedArtistName) ? "is-selected" : ""}" data-artist-id="${escapeHtml(artist.id)}" data-artist-name="${escapeHtml(artist.title)}">
                <span class="browse-dropdown-label">${escapeHtml(artist.title)}</span>
                <span class="browse-dropdown-meta">${escapeHtml(artist.subtitle || "\u00A0")}</span>
            </button>
        `).join("")
        : `
            <button class="browse-dropdown-item" disabled>
                <span class="browse-dropdown-label">No artists</span>
            </button>
        `;
    const composerItems = state.composerOptions.length
        ? state.composerOptions.map((composer) => `
            <button class="browse-dropdown-item ${state.browseMode === BROWSE_MODE.COMPOSER && composer.value === state.settings.selectedComposer ? "is-selected" : ""}" data-composer-name="${escapeHtml(composer.value)}">
                <span class="browse-dropdown-label">${escapeHtml(composer.title)}</span>
                <span class="browse-dropdown-meta">${escapeHtml(composer.subtitle || "\u00A0")}</span>
            </button>
        `).join("")
        : `
            <button class="browse-dropdown-item" disabled>
                <span class="browse-dropdown-label">No composers</span>
            </button>
        `;

    elements.artistDropdown.innerHTML = `
        <div class="browse-dropdown-section">
            <button class="browse-dropdown-item ${activePanel === "artist" ? "is-selected" : ""}" data-artist-panel="artist">
                <span class="browse-dropdown-label-row">
                    <span class="browse-dropdown-label">Artists</span>
                    ${renderDropdownCheck(activePanel === "artist")}
                </span>
                <span class="browse-dropdown-meta">${state.artistOptions.length ? `${state.artistOptions.length} artists` : "Browse artists"}</span>
            </button>
            <button class="browse-dropdown-item ${activePanel === "composer" ? "is-selected" : ""}" data-artist-panel="composer">
                <span class="browse-dropdown-label-row">
                    <span class="browse-dropdown-label">Composers</span>
                    ${renderDropdownCheck(activePanel === "composer")}
                </span>
                <span class="browse-dropdown-meta">${state.composerOptions.length ? `${state.composerOptions.length} composers` : "Browse composer tags"}</span>
            </button>
        </div>
        <div class="browse-dropdown-section">
            ${renderTrackDisplayModeOptions(state.settings.artistDisplayMode, "artist-display")}
        </div>
        <div class="browse-dropdown-section">
            ${renderSortOptions(state.settings.artistBrowseSort, "artist-sort")}
        </div>
        <div class="browse-dropdown-section browse-dropdown-sublist">
            ${activePanel === "composer" ? composerItems : artistItems}
        </div>
    `;
    finalizeBrowseDropdown(elements.artistDropdown, "Artists");
}

function renderPlaylistDropdown() {
    const playlistItems = state.playlistOptions
        .map((playlist) => ({ ...playlist, value: playlist.id }));
    const playlistHtml = playlistItems.length
        ? playlistItems
            .map(
                (playlist) => `
                    <button class="browse-dropdown-item ${playlist.id === state.settings.selectedPlaylistId ? "is-selected" : ""}" data-playlist-id="${escapeHtml(playlist.id)}">
                        <span class="browse-dropdown-label-row">
                            <span class="browse-dropdown-label">${escapeHtml(playlist.title)}</span>
                            <span class="browse-dropdown-count">${escapeHtml(String(playlist.songCount || 0))}</span>
                        </span>
                    </button>
                `
            )
            .join("")
        : `
            <button class="browse-dropdown-item" disabled>
                <span class="browse-dropdown-label">No playlists</span>
            </button>
        `;

    elements.playlistDropdown.innerHTML = `
        <div class="browse-dropdown-section">
            ${renderTrackDisplayModeOptions(state.settings.playlistDisplayMode, "playlist-display")}
        </div>
        <div class="browse-dropdown-section">
            ${renderSortOptions(state.settings.playlistBrowseSort, "playlist-sort")}
        </div>
        <div class="browse-dropdown-section">
            ${playlistHtml}
        </div>
    `;
    finalizeBrowseDropdown(elements.playlistDropdown, "Playlists");
}

function renderMoreDropdown() {
    const selectedYearTitle = state.settings.selectedYear || "Select year";
    const selectedGenreTitle = state.settings.selectedGenre || "Select genre";
    const yearItems = buildYearOptions()
        .map(
            (year) => `
                <button class="browse-dropdown-item ${state.browseMode === BROWSE_MODE.YEAR && state.settings.selectedYear === year ? "is-selected" : ""}" data-year-key="${escapeHtml(year)}">
                    <span class="browse-dropdown-label">${escapeHtml(year)}</span>
                    <span class="browse-dropdown-meta">${state.settings.selectedYear === year ? "Selected" : "\u00A0"}</span>
                </button>
            `
        )
        .join("");
    const genreItems = state.genreOptions
        .map(
            (genre) => `
                <button class="browse-dropdown-item ${state.browseMode === BROWSE_MODE.GENRE && state.settings.selectedGenre === genre.value ? "is-selected" : ""}" data-genre-key="${escapeHtml(genre.value)}">
                    <span class="browse-dropdown-label">${escapeHtml(genre.title)}</span>
                    <span class="browse-dropdown-meta">${escapeHtml(genre.subtitle || "\u00A0")}</span>
                </button>
            `
        )
        .join("");

    const radioItems = state.activeMorePanel === "radio"
        ? `
            <div class="browse-dropdown-sublist">
                <button class="browse-dropdown-item ${state.browseMode === BROWSE_MODE.RADIO ? "is-selected" : ""}" data-more-mode="${BROWSE_MODE.RADIO}">
                    <span class="browse-dropdown-label">Saved stations</span>
                    <span class="browse-dropdown-meta">Stations stored in Navidrome</span>
                </button>
                <button class="browse-dropdown-item" data-radio-search>
                    <span class="browse-dropdown-label">Search stations</span>
                    <span class="browse-dropdown-meta">Find community internet radio</span>
                </button>
            </div>
        `
        : "";

    elements.moreDropdown.innerHTML = `
        <div class="browse-dropdown-section">
            <button class="browse-dropdown-item ${state.activeMorePanel === "radio" ? "is-selected" : ""}" data-more-panel="radio">
                <span class="browse-dropdown-label">Radio</span>
                <span class="browse-dropdown-meta">${state.browseMode === BROWSE_MODE.RADIO ? "Saved stations" : "Listen to internet radio"}</span>
            </button>
            ${radioItems}
        </div>
        <div class="browse-dropdown-section">
            <button class="browse-dropdown-item ${state.activeMorePanel === "year" ? "is-selected" : ""}" data-more-panel="year">
                <span class="browse-dropdown-label">Years</span>
                <span class="browse-dropdown-meta">${escapeHtml(selectedYearTitle)}</span>
            </button>
            ${
                state.activeMorePanel === "year"
                    ? `
                <div class="browse-dropdown-sublist">
                    ${yearItems}
                </div>
            `
                    : ""
            }
        </div>
        <div class="browse-dropdown-section">
            <button class="browse-dropdown-item ${state.activeMorePanel === "genre" ? "is-selected" : ""}" data-more-panel="genre">
                <span class="browse-dropdown-label">Genres</span>
                <span class="browse-dropdown-meta">${escapeHtml(selectedGenreTitle)}</span>
            </button>
            ${
                state.activeMorePanel === "genre"
                    ? `
                <div class="browse-dropdown-sublist">
                    ${
                        genreItems ||
                        `
                        <button class="browse-dropdown-item" disabled>
                            <span class="browse-dropdown-label">No genres</span>
                        </button>
                    `
                    }
                </div>
            `
                    : ""
            }
        </div>
    `;
    finalizeBrowseDropdown(elements.moreDropdown, "More");
}

function renderSettingsDropdown() {
    const fontPercent = Math.round(albumInfoFontScale * 100);
    const canShrink = albumInfoFontScale > MIN_FONT_SCALE + 0.01;
    const canGrow = albumInfoFontScale < MAX_FONT_SCALE - 0.01;
    const canReset = Math.abs(albumInfoFontScale - DEFAULT_FONT_SCALE) > 0.01;

    elements.settingsDropdown.innerHTML = `
        <div class="browse-dropdown-section">
            <div class="settings-stack">
                <div class="settings-stepper">
                    <button class="settings-step-btn" data-settings-action="font-down" ${canShrink ? "" : "disabled"}>A-</button>
                    <button class="settings-step-btn" data-settings-action="font-reset" ${canReset ? "" : "disabled"}>100%</button>
                    <button class="settings-step-btn" data-settings-action="font-up" ${canGrow ? "" : "disabled"}>A+</button>
                </div>
                <div class="settings-summary">
                    <span class="browse-dropdown-label">Album Info Font</span>
                    <span class="browse-dropdown-meta">${fontPercent}%</span>
                </div>
            </div>
        </div>
        <div class="browse-dropdown-section">
            <button class="browse-dropdown-item" data-settings-action="connect">
                <span class="browse-dropdown-label">Connect</span>
                <span class="browse-dropdown-meta">${escapeHtml(getConnectionSummaryText())}</span>
            </button>
            <button class="browse-dropdown-item" data-settings-action="refresh" ${state.connected ? "" : "disabled"}>
                <span class="browse-dropdown-label">Refresh library</span>
                <span class="browse-dropdown-meta">Reload albums, songs, and playlists</span>
            </button>
        </div>
    `;
    finalizeBrowseDropdown(elements.settingsDropdown, "Settings");
}

function getConnectionSummaryText() {
    if (!state.connected) {
        return "Enter Navidrome details";
    }
    const username = pickText(state.settings.username, "user");
    return `${username}  ·  ${state.settings.serverUrl}`;
}

const BROWSE_DROPDOWN_ANCHORS = {
    album: "browseAlbum",
    songs: "browseSongs",
    artist: "browseArtist",
    playlist: "browsePlaylist",
    more: "browseMore",
    settings: "browseSettings",
};

function portalBrowseDropdowns() {
    const dropdowns = [
        elements.albumDropdown,
        elements.songsDropdown,
        elements.artistDropdown,
        elements.playlistDropdown,
        elements.moreDropdown,
        elements.settingsDropdown,
    ];
    for (const el of dropdowns) {
        if (el && el.parentElement !== document.body) {
            document.body.appendChild(el);
            el.classList.add("browse-dropdown-floating");
        }
    }
    if (elements.volumePopover && elements.volumePopover.parentElement !== document.body) {
        document.body.appendChild(elements.volumePopover);
        elements.volumePopover.classList.add("volume-popover-floating");
    }
    let floatingPositionTimer = 0;
    const scheduleFloatingPosition = () => {
        if (floatingPositionTimer) {
            window.clearTimeout(floatingPositionTimer);
        }
        floatingPositionTimer = window.setTimeout(() => {
            floatingPositionTimer = 0;
            if (state.activeDropdown) {
                positionActiveDropdown();
            }
            if (elements.volumePopover?.classList.contains("is-open")) {
                positionVolumePopover();
            }
        }, 120);
    };
    window.addEventListener("resize", scheduleFloatingPosition);
    window.addEventListener("orientationchange", scheduleFloatingPosition);
}

function positionVolumePopover() {
    const popover = elements.volumePopover;
    const anchor = elements.btnVolume;
    if (!popover || !anchor) return;
    const rect = anchor.getBoundingClientRect();
    const viewportW = window.innerWidth;
    const viewportH = window.innerHeight;
    const offset = 6;
    const sidePad = 8;
    // Measure popover
    popover.style.left = "0px";
    popover.style.right = "auto";
    popover.style.top = "auto";
    const popRect = popover.getBoundingClientRect();
    const popWidth = popRect.width || 56;
    // Anchor right edge of popover to right edge of button (existing UX)
    const right = Math.max(sidePad, viewportW - rect.right);
    popover.style.right = `${right}px`;
    popover.style.left = "auto";
    popover.style.top = `${Math.min(viewportH - sidePad, rect.bottom + offset)}px`;
    popover.style.bottom = "auto";
    void popWidth;
}

function positionActiveDropdown() {
    const key = state.activeDropdown;
    if (!key) return;
    const map = {
        album: elements.albumDropdown,
        songs: elements.songsDropdown,
        artist: elements.artistDropdown,
        playlist: elements.playlistDropdown,
        more: elements.moreDropdown,
        settings: elements.settingsDropdown,
    };
    const dropdownEl = map[key];
    const anchorEl = elements[BROWSE_DROPDOWN_ANCHORS[key]];
    if (!dropdownEl || !anchorEl) return;

    const rect = anchorEl.getBoundingClientRect();
    const viewportW = window.innerWidth;
    const viewportH = window.innerHeight;
    const offset = 8;
    const sidePad = 8;

    // Measure the dropdown to clamp within viewport
    dropdownEl.style.left = "0px";
    dropdownEl.style.right = "auto";
    const dropdownRect = dropdownEl.getBoundingClientRect();
    const dropdownWidth = dropdownRect.width || 260;

    // Prefer anchoring to right edge for settings (rightmost button)
    if (key === "settings") {
        const right = Math.max(sidePad, viewportW - rect.right);
        dropdownEl.style.right = `${right}px`;
        dropdownEl.style.left = "auto";
    } else {
        let left = rect.left;
        // Clamp right edge into viewport
        if (left + dropdownWidth > viewportW - sidePad) {
            left = Math.max(sidePad, viewportW - dropdownWidth - sidePad);
        }
        if (left < sidePad) left = sidePad;
        dropdownEl.style.left = `${left}px`;
        dropdownEl.style.right = "auto";
    }
    dropdownEl.style.bottom = `${Math.max(sidePad, viewportH - rect.top + offset)}px`;
    dropdownEl.style.top = "auto";
}

function renderBrowseMenus() {
    const activeMenu = getActiveBrowseMenu();
    browseButtons.forEach((button) => {
        if (!button) {
            return;
        }
        const menuName = button.dataset.browseMenu;
        button.classList.toggle(
            "is-active",
            state.activeDropdown ? menuName === state.activeDropdown : menuName === activeMenu
        );
    });

    renderAlbumDropdown();
    renderArtistDropdown();
    renderSongsDropdown();
    renderPlaylistDropdown();
    renderMoreDropdown();
    renderSettingsDropdown();

    elements.albumDropdown.classList.toggle("is-open", state.activeDropdown === "album");
    elements.albumDropdown.setAttribute("aria-hidden", String(state.activeDropdown !== "album"));
    elements.artistDropdown.classList.toggle("is-open", state.activeDropdown === "artist");
    elements.artistDropdown.setAttribute("aria-hidden", String(state.activeDropdown !== "artist"));
    elements.songsDropdown.classList.toggle("is-open", state.activeDropdown === "songs");
    elements.songsDropdown.setAttribute("aria-hidden", String(state.activeDropdown !== "songs"));
    elements.playlistDropdown.classList.toggle("is-open", state.activeDropdown === "playlist");
    elements.playlistDropdown.setAttribute("aria-hidden", String(state.activeDropdown !== "playlist"));
    elements.moreDropdown.classList.toggle("is-open", state.activeDropdown === "more");
    elements.moreDropdown.setAttribute("aria-hidden", String(state.activeDropdown !== "more"));
    elements.settingsDropdown.classList.toggle("is-open", state.activeDropdown === "settings");
    elements.settingsDropdown.setAttribute("aria-hidden", String(state.activeDropdown !== "settings"));

    if (state.activeDropdown) {
        positionActiveDropdown();
    }
}

function getActiveBrowseMenu() {
    if (state.browseMode === BROWSE_MODE.PLAYLIST) {
        return BROWSE_MODE.PLAYLIST;
    }
    if (state.browseMode === BROWSE_MODE.COMPOSER) {
        return BROWSE_MODE.ARTIST;
    }
    if ([
        BROWSE_MODE.YEAR,
        BROWSE_MODE.GENRE,
        BROWSE_MODE.RATING,
        BROWSE_MODE.STARRED,
        BROWSE_MODE.RADIO,
    ].includes(state.browseMode)) {
        return "more";
    }
    return state.browseMode;
}

function escapeHtml(value) {
    return String(value ?? "")
        .replaceAll("&", "&amp;")
        .replaceAll("<", "&lt;")
        .replaceAll(">", "&gt;")
        .replaceAll('"', "&quot;")
        .replaceAll("'", "&#39;");
}

function formatClock(seconds, forceHours = false) {
    const safeSeconds = Math.max(0, Math.floor(Number(seconds) || 0));
    const hours = Math.floor(safeSeconds / 3600);
    const minutes = Math.floor((safeSeconds % 3600) / 60);
    const remainder = safeSeconds % 60;

    if (forceHours || hours > 0) {
        return `${hours}:${String(minutes).padStart(2, "0")}:${String(remainder).padStart(2, "0")}`;
    }

    return `${minutes}:${String(remainder).padStart(2, "0")}`;
}

function formatCount(count, label) {
    return `${count} ${label}${count === 1 ? "" : "s"}`;
}

function formatBitrate(value) {
    const numeric = Number(value || 0);
    if (!numeric) {
        return "Unknown";
    }
    return `${Math.round(numeric)} kbps`;
}

function browseSortText(entry) {
    return pickText(entry?.title, entry?.album, entry?.artist, "").trim();
}

function compareBrowseEntriesAtoZ(left, right) {
    const primary = alphaCollator.compare(browseSortText(left), browseSortText(right));
    if (primary !== 0) {
        return primary;
    }
    const secondary = alphaCollator.compare(pickText(left?.artist, left?.subtitle), pickText(right?.artist, right?.subtitle));
    if (secondary !== 0) {
        return secondary;
    }
    return alphaCollator.compare(String(left?.key || ""), String(right?.key || ""));
}

function sortBrowseEntriesAtoZ(entries) {
    return [...entries].sort(compareBrowseEntriesAtoZ);
}

function parseYearForSort(value) {
    const match = String(value || "").match(/\d{4}/);
    return match ? Number(match[0]) : null;
}

function compareBrowseEntriesByYear(left, right, direction = 1) {
    const leftYear = parseYearForSort(left?.year);
    const rightYear = parseYearForSort(right?.year);
    if (leftYear == null && rightYear == null) {
        return compareBrowseEntriesAtoZ(left, right);
    }
    if (leftYear == null) {
        return 1;
    }
    if (rightYear == null) {
        return -1;
    }
    if (leftYear !== rightYear) {
        return (leftYear - rightYear) * direction;
    }
    return compareBrowseEntriesAtoZ(left, right);
}

function compareUnknownAlbumsLast(left, right) {
    const leftUnknown = left?.kind === "album" && normalizeIdentityText(left.title) === "unknown album";
    const rightUnknown = right?.kind === "album" && normalizeIdentityText(right.title) === "unknown album";
    if (leftUnknown === rightUnknown) {
        return 0;
    }
    return leftUnknown ? 1 : -1;
}

function sortBrowseEntriesForCurrentMode(entries) {
    const sortKey =
        state.browseMode === BROWSE_MODE.SONGS
            ? normalizeBrowseSort(state.settings.songsBrowseSort)
            : state.browseMode === BROWSE_MODE.ALBUM
                ? normalizeBrowseSort(state.settings.albumBrowseSort)
                : [BROWSE_MODE.ARTIST, BROWSE_MODE.COMPOSER].includes(state.browseMode)
                    ? normalizeBrowseSort(state.settings.artistBrowseSort)
                    : state.browseMode === BROWSE_MODE.PLAYLIST
                        ? normalizeBrowseSort(state.settings.playlistBrowseSort)
                        : "title";

    const compareWithUnknownAlbumsLast = (compareEntries) => (left, right) =>
        compareUnknownAlbumsLast(left, right) || compareEntries(left, right);

    if (sortKey === "year-asc") {
        return [...entries].sort(compareWithUnknownAlbumsLast(
            (left, right) => compareBrowseEntriesByYear(left, right, 1)
        ));
    }
    if (sortKey === "year-desc") {
        return [...entries].sort(compareWithUnknownAlbumsLast(
            (left, right) => compareBrowseEntriesByYear(left, right, -1)
        ));
    }
    return [...entries].sort(compareWithUnknownAlbumsLast(compareBrowseEntriesAtoZ));
}

function sortDrawerItemsAtoZ(items) {
    return [...items].sort((left, right) => {
        const primary = compareBrowseEntriesAtoZ(left?.track, right?.track);
        if (primary !== 0) {
            return primary;
        }
        return Number(left?.index || 0) - Number(right?.index || 0);
    });
}

function sortDrawerItemsByTrackNumber(items) {
    return [...items].sort((left, right) => {
        const leftTrackNo = Number(left?.track?.trackNo || 0);
        const rightTrackNo = Number(right?.track?.trackNo || 0);
        const leftOrder = leftTrackNo > 0 ? leftTrackNo : Number(left?.index || 0) + 1;
        const rightOrder = rightTrackNo > 0 ? rightTrackNo : Number(right?.index || 0) + 1;
        if (leftOrder !== rightOrder) {
            return leftOrder - rightOrder;
        }
        return Number(left?.index || 0) - Number(right?.index || 0);
    });
}

function entryMatchesSearch(entry, query) {
    const haystack = [
        entry?.title,
        entry?.artist,
        entry?.album,
        entry?.subtitle,
        entry?.genre,
        entry?.year,
    ]
        .filter(Boolean)
        .join(" ")
        .toLowerCase();
    return haystack.includes(query.toLowerCase());
}

function applySearchEntries(entries, previousTextures = new Map()) {
    browseEntries = sortBrowseEntriesAtoZ(entries);
    textures = buildTexturesForEntries(browseEntries, previousTextures);
    state.browseIndex = 0;
    state.activeEntryKey = browseEntries[0]?.key || null;
    setAlbumData(browseEntries.map((_, index) => textures[index] || getDefaultTexture()));
    ensureTextures();
    jumpTo(0);
    updateUI();
    renderBrowseMenus();
    renderSearchPanel();
    positionInfoPanel();
}

function presentRadioPreview(entry) {
    if (!entry) {
        return;
    }
    progressiveAlbumLoad = null;
    state.browseMode = BROWSE_MODE.RADIO;
    state.activeMorePanel = "radio";
    applySearchEntries([entry]);
    saveSettings();
}

function getSearchEntryIdentity(entry) {
    if (!entry) {
        return "";
    }
    const kind = entry.kind || "entry";
    return `${kind}:${entry.id || entry.key || entry.title || ""}`;
}

function mergeSearchEntries(entries) {
    const seen = new Set();
    return sortBrowseEntriesAtoZ(entries).filter((entry) => {
        const identity = getSearchEntryIdentity(entry);
        if (!identity || seen.has(identity)) {
            return false;
        }
        seen.add(identity);
        return true;
    });
}

function captureSearchBase() {
    searchBaseMode = state.browseMode === BROWSE_MODE.SEARCH
        ? normalizeBrowseMode(state.settings.viewMode)
        : state.browseMode;

    if (state.browseMode === BROWSE_MODE.SEARCH || !browseEntries.length) {
        searchBaseEntries = [];
        searchBaseTextures = new Map();
        return;
    }

    searchBaseEntries = browseEntries;
    searchBaseTextures = new Map(
        browseEntries
            .map((entry, index) => [entry.key, textures[index]])
            .filter(([, texture]) => texture)
    );
}

async function ensureSearchBaseEntries() {
    if (searchBaseEntries.length || !state.connected) {
        return searchBaseEntries;
    }

    const requestId = ++searchBaseLoadId;
    const mode = searchBaseMode === BROWSE_MODE.SEARCH ? BROWSE_MODE.ALBUM : searchBaseMode;
    const shelfRequest = await getAlbumShelfRequestForMode(mode);
    const entries = shelfRequest
        ? await fetchAlbumShelfPage(shelfRequest.type, 0, ALBUM_PAGE_SIZE, shelfRequest.extraParams)
        : await fetchBrowseEntriesForMode(mode);

    if (requestId !== searchBaseLoadId) {
        return searchBaseEntries;
    }

    searchBaseMode = mode;
    searchBaseEntries = sortBrowseEntriesAtoZ(entries);
    searchBaseTextures = new Map();
    return searchBaseEntries;
}

function restoreSearchBaseEntries() {
    state.browseMode = searchBaseMode === BROWSE_MODE.SEARCH ? BROWSE_MODE.ALBUM : searchBaseMode;
    state.searchLoading = false;
    progressiveAlbumLoad = null;
    applySearchEntries(searchBaseEntries, searchBaseTextures);
    saveSettings();
}

function getDisplayedTimeline() {
    const audio = elements.audioPlayer;
    const duration = Number.isFinite(audio.duration) && audio.duration > 0
        ? audio.duration
        : playbackState.duration;
    const elapsed = Number.isFinite(audio.currentTime) ? audio.currentTime : playbackState.elapsed;
    return {
        elapsed: Math.max(0, elapsed || 0),
        duration: Math.max(0, duration || 0),
    };
}

function getVolumeIconPath(volume) {
    if (volume <= 0) {
        return "M16.5 12c0-1.14-.66-2.12-1.62-2.59v5.18A2.99 2.99 0 0 0 16.5 12zm-9-3H3v6h4.5l4.5 4.5V4.5zm7.88-3.12-1.41 1.41A6.96 6.96 0 0 1 18 12a6.96 6.96 0 0 1-4.03 6.29l1.41 1.41A8.97 8.97 0 0 0 20 12a8.97 8.97 0 0 0-4.62-6.12z";
    }

    if (volume < 45) {
        return "M3 9v6h4l5 5V4L7 9H3zm11.5 3c0-1.77-1.02-3.29-2.5-4.03v8.05c1.48-.73 2.5-2.25 2.5-4.02z";
    }

    return "M3 9v6h4l5 5V4L7 9H3zm13.5 3c0-1.77-1.02-3.29-2.5-4.03v8.05c1.48-.73 2.5-2.25 2.5-4.02zM14 3.23v2.06c2.89.86 5 3.54 5 6.71s-2.11 5.85-5 6.71v2.06c4.01-.91 7-4.49 7-8.77s-2.99-7.86-7-8.77z";
}

function updatePlaybackStripUI() {
    const { elapsed, duration } = getDisplayedTimeline();
    const safeDuration = Math.max(0, Math.floor(duration || 0));
    const safeElapsed = Math.max(0, Math.floor(elapsed || 0));
    const progressPercent = safeDuration > 0 ? clamp((safeElapsed / safeDuration) * 100, 0, 100) : 0;
    const safeVolume = clamp(Math.round(playbackState.volume || 0), 0, 100);
    const usesHours = safeDuration >= 3600;
    const elapsedLabel = formatClock(safeElapsed, usesHours);
    const durationLabel = safeDuration > 0 ? formatClock(safeDuration, usesHours) : "--:--";

    elements.seekTime.textContent = `${elapsedLabel} / ${durationLabel}`;
    elements.seekFill.style.width = `${progressPercent}%`;
    elements.seekHandle.style.left = `${progressPercent}%`;
    elements.seekTrack.setAttribute("aria-valuenow", String(Math.round(progressPercent)));
    elements.seekTrack.setAttribute("aria-valuetext", `${elapsedLabel} of ${safeDuration > 0 ? durationLabel : "0:00"}`);
    elements.volumeIconPath.setAttribute("d", getVolumeIconPath(safeVolume));
    elements.btnVolume.classList.toggle("is-muted", safeVolume <= 0);
    elements.volumeSlider.value = String(safeVolume);
    elements.volumeSlider.style.setProperty("--volume-progress", `${safeVolume}%`);
}

function updateBrowseSummary() {
    const infoLines = getInfoPanelLines();
    elements.trackTitle.textContent = infoLines.title;
    elements.trackArtist.textContent = infoLines.subtitle;
    renderInfoActionMenu();
    updateBrowseStripUI();
}

function updatePlaybackSummary() {
    elements.btnDrawer.setAttribute("aria-expanded", String(state.drawerOpen));
    elements.iconPlay.classList.toggle("hidden", playbackState.playing);
    elements.iconPause.classList.toggle("hidden", !playbackState.playing);
    elements.iconFsPlay.classList.toggle("hidden", playbackState.playing);
    elements.iconFsPause.classList.toggle("hidden", !playbackState.playing);
    const hasQueue = state.playbackQueue.length > 0;
    const canPrevWithinQueue = hasQueue && state.playbackIndex > 0;
    const canNextWithinQueue = hasQueue && state.playbackIndex < state.playbackQueue.length - 1;
    elements.btnPrev.disabled = !hasQueue || (!canPrevWithinQueue && !hasAdjacentBrowseEntry(state.currentTrack, -1));
    elements.btnNext.disabled = !hasQueue || (!canNextWithinQueue && !hasAdjacentBrowseEntry(state.currentTrack, 1));
    elements.btnFsPrev.disabled = elements.btnPrev.disabled;
    elements.btnFsNext.disabled = elements.btnNext.disabled;
    updatePlaybackStripUI();
}

function updateBrowseStripUI() {
    const maxIndex = Math.max(0, browseEntries.length - 1);
    const nextValue = clamp(state.browseIndex, 0, maxIndex);
    const activeEntry = browseEntries[nextValue] || null;
    const hasEntries = browseEntries.length > 0;
    const hasMultipleEntries = browseEntries.length > 1;

    elements.browseStrip.max = String(maxIndex);
    elements.browseStrip.value = String(nextValue);
    elements.browseStrip.disabled = !hasMultipleEntries;
    elements.btnBrowsePrev.disabled = !hasEntries || nextValue <= 0;
    elements.btnBrowseNext.disabled = !hasEntries || nextValue >= maxIndex;
    elements.btnDrawer.disabled = !hasEntries;
    elements.browseStrip.setAttribute(
        "aria-valuetext",
        activeEntry?.title
            ? `${nextValue + 1} of ${browseEntries.length}: ${activeEntry.title}`
            : `${hasEntries ? nextValue + 1 : 0} of ${browseEntries.length}`
    );
}

function renderSearchPanel() {
    elements.searchPanel.classList.toggle("hidden", !state.searchOpen);
    elements.searchPanel.setAttribute("aria-hidden", String(!state.searchOpen));
    elements.btnSearch.setAttribute("aria-expanded", String(state.searchOpen));
    elements.btnSearch.classList.toggle("is-active", state.searchOpen);

    if (!state.searchOpen) {
        return;
    }

    const query = state.searchQuery.trim();
    elements.btnSearchClear.classList.toggle("hidden", !query);
    elements.searchInput.placeholder = state.radioInternetSearch
        ? "Search community radio"
        : "Search albums and songs";
    elements.searchInput.setAttribute(
        "aria-label",
        state.radioInternetSearch ? "Search community radio" : "Search albums and songs"
    );

    if (state.radioInternetSearch) {
        if (state.searchLoading) {
            elements.searchMeta.textContent = "Searching community radio...";
        } else if (!query) {
            elements.searchMeta.textContent = "";
        } else if (state.radioSearchError) {
            elements.searchMeta.textContent = state.radioSearchError;
        } else {
            elements.searchMeta.textContent = state.radioSearchResults.length
                ? `${state.radioSearchResults.length} ${state.radioSearchResults.length === 1 ? "station" : "stations"} for "${query}"`
                : `No stations for "${query}"`;
        }
        elements.searchMeta.classList.toggle("hidden", !elements.searchMeta.textContent);
        elements.searchResults.innerHTML = query && state.radioSearchResults.length
            ? `
                ${state.radioSearchResults.map((entry, index) => renderRadioSearchResult(entry, index)).join("")}
                ${
                    state.radioSearchHasMore
                        ? `<button class="radio-search-load-more" data-radio-action="load-more" type="button" ${state.radioSearchLoadingMore ? "disabled" : ""}>${state.radioSearchLoadingMore ? "Loading stations..." : "Load more stations"}</button>`
                        : ""
                }
            `
            : "";
        return;
    }

    if (state.searchLoading) {
        elements.searchMeta.textContent = "Searching...";
    } else if (!query) {
        elements.searchMeta.textContent = "";
    } else {
        elements.searchMeta.textContent = browseEntries.length
            ? `${browseEntries.length} ${browseEntries.length === 1 ? "result" : "results"} for "${query}"`
            : `No results for "${query}"`;
    }
    elements.searchMeta.classList.toggle("hidden", !elements.searchMeta.textContent);

    elements.searchResults.innerHTML = query && browseEntries.length
        ? browseEntries
            .slice(0, 80)
            .map((entry, index) => {
                const type = entry.kind === "album" ? "Album" : "Song";
                const meta = entry.kind === "album"
                    ? pickText(entry.artist, entry.subtitle, "Unknown Artist")
                    : pickText(entry.artist, entry.album, "Unknown Artist");
                return `
                    <button class="search-result-item ${index === state.browseIndex ? "is-active" : ""}" data-search-index="${index}">
                        <span class="search-result-type">${escapeHtml(type)}</span>
                        <span class="search-result-title">${escapeHtml(entry.title || "Untitled")}</span>
                        <span class="search-result-meta">${escapeHtml(meta || "\u00A0")}</span>
                    </button>
                `;
            })
            .join("")
        : "";
}

function renderRadioSearchResult(entry, index) {
    const saved = isRadioStationSaved(entry);
    const menuOpen = state.activeRadioSearchMenuIndex === index;
    const detail = [
        entry.country,
        entry.suffix ? String(entry.suffix).toUpperCase() : "",
    ].filter(Boolean).join("  ·  ");
    const favicon = `
        <span class="radio-search-logo-wrap">
            <span class="radio-search-logo radio-search-logo-fallback">${escapeHtml(stationInitials(entry.title))}</span>
            ${
                entry.iconUrl
                    ? `<img class="radio-search-logo radio-search-logo-image" src="${escapeHtml(entry.iconUrl)}" alt="" loading="lazy" onerror="this.remove()">`
                    : ""
            }
        </span>
    `;

    return `
        <div class="search-result-item radio-search-result ${menuOpen ? "is-menu-open" : ""}" data-radio-index="${index}">
            ${favicon}
            <button class="radio-search-main" data-radio-action="play" data-radio-index="${index}" type="button">
                <span class="search-result-title">${escapeHtml(entry.title || "Untitled Station")}</span>
                <span class="search-result-meta">${escapeHtml(entry.tags || entry.language || "Internet radio")}</span>
                <span class="radio-search-detail">${escapeHtml(detail || "\u00A0")}</span>
            </button>
            <button class="song-menu-btn radio-search-menu-btn" data-radio-action="toggle-menu" data-radio-index="${index}" type="button" aria-label="Station actions" aria-expanded="${menuOpen}">
                <svg viewBox="0 0 24 24" width="18" height="18" aria-hidden="true">
                    <path fill="currentColor" d="M12 7a2 2 0 1 0 0-4 2 2 0 0 0 0 4zm0 7a2 2 0 1 0 0-4 2 2 0 0 0 0 4zm0 7a2 2 0 1 0 0-4 2 2 0 0 0 0 4z"/>
                </svg>
            </button>
            ${
                menuOpen
                    ? `
                        <div class="song-context-menu radio-search-context-menu">
                            <button data-radio-action="play" data-radio-index="${index}">Play</button>
                            <button data-radio-action="add" data-radio-index="${index}" ${saved ? "disabled" : ""}>${saved ? "Already in Navidrome" : "Add to Navidrome"}</button>
                            <button data-radio-action="more-info" data-radio-index="${index}">More info</button>
                        </div>
                    `
                    : ""
            }
        </div>
    `;
}

function selectSearchResult(index) {
    if (!Number.isFinite(index) || !browseEntries[index]) {
        return false;
    }
    state.browseIndex = index;
    state.activeEntryKey = browseEntries[index]?.key || null;
    ensureTextures(index);
    navigateTo(index);
    updateUI();
    renderSearchPanel();
    positionInfoPanel();
    return true;
}

async function playSearchResult(index) {
    if (!selectSearchResult(index)) {
        return;
    }
    const entry = browseEntries[index];
    const context = await getPlaybackContextForEntry(entry);
    if (!context.tracks.length) {
        flashStatus("No tracks available for this item.", 2200);
        return;
    }
    await playTrackList(context.tracks, context.startIndex, context.key);
    setSearchOpen(false);
    if (state.drawerOpen) {
        setSongsDrawerOpen(false);
    }
}

function setSearchOpen(open) {
    state.searchOpen = open;
    state.activeDropdown = null;
    lastSearchClickIndex = -1;
    lastSearchClickAt = 0;
    if (open) {
        clearSnapBackTimer();
        setVolumePopoverOpen(false);
        setSongsDrawerOpen(false);
        if (!state.radioInternetSearch) {
            captureSearchBase();
        }
        state.searchQuery = elements.searchInput.value.trim();
    } else {
        state.radioInternetSearch = false;
        state.radioSearchResults = [];
        state.radioSearchError = "";
        state.radioSearchHasMore = false;
        state.radioSearchLoadingMore = false;
        state.radioSearchOffset = 0;
        state.activeRadioSearchMenuIndex = null;
        elements.searchInput.placeholder = "Search albums and songs";
    }
    renderBrowseMenus();
    renderSearchPanel();
    if (open) {
        requestAnimationFrame(() => elements.searchInput.focus());
    }
}

async function scheduleSearch() {
    const query = elements.searchInput.value.trim();
    state.searchQuery = query;
    if (searchTimerId) {
        window.clearTimeout(searchTimerId);
        searchTimerId = 0;
    }

    if (state.radioInternetSearch) {
        state.radioSearchError = "";
        state.activeRadioSearchMenuIndex = null;
        if (!query) {
            state.radioSearchResults = [];
            state.radioSearchHasMore = false;
            state.radioSearchOffset = 0;
            state.searchLoading = false;
            renderSearchPanel();
            return;
        }
        state.searchLoading = true;
        renderSearchPanel();
        searchTimerId = window.setTimeout(() => {
            searchTimerId = 0;
            runSearch();
        }, 280);
        return;
    }

    if (query) {
        state.searchLoading = true;
        renderSearchPanel();
        await ensureSearchBaseEntries();
        if (query !== elements.searchInput.value.trim()) {
            return;
        }
        const localMatches = searchBaseEntries.filter((entry) => entryMatchesSearch(entry, query));
        state.browseMode = BROWSE_MODE.SEARCH;
        applySearchEntries(localMatches, searchBaseTextures);
    } else {
        ++searchLoadId;
        await ensureSearchBaseEntries();
        if (elements.searchInput.value.trim()) {
            return;
        }
        if (searchBaseEntries.length) {
            restoreSearchBaseEntries();
        } else {
            state.searchLoading = false;
            renderSearchPanel();
        }
    }

    if (!query) {
        return;
    }
    searchTimerId = window.setTimeout(() => {
        searchTimerId = 0;
        runSearch();
    }, 280);
}

async function runSearch() {
    const query = elements.searchInput.value.trim();
    state.searchQuery = query;
    const requestId = ++searchLoadId;

    if (state.radioInternetSearch) {
        if (query.length < 2) {
            state.radioSearchResults = [];
            state.radioSearchError = query ? "Type at least two characters" : "";
            state.searchLoading = false;
            renderSearchPanel();
            return;
        }
        state.searchLoading = true;
        state.radioSearchError = "";
        renderSearchPanel();
        try {
            const [result] = await Promise.all([
                fetchCommunityRadioStations(query),
                ensureSavedRadioStations().catch(() => []),
            ]);
            if (requestId !== searchLoadId) {
                return;
            }
            state.radioSearchResults = result.stations;
            state.radioSearchHasMore = result.hasMore;
            state.radioSearchOffset = result.nextOffset;
        } catch (error) {
            if (requestId !== searchLoadId) {
                return;
            }
            console.error(error);
            state.radioSearchResults = [];
            state.radioSearchHasMore = false;
            state.radioSearchOffset = 0;
            state.radioSearchError = error.message || "Community radio search failed";
        } finally {
            if (requestId === searchLoadId) {
                state.searchLoading = false;
                renderSearchPanel();
            }
        }
        return;
    }

    if (!query) {
        ++searchLoadId;
        await ensureSearchBaseEntries();
        if (searchBaseEntries.length) {
            restoreSearchBaseEntries();
        } else {
            state.searchLoading = false;
            renderSearchPanel();
        }
        return;
    }

    if (!state.connected) {
        setConnectModalOpen(true);
        return;
    }

    state.searchLoading = true;
    renderSearchPanel();

    try {
        await ensureSearchBaseEntries();
        const localMatches = searchBaseEntries.filter((entry) => entryMatchesSearch(entry, query));
        const remoteEntries = await fetchSearchEntries(query);
        if (requestId !== searchLoadId) {
            return;
        }
        progressiveAlbumLoad = null;
        state.searchLoading = false;
        state.browseMode = BROWSE_MODE.SEARCH;
        applySearchEntries(mergeSearchEntries([...localMatches, ...remoteEntries]), searchBaseTextures);
    } catch (error) {
        if (requestId !== searchLoadId) {
            return;
        }
        console.error(error);
        state.searchLoading = false;
        elements.searchMeta.textContent = error.message || "Search failed";
        renderSearchPanel();
    }
}

async function loadMoreRadioSearchResults() {
    if (!state.radioInternetSearch || state.radioSearchLoadingMore || !state.radioSearchHasMore) {
        return;
    }
    const query = state.searchQuery.trim();
    if (query.length < 2) {
        return;
    }
    const requestId = searchLoadId;
    const previousScrollTop = elements.searchResults.scrollTop;
    state.radioSearchLoadingMore = true;
    renderSearchPanel();
    elements.searchResults.scrollTop = previousScrollTop;
    try {
        const result = await fetchCommunityRadioStations(query, "", {
            offset: state.radioSearchOffset,
        });
        if (requestId !== searchLoadId || !state.radioInternetSearch) {
            return;
        }
        const seen = new Set(state.radioSearchResults.map((entry) => normalizeIdentityText(entry.streamUrl)));
        for (const station of result.stations) {
            const identity = normalizeIdentityText(station.streamUrl);
            if (!identity || seen.has(identity)) {
                continue;
            }
            seen.add(identity);
            state.radioSearchResults.push(station);
        }
        state.radioSearchHasMore = result.hasMore;
        state.radioSearchOffset = result.nextOffset;
    } catch (error) {
        console.error(error);
        flashStatus(`Could not load more stations: ${error.message || error}`, 2600);
    } finally {
        if (requestId === searchLoadId) {
            state.radioSearchLoadingMore = false;
            renderSearchPanel();
            elements.searchResults.scrollTop = previousScrollTop;
        }
    }
}

function showStatus(message) {
    clearTimeout(statusHideTimer);
    elements.statusText.textContent = message;
    elements.statusOverlay.classList.remove("hidden");
}

function hideStatus() {
    elements.statusOverlay.classList.add("hidden");
}

function flashStatus(message, duration = 1800) {
    clearTimeout(statusHideTimer);
    showStatus(message);
    statusHideTimer = window.setTimeout(() => {
        statusHideTimer = null;
        hideStatus();
    }, duration);
}

function setVolumePopoverOpen(open) {
    elements.volumePopover.classList.toggle("is-open", open);
    elements.volumePopover.setAttribute("aria-hidden", String(!open));
    elements.btnVolume.setAttribute("aria-expanded", String(open));
    if (open) {
        positionVolumePopover();
    }
}

function getFullscreenElement() {
    return document.fullscreenElement || document.webkitFullscreenElement || null;
}

function getFullscreenRequestTarget() {
    return elements.app || document.documentElement;
}

function requestAppFullscreen() {
    const target = getFullscreenRequestTarget();
    try {
        if (document.fullscreenEnabled !== false && typeof target.requestFullscreen === "function") {
            return Promise.resolve(target.requestFullscreen({ navigationUI: "hide" }))
                .catch(() => target.requestFullscreen())
                .then(() => true);
        }
        if (document.webkitFullscreenEnabled !== false && typeof target.webkitRequestFullscreen === "function") {
            return Promise.resolve(target.webkitRequestFullscreen()).then(() => true);
        }
    } catch (error) {
        return Promise.reject(error);
    }
    return Promise.resolve(false);
}

function exitAppFullscreen() {
    try {
        if (typeof document.exitFullscreen === "function") {
            return Promise.resolve(document.exitFullscreen());
        }
        if (typeof document.webkitExitFullscreen === "function") {
            return Promise.resolve(document.webkitExitFullscreen());
        }
    } catch (error) {
        return Promise.reject(error);
    }
    return Promise.resolve();
}

function syncPlayerFullscreenState() {
    const active = Boolean(getFullscreenElement()) || state.playerFullscreen;
    document.documentElement.classList.toggle("is-player-fullscreen", active);
    document.body.classList.toggle("is-player-fullscreen", active);
    elements.btnPlayerFullscreen.classList.toggle("is-active", active);
    elements.btnPlayerFullscreen.setAttribute("aria-pressed", String(active));
    elements.btnPlayerFullscreen.setAttribute(
        "aria-label",
        active ? "Exit fullscreen player" : "Enter fullscreen player"
    );
    elements.btnPlayerFullscreen.title = active ? "Exit fullscreen player" : "Fullscreen player";
    elements.btnPlayerFullscreen
        .querySelector(".icon-fullscreen-enter")
        ?.classList.toggle("hidden", active);
    elements.btnPlayerFullscreen
        .querySelector(".icon-fullscreen-exit")
        ?.classList.toggle("hidden", !active);
    elements.fullscreenTransport.setAttribute("aria-hidden", String(!active));
    scheduleResizeLayout();
}

async function setPlayerFullscreen(open) {
    state.playerFullscreen = open;
    if (open) {
        state.activeDropdown = null;
        state.activeSongMenuIndex = null;
        state.activeInfoMenuMode = "closed";
        if (state.searchOpen) {
            setSearchOpen(false);
        }
        if (state.drawerOpen) {
            setSongsDrawerOpen(false);
        }
        setVolumePopoverOpen(false);
        renderBrowseMenus();
        renderInfoActionMenu();
        syncPlayerFullscreenState();

        const nativeOpened = await requestAppFullscreen().catch((error) => {
            console.warn("Fullscreen request failed", error);
            return false;
        });
        if (!nativeOpened) {
            flashStatus("Fullscreen view opened.", 1400);
        }
    } else {
        const exitPromise = getFullscreenElement()
            ? exitAppFullscreen().catch((error) => console.warn("Fullscreen exit failed", error))
            : Promise.resolve();
        await exitPromise;
        state.playerFullscreen = false;
        syncPlayerFullscreenState();
    }
}

function togglePlayerFullscreen() {
    setPlayerFullscreen(!state.playerFullscreen && !getFullscreenElement());
}

function updateUI() {
    updateBrowseSummary();
    updatePlaybackSummary();
    renderBrowseMenus();
    renderSongsDrawer();
}

function ensureTextures(centerIndex = state.browseIndex) {
    const center = clamp(centerIndex, 0, Math.max(0, browseEntries.length - 1));
    const sideCount = clamp(
        getSideCount() + TEXTURE_PRELOAD_EXTRA_COVERS,
        1,
        TEXTURE_PRELOAD_MAX_RADIUS
    );
    const lo = Math.max(0, center - sideCount);
    const hi = Math.min(browseEntries.length - 1, center + sideCount);

    for (const index of getTexturePreloadOrder(center, lo, hi)) {
        ensureTextureAtIndex(index);
    }
}

function getTexturePreloadOrder(center, lo, hi) {
    const order = [];
    for (let offset = 0; offset <= Math.max(center - lo, hi - center); offset += 1) {
        const left = center - offset;
        const right = center + offset;
        if (left >= lo) {
            order.push(left);
        }
        if (offset > 0 && right <= hi) {
            order.push(right);
        }
    }
    return order;
}

function ensureTextureAtIndex(index) {
    if (index < 0 || index >= browseEntries.length) {
        return Promise.resolve(null);
    }
    if (textures[index]) {
        return Promise.resolve(textures[index]);
    }
    const entry = browseEntries[index];
    const entryKey = entry?.key || `index:${index}`;
    const hotTexture = getHotTextureForEntry(entry);
    if (hotTexture) {
        textures[index] = hotTexture;
        rememberTextureForEntry(entry, hotTexture);
        setTextureAtIndex(index, hotTexture);
        return Promise.resolve(hotTexture);
    }
    const coverKey = getEntryCoverCacheKey(entry);
    const textureKey = coverKey || entryKey;
    let loadPromise = textureLoadPromises.get(textureKey);
    if (!loadPromise) {
        const coverUrlPromise = entry?.kind === "radio"
            ? resolveRadioCoverUrl(entry)
            : Promise.resolve(coverArtUrl(entry, 512));
        loadPromise = coverUrlPromise
            .then((coverUrl) => coverUrl ? loadArtworkTexture(entry, coverUrl, coverKey) : null)
            .then((texture) =>
                texture && texture !== getDefaultTexture()
                    ? texture
                    : entry?.kind === "radio"
                        ? createRadioCoverTexture(entry)
                        : createGeneratedCoverTexture(entry)
            )
            .catch(() =>
                entry?.kind === "radio"
                    ? createRadioCoverTexture(entry)
                    : createGeneratedCoverTexture(entry)
            )
            .finally(() => {
                if (textureLoadPromises.get(textureKey) === loadPromise) {
                    textureLoadPromises.delete(textureKey);
                }
            });
        textureLoadPromises.set(textureKey, loadPromise);
    }

    return loadPromise.then((texture) => {
        rememberTextureForEntry(entry, texture);
        if (browseEntries[index]?.key !== entryKey) {
            return null;
        }
        textures[index] = texture;
        setTextureAtIndex(index, texture);
        renderOnce();
        return texture;
    });
}

function fitInfoPanelTypography(coverWidthPx, availableHeightPx) {
    const safeWidth = Math.max(120, coverWidthPx || 0);
    const safeHeight = Math.max(10, Math.floor(availableHeightPx || 0));
    const fontScale = albumInfoFontScale;
    const compactMode = safeHeight < 26;
    const tinyMode = safeHeight < 18;
    let lineHeight = tinyMode ? 0.98 : compactMode ? 1.04 : 1.15;
    const minTitleSize = tinyMode ? 11 : 12;
    const minArtistSize = tinyMode ? 9 : 10;
    const minGap = tinyMode ? 0 : 1;

    // Title size is driven here, not by the CSS fallback. Keep it a bit tighter
    // so the song title doesn't visually overpower the album line.
    let titleSize = clamp(Math.round(safeWidth * 0.115 * fontScale), minTitleSize, 54);
    let artistSize = clamp(Math.round(safeWidth * 0.07 * fontScale), minArtistSize, 34);
    artistSize = Math.min(artistSize, Math.max(minArtistSize, Math.round(titleSize * 0.74)));
    const padX = clamp(Math.round(safeWidth * 0.02), 4, 12);
    const padTop = tinyMode ? 0 : clamp(Math.round(safeHeight * 0.01), 0, 2);
    let gap = tinyMode ? 0 : clamp(Math.round(titleSize * 0.08), 1, 4);

    const contentHeight = () => Math.ceil(titleSize * lineHeight) + Math.ceil(artistSize * lineHeight) + gap + padTop;

    for (let step = 0; step < 40 && contentHeight() > safeHeight; step += 1) {
        let changed = false;
        if (titleSize > minTitleSize) {
            titleSize -= 1;
            changed = true;
        }
        if (artistSize > minArtistSize && contentHeight() > safeHeight) {
            artistSize -= 1;
            changed = true;
        }
        if (gap > minGap && contentHeight() > safeHeight) {
            gap -= 1;
            changed = true;
        }
        if (!changed && lineHeight > 0.94 && contentHeight() > safeHeight) {
            lineHeight = Math.max(0.94, lineHeight - 0.02);
            changed = true;
        }
        if (!changed) {
            break;
        }
    }

    const panelStyle = elements.infoPanel.style;
    panelStyle.setProperty("--info-title-size", `${titleSize}px`);
    panelStyle.setProperty("--info-artist-size", `${artistSize}px`);
    panelStyle.setProperty("--info-gap", `${gap}px`);
    panelStyle.padding = `${padTop}px ${padX}px 0`;
    elements.trackTitle.style.lineHeight = String(lineHeight);
    elements.trackArtist.style.lineHeight = String(lineHeight);

    return {
        titleSize,
        artistSize,
        height: contentHeight(),
    };
}

function getControlsSurfaceTop() {
    const validTops = [
        elements.transport,
        elements.browseBarShell,
        elements.browseBar,
        elements.controlsMain,
        elements.controls,
    ]
        .map((element) => element?.getBoundingClientRect())
        .filter((rect) => rect && rect.width > 0 && rect.height > 0)
        .map((rect) => rect.top)
        .filter(Number.isFinite);
    return validTops.length ? Math.min(...validTops) : window.innerHeight;
}

function getProjectedCenterCoverBounds() {
    const metrics = getCenterCoverMetrics();
    const halfWidth = metrics.width / 2;
    const halfHeight = metrics.height / 2;
    const left = worldToScreenX(-halfWidth);
    const right = worldToScreenX(halfWidth);
    const top = worldToScreenY(metrics.offsetY + halfHeight);
    const bottom = worldToScreenY(metrics.offsetY - halfHeight);

    if (![left, right, top, bottom].every((value) => Number.isFinite(value))) {
        return null;
    }

    const normalizedLeft = Math.min(left, right);
    const normalizedRight = Math.max(left, right);
    const normalizedTop = Math.min(top, bottom);
    const normalizedBottom = Math.max(top, bottom);

    return {
        left: normalizedLeft,
        right: normalizedRight,
        top: normalizedTop,
        bottom: normalizedBottom,
        width: normalizedRight - normalizedLeft,
        height: normalizedBottom - normalizedTop,
        centerX: (normalizedLeft + normalizedRight) / 2,
        centerY: (normalizedTop + normalizedBottom) / 2,
    };
}

function fitControlsLayout() {
    const viewportHeight = window.innerHeight || document.documentElement.clientHeight || 480;
    const viewportWidth = window.innerWidth || document.documentElement.clientWidth || 800;
    const t = clamp((viewportHeight - 360) / 140, 0, 1);
    const controlsWidthT = clamp((viewportWidth - 620) / 420, 0, 1);
    const browseHeightT = clamp((viewportHeight - 300) / 220, 0, 1);
    const browseWidthT = clamp((viewportWidth - 420) / 320, 0, 1);
    const browseT = (browseHeightT + browseWidthT) / 2;
    const volumeT = clamp((viewportHeight - 280) / 220, 0, 1);
    const dialogWidthT = clamp((viewportWidth - 320) / 520, 0, 1);
    const dialogHeightT = clamp((viewportHeight - 260) / 260, 0, 1);
    const controlsT = (t + controlsWidthT) / 2;
    const dialogT = Math.min(dialogWidthT, dialogHeightT);
    const mix = (min, max) => min + (max - min) * t;
    const mixControls = (min, max) => min + (max - min) * controlsT;
    const mixBrowse = (min, max) => min + (max - min) * browseT;
    const mixVolume = (min, max) => min + (max - min) * volumeT;
    const mixDialog = (min, max) => min + (max - min) * dialogT;
    const rootStyle = document.documentElement.style;
    const coverStyle = elements.container.style;

    elements.controls.style.setProperty("--controls-shell-width", `${Math.round(mixControls(320, 560))}px`);
    elements.controls.style.setProperty("--controls-gap", `${Math.round(mix(0, 2))}px`);
    elements.controls.style.setProperty("--controls-padding-top", `${Math.round(mix(0, 2))}px`);
    elements.controls.style.setProperty("--controls-padding-side", `${Math.round(mixControls(4, 12))}px`);
    elements.controls.style.setProperty("--controls-padding-bottom", `${Math.round(mix(0, 2))}px`);
    elements.controls.style.setProperty("--controls-main-gap", `${Math.round(mixControls(2, 10))}px`);
    elements.controls.style.setProperty("--transport-gap", `${Math.round(mixControls(1, 8))}px`);
    const ctrlBtnSize = Math.round(mixControls(22, 32));
    const ctrlBtnIconSize = Math.round(mixControls(12, 18));
    const ctrlPlaySize = Math.round(mixControls(26, 36));
    const ctrlPlayIconSize = Math.round(mixControls(16, 24));
    const transportClusterGap = Math.round(mixControls(1, 6));
    const transportClusterPadY = Math.round(mixControls(0, 2));
    const transportClusterPadX = Math.round(mixControls(3, 8));
    const transportClusterHeight = Math.max(
        Math.round(mixControls(18, 30)),
        ctrlPlaySize + transportClusterPadY * 2 + 2
    );
    elements.controls.style.setProperty("--ctrl-btn-size", `${ctrlBtnSize}px`);
    elements.controls.style.setProperty("--ctrl-btn-icon-size", `${ctrlBtnIconSize}px`);
    elements.controls.style.setProperty("--ctrl-play-size", `${ctrlPlaySize}px`);
    elements.controls.style.setProperty("--ctrl-play-icon-size", `${ctrlPlayIconSize}px`);
    elements.controls.style.setProperty("--browse-strip-shell-height", `${Math.round(mixControls(16, 24))}px`);
    elements.controls.style.setProperty("--browse-strip-track-height", `${Math.round(mixControls(10, 16))}px`);
    elements.controls.style.setProperty("--browse-strip-thumb-height", `${Math.round(mixControls(10, 16))}px`);
    elements.controls.style.setProperty("--browse-strip-thumb-width", `${Math.round(mixControls(16, 30))}px`);
    elements.controls.style.setProperty("--browse-strip-cap-width", `${Math.round(mixControls(18, 26))}px`);
    elements.controls.style.setProperty("--transport-cluster-height", `${transportClusterHeight}px`);
    elements.controls.style.setProperty("--transport-cluster-gap", `${transportClusterGap}px`);
    elements.controls.style.setProperty("--transport-cluster-pad-y", `${transportClusterPadY}px`);
    elements.controls.style.setProperty("--transport-cluster-pad-x", `${transportClusterPadX}px`);
    rootStyle.setProperty("--browse-bar-gap", `${Math.round(mixBrowse(1, 5))}px`);
    rootStyle.setProperty("--menu-popover-offset", `${Math.round(mix(8, 10))}px`);
    rootStyle.setProperty("--menu-popover-padding", `${Math.round(mix(6, 8))}px`);
    rootStyle.setProperty("--menu-popover-radius", `${Math.round(mix(4, 5))}px`);
    rootStyle.setProperty("--menu-popover-min-width", `${Math.round(mix(140, 184))}px`);
    rootStyle.setProperty("--menu-popover-max-width", `${Math.round(mix(184, 240))}px`);
    rootStyle.setProperty("--menu-popover-max-height", `${Math.round(mix(160, 250))}px`);
    rootStyle.setProperty("--menu-item-gap", `${Math.round(mix(0, 2))}px`);
    rootStyle.setProperty("--menu-item-pad-y", `${Math.round(mix(5, 10))}px`);
    rootStyle.setProperty("--menu-item-pad-x", `${Math.round(mix(7, 12))}px`);
    rootStyle.setProperty("--menu-item-label-size", `${mix(9.5, 13).toFixed(1)}px`);
    rootStyle.setProperty("--menu-item-meta-size", `${mix(8, 11).toFixed(1)}px`);
    rootStyle.setProperty("--menu-section-gap", `${Math.round(mix(4, 8))}px`);
    rootStyle.setProperty("--menu-sublist-margin-top", `${Math.round(mix(3, 6))}px`);
    rootStyle.setProperty("--menu-sublist-padding-left", `${Math.round(mix(4, 8))}px`);
    rootStyle.setProperty("--menu-sublist-gap", `${Math.round(mix(2, 4))}px`);
    rootStyle.setProperty("--menu-sublist-item-padding-left", `${Math.round(mix(8, 14))}px`);
    rootStyle.setProperty("--settings-step-min-width", `${Math.round(mixBrowse(28, 38))}px`);
    rootStyle.setProperty("--settings-step-font-size", `${mixBrowse(8.5, 13).toFixed(1)}px`);
    rootStyle.setProperty("--settings-step-pad-y", `${Math.round(mixBrowse(4, 8))}px`);
    rootStyle.setProperty("--settings-step-pad-x", `${Math.round(mixBrowse(6, 11))}px`);
    rootStyle.setProperty("--context-menu-offset", `${Math.round(mix(4, 6))}px`);
    rootStyle.setProperty("--context-menu-min-width", `${Math.round(mix(136, 160))}px`);
    rootStyle.setProperty("--context-menu-padding", `${Math.round(mix(6, 8))}px`);
    rootStyle.setProperty("--context-menu-item-radius", `${Math.round(mix(7, 10))}px`);
    rootStyle.setProperty("--volume-popover-width", `${Math.round(mixVolume(28, 56))}px`);
    rootStyle.setProperty("--volume-popover-height", `${Math.round(mixVolume(96, 176))}px`);
    rootStyle.setProperty("--volume-popover-pad-y", `${Math.round(mixVolume(2, 14))}px`);
    rootStyle.setProperty("--volume-popover-pad-x", `${Math.round(mixVolume(0, 10))}px`);
    rootStyle.setProperty("--volume-popover-radius", `${Math.round(mixVolume(0, 14))}px`);
    rootStyle.setProperty("--volume-slider-shell-length", `${Math.round(mixVolume(76, 132))}px`);
    rootStyle.setProperty("--volume-slider-shell-cross", `${Math.round(mixVolume(12, 24))}px`);
    rootStyle.setProperty("--volume-slider-track-height", `${Math.round(mixVolume(2, 4))}px`);
    rootStyle.setProperty("--volume-slider-thumb-size", `${Math.round(mixVolume(10, 18))}px`);
    rootStyle.setProperty("--status-top", `${Math.round(mix(8, 10))}px`);
    rootStyle.setProperty("--status-pad-y", `${Math.round(mix(4, 5))}px`);
    rootStyle.setProperty("--status-pad-x", `${Math.round(mix(12, 16))}px`);
    rootStyle.setProperty("--status-font-size", `${mix(10.5, 12).toFixed(1)}px`);
    rootStyle.setProperty("--status-radius", `${Math.round(mix(5, 6))}px`);
    rootStyle.setProperty("--connect-modal-pad", `${Math.round(mixDialog(8, 20))}px`);
    rootStyle.setProperty("--connect-card-max-width", `${Math.round(mixDialog(280, 440))}px`);
    rootStyle.setProperty("--connect-header-gap", `${Math.round(mixDialog(6, 12))}px`);
    rootStyle.setProperty("--connect-header-pad-top", `${Math.round(mixDialog(10, 14))}px`);
    rootStyle.setProperty("--connect-header-pad-side", `${Math.round(mixDialog(10, 14))}px`);
    rootStyle.setProperty("--connect-header-pad-bottom", `${Math.round(mixDialog(8, 10))}px`);
    rootStyle.setProperty("--connect-title-size", `${mixDialog(12.5, 16).toFixed(1)}px`);
    rootStyle.setProperty("--connect-subtitle-size", `${mixDialog(9.5, 12).toFixed(1)}px`);
    rootStyle.setProperty("--connect-content-pad", `${Math.round(mixDialog(10, 14))}px`);
    rootStyle.setProperty("--connect-content-gap", `${Math.round(mixDialog(7, 10))}px`);
    rootStyle.setProperty("--connect-label-size", `${mixDialog(10, 12).toFixed(1)}px`);
    rootStyle.setProperty("--connect-input-font-size", `${mixDialog(11.5, 14).toFixed(1)}px`);
    rootStyle.setProperty("--connect-input-pad-y", `${Math.round(mixDialog(7, 10))}px`);
    rootStyle.setProperty("--connect-input-pad-x", `${Math.round(mixDialog(9, 12))}px`);
    rootStyle.setProperty("--connect-helper-size", `${mixDialog(9.5, 12).toFixed(1)}px`);
    rootStyle.setProperty("--connect-actions-gap", `${Math.round(mixDialog(5, 8))}px`);
    rootStyle.setProperty("--connect-btn-font-size", `${mixDialog(10.5, 13).toFixed(1)}px`);
    rootStyle.setProperty("--connect-btn-pad-y", `${Math.round(mixDialog(6, 8))}px`);
    rootStyle.setProperty("--connect-btn-pad-x", `${Math.round(mixDialog(8, 12))}px`);
    rootStyle.setProperty("--connect-btn-min-width", `${Math.round(mixDialog(64, 84))}px`);
    elements.controls.style.setProperty("--browse-btn-min-height", `${Math.round(mixBrowse(18, 34))}px`);
    elements.controls.style.setProperty("--browse-btn-radius", "4px");
    elements.controls.style.setProperty("--browse-btn-padding-y", `${Math.round(mixBrowse(0, 3))}px`);
    elements.controls.style.setProperty("--browse-btn-padding-x", `${Math.round(mixBrowse(1, 4))}px`);
    elements.controls.style.setProperty("--browse-btn-gap", `${Math.round(mixBrowse(0, 1))}px`);
    elements.controls.style.setProperty("--browse-bar-gap", `${Math.round(mixBrowse(1, 3))}px`);
    elements.controls.style.setProperty("--browse-btn-font-size", `${mixBrowse(5.8, 8.8).toFixed(1)}px`);
    elements.controls.style.setProperty("--browse-btn-icon-size", `${Math.round(mixBrowse(8, 16))}px`);
}

function fitPlaybackStripLayout(coverWidthPx, coverHeightPx) {
    const safeCoverWidth = Math.max(140, coverWidthPx || 0);
    const safeCoverHeight = Math.max(140, coverHeightPx || 0);
    const scaleT = clamp((Math.min(safeCoverWidth, safeCoverHeight) - 150) / 170, 0, 1);
    const mix = (min, max) => min + (max - min) * scaleT;
    const coverStyle = elements.container.style;

    coverStyle.setProperty("--playback-strip-gap", `${Math.round(mix(4, 10))}px`);
    coverStyle.setProperty("--seek-time-min-width", `${Math.round(Math.min(safeCoverWidth * 0.24, mix(44, 84)))}px`);
    coverStyle.setProperty("--seek-time-font-size", `${mix(9, 13).toFixed(1)}px`);
    coverStyle.setProperty("--seek-track-height", `${Math.round(mix(3, 5))}px`);
    coverStyle.setProperty("--seek-hit-height", `${Math.round(mix(26, 34))}px`);
    coverStyle.setProperty("--seek-handle-size", `${Math.round(mix(10, 14))}px`);
    coverStyle.setProperty("--top-volume-button-size", `${Math.round(mix(18, 24))}px`);
    coverStyle.setProperty("--top-volume-icon-size", `${Math.round(mix(11, 16))}px`);
    coverStyle.setProperty("--volume-popover-pad-y", `${Math.round(mix(6, 10))}px`);
    coverStyle.setProperty("--volume-popover-pad-x", `${Math.round(mix(6, 8))}px`);
    coverStyle.setProperty("--volume-popover-radius", `${Math.round(mix(8, 10))}px`);
    coverStyle.setProperty("--volume-slider-shell-length", `${Math.round(mix(72, 112))}px`);
    coverStyle.setProperty("--volume-slider-shell-cross", `${Math.round(mix(18, 32))}px`);
    coverStyle.setProperty("--volume-slider-track-height", `${Math.round(mix(3, 5))}px`);
    coverStyle.setProperty("--volume-slider-thumb-size", `${Math.round(mix(10, 12))}px`);
}

function fitDrawerTypography(drawerWidthPx, drawerHeightPx) {
    const safeWidth = Math.max(120, drawerWidthPx || 0);
    const safeHeight = Math.max(120, drawerHeightPx || 0);
    const viewportHeight = window.innerHeight || document.documentElement.clientHeight || 480;
    const coverT = clamp((Math.min(safeWidth, safeHeight) - 120) / 240, 0, 1);
    const viewportT = clamp((viewportHeight - 320) / 200, 0, 1);
    const t = Math.min(coverT, viewportT);
    const mix = (min, max) => min + (max - min) * t;

    elements.container.style.setProperty("--drawer-header-min-height", `${Math.round(mix(28, 42))}px`);
    elements.container.style.setProperty("--drawer-header-pad-y", `${Math.round(mix(3, 8))}px`);
    elements.container.style.setProperty("--drawer-header-pad-x", `${Math.round(mix(4, 12))}px`);
    elements.container.style.setProperty("--drawer-header-gap", `${Math.round(mix(6, 12))}px`);
    elements.container.style.setProperty("--drawer-header-actions-gap", `${Math.round(mix(5, 10))}px`);
    elements.container.style.setProperty("--drawer-title-size", `${mix(10.5, 15).toFixed(1)}px`);
    elements.container.style.setProperty("--drawer-count-size", `${mix(8, 11).toFixed(1)}px`);
    elements.container.style.setProperty("--drawer-close-size", `${Math.round(mix(20, 30))}px`);
    elements.container.style.setProperty("--drawer-close-radius", `${Math.round(mix(3, 4))}px`);
    elements.container.style.setProperty("--drawer-close-icon-size", `${Math.round(mix(13, 20))}px`);
    elements.container.style.setProperty("--drawer-table-head-size", `${mix(8, 11).toFixed(1)}px`);
    elements.container.style.setProperty("--drawer-cell-pad-y", `${Math.round(mix(3, 9))}px`);
    elements.container.style.setProperty("--drawer-cell-pad-x", `${Math.round(mix(3, 8))}px`);
    elements.container.style.setProperty("--drawer-col-nr-width", `${Math.round(mix(16, 30))}px`);
    elements.container.style.setProperty("--drawer-col-duration-width", `${Math.round(mix(28, 52))}px`);
    elements.container.style.setProperty("--drawer-col-actions-width", `${Math.round(mix(22, 42))}px`);
    elements.container.style.setProperty("--drawer-title-min-width", `${Math.round(mix(72, 156))}px`);
    elements.container.style.setProperty("--drawer-meta-size", `${mix(9.5, 13).toFixed(1)}px`);
    elements.container.style.setProperty("--drawer-row-title-size", `${mix(9.5, 14).toFixed(1)}px`);
    elements.container.style.setProperty("--drawer-row-subtitle-size", `${mix(8.5, 12).toFixed(1)}px`);
    elements.container.style.setProperty("--drawer-row-subtitle-gap", `${Math.round(mix(1, 2))}px`);
    elements.container.style.setProperty("--drawer-menu-font-size", `${mix(9.5, 14).toFixed(1)}px`);
    elements.container.style.setProperty("--drawer-menu-pad-y", `${Math.round(mix(5, 10))}px`);
    elements.container.style.setProperty("--drawer-menu-pad-x", `${Math.round(mix(6, 12))}px`);
    elements.container.style.setProperty("--drawer-empty-pad-y", `${Math.round(mix(14, 24))}px`);
    elements.container.style.setProperty("--drawer-empty-pad-x", `${Math.round(mix(8, 12))}px`);
    elements.container.style.setProperty("--drawer-info-label-size", `${mix(10, 12).toFixed(1)}px`);
    elements.container.style.setProperty("--drawer-info-value-size", `${mix(12, 14).toFixed(1)}px`);
    elements.container.style.setProperty("--drawer-info-grid-label-min", `${Math.round(mix(58, 74))}px`);
    elements.container.style.setProperty("--drawer-info-grid-gap-y", `${Math.round(mix(8, 10))}px`);
    elements.container.style.setProperty("--drawer-info-grid-gap-x", `${Math.round(mix(10, 14))}px`);
}

function applyAlbumInfoLayoutPreference() {
    return;
}

function isStandalonePortraitPhoneLayout() {
    const standalone =
        window.navigator?.standalone === true ||
        window.matchMedia?.("(display-mode: standalone)")?.matches;
    const portraitPhone = window.matchMedia?.("(max-width: 767px) and (orientation: portrait)")?.matches;
    return Boolean(standalone && portraitPhone);
}

function getStandalonePlaybackMinTop() {
    if (!isStandalonePortraitPhoneLayout()) {
        return 6;
    }
    const rawTop = getComputedStyle(document.documentElement)
        .getPropertyValue("--top-playback-top")
        .trim();
    const firstLength = Number.parseFloat(rawTop.match(/-?\d+(\.\d+)?/)?.[0] || "");
    return Number.isFinite(firstLength) ? Math.max(48, firstLength) : 62;
}

function positionInfoPanel() {
    fitControlsLayout();
    applyAlbumInfoLayoutPreference();

    const coverMetrics = getCenterCoverMetrics();
    if (Math.abs(coverMetrics.offsetY - coverMetrics.defaultOffsetY) > 0.01) {
        setNaviGlassPlayerOffsetY(coverMetrics.defaultOffsetY);
    }

    let projectedBounds = getProjectedCenterCoverBounds();
    let measuredBounds = getActiveCoverBounds();
    let coverBounds = projectedBounds || measuredBounds;

    if (!coverBounds) {
        elements.playbackStrip.style.removeProperty("left");
        elements.playbackStrip.style.removeProperty("top");
        elements.playbackStrip.style.removeProperty("width");
        elements.playbackStrip.style.removeProperty("max-width");
        elements.searchPanel.style.removeProperty("left");
        elements.searchPanel.style.removeProperty("width");
        elements.searchPanel.style.removeProperty("max-width");
        activeCoverHitBox = null;
        elements.songsDrawer.style.width = "0px";
        elements.songsDrawer.style.height = "0px";
        elements.songsDrawerBackdrop.style.width = "0px";
        elements.songsDrawerBackdrop.style.height = "0px";
        elements.songInfoModal.style.width = "0px";
        elements.songInfoModal.style.height = "0px";
        return;
    }

    const containerRect = elements.container.getBoundingClientRect();
    const controlsTop = getControlsSurfaceTop();
    const controlsTopLocal = controlsTop - containerRect.top;
    let coverWidthPx = 0;
    let coverHeightPx = 0;

    const syncCoverChrome = () => {
        coverWidthPx = Math.min(
            elements.container.clientWidth * 0.9,
            Math.max(0, Math.round(coverBounds.width))
        );
        coverHeightPx = Math.max(0, Math.round(coverBounds.height));
        fitPlaybackStripLayout(coverWidthPx, coverHeightPx);

        const playbackInsetX = clamp(Math.round(coverWidthPx * 0.04), 8, 18);
        const playbackWidthPx = Math.max(0, coverWidthPx - playbackInsetX * 2);
        elements.playbackStrip.style.left = `${Math.round(coverBounds.centerX)}px`;
        elements.playbackStrip.style.width = `${playbackWidthPx}px`;
        elements.playbackStrip.style.maxWidth = `${playbackWidthPx}px`;
        elements.searchPanel.style.left = `${Math.round(coverBounds.centerX)}px`;
        elements.searchPanel.style.width = `${coverWidthPx}px`;
        elements.searchPanel.style.maxWidth = `${coverWidthPx}px`;

        const playbackGap = clamp(Math.round(coverHeightPx * 0.015), 2, 6);
        const playbackHeightPx = Math.max(
            0,
            Math.round(elements.playbackStrip.getBoundingClientRect().height || elements.playbackStrip.offsetHeight || 0)
        );
        const playbackTop = Math.max(
            getStandalonePlaybackMinTop(),
            Math.round(coverBounds.top - playbackHeightPx - playbackGap)
        );
        elements.playbackStrip.style.top = `${playbackTop}px`;
        elements.infoPanel.style.bottom = "auto";
        elements.infoPanel.style.width = `${coverWidthPx}px`;
        elements.infoPanel.style.maxWidth = `${coverWidthPx}px`;
        return playbackTop;
    };

    let playbackTop = syncCoverChrome();

    // Iteratively shift naviglassplayer upward so the playback strip sits near the top
    const desiredTopMargin = Math.max(
        getStandalonePlaybackMinTop(),
        clamp(Math.round(coverHeightPx * 0.015), 4, 10)
    );
    for (let pass = 0; pass < 3; pass++) {
        const excess = playbackTop - desiredTopMargin;
        if (excess <= 3) break;
        const curOffset = getCenterCoverMetrics().offsetY;
        const probe = 10;
        const y1 = worldToScreenY(curOffset);
        const y2 = worldToScreenY(curOffset + probe);
        if (y1 == null || y2 == null || Math.abs(y1 - y2) < 0.1) break;
        const pxPerUnit = Math.abs(y1 - y2) / probe;
        const worldShift = excess / pxPerUnit;
        if (!setNaviGlassPlayerOffsetY(curOffset + worldShift)) break;
        projectedBounds = getProjectedCenterCoverBounds();
        measuredBounds = getActiveCoverBounds();
        coverBounds = projectedBounds || measuredBounds || coverBounds;
        playbackTop = syncCoverChrome();
    }

    // On very short viewports, preserve a minimum readable band for the
    // album-info panel by lifting the whole cover block a little more
    // instead of shrinking the text into illegibility.
    const viewportHeight = window.innerHeight || document.documentElement.clientHeight || 480;
    const minReadableInfoHeight = clamp(Math.round(viewportHeight * 0.065), 21, 30);
    for (let pass = 0; pass < 2; pass += 1) {
        const infoPanelGap = clamp(Math.round(coverHeightPx * 0.006), 1, 3);
        const infoBottomMargin = clamp(Math.round(coverHeightPx * 0.012), 2, 6);
        const minInfoTop = Math.round(coverBounds.bottom + infoPanelGap);
        const availableInfoHeight = Math.max(
            0,
            Math.floor(controlsTopLocal - minInfoTop - infoBottomMargin)
        );
        const shortage = minReadableInfoHeight - availableInfoHeight;
        const maxExtraLift = Math.max(0, playbackTop - 1);
        if (shortage <= 0 || maxExtraLift <= 0.5) {
            break;
        }
        const liftPx = Math.min(shortage, maxExtraLift);
        const curOffset = getCenterCoverMetrics().offsetY;
        const probe = 10;
        const y1 = worldToScreenY(curOffset);
        const y2 = worldToScreenY(curOffset + probe);
        if (y1 == null || y2 == null || Math.abs(y1 - y2) < 0.1) {
            break;
        }
        const pxPerUnit = Math.abs(y1 - y2) / probe;
        const worldShift = liftPx / pxPerUnit;
        if (!setNaviGlassPlayerOffsetY(curOffset + worldShift)) {
            break;
        }
        projectedBounds = getProjectedCenterCoverBounds();
        measuredBounds = getActiveCoverBounds();
        coverBounds = projectedBounds || measuredBounds || coverBounds;
        playbackTop = syncCoverChrome();
    }

    const infoPanelGap = clamp(Math.round(coverHeightPx * 0.006), 1, 3);
    const infoBottomMargin = clamp(Math.round(coverHeightPx * 0.012), 2, 6);
    const minInfoTop = Math.round(coverBounds.bottom + infoPanelGap);
    const fullscreenActive = Boolean(getFullscreenElement()) || state.playerFullscreen;
    const containerHeight = elements.container.clientHeight || window.innerHeight || 0;
    const availableInfoHeight = Math.max(
        0,
        Math.floor((fullscreenActive ? containerHeight : controlsTopLocal) - minInfoTop - infoBottomMargin)
    );

    if (!fullscreenActive && availableInfoHeight < 10) {
        elements.infoPanel.style.display = "none";
    } else {
        elements.infoPanel.style.display = "";
        const infoLayout = fitInfoPanelTypography(coverWidthPx, availableInfoHeight);
        const isPortraitTouchLayout = Boolean(
            window.matchMedia?.("(hover: none) and (pointer: coarse) and (max-width: 767px) and (orientation: portrait)")?.matches
        );
        const isTabletPortraitTouchLayout = Boolean(
            window.matchMedia?.("(min-width: 700px) and (max-width: 1180px) and (orientation: portrait)")?.matches
        );
        const isLandscapeTouchLayout = Boolean(
            window.matchMedia?.("(hover: none) and (pointer: coarse) and (max-width: 932px) and (orientation: landscape)")?.matches
        );
        const maxVisibleInfoTop = Math.max(
            0,
            Math.floor(containerHeight - infoLayout.height - infoBottomMargin)
        );
        let infoTop;
        if (fullscreenActive) {
            const nearCoverGap = clamp(Math.round(coverHeightPx * 0.018), 4, 14);
            infoTop = Math.min(minInfoTop + nearCoverGap, maxVisibleInfoTop);
        } else if (isPortraitTouchLayout || isTabletPortraitTouchLayout || isLandscapeTouchLayout) {
            const nearCoverGap = clamp(Math.round(coverHeightPx * 0.01), 2, 5);
            const nearCoverTop = Math.round(coverBounds.bottom + nearCoverGap);
            const maxInfoTop = Math.max(
                minInfoTop,
                Math.floor(controlsTopLocal - infoBottomMargin - infoLayout.height)
            );
            infoTop = Math.min(maxInfoTop, Math.max(minInfoTop, nearCoverTop));
        } else {
            const desiredBottomGap = clamp(Math.round(coverHeightPx * 0.012), 4, 8);
            const preferredInfoTop = Math.floor(
                controlsTopLocal -
                infoBottomMargin -
                infoLayout.height -
                desiredBottomGap
            );
            infoTop = Math.max(minInfoTop, preferredInfoTop);
        }
        elements.infoPanel.style.top = `${Math.max(0, infoTop)}px`;
    }

    activeCoverHitBox = {
        left: Math.round(coverBounds.left),
        right: Math.round(coverBounds.right),
        top: Math.round(coverBounds.top),
        bottom: Math.round(coverBounds.bottom),
    };

    const drawerLeft = Math.round(activeCoverHitBox.left);
    const drawerTop = Math.round(activeCoverHitBox.top);
    const drawerWidth = Math.max(0, Math.round(activeCoverHitBox.right - activeCoverHitBox.left));
    const drawerHeight = Math.max(0, Math.round(activeCoverHitBox.bottom - activeCoverHitBox.top));
    fitDrawerTypography(drawerWidth, drawerHeight);

    elements.songsDrawer.style.left = `${drawerLeft}px`;
    elements.songsDrawer.style.top = `${drawerTop}px`;
    elements.songsDrawer.style.width = `${drawerWidth}px`;
    elements.songsDrawer.style.height = `${drawerHeight}px`;
    elements.songsDrawer.style.maxWidth = `${drawerWidth}px`;
    elements.songsDrawer.style.maxHeight = `${drawerHeight}px`;

    elements.songsDrawerBackdrop.style.left = `${drawerLeft}px`;
    elements.songsDrawerBackdrop.style.top = `${drawerTop}px`;
    elements.songsDrawerBackdrop.style.width = `${drawerWidth}px`;
    elements.songsDrawerBackdrop.style.height = `${drawerHeight}px`;

    elements.songInfoModal.style.left = `${drawerLeft}px`;
    elements.songInfoModal.style.top = `${drawerTop}px`;
    elements.songInfoModal.style.width = `${drawerWidth}px`;
    elements.songInfoModal.style.height = `${drawerHeight}px`;
    elements.songInfoCard.style.width = `${drawerWidth}px`;
    elements.songInfoCard.style.height = `${drawerHeight}px`;
}

function renderSongsDrawer() {
    const context = state.drawerContext;
    const items = context.items || [];
    elements.songsDrawerEyebrow.textContent = context.loading ? "Loading..." : "Tracks";
    elements.songsDrawerTitle.textContent = context.title || "Songs";
    elements.songsDrawerSubtitle.textContent = context.subtitle || "\u00A0";
    elements.songsDrawerCount.textContent = context.loading ? "..." : formatCount(items.length, "song");
    const hasAlbumContext = Boolean(context.albumId);
    elements.btnDrawerFavourite.classList.toggle("hidden", !hasAlbumContext);
    elements.btnDrawerFavourite.classList.toggle("is-active", hasAlbumContext && Boolean(context.albumStarred));
    elements.btnDrawerFavourite.setAttribute(
        "aria-label",
        hasAlbumContext && context.albumStarred ? "Remove album favourite" : "Favourite album"
    );
    elements.btnDrawerFavourite.setAttribute(
        "title",
        hasAlbumContext && context.albumStarred ? "Remove album favourite" : "Favourite album"
    );
    elements.drawerFavouriteIconPath.setAttribute(
        "d",
        hasAlbumContext && context.albumStarred ? HEART_ICON_FILLED_PATH : HEART_ICON_OUTLINE_PATH
    );

    if (state.infoTrackIndex != null && !items[state.infoTrackIndex]) {
        hideSongInfo();
    }
    if (state.activeSongMenuIndex != null && !items[state.activeSongMenuIndex]) {
        state.activeSongMenuIndex = null;
        state.activeSongMenuMode = "actions";
    }

    if (context.loading) {
        elements.songsTableBody.innerHTML = `
            <tr class="songs-empty-row">
                <td colspan="4">Loading songs…</td>
            </tr>
        `;
        return;
    }

    if (!items.length) {
        elements.songsTableBody.innerHTML = `
            <tr class="songs-empty-row">
                <td colspan="4">No songs available for this view yet.</td>
            </tr>
        `;
        return;
    }

    elements.songsTableBody.innerHTML = items
        .map(({ track, index }, rowIndex) => {
            const title = track?.title || "Unknown Title";
            const rowAlbumMatchesHeader = normalizeIdentityText(track?.album) &&
                normalizeIdentityText(track?.album) === normalizeIdentityText(context.title);
            const subtitle = escapeHtml([
                track?.artist,
                rowAlbumMatchesHeader ? "" : track?.album,
            ].filter(Boolean).join("  ·  "));
            const isCurrent = track?.id && state.currentTrack?.id === track.id;
            const menuOpen = state.activeSongMenuIndex === rowIndex;
            const playlistPickerOpen = menuOpen && state.activeSongMenuMode === "playlist-picker";
            const canRemoveFromPlaylist = Boolean(state.drawerContext.playlistId);
            const subject = { type: "song", track };
            const displayNr = track?.trackNo || index + 1;
            const currentStatusLabel = playbackState.playing ? "Now playing" : "Current track";
            const rowNumberHtml = isCurrent
                ? `
                    <span class="song-current-marker ${playbackState.playing ? "is-playing" : "is-paused"}"
                          aria-label="${currentStatusLabel}"
                          title="${currentStatusLabel}">
                        <span></span>
                        <span></span>
                        <span></span>
                    </span>
                `
                : escapeHtml(String(displayNr));
            const menuHtml = `
                <div class="song-context-menu${playlistPickerOpen ? " is-playlist-picker" : ""}">
                    ${renderSharedActionMenuContent(subject, {
                        mode: state.activeSongMenuMode,
                        actionAttr: "data-action",
                        backAction: "back-song-menu",
                        rowIndex,
                        canRemoveFromContext: canRemoveFromPlaylist,
                    })}
                </div>
            `;

            return `
                <tr class="${[isCurrent ? "is-current" : "", menuOpen ? "is-menu-open" : ""].filter(Boolean).join(" ")}" ${isCurrent ? 'aria-current="true"' : ""}>
                    <td class="song-row-nr">${rowNumberHtml}</td>
                    <td class="song-row-title-cell">
                        <button class="song-row-title-wrap" data-action="play-song" data-index="${rowIndex}">
                            <span class="song-row-title">${escapeHtml(title)}</span>
                            <span class="song-row-subtitle">${subtitle || "&nbsp;"}</span>
                        </button>
                    </td>
                    <td class="song-row-duration">${track?.duration ? formatClock(track.duration) : "--:--"}</td>
                    <td class="song-row-actions ${menuOpen ? "is-menu-open" : ""}">
                        <button class="song-menu-btn" data-action="toggle-song-menu" data-index="${rowIndex}" aria-label="Song actions">
                            <svg viewBox="0 0 24 24" width="18" height="18" aria-hidden="true">
                                <path fill="currentColor" d="M12 7a2 2 0 1 0 0-4 2 2 0 0 0 0 4zm0 7a2 2 0 1 0 0-4 2 2 0 0 0 0 4zm0 7a2 2 0 1 0 0-4 2 2 0 0 0 0 4z"/>
                            </svg>
                        </button>
                        ${
                            menuOpen
                                ? menuHtml
                                : ""
                        }
                    </td>
                </tr>
            `;
        })
        .join("");
}

function buildSongInfoRows(track, index) {
    if (track?.kind === "radio") {
        const rows = [
            ["Nr", index + 1],
            ["Station", track?.title || "Untitled Station"],
            ["Type", "Internet radio"],
            ["Codec", track?.suffix ? String(track.suffix).toUpperCase() : "Unknown"],
            ["Bitrate", track?.bitRate ? formatBitrate(track.bitRate) : "Unknown"],
            ["Genre", track?.genre || "Unknown"],
            ["Home page", track?.homePageUrl || "Unavailable"],
            ["Stream", track?.streamUrl || track?.file || "Unavailable"],
            ["ID", track?.id || "Unavailable"],
        ];
        return rows
            .filter(([, value]) => value !== "" && value != null)
            .map(
                ([label, value]) => `
                    <div class="song-info-label">${escapeHtml(label)}</div>
                    <div class="song-info-value">${escapeHtml(value)}</div>
                `
            )
            .join("");
    }

    const rows = [
        ["Nr", index + 1],
        ["Title", track?.title || "Unknown Title"],
        ["Artist", track?.artist || "Unknown Artist"],
        ["Composer", track?.composer || "Unknown"],
        ["Album", track?.album || "Unknown Album"],
        ["Duration", track?.duration ? formatClock(track.duration) : "Unknown"],
        ["Codec", track?.suffix ? String(track.suffix).toUpperCase() : "Unknown"],
        ["Bitrate", track?.bitRate ? formatBitrate(track.bitRate) : "Unknown"],
        ["Genre", track?.genre || "Unknown"],
        ["Date", track?.year || "Unknown"],
        ["Path", track?.file || "Unavailable"],
    ];

    return rows
        .filter(([, value]) => value !== "" && value != null)
        .map(
            ([label, value]) => `
                <div class="song-info-label">${escapeHtml(label)}</div>
                <div class="song-info-value">${escapeHtml(value)}</div>
            `
        )
        .join("");
}

function buildAlbumInfoRows(album) {
    const composers = [...new Set(
        ensureArray(album?.tracks)
            .map((track) => track?.composer)
            .filter(Boolean)
    )].join(", ");
    const rows = [
        ["Title", album?.title || "Untitled Album"],
        ["Artist", album?.artist || "Unknown Artist"],
        ["Composer", composers || "Unknown"],
        ["Songs", album?.tracks?.length || album?.songCount || "Unknown"],
        ["Duration", album?.duration ? formatClock(album.duration, album.duration >= 3600) : "Unknown"],
        ["Genre", album?.genre || "Unknown"],
        ["Date", album?.year || "Unknown"],
    ];

    return rows
        .filter(([, value]) => value !== "" && value != null)
        .map(
            ([label, value]) => `
                <div class="song-info-label">${escapeHtml(label)}</div>
                <div class="song-info-value">${escapeHtml(value)}</div>
            `
        )
        .join("");
}

async function resolveAlbumInfoDetails(albumEntry) {
    const albumIds = Array.isArray(albumEntry?.groupAlbumIds)
        ? albumEntry.groupAlbumIds.filter(Boolean)
        : [];

    if (albumIds.length) {
        const albums = (await Promise.all(
            albumIds.map((albumId) => ensureAlbumDetails(albumId).catch(() => null))
        )).filter(Boolean);
        const tracks = albums.flatMap((album) => album.tracks || []);
        const years = [...new Set(albums.map((album) => album.year).filter(Boolean))];
        const genres = [...new Set(albums.map((album) => album.genre).filter(Boolean))];
        return {
            ...albumEntry,
            title: albumEntry.title || albums[0]?.title || "Album Info",
            artist: albumEntry.artist || albums[0]?.artist || "",
            year: years.length > 1 ? `${years[0]}-${years[years.length - 1]}` : years[0] || albumEntry.year || "",
            genre: genres.join(", ") || albumEntry.genre || "",
            duration: albums.reduce((total, album) => total + Number(album.duration || 0), 0),
            songCount: tracks.length || albumEntry.songCount,
            tracks,
        };
    }

    if (Array.isArray(albumEntry?.groupTracks)) {
        return {
            ...albumEntry,
            tracks: albumEntry.groupTracks,
            songCount: albumEntry.groupTracks.length,
            duration: albumEntry.groupTracks.reduce((total, track) => total + Number(track.duration || 0), 0),
        };
    }

    const albumId = albumEntry?.id || albumEntry?.albumId;
    if (albumId) {
        try {
            return await ensureAlbumDetails(albumId);
        } catch (error) {
            console.warn("Unable to load album details", error);
        }
    }

    return albumEntry || { title: "Album Info" };
}

function hideSongInfo() {
    state.infoTrackIndex = null;
    elements.songInfoModal.classList.add("hidden");
    elements.songInfoModal.setAttribute("aria-hidden", "true");
}

function openSharedInfoModal({ eyebrow, title, contentHtml, infoTrackIndex = null }) {
    if (state.searchOpen) {
        setSearchOpen(false);
    }
    state.activeDropdown = null;
    state.activeRadioSearchMenuIndex = null;
    state.infoTrackIndex = infoTrackIndex;
    state.activeSongMenuIndex = null;
    state.activeInfoMenuMode = "closed";
    state.activeInfoMenuSubject = null;
    elements.songInfoEyebrow.textContent = eyebrow;
    elements.songInfoTitle.textContent = title;
    elements.songInfoContent.innerHTML = `<div class="song-info-grid">${contentHtml}</div>`;
    elements.songInfoModal.classList.remove("hidden");
    elements.songInfoModal.setAttribute("aria-hidden", "false");
    positionInfoPanel();
    requestAnimationFrame(positionInfoPanel);
    renderSongsDrawer();
    renderInfoActionMenu();
}

function showSongInfoForTrack(track, index = 0) {
    if (!track) {
        return;
    }
    openSharedInfoModal({
        eyebrow: "Track Details",
        title: "More Info",
        contentHtml: buildSongInfoRows(track, index),
        infoTrackIndex: index,
    });
}

function showSongInfo(index) {
    const item = state.drawerContext.items[index];
    showSongInfoForTrack(item?.track, index);
}

async function showAlbumInfo(albumEntry) {
    const album = await resolveAlbumInfoDetails(albumEntry);
    openSharedInfoModal({
        eyebrow: "Album Details",
        title: album.title || "Album Info",
        contentHtml: buildAlbumInfoRows(album),
    });
}

async function showMoreInfoForSubject(subject, index = 0) {
    if (!subject) {
        return;
    }
    if (subject.type === "album") {
        await showAlbumInfo(subject.entry);
        return;
    }
    showSongInfoForTrack(subject.track, Math.max(0, index));
}

async function setSongsDrawerOpen(open) {
    state.drawerOpen = open;
    if (open) {
        state.activeDropdown = null;
        await ensureDrawerContext();
    } else {
        state.activeSongMenuIndex = null;
        state.activeSongMenuMode = "actions";
        hideSongInfo();
    }
    elements.songsDrawer.classList.toggle("is-open", open);
    elements.songsDrawerBackdrop.classList.toggle("is-open", open);
    elements.songsDrawer.setAttribute("aria-hidden", String(!open));
    renderBrowseMenus();
    renderSongsDrawer();
}

function canWheelScrollElement(element, deltaY) {
    if (!element || Math.abs(deltaY) < 0.5) {
        return false;
    }
    const maxScrollTop = element.scrollHeight - element.clientHeight;
    if (maxScrollTop <= 1) {
        return false;
    }
    if (deltaY < 0) {
        return element.scrollTop > 1;
    }
    return element.scrollTop < maxScrollTop - 1;
}

function canWheelScrollElementX(element, deltaX) {
    if (!element || Math.abs(deltaX) < 0.5) {
        return false;
    }
    const maxScrollLeft = element.scrollWidth - element.clientWidth;
    if (maxScrollLeft <= 1) {
        return false;
    }
    if (deltaX < 0) {
        return element.scrollLeft > 1;
    }
    return element.scrollLeft < maxScrollLeft - 1;
}

function normalizedWheelStep(event) {
    const dominantDelta = Math.abs(event.deltaX) > Math.abs(event.deltaY) ? event.deltaX : event.deltaY;
    if (!Number.isFinite(dominantDelta) || dominantDelta === 0) {
        return 0;
    }

    let scale = 0.018;
    if (event.deltaMode === WheelEvent.DOM_DELTA_LINE) {
        scale = 0.12;
    } else if (event.deltaMode === WheelEvent.DOM_DELTA_PAGE) {
        scale = 1.2;
    }

    return clamp(dominantDelta * scale, -1.2, 1.2);
}

function isCoverCanvasTarget(target) {
    return target?.tagName === "CANVAS";
}

function isInteractiveTouchTarget(target) {
    return Boolean(
        target?.closest?.(
            [
                "#songs-drawer",
                "#songs-drawer-backdrop",
                "#song-info-modal",
                "#connect-modal",
                "#search-panel",
                "#controls",
                "#playback-strip",
                "#browse-bar",
                ".browse-dropdown",
                ".volume-popover",
                "button",
                "input",
                "select",
                "textarea",
                "a",
                "[data-action]"
            ].join(",")
        )
    );
}

function isCoverGestureTarget(target) {
    return isCoverCanvasTarget(target) && !isInteractiveTouchTarget(target);
}

function isPointInsideActiveCover(clientX, clientY) {
    if (!activeCoverHitBox) {
        return false;
    }
    const rect = elements.container.getBoundingClientRect();
    const localX = clientX - rect.left;
    const localY = clientY - rect.top;
    return (
        localX >= activeCoverHitBox.left &&
        localX <= activeCoverHitBox.right &&
        localY >= activeCoverHitBox.top &&
        localY <= activeCoverHitBox.bottom
    );
}

function tryOpenDrawerFromCover(target, clientX, clientY) {
    if (state.drawerOpen) {
        return false;
    }
    if (!isCoverCanvasTarget(target)) {
        return false;
    }
    if (!isPointInsideActiveCover(clientX, clientY)) {
        return false;
    }
    setSongsDrawerOpen(true);
    return true;
}

function handleCoverSurfaceTap(target, clientX, clientY) {
    if (!isCoverGestureTarget(target) || !activeCoverHitBox) {
        return false;
    }

    const rect = elements.container.getBoundingClientRect();
    const localX = clientX - rect.left;
    const coverWidth = Math.max(1, activeCoverHitBox.right - activeCoverHitBox.left);
    const coverCenterX = (activeCoverHitBox.left + activeCoverHitBox.right) / 2;
    const centerZoneHalf = coverWidth * 0.55;
    const isCenterZone = Math.abs(localX - coverCenterX) <= centerZoneHalf;

    if (isCenterZone) {
        setSongsDrawerOpen(!state.drawerOpen);
        return true;
    }

    if (state.drawerOpen) {
        return true;
    }

    navigateBrowseBy(localX < coverCenterX ? -1 : 1);
    return true;
}

function coverSwipeStepCount(dx, dt) {
    const viewportWidth = Math.max(
        1,
        elements.container.clientWidth || window.innerWidth || document.documentElement.clientWidth || 1
    );
    const distance = Math.abs(dx);
    const duration = Math.max(1, dt || 1);
    const velocity = distance / duration;
    const distanceSteps = Math.max(1, Math.round(distance / Math.max(42, viewportWidth * 0.16)));
    const velocityBoost = velocity > 1.8 ? 2 : velocity > 1.1 ? 1 : 0;
    return clamp(distanceSteps + velocityBoost, 1, 6);
}

function handleCoverSurfaceSwipe(dx, dt) {
    const direction = dx > 0 ? -1 : 1;
    navigateBrowseBy(direction * coverSwipeStepCount(dx, dt));
}

function coverDragStepThreshold() {
    const viewportWidth = Math.max(
        1,
        elements.container.clientWidth || window.innerWidth || document.documentElement.clientWidth || 1
    );
    return Math.max(34, viewportWidth * 0.1);
}

function setConnectModalOpen(open) {
    elements.connectModal.classList.toggle("hidden", !open);
    elements.connectModal.setAttribute("aria-hidden", String(!open));
    setConnectPasswordVisible(false);
    if (!open) {
        return;
    }
    elements.connectUrlInput.value = state.settings.serverUrl;
    elements.connectUsernameInput.value = state.settings.username;
    elements.connectPasswordInput.value = state.settings.password;
    elements.connectHelper.textContent =
        "The app connects through the local proxy and uses your Navidrome app credentials.";
    requestAnimationFrame(() => elements.connectUrlInput.focus());
}

function setConnectPasswordVisible(visible) {
    const passwordVisible = Boolean(visible);
    elements.connectPasswordInput.type = passwordVisible ? "text" : "password";
    elements.btnConnectPasswordToggle.textContent = passwordVisible ? "Hide" : "Show";
    elements.btnConnectPasswordToggle.setAttribute(
        "aria-label",
        passwordVisible ? "Hide password" : "Show password"
    );
    elements.btnConnectPasswordToggle.setAttribute("aria-pressed", String(passwordVisible));
}

function showConnectError(message) {
    setConnectModalOpen(true);
    elements.connectHelper.textContent = message;
}

async function handleConnectAction() {
    state.settings.serverUrl = normalizeServerUrl(elements.connectUrlInput.value);
    state.settings.username = elements.connectUsernameInput.value.trim();
    state.settings.password = elements.connectPasswordInput.value;
    saveSettings();
    elements.connectHelper.textContent = `Connecting to ${state.settings.serverUrl}…`;
    try {
        await connect({ onAuthenticated: () => setConnectModalOpen(false) });
    } catch (error) {
        console.error(error);
        showConnectError(error.message || "Could not connect to Navidrome.");
    }
}

function selectedArtistOption() {
    const selectedName = String(state.settings.selectedArtistName || "").toLocaleLowerCase();
    return state.artistOptions.find((artist) => artist.id === state.settings.selectedArtistId) ||
        (selectedName ? state.artistOptions.find((artist) => artist.title.toLocaleLowerCase() === selectedName) : null) ||
        null;
}

function selectedPlaylistOption() {
    return state.playlistOptions.find((playlist) => playlist.id === state.settings.selectedPlaylistId) || null;
}

function keyForTrackInCurrentMode(track) {
    if (!track) {
        return null;
    }

    switch (state.browseMode) {
        case BROWSE_MODE.SONGS:
            return browseEntries.find((entry) =>
                entry.id === track.id ||
                entry.id === track.albumId ||
                entry.groupTracks?.some((groupTrack) => groupTrack.id === track.id)
            )?.key || null;
        case BROWSE_MODE.ARTIST: {
            const selectedArtist = selectedArtistOption();
            if (!selectedArtist || selectedArtist.value !== track.artist) {
                return null;
            }
            return browseEntries.find((entry) => entry.id === track.id)?.key || null;
        }
        case BROWSE_MODE.COMPOSER:
            if (!state.settings.selectedComposer || !String(track.composer || "")
                .split(/[;,]/)
                .map((name) => name.trim().toLocaleLowerCase())
                .includes(state.settings.selectedComposer.toLocaleLowerCase())) {
                return null;
            }
            return browseEntries.find((entry) =>
                entry.id === track.id ||
                entry.id === track.albumId ||
                entry.groupTracks?.some((groupTrack) => groupTrack.id === track.id)
            )?.key || null;
        case BROWSE_MODE.PLAYLIST:
            return browseEntries.find((entry) =>
                entry.id === track.id ||
                entry.id === track.albumId ||
                entry.groupTracks?.some((groupTrack) => groupTrack.id === track.id)
            )?.key || null;
        case BROWSE_MODE.SEARCH:
            return browseEntries.find((entry) =>
                entry.kind === "song" && entry.id === track.id ||
                entry.kind === "album" && entry.id === track.albumId
            )?.key || null;
        case BROWSE_MODE.STARRED:
        case BROWSE_MODE.RADIO:
            return browseEntries.find((entry) => entry.id === track.id)?.key || null;
        case BROWSE_MODE.YEAR:
        case BROWSE_MODE.GENRE:
        case BROWSE_MODE.RATING:
        case BROWSE_MODE.ALBUM:
        default:
            return browseEntries.find((entry) =>
                entry.kind === "album" &&
                (entry.id === track.albumId || entry.groupAlbumIds?.includes(track.albumId))
            )?.key || null;
    }
}

function currentBrowseIndexForPlaybackTrack(track) {
    const entryKey = keyForTrackInCurrentMode(track);
    if (entryKey) {
        const keyedIndex = browseEntries.findIndex((entry) => entry.key === entryKey);
        if (keyedIndex >= 0) {
            return keyedIndex;
        }
    }

    if (state.activeEntryKey) {
        const activeIndex = browseEntries.findIndex((entry) => entry.key === state.activeEntryKey);
        if (activeIndex >= 0) {
            return activeIndex;
        }
    }

    if (browseEntries[state.browseIndex]) {
        return state.browseIndex;
    }

    return -1;
}

function hasAdjacentBrowseEntry(track, direction) {
    if (!track || !browseEntries.length) {
        return false;
    }

    const currentIndex = currentBrowseIndexForPlaybackTrack(track);
    if (currentIndex < 0) {
        return false;
    }

    const step = direction < 0 ? -1 : 1;
    for (
        let nextIndex = currentIndex + step;
        nextIndex >= 0 && nextIndex < browseEntries.length;
        nextIndex += step
    ) {
        if (browseEntries[nextIndex]) {
            return true;
        }
    }

    return false;
}

async function playAdjacentBrowseEntry(track, direction) {
    if (!track || !browseEntries.length) {
        return false;
    }

    const currentIndex = currentBrowseIndexForPlaybackTrack(track);
    if (currentIndex < 0) {
        return false;
    }

    const step = direction < 0 ? -1 : 1;

    for (
        let nextIndex = currentIndex + step;
        nextIndex >= 0 && nextIndex < browseEntries.length;
        nextIndex += step
    ) {
        const nextEntry = browseEntries[nextIndex];
        if (!nextEntry) {
            continue;
        }
        await ensureTextureAtIndex(nextIndex);
        const context = await getPlaybackContextForEntry(nextEntry);
        if (!context.tracks.length) {
            continue;
        }
        const targetIndex = direction < 0
            ? Math.max(0, context.tracks.length - 1)
            : clamp(context.startIndex, 0, Math.max(0, context.tracks.length - 1));
        await playTrackList(context.tracks, targetIndex, context.key);
        return true;
    }

    return false;
}

function syncBrowseToTrack(track) {
    const entryKey = keyForTrackInCurrentMode(track);
    if (!entryKey) {
        return;
    }
    const nextIndex = browseEntries.findIndex((entry) => entry.key === entryKey);
    if (nextIndex < 0) {
        return;
    }

    // Let the naviglassplayer finish scrolling before we commit the new centered
    // entry in app state. Otherwise the info panel/slider jump early and the
    // art change feels like a teleport instead of a proper glide.
    ensureTextures(nextIndex);

    if (nextIndex === state.browseIndex) {
        state.activeEntryKey = browseEntries[nextIndex]?.key || null;
        updateUI();
        positionInfoPanel();
        return;
    }

    navigateTo(nextIndex);
}

function animateBrowseBackToTrack(track) {
    const entryKey = keyForTrackInCurrentMode(track);
    if (!entryKey) {
        return;
    }
    const targetIndex = browseEntries.findIndex((entry) => entry.key === entryKey);
    if (targetIndex < 0) {
        return;
    }
    ensureTextures(targetIndex);
    navigateTo(targetIndex);
}

function updateNowPlayingMeta(track) {
    if (!track) {
        playbackState.title = "";
        playbackState.artist = "";
        playbackState.album = "";
        playbackState.qualityPrimary = "Streaming from Navidrome";
        playbackState.qualitySecondary = "Browser playback";
        return;
    }

    playbackState.title = track.title;
    playbackState.artist = track.artist;
    playbackState.album = track.album;
    const primaryParts = [];
    if (track.suffix) {
        primaryParts.push(String(track.suffix).toUpperCase());
    }
    if (track.bitRate && track.kind !== "radio") {
        primaryParts.push(formatBitrate(track.bitRate));
    }
    if (track.duration) {
        primaryParts.push(formatClock(track.duration));
    }
    playbackState.qualityPrimary = primaryParts.join("  ·  ") || (track.kind === "radio" ? "Internet radio" : "Streaming from Navidrome");
    playbackState.qualitySecondary = track.kind === "radio"
        ? pickText(track.homePageUrl, "Live stream")
        : [track.album, track.year].filter(Boolean).join("  ·  ") || "Browser playback";
}

async function getPlaybackContextForEntry(entry) {
    if (!entry) {
        return { key: "", tracks: [], startIndex: 0 };
    }

    const context = await getDrawerContextForEntry(entry);
    const tracks = context.items.map((item) => item.track).filter((track) => Boolean(track?.id || track?.streamUrl));

    let startIndex = 0;
    if (entry.kind === "song" && entry.id) {
        const locatedIndex = tracks.findIndex((track) => track.id === entry.id);
        startIndex = locatedIndex >= 0 ? locatedIndex : 0;
    }

    return {
        key: context.key || entry.key,
        tracks,
        startIndex,
    };
}

async function playTrackList(tracks, index, queueKey) {
    const validTracks = tracks.filter((track) => Boolean(track?.id || track?.streamUrl));
    if (!validTracks.length) {
        flashStatus("No playable tracks found.", 2200);
        return;
    }

    state.playbackQueue = validTracks;
    state.playbackQueueKey = queueKey || validTracks[0].albumId || validTracks[0].id;
    state.playbackIndex = clamp(index, 0, validTracks.length - 1);
    state.currentTrack = validTracks[state.playbackIndex];
    state.currentAlbumId = state.currentTrack.albumId || "";
    updateNowPlayingMeta(state.currentTrack);
    playbackState.elapsed = 0;
    playbackState.duration = state.currentTrack.duration || 0;
    playbackState.timelineUpdatedAt = Date.now();

    elements.audioPlayer.src = playbackUrl(state.currentTrack);
    elements.audioPlayer.load();

    try {
        await elements.audioPlayer.play();
    } catch (error) {
        if (error?.name === "AbortError") {
            // Benign: play() was superseded by a newer pause()/load(), e.g. user clicked another track quickly.
        } else {
            console.error(error);
            flashStatus("Browser playback was blocked.", 2200);
        }
    }

    syncBrowseToTrack(state.currentTrack);
    updateUI();
}

async function cmdPlayPause() {
    // If a track is already loaded, toggle audio play/pause regardless of
    // what's currently centered in the naviglassplayer. This prevents the button
    // from accidentally starting a new track when the user browsed away.
    if (state.currentTrack && elements.audioPlayer.src) {
        if (elements.audioPlayer.paused) {
            await elements.audioPlayer.play().catch((error) => {
                if (error?.name !== "AbortError") {
                    flashStatus("Browser playback was blocked.", 2200);
                }
            });
        } else {
            elements.audioPlayer.pause();
        }
        return;
    }

    // Nothing playing yet — start playback of the currently centered entry.
    const entry = getCurrentBrowseEntry();
    if (!entry) {
        return;
    }
    const context = await getPlaybackContextForEntry(entry);
    if (!context.tracks.length) {
        flashStatus("No tracks available for this item.", 2200);
        return;
    }

    await playTrackList(context.tracks, context.startIndex, context.key);
    if (state.drawerOpen) {
        setSongsDrawerOpen(false);
    }
}

function isEntryCurrentlyPlaying(entry) {
    if (!entry || !state.currentTrack) {
        return false;
    }

    if (entry.kind === "album") {
        return entry.id === state.currentTrack.albumId;
    }

    if (entry.kind === "radio") {
        return entry.id === state.currentTrack.id || entry.streamUrl === state.currentTrack.streamUrl;
    }

    return entry.id === state.currentTrack.id;
}

async function cmdPrev() {
    if (state.playbackQueue.length === 0) {
        return;
    }
    if (state.playbackIndex > 0) {
        await playTrackList(state.playbackQueue, state.playbackIndex - 1, state.playbackQueueKey);
    } else {
        if (await playAdjacentBrowseEntry(state.currentTrack, -1)) {
            return;
        }
        elements.audioPlayer.currentTime = 0;
        updatePlaybackStripUI();
    }
}

async function cmdNext() {
    if (state.playbackQueue.length === 0) {
        return;
    }
    if (state.playbackIndex < state.playbackQueue.length - 1) {
        await playTrackList(state.playbackQueue, state.playbackIndex + 1, state.playbackQueueKey);
    } else {
        if (await playAdjacentBrowseEntry(state.currentTrack, 1)) {
            return;
        }
        elements.audioPlayer.pause();
        elements.audioPlayer.currentTime = 0;
        playbackState.playing = false;
        updatePlaybackStripUI();
        updateUI();
    }
}

function previewSeekFromClientX(clientX) {
    const rect = elements.seekTrack.getBoundingClientRect();
    if (rect.width <= 0) {
        return 0;
    }
    const ratio = clamp((clientX - rect.left) / rect.width, 0, 1);
    const nextElapsed = getSeekDuration() * ratio;
    playbackState.elapsed = nextElapsed;
    playbackState.timelineUpdatedAt = Date.now();
    updatePlaybackStripUI();
    return nextElapsed;
}

function getSeekDuration() {
    const audioDuration = Number(elements.audioPlayer.duration || 0);
    if (Number.isFinite(audioDuration) && audioDuration > 0) {
        return audioDuration;
    }
    const knownDuration = Number(playbackState.duration || 0);
    return Number.isFinite(knownDuration) && knownDuration > 0 ? knownDuration : 0;
}

function didAudioEndEarly() {
    if (!state.currentTrack || state.currentTrack.kind === "radio") {
        return false;
    }
    const expectedDuration = Number(state.currentTrack.duration || playbackState.duration || 0);
    const elapsed = Number(elements.audioPlayer.currentTime || playbackState.elapsed || 0);
    return expectedDuration > 30 && elapsed > 0 && elapsed < expectedDuration - 8;
}

async function cmdSeek(seconds) {
    if (!Number.isFinite(seconds)) {
        return;
    }
    const duration = getSeekDuration();
    if (duration <= 0) {
        return;
    }
    elements.audioPlayer.currentTime = clamp(seconds, 0, duration);
    playbackState.elapsed = elements.audioPlayer.currentTime;
    playbackState.timelineUpdatedAt = Date.now();
    updatePlaybackStripUI();
}

function syncVolumeFromSlider() {
    const nextVolume = clamp(Number(elements.volumeSlider.value || 0), 0, 100);
    playbackState.volume = nextVolume;
    elements.audioPlayer.volume = nextVolume / 100;
    elements.audioPlayer.muted = nextVolume <= 0;
    updatePlaybackStripUI();
}

function mutateTrackCollection(collection, trackId, mutator) {
    for (const track of collection) {
        if (track?.id === trackId) {
            mutator(track);
        }
    }
}

function updateTrackEverywhere(trackId, mutator) {
    mutateTrackCollection(browseEntries, trackId, mutator);
    mutateTrackCollection(state.playbackQueue, trackId, mutator);
    if (state.currentTrack?.id === trackId) {
        mutator(state.currentTrack);
    }
    for (const cached of state.detailsCache.values()) {
        if (Array.isArray(cached?.tracks)) {
            mutateTrackCollection(cached.tracks, trackId, mutator);
        }
    }
}

function updateAlbumEverywhere(albumId, mutator) {
    if (!albumId) {
        return;
    }
    for (const entry of browseEntries) {
        if (entry?.kind === "album" && entry.id === albumId) {
            mutator(entry);
        }
    }
    if (state.drawerContext?.albumId === albumId) {
        mutator(state.drawerContext);
    }
    const albumKey = `album:${albumId}`;
    const cachedAlbum = state.detailsCache.get(albumKey);
    if (cachedAlbum) {
        mutator(cachedAlbum);
    }
}

async function toggleTrackFavourite(track) {
    if (!track?.id) {
        return;
    }
    const nextStarred = !track.starred;
    await fetchJson(nextStarred ? "/rest/star.view" : "/rest/unstar.view", { id: track.id });
    invalidateBrowseEntryCache();
    updateTrackEverywhere(track.id, (item) => {
        item.starred = nextStarred;
    });
    renderSongsDrawer();
    updateUI();
    flashStatus(nextStarred ? `Starred ${track.title}` : `Removed star from ${track.title}`);
}

async function toggleAlbumFavourite(albumEntry) {
    const albumId = String(albumEntry?.id || albumEntry?.albumId || "");
    if (!albumId) {
        return;
    }
    const nextStarred = !albumEntry.starred;
    await fetchJson(nextStarred ? "/rest/star.view" : "/rest/unstar.view", { albumId });
    invalidateBrowseEntryCache();
    updateAlbumEverywhere(albumId, (item) => {
        item.starred = nextStarred;
        item.albumStarred = nextStarred;
    });
    renderSongsDrawer();
    updateUI();
    flashStatus(nextStarred ? `Favourited album ${albumEntry.title}` : `Removed favourite from album ${albumEntry.title}`);
}

async function toggleDrawerAlbumFavourite() {
    const albumId = String(state.drawerContext?.albumId || "");
    if (!albumId) {
        return;
    }
    const nextStarred = !state.drawerContext.albumStarred;
    await fetchJson(nextStarred ? "/rest/star.view" : "/rest/unstar.view", { albumId });
    invalidateBrowseEntryCache();
    updateAlbumEverywhere(albumId, (item) => {
        item.starred = nextStarred;
        item.albumStarred = nextStarred;
    });
    renderSongsDrawer();
    updateUI();
    flashStatus(nextStarred ? `Favourited album ${state.drawerContext.title}` : `Removed favourite from album ${state.drawerContext.title}`);
}

async function getAlbumTracks(albumEntry) {
    const albumId = String(albumEntry?.id || albumEntry?.albumId || "");
    if (!albumId) {
        return [];
    }
    const album = await ensureAlbumDetails(albumId);
    return album.tracks || [];
}

async function createPlaylistWithTrack(track) {
    if (!track?.id) {
        return;
    }
    const name = window.prompt("New playlist name:", "");
    if (!name || !name.trim()) {
        return;
    }
    const trimmed = name.trim();
    try {
        await fetchJson("/rest/createPlaylist.view", {
            name: trimmed,
            songId: track.id,
        });
    } catch (error) {
        flashStatus(`Failed to create playlist: ${error?.message || error}`);
        return;
    }
    invalidateBrowseEntryCache(BROWSE_MODE.PLAYLIST);
    await ensurePlaylistOptions(true);
    renderBrowseMenus();
    flashStatus(`Created playlist "${trimmed}" and added ${track.title}`);
}

async function createPlaylistWithAlbum(albumEntry) {
    const tracks = await getAlbumTracks(albumEntry);
    if (!tracks.length) {
        flashStatus("No album songs available to add");
        return;
    }
    const name = window.prompt("New playlist name:", albumEntry?.title || "");
    if (!name || !name.trim()) {
        return;
    }
    const trimmed = name.trim();
    try {
        await fetchJson("/rest/createPlaylist.view", {
            name: trimmed,
            songId: tracks[0].id,
        });
        await ensurePlaylistOptions(true);
        const playlist = state.playlistOptions.find((item) => item.title === trimmed);
        if (playlist) {
            for (const track of tracks.slice(1)) {
                await fetchJson("/rest/updatePlaylist.view", {
                    playlistId: playlist.id,
                    songIdToAdd: track.id,
                });
            }
        }
    } catch (error) {
        flashStatus(`Failed to create playlist: ${error?.message || error}`);
        return;
    }
    invalidateBrowseEntryCache(BROWSE_MODE.PLAYLIST);
    await ensurePlaylistOptions(true);
    renderBrowseMenus();
    flashStatus(`Created playlist "${trimmed}" and added ${albumEntry?.title || "album"}`);
}

async function addTrackToPlaylist(track, playlistId) {
    if (!track?.id || !playlistId) {
        return;
    }
    const playlistKey = String(playlistId);
    state.detailsCache.delete(`playlist:${playlistKey}`);
    const playlist = await ensurePlaylistDetails(playlistKey);
    if (playlist.tracks.some((playlistTrack) => tracksReferToSameSong(playlistTrack, track))) {
        flashStatus(`${track.title} is already in ${playlist.title || "playlist"}`);
        return;
    }
    await fetchJson("/rest/updatePlaylist.view", {
        playlistId: playlistKey,
        songIdToAdd: track.id,
    });
    invalidateBrowseEntryCache(BROWSE_MODE.PLAYLIST);
    state.detailsCache.delete(`playlist:${playlistKey}`);
    clearTrackPlaylistMembershipCache(track);
    await ensurePlaylistOptions(true);
    flashStatus(`Added ${track.title} to ${playlist.title || "playlist"}`);
}

async function addAlbumToPlaylist(albumEntry, playlistId) {
    if (!playlistId) {
        return;
    }
    const tracks = await getAlbumTracks(albumEntry);
    if (!tracks.length) {
        flashStatus("No album songs available to add");
        return;
    }
    const playlistKey = String(playlistId);
    state.detailsCache.delete(`playlist:${playlistKey}`);
    const playlist = await ensurePlaylistDetails(playlistKey);
    const tracksToAdd = [];
    const knownTracks = [...playlist.tracks];
    for (const track of tracks) {
        if (!track.id || knownTracks.some((knownTrack) => tracksReferToSameSong(knownTrack, track))) {
            continue;
        }
        tracksToAdd.push(track);
        knownTracks.push(track);
    }
    if (!tracksToAdd.length) {
        flashStatus(`${albumEntry?.title || "Album"} is already in ${playlist.title || "playlist"}`);
        return;
    }
    for (const track of tracksToAdd) {
        await fetchJson("/rest/updatePlaylist.view", {
            playlistId: playlistKey,
            songIdToAdd: track.id,
        });
    }
    invalidateBrowseEntryCache(BROWSE_MODE.PLAYLIST);
    state.detailsCache.delete(`playlist:${playlistKey}`);
    for (const track of tracks) {
        clearTrackPlaylistMembershipCache(track);
    }
    await ensurePlaylistOptions(true);
    const skippedCount = tracks.length - tracksToAdd.length;
    flashStatus(
        skippedCount > 0
            ? `Added ${tracksToAdd.length} new songs to ${playlist.title || "playlist"}`
            : `Added ${albumEntry?.title || "album"} to ${playlist.title || "playlist"}`
    );
}

async function removeTrackFromPlaylist(track, playlistId, songIndex) {
    const playlistKey = String(playlistId || "");
    const removeIndex = Number(songIndex);
    if (!track?.id || !playlistKey || !Number.isInteger(removeIndex) || removeIndex < 0) {
        return;
    }
    const playlist = state.playlistOptions.find((item) => item.id === playlistKey);
    await fetchJson("/rest/updatePlaylist.view", {
        playlistId: playlistKey,
        songIndexToRemove: removeIndex,
    });
    invalidateBrowseEntryCache(BROWSE_MODE.PLAYLIST);
    state.detailsCache.delete(`playlist:${playlistKey}`);
    clearTrackPlaylistMembershipCache(track);
    const refreshedPlaylist = await ensurePlaylistDetails(playlistKey);
    if (String(state.drawerContext.playlistId || "") === playlistKey) {
        state.drawerContext = {
            ...state.drawerContext,
            title: refreshedPlaylist.title,
            subtitle: `${refreshedPlaylist.tracks.length} ${refreshedPlaylist.tracks.length === 1 ? "song" : "songs"}`,
            playlistId: refreshedPlaylist.id,
            playlistName: refreshedPlaylist.title,
            items: sortDrawerItemsAtoZ(
                refreshedPlaylist.tracks.map((playlistTrack, index) => ({ track: playlistTrack, index }))
            ),
            loading: false,
        };
    }
    if (state.browseMode === BROWSE_MODE.PLAYLIST && String(state.settings.selectedPlaylistId) === playlistKey) {
        await reloadBrowseEntries({ preferredKey: state.activeEntryKey });
    }
    await ensurePlaylistOptions(true);
    renderBrowseMenus();
    renderSongsDrawer();
    updateUI();
    flashStatus(`Removed ${track.title} from ${playlist?.title || "playlist"}`);
}

async function handleSongAction(action, index, extra = {}) {
    const item = state.drawerContext.items[index];
    const track = item?.track;
    if (!track) {
        return;
    }

    if (action === "play-song") {
        await playTrackList(
            state.drawerContext.items.map((drawerItem) => drawerItem.track),
            index,
            state.drawerContext.key
        );
        return;
    }

    if (action === "toggle-song-menu") {
        state.activeSongMenuIndex = state.activeSongMenuIndex === index ? null : index;
        state.activeSongMenuMode = "actions";
        renderSongsDrawer();
        return;
    }

    if (action === "add-to-playlist") {
        await ensurePlaylistOptions();
        await loadTrackPlaylistMemberships(track, { force: true });
        state.activeSongMenuIndex = index;
        state.activeSongMenuMode = "playlist-picker";
        renderSongsDrawer();
        return;
    }

    if (action === "back-song-menu") {
        state.activeSongMenuMode = "actions";
        renderSongsDrawer();
        return;
    }

    if (action === "select-playlist-target") {
        state.activeSongMenuIndex = null;
        state.activeSongMenuMode = "actions";
        renderSongsDrawer();
        await addTrackToPlaylist(track, extra.playlistId);
        return;
    }

    if (action === "remove-from-playlist-target") {
        state.activeSongMenuIndex = null;
        state.activeSongMenuMode = "actions";
        renderSongsDrawer();
        await removeTrackFromPlaylist(track, extra.playlistId, Number(extra.playlistIndex));
        return;
    }

    if (action === "remove-from-playlist") {
        state.activeSongMenuIndex = null;
        state.activeSongMenuMode = "actions";
        renderSongsDrawer();
        await removeTrackFromPlaylist(track, state.drawerContext.playlistId, item.index);
        return;
    }

    if (action === "remove-radio-station") {
        state.activeSongMenuIndex = null;
        state.activeSongMenuMode = "actions";
        renderSongsDrawer();
        await removeSavedRadioStation(track);
        return;
    }

    if (action === "create-playlist") {
        state.activeSongMenuIndex = null;
        state.activeSongMenuMode = "actions";
        renderSongsDrawer();
        await createPlaylistWithTrack(track);
        return;
    }

    if (action === "toggle-favourite") {
        state.activeSongMenuIndex = null;
        state.activeSongMenuMode = "actions";
        renderSongsDrawer();
        await toggleTrackFavourite(track);
        return;
    }

    if (action === "more-info") {
        state.activeSongMenuMode = "actions";
        await showMoreInfoForSubject({ type: "song", track }, index);
    }
}

async function handleInfoAction(action, extra = {}) {
    const subject = state.activeInfoMenuSubject || getInfoActionSubject();
    if (!subject) {
        state.activeInfoMenuMode = "closed";
        state.activeInfoMenuSubject = null;
        renderInfoActionMenu();
        return;
    }

    if (action === "toggle-info-menu") {
        const opening = state.activeInfoMenuMode === "closed";
        state.activeInfoMenuMode = opening ? "actions" : "closed";
        state.activeInfoMenuSubject = opening ? getInfoActionSubject() : null;
        renderInfoActionMenu();
        return;
    }

    if (action === "add-to-playlist") {
        await ensurePlaylistOptions();
        if (subject.type === "song") {
            await loadTrackPlaylistMemberships(subject.track, { force: true });
        }
        state.activeInfoMenuMode = "playlist-picker";
        renderInfoActionMenu();
        return;
    }

    if (action === "back-info-menu") {
        state.activeInfoMenuMode = "actions";
        renderInfoActionMenu();
        return;
    }

    if (action === "select-playlist-target") {
        state.activeInfoMenuMode = "closed";
        renderInfoActionMenu();
        if (subject.type === "album") {
            await addAlbumToPlaylist(subject.entry, extra.playlistId);
        } else {
            await addTrackToPlaylist(subject.track, extra.playlistId);
        }
        return;
    }

    if (action === "remove-from-playlist-target") {
        state.activeInfoMenuMode = "closed";
        renderInfoActionMenu();
        if (subject.type === "song") {
            await removeTrackFromPlaylist(subject.track, extra.playlistId, Number(extra.playlistIndex));
        }
        return;
    }

    if (action === "remove-from-playlist") {
        const playlistRemovalContext = getInfoPlaylistRemovalContext(subject);
        state.activeInfoMenuMode = "closed";
        renderInfoActionMenu();
        if (playlistRemovalContext) {
            await removeTrackFromPlaylist(
                subject.track,
                playlistRemovalContext.playlistId,
                playlistRemovalContext.index
            );
        }
        return;
    }

    if (action === "remove-radio-station") {
        state.activeInfoMenuMode = "closed";
        state.activeInfoMenuSubject = null;
        renderInfoActionMenu();
        if (subject.type === "song" && subject.track?.kind === "radio") {
            await removeSavedRadioStation(subject.track);
        }
        return;
    }

    if (action === "create-playlist") {
        state.activeInfoMenuMode = "closed";
        renderInfoActionMenu();
        if (subject.type === "album") {
            await createPlaylistWithAlbum(subject.entry);
        } else {
            await createPlaylistWithTrack(subject.track);
        }
        return;
    }

    if (action === "toggle-favourite") {
        state.activeInfoMenuMode = "closed";
        renderInfoActionMenu();
        if (subject.type === "album") {
            await toggleAlbumFavourite(subject.entry);
        } else {
            await toggleTrackFavourite(subject.track);
        }
        return;
    }

    if (action === "more-info") {
        state.activeInfoMenuMode = "closed";
        state.activeInfoMenuSubject = null;
        await showMoreInfoForSubject(subject, browseEntries.indexOf(subject.track));
        renderInfoActionMenu();
    }
}

function handleSnap(index) {
    if (!browseEntries.length) {
        return;
    }
    state.browseIndex = clamp(index, 0, browseEntries.length - 1);
    state.activeEntryKey = browseEntries[state.browseIndex]?.key || null;
    state.activeInfoMenuMode = "closed";
    if (state.drawerOpen) {
        ensureDrawerContext();
    }
    ensureTextures();
    updateUI();
    positionInfoPanel();
    scheduleSnapBackToPlaying();
}

let snapBackTimerId = 0;

function clearSnapBackTimer() {
    if (snapBackTimerId) {
        window.clearTimeout(snapBackTimerId);
        snapBackTimerId = 0;
    }
}

function waitForNextPaint() {
    return new Promise((resolve) => {
        window.requestAnimationFrame(() => resolve());
    });
}

function isUserInspectingLibraryItem() {
    const infoPanelOpen = !elements.songInfoModal.classList.contains("hidden");
    return Boolean(
        infoPanelOpen ||
        state.infoTrackIndex != null ||
        state.activeInfoMenuMode !== "closed" ||
        state.drawerOpen ||
        state.activeDropdown ||
        state.searchOpen
    );
}

function scheduleSnapBackToPlaying() {
    clearSnapBackTimer();
    if (
        isUserInspectingLibraryItem() ||
        state.browseMode === BROWSE_MODE.SEARCH ||
        !state.currentTrack ||
        !elements.audioPlayer ||
        elements.audioPlayer.paused
    ) {
        return;
    }
    const playingKey = keyForTrackInCurrentMode(state.currentTrack);
    if (!playingKey) {
        return;
    }
    const currentKey = browseEntries[state.browseIndex]?.key || null;
    if (playingKey === currentKey) {
        return;
    }
    snapBackTimerId = window.setTimeout(() => {
        snapBackTimerId = 0;
        if (!state.currentTrack || elements.audioPlayer.paused || isUserInspectingLibraryItem()) {
            return;
        }
        const target = keyForTrackInCurrentMode(state.currentTrack);
        if (!target) {
            return;
        }
        const targetIndex = browseEntries.findIndex((entry) => entry.key === target);
        if (targetIndex < 0 || targetIndex === state.browseIndex) {
            return;
        }
        animateBrowseBackToTrack(state.currentTrack);
    }, 5000);
}

async function setBrowseMode(mode, { animate = false, activeDropdown = null } = {}) {
    if (state.connected && browseEntries.length) {
        setBrowseEntryCache(activeBrowseEntryCacheKey);
    }
    state.browseMode = mode;
    state.searchOpen = false;
    state.activeDropdown = activeDropdown;
    renderSearchPanel();
    renderBrowseMenus();
    await waitForNextPaint();
    if (!state.connected) {
        return;
    }
    saveSettings();
    await reloadBrowseEntries({ animate });
    renderBrowseMenus();
}

function navigateBrowseBy(delta) {
    if (!browseEntries.length) {
        return;
    }
    const nextIndex = clamp(state.browseIndex + delta, 0, browseEntries.length - 1);
    if (nextIndex === state.browseIndex) {
        return;
    }
    navigateBrowseToIndex(nextIndex);
}

function navigateBrowseToIndex(nextIndex) {
    if (!browseEntries.length) {
        return;
    }

    const clampedIndex = clamp(nextIndex, 0, browseEntries.length - 1);
    if (clampedIndex === state.browseIndex) {
        updateBrowseStripUI();
        return;
    }

    state.browseIndex = clampedIndex;
    state.activeEntryKey = browseEntries[clampedIndex]?.key || null;
    updateBrowseSummary();
    navigateTo(clampedIndex);
    ensureTextures(clampedIndex);
    if (state.drawerOpen) {
        ensureDrawerContext();
    }
}

function handleBrowseStripInput() {
    if (!browseEntries.length) {
        updateBrowseStripUI();
        return;
    }

    navigateBrowseToIndex(Math.round(Number(elements.browseStrip.value) || 0));
}

function setupBrowseHoldButton(button, direction) {
    let holdTimer = null;
    let repeatTimer = null;
    let pointerId = null;
    let suppressClick = false;
    let holdActive = false;

    const clearHold = () => {
        if (holdTimer != null) {
            window.clearTimeout(holdTimer);
            holdTimer = null;
        }
        if (repeatTimer != null) {
            window.clearInterval(repeatTimer);
            repeatTimer = null;
        }
        pointerId = null;
        holdActive = false;
    };

    const startHold = () => {
        clearHold();
        suppressClick = false;
        holdActive = true;
        holdTimer = window.setTimeout(() => {
            if (!holdActive) {
                return;
            }
            suppressClick = true;
            navigateBrowseBy(direction);
            repeatTimer = window.setInterval(() => navigateBrowseBy(direction), 130);
        }, 260);
    };

    button.addEventListener("pointerdown", (event) => {
        if (event.button != null && event.button !== 0) {
            return;
        }
        if (!browseEntries.length || button.disabled) {
            return;
        }
        startHold();
        pointerId = event.pointerId;
        if (typeof button.setPointerCapture === "function") {
            button.setPointerCapture(event.pointerId);
        }
    });

    button.addEventListener("pointerup", (event) => {
        if (pointerId != null && typeof button.releasePointerCapture === "function") {
            try {
                button.releasePointerCapture(pointerId);
            } catch {
                /* ignore */
            }
        }
        clearHold();
        if (suppressClick) {
            event.preventDefault();
            window.setTimeout(() => {
                suppressClick = false;
            }, 350);
        }
    });

    button.addEventListener("pointercancel", clearHold);
    button.addEventListener("mousedown", (event) => {
        if (window.PointerEvent || event.button !== 0) {
            return;
        }
        if (!browseEntries.length || button.disabled) {
            return;
        }
        startHold();
    });
    window.addEventListener("mouseup", () => {
        if (!window.PointerEvent) {
            clearHold();
        }
    });
    button.addEventListener("mouseleave", () => {
        if (!window.PointerEvent) {
            clearHold();
        }
    });
    button.addEventListener("click", (event) => {
        if (suppressClick) {
            event.preventDefault();
            event.stopPropagation();
            suppressClick = false;
            return;
        }
        navigateBrowseBy(direction);
    });
}

let radioPreviewReconnectTimer = 0;

function scheduleRadioPreviewReconnect() {
    const track = state.currentTrack;
    if (!track?.previewUrl) {
        return false;
    }
    window.clearTimeout(radioPreviewReconnectTimer);
    const trackKey = track.key || track.id || track.previewUrl;
    radioPreviewReconnectTimer = window.setTimeout(() => {
        radioPreviewReconnectTimer = 0;
        const currentKey = state.currentTrack?.key || state.currentTrack?.id || state.currentTrack?.previewUrl;
        if (!state.currentTrack?.previewUrl || currentKey !== trackKey) {
            return;
        }
        elements.audioPlayer.src = playbackUrl(state.currentTrack);
        elements.audioPlayer.load();
        elements.audioPlayer.play().catch(() => {
            flashStatus("Radio preview disconnected. Press play to reconnect.", 2600);
        });
    }, 900);
    flashStatus("Radio preview reconnecting...", 1400);
    return true;
}

function setupAudio() {
    elements.audioPlayer.preload = "metadata";
    elements.audioPlayer.volume = 1;

    elements.audioPlayer.addEventListener("play", () => {
        window.clearTimeout(radioPreviewReconnectTimer);
        radioPreviewReconnectTimer = 0;
        playbackState.playing = true;
        playbackState.timelineUpdatedAt = Date.now();
        updateUI();
        scheduleSnapBackToPlaying();
    });

    elements.audioPlayer.addEventListener("pause", () => {
        playbackState.playing = false;
        playbackState.timelineUpdatedAt = Date.now();
        updateUI();
        clearSnapBackTimer();
    });

    elements.audioPlayer.addEventListener("timeupdate", () => {
        playbackState.elapsed = elements.audioPlayer.currentTime || 0;
        playbackState.timelineUpdatedAt = Date.now();
        updatePlaybackStripUI();
    });

    elements.audioPlayer.addEventListener("loadedmetadata", () => {
        playbackState.duration = Number.isFinite(elements.audioPlayer.duration)
            ? elements.audioPlayer.duration
            : playbackState.duration;
        updatePlaybackStripUI();
        positionInfoPanel();
    });

    elements.audioPlayer.addEventListener("durationchange", () => {
        playbackState.duration = Number.isFinite(elements.audioPlayer.duration)
            ? elements.audioPlayer.duration
            : playbackState.duration;
        updatePlaybackStripUI();
    });

    elements.audioPlayer.addEventListener("ended", () => {
        if (scheduleRadioPreviewReconnect()) {
            return;
        }
        if (didAudioEndEarly()) {
            playbackState.playing = false;
            updatePlaybackStripUI();
            flashStatus("Stream ended early. Press play to resume this track.", 2400);
            return;
        }
        cmdNext();
    });

    elements.audioPlayer.addEventListener("error", () => {
        if (scheduleRadioPreviewReconnect()) {
            return;
        }
        flashStatus("Could not stream the selected track.", 2400);
    });
}

function setupInput() {
    const preventBrowserZoom = (event) => {
        event.preventDefault();
    };
    let lastTouchEndAt = 0;
    let lastTouchEndTarget = null;

    document.addEventListener(
        "touchstart",
        (event) => {
            if (event.touches.length > 1) {
                event.preventDefault();
            }
        },
        { passive: false }
    );
    document.addEventListener(
        "touchend",
        (event) => {
            const now = Date.now();
            if (event.target === lastTouchEndTarget && now - lastTouchEndAt < 320) {
                event.preventDefault();
            }
            lastTouchEndAt = now;
            lastTouchEndTarget = event.target;
        },
        { passive: false }
    );
    document.addEventListener("gesturestart", preventBrowserZoom, { passive: false });
    document.addEventListener("gesturechange", preventBrowserZoom, { passive: false });
    document.addEventListener("gestureend", preventBrowserZoom, { passive: false });
    document.addEventListener(
        "touchmove",
        (event) => {
            if (event.touches.length > 1) {
                event.preventDefault();
            }
        },
        { passive: false }
    );
    document.addEventListener(
        "wheel",
        (event) => {
            if (event.ctrlKey || event.metaKey) {
                event.preventDefault();
            }
        },
        { passive: false }
    );

    elements.btnDrawer.addEventListener("click", () => setSongsDrawerOpen(!state.drawerOpen));
    elements.btnPrev.addEventListener("click", () => {
        cmdPrev();
    });
    elements.btnPlay.addEventListener("click", () => {
        cmdPlayPause();
    });
    elements.btnFsPrev.addEventListener("click", () => {
        cmdPrev();
    });
    elements.btnFsPlay.addEventListener("click", () => {
        cmdPlayPause();
    });
    elements.btnFsNext.addEventListener("click", () => {
        cmdNext();
    });
    setupBrowseHoldButton(elements.btnBrowsePrev, -1);
    elements.btnNext.addEventListener("click", () => {
        cmdNext();
    });
    setupBrowseHoldButton(elements.btnBrowseNext, 1);
    elements.browseStrip.addEventListener("input", handleBrowseStripInput);
    elements.btnSearch.addEventListener("click", (event) => {
        event.stopPropagation();
        setSearchOpen(!state.searchOpen);
    });
    elements.btnPlayerFullscreen.addEventListener("click", (event) => {
        event.stopPropagation();
        togglePlayerFullscreen();
    });
    elements.btnSearchClose.addEventListener("click", () => setSearchOpen(false));
    elements.searchInput.addEventListener("input", scheduleSearch);
    elements.searchInput.addEventListener("search", scheduleSearch);
    elements.btnSearchClear.addEventListener("click", (event) => {
        event.preventDefault();
        event.stopPropagation();
        elements.searchInput.value = "";
        scheduleSearch();
        elements.searchInput.focus();
    });
    elements.searchInput.addEventListener("keydown", (event) => {
        if (event.key === "Enter") {
            event.preventDefault();
            if (searchTimerId) {
                window.clearTimeout(searchTimerId);
                searchTimerId = 0;
            }
            runSearch();
        }
    });
    elements.searchResults.addEventListener(
        "wheel",
        (event) => {
            event.stopPropagation();
            if (!canWheelScrollElement(elements.searchResults, event.deltaY)) {
                event.preventDefault();
            }
        },
        { passive: false }
    );
    elements.searchResults.addEventListener(
        "touchmove",
        (event) => {
            event.stopPropagation();
        },
        { passive: true }
    );
    elements.searchResults.addEventListener("click", async (event) => {
        event.preventDefault();
        event.stopPropagation();
        const radioAction = event.target.closest("button[data-radio-action]");
        if (radioAction && state.radioInternetSearch) {
            const action = radioAction.dataset.radioAction;
            if (action === "load-more") {
                await loadMoreRadioSearchResults();
                return;
            }
            const index = Number.parseInt(radioAction.dataset.radioIndex || "", 10);
            const entry = state.radioSearchResults[index];
            if (!entry) {
                return;
            }
            if (action === "toggle-menu") {
                state.activeRadioSearchMenuIndex = state.activeRadioSearchMenuIndex === index ? null : index;
                renderSearchPanel();
                return;
            }
            state.activeRadioSearchMenuIndex = null;
            if (action === "play") {
                setSearchOpen(false);
                presentRadioPreview(entry);
                await playTrackList([entry], 0, entry.key);
            } else if (action === "add") {
                addRadioStationToNavidrome(entry).catch((error) => {
                    console.error(error);
                    flashStatus(`Could not add station: ${error.message || error}`, 2800);
                });
            } else if (action === "more-info") {
                await showMoreInfoForSubject({ type: "song", track: entry }, index);
            }
            return;
        }
        const resultButton = event.target.closest("button[data-search-index]");
        if (!resultButton) {
            return;
        }
        const index = Number.parseInt(resultButton.dataset.searchIndex || "", 10);
        const now = Date.now();
        const repeatedClick = index === lastSearchClickIndex && now - lastSearchClickAt <= 550;
        lastSearchClickIndex = index;
        lastSearchClickAt = now;
        if (event.detail >= 2 || repeatedClick) {
            playSearchResult(index);
            return;
        }
        selectSearchResult(index);
    });
    elements.container.addEventListener("dblclick", (event) => {
        if (state.browseMode !== BROWSE_MODE.SEARCH) {
            return;
        }
        if (!isCoverCanvasTarget(event.target) || !isPointInsideActiveCover(event.clientX, event.clientY)) {
            return;
        }
        event.preventDefault();
        event.stopPropagation();
        playSearchResult(state.browseIndex);
    });
    elements.btnVolume.addEventListener("click", (event) => {
        event.stopPropagation();
        setVolumePopoverOpen(!elements.volumePopover.classList.contains("is-open"));
    });
    elements.volumeSlider.addEventListener("input", syncVolumeFromSlider);
    elements.browseAlbum.addEventListener("click", async (event) => {
        event.stopPropagation();
        const nextDropdown = state.activeDropdown === "album" ? null : "album";
        if (state.browseMode !== BROWSE_MODE.ALBUM) {
            await setBrowseMode(BROWSE_MODE.ALBUM, { activeDropdown: nextDropdown });
            return;
        }
        state.activeDropdown = nextDropdown;
        renderBrowseMenus();
    });
    elements.browseSongs.addEventListener("click", async (event) => {
        event.stopPropagation();
        const nextDropdown = state.activeDropdown === "songs" ? null : "songs";
        if (state.browseMode !== BROWSE_MODE.SONGS) {
            await setBrowseMode(BROWSE_MODE.SONGS, { activeDropdown: nextDropdown });
            return;
        }
        state.activeDropdown = nextDropdown;
        renderBrowseMenus();
    });
    elements.browseArtist.addEventListener("click", async (event) => {
        event.stopPropagation();
        const nextDropdown = state.activeDropdown === "artist" ? null : "artist";
        state.activeDropdown = nextDropdown;
        renderBrowseMenus();
        if (state.connected) {
            if (!state.artistOptions.length) {
                await ensureArtistOptions();
            }
            if (state.settings.artistPanel === "composer" && !state.composerOptions.length) {
                await ensureComposerOptions();
            }
        }
        if (![BROWSE_MODE.ARTIST, BROWSE_MODE.COMPOSER].includes(state.browseMode)) {
            await setBrowseMode(BROWSE_MODE.ARTIST, { activeDropdown: nextDropdown });
            return;
        }
        renderBrowseMenus();
    });
    elements.browsePlaylist.addEventListener("click", async (event) => {
        event.stopPropagation();
        const nextDropdown = state.activeDropdown === "playlist" ? null : "playlist";
        state.activeDropdown = nextDropdown;
        renderBrowseMenus();
        if (state.connected) {
            await ensurePlaylistOptions(true);
        }
        if (state.browseMode !== BROWSE_MODE.PLAYLIST) {
            await setBrowseMode(BROWSE_MODE.PLAYLIST, { activeDropdown: nextDropdown });
            return;
        }
        renderBrowseMenus();
    });
    elements.browseMore.addEventListener("click", async (event) => {
        event.stopPropagation();
        const nextDropdown = state.activeDropdown === "more" ? null : "more";
        if (state.activeDropdown !== "more") {
            state.activeMorePanel = null;
        }
        state.activeDropdown = nextDropdown;
        renderBrowseMenus();
        if (!state.genreOptions.length && state.connected) {
            await ensureGenreOptions();
        }
        renderBrowseMenus();
    });
    elements.browseSettings.addEventListener("click", (event) => {
        event.stopPropagation();
        state.activeDropdown = state.activeDropdown === "settings" ? null : "settings";
        renderBrowseMenus();
    });
    elements.artistDropdown.addEventListener("click", async (event) => {
        event.stopPropagation();
        const panelOption = event.target.closest("button[data-artist-panel]");
        if (panelOption) {
            state.settings.artistPanel = panelOption.dataset.artistPanel === "composer" ? "composer" : "artist";
            saveSettings();
            if (state.settings.artistPanel === "composer" && state.connected && !state.composerOptions.length) {
                await ensureComposerOptions();
            }
            renderBrowseMenus();
            return;
        }
        const displayOption = event.target.closest("button[data-display-action='artist-display']");
        if (displayOption) {
            state.settings.artistDisplayMode = normalizeTrackDisplayMode(displayOption.dataset.displayMode);
            saveSettings();
            if ([BROWSE_MODE.ARTIST, BROWSE_MODE.COMPOSER].includes(state.browseMode)) {
                await reloadBrowseEntries({ animate: false });
            }
            renderBrowseMenus();
            return;
        }
        const sortOption = event.target.closest("button[data-sort-action='artist-sort']");
        if (sortOption) {
            state.settings.artistBrowseSort = normalizeBrowseSort(sortOption.dataset.sortMode);
            saveSettings();
            if ([BROWSE_MODE.ARTIST, BROWSE_MODE.COMPOSER].includes(state.browseMode)) {
                await reloadBrowseEntries({ animate: false });
            }
            renderBrowseMenus();
            return;
        }
        const composerOption = event.target.closest("button[data-composer-name]");
        if (composerOption) {
            state.settings.selectedComposer = composerOption.dataset.composerName || "";
            state.settings.artistPanel = "composer";
            saveSettings();
            await setBrowseMode(BROWSE_MODE.COMPOSER);
            return;
        }
        const option = event.target.closest("button[data-artist-id]");
        if (!option) {
            return;
        }
        state.settings.selectedArtistId = option.dataset.artistId || "";
        state.settings.selectedArtistName = option.dataset.artistName || "";
        state.settings.artistPanel = "artist";
        saveSettings();
        await setBrowseMode(BROWSE_MODE.ARTIST);
    });
    elements.albumDropdown.addEventListener("click", async (event) => {
        event.stopPropagation();
        const scopeOption = event.target.closest("button[data-album-scope]");
        if (scopeOption) {
            state.settings.albumBrowseScope = scopeOption.dataset.albumScope === "favourite" ? "favourite" : "all";
            saveSettings();
            await setBrowseMode(BROWSE_MODE.ALBUM);
            return;
        }
        const sortOption = event.target.closest("button[data-sort-action='album-sort']");
        if (sortOption) {
            state.settings.albumBrowseSort = normalizeBrowseSort(sortOption.dataset.sortMode);
            saveSettings();
            if (state.browseMode === BROWSE_MODE.ALBUM) {
                await reloadBrowseEntries({ animate: false });
            }
            renderBrowseMenus();
        }
    });
    elements.playlistDropdown.addEventListener("click", async (event) => {
        event.stopPropagation();
        const displayOption = event.target.closest("button[data-display-action='playlist-display']");
        if (displayOption) {
            state.settings.playlistDisplayMode = normalizeTrackDisplayMode(displayOption.dataset.displayMode);
            saveSettings();
            if (state.browseMode === BROWSE_MODE.PLAYLIST) {
                await reloadBrowseEntries({ animate: false });
            }
            renderBrowseMenus();
            return;
        }
        const sortOption = event.target.closest("button[data-sort-action='playlist-sort']");
        if (sortOption) {
            state.settings.playlistBrowseSort = normalizeBrowseSort(sortOption.dataset.sortMode);
            saveSettings();
            if (state.browseMode === BROWSE_MODE.PLAYLIST) {
                await reloadBrowseEntries({ animate: false });
            }
            renderBrowseMenus();
            return;
        }
        const option = event.target.closest("button[data-playlist-id]");
        if (!option) {
            return;
        }
        state.settings.selectedPlaylistId = option.dataset.playlistId || "";
        saveSettings();
        await setBrowseMode(BROWSE_MODE.PLAYLIST);
    });
    elements.songsDropdown.addEventListener("click", async (event) => {
        event.stopPropagation();
        const modeOption = event.target.closest("button[data-songs-mode]");
        if (modeOption) {
            state.settings.songsBrowseScope = "all";
            state.settings.songsDisplayMode = TRACK_DISPLAY_MODE.SONG;
            saveSettings();
            await setBrowseMode(BROWSE_MODE.SONGS);
            return;
        }
        const scopeOption = event.target.closest("button[data-songs-scope]");
        if (scopeOption) {
            const requestedScope = scopeOption.dataset.songsScope === "favourite" ? "favourite" : "all";
            state.settings.songsBrowseScope =
                requestedScope === "favourite" && state.settings.songsBrowseScope === "favourite"
                    ? "all"
                    : requestedScope;
            saveSettings();
            await setBrowseMode(BROWSE_MODE.SONGS);
            return;
        }
        const sortOption = event.target.closest("button[data-sort-action='songs-sort']");
        if (sortOption) {
            state.settings.songsBrowseSort = normalizeBrowseSort(sortOption.dataset.sortMode);
            saveSettings();
            if (state.browseMode === BROWSE_MODE.SONGS) {
                await reloadBrowseEntries({ animate: false });
            }
            renderBrowseMenus();
            return;
        }
        const displayOption = event.target.closest("button[data-display-action='songs-display']");
        if (!displayOption) {
            return;
        }
        state.settings.songsDisplayMode = normalizeTrackDisplayMode(displayOption.dataset.displayMode);
        saveSettings();
        if (state.browseMode === BROWSE_MODE.SONGS) {
            await reloadBrowseEntries({ animate: false });
        }
        renderBrowseMenus();
    });
    elements.moreDropdown.addEventListener("click", async (event) => {
        event.stopPropagation();
        const radioSearchOption = event.target.closest("button[data-radio-search]");
        if (radioSearchOption) {
            state.radioInternetSearch = true;
            state.radioSearchResults = [];
            state.radioSearchError = "";
            state.radioSearchHasMore = false;
            state.radioSearchLoadingMore = false;
            state.radioSearchOffset = 0;
            state.activeRadioSearchMenuIndex = null;
            elements.searchInput.value = "";
            state.searchQuery = "";
            setSearchOpen(true);
            return;
        }
        const panelOption = event.target.closest("button[data-more-panel]");
        if (panelOption) {
            const nextPanel = panelOption.dataset.morePanel || "";
            state.activeMorePanel =
                state.activeMorePanel === nextPanel ? null : nextPanel;
            renderMoreDropdown();
            return;
        }
        const option = event.target.closest("button[data-more-mode]");
        if (option) {
            await setBrowseMode(option.dataset.moreMode);
            return;
        }
        const yearOption = event.target.closest("button[data-year-key]");
        if (yearOption) {
            state.settings.selectedYear = yearOption.dataset.yearKey || "";
            state.activeMorePanel = "year";
            saveSettings();
            await setBrowseMode(BROWSE_MODE.YEAR);
            return;
        }
        const genreOption = event.target.closest("button[data-genre-key]");
        if (genreOption) {
            state.settings.selectedGenre = genreOption.dataset.genreKey || "";
            state.activeMorePanel = "genre";
            saveSettings();
            await setBrowseMode(BROWSE_MODE.GENRE);
        }
    });
    elements.settingsDropdown.addEventListener("click", async (event) => {
        event.stopPropagation();
        const option = event.target.closest("button[data-settings-action]");
        if (!option) {
            return;
        }
        const action = option.dataset.settingsAction;
        if (action === "font-down") {
            albumInfoFontScale = clampNumber(albumInfoFontScale - 0.1, MIN_FONT_SCALE, MAX_FONT_SCALE);
            saveSettings();
            renderBrowseMenus();
            positionInfoPanel();
            return;
        }
        if (action === "font-reset") {
            albumInfoFontScale = DEFAULT_FONT_SCALE;
            saveSettings();
            renderBrowseMenus();
            positionInfoPanel();
            return;
        }
        if (action === "font-up") {
            albumInfoFontScale = clampNumber(albumInfoFontScale + 0.1, MIN_FONT_SCALE, MAX_FONT_SCALE);
            saveSettings();
            renderBrowseMenus();
            positionInfoPanel();
            return;
        }
        if (action === "connect") {
            setConnectModalOpen(true);
            state.activeDropdown = null;
            renderBrowseMenus();
            return;
        }
        if (action === "refresh") {
            invalidateLibraryCaches();
            renderBrowseMenus();
            await reloadBrowseEntries({ animate: false });
            warmMenus();
        }
    });
    elements.btnDrawerFavourite.addEventListener("click", async () => {
        await toggleDrawerAlbumFavourite();
    });
    elements.btnDrawerClose.addEventListener("click", () => setSongsDrawerOpen(false));
    elements.songsDrawerBackdrop.addEventListener("click", () => setSongsDrawerOpen(false));
    elements.btnSongInfoClose.addEventListener("click", hideSongInfo);
    elements.btnConnectClose.addEventListener("click", () => setConnectModalOpen(false));
    elements.btnConnectCancel.addEventListener("click", () => setConnectModalOpen(false));
    elements.btnConnectPasswordToggle.addEventListener("click", () => {
        setConnectPasswordVisible(elements.connectPasswordInput.type === "password");
    });
    elements.connectForm.addEventListener("submit", (event) => {
        event.preventDefault();
        handleConnectAction();
    });
    elements.connectPasswordInput.addEventListener("keydown", (event) => {
        if (event.key === "Enter") {
            event.preventDefault();
            handleConnectAction();
        }
    });
    elements.connectModal.addEventListener("click", (event) => {
        if (event.target === elements.connectModal) {
            setConnectModalOpen(false);
        }
    });
    elements.songInfoModal.addEventListener("click", (event) => {
        if (event.target === elements.songInfoModal) {
            hideSongInfo();
        }
    });
    elements.songsDrawer.addEventListener("click", (event) => {
        const actionButton = event.target.closest("button[data-action]");
        if (!actionButton) {
            return;
        }
        event.stopPropagation();
        const action = actionButton.dataset.action;
        const index = Number.parseInt(actionButton.dataset.index || "", 10);
        handleSongAction(action, index, {
            playlistId: actionButton.dataset.playlistId || "",
            playlistIndex: actionButton.dataset.playlistIndex || "",
        });
    });
    elements.infoPanel.addEventListener("click", (event) => {
        const actionButton = event.target.closest("button[data-info-action]");
        if (!actionButton) {
            return;
        }
        event.stopPropagation();
        const action = actionButton.dataset.infoAction;
        handleInfoAction(action, {
            playlistId: actionButton.dataset.playlistId || "",
            playlistIndex: actionButton.dataset.playlistIndex || "",
        });
    });

    let seekPointerActive = false;
    let activeSeekPointerId = null;

    const beginSeekDrag = (event) => {
        const duration = getSeekDuration();
        if (duration <= 0) {
            return;
        }
        if (event.target.closest?.("button, input, #volume-wrap, #btn-search")) {
            return;
        }
        seekPointerActive = true;
        activeSeekPointerId = event.pointerId;
        elements.seekTrack.classList.add("is-seeking");
        if (typeof elements.seekTrack.setPointerCapture === "function") {
            elements.seekTrack.setPointerCapture(event.pointerId);
        }
        previewSeekFromClientX(event.clientX);
        event.preventDefault();
    };

    elements.seekTrack.addEventListener("pointerdown", beginSeekDrag);
    elements.playbackStrip.addEventListener("pointerdown", (event) => {
        if (event.target === elements.seekTrack || event.target.closest?.("#seek-track")) {
            return;
        }
        const seekRect = elements.seekTrack.getBoundingClientRect();
        const stripRect = elements.playbackStrip.getBoundingClientRect();
        const withinSeekColumn = event.clientX >= seekRect.left && event.clientX <= seekRect.right;
        const withinSeekRow = event.clientY >= stripRect.top - 6 && event.clientY <= stripRect.bottom + 6;
        if (withinSeekColumn && withinSeekRow) {
            beginSeekDrag(event);
        }
    });

    window.addEventListener("pointermove", (event) => {
        if (!seekPointerActive) {
            return;
        }
        previewSeekFromClientX(event.clientX);
    });

    window.addEventListener("pointerup", async (event) => {
        if (!seekPointerActive) {
            return;
        }
        seekPointerActive = false;
        elements.seekTrack.classList.remove("is-seeking");
        const seekValue = previewSeekFromClientX(event.clientX);
        if (activeSeekPointerId != null && typeof elements.seekTrack.releasePointerCapture === "function") {
            try {
                elements.seekTrack.releasePointerCapture(activeSeekPointerId);
            } catch {
                /* ignore */
            }
        }
        activeSeekPointerId = null;
        await cmdSeek(seekValue);
    });

    window.addEventListener("pointercancel", () => {
        if (!seekPointerActive) {
            return;
        }
        seekPointerActive = false;
        activeSeekPointerId = null;
        elements.seekTrack.classList.remove("is-seeking");
        updatePlaybackStripUI();
    });

    elements.seekTrack.addEventListener("keydown", async (event) => {
        const duration = getSeekDuration();
        if (duration <= 0) {
            return;
        }
        if (event.key === "ArrowLeft") {
            event.preventDefault();
            await cmdSeek((elements.audioPlayer.currentTime || 0) - 5);
        } else if (event.key === "ArrowRight") {
            event.preventDefault();
            await cmdSeek((elements.audioPlayer.currentTime || 0) + 5);
        }
    });

    let touchStartX = 0;
    let touchStartY = 0;
    let touchLastStepX = 0;
    let touchStartTime = 0;
    let touchStartTarget = null;
    let touchCanNavigateAlbums = false;
    let touchStartedInsideDrawer = false;
    let touchMovedAsSwipe = false;
    let activeCoverPointerId = null;
    let pointerStartX = 0;
    let pointerStartY = 0;
    let pointerLastStepX = 0;
    let pointerStartTime = 0;
    let pointerStartTarget = null;
    let pointerStartedInsideDrawer = false;
    let pointerCanNavigateAlbums = false;
    let pointerMovedAsSwipe = false;
    let lastTouchPointerHandledAt = 0;

    if (window.PointerEvent) {
        elements.container.addEventListener("pointerdown", (event) => {
            if (event.pointerType !== "pen") {
                return;
            }
            if (activeCoverPointerId != null) {
                return;
            }
            if (!isCoverGestureTarget(event.target)) {
                return;
            }
            const insideSongInfo = Boolean(event.target.closest?.("#song-info-modal"));
            pointerStartedInsideDrawer = Boolean(event.target.closest?.("#songs-drawer, #songs-drawer-backdrop"));
            pointerCanNavigateAlbums = !insideSongInfo;
            if (!pointerCanNavigateAlbums) {
                return;
            }
            activeCoverPointerId = event.pointerId;
            pointerStartX = event.clientX;
            pointerStartY = event.clientY;
            pointerLastStepX = event.clientX;
            pointerStartTime = Date.now();
            pointerStartTarget = event.target;
            pointerMovedAsSwipe = false;
            if (typeof elements.container.setPointerCapture === "function") {
                elements.container.setPointerCapture(event.pointerId);
            }
            event.preventDefault();
        });

        elements.container.addEventListener("pointermove", (event) => {
            if (!pointerCanNavigateAlbums || event.pointerId !== activeCoverPointerId) {
                return;
            }
            if (state.drawerOpen && !pointerStartedInsideDrawer) {
                event.preventDefault();
                return;
            }
            const dx = event.clientX - pointerStartX;
            const dy = event.clientY - pointerStartY;
            const horizontalGesture = Math.abs(dx) >= 12 && Math.abs(dx) > Math.abs(dy);
            if (state.drawerOpen && horizontalGesture) {
                pointerStartedInsideDrawer = false;
                setSongsDrawerOpen(false);
            } else if (!state.drawerOpen && horizontalGesture) {
                const threshold = coverDragStepThreshold();
                const stepDx = event.clientX - pointerLastStepX;
                const steps = Math.trunc(Math.abs(stepDx) / threshold);
                if (steps > 0) {
                    navigateBrowseBy((stepDx > 0 ? -1 : 1) * Math.min(steps, 4));
                    pointerLastStepX += Math.sign(stepDx) * threshold * steps;
                    pointerMovedAsSwipe = true;
                    lastTouchPointerHandledAt = Date.now();
                }
            }
            event.preventDefault();
        });

        elements.container.addEventListener("pointerup", (event) => {
            if (!pointerCanNavigateAlbums || event.pointerId !== activeCoverPointerId) {
                return;
            }
            const dx = event.clientX - pointerStartX;
            const dy = event.clientY - pointerStartY;
            const dt = Date.now() - pointerStartTime;
            const isSwipe = !pointerMovedAsSwipe && Math.abs(dx) >= 28 && Math.abs(dx) > Math.abs(dy) * 1.15;
            const isTap = dt <= 420 && Math.abs(dx) < 14 && Math.abs(dy) < 14;

            if (isSwipe) {
                handleCoverSurfaceSwipe(dx, dt);
            } else if (isTap) {
                handleCoverSurfaceTap(pointerStartTarget, event.clientX, event.clientY);
            }

            lastTouchPointerHandledAt = Date.now();
            if (typeof elements.container.releasePointerCapture === "function") {
                try {
                    elements.container.releasePointerCapture(activeCoverPointerId);
                } catch {
                    /* ignore */
                }
            }
            activeCoverPointerId = null;
            pointerStartTarget = null;
            pointerCanNavigateAlbums = false;
            pointerStartedInsideDrawer = false;
            pointerMovedAsSwipe = false;
            event.preventDefault();
        });

        elements.container.addEventListener("pointercancel", () => {
            activeCoverPointerId = null;
            pointerStartTarget = null;
            pointerCanNavigateAlbums = false;
            pointerStartedInsideDrawer = false;
            pointerMovedAsSwipe = false;
        });
    }

        elements.container.addEventListener(
            "touchstart",
            (event) => {
                if (event.touches.length !== 1) {
                    return;
                }
                if (!isCoverGestureTarget(event.target)) {
                    return;
                }
                const insideSongInfo = Boolean(event.target.closest?.("#song-info-modal"));
                touchStartedInsideDrawer = Boolean(event.target.closest?.("#songs-drawer, #songs-drawer-backdrop"));
                touchCanNavigateAlbums = !insideSongInfo && !isContextMenuTarget(event.target);
                if (!touchCanNavigateAlbums) {
                    return;
                }
                touchStartX = event.touches[0].clientX;
                touchStartY = event.touches[0].clientY;
                touchLastStepX = event.touches[0].clientX;
                touchStartTime = Date.now();
                touchStartTarget = event.target;
                touchMovedAsSwipe = false;
            },
            { passive: false }
        );

        elements.container.addEventListener(
            "touchmove",
            (event) => {
                if (!touchCanNavigateAlbums || event.touches.length !== 1) {
                    return;
                }
                if (state.drawerOpen && !touchStartedInsideDrawer) {
                    event.preventDefault();
                    return;
                }
                const dx = event.touches[0].clientX - touchStartX;
                const dy = event.touches[0].clientY - touchStartY;
                const horizontalGesture = Math.abs(dx) >= 12 && Math.abs(dx) > Math.abs(dy);
                if (state.drawerOpen && horizontalGesture) {
                    touchStartedInsideDrawer = false;
                    setSongsDrawerOpen(false);
                } else if (!state.drawerOpen && horizontalGesture) {
                    const threshold = coverDragStepThreshold();
                    const stepDx = event.touches[0].clientX - touchLastStepX;
                    const steps = Math.trunc(Math.abs(stepDx) / threshold);
                    if (steps > 0) {
                        navigateBrowseBy((stepDx > 0 ? -1 : 1) * Math.min(steps, 4));
                        touchLastStepX += Math.sign(stepDx) * threshold * steps;
                        touchMovedAsSwipe = true;
                        lastTouchPointerHandledAt = Date.now();
                    }
                }
                if (horizontalGesture) {
                    event.preventDefault();
                }
            },
            { passive: false }
        );

        elements.container.addEventListener(
            "touchend",
            (event) => {
                if (!touchCanNavigateAlbums || event.changedTouches.length !== 1) {
                    touchCanNavigateAlbums = false;
                    touchStartedInsideDrawer = false;
                    touchMovedAsSwipe = false;
                    touchStartTarget = null;
                    return;
                }

                const dx = event.changedTouches[0].clientX - touchStartX;
                const dy = event.changedTouches[0].clientY - touchStartY;
                const dt = Date.now() - touchStartTime;
                const isSwipe = !touchMovedAsSwipe && Math.abs(dx) >= 28 && Math.abs(dx) > Math.abs(dy) * 1.15;
                const isTap = dt <= 420 && Math.abs(dx) < 14 && Math.abs(dy) < 14;

                if (isSwipe) {
                    handleCoverSurfaceSwipe(dx, dt);
                } else if (isTap) {
                    handleCoverSurfaceTap(
                        touchStartTarget,
                        event.changedTouches[0].clientX,
                        event.changedTouches[0].clientY
                    );
                }

                lastTouchPointerHandledAt = Date.now();
                touchStartTarget = null;
                touchCanNavigateAlbums = false;
                touchStartedInsideDrawer = false;
                touchMovedAsSwipe = false;
                event.preventDefault();
            },
            { passive: false }
        );

    elements.container.addEventListener("click", (event) => {
        if (Date.now() - lastTouchPointerHandledAt < 700) {
            event.preventDefault();
            event.stopPropagation();
            return;
        }
        if (!isCoverCanvasTarget(event.target)) {
            return;
        }
        if (handleCoverSurfaceTap(event.target, event.clientX, event.clientY)) {
            event.stopPropagation();
        }
    });

    let wheelAccum = 0;
    let wheelTimer = null;
    elements.container.addEventListener(
        "wheel",
        (event) => {
            if (event.target.closest?.("#song-info-modal")) {
                return;
            }
            const insideSearch = Boolean(event.target.closest?.("#search-panel"));
            const searchScrollHost = event.target.closest?.("#search-results");
            const searchHorizontalIntent = Math.abs(event.deltaX) > Math.abs(event.deltaY);
            if (insideSearch) {
                if (!searchHorizontalIntent && searchScrollHost && canWheelScrollElement(searchScrollHost, event.deltaY)) {
                    return;
                }
                event.preventDefault();
                return;
            }
            const contextMenu = event.target.closest?.(".song-context-menu");
            if (contextMenu) {
                const horizontalIntent = Math.abs(event.deltaX) > Math.abs(event.deltaY);
                if (!horizontalIntent && canWheelScrollElement(contextMenu, event.deltaY)) {
                    return;
                }
                if (horizontalIntent && canWheelScrollElementX(contextMenu, event.deltaX)) {
                    return;
                }
                event.preventDefault();
                return;
            }
            const insideDrawer = Boolean(event.target.closest?.("#songs-drawer"));
            const drawerScrollHost = event.target.closest?.(".songs-table-wrap");
            const horizontalIntent = Math.abs(event.deltaX) > Math.abs(event.deltaY);

            if (state.drawerOpen && insideDrawer) {
                if (!horizontalIntent) {
                    if (drawerScrollHost && canWheelScrollElement(drawerScrollHost, event.deltaY)) {
                        return;
                    }
                    event.preventDefault();
                    return;
                }
                if (drawerScrollHost && canWheelScrollElementX(drawerScrollHost, event.deltaX)) {
                    return;
                }
                event.preventDefault();
                return;
            } else if (state.drawerOpen) {
                setSongsDrawerOpen(false);
            }

            event.preventDefault();
            wheelAccum += normalizedWheelStep(event);

            const wholeSteps = wheelAccum > 0 ? Math.floor(wheelAccum) : Math.ceil(wheelAccum);
            if (wholeSteps !== 0) {
                navigateBrowseBy(wholeSteps);
                wheelAccum -= wholeSteps;
            }

            clearTimeout(wheelTimer);
            wheelTimer = window.setTimeout(() => {
                wheelAccum = 0;
            }, 140);
        },
        { passive: false }
    );

    window.addEventListener("click", (event) => {
        if (event.target.closest?.("[data-close-browse-dropdown]")) {
            state.activeDropdown = null;
            renderBrowseMenus();
            return;
        }
        const clickedActiveCover =
            isCoverCanvasTarget(event.target) && isPointInsideActiveCover(event.clientX, event.clientY);
        const insideDrawer = Boolean(event.target.closest?.("#songs-drawer"));
        const insideSongInfo = Boolean(event.target.closest?.("#song-info-modal"));
        const insideConnectModal = Boolean(event.target.closest?.("#connect-modal"));
        const insideInfoPanel = Boolean(event.target.closest?.("#info-panel"));
        const insideSearch = Boolean(event.target.closest?.("#search-panel, #btn-search"));
        const clickedDrawerToggle = Boolean(event.target.closest?.("#btn-drawer"));
        const insideBrowseMenu = Boolean(
            event.target.closest?.(".browse-menu-wrap") ||
                event.target.closest?.(".browse-dropdown")
        );
        const insideVolumeWrap = Boolean(
            event.target.closest?.("#volume-wrap") ||
                event.target.closest?.("#volume-popover")
        );

        if (
            state.drawerOpen &&
            !insideDrawer &&
            !insideSongInfo &&
            !clickedDrawerToggle &&
            !clickedActiveCover &&
            !insideVolumeWrap
        ) {
            setSongsDrawerOpen(false);
        }

        if (state.activeSongMenuIndex !== null && !event.target.closest?.(".song-row-actions")) {
            state.activeSongMenuIndex = null;
            state.activeSongMenuMode = "actions";
            renderSongsDrawer();
        }

        if (state.activeInfoMenuMode !== "closed" && !insideInfoPanel) {
            state.activeInfoMenuMode = "closed";
            renderInfoActionMenu();
        }

        if (state.searchOpen && !insideSearch) {
            setSearchOpen(false);
        }

        if (state.activeDropdown && !insideBrowseMenu) {
            state.activeDropdown = null;
            renderBrowseMenus();
        }

        if (elements.volumePopover.classList.contains("is-open") && !insideVolumeWrap) {
            setVolumePopoverOpen(false);
        }

        if (!elements.connectModal.classList.contains("hidden") && !insideConnectModal) {
            setConnectModalOpen(false);
        }
    }, true);

    window.addEventListener("keydown", (event) => {
        if (event.key === "Escape") {
            if (state.playerFullscreen || getFullscreenElement()) {
                setPlayerFullscreen(false);
            } else if (!elements.connectModal.classList.contains("hidden")) {
                setConnectModalOpen(false);
            } else if (elements.volumePopover.classList.contains("is-open")) {
                setVolumePopoverOpen(false);
            } else if (state.searchOpen) {
                setSearchOpen(false);
            } else if (state.activeInfoMenuMode !== "closed") {
                state.activeInfoMenuMode = "closed";
                renderInfoActionMenu();
            } else if (state.infoTrackIndex != null) {
                hideSongInfo();
            } else if (state.drawerOpen) {
                setSongsDrawerOpen(false);
            }
            return;
        }

        if (isTextEntryTarget(event.target)) {
            return;
        }

        if (state.drawerOpen) {
            return;
        }

        if (event.key === "ArrowLeft") {
            navigateBrowseBy(-1);
        } else if (event.key === "ArrowRight") {
            navigateBrowseBy(1);
        } else if (event.key === " ") {
            event.preventDefault();
            cmdPlayPause();
        }
    });
}

function md5Utf8(value) {
    const bytes = new TextEncoder().encode(value);
    const stateMd5 = [1732584193, -271733879, -1732584194, 271733878];
    let offset;

    for (offset = 64; offset <= bytes.length; offset += 64) {
        md5cycle(stateMd5, md5Block(bytes.subarray(offset - 64, offset)));
    }

    const tail = new Uint8Array(64);
    tail.set(bytes.subarray(offset - 64));
    tail[bytes.length % 64] = 0x80;

    if (bytes.length % 64 > 55) {
        md5cycle(stateMd5, md5Block(tail));
        tail.fill(0);
    }

    const bitLength = bytes.length * 8;
    tail[56] = bitLength & 0xff;
    tail[57] = (bitLength >>> 8) & 0xff;
    tail[58] = (bitLength >>> 16) & 0xff;
    tail[59] = (bitLength >>> 24) & 0xff;
    md5cycle(stateMd5, md5Block(tail));

    return stateMd5.map(hex32).join("");
}

function md5Block(bytes) {
    const block = new Array(16);
    for (let index = 0; index < 16; index += 1) {
        const offset = index * 4;
        block[index] =
            (bytes[offset] || 0) |
            ((bytes[offset + 1] || 0) << 8) |
            ((bytes[offset + 2] || 0) << 16) |
            ((bytes[offset + 3] || 0) << 24);
    }
    return block;
}

function md5cycle(stateMd5, block) {
    let [a, b, c, d] = stateMd5;

    a = ff(a, b, c, d, block[0], 7, -680876936);
    d = ff(d, a, b, c, block[1], 12, -389564586);
    c = ff(c, d, a, b, block[2], 17, 606105819);
    b = ff(b, c, d, a, block[3], 22, -1044525330);
    a = ff(a, b, c, d, block[4], 7, -176418897);
    d = ff(d, a, b, c, block[5], 12, 1200080426);
    c = ff(c, d, a, b, block[6], 17, -1473231341);
    b = ff(b, c, d, a, block[7], 22, -45705983);
    a = ff(a, b, c, d, block[8], 7, 1770035416);
    d = ff(d, a, b, c, block[9], 12, -1958414417);
    c = ff(c, d, a, b, block[10], 17, -42063);
    b = ff(b, c, d, a, block[11], 22, -1990404162);
    a = ff(a, b, c, d, block[12], 7, 1804603682);
    d = ff(d, a, b, c, block[13], 12, -40341101);
    c = ff(c, d, a, b, block[14], 17, -1502002290);
    b = ff(b, c, d, a, block[15], 22, 1236535329);

    a = gg(a, b, c, d, block[1], 5, -165796510);
    d = gg(d, a, b, c, block[6], 9, -1069501632);
    c = gg(c, d, a, b, block[11], 14, 643717713);
    b = gg(b, c, d, a, block[0], 20, -373897302);
    a = gg(a, b, c, d, block[5], 5, -701558691);
    d = gg(d, a, b, c, block[10], 9, 38016083);
    c = gg(c, d, a, b, block[15], 14, -660478335);
    b = gg(b, c, d, a, block[4], 20, -405537848);
    a = gg(a, b, c, d, block[9], 5, 568446438);
    d = gg(d, a, b, c, block[14], 9, -1019803690);
    c = gg(c, d, a, b, block[3], 14, -187363961);
    b = gg(b, c, d, a, block[8], 20, 1163531501);
    a = gg(a, b, c, d, block[13], 5, -1444681467);
    d = gg(d, a, b, c, block[2], 9, -51403784);
    c = gg(c, d, a, b, block[7], 14, 1735328473);
    b = gg(b, c, d, a, block[12], 20, -1926607734);

    a = hh(a, b, c, d, block[5], 4, -378558);
    d = hh(d, a, b, c, block[8], 11, -2022574463);
    c = hh(c, d, a, b, block[11], 16, 1839030562);
    b = hh(b, c, d, a, block[14], 23, -35309556);
    a = hh(a, b, c, d, block[1], 4, -1530992060);
    d = hh(d, a, b, c, block[4], 11, 1272893353);
    c = hh(c, d, a, b, block[7], 16, -155497632);
    b = hh(b, c, d, a, block[10], 23, -1094730640);
    a = hh(a, b, c, d, block[13], 4, 681279174);
    d = hh(d, a, b, c, block[0], 11, -358537222);
    c = hh(c, d, a, b, block[3], 16, -722521979);
    b = hh(b, c, d, a, block[6], 23, 76029189);
    a = hh(a, b, c, d, block[9], 4, -640364487);
    d = hh(d, a, b, c, block[12], 11, -421815835);
    c = hh(c, d, a, b, block[15], 16, 530742520);
    b = hh(b, c, d, a, block[2], 23, -995338651);

    a = ii(a, b, c, d, block[0], 6, -198630844);
    d = ii(d, a, b, c, block[7], 10, 1126891415);
    c = ii(c, d, a, b, block[14], 15, -1416354905);
    b = ii(b, c, d, a, block[5], 21, -57434055);
    a = ii(a, b, c, d, block[12], 6, 1700485571);
    d = ii(d, a, b, c, block[3], 10, -1894986606);
    c = ii(c, d, a, b, block[10], 15, -1051523);
    b = ii(b, c, d, a, block[1], 21, -2054922799);
    a = ii(a, b, c, d, block[8], 6, 1873313359);
    d = ii(d, a, b, c, block[15], 10, -30611744);
    c = ii(c, d, a, b, block[6], 15, -1560198380);
    b = ii(b, c, d, a, block[13], 21, 1309151649);
    a = ii(a, b, c, d, block[4], 6, -145523070);
    d = ii(d, a, b, c, block[11], 10, -1120210379);
    c = ii(c, d, a, b, block[2], 15, 718787259);
    b = ii(b, c, d, a, block[9], 21, -343485551);

    stateMd5[0] = add32(a, stateMd5[0]);
    stateMd5[1] = add32(b, stateMd5[1]);
    stateMd5[2] = add32(c, stateMd5[2]);
    stateMd5[3] = add32(d, stateMd5[3]);
}

function cmn(q, a, b, x, s, t) {
    a = add32(add32(a, q), add32(x, t));
    return add32((a << s) | (a >>> (32 - s)), b);
}

function ff(a, b, c, d, x, s, t) {
    return cmn((b & c) | (~b & d), a, b, x, s, t);
}

function gg(a, b, c, d, x, s, t) {
    return cmn((b & d) | (c & ~d), a, b, x, s, t);
}

function hh(a, b, c, d, x, s, t) {
    return cmn(b ^ c ^ d, a, b, x, s, t);
}

function ii(a, b, c, d, x, s, t) {
    return cmn(c ^ (b | ~d), a, b, x, s, t);
}

function add32(a, b) {
    return (a + b) | 0;
}

function hex32(value) {
    const normalized = value >>> 0;
    return (
        hexByte(normalized & 0xff) +
        hexByte((normalized >>> 8) & 0xff) +
        hexByte((normalized >>> 16) & 0xff) +
        hexByte((normalized >>> 24) & 0xff)
    );
}

function hexByte(value) {
    return value.toString(16).padStart(2, "0");
}
