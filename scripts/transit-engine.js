// ==========================================
// CONFIGURATION
// ==========================================

// Verified Stop IDs for City Hall / Bow Valley College (Free Fare Zone)
// Westbound (Towards Tuscany / 69 St / Downtown West)
const STOP_CITY_HALL_WEST = "6822"; 

// Eastbound (Towards Somerset / Saddletowne / NE / South)
const STOP_CITY_HALL_EAST = "6831"; 

const ROUTE_RED = "201";
const ROUTE_BLUE = "202";

// ==========================================
// UTILITIES
// ==========================================

function getSafeLong(val) {
    if (!val) return 0;
    if (typeof val === 'number') return val;
    if (typeof val.toNumber === 'function') return val.toNumber();
    if (val.low !== undefined) return val.low;
    return 0;
}

function calculateMinutes(eta, referenceTime) {
    // We compare the train's ETA against the City's Server Time (referenceTime)
    // NOT the user's local computer time. This fixes "Ghost Trains".
    const diff = eta - referenceTime;
    
    // FILTER: If train departed more than 60 seconds ago relative to server time
    if (diff < -60) return -1; 
    
    // Return minutes (clamped to 0)
    return Math.max(0, Math.round(diff / 60));
}

function mapRouteColor(routeId) {
    if (routeId.includes(ROUTE_RED)) return "red";
    if (routeId.includes(ROUTE_BLUE)) return "blue";
    return "blue"; // Default fallback
}

function getDestinationName(lineColor, direction) {
    if (direction === 'WEST') {
        return lineColor === 'red' ? "Tuscany" : "69 Street";
    } else {
        return lineColor === 'red' ? "Somerset" : "Saddletowne";
    }
}

// ==========================================
// ALERT LOGIC
// ==========================================

async function updateAlertBanner() {
    const banner = document.getElementById('alert-banner');
    const textSpan = document.getElementById('alert-text');
    if (!banner || !textSpan) return;

    try {
        const feed = await fetchGTFSRT(URL_ALERTS);
        let activeAlertMsg = "";

        if (feed && feed.entity) {
            const alertEntity = feed.entity.find(e => 
                e.alert && e.alert.informedEntity && e.alert.informedEntity.some(ie => 
                    ie.routeId && (ie.routeId.includes('201') || ie.routeId.includes('202'))
                )
            );

            if (alertEntity && alertEntity.alert.headerText && alertEntity.alert.headerText.translation) {
                activeAlertMsg = alertEntity.alert.headerText.translation[0].text;
            }
        }

        if (activeAlertMsg) {
            textSpan.innerText = activeAlertMsg;
            textSpan.classList.add('scrolling');
            banner.classList.remove('hidden');
        } else {
            banner.classList.add('hidden');
            textSpan.classList.remove('scrolling');
        }
    } catch(e) {
        console.warn("Alert fetch failed", e);
    }
}

// ==========================================
// MAIN TRAIN LOGIC
// ==========================================

async function buildTrainList() {
    const feed = await getTripUpdates();
    
    if (!feed || !feed.entity) {
        console.warn("No data received from TripUpdates feed");
        return { westTrains: [], eastTrains: [] };
    }

    // 1. Establish "Server Time" to ignore local clock skew
    let serverTime = Math.floor(Date.now() / 1000); // Fallback
    if (feed.header && feed.header.timestamp) {
        const feedTs = getSafeLong(feed.header.timestamp);
        if (feedTs > 0) {
            serverTime = feedTs;
            console.log(`🕒 Synced to City Server Time: ${new Date(serverTime * 1000).toLocaleTimeString()}`);
        }
    }

    const westTrains = [];
    const eastTrains = [];
    const processedTrips = new Set();
    
    // DEBUG: Track what we see to help troubleshooting
    let debugStopCounts = {}; 

    for (const entity of feed.entity) {
        if (!entity.tripUpdate || !entity.tripUpdate.stopTimeUpdate) continue;

        const trip = entity.tripUpdate;
        const tripId = trip.trip.tripId;
        
        if (processedTrips.has(tripId)) continue;

        const routeId = trip.trip.routeId || "";
        // Strict Filter: Only Red/Blue lines
        if (!routeId.includes(ROUTE_RED) && !routeId.includes(ROUTE_BLUE)) continue;

        const lineColor = mapRouteColor(routeId);

        for (const stopUpdate of trip.stopTimeUpdate) {
            const stopId = stopUpdate.stopId;
            
            // LOGGING: Count how often we see these stops (for debugging)
            if (stopId === STOP_CITY_HALL_WEST || stopId === STOP_CITY_HALL_EAST) {
                debugStopCounts[stopId] = (debugStopCounts[stopId] || 0) + 1;
            }

            const arrival = stopUpdate.arrival || stopUpdate.departure; 
            if (!arrival || !arrival.time) continue;

            const timeVal = getSafeLong(arrival.time);
            
            // Use Server-Relative Calculation
            const minutes = calculateMinutes(timeVal, serverTime);

            // Filter Invalid Times
            if (minutes === -1 || minutes > 60) continue;

            // --- WESTBOUND ---
            if (stopId === STOP_CITY_HALL_WEST) {
                westTrains.push({
                    destination: getDestinationName(lineColor, 'WEST'),
                    line: lineColor,
                    minutes: minutes,
                    status: minutes <= 1 ? "Boarding" : "On Time",
                    tripId: tripId
                });
                processedTrips.add(tripId);
                break; 
            }

            // --- EASTBOUND ---
            if (stopId === STOP_CITY_HALL_EAST) {
                eastTrains.push({
                    destination: getDestinationName(lineColor, 'EAST'),
                    line: lineColor,
                    minutes: minutes,
                    status: minutes <= 1 ? "Boarding" : "On Time",
                    tripId: tripId
                });
                processedTrips.add(tripId);
                break; 
            }
        }
    }

    console.log("🔍 Debug Scan:", { 
        westFound: westTrains.length, 
        eastFound: eastTrains.length,
        stopsSeen: debugStopCounts
    });

    // Sort by time
    westTrains.sort((a, b) => a.minutes - b.minutes);
    eastTrains.sort((a, b) => a.minutes - b.minutes);

    return { 
        westTrains: westTrains.slice(0, 3), 
        eastTrains: eastTrains.slice(0, 3) 
    };
}

// ==========================================
// ENGINE START
// ==========================================

async function startTransitDashboard() {
    console.log("🚀 Dashboard Engine Started (Clock-Proof Mode)");
    
    let failureCount = 0;

    async function update() {
        const liveDot = document.getElementById('live-indicator');
        if (liveDot) liveDot.classList.add('stale');

        try {
            const { westTrains, eastTrains } = await buildTrainList();
            await updateAlertBanner();

            // Render Logic
            const westCont = document.getElementById('westbound-container');
            const eastCont = document.getElementById('eastbound-container');
            
            if (westTrains.length === 0 && eastTrains.length === 0) {
                 const msg = "<div style='opacity:0.6; padding:20px; font-size: 18px; text-align:center'>No trains scheduled next 60m</div>";
                 if (westCont) westCont.innerHTML = msg;
                 if (eastCont) eastCont.innerHTML = msg;
            } else {
                if (typeof window.renderColumn === "function") {
                    if (westTrains.length > 0) window.renderColumn("westbound-container", westTrains);
                    else if (westCont) westCont.innerHTML = "<div style='opacity:0.5; padding:20px'>No Westbound trains</div>";

                    if (eastTrains.length > 0) window.renderColumn("eastbound-container", eastTrains);
                    else if (eastCont) eastCont.innerHTML = "<div style='opacity:0.5; padding:20px'>No Eastbound trains</div>";
                }
            }

            if (liveDot) liveDot.classList.remove('stale');
            failureCount = 0; 

        } catch (e) {
            console.error("Transit Engine Error:", e);
            failureCount++;
            if (failureCount >= 3) {
                const safeMessage = `<div style="font-size: 20px; opacity: 0.7; padding: 20px;">Reconnecting...</div>`;
                const westCont = document.getElementById('westbound-container');
                const eastCont = document.getElementById('eastbound-container');
                if (westCont) westCont.innerHTML = safeMessage;
                if (eastCont) eastCont.innerHTML = safeMessage;
            }
        }
    }

    update();
    setInterval(update, 30000); 
}
