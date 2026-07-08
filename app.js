// ==========================================
// 1. RELÓGIO EM TEMPO REAL DO ESTÚDIO
// ==========================================
setInterval(() => {
    const clockEl = document.getElementById('live-clock');
    if (clockEl) {
        clockEl.innerText = new Date().toLocaleTimeString('fr-FR') + ' CEST';
    }
}, 1000);

// ==========================================
// 2. CONFIGURAÇÃO INICIAL DO MAPA LEAFLET
// ==========================================
const map = L.map('map', { zoomControl: false }).setView([49.1, -0.4], 8);

// Posiciona os botões de zoom no canto superior direito para libertar o painel
L.control.zoom({ position: 'topright' }).addTo(map);

// Criação de um Pane Customizado para o Radar (Garante a ordem: Mapa -> Radar -> Fronteiras -> Clima)
map.createPane('radar-pane');

// Definição dos Mapas de Fundo (Tiles)
const baseMaps = {
    dark: L.tileLayer('https://{s}.basemaps.cartocdn.com/dark_nolabels/{z}/{x}/{y}{r}.png', { maxZoom: 19 }),
    relief: L.tileLayer('https://{s}.tile.opentopomap.org/{z}/{x}/{y}.png', { maxZoom: 17 })
};
baseMaps.dark.addTo(map); // Ativa o modo escuro por padrão

// Grupos de Camadas para manipulação dinâmica
let bordersLayer = L.layerGroup().addTo(map);
let markersLayer = L.layerGroup().addTo(map);
let radarLayer = null;

// ==========================================
// 3. BASE DE DADOS DE ESTAÇÕES (CIDADES)
// ==========================================
const stations = {
    "basse-normandie": [
        { name: "Caen", lat: 49.1828, lon: -0.3707 },
        { name: "Cherbourg", lat: 49.6337, lon: -1.6221 },
        { name: "Saint-Lô", lat: 49.1161, lon: -1.0908 },
        { name: "Alençon", lat: 48.4323, lon: 0.0913 },
        { name: "Flers", lat: 48.7490, lon: -0.5623 },
        { name: "Lisieux", lat: 49.1459, lon: 0.2253 },
        { name: "Avranches", lat: 48.6828, lon: -1.3617 },
        { name: "Vire", lat: 48.8378, lon: -0.8914 }
    ],
    "haute-normandie": [
        { name: "Rouen", lat: 49.4431, lon: 1.0993 },
        { name: "Le Havre", lat: 49.4944, lon: 0.1079 },
        { name: "Évreux", lat: 49.0241, lon: 1.1508 },
        { name: "Dieppe", lat: 49.9248, lon: 1.0792 }
    ],
    "bretagne": [
        { name: "Rennes", lat: 48.1173, lon: -1.6778 },
        { name: "Brest", lat: 48.3903, lon: -4.4861 },
        { name: "Quimper", lat: 47.9975, lon: -4.0978 },
        { name: "Vannes", lat: 47.6559, lon: -2.7603 }
    ]
};

// ==========================================
// 4. FRONTEIRAS REAIS E MÁSCARA DE DESTAQUE (MÉTODO HOLE)
// ==========================================
async function drawExactBorders(regionKey) {
    bordersLayer.clearLayers();
    let geoUrls = [];

    // Mapeamento dos departamentos franceses oficiais por região
    if (regionKey === 'basse-normandie') {
        geoUrls = ['14', '50', '61'].map(code => `https://geo.api.gouv.fr/departements/${code}?format=geojson&geometry=contour`);
    } else if (regionKey === 'haute-normandie') {
        geoUrls = ['27', '76'].map(code => `https://geo.api.gouv.fr/departements/${code}?format=geojson&geometry=contour`);
    } else if (regionKey === 'bretagne') {
        geoUrls = ['22', '29', '35', '56'].map(code => `https://geo.api.gouv.fr/departements/${code}?format=geojson&geometry=contour`);
    } else if (regionKey === 'france') {
        // Visão geral: centraliza na França e remove qualquer máscara de recorte
        map.setView([46.6, 2.2], 6);
        return;
    }

    // Polígono gigante que cobre todo o planeta Terra (Inverted Mask)
    const maskGeoJSON = {
        "type": "Feature",
        "properties": {},
        "geometry": {
            "type": "Polygon",
            "coordinates": [
                [[-180, 90], [180, 90], [180, -90], [-180, -90], [-180, 90]] // Anel exterior global
            ]
        }
    };

    let bounds = L.latLngBounds();

    try {
        for (const url of geoUrls) {
            const res = await fetch(url);
            const geojson = await res.json();
            const geom = geojson.geometry;
            
            // Insere os contornos geométricos do governo como "furos" na máscara global
            if (geom.type === 'Polygon') {
                maskGeoJSON.geometry.coordinates.push(geom.coordinates[0]);
            } else if (geom.type === 'MultiPolygon') {
                geom.coordinates.forEach(poly => {
                    maskGeoJSON.geometry.coordinates.push(poly[0]);
                });
            }

            // Cria uma camada temporária rápida apenas para estender os limites geográficos do zoom
            const tempLayer = L.geoJSON(geojson);
            bounds.extend(tempLayer.getBounds());
        }

        // Aplica a máscara escura sobre o mapa mantendo apenas o "buraco" da região iluminado
        L.geoJSON(maskGeoJSON, {
            style: {
                fillColor: "#020617",  // Cor idêntica ao fundo do painel lateral
                fillOpacity: 0.80,     // Nível de escurecimento do restante do território
                color: "#38bdf8",      // Traço da fronteira em azul neon cirúrgico
                weight: 3,
                opacity: 1,
                fillRule: "evenodd"    // Regra essencial para processar recortes complexos no Leaflet
            }
        }).addTo(bordersLayer);

        // Ajusta suavemente a câmera e enquadramento do mapa na região selecionada
        map.fitBounds(bounds, { padding: [50, 50] });

    } catch (error) {
        console.error("Erro ao processar as fronteiras via API governamental:", error);
    }
}

// ==========================================
// 5. RADAR METEOROLÓGICO REAL (RAINVIEWER LIVE)
// ==========================================
async function loadLiveRadar() {
    if (radarLayer) map.removeLayer(radarLayer);
    if (!document.getElementById('layer-radar').checked) return;

    try {
        // Obtém o índice de tempo mais recente do satélite
        const res = await fetch('https://api.rainviewer.com/public/weather-maps.json');
        const data = await res.json();
        const latestTime = data.radar.past[data.radar.past.length - 1].time;

        // maxNativeZoom: 7 corrige definitivamente as mensagens de erro no ecrã
        radarLayer = L.tileLayer(`https://tilecache.rainviewer.com/v2/radar/${latestTime}/256/{z}/{x}/{y}/2/1_1.png`, {
            pane: 'radar-pane',
            opacity: 0.55,
            zIndex: 250,
            maxNativeZoom: 7 // Faz o Leaflet reamostrar os blocos estáveis do nível 7 em zooms maiores
        }).addTo(map);
    } catch (error) {
        console.error("Falha ao carregar radar atmosférico RainViewer:", error);
    }
}

// ==========================================
// 6. CONSUMO DE CLIMA EM TEMPO REAL (OPEN-METEO)
// ==========================================
const getWeatherIcon = (code) => {
    if (code === 0) return "☀️";
    if (code <= 3) return "⛅";
    if (code <= 67) return "🌧️";
    return "⛈️";
};

async function loadTemperatures(regionKey) {
    markersLayer.clearLayers();
    const cityList = stations[regionKey] || stations["basse-normandie"];

    for (const city of cityList) {
        try {
            const res = await fetch(`https://api.open-meteo.com/v1/forecast?latitude=${city.lat}&longitude=${city.lon}&current=temperature_2m,weather_code,wind_speed_10m`);
            const data = await res.json();
            
            const temp = Math.round(data.current.temperature_2m);
            const wind = Math.round(data.current.wind_speed_10m);
            const icon = getWeatherIcon(data.current.weather_code);
            
            // Deteta dinamicamente se o utilizador quer ver temperatura ou vento na etiqueta principal
            const activeRadio = document.querySelector('input[name="data-view"]:checked').value;
            const valueDisplay = activeRadio === 'temp' ? `${temp}°C` : `${wind} km/h`;

            // HTML estruturado da etiqueta profissional de estúdio
            const customIcon = L.divIcon({
                className: 'custom-div-icon',
                html: `<div class="weather-station-label"><span class="city">${city.name}</span><div class="flex items-center gap-1">${icon} ${valueDisplay}</div></div>`,
                iconSize: [85, 48],
                iconAnchor: [42, 24]
            });

            L.marker([city.lat, city.lon], { icon: customIcon }).addTo(markersLayer);
        } catch (e) {
            console.error(`Erro na leitura meteorológica de ${city.name}:`, e);
        }
    }
}

// ==========================================
// 7. FERRAMENTA DE DESENHO PARA O REPÓRTER (FRENTES)
// ==========================================
let isDrawing = false;
let currentPoints = [];
let activeLine = null;

document.getElementById('btn-draw').addEventListener('click', (e) => {
    isDrawing = !isDrawing;
    if (isDrawing) {
        e.target.innerText = "Stylos Actif (Double-clic pour finir)";
        e.target.classList.replace('bg-slate-800', 'bg-amber-600');
        map.dragging.disable(); // Desativa o arrastamento do mapa para maior precisão no traço
    } else {
        resetDrawingState();
    }
});

map.on('click', (e) => {
    if (!isDrawing) return;
    currentPoints.push(e.latlng);
    const chosenColor = document.getElementById('draw-color').value;
    
    if (!activeLine) {
        activeLine = L.polyline(currentPoints, { color: chosenColor, weight: 6, opacity: 0.85 }).addTo(map);
    } else {
        activeLine.setLatLngs(currentPoints);
    }
});

map.on('dblclick', () => {
    if (isDrawing) resetDrawingState();
});

function resetDrawingState() {
    isDrawing = false;
    currentPoints = [];
    activeLine = null;
    const btn = document.getElementById('btn-draw');
    if (btn) {
        btn.innerText = "Activer le Stylo";
        btn.classList.replace('bg-amber-600', 'bg-slate-800');
    }
    map.dragging.enable();
}

document.getElementById('btn-clear-draw').addEventListener('click', () => {
    map.eachLayer(layer => { 
        // Remove linhas desenhadas manualmente pelo utilizador (preservando as bordas GeoJSON oficiais)
        if (layer instanceof L.Polyline && !layer.feature) {
            map.removeLayer(layer);
        }
    });
});

// ==========================================
// 8. ESCUTADORES DE EVENTOS DA UI
// ==========================================
document.getElementById('region-selector').addEventListener('change', (e) => {
    const region = e.target.value;
    drawExactBorders(region);
    loadTemperatures(region);
});

document.querySelectorAll('input[name="basemap"]').forEach(radio => {
    radio.addEventListener('change', (e) => {
        Object.values(baseMaps).forEach(layer => map.removeLayer(layer));
        baseMaps[e.target.value].addTo(map);
    });
});

document.querySelectorAll('input[name="data-view"]').forEach(radio => {
    radio.addEventListener('change', () => {
        const region = document.getElementById('region-selector').value;
        loadTemperatures(region);
    });
});

document.getElementById('layer-radar').addEventListener('change', loadLiveRadar);

document.getElementById('btn-refresh-data').addEventListener('click', () => {
    loadLiveRadar();
    loadTemperatures(document.getElementById('region-selector').value);
});

// ==========================================
// 9. INICIALIZAÇÃO AUTOMÁTICA
// ==========================================
drawExactBorders('basse-normandie');
loadTemperatures('basse-normandie');
loadLiveRadar();