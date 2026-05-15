const COURSE_DATA = [
    { hole: 1, par: 4, index: 3 },
    { hole: 2, par: 4, index: 9 },
    { hole: 3, par: 5, index: 11 },
    { hole: 4, par: 3, index: 13 },
    { hole: 5, par: 4, index: 7 },
    { hole: 6, par: 3, index: 15 },
    { hole: 7, par: 4, index: 5 },
    { hole: 8, par: 3, index: 17 },
    { hole: 9, par: 4, index: 1 }
];

let state = {
    players: [], // { name, shcp }
    scores: {},  // name -> [score_h1, ..., score_h9]
    putts: {},   // name -> [putts_h1, ..., putts_h9]
    fir: {},     // name -> [fir_h1, ..., fir_h9]
    shots: {},   // hole -> [ {lat, lng, timestamp} ]
    currentHole: 1,
    date: null
};

// DOM Elements
const views = document.querySelectorAll('.view');
const btnHistoryToggle = document.getElementById('btn-history-toggle');
const btnSlopeToggle = document.getElementById('btn-slope-toggle');
const headerTitle = document.getElementById('header-title');

// Start View
const setupPlayersList = document.getElementById('setup-players-list');
const inputPlayerName = document.getElementById('input-player-name');
const inputPlayerShcp = document.getElementById('input-player-shcp');
const btnAddPlayer = document.getElementById('btn-add-player');
const btnStartRound = document.getElementById('btn-start-round');

// Hole View
const currentHoleNumber = document.getElementById('current-hole-number');
const currentHolePar = document.getElementById('current-hole-par');
const currentHoleIndex = document.getElementById('current-hole-index');
const currentHoleImg = document.getElementById('current-hole-img');
const btnPrevHole = document.getElementById('btn-prev-hole');
const btnNextHole = document.getElementById('btn-next-hole');
const btnFinishRound = document.getElementById('btn-finish-round');
const scoringPlayersList = document.getElementById('scoring-players-list');

// Hole View - Media & Map
const btnShowImage = document.getElementById('btn-show-image');
const btnShowMap = document.getElementById('btn-show-map');
const holeImageWrapper = document.getElementById('hole-image-wrapper');
const holeMapWrapper = document.getElementById('hole-map-wrapper');
const btnSaveGps = document.getElementById('btn-save-gps');
const btnFetchGps = document.getElementById('btn-fetch-gps');

// Map variables
let map = null;
let markerGroup = null;
let draftMarker = null;

// Scorecard View
const scorecardSummaries = document.getElementById('scorecard-summaries');
const btnSaveRound = document.getElementById('btn-save-round');
const btnDiscardRound = document.getElementById('btn-discard-round');

// History View
const historyList = document.getElementById('history-list');
const btnBackToStart = document.getElementById('btn-back-to-start');

// Slope View
const btnBackFromSlope = document.getElementById('btn-back-from-slope');

// Initialization
async function init() {
    setupEventListeners();
    initMap();
    try {
        const activeRound = await window.GolfDB.getActiveRound();
        if (activeRound && activeRound.players && activeRound.players.length > 0) {
            state = activeRound;
            showView('view-hole');
            renderHoleView();
        } else {
            showView('view-start');
            renderStartView();
        }
    } catch (e) {
        console.error("Failed to load active round", e);
        showView('view-start');
        renderStartView();
    }
}

function setupEventListeners() {
    btnAddPlayer.addEventListener('click', addPlayer);
    btnStartRound.addEventListener('click', startRound);
    
    btnPrevHole.addEventListener('click', () => {
        if (state.currentHole > 1) {
            state.currentHole--;
            renderHoleView();
            saveState();
        }
    });
    
    btnNextHole.addEventListener('click', () => {
        if (state.currentHole < 9) {
            state.currentHole++;
            renderHoleView();
            saveState();
        }
    });
    
    btnFinishRound.addEventListener('click', () => {
        showView('view-scorecard');
        renderScorecard();
    });
    
    btnSaveRound.addEventListener('click', saveRoundToHistory);
    btnDiscardRound.addEventListener('click', discardRound);
    
    btnHistoryToggle.addEventListener('click', () => {
        showView('view-history');
        renderHistory();
    });
    
    btnSlopeToggle.addEventListener('click', () => {
        showView('view-slope');
    });
    
    btnBackToStart.addEventListener('click', () => {
        showView('view-start');
    });

    btnBackFromSlope.addEventListener('click', () => {
        showView('view-start');
    });

    // Map Toggles
    btnShowImage.addEventListener('click', () => {
        holeMapWrapper.classList.add('hidden');
        holeImageWrapper.classList.remove('hidden');
        btnShowImage.className = 'px-2 py-1 text-xs font-label-bold rounded bg-primary text-on-primary';
        btnShowMap.className = 'px-2 py-1 text-xs font-label-bold rounded text-on-surface hover:bg-surface-variant transition-colors';
    });

    btnShowMap.addEventListener('click', () => {
        holeImageWrapper.classList.add('hidden');
        holeMapWrapper.classList.remove('hidden');
        btnShowMap.className = 'px-2 py-1 text-xs font-label-bold rounded bg-primary text-on-primary';
        btnShowImage.className = 'px-2 py-1 text-xs font-label-bold rounded text-on-surface hover:bg-surface-variant transition-colors';
        if (map) {
            setTimeout(() => { 
                map.invalidateSize(); 
                fetchGpsAndPlaceMarker();
            }, 100);
        }
    });

    // GPS save
    btnSaveGps.addEventListener('click', saveGpsPosition);
    btnFetchGps.addEventListener('click', fetchGpsAndPlaceMarker);
}

function initMap() {
    map = L.map('map').setView([57.7, 11.9], 13);
    L.tileLayer('https://server.arcgisonline.com/ArcGIS/rest/services/World_Imagery/MapServer/tile/{z}/{y}/{x}', {
        maxZoom: 19,
        attribution: 'Tiles &copy; Esri &mdash; Source: Esri'
    }).addTo(map);

    markerGroup = L.layerGroup().addTo(map);
}

function fetchGpsAndPlaceMarker() {
    if (!navigator.geolocation) {
        alert("GPS stöds inte av din webbläsare.");
        return;
    }

    const originalText = btnFetchGps.textContent;
    btnFetchGps.textContent = "Söker...";
    btnFetchGps.disabled = true;

    navigator.geolocation.getCurrentPosition(
        (position) => {
            btnFetchGps.textContent = originalText;
            btnFetchGps.disabled = false;

            const lat = position.coords.latitude;
            const lng = position.coords.longitude;
            
            if (!draftMarker) {
                draftMarker = L.marker([lat, lng], {draggable: true}).addTo(map);
                draftMarker.bindPopup("Dra mig för att justera!").openPopup();
            } else {
                draftMarker.setLatLng([lat, lng]);
                draftMarker.openPopup();
            }
            map.setView([lat, lng], 18);
        },
        (error) => {
            btnFetchGps.textContent = originalText;
            btnFetchGps.disabled = false;
            alert("Kunde inte hämta position: " + error.message);
        },
        { enableHighAccuracy: true, timeout: 10000, maximumAge: 0 }
    );
}

function saveGpsPosition() {
    if (!draftMarker) {
        alert("Ingen position att spara ännu. Klicka på 'Hämta GPS' först.");
        return;
    }

    const latlng = draftMarker.getLatLng();
    const lat = latlng.lat;
    const lng = latlng.lng;
            
    if (!state.shots[state.currentHole]) {
        state.shots[state.currentHole] = [];
    }
    
    state.shots[state.currentHole].push({
        lat: lat,
        lng: lng,
        timestamp: new Date().toISOString()
    });

    saveState();
    updateMapForHole();
    alert("Position sparad!");
    
    map.removeLayer(draftMarker);
    draftMarker = null;
}

function updateMapForHole() {
    if (!map || !markerGroup) return;
    
    markerGroup.clearLayers();
    const shots = state.shots[state.currentHole] || [];
    
    if (shots.length > 0) {
        const latlngs = [];
        shots.forEach((shot, index) => {
            const marker = L.marker([shot.lat, shot.lng]).bindPopup(`Slag ${index + 1}`);
            markerGroup.addLayer(marker);
            latlngs.push([shot.lat, shot.lng]);
        });
        
        if (shots.length > 1) {
            const polyline = L.polyline(latlngs, {color: '#10b981'});
            markerGroup.addLayer(polyline);
        }

        const bounds = L.latLngBounds(latlngs);
        map.fitBounds(bounds, { padding: [20, 20], maxZoom: 18 });
    }
}

function showView(viewId) {
    views.forEach(v => {
        v.classList.add('hidden');
        v.classList.remove('flex');
    });
    
    const view = document.getElementById(viewId);
    if(view) {
        view.classList.remove('hidden');
        view.classList.add('flex');
    }
    
    // Update Header
    if (viewId === 'view-hole') {
        document.getElementById('generic-header').classList.add('hidden');
    } else {
        document.getElementById('generic-header').classList.remove('hidden');
        if (viewId === 'view-start') {
            btnHistoryToggle.classList.remove('hidden');
            btnSlopeToggle.classList.remove('hidden');
        } else {
            btnHistoryToggle.classList.add('hidden');
            btnSlopeToggle.classList.add('hidden');
        }
    }
}

async function saveState() {
    await window.GolfDB.saveActiveRound(state);
}

// Start View Logic
function renderStartView() {
    setupPlayersList.innerHTML = '';
    state.players.forEach((p, index) => {
        const li = document.createElement('li');
        li.className = "flex justify-between items-center bg-surface-container rounded-lg px-4 py-3 border border-outline-variant/30";
        li.innerHTML = `
            <div class="flex flex-col">
                <span class="font-label-bold text-on-surface">${p.name}</span>
                <span class="text-xs text-on-surface-variant">SHCP: ${p.shcp}</span>
            </div>
            <button class="text-error hover:bg-error-container/50 p-2 rounded-full transition-colors flex items-center justify-center" onclick="removePlayer(${index})">
                <span class="material-symbols-outlined text-[20px]">delete</span>
            </button>
        `;
        setupPlayersList.appendChild(li);
    });
    btnStartRound.disabled = false;
}

function addPlayer() {
    const name = inputPlayerName.value.trim();
    const shcp = parseInt(inputPlayerShcp.value, 10);
    
    if (name && !isNaN(shcp)) {
        state.players.push({ name, shcp });
        state.scores[name] = Array(9).fill(0);
        state.putts[name] = Array(9).fill(0);
        state.fir[name] = Array(9).fill(false);
        
        inputPlayerName.value = '';
        inputPlayerShcp.value = '';
        renderStartView();
    } else {
        alert("Fyll i både namn och Spelhandicap.");
    }
}

window.removePlayer = function(index) {
    const name = state.players[index].name;
    state.players.splice(index, 1);
    delete state.scores[name];
    delete state.putts[name];
    delete state.fir[name];
    renderStartView();
};

function startRound() {
    if (state.players.length === 0) {
        const name = inputPlayerName.value.trim();
        const shcp = parseInt(inputPlayerShcp.value, 10);
        if (name && !isNaN(shcp)) {
            addPlayer();
        } else {
            alert("Lägg till minst en spelare (namn och SHCP) innan du startar rundan.");
            return;
        }
    }
    
    // In case addPlayer failed for some reason
    if (state.players.length === 0) return;
    
    state.currentHole = 1;
    state.date = new Date().toISOString();
    
    state.players.forEach(p => {
        if (!state.scores[p.name]) {
            state.scores[p.name] = Array(9).fill(0);
        }
        if (!state.putts) state.putts = {};
        if (!state.putts[p.name]) {
            state.putts[p.name] = Array(9).fill(0);
        }
        if (!state.fir) state.fir = {};
        if (!state.fir[p.name]) {
            state.fir[p.name] = Array(9).fill(false);
        }
    });
    
    state.players.forEach(p => {
        if (state.scores[p.name][0] === 0) {
            state.scores[p.name][0] = COURSE_DATA[0].par;
        }
    });
    
    saveState();
    showView('view-hole');
    renderHoleView();
}

// Hole View Logic
function renderHoleView() {
    const holeIndex = state.currentHole - 1;
    const holeData = COURSE_DATA[holeIndex];
    
    currentHoleNumber.textContent = `Hole ${state.currentHole}`;
    currentHolePar.textContent = holeData.par;
    currentHoleIndex.textContent = holeData.index;
    currentHoleImg.src = `images/hal-${state.currentHole}.png`;
    
    btnPrevHole.style.visibility = state.currentHole === 1 ? 'hidden' : 'visible';
    
    if (state.currentHole === 9) {
        btnNextHole.style.visibility = 'hidden';
        btnFinishRound.classList.remove('hidden');
    } else {
        btnNextHole.style.visibility = 'visible';
        btnFinishRound.classList.add('hidden');
    }

    // Render Mini-Grid
    renderMiniGrid();
    
    scoringPlayersList.innerHTML = '';
    
    state.players.forEach(p => {
        let score = state.scores[p.name][holeIndex];
        if (score === 0) {
            score = holeData.par;
            state.scores[p.name][holeIndex] = score;
        }
        
        const points = calculatePoints(p, holeIndex, score);
        const isPar3 = holeData.par === 3;
        const isFirHit = state.fir[p.name][holeIndex];
        const putts = state.putts[p.name][holeIndex] || 0;
        
        const card = document.createElement('div');
        card.className = "bg-surface-container-lowest rounded-xl p-card-padding shadow-lg shadow-primary/5 flex flex-col gap-4 border border-outline-variant/30";
        card.innerHTML = `
            <div class="flex justify-between items-center border-b border-outline-variant/50 pb-2">
                <h3 class="font-headline-md text-headline-md text-on-surface">${p.name}</h3>
                <span class="font-label-bold text-primary">${points} poäng</span>
            </div>

            <div class="flex items-center justify-between">
                <div>
                    <h3 class="font-body-lg text-body-lg text-on-surface">Score</h3>
                    <p class="font-label-sm text-label-sm text-on-surface-variant">Slag totalt</p>
                </div>
                <div class="flex items-center gap-4">
                    <button onclick="updateScore('${p.name}', -1)" class="w-12 h-12 rounded-full bg-surface-container text-primary hover:bg-primary-fixed hover:text-on-primary-fixed transition-colors flex items-center justify-center active:scale-90 shadow-sm">
                        <span class="material-symbols-outlined text-2xl">remove</span>
                    </button>
                    <div class="w-12 text-center">
                        <span class="font-score-display text-score-display text-on-surface">${score}</span>
                    </div>
                    <button onclick="updateScore('${p.name}', 1)" class="w-12 h-12 rounded-full bg-primary text-on-primary hover:bg-primary-container transition-colors flex items-center justify-center active:scale-90 shadow-md shadow-primary/20">
                        <span class="material-symbols-outlined text-2xl">add</span>
                    </button>
                </div>
            </div>
            
            <div class="flex items-center justify-between mt-2 border-t border-outline-variant/30 pt-4">
                <div>
                    <h3 class="font-body-lg text-body-lg text-on-surface">Puttar</h3>
                    <p class="font-label-sm text-label-sm text-on-surface-variant">På green</p>
                </div>
                <div class="flex items-center gap-3">
                    <button onclick="updatePutts('${p.name}', -1)" class="w-10 h-10 rounded-full bg-surface-container-low text-secondary hover:bg-surface-variant transition-colors flex items-center justify-center active:scale-90">
                        <span class="material-symbols-outlined">remove</span>
                    </button>
                    <div class="w-8 text-center">
                        <span class="font-headline-md text-headline-md text-on-surface">${putts}</span>
                    </div>
                    <button onclick="updatePutts('${p.name}', 1)" class="w-10 h-10 rounded-full bg-surface-container text-on-surface hover:bg-surface-variant transition-colors flex items-center justify-center active:scale-90">
                        <span class="material-symbols-outlined">add</span>
                    </button>
                </div>
            </div>

            <div class="grid grid-cols-1 gap-4 mt-2">
                <button onclick="toggleFIR('${p.name}', ${!isFirHit})" class="${isFirHit ? 'bg-primary-container text-on-primary-container' : 'bg-surface-container-low text-on-surface-variant hover:bg-surface-variant'} rounded-lg py-3 px-4 flex items-center justify-center gap-2 active:scale-95 transition-all shadow-sm">
                    <span class="material-symbols-outlined" style="font-variation-settings: 'FILL' ${isFirHit ? '1' : '0'};">check_circle</span>
                    <span class="font-label-bold text-label-bold">${isPar3 ? 'GIR Hit' : 'Fairway Hit'}</span>
                </button>
            </div>
        `;
        scoringPlayersList.appendChild(card);
    });
    
    saveState();
    updateMapForHole();
}

function renderMiniGrid() {
    const gridContainer = document.getElementById('scorecard-mini-grid');
    gridContainer.innerHTML = '';

    // Only render mini grid for the first player to save space, or combined.
    // For simplicity, we just use the first player's scores to give context of where we are.
    const player = state.players[0]; 
    if (!player) return;

    COURSE_DATA.forEach((hole, idx) => {
        const isActive = (idx + 1) === state.currentHole;
        const score = state.scores[player.name][idx] || 0;
        
        const isCompleted = score > 0 && !isActive;
        const isUpcoming = score === 0 && !isActive;

        let bgClass = "bg-surface-container-low opacity-70";
        let textClass = "text-on-surface-variant";
        let scoreText = "-";
        
        if (isActive) {
            bgClass = "bg-primary-container border-2 border-primary shadow-md";
            textClass = "text-on-primary-container";
            scoreText = score > 0 ? score : "-";
        } else if (isCompleted) {
            bgClass = "bg-surface-container-lowest border border-outline-variant";
            textClass = "text-on-surface";
            scoreText = score;
        }

        gridContainer.innerHTML += `
            <div class="min-w-[60px] snap-center ${bgClass} rounded-lg p-2 flex flex-col items-center">
                <span class="font-label-sm text-label-sm ${textClass}">${hole.hole}</span>
                <span class="font-headline-md text-headline-md ${textClass} my-1">${scoreText}</span>
                <span class="text-[10px] ${textClass}">P${hole.par}</span>
            </div>
        `;
    });
}

window.updateScore = function(playerName, delta) {
    const holeIndex = state.currentHole - 1;
    let score = state.scores[playerName][holeIndex];
    
    score += delta;
    if (score < 1) score = 1;
    if (score > 15) score = 15;
    
    state.scores[playerName][holeIndex] = score;
    renderHoleView();
};

window.updatePutts = function(playerName, delta) {
    const holeIndex = state.currentHole - 1;
    let p = state.putts[playerName][holeIndex] || 0;
    
    p += delta;
    if (p < 0) p = 0;
    if (p > 10) p = 10;
    
    state.putts[playerName][holeIndex] = p;
    saveState();
    renderHoleView();
};

window.toggleFIR = function(playerName, isHit) {
    const holeIndex = state.currentHole - 1;
    state.fir[playerName][holeIndex] = isHit;
    saveState();
    renderHoleView(); // Force re-render to update the toggle class
};

function calculatePoints(player, holeIndex, score) {
    if (score === 0) return 0;
    
    const holeData = COURSE_DATA[holeIndex];
    const shcp = player.shcp;
    const holeRank = (holeData.index + 1) / 2; 
    
    let extraStrokes = 0;
    if (shcp >= 0) {
        extraStrokes = Math.floor(shcp / 9) + (holeRank <= (shcp % 9) ? 1 : 0);
    } else {
        const absShcp = Math.abs(shcp);
        const penalty = Math.floor(absShcp / 9) + ((10 - holeRank) <= (absShcp % 9) ? 1 : 0);
        extraStrokes = -penalty;
    }
    
    const netScore = score - extraStrokes;
    const points = Math.max(0, 2 + (holeData.par - netScore));
    return points;
}

// Scorecard View Logic
function renderScorecard() {
    scorecardSummaries.innerHTML = '';
    
    state.players.forEach(p => {
        let totalScore = 0;
        let totalPoints = 0;
        let totalPutts = 0;
        let firHits = 0;
        let firPossible = 0;

        COURSE_DATA.forEach((hole, idx) => {
            const score = state.scores[p.name][idx] || 0;
            totalScore += score;
            totalPoints += calculatePoints(p, idx, score);
            
            totalPutts += state.putts[p.name][idx] || 0;
            
            // Only count par 4 and 5 for fairway (or GIR for par 3, let's treat it all as GIR/Fairway hit)
            firPossible++;
            if (state.fir[p.name][idx]) {
                firHits++;
            }
        });

        const card = document.createElement('div');
        card.className = "bg-surface-container-lowest rounded-xl p-card-padding shadow-soft flex flex-col items-center gap-4 border border-outline-variant/30 relative overflow-hidden";
        card.innerHTML = `
            <div class="absolute top-0 right-0 w-64 h-64 bg-primary-container/5 rounded-full -mr-32 -mt-32 pointer-events-none"></div>
            <h3 class="w-full text-left font-headline-md text-on-surface border-b border-outline-variant/50 pb-2 z-10">${p.name}</h3>
            <div class="flex w-full items-center justify-between gap-6 z-10">
                <div class="text-left flex-1">
                    <p class="font-label-sm text-secondary mb-1">Slag / Poäng</p>
                    <div class="flex items-baseline justify-start gap-2">
                        <span class="font-score-display text-score-display text-primary">${totalScore}</span>
                        <span class="font-headline-md text-headline-md text-primary-container">${totalPoints}p</span>
                    </div>
                </div>
            </div>
            
            <div class="grid grid-cols-2 gap-4 w-full mt-2 z-10">
                <div class="bg-surface-container-low rounded-xl p-3 border border-outline-variant/30 flex flex-col justify-between">
                    <p class="font-label-sm text-label-sm text-on-surface mb-2">Fairways/GIR</p>
                    <div class="flex items-end gap-2">
                        <span class="font-headline-md text-primary">${firHits}</span>
                        <span class="font-label-sm text-on-surface-variant pb-1">/ ${firPossible}</span>
                    </div>
                </div>
                <div class="bg-surface-container-low rounded-xl p-3 border border-outline-variant/30 flex flex-col justify-between">
                    <p class="font-label-sm text-label-sm text-on-surface mb-2">Puttar</p>
                    <p class="font-headline-md text-primary">${totalPutts}</p>
                </div>
            </div>
        `;
        scorecardSummaries.appendChild(card);
    });
}

async function saveRoundToHistory() {
    await window.GolfDB.saveHistory(state);
    await window.GolfDB.clearActiveRound();
    resetState();
    showView('view-history');
    renderHistory();
}

async function discardRound() {
    if (confirm("Är du säker på att du vill kasta denna runda? Den kan inte återskapas.")) {
        await window.GolfDB.clearActiveRound();
        resetState();
        showView('view-start');
        renderStartView();
    }
}

function resetState() {
    state = {
        players: [],
        scores: {},
        putts: {},
        fir: {},
        shots: {},
        currentHole: 1,
        date: null
    };
}

// History View Logic
async function renderHistory() {
    historyList.innerHTML = '<li class="text-center p-4">Laddar...</li>';
    try {
        const history = await window.GolfDB.getHistory();
        historyList.innerHTML = '';
        
        if (history.length === 0) {
            historyList.innerHTML = '<li class="text-center p-4 text-on-surface-variant">Ingen historik hittades.</li>';
            return;
        }
        
        history.forEach(round => {
            const date = new Date(round.completedAt).toLocaleDateString('sv-SE', {
                year: 'numeric', month: 'short', day: 'numeric', hour: '2-digit', minute: '2-digit'
            });
            
            const li = document.createElement('li');
            li.className = 'bg-surface-container-lowest rounded-xl p-4 shadow-sm border border-outline-variant/30';
            
            let html = `<div class="font-label-sm text-secondary mb-2 border-b border-outline-variant/30 pb-2">${date}</div><div class="flex flex-col gap-3">`;
            
            round.players.forEach(p => {
                let totalScore = 0;
                let totalPoints = 0;
                let totalPutts = 0;
                let firHits = 0;
                let firPossible = 0;
                
                for (let i = 0; i < 9; i++) {
                    const score = round.scores[p.name][i] || 0;
                    totalScore += score;
                    const points = calculatePoints(p, i, score);
                    totalPoints += points;
                    
                    if (round.putts && round.putts[p.name]) {
                        totalPutts += round.putts[p.name][i] || 0;
                    }
                    if (round.fir && round.fir[p.name]) {
                        firPossible++;
                        if (round.fir[p.name][i]) {
                            firHits++;
                        }
                    }
                }
                
                let statsHtml = '';
                if (totalPutts > 0 || firPossible > 0) {
                    statsHtml = `<div class="text-xs text-on-surface-variant mt-1">Puttar: ${totalPutts} | FIR/GIR: ${firHits}/${firPossible}</div>`;
                }
                
                html += `
                    <div class="flex flex-col">
                        <div class="flex justify-between items-center w-full">
                            <strong class="text-on-surface">${p.name}</strong>
                            <span class="text-primary font-label-bold">${totalScore} slag (${totalPoints}p)</span>
                        </div>
                        ${statsHtml}
                    </div>
                `;
            });
            
            html += `</div>`;
            li.innerHTML = html;
            historyList.appendChild(li);
        });
        
    } catch (e) {
        historyList.innerHTML = '<li class="text-center p-4 text-error">Kunde inte hämta historik.</li>';
    }
}

// Start app
document.addEventListener('DOMContentLoaded', init);
