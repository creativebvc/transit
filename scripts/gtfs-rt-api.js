// Calgary Open Data URLs (Socrata Blob IDs)
const URL_TRIP_UPDATES = "https://data.calgary.ca/download/gs4m-mdc2/application%2Foctet-stream";
const URL_VEHICLE_POSITIONS = "https://data.calgary.ca/download/am7c-qe3u/application%2Foctet-stream";
const URL_ALERTS = "https://data.calgary.ca/download/jhgn-ynqj/application%2Foctet-stream";

// ==========================================
// PROXY FAILOVER SYSTEM
// ==========================================
// We cycle through these if one fails. 
// 'corsproxy.io' is fast. 'allorigins.win' is a good backup for raw binary data.
const PROXIES = [
    "https://corsproxy.io/?",
    "https://api.allorigins.win/raw?url="
];

async function fetchWithFailover(targetUrl) {
    for (const proxyBase of PROXIES) {
        try {
            const fetchUrl = proxyBase + encodeURIComponent(targetUrl);
            // console.log(`Trying proxy: ${proxyBase}`); 

            // Set a timeout so we don't hang forever on a bad proxy
            const controller = new AbortController();
            const timeoutId = setTimeout(() => controller.abort(), 5000); // 5 second timeout

            const response = await fetch(fetchUrl, { signal: controller.signal });
            clearTimeout(timeoutId);

            if (!response.ok) throw new Error(`HTTP ${response.status}`);
            
            // If successful, return the buffer immediately
            return await response.arrayBuffer();

        } catch (error) {
            console.warn(`Proxy ${proxyBase} failed, trying next...`);
            // Loop continues to the next proxy...
        }
    }
    // If we exit the loop, all proxies failed
    throw new Error("All proxies failed to fetch transit data.");
}

// ==========================================
// MAIN FETCH LOGIC
// ==========================================

async function fetchGTFSRT(url) {
    const root = await loadGTFSRTProto();
    if (!root) {
        console.error("Proto root not loaded, cannot fetch.");
        return null;
    }

    const FeedMessage = root.lookupType("transit_realtime.FeedMessage");

    try {
        // Use our new failover system to get the binary data
        const buffer = await fetchWithFailover(url);
        
        // Decode the binary buffer
        const decoded = FeedMessage.decode(new Uint8Array(buffer));
        
        // Convert to Object (with string enums for readability)
        const object = FeedMessage.toObject(decoded, { enums: String });
        return object;

    } catch (error) {
        console.error("❌ GTFS API Error (Persistent):", error);
        return null;
    }
}

async function getTripUpdates() {
    return fetchGTFSRT(URL_TRIP_UPDATES);
}

async function getVehiclePositions() {
    return fetchGTFSRT(URL_VEHICLE_POSITIONS);
}
