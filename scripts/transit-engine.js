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

function unixToMinutes(eta) {
    const now = Math.floor(Date.now() / 1000);
    // Return max(0) so we don't show negative minutes for trains currently at platform
    return Math.max(0, Math.round((eta - now) / 60));
}

function mapRouteColor(routeId) {
    if (routeId.includes(ROUTE_RED)) return "red";
    if (routeId.includes(ROUTE_BLUE)) return "blue";
    return "blue"; // Default fallback
}

// Logic to determine destination based on Line + Direction
function getDestinationName(lineColor, direction) {
    if (direction === 'WEST') {
        return lineColor === 'red' ? "Tuscany" : "69 Street";
    } else {
        return lineColor === 'red' ? "Somerset" : "Saddletowne";
    }
}

// ==========================================
// MAIN LOGIC
// ==========================================

async function buildTrainList() {
    const feed = await getTripUpdates();
    
    if (!feed || !feed.entity) {
        console.warn("No data received from TripUpdates feed");
        return { westTrains: [], eastTrains: [] };
    }

    const westTrains = [];
    const eastTrains = [];

    // Filter Loop
    for (const entity of feed.entity) {
        if (!entity.tripUpdate || !entity.tripUpdate.stopTimeUpdate) continue;

        const trip = entity.tripUpdate;
        const routeId = trip.trip.routeId || "";
        
        // Skip non-CTrain routes (Buses)
        if (!routeId.includes(ROUTE_RED) && !routeId.includes(ROUTE_BLUE)) continue;

        const lineColor = mapRouteColor(routeId);

        // Check every stop update in this trip to see if it matches City Hall
        for (const stopUpdate of trip.stopTimeUpdate) {
            const stopId = stopUpdate.stopId;
            const arrival = stopUpdate.arrival || stopUpdate.departure; // Use either

            if (!arrival || !arrival.time) continue;

            // Handle Int64 (Long) from protobuf which might be an object
            let timeVal = arrival.time;
            if (typeof timeVal === 'object' && timeVal.low) {
                 timeVal = timeVal.low; // Simple conversion for standard timestamps
            }

            const minutes = unixToMinutes(timeVal);

            // Ignore trains that are more than 60 mins away or already left
            if (minutes > 60) continue;

            // --- WESTBOUND MATCH ---
            if (stopId === STOP_CITY_HALL_WEST) {
                westTrains.push({
                    destination: getDestinationName(lineColor, 'WEST'),
                    line: lineColor,
                    minutes: minutes,
                    status: minutes <= 1 ? "Boarding" : "On Time",
                    tripId: trip.trip.tripId // For debugging
                });
            }

            // --- EASTBOUND MATCH ---
            if (stopId === STOP_CITY_HALL_EAST) {
                eastTrains.push({
                    destination: getDestinationName(lineColor, 'EAST'),
                    line: lineColor,
                    minutes: minutes,
                    status: minutes <= 1 ? "Boarding" : "On Time",
                    tripId: trip.trip.tripId
                });
            }
        }
    }

    // Sort by arrival time (ascending)
    westTrains.sort((a, b) => a.minutes - b.minutes);
    eastTrains.sort((a, b) => a.minutes - b.minutes);

    // Remove duplicates (sometimes feeds send ghost updates)
    // We filter so we only show the NEXT 3 unique trips per line color if possible
    return { 
        westTrains: westTrains.slice(0, 3), 
        eastTrains: eastTrains.slice(0, 3) 
    };
}

async function startTransitDashboard() {
    console.log("🚀 Dashboard Engine Started");
    
    async function update() {
        console.log("Fetching live updates...");
        try {
            const { westTrains, eastTrains } = await buildTrainList();
            
            console.log(`Update: ${westTrains.length} Westbound, ${eastTrains.length} Eastbound`);

            // Use the render function from index.html
            // We use 'window' to ensure we are calling the global functions
            if (typeof window.renderColumn === "function") {
                window.renderColumn("westbound-container", westTrains);
                window.renderColumn("eastbound-container", eastTrains);
            } else {
                console.warn("renderColumn function not found in global scope.");
            }

        } catch (e) {
            console.error("Transit Engine Error:", e);
        }
    }

    // Initial run
    update();
    
    // Refresh every 30 seconds
    setInterval(update, 30000); 
}