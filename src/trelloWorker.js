// TRELLO WATCHER - WEB WORKER
// Handles polling, filtering, and state management off the main thread in the Vite/React environment.

let intervalId = null;
let listStates = {}; 
let apiKey = '';
let token = '';

// --- CONFIGURATION ---
const POLL_INTERVAL = 15000; // 15 Seconds

// Filter Rules: Cards CONTAINING these keywords are ignored (Case Insensitive)
// This catches "Training - Analyst", "Innovation Gold - XYZ", etc.
const IGNORED_KEYWORDS = [
    "Out of Office",
    "Training",    
    "Innovation",  
    "Divider",
    "Analyst" // Added as safety for "Training - Analyst" if Training is missed
];

self.onmessage = async function(e) {
    const { cmd, payload } = e.data;
    
    if (cmd === 'start') {
        apiKey = payload.apiKey;
        token = payload.token;
        const targets = payload.targets;
        
        // Reset Logic
        if (intervalId) clearInterval(intervalId);
        listStates = {};
        
        startLoop(targets);
    } 
    else if (cmd === 'stop') {
        if (intervalId) clearInterval(intervalId);
        intervalId = null;
        listStates = {};
        postMessage({ type: 'log', msg: 'Worker stopped.' });
    }
};

// --- HELPER FUNCTIONS ---

function shouldIgnore(cardName) {
    if (!cardName) return true;
    const cleanName = cardName.trim().toLowerCase();
    
    // 1. Existing logic: Check if name contains any of the basic keywords
    const hasBasicKeyword = IGNORED_KEYWORDS.some(keyword => 
        cleanName.includes(keyword.toLowerCase())
    );
    if (hasBasicKeyword) return true;

    // 2. Regex Logic
    if (/test/i.test(cardName)) return true;
    if (/ignore/i.test(cardName)) return true;
    if (/\bdemo\b/i.test(cardName)) return true;

    return false;
}

async function trelloFetch(url) {
    const response = await fetch(`${url}?key=${apiKey}&token=${token}`);
    if (response.status === 401) throw new Error('Unauthorized');
    if (!response.ok) throw new Error(`API Error: ${response.status}`);
    return await response.json();
}

// --- MAIN LOOP ---

async function startLoop(targets) {
    postMessage({ type: 'log', msg: `Worker started. Monitoring ${targets.length} lists...` });

    // Helper to process a single cycle
    const checkLists = async (isFirstRun = false) => {
        let globalTotal = 0;
        let bucketStats = [];
        let alarmTriggered = false;

        // Concurrent fetching to eliminate API waterfall delays
        const fetchPromises = targets.map(async (target) => {
            try {
                const rawCards = await trelloFetch(`https://api.trello.com/1/lists/${target.id}/cards`);
                return { success: true, target: target, rawCards: rawCards };
            } catch (error) {
                return { success: false, target: target, error: error };
            }
        });

        // Wait for all lists to return simultaneously
        const results = await Promise.all(fetchPromises);

        // Process results sequentially to maintain the original UI grid order
        for (const result of results) {
            if (!result.success) {
                if (result.error.message === 'Unauthorized') {
                    clearInterval(intervalId);
                    postMessage({ type: 'auth_fail' });
                    return; // Abort cycle
                }
                // Log non-critical errors but keep going
                postMessage({ type: 'log', msg: `Sync error on ${result.target.name}: ${result.error.message}`, isError: true });
                continue;
            }

            const target = result.target;
            const rawCards = result.rawCards;

            // 1. FILTER: Remove Divider Cards based on Keywords
            const activeCards = rawCards.filter(c => !shouldIgnore(c.name));
            
            // 2. STATE: Map current IDs
            const currentSet = new Set(activeCards.map(c => c.id));
            const previousSet = listStates[target.id] || new Set();

            // 3. DETECT NEW: Only if not first run (avoid alarm bomb on startup)
            if (!isFirstRun && !alarmTriggered) {
                // Check for IDs that weren't there before
                const newCard = activeCards.find(c => !previousSet.has(c.id));
                
                if (newCard) {
                    postMessage({ 
                        type: 'alarm', 
                        cardName: newCard.name, 
                        listName: target.name 
                    });
                    alarmTriggered = true; // One alarm per cycle max
                }
            }

            // 4. UPDATE STATE
            listStates[target.id] = currentSet;
            
            // 5. GATHER STATS
            const count = currentSet.size;
            globalTotal += count;
            bucketStats.push({
                id: target.id,
                name: target.name,
                count: count
            });
        }

        // Send Snapshot to Main Thread
        postMessage({ 
            type: 'stats', 
            total: globalTotal,
            buckets: bucketStats 
        });
    };

    // Run immediately once
    await checkLists(true);

    // Start Polling
    intervalId = setInterval(() => {
        checkLists(false);
    }, POLL_INTERVAL);
}