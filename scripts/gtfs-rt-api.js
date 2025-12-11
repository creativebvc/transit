// Calgary Open Data URLs
const URL_TRIP_UPDATES = "https://data.calgary.ca/download/gs4m-mdc2/application%2Foctet-stream";
const URL_VEHICLE_POSITIONS = "https://data.calgary.ca/download/am7c-qe3u/application%2Foctet-stream";
const URL_ALERTS = "https://data.calgary.ca/download/jhgn-ynqj/application%2Foctet-stream";

// ==========================================
// YOUR PRIVATE PROXY
// ==========================================
const PROXY_BASE = "https://bvctransitproxy.creative-018.workers.dev/?url=";

async function fetchGTFSRT(targetUrl) {
    const root = await loadGTFSRTProto();
    if (!root) return null;

    const FeedMessage = root.lookupType("transit_realtime.FeedMessage");

    try {
        // --- CACHE BUSTER FIX ---
        // This adds a random number (?cb=123456) to the URL.
        // It forces the server to give us a NEW file, not an old cached one.
        const uniqueUrl = targetUrl + (targetUrl.includes('?') ? '&' : '?') + 'cb=' + Date.now();
        
        const fetchUrl = PROXY_BASE + encodeURIComponent(uniqueUrl);
        
        const response = await fetch(fetchUrl);
        
        if (!response.ok) throw new Error(`HTTP ${response.status}`);
        
        const buffer = await response.arrayBuffer();
        
        if (buffer.byteLength < 100) {
            throw new Error("Data too short/corrupted");
        }

        const decoded = FeedMessage.decode(new Uint8Array(buffer));
        return FeedMessage.toObject(decoded, { enums: String });

    } catch (error) {
        console.error("❌ API Error:", error);
        return null;
    }
}

async function getTripUpdates() { return fetchGTFSRT(URL_TRIP_UPDATES); }
async function getVehiclePositions() { return fetchGTFSRT(URL_VEHICLE_POSITIONS); }
