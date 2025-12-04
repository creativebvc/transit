// Calgary Open Data URLs (Socrata Blob IDs)
const URL_TRIP_UPDATES = "https://data.calgary.ca/download/gs4m-mdc2/application%2Foctet-stream";
const URL_VEHICLE_POSITIONS = "https://data.calgary.ca/download/am7c-qe3u/application%2Foctet-stream";
const URL_ALERTS = "https://data.calgary.ca/download/jhgn-ynqj/application%2Foctet-stream";

// CORS Proxy (Required for local testing, browser security will block direct access)
const PROXY_URL = "https://corsproxy.io/?"; 

async function fetchGTFSRT(url) {
    const root = await loadGTFSRTProto();
    if (!root) {
        console.error("Proto root not loaded, cannot fetch.");
        return null;
    }

    const FeedMessage = root.lookupType("transit_realtime.FeedMessage");

    try {
        // We wrap the URL in the proxy to bypass CORS
        const fetchUrl = PROXY_URL + encodeURIComponent(url);
        console.log(`Fetching: ${fetchUrl}`);

        const response = await fetch(fetchUrl);
        
        if (!response.ok) throw new Error(`HTTP ${response.status} ${response.statusText}`);

        const buffer = await response.arrayBuffer();
        
        // Decode the binary buffer using the loaded Proto definition
        const decoded = FeedMessage.decode(new Uint8Array(buffer));
        
        // Convert to plain JavaScript Object (with string enums for readability)
        const object = FeedMessage.toObject(decoded, { enums: String });
        return object;

    } catch (error) {
        console.error("❌ API Fetch Error:", error);
        return null;
    }
}

async function getTripUpdates() {
    return fetchGTFSRT(URL_TRIP_UPDATES);
}

async function getVehiclePositions() {
    return fetchGTFSRT(URL_VEHICLE_POSITIONS);
}