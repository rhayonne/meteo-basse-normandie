// 1. Cidades Principais
const cities = [
    { name: "Caen", lat: 49.1828, lon: -0.3707, dept: "Calvados" },
    { name: "Bayeux", lat: 49.2764, lon: -0.7027, dept: "Calvados" },
    { name: "Lisieux", lat: 49.1459, lon: 0.2253, dept: "Calvados" },
    { name: "Cherbourg", lat: 49.6337, lon: -1.6221, dept: "Manche" },
    { name: "Saint-Lô", lat: 49.1161, lon: -1.0908, dept: "Manche" },
    { name: "Granville", lat: 48.8377, lon: -1.5962, dept: "Manche" },
    { name: "Alençon", lat: 48.4323, lon: 0.0913, dept: "Orne" },
    { name: "Flers", lat: 48.7490, lon: -0.5623, dept: "Orne" },
    { name: "Argentan", lat: 48.7441, lon: -0.0175, dept: "Orne" }
];

// 2. Coordenadas simplificadas que delimitam estritamente o polígono da Basse-Normandie
const basseNormandieGeoJSON = {
    "type": "Feature",
    "properties": {},
    "geometry": {
        "type": "Polygon",
        "coordinates": [[
            [-1.85, 49.70], [-1.00, 49.45], [-0.55, 49.40], [0.10, 49.45],
            [0.45, 49.25], [0.85, 48.85], [0.80, 48.45], [0.25, 48.35],
            [-0.95, 48.50], [-1.65, 48.60], [-1.80, 48.90], [-2.05, 49.40],
            [-1.85, 49.70]
        ]]
    }
};

// 3. Inicialização e Ajuste Fino do Mapa
const map = L.map('map').setView([49.1, -0.4], 9);

// Criação de Pane Customizado para Nuvens (Garante ordem visual: Mapa -> Nuvens -> Marcadores)
map.createPane('weather-clouds-pane');

const tileLayers = {
    relevo: L.tileLayer('https://{s}.tile.opentopomap.org/{z}/{x}/{y}.png', { maxZoom: 17 }),
    satelite: L.tileLayer('https://server.arcgisonline.com/ArcGIS/rest/services/World_Imagery/MapServer/tile/{z}/{x}/{y}'),
    standard: L.tileLayer('https://{s}.basemaps.cartocdn.com/dark_all/{z}/{x}/{y}{r}.png')
};
tileLayers.relevo.addTo(map);

// Destacar apenas a Baixa Normandia usando uma borda estilizada sobre o GeoJSON
L.geoJSON(basseNormandieGeoJSON, {
    style: {
        color: "#38bdf8",     // Azul brilhante para destacar a borda da região
        weight: 3,
        fillColor: "#0f172a",
        fillOpacity: 0.1      // Deixa o interior nítido
    }
}).addTo(map);

let markersGroup = L.layerGroup().addTo(map);
let cloudsGroup = L.layerGroup().addTo(map);
let displayMode = 'temp';

// 4. Camada de Imagens de Nuvens Estilizadas (Simuladas atrás das temperaturas)
function renderCloudLayers() {
    cloudsGroup.clearLayers();
    if (!document.getElementById('layer-clouds').checked) return;

    // Adiciona imagens de nuvens PNG semitransparentes em áreas estratégicas do mapa
    const cloudBounds1 = [[49.3, -1.5], [49.7, -0.8]]; // Norte / Cotentin
    const cloudBounds2 = [[48.6, -0.5], [49.0, 0.3]];  // Sul / Orne

    // Usando uma imagem pública de padrão de nuvem realista
    const cloudImgUrl = 'https://upload.wikimedia.org/wikipedia/commons/d/d7/Nimbus_cloud_transparent.png';

    L.imageOverlay(cloudImgUrl, cloudBounds1, { opacity: 0.45, pane: 'weather-clouds-pane' }).addTo(cloudsGroup);
    L.imageOverlay(cloudImgUrl, cloudBounds2, { opacity: 0.35, pane: 'weather-clouds-pane' }).addTo(cloudsGroup);
}

// 5. Motor de Busca de Dados da API (Open-Meteo)
function getWeatherIcon(code) {
    if (code === 0) return "☀️";
    if (code >= 1 && code <= 3) return "☁️";
    return "🌧️";
}

async function fetchWeatherData() {
    markersGroup.clearLayers();
    renderCloudLayers();

    for (const city of cities) {
        try {
            const url = `https://api.open-meteo.com/v1/forecast?latitude=${city.lat}&longitude=${city.lon}&current=temperature_2m,weather_code,wind_speed_10m`;
            const response = await fetch(url);
            const data = await response.json();

            const temp = Math.round(data.current.temperature_2m);
            const wind = Math.round(data.current.wind_speed_10m);
            const icon = getWeatherIcon(data.current.weather_code);
            const displayText = displayMode === 'temp' ? `${temp}°C` : `${wind} km/h`;

            const customLabel = L.divIcon({
                className: 'weather-label-container',
                html: `<div class="weather-icon-label"><span class="text-[10px] text-gray-400 block">${city.name}</span>${icon} ${displayText}</div>`,
                iconSize: [75, 38]
            });

            L.marker([city.lat, city.lon], { icon: customLabel }).addTo(markersGroup);
        } catch (e) { console.error(e); }
    }
}

// 6. Lógica Interativa para Linhas Dinâmicas (Frentes/Rotas de vento)
let isDrawingMode = false;
let currentLinePoints = [];
let activePolyline = null;

document.getElementById('btn-draw').addEventListener('click', (e) => {
    isDrawingMode = !isDrawingMode;
    if (isDrawingMode) {
        e.target.innerText = "Mode Dessin: actif (Cliquez sur la carte)";
        e.target.classList.replace('bg-gray-700', 'bg-amber-600');
        map.dragging.disable(); // Facilita o traçado preciso bloqueando o arrasto arrastado
    } else {
        resetDrawingState();
    }
});

map.on('click', (e) => {
    if (!isDrawingMode) return;

    currentLinePoints.push(e.latlng);
    const chosenColor = document.getElementById('line-color').value;

    if (!activePolyline) {
        activePolyline = L.polyline(currentLinePoints, { color: chosenColor, weight: 5, dashArray: '10, 10' }).addTo(map);
    } else {
        activePolyline.setLatLngs(currentLinePoints);
    }
});

// Finalizar linha com o clique duplo do mouse
map.on('dblclick', () => {
    if (isDrawingMode) resetDrawingState();
});

function resetDrawingState() {
    isDrawingMode = false;
    currentLinePoints = [];
    activePolyline = null;
    const btn = document.getElementById('btn-draw');
    btn.innerText = "Mode Dessin: Activer Clic";
    btn.classList.replace('bg-amber-600', 'bg-gray-700');
    map.dragging.enable();
}

document.getElementById('btn-clear-lines').addEventListener('click', () => {
    map.eachLayer((layer) => {
        if (layer instanceof L.Polyline && !layer._geoJSON) {
            map.removeLayer(layer);
        }
    });
    // Garante que mantém a borda protetora
    L.geoJSON(basseNormandieGeoJSON, { style: { color: "#38bdf8", weight: 3, fillOpacity: 0.1 } }).addTo(map);
});

// 7. Handlers Globais de Mudança de Filtros
document.querySelectorAll('input[name="map-tile"]').forEach(r => r.addEventListener('change', (e) => {
    Object.values(tileLayers).forEach(l => map.removeLayer(l));
    tileLayers[e.target.value].addTo(map);
}));
document.querySelectorAll('input[name="data-view"]').forEach(r => r.addEventListener('change', (e) => { displayMode = e.target.value; fetchWeatherData(); }));
document.getElementById('layer-clouds').addEventListener('change', renderCloudLayers);
document.getElementById('btn-refresh').addEventListener('click', fetchWeatherData);

fetchWeatherData();