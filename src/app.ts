// Importar o GeoJSON de alta fidelidade que delimita exatamente Calvados, Manche e Orne
import basseNormandieGeoJSON from './basse-normandie-depts.json';
import html2canvas from 'html2canvas';
import GIF from 'gif.js';
import { getWeatherIconUrl, getWeatherLabel, getIconStyle, setIconStyle, AVAILABLE_ICON_STYLES } from './weatherIcons';

declare const maplibregl: any;

// 1. Définition de la structure des villes
interface City {
    name: string;
    lat: number;
    lon: number;
    dept: string;
}

const DEFAULT_CITIES: City[] = [
    { name: "Caen", lat: 49.1828, lon: -0.3707, dept: "Calvados" },
    { name: "Bayeux", lat: 49.2764, lon: -0.7027, dept: "Calvados" },
    { name: "Lisieux", lat: 49.1459, lon: 0.2253, dept: "Calvados" },
    { name: "Falaise", lat: 48.8964, lon: -0.1911, dept: "Calvados" },
    { name: "Cherbourg", lat: 49.6337, lon: -1.6221, dept: "Manche" },
    { name: "Saint-Lô", lat: 49.1161, lon: -1.0908, dept: "Manche" },
    { name: "Granville", lat: 48.8377, lon: -1.5962, dept: "Manche" },
    { name: "Avranches", lat: 48.6853, lon: -1.3639, dept: "Manche" },
    { name: "Coutances", lat: 49.0463, lon: -1.4442, dept: "Manche" },
    { name: "Alençon", lat: 48.4323, lon: 0.0913, dept: "Orne" },
    { name: "Flers", lat: 48.7490, lon: -0.5623, dept: "Orne" },
    { name: "Argentan", lat: 48.7441, lon: -0.0175, dept: "Orne" }
];

let cities: City[] = [];

function loadCities() {
    const saved = localStorage.getItem('meteo_normandie_cities');
    if (saved) {
        try {
            cities = JSON.parse(saved);
        } catch (e) {
            cities = [...DEFAULT_CITIES];
        }
    } else {
        cities = [...DEFAULT_CITIES];
        saveCities();
    }
}

function saveCities() {
    localStorage.setItem('meteo_normandie_cities', JSON.stringify(cities));
}

// Carregar imediatamente
loadCities();

// Populando seletor colapsável de cidades (Dropdown flutuante)
const cityDropdown = document.getElementById('city-selector-dropdown') as HTMLDivElement;

function rebuildCityDropdown() {
    if (!cityDropdown) return;
    
    // Lembrar quais estavam checadas
    const checkedStates: Record<string, boolean> = {};
    cityDropdown.querySelectorAll('input[type="checkbox"]').forEach((cb: any) => {
        checkedStates[cb.value] = cb.checked;
    });

    cityDropdown.innerHTML = '';
    cities.forEach(city => {
        const label = document.createElement('label');
        label.className = "flex items-center justify-between gap-2 p-1.5 hover:bg-slate-800/80 rounded cursor-pointer transition text-xs";
        
        // Se já estava checada, mantém. Se for nova, checada por padrão.
        const isChecked = checkedStates[city.name] !== false;
        
        label.innerHTML = `
            <span class="text-gray-200 font-medium">${city.name} <span class="text-[9px] text-slate-500 font-normal">(${city.dept})</span></span>
            <input type="checkbox" value="${city.name}" ${isChecked ? 'checked' : ''} class="text-sky-500 focus:ring-0 bg-slate-800 border-slate-700 rounded h-4 w-4">
        `;
        cityDropdown.appendChild(label);
    });
    
    updateCitySummary();
}

// Inicializar primeira carga do dropdown
rebuildCityDropdown();

// Logique de basculement du popover des villes
const cityToggleBtn = document.getElementById('city-selector-toggle') as HTMLButtonElement;
const cityArrow = document.getElementById('city-arrow') as unknown as SVGElement;

if (cityToggleBtn) {
    cityToggleBtn.addEventListener('click', (e) => {
        e.stopPropagation();
        if (cityDropdown) cityDropdown.classList.toggle('hidden');
        if (cityArrow) cityArrow.classList.toggle('rotate-180');
    });
}

// Fechar dropdown de cidades ao clicar fora
document.addEventListener('click', (e) => {
    const target = e.target as HTMLElement;
    if (cityDropdown && !cityDropdown.classList.contains('hidden') && !cityDropdown.contains(target) && target !== cityToggleBtn) {
        cityDropdown.classList.add('hidden');
        if (cityArrow) cityArrow.classList.remove('rotate-180');
    }
});

// Função para atualizar resumo de cidades selecionadas
function updateCitySummary() {
    if (!cityDropdown) return;
    const checkboxes = cityDropdown.querySelectorAll('input[type="checkbox"]') as NodeListOf<HTMLInputElement>;
    const total = checkboxes.length;
    const checkedCount = Array.from(checkboxes).filter(cb => cb.checked).length;
    const summarySpan = document.getElementById('city-selector-summary') as HTMLSpanElement;

    if (summarySpan) {
        if (checkedCount === total) {
            summarySpan.innerText = `Toutes les stations (${total})`;
        } else if (checkedCount === 0) {
            summarySpan.innerText = "Aucune station sélectionnée";
        } else {
            summarySpan.innerText = `${checkedCount} station${checkedCount > 1 ? 's' : ''} sélectionnée${checkedCount > 1 ? 's' : ''}`;
        }
    }
}

// 2. Inicialização do Mapa Nativo 3D via MapLibre GL JS (Altíssima Performance WebGL)
let isMapLoaded = false;
const map = new maplibregl.Map({
    container: 'map',
    preserveDrawingBuffer: true,
    attributionControl: false, // Substituído abaixo por um controle compacto (ícone ⓘ) para não poluir a tela nem as exportações
    style: {
        version: 8,
        sources: {
            'raster-tiles': {
                type: 'raster',
                tiles: ['https://server.arcgisonline.com/ArcGIS/rest/services/World_Topo_Map/MapServer/tile/{z}/{y}/{x}'],
                tileSize: 256,
                attribution: '© Esri, HERE, DeLorme, TomTom, Intermap, increment P Corp., GEBCO, USGS, FAO, NPS, NRCAN, GeoBase, IGN, Kadaster NL, Ordnance Survey, Esri Japan, METI, Esri China (Hong Kong), swisstopo, MapmyIndia, © OpenStreetMap contributors, and the GIS User Community'
            }
        },
        layers: [
            {
                id: 'base-tiles',
                type: 'raster',
                source: 'raster-tiles',
                minzoom: 0,
                maxzoom: 19
            }
        ]
    },
    center: [-0.4, 49.1], // Coordenadas [lon, lat] para MapLibre
    zoom: 7.75,
    pitch: 0,
    bearing: 0,
    dragRotate: true,
    pitchWithRotate: true
});

// Ajouter des contrôles de navigation dans le coin supérieur gauche
map.addControl(new maplibregl.NavigationControl({
    showCompass: true,
    showZoom: true
}), 'top-left');

// Atribuição compacta (ícone ⓘ que expande ao clicar) — mantém o crédito exigido
// pelos provedores de tiles, sem exibir o texto completo permanentemente na tela.
map.addControl(new maplibregl.AttributionControl({ compact: true }), 'bottom-right');

map.on('load', () => {
    isMapLoaded = true;
    map.setBearing(0);
    map.setPitch(0);
    updateBoundary();
    fetchWeatherData();
    initWindFlow();
});

let markersList: any[] = [];
let displayMode = 'temp';

// ==========================================
// PRÉVISION — Calendrier (jour) + Période du jour
// ==========================================
type ForecastPeriod = 'now' | 'matin' | 'apresmidi' | 'soir' | 'nuit';
let forecastDayOffset = 0; // 0 = aujourd'hui, jusqu'à 6 (7 jours au total)
let forecastPeriod: ForecastPeriod = 'now';

const FORECAST_PERIOD_HOURS: Record<Exclude<ForecastPeriod, 'now'>, number> = {
    matin: 8,
    apresmidi: 14,
    soir: 19,
    nuit: 23,
};

function isForecastModeActive(): boolean {
    return forecastPeriod !== 'now';
}

function getForecastTargetDateStr(): string {
    const d = new Date();
    d.setDate(d.getDate() + forecastDayOffset);
    const yyyy = d.getFullYear();
    const mm = String(d.getMonth() + 1).padStart(2, '0');
    const dd = String(d.getDate()).padStart(2, '0');
    return `${yyyy}-${mm}-${dd}`;
}

// Reconstrói um objeto no formato `current` da Open-Meteo a partir do array `hourly`,
// buscando o horário exato correspondente ao dia/período selecionados. Isso permite
// que todo o resto de fetchWeatherData (que já sabe ler `.current.*`) funcione sem
// nenhuma outra mudança, tanto no modo "ao vivo" quanto no modo "previsão".
function extractHourlyAsCurrent(cityData: any): { current: any } | null {
    if (!cityData || !cityData.hourly || !Array.isArray(cityData.hourly.time)) return null;
    const hour = FORECAST_PERIOD_HOURS[forecastPeriod as Exclude<ForecastPeriod, 'now'>];
    const targetPrefix = `${getForecastTargetDateStr()}T${String(hour).padStart(2, '0')}:00`;
    const idx = cityData.hourly.time.indexOf(targetPrefix);
    if (idx === -1) return null;
    const h = cityData.hourly;
    return {
        current: {
            temperature_2m: h.temperature_2m?.[idx],
            weather_code: h.weather_code?.[idx],
            wind_speed_10m: h.wind_speed_10m?.[idx],
            wind_direction_10m: h.wind_direction_10m?.[idx],
            cloud_cover: h.cloud_cover?.[idx],
            precipitation: h.precipitation?.[idx],
            is_day: h.is_day?.[idx],
        },
    };
}

function buildForecastApiUrl(lat: string | number, lon: string | number): string {
    if (isForecastModeActive()) {
        return `https://api.open-meteo.com/v1/forecast?latitude=${lat}&longitude=${lon}&hourly=temperature_2m,weather_code,wind_speed_10m,wind_direction_10m,cloud_cover,precipitation,is_day&forecast_days=7&timezone=auto`;
    }
    return `https://api.open-meteo.com/v1/forecast?latitude=${lat}&longitude=${lon}&current=temperature_2m,weather_code,wind_speed_10m,wind_direction_10m,cloud_cover,precipitation,is_day`;
}

// Cache pour stocker les données de vent et de météo actives par ville pour animer le canevas des courants de vent
const activeWeatherDataCache: Record<string, {
    temp: number;
    windSpeed: number;
    windDirection: number;
    rain: number;
    clouds: number;
    code: number;
}> = {};

// 3. Função para Desenhar e Filtrar a Borda da Região Baseada no Dropdown e Cor Selecionada (Com Efeito de Máscara Invertido Perfeito)
function updateBoundary() {
    if (!isMapLoaded) return;
    
    try {
        const regionSelect = document.getElementById('boundary-region') as HTMLSelectElement;
        if (!regionSelect) return;
        const selectedRegion = regionSelect.value;
        const colorInput = document.getElementById('boundary-color') as HTMLInputElement;
        const chosenColor = colorInput ? colorInput.value : '#38bdf8';

        const dashSelect = document.getElementById('boundary-dash') as HTMLSelectElement;
        const weightInput = document.getElementById('boundary-weight') as HTMLInputElement;
        const weightVal = document.getElementById('boundary-weight-val') as HTMLSpanElement;

        const chosenDash = dashSelect ? dashSelect.value : 'solid';
        const chosenWeight = weightInput ? parseFloat(weightInput.value) : 3.5;

        if (weightVal && weightInput) {
            weightVal.innerText = `${weightInput.value}px`;
        }

        const geojson = (basseNormandieGeoJSON as any).default || basseNormandieGeoJSON;
        if (!geojson || !geojson.features) {
            console.error("GeoJSON inválido ou ausente:", geojson);
            return;
        }

        let geojsonToRender: any = null;

        if (selectedRegion === 'all') {
            geojsonToRender = geojson;
        } else if (selectedRegion !== 'none') {
            const filteredFeatures = geojson.features.filter((f: any) => f.properties && f.properties.code === selectedRegion);
            geojsonToRender = {
                type: "FeatureCollection",
                features: filteredFeatures
            };
        }

        // --- A. Efeito de Máscara Invertida (Mise en valeur / Foco Esmaecido) ---
        const maskSourceId = 'boundary-mask-source';
        const maskLayerId = 'boundary-mask-layer';
        
        if (map.getLayer(maskLayerId)) map.removeLayer(maskLayerId);
        if (map.getSource(maskSourceId)) map.removeSource(maskSourceId);

        if (selectedRegion !== 'none') {
            const worldOuterRing = [
                [-180, 90],
                [180, 90],
                [180, -90],
                [-180, -90],
                [-180, 90]
            ];
            
            const holes: any[] = [];

            const extractHoles = (geom: any) => {
                if (!geom) return;
                if (geom.type === 'Polygon') {
                    geom.coordinates.forEach((ring: any[]) => {
                        holes.push(ring);
                    });
                } else if (geom.type === 'MultiPolygon') {
                    geom.coordinates.forEach((poly: any[][]) => {
                        poly.forEach((ring: any[]) => {
                            holes.push(ring);
                        });
                    });
                }
            };

            if (selectedRegion === 'all') {
                geojson.features.forEach((feature: any) => extractHoles(feature.geometry));
            } else {
                const filtered = geojson.features.filter((f: any) => f.properties && f.properties.code === selectedRegion);
                filtered.forEach((feature: any) => extractHoles(feature.geometry));
            }

            const maskGeoJSON = {
                type: 'Feature',
                properties: {},
                geometry: {
                    type: 'Polygon',
                    coordinates: [worldOuterRing, ...holes]
                }
            };

            map.addSource(maskSourceId, {
                type: 'geojson',
                data: maskGeoJSON
            });

            map.addLayer({
                id: maskLayerId,
                type: 'fill',
                source: maskSourceId,
                paint: {
                    'fill-color': '#05070f',
                    'fill-opacity': 0.65
                }
            });
        }

        // --- B. Desenhar Borda Estilizada de Alta Definição ---
        const borderSourceId = 'boundary-border-source';
        const borderLayerId = 'boundary-border-layer';
        
        if (map.getLayer(borderLayerId)) map.removeLayer(borderLayerId);
        if (map.getSource(borderSourceId)) map.removeSource(borderSourceId);

        if (selectedRegion !== 'none' && geojsonToRender) {
            map.addSource(borderSourceId, {
                type: 'geojson',
                data: geojsonToRender
            });

            const dashArray = chosenDash === 'dashed' ? [4, 4] : (chosenDash === 'dotted' ? [1, 3] : [1, 0]);

            map.addLayer({
                id: borderLayerId,
                type: 'line',
                source: borderSourceId,
                paint: {
                    'line-color': chosenColor,
                    'line-width': chosenWeight,
                    'line-dasharray': dashArray as any
                }
            });
        }

        // --- C. Zoom e Enquadramento Automático da Região ---
        if (selectedRegion !== 'none' && geojsonToRender) {
            let minLon = 180, maxLon = -180, minLat = 90, maxLat = -90;
            const checkCoords = (coords: any) => {
                if (Array.isArray(coords[0])) {
                    coords.forEach(checkCoords);
                } else {
                    const [lon, lat] = coords;
                    if (lon < minLon) minLon = lon;
                    if (lon > maxLon) maxLon = lon;
                    if (lat < minLat) minLat = lat;
                    if (lat > maxLat) maxLat = lat;
                }
            };
            
            geojsonToRender.features.forEach((f: any) => {
                checkCoords(f.geometry.coordinates);
            });

            if (minLon < maxLon && minLat < maxLat) {
                map.fitBounds([
                    [minLon, minLat], // Sudoeste [lon, lat]
                    [maxLon, maxLat]  // Nordeste [lon, lat]
                ], {
                    padding: 40,
                    duration: 1000
                });
            }
        } else if (selectedRegion === 'none') {
            map.easeTo({
                center: [-0.4, 49.1],
                zoom: 7.75,
                duration: 1000
            });
        }
    } catch (err) {
        console.error("Erro ao desenhar demarcação no mapa:", err);
    }
}

// 4. Ícones meteorológicos animados (meteocons) e rótulos em francês — ver src/weatherIcons.ts
// e src/config/weather-icons.json para o mapeamento código WMO → ícone.

// Retorna a direção do vento (rosa dos ventos em francês)
function getWindCardinal(deg: number): string {
    const directions = ['N', 'NE', 'E', 'SE', 'S', 'SO', 'O', 'NO'];
    const index = Math.round(((deg % 360) / 45)) % 8;
    return directions[index];
}

// Modo Demonstração (Simulador de Tempestades e Perturbações para facilitar testes)
let isDemoModeActive = false;

// Gerador de dados fictícios previsíveis para o Modo Demo
function getDemoWeather(cityName: string) {
    let sum = 0;
    for (let i = 0; i < cityName.length; i++) sum += cityName.charCodeAt(i);
    
    // Simula uma tempestade de vento e chuva forte vinda do oeste
    const temp = 13 + (sum % 5); // 13°C a 17°C
    const wind = 42 + (sum % 30); // 42 à 72 km/h (Vent fort !)
    const rain = 1.2 + (sum % 10) * 0.8; // 1.2mm à 9.2mm (Pluie excellente sur le radar)
    const clouds = 85 + (sum % 16); // 85% a 100% (Céu nublado e carregado)
    const windDirection = 220 + (sum % 70); // 220° à 290° (Vents de Sud-Ouest/Ouest)
    const code = 95; // Trovões / Tempestades
    
    return { temp, wind, rain, clouds, windDirection, code };
}

// 5. Motor de Busca de Dados Climáticos em Tempo Real via API Open-Meteo
async function fetchWeatherData() {
    if (!isMapLoaded) return;
    
    // Limpar marcadores anteriores
    markersList.forEach(m => m.remove());
    markersList = [];
    
    updateCitySummary();

    const regionSelect = document.getElementById('boundary-region') as HTMLSelectElement;
    const selectedRegion = regionSelect ? regionSelect.value : 'all';

    // Filtra apenas as cidades selecionadas no dropdown E que pertencem ao departamento/delimitação ativa
    const selectedCities = cities.filter(city => {
        const checkbox = cityDropdown ? cityDropdown.querySelector(`input[value="${city.name}"]`) as HTMLInputElement : null;
        const isChecked = checkbox ? checkbox.checked : true;
        
        if (!isChecked) return false;

        // Se houver uma delimitação específica ativa, filtra apenas cidades desse departamento
        if (selectedRegion === '14') return city.dept === 'Calvados';
        if (selectedRegion === '50') return city.dept === 'Manche';
        if (selectedRegion === '61') return city.dept === 'Orne';
        return true; // Se 'all' ou 'none', mostra todas as cidades marcadas
    });

    // Buscar dados climáticos em lote para evitar gargalos/bloqueios de CORS/rate limit no navegador
    let batchData: any[] = [];
    let isBatchSuccessful = false;

    if (!isDemoModeActive && selectedCities.length > 0) {
        try {
            const lats = selectedCities.map(c => c.lat).join(',');
            const lons = selectedCities.map(c => c.lon).join(',');
            const url = buildForecastApiUrl(lats, lons);

            const response = await fetch(url);
            if (response.ok) {
                const data = await response.json();
                let rawArray = Array.isArray(data) ? data : [data];
                if (isForecastModeActive()) {
                    rawArray = rawArray.map((item: any) => extractHourlyAsCurrent(item));
                }
                if (rawArray.length === selectedCities.length && rawArray.every(item => item && item.current)) {
                    batchData = rawArray;
                    isBatchSuccessful = true;
                }
            }
        } catch (err) {
            console.warn("Erreur lors de la récupération de la météo par lots, utilisation des fallbacks individuels ou démo:", err);
        }
    }

    for (let i = 0; i < selectedCities.length; i++) {
        const city = selectedCities[i];
        try {
            let temp = 15;
            let wind = 15;
            let rain = 0.0;
            let clouds = 50;
            let windDirection = 240;
            let code = 3;
            // Fallback baseado na hora local caso a API não devolva is_day (ex: modo demo)
            const localHour = new Date().getHours();
            let isDay = localHour >= 7 && localHour < 21;

            if (isDemoModeActive) {
                const demo = getDemoWeather(city.name);
                temp = demo.temp;
                wind = demo.wind;
                rain = demo.rain;
                clouds = demo.clouds;
                windDirection = demo.windDirection;
                code = demo.code;
            } else if (isBatchSuccessful && batchData[i] && batchData[i].current) {
                const current = batchData[i].current;
                temp = Math.round(current.temperature_2m ?? 15);
                wind = Math.round(current.wind_speed_10m ?? 15);
                rain = current.precipitation ?? 0.0;
                clouds = current.cloud_cover ?? 50;
                windDirection = current.wind_direction_10m ?? 240;
                code = current.weather_code ?? 3;
                isDay = current.is_day === undefined ? isDay : current.is_day === 1;
            } else {
                // Fallback individual fetch
                try {
                    const url = buildForecastApiUrl(city.lat, city.lon);
                    const response = await fetch(url);
                    if (!response.ok) {
                        throw new Error(`HTTP error ${response.status}`);
                    }
                    let data = await response.json();
                    if (isForecastModeActive()) {
                        data = extractHourlyAsCurrent(data);
                    }
                    if (!data || !data.current) {
                        throw new Error("Invalid response format");
                    }
                    temp = Math.round(data.current.temperature_2m ?? 15);
                    wind = Math.round(data.current.wind_speed_10m ?? 15);
                    rain = data.current.precipitation ?? 0.0;
                    clouds = data.current.cloud_cover ?? 50;
                    windDirection = data.current.wind_direction_10m ?? 240;
                    code = data.current.weather_code ?? 3;
                    isDay = data.current.is_day === undefined ? isDay : data.current.is_day === 1;
                } catch (individualErr) {
                    console.warn(`Erreur météo pour ${city.name}, utilisation des données simulées (démo/fallback):`, individualErr);
                    const demo = getDemoWeather(city.name);
                    temp = demo.temp;
                    wind = demo.wind;
                    rain = demo.rain;
                    clouds = demo.clouds;
                    windDirection = demo.windDirection;
                    code = demo.code;
                }
            }

            // Armazenar no cache de clima ativo
            activeWeatherDataCache[city.name] = {
                temp,
                windSpeed: wind,
                windDirection,
                rain,
                clouds,
                code
            };

            const iconUrl = getWeatherIconUrl(code, rain, isDay);
            
            // Texto dinâmico dependendo da variável principal escolhida
            let displayText = "";
            if (displayMode === 'temp') {
                displayText = `${temp}°C`;
            } else if (displayMode === 'wind') {
                displayText = `${wind} km/h`;
            } else {
                displayText = `${rain.toFixed(1)} mm`;
            }

            // Criar rótulo elegante nativo 3D no mapa para a estação meteorológica
            const customEl = document.createElement('div');
            customEl.className = 'weather-label-container';
            
            if (displayMode === 'wind') {
                customEl.innerHTML = `
                    <div class="card">
                        <span class="card-city">${city.name}</span>
                        <div class="card-row">
                            <!-- Manche à air / Girouette tournée en fonction de la direction du vent réel -->
                            <div class="card-compass" title="Direction du vent: ${windDirection}°">
                                <svg class="card-compass-arrow" style="transform: rotate(${windDirection}deg);" fill="none" stroke="currentColor" stroke-width="3" viewBox="0 0 24 24">
                                    <path stroke-linecap="round" stroke-linejoin="round" d="M12 19V5m0 0l-4 4m4-4l4 4" />
                                </svg>
                            </div>
                            <span class="card-value">${displayText}</span>
                        </div>
                        <span class="card-sub">${getWindCardinal(windDirection)} ${windDirection}°</span>
                    </div>
                `;
            } else {
                const subLabelText = getWeatherLabel(code, rain);
                const layout = getCardLayout();
                const iconTag = `<img class="card-icon" src="${iconUrl}" alt="${subLabelText}" title="${subLabelText}" crossorigin="anonymous">`;
                const textStack = `
                    <div class="card-text-stack">
                        <span class="card-city">${city.name}</span>
                        <span class="card-value">${displayText}</span>
                    </div>
                `;
                if (layout === 'icon-left') {
                    customEl.innerHTML = `<div class="card card-icon-left">${iconTag}${textStack}</div>`;
                } else if (layout === 'icon-right') {
                    customEl.innerHTML = `<div class="card card-icon-right">${textStack}${iconTag}</div>`;
                } else {
                    // vertical (padrão): cidade em cima, ícone+valor lado a lado embaixo
                    customEl.innerHTML = `
                        <div class="card card-vertical">
                            <span class="card-city">${city.name}</span>
                            <div class="card-row">
                                ${iconTag}
                                <span class="card-value">${displayText}</span>
                            </div>
                        </div>
                    `;
                }
            }

            const marker = new maplibregl.Marker({ element: customEl })
                .setLngLat([city.lon, city.lat])
                .addTo(map);
                
            markersList.push(marker);

        } catch (e) {
            console.error(`Erro ao obter dados para ${city.name}:`, e);
        }
    }

    // Atualizar as posições dos emissores de ventos e radar imediatamente
    updateWindEmitters();
}

// 6.2 MOTOR DE CORRENTES DE VENTO ANIMADAS (Estilo Windy.com / MSN Météo)
interface WindParticle {
    x: number;
    y: number;
    speed: number;
    angle: number; // radianos
    life: number;
    maxLife: number;
    color: string;
    thickness: number;
}

const windCanvas = document.getElementById('wind-flow-canvas') as HTMLCanvasElement;
const ctx = windCanvas?.getContext('2d');

let particles: WindParticle[] = [];
const maxParticles = 140; // Quantidade de traços de ventos na tela
let animationId: number;

let activeWindEmitters: { x: number; y: number; speed: number; angle: number; isStrong: boolean }[] = [];
let pulseOffset = 0;

// Redimensiona o canvas para sobrepor perfeitamente o mapa
function resizeWindCanvas() {
    if (!windCanvas) return;
    const parent = windCanvas.parentElement;
    if (parent) {
        windCanvas.width = parent.clientWidth;
        windCanvas.height = parent.clientHeight;
    }
}

// Atualiza posições físicas das cidades em pixels na tela a cada mudança no mapa (Suporta 3D de forma nativa!)
function updateWindEmitters() {
    activeWindEmitters = [];
    if (!isMapLoaded) return;
    
    const selectedCities = cities.filter(city => {
        const checkbox = cityDropdown ? cityDropdown.querySelector(`input[value="${city.name}"]`) as HTMLInputElement : null;
        return checkbox ? checkbox.checked : true;
    });

    selectedCities.forEach(city => {
        try {
            // Projeta os pontos geográficos em coordenadas de tela 2D respeitando o pitch/tilt 3D!
            const point = map.project([city.lon, city.lat]);
            const windData = activeWeatherDataCache[city.name];
            
            if (windData) {
                // La direction du vent météorologique indique d'où il vient.
                // Convertemos para onde vai (adicionando 180° / PI radianos)
                const angleRad = ((windData.windDirection + 180) % 360) * Math.PI / 180;
                
                activeWindEmitters.push({
                    x: point.x,
                    y: point.y,
                    speed: windData.windSpeed,
                    angle: angleRad,
                    isStrong: windData.windSpeed > 30
                });
            }
        } catch (err) {
            // Ignorar erros se fora do viewport do mapa
        }
    });
}

// Retorna o vetor de vento interpolado (ângulo e velocidade)
function getWindAtPosition(x: number, y: number): { angle: number; speed: number; isStrong: boolean } {
    if (activeWindEmitters.length === 0) {
        return { angle: 225 * Math.PI / 180, speed: 1.5, isStrong: false };
    }
    
    let totalWeight = 0;
    let weightedCos = 0;
    let weightedSin = 0;
    let weightedSpeed = 0;

    for (const emitter of activeWindEmitters) {
        const dx = emitter.x - x;
        const dy = emitter.y - y;
        const distSq = dx * dx + dy * dy;
        
        // Peso inversamente proporcional à distância quadrada (suavizado)
        const weight = 1 / (distSq + 2000); 
        totalWeight += weight;
        weightedCos += Math.cos(emitter.angle) * weight;
        weightedSin += Math.sin(emitter.angle) * weight;
        weightedSpeed += emitter.speed * weight;
    }

    const avgAngle = Math.atan2(weightedSin, weightedCos);
    const avgSpeed = weightedSpeed / totalWeight;
    
    // Converter de km/h para velocidade na tela
    const screenSpeed = 0.5 + (avgSpeed / 12);
    const isStrong = avgSpeed > 30;

    return {
        angle: avgAngle,
        speed: Math.max(0.6, Math.min(screenSpeed, 5.5)),
        isStrong
    };
}

// Criação de partículas flutuantes do fluxo de vento
function createWindParticle(nearEmitter = false): WindParticle {
    let x = Math.random() * (windCanvas?.width || 800);
    let y = Math.random() * (windCanvas?.height || 600);

    if (nearEmitter && activeWindEmitters.length > 0) {
        const emitter = activeWindEmitters[Math.floor(Math.random() * activeWindEmitters.length)];
        // Emite as partículas no raio de influência da estação (ex: até 120 pixels)
        const r = Math.random() * 120;
        const theta = Math.random() * Math.PI * 2;
        x = emitter.x + Math.cos(theta) * r;
        y = emitter.y + Math.sin(theta) * r;
    }

    const windAtPos = getWindAtPosition(x, y);
    // Adiciona uma leve turbulência aleatória individual para não ficarem todos paralelos
    const angle = windAtPos.angle + (Math.random() * 0.3 - 0.15);
    const speed = windAtPos.speed;
    const isStrong = windAtPos.isStrong;

    const maxLife = 50 + Math.floor(Math.random() * 60);

    // Le vent fort gagne une mise en évidence céleste néon, le vent doux devient translucide
    const color = isStrong ? 'rgba(56, 189, 248, 0.70)' : 'rgba(200, 230, 255, 0.42)';
    const thickness = isStrong ? 2.0 : 1.2;

    return {
        x,
        y,
        speed,
        angle,
        life: 0,
        maxLife,
        color,
        thickness
    };
}

// Inicializar todas as partículas
function initWindFlow() {
    resizeWindCanvas();
    updateWindEmitters();
    particles = [];
    for (let i = 0; i < maxParticles; i++) {
        particles.push(createWindParticle(false));
    }
}

// Loop principal de renderização das correntes e radar de precipitação
function animateWindFlow() {
    if (!ctx || !windCanvas) return;

    // 1. Limpeza parcial para dar efeito de rastro/blur de movimento elegante
    ctx.globalCompositeOperation = 'destination-out';
    ctx.fillStyle = 'rgba(0, 0, 0, 0.15)'; 
    ctx.fillRect(0, 0, windCanvas.width, windCanvas.height);
    ctx.globalCompositeOperation = 'source-over'; // Restaurar modo padrão

    const showRain = (document.getElementById('layer-rain') as HTMLInputElement)?.checked;

    // 2. Renderização de Anéis de Radar Pulsantes (Se ativos)
    pulseOffset += 0.4;
    if (pulseOffset > 40) pulseOffset = 0;

    const selectedCities = cities.filter(city => {
        const checkbox = cityDropdown ? cityDropdown.querySelector(`input[value="${city.name}"]`) as HTMLInputElement : null;
        return checkbox ? checkbox.checked : true;
    });

    if (showRain) {
        selectedCities.forEach(city => {
            const weather = activeWeatherDataCache[city.name];
            if (weather && weather.rain > 0.1) {
                try {
                    const point = map.project([city.lon, city.lat]);
                    let radarColor = 'rgba(16, 185, 129, '; // Verde (chuva fraca)
                    if (weather.rain >= 1.0 && weather.rain <= 5.0) {
                        radarColor = 'rgba(245, 158, 11, '; // Amarelo (chuva moderação)
                    } else if (weather.rain > 5.0) {
                        radarColor = 'rgba(244, 63, 94, '; // Vermelho (chuva forte)
                    }

                    // Anel externo expandindo e desaparecendo
                    ctx.beginPath();
                    const r = 12 + pulseOffset;
                    ctx.arc(point.x, point.y, r, 0, Math.PI * 2);
                    ctx.strokeStyle = radarColor + (1 - pulseOffset / 40) * 0.75 + ')';
                    ctx.lineWidth = 1.5;
                    ctx.stroke();

                    // Núcleo central pulsante mais denso
                    ctx.beginPath();
                    ctx.arc(point.x, point.y, 7, 0, Math.PI * 2);
                    ctx.fillStyle = radarColor + '0.28)';
                    ctx.fill();
                    ctx.strokeStyle = radarColor + '0.6)';
                    ctx.lineWidth = 1;
                    ctx.stroke();
                } catch (err) {}
            }
        });
    }

    // 3. Renderização de Correntes de Vento (Apenas se displayMode for 'wind')
    if (displayMode === 'wind') {
        particles.forEach((p, index) => {
            const nextX = p.x + Math.cos(p.angle) * p.speed;
            const nextY = p.y + Math.sin(p.angle) * p.speed;

            // Desenhar traço do vento
            ctx.beginPath();
            ctx.moveTo(p.x, p.y);
            ctx.lineTo(nextX, nextY);
            ctx.strokeStyle = p.color;
            ctx.lineWidth = p.thickness;
            ctx.lineCap = 'round';
            ctx.stroke();

            // Atualizar física e ciclo de vida
            p.x = nextX;
            p.y = nextY;
            p.life++;

            // Atualizar dinamicamente o vetor do vento na nova posição para movimentos realistas
            const currentWind = getWindAtPosition(p.x, p.y);
            p.angle = currentWind.angle + (Math.random() * 0.1 - 0.05);
            p.speed = currentWind.speed;

            // Regenerar se ultrapassar limites ou fim de vida
            if (p.life >= p.maxLife || 
                p.x < 0 || p.x > windCanvas.width || 
                p.y < 0 || p.y > windCanvas.height) {
                particles[index] = createWindParticle(true);
            }
        });
    }

    animationId = requestAnimationFrame(animateWindFlow);
}

// 7. Lógica Interativa para Recolher/Expandir a Barra Lateral de Modo Elegante
const sidebar = document.getElementById('sidebar') as HTMLDivElement;
const toggleBtn = document.getElementById('btn-toggle-sidebar') as HTMLButtonElement;

let isSidebarCollapsed = false;

toggleBtn?.addEventListener('click', () => {
    isSidebarCollapsed = !isSidebarCollapsed;

    if (isSidebarCollapsed) {
        // Réduire la barre latérale avec des transitions parfaites
        sidebar.classList.add('w-0', 'opacity-0', 'overflow-hidden', 'p-0', 'border-0');
        sidebar.classList.remove('w-80', 'p-5', 'border-r');
        // Reposicionar o botão flutuante para o canto esquerdo da tela
        toggleBtn.style.left = '0px';
        toggleBtn.classList.remove('rounded-r-xl');
        toggleBtn.classList.add('rounded-r-lg');
        // Rotacionar ícone de seta
        toggleBtn.querySelector('svg')?.classList.add('rotate-180');
    } else {
        // Étendre la barre latérale
        sidebar.classList.remove('w-0', 'opacity-0', 'overflow-hidden', 'p-0', 'border-0');
        sidebar.classList.add('w-80', 'p-5', 'border-r');
        // Repositionner le bouton sur le bord droit du panneau latéral
        toggleBtn.style.left = '320px';
        toggleBtn.classList.add('rounded-r-xl');
        toggleBtn.classList.remove('rounded-r-lg');
        // Desrotacionar ícone de seta
        toggleBtn.querySelector('svg')?.classList.remove('rotate-180');
    }

    // Forçar recalculo do tamanho do mapa imediatamente após a transição para evitar renderizações cortadas
    setTimeout(() => {
        map.resize();
        resizeWindCanvas();
        updateWindEmitters();
    }, 310);
});

// 8. Relógio Digital UTC para enriquecer o painel profissional
function updateClock() {
    const clockSpan = document.getElementById('utc-time') as HTMLSpanElement;
    if (clockSpan) {
        const now = new Date();
        clockSpan.innerText = now.toUTCString().replace("GMT", "UTC");
    }
}
setInterval(updateClock, 1000);
updateClock();

// 8.2 Lógica para tornar Elementos do HTML Arrastáveis (Draggable Legende)
function makeElementDraggable(el: HTMLElement) {
    let pos1 = 0, pos2 = 0, pos3 = 0, pos4 = 0;
    
    const handle = el.querySelector('.drag-handle') as HTMLElement || el;
    
    handle.onmousedown = dragMouseDown;
    handle.ontouchstart = dragTouchStart;

    function dragMouseDown(e: MouseEvent) {
        e = e || window.event;
        e.preventDefault();
        pos3 = e.clientX;
        pos4 = e.clientY;
        document.onmouseup = closeDragElement;
        document.onmousemove = elementDrag;
    }

    function dragTouchStart(e: TouchEvent) {
        if (e.touches.length === 1) {
            pos3 = e.touches[0].clientX;
            pos4 = e.touches[0].clientY;
            document.ontouchend = closeDragElement;
            document.ontouchmove = elementTouchDrag;
        }
    }

    function elementDrag(e: MouseEvent) {
        e = e || window.event;
        e.preventDefault();
        pos1 = pos3 - e.clientX;
        pos2 = pos4 - e.clientY;
        pos3 = e.clientX;
        pos4 = e.clientY;
        
        el.style.bottom = 'auto';
        el.style.right = 'auto';
        el.style.top = (el.offsetTop - pos2) + "px";
        el.style.left = (el.offsetLeft - pos1) + "px";
    }

    function elementTouchDrag(e: TouchEvent) {
        if (e.touches.length === 1) {
            const touch = e.touches[0];
            pos1 = pos3 - touch.clientX;
            pos2 = pos4 - touch.clientY;
            pos3 = touch.clientX;
            pos4 = touch.clientY;
            
            el.style.bottom = 'auto';
            el.style.right = 'auto';
            el.style.top = (el.offsetTop - pos2) + "px";
            el.style.left = (el.offsetLeft - pos1) + "px";
        }
    }

    function closeDragElement() {
        document.onmouseup = null;
        document.onmousemove = null;
        document.ontouchend = null;
        document.ontouchmove = null;
    }
}

// Inicializar Legenda Móvel
const legendEl = document.getElementById('weather-legend');
if (legendEl) {
    makeElementDraggable(legendEl);
}

// 9. Handlers Globais para Mudança de Filtros e Elementos da Interface
document.getElementById('boundary-region')?.addEventListener('change', () => {
    updateBoundary();
    fetchWeatherData();
});
document.getElementById('boundary-color')?.addEventListener('input', updateBoundary);

// Configurar ouvintes para os novos controles de estilo de contorno
const boundaryDash = document.getElementById('boundary-dash');
const boundaryWeight = document.getElementById('boundary-weight');

boundaryDash?.addEventListener('change', updateBoundary);
boundaryWeight?.addEventListener('input', updateBoundary);

function changeBaseLayer(styleId: string) {
    if (!isMapLoaded) return;
    
    let tileUrl = '';
    if (styleId === 'relevo') {
        tileUrl = 'https://server.arcgisonline.com/ArcGIS/rest/services/World_Topo_Map/MapServer/tile/{z}/{y}/{x}';
    } else if (styleId === 'satelite') {
        tileUrl = 'https://server.arcgisonline.com/ArcGIS/rest/services/World_Imagery/MapServer/tile/{z}/{y}/{x}';
    } else if (styleId === 'osm') {
        tileUrl = 'https://a.tile.openstreetmap.org/{z}/{x}/{y}.png';
    } else { // standard / sombre
        tileUrl = 'https://a.basemaps.cartocdn.com/dark_all/{z}/{x}/{y}.png';
    }
    
    const source = map.getSource('raster-tiles');
    if (source) {
        source.setTiles([tileUrl]);
    }
}

document.querySelectorAll('input[name="map-tile"]').forEach(r => r.addEventListener('change', (e) => {
    const target = e.target as HTMLInputElement;
    changeBaseLayer(target.value);
}));

document.querySelectorAll('input[name="data-view"]').forEach(r => r.addEventListener('change', (e) => {
    displayMode = (e.target as HTMLInputElement).value;
    fetchWeatherData();
}));

document.getElementById('layer-rain')?.addEventListener('change', fetchWeatherData);
document.getElementById('toggle-legend')?.addEventListener('change', (e) => {
    const target = e.target as HTMLInputElement;
    const legendEl = document.getElementById('weather-legend');
    if (legendEl) {
        if (target.checked) {
            legendEl.classList.remove('hidden');
        } else {
            legendEl.classList.add('hidden');
        }
    }
});
document.getElementById('btn-refresh')?.addEventListener('click', fetchWeatherData);

// Listener para as checkboxes de cidades dentro do popover flutuante
if (cityDropdown) {
    cityDropdown.addEventListener('change', fetchWeatherData);
}

// Configuração do Botão do Modo Demo
const demoBtn = document.getElementById('btn-demo-mode') as HTMLButtonElement;
const demoIndicator = document.getElementById('demo-indicator') as HTMLSpanElement;
const demoText = document.getElementById('demo-text') as HTMLSpanElement;

if (demoBtn) {
    demoBtn.addEventListener('click', () => {
        isDemoModeActive = !isDemoModeActive;
        if (isDemoModeActive) {
            demoBtn.classList.remove('bg-slate-950/80', 'text-slate-400');
            demoBtn.classList.add('bg-emerald-950/90', 'text-emerald-300', 'border-emerald-700/60');
            if (demoIndicator) {
                demoIndicator.className = "h-2 w-2 bg-emerald-400 rounded-full animate-ping";
            }
            if (demoText) {
                demoText.innerText = "Données Réelles (Désactiver Démo)";
            }
        } else {
            demoBtn.classList.add('bg-slate-950/80', 'text-slate-400');
            demoBtn.classList.remove('bg-emerald-950/90', 'text-emerald-300', 'border-emerald-700/60');
            if (demoIndicator) {
                demoIndicator.className = "h-2 w-2 bg-slate-600 rounded-full";
            }
            if (demoText) {
                demoText.innerText = "Simuler des Perturbations (Demo)";
            }
        }
        fetchWeatherData();
    });
}

// Botão de Exportar Mapa (Dropdown)
const exportTrigger = document.getElementById('btn-export-map-trigger');
const exportDropdown = document.getElementById('export-dropdown');

exportTrigger?.addEventListener('click', (e) => {
    e.stopPropagation();
    exportDropdown?.classList.toggle('hidden');
});

// Fechar dropdown ao clicar fora
document.addEventListener('click', (e) => {
    if (!exportDropdown?.classList.contains('hidden') && e.target !== exportTrigger) {
        exportDropdown?.classList.add('hidden');
    }
});

document.getElementById('btn-export-img')?.addEventListener('click', async () => {
    const mapWrapper = document.getElementById('map-wrapper');
    const mapCanvas = map.getCanvas();
    
    if (mapWrapper && mapCanvas) {
        // Garante que o buffer WebGL do mapa está atualizado no momento da captura
        map.triggerRepaint();
        await new Promise<void>((resolve) => map.once('idle', () => resolve()));

        // Garante que os ícones meteo (carregados do CDN) já terminaram de baixar
        // antes da captura — senão o html2canvas pode desenhá-los em branco.
        const iconImgs = Array.from(mapWrapper.querySelectorAll('img.card-icon')) as HTMLImageElement[];
        await Promise.all(iconImgs.map((img) => {
            if (img.complete) return Promise.resolve();
            return new Promise<void>((resolve) => {
                img.addEventListener('load', () => resolve(), { once: true });
                img.addEventListener('error', () => resolve(), { once: true });
            });
        }));

        // Multiplicador aplicado sobre a resolução nativa para gerar um PNG maior e
        // mais nítido (adequado para redes sociais), independente do devicePixelRatio
        // da tela do repórter. Os cards/texto (vetoriais) saem genuinamente mais nítidos;
        // o mapa raster é reamostrado com suavização de alta qualidade.
        const EXPORT_SCALE = 2;

        // Create a final canvas to combine map and UI
        const finalCanvas = document.createElement('canvas');
        finalCanvas.width = mapCanvas.width * EXPORT_SCALE;
        finalCanvas.height = mapCanvas.height * EXPORT_SCALE;
        const ctx = finalCanvas.getContext('2d');

        if (ctx) {
            ctx.imageSmoothingEnabled = true;
            ctx.imageSmoothingQuality = 'high';

            // 1) Captura o mapa (buffer WebGL) IMEDIATAMENTE, enquanto o frame está bom.
            //    Isto precisa vir ANTES do html2canvas: o html2canvas clona o DOM e
            //    dispara um re-render do mapa, que pode gravar um frame transitório
            //    incorreto (máscara invertida cobrindo a região) no buffer.
            ctx.drawImage(mapCanvas, 0, 0, finalCanvas.width, finalCanvas.height);

            // 2) Só então captura a camada de UI (cards, controles, etc.)
            const originalBackgroundColor = mapWrapper.style.backgroundColor;
            mapWrapper.style.backgroundColor = 'transparent';
            // Não passamos `scale` (nem width/height) aqui: forçar um scale customizado
            // no html2canvas causou texto invisível nos cards (bug de rasterização de
            // texto em escalas não-padrão). Deixamos o html2canvas usar seu comportamento
            // padrão (comprovadamente correto para o texto) e conseguimos a resolução
            // maior esticando o resultado para finalCanvas (maior, via EXPORT_SCALE) no
            // drawImage final abaixo.
            const canvasUI = await html2canvas(mapWrapper, {
                useCORS: true,
                backgroundColor: null, // Transparent to show map
                ignoreElements: (el) =>
                    el === mapCanvas ||
                    el.id === 'wind-flow-canvas' ||
                    !!el.closest('.maplibregl-ctrl-top-left'), // Exclui os controles de zoom/bússola da exportação
                onclone: (clonedDoc) => {
                    // A div #map tem background #0b1329 (CSS). O html2canvas ignora o
                    // canvas WebGL, mas pinta esse fundo opaco por cima do mapa na
                    // composição final. Tornamos transparente APENAS no clone da captura.
                    const clonedMapDiv = clonedDoc.getElementById('map');
                    if (clonedMapDiv) clonedMapDiv.style.background = 'transparent';
                    clonedDoc.querySelectorAll('.maplibregl-map, .maplibregl-canvas-container')
                        .forEach((el) => { (el as HTMLElement).style.background = 'transparent'; });

                    // O posicionamento do ícone de atribuição (.maplibregl-control-container)
                    // é aplicado pelo MapLibre via JS, não por uma regra de CSS na folha de
                    // estilo — o html2canvas nem sempre reproduz isso fielmente no clone.
                    // Fixamos a posição explicitamente com inline style para garantir que
                    // fique sempre dentro da moldura do mapa, no canto inferior direito.
                    const clonedControlContainer = clonedDoc.querySelector('.maplibregl-control-container') as HTMLElement | null;
                    if (clonedControlContainer) {
                        clonedControlContainer.style.position = 'absolute';
                        clonedControlContainer.style.inset = '0';
                        clonedControlContainer.style.top = '0';
                        clonedControlContainer.style.left = '0';
                        clonedControlContainer.style.right = '0';
                        clonedControlContainer.style.bottom = '0';
                        clonedControlContainer.style.overflow = 'hidden';
                    }
                    const clonedAttribCorner = clonedDoc.querySelector('.maplibregl-ctrl-bottom-right') as HTMLElement | null;
                    if (clonedAttribCorner) {
                        clonedAttribCorner.style.position = 'absolute';
                        clonedAttribCorner.style.right = '0';
                        clonedAttribCorner.style.bottom = '0';
                        clonedAttribCorner.style.left = 'auto';
                        clonedAttribCorner.style.top = 'auto';
                    }
                    const clonedAttrib = clonedDoc.querySelector('.maplibregl-ctrl-attrib') as HTMLElement | null;
                    if (clonedAttrib) {
                        clonedAttrib.style.margin = '10px';
                        clonedAttrib.style.position = 'relative';
                    }
                },
            });
            mapWrapper.style.backgroundColor = originalBackgroundColor;

            // 3) Desenha a UI por cima, esticando explicitamente para o tamanho final —
            //    garante 100% de cobertura mesmo que canvasUI tenha saído em outra resolução.
            ctx.drawImage(canvasUI, 0, 0, finalCanvas.width, finalCanvas.height);

            // Download the combined image
            const link = document.createElement('a');
            link.download = 'carte-meteo.png';
            link.href = finalCanvas.toDataURL('image/png');
            link.click();
        }
    }
    exportDropdown?.classList.add('hidden');
});

// ==========================================
// EXPORTAÇÃO DE VÍDEO ANIMADO (MP4) — "com efeitos"
// ==========================================
// Estratégia: grava a própria aba (getDisplayMedia) para capturar as animações
// REAIS (ícones SVG do Meteocons, fluxo de vento) com fidelidade — não é viável
// recriar essas animações quadro a quadro via html2canvas (lento demais para
// tempo real). O navegador pede confirmação de compartilhamento a cada
// exportação; isso é uma exigência de segurança, não um bug.
// O MediaRecorder só grava em WebM nativamente; convertemos para MP4 (H.264)
// no próprio navegador via ffmpeg.wasm (~30MB, baixado uma vez e cacheado).
const VIDEO_DURATION_MS = 4000;
const FFMPEG_CORE_BASE = 'https://unpkg.com/@ffmpeg/core@0.12.10/dist/umd';

let ffmpegInstance: import('@ffmpeg/ffmpeg').FFmpeg | null = null;

async function getFfmpeg() {
    if (ffmpegInstance) return ffmpegInstance;
    const { FFmpeg } = await import('@ffmpeg/ffmpeg');
    const { toBlobURL } = await import('@ffmpeg/util');
    const ffmpeg = new FFmpeg();
    await ffmpeg.load({
        coreURL: await toBlobURL(`${FFMPEG_CORE_BASE}/ffmpeg-core.js`, 'text/javascript'),
        wasmURL: await toBlobURL(`${FFMPEG_CORE_BASE}/ffmpeg-core.wasm`, 'application/wasm'),
    });
    ffmpegInstance = ffmpeg;
    return ffmpeg;
}

function setExportStatus(message: string | null) {
    const statusEl = document.getElementById('export-status');
    if (!statusEl) return;
    if (message === null) {
        statusEl.classList.add('hidden');
        statusEl.textContent = '';
    } else {
        statusEl.classList.remove('hidden');
        statusEl.textContent = message;
    }
}

document.getElementById('btn-export-video')?.addEventListener('click', async () => {
    exportDropdown?.classList.add('hidden');
    const mapWrapper = document.getElementById('map-wrapper');
    if (!mapWrapper) return;

    let displayStream: MediaStream | null = null;
    let recordedStream: MediaStream | null = null;
    let animationFrameId = 0;

    try {
        setExportStatus('Sélectionnez cet onglet dans la fenêtre du navigateur…');

        // `preferCurrentTab` é uma extensão do Chrome que evita o usuário ter que
        // escolher manualmente a aba certa; navegadores sem suporte ignoram a opção
        // e mostram o seletor padrão de compartilhamento.
        displayStream = await navigator.mediaDevices.getDisplayMedia({
            video: true,
            audio: false,
            preferCurrentTab: true,
        } as DisplayMediaStreamOptions);

        setExportStatus('Enregistrement en cours…');

        const sourceVideo = document.createElement('video');
        sourceVideo.srcObject = displayStream;
        sourceVideo.muted = true;
        await sourceVideo.play();
        await new Promise<void>((resolve) => {
            if (sourceVideo.readyState >= 2) resolve();
            else sourceVideo.onloadeddata = () => resolve();
        });

        // Mapeia a área do mapWrapper (coordenadas CSS/viewport) para pixels reais
        // do stream capturado, que pode vir numa resolução diferente da tela lógica.
        const rect = mapWrapper.getBoundingClientRect();
        const scaleX = sourceVideo.videoWidth / window.innerWidth;
        const scaleY = sourceVideo.videoHeight / window.innerHeight;
        const cropX = rect.left * scaleX;
        const cropY = rect.top * scaleY;
        const cropW = rect.width * scaleX;
        const cropH = rect.height * scaleY;

        const outputCanvas = document.createElement('canvas');
        outputCanvas.width = Math.round(cropW);
        outputCanvas.height = Math.round(cropH);
        const outCtx = outputCanvas.getContext('2d');
        if (!outCtx) throw new Error('Contexte 2D indisponible');

        const drawFrame = () => {
            outCtx.drawImage(sourceVideo, cropX, cropY, cropW, cropH, 0, 0, outputCanvas.width, outputCanvas.height);
            animationFrameId = requestAnimationFrame(drawFrame);
        };
        drawFrame();

        recordedStream = outputCanvas.captureStream(30);
        const mimeType = MediaRecorder.isTypeSupported('video/webm;codecs=vp9')
            ? 'video/webm;codecs=vp9'
            : 'video/webm';
        const recorder = new MediaRecorder(recordedStream, { mimeType });
        const chunks: Blob[] = [];
        recorder.ondataavailable = (e) => { if (e.data.size > 0) chunks.push(e.data); };

        const webmBlob: Blob = await new Promise((resolve, reject) => {
            recorder.onerror = () => reject(new Error('Erreur d\'enregistrement'));
            recorder.onstop = () => resolve(new Blob(chunks, { type: 'video/webm' }));
            recorder.start();
            setTimeout(() => recorder.stop(), VIDEO_DURATION_MS);
        });

        cancelAnimationFrame(animationFrameId);
        displayStream.getTracks().forEach((t) => t.stop());
        recordedStream.getTracks().forEach((t) => t.stop());

        setExportStatus('Conversion en MP4… (premier usage: télécharge ~30 Mo)');

        const { fetchFile } = await import('@ffmpeg/util');
        const ffmpeg = await getFfmpeg();
        await ffmpeg.writeFile('input.webm', await fetchFile(webmBlob));
        await ffmpeg.exec(['-i', 'input.webm', '-c:v', 'libx264', '-pix_fmt', 'yuv420p', '-movflags', '+faststart', 'output.mp4']);
        const data = await ffmpeg.readFile('output.mp4');
        await ffmpeg.deleteFile('input.webm');
        await ffmpeg.deleteFile('output.mp4');

        const mp4Blob = new Blob([data as unknown as BlobPart], { type: 'video/mp4' });
        const link = document.createElement('a');
        link.download = 'carte-meteo.mp4';
        link.href = URL.createObjectURL(mp4Blob);
        link.click();
        URL.revokeObjectURL(link.href);

        setExportStatus(null);
    } catch (err) {
        cancelAnimationFrame(animationFrameId);
        displayStream?.getTracks().forEach((t) => t.stop());
        recordedStream?.getTracks().forEach((t) => t.stop());
        console.error('Erreur lors de l\'export vidéo:', err);
        const isPermissionDenied = err instanceof Error && err.name === 'NotAllowedError';
        setExportStatus(isPermissionDenied ? 'Partage annulé.' : 'Erreur lors de l\'export vidéo.');
        setTimeout(() => setExportStatus(null), 3000);
    }
});

// Ouvintes para o reposicionamento responsivo do motor de ventos e nuvens ao mover o mapa
map.on('move', () => {
    updateWindEmitters();
});

// Inicializar e rodar o fluxo de vento e dados
initWindFlow();
animateWindFlow();

// ==========================================
// UI — Seletores de Prévision (dia + período)
// ==========================================
function renderForecastDaySelector() {
    const container = document.getElementById('forecast-day-selector');
    if (!container) return;
    container.innerHTML = '';
    for (let offset = 0; offset < 7; offset++) {
        const d = new Date();
        d.setDate(d.getDate() + offset);
        const weekday = offset === 0
            ? 'Auj.'
            : new Intl.DateTimeFormat('fr-FR', { weekday: 'short' }).format(d).replace('.', '');
        const dayNum = d.getDate();
        const isActive = offset === forecastDayOffset;

        const btn = document.createElement('button');
        btn.type = 'button';
        btn.className = `flex flex-col items-center justify-center py-1.5 rounded text-[9px] font-semibold uppercase transition border ${isActive ? 'bg-sky-600 text-white border-sky-500' : 'bg-slate-950/80 border-slate-800 text-slate-400 hover:border-slate-700 hover:text-white'}`;
        btn.innerHTML = `<span>${weekday}</span><span class="text-[10px] font-mono">${dayNum}</span>`;
        btn.addEventListener('click', () => {
            forecastDayOffset = offset;
            renderForecastDaySelector();
            fetchWeatherData();
        });
        container.appendChild(btn);
    }
}

function renderForecastPeriodSelector() {
    const container = document.getElementById('forecast-period-selector');
    if (!container) return;
    container.innerHTML = '';
    const options: { value: ForecastPeriod; label: string }[] = [
        { value: 'now', label: 'Actuel' },
        { value: 'matin', label: 'Matin' },
        { value: 'apresmidi', label: 'Aprem' },
        { value: 'soir', label: 'Soir' },
        { value: 'nuit', label: 'Nuit' },
    ];
    options.forEach((opt) => {
        const isActive = opt.value === forecastPeriod;
        const btn = document.createElement('button');
        btn.type = 'button';
        btn.className = `py-1.5 px-1 rounded text-[9px] font-semibold text-center transition border ${isActive ? 'bg-sky-600 text-white border-sky-500' : 'bg-slate-950/80 border-slate-800 text-slate-400 hover:border-slate-700 hover:text-white'}`;
        btn.textContent = opt.label;
        btn.addEventListener('click', () => {
            forecastPeriod = opt.value;
            renderForecastPeriodSelector();
            fetchWeatherData();
        });
        container.appendChild(btn);
    });
}

renderForecastDaySelector();
renderForecastPeriodSelector();

// ==========================================
// UI — Seletor de Style dos Ícones Météo (Configurations)
// ==========================================
function renderIconStyleSelector() {
    const container = document.getElementById('icon-style-selector');
    if (!container) return;
    container.innerHTML = '';
    const currentStyle = getIconStyle();

    AVAILABLE_ICON_STYLES.forEach((opt) => {
        const isActive = opt.value === currentStyle;
        const btn = document.createElement('button');
        btn.type = 'button';
        btn.className = `py-2 px-1 rounded-lg text-[10px] font-semibold text-center transition border ${isActive ? 'bg-sky-600 text-white border-sky-500' : 'bg-slate-900 border-slate-800 text-slate-400 hover:border-slate-700 hover:text-white'}`;
        btn.textContent = opt.label;
        btn.addEventListener('click', () => {
            setIconStyle(opt.value);
            renderIconStyleSelector();
            fetchWeatherData(); // Reconstrói os cards para refletir o novo estilo imediatamente
        });
        container.appendChild(btn);
    });
}

renderIconStyleSelector();

// ==========================================
// UI — Seletor de Disposition dos Cards (posição de cidade/ícone/valor)
// ==========================================
const CARD_LAYOUT_STORAGE_KEY = 'meteo_normandie_card_layout';
const CARD_LAYOUT_OPTIONS = [
    { value: 'vertical', label: 'Vertical' },
    { value: 'icon-left', label: 'Icône ←' },
    { value: 'icon-right', label: 'Icône →' },
];

function getCardLayout(): string {
    const saved = localStorage.getItem(CARD_LAYOUT_STORAGE_KEY);
    return CARD_LAYOUT_OPTIONS.some((o) => o.value === saved) ? (saved as string) : 'vertical';
}

function setCardLayout(layout: string): void {
    localStorage.setItem(CARD_LAYOUT_STORAGE_KEY, layout);
}

function renderCardLayoutSelector() {
    const container = document.getElementById('card-layout-selector');
    if (!container) return;
    container.innerHTML = '';
    const currentLayout = getCardLayout();

    CARD_LAYOUT_OPTIONS.forEach((opt) => {
        const isActive = opt.value === currentLayout;
        const btn = document.createElement('button');
        btn.type = 'button';
        btn.className = `py-2 px-1 rounded-lg text-[10px] font-semibold text-center transition border ${isActive ? 'bg-sky-600 text-white border-sky-500' : 'bg-slate-900 border-slate-800 text-slate-400 hover:border-slate-700 hover:text-white'}`;
        btn.textContent = opt.label;
        btn.addEventListener('click', () => {
            setCardLayout(opt.value);
            renderCardLayoutSelector();
            fetchWeatherData(); // Reconstrói os cards com a nova disposição
        });
        container.appendChild(btn);
    });
}

renderCardLayoutSelector();

// ==========================================
// UI — Slider de Taille des Cartes (Configurations)
// ==========================================
const CARD_SCALE_STORAGE_KEY = 'meteo_normandie_card_scale';
const DEFAULT_CARD_SCALE_PERCENT = 80;

function initCardScaleSlider() {
    const slider = document.getElementById('slider-card-scale') as HTMLInputElement | null;
    const valLabel = document.getElementById('val-card-scale');
    if (!slider) return;

    const saved = localStorage.getItem(CARD_SCALE_STORAGE_KEY);
    const initialPercent = saved ? parseInt(saved, 10) : DEFAULT_CARD_SCALE_PERCENT;
    slider.value = String(initialPercent);
    if (valLabel) valLabel.textContent = `${initialPercent}%`;
    document.documentElement.style.setProperty('--card-scale', String(initialPercent / 100));

    slider.addEventListener('input', () => {
        const percent = parseInt(slider.value, 10);
        if (valLabel) valLabel.textContent = `${percent}%`;
        // Muda a variável CSS direto: todos os cards já existentes no mapa
        // reescalam instantaneamente, sem precisar refazer o fetch dos dados.
        document.documentElement.style.setProperty('--card-scale', String(percent / 100));
        localStorage.setItem(CARD_SCALE_STORAGE_KEY, String(percent));
    });
}

initCardScaleSlider();

// ==========================================
// UI — Menu expansível "5. Perspective 3D"
// ==========================================
const btnToggle3DSection = document.getElementById('btn-toggle-3d-section');
const section3DPanel = document.getElementById('section-3d-panel');
const iconToggle3DSection = document.getElementById('icon-toggle-3d-section');

btnToggle3DSection?.addEventListener('click', () => {
    const isHidden = section3DPanel?.classList.contains('hidden');
    section3DPanel?.classList.toggle('hidden');
    iconToggle3DSection?.classList.toggle('rotate-180', isHidden);
});

// ==========================================
// UI — Menu expansível "Apparence des Cartes" (fonte, tamanhos, espaçamentos, cores)
// ==========================================
const btnToggleCardAppearance = document.getElementById('btn-toggle-card-appearance');
const cardAppearancePanel = document.getElementById('card-appearance-panel');
const iconToggleCardAppearance = document.getElementById('icon-toggle-card-appearance');

btnToggleCardAppearance?.addEventListener('click', () => {
    const isHidden = cardAppearancePanel?.classList.contains('hidden');
    cardAppearancePanel?.classList.toggle('hidden');
    iconToggleCardAppearance?.classList.toggle('rotate-180', isHidden);
});

interface CardAppearance {
    fontFamily: string;
    iconSize: number;
    citySize: number;
    valueSize: number;
    gap: number;
    rowGap: number;
    paddingTop: number;
    paddingRight: number;
    paddingBottom: number;
    paddingLeft: number;
    bgColor: string; // hex, sem alpha — a opacidade é aplicada à parte
    borderColor: string;
    textColor: string;
    cityOffsetX: number;
    cityOffsetY: number;
    iconOffsetX: number;
    iconOffsetY: number;
    valueOffsetX: number;
    valueOffsetY: number;
}

const CARD_APPEARANCE_STORAGE_KEY = 'meteo_normandie_card_appearance';

const DEFAULT_CARD_APPEARANCE: CardAppearance = {
    fontFamily: "'Plus Jakarta Sans', sans-serif",
    iconSize: 56,
    citySize: 10,
    valueSize: 15,
    gap: 0,
    rowGap: 0,
    paddingTop: 2,
    paddingRight: 6,
    paddingBottom: 2,
    paddingLeft: 2,
    bgColor: '#0f172a',
    borderColor: '#38bdf8',
    textColor: '#ffffff',
    cityOffsetX: 0,
    cityOffsetY: 0,
    iconOffsetX: 0,
    iconOffsetY: 0,
    valueOffsetX: 0,
    valueOffsetY: 0,
};

function loadCardAppearance(): CardAppearance {
    try {
        const saved = localStorage.getItem(CARD_APPEARANCE_STORAGE_KEY);
        if (saved) return { ...DEFAULT_CARD_APPEARANCE, ...JSON.parse(saved) };
    } catch (e) {
        console.warn('Impossible de lire les préférences d\'apparence des cartes:', e);
    }
    return { ...DEFAULT_CARD_APPEARANCE };
}

function saveCardAppearance(appearance: CardAppearance) {
    localStorage.setItem(CARD_APPEARANCE_STORAGE_KEY, JSON.stringify(appearance));
}

function applyCardAppearance(appearance: CardAppearance) {
    const root = document.documentElement.style;
    root.setProperty('--card-font-family', appearance.fontFamily);
    root.setProperty('--card-icon-size', `${appearance.iconSize}px`);
    root.setProperty('--card-city-size', `${appearance.citySize}px`);
    root.setProperty('--card-value-size', `${appearance.valueSize}px`);
    root.setProperty('--card-gap', `${appearance.gap}px`);
    root.setProperty('--card-row-gap', `${appearance.rowGap}px`);
    root.setProperty('--card-padding-top', `${appearance.paddingTop}px`);
    root.setProperty('--card-padding-right', `${appearance.paddingRight}px`);
    root.setProperty('--card-padding-bottom', `${appearance.paddingBottom}px`);
    root.setProperty('--card-padding-left', `${appearance.paddingLeft}px`);
    // Adiciona um canal alfa fixo (8º e 9º dígitos hex) para manter o efeito
    // "vidro fosco" do card mesmo com uma cor de fundo escolhida pelo usuário.
    root.setProperty('--card-bg', `${appearance.bgColor}f2`);
    root.setProperty('--card-border-color', `${appearance.borderColor}99`);
    root.setProperty('--card-value-color', appearance.textColor);
    root.setProperty('--card-city-offset-x', `${appearance.cityOffsetX}px`);
    root.setProperty('--card-city-offset-y', `${appearance.cityOffsetY}px`);
    root.setProperty('--card-icon-offset-x', `${appearance.iconOffsetX}px`);
    root.setProperty('--card-icon-offset-y', `${appearance.iconOffsetY}px`);
    root.setProperty('--card-value-offset-x', `${appearance.valueOffsetX}px`);
    root.setProperty('--card-value-offset-y', `${appearance.valueOffsetY}px`);
}

function syncCardAppearanceControls(appearance: CardAppearance) {
    const setVal = (id: string, value: string) => {
        const el = document.getElementById(id) as HTMLInputElement | HTMLSelectElement | null;
        if (el) el.value = value;
    };
    const setLabel = (id: string, text: string) => {
        const el = document.getElementById(id);
        if (el) el.textContent = text;
    };

    setVal('select-card-font', appearance.fontFamily);
    setVal('slider-card-icon-size', String(appearance.iconSize));
    setLabel('val-card-icon-size', `${appearance.iconSize}px`);
    setVal('slider-card-city-size', String(appearance.citySize));
    setLabel('val-card-city-size', `${appearance.citySize}px`);
    setVal('slider-card-value-size', String(appearance.valueSize));
    setLabel('val-card-value-size', `${appearance.valueSize}px`);
    setVal('slider-card-gap', String(appearance.gap));
    setLabel('val-card-gap', `${appearance.gap}px`);
    setVal('slider-card-row-gap', String(appearance.rowGap));
    setLabel('val-card-row-gap', `${appearance.rowGap}px`);
    setVal('slider-card-padding-top', String(appearance.paddingTop));
    setLabel('val-card-padding-top', `${appearance.paddingTop}px`);
    setVal('slider-card-padding-right', String(appearance.paddingRight));
    setLabel('val-card-padding-right', `${appearance.paddingRight}px`);
    setVal('slider-card-padding-bottom', String(appearance.paddingBottom));
    setLabel('val-card-padding-bottom', `${appearance.paddingBottom}px`);
    setVal('slider-card-padding-left', String(appearance.paddingLeft));
    setLabel('val-card-padding-left', `${appearance.paddingLeft}px`);
    setVal('color-card-bg', appearance.bgColor);
    setVal('color-card-border', appearance.borderColor);
    setVal('color-card-text', appearance.textColor);
    setVal('slider-card-city-offset-x', String(appearance.cityOffsetX));
    setLabel('val-card-city-offset-x', `${appearance.cityOffsetX}px`);
    setVal('slider-card-city-offset-y', String(appearance.cityOffsetY));
    setLabel('val-card-city-offset-y', `${appearance.cityOffsetY}px`);
    setVal('slider-card-icon-offset-x', String(appearance.iconOffsetX));
    setLabel('val-card-icon-offset-x', `${appearance.iconOffsetX}px`);
    setVal('slider-card-icon-offset-y', String(appearance.iconOffsetY));
    setLabel('val-card-icon-offset-y', `${appearance.iconOffsetY}px`);
    setVal('slider-card-value-offset-x', String(appearance.valueOffsetX));
    setLabel('val-card-value-offset-x', `${appearance.valueOffsetX}px`);
    setVal('slider-card-value-offset-y', String(appearance.valueOffsetY));
    setLabel('val-card-value-offset-y', `${appearance.valueOffsetY}px`);
}

function initCardAppearancePanel() {
    let appearance = loadCardAppearance();
    applyCardAppearance(appearance);
    syncCardAppearanceControls(appearance);

    // Liga cada controle a uma propriedade específica de `appearance`, aplicando
    // e salvando a cada mudança — sem precisar refazer o fetch dos dados.
    const bindRange = (id: string, labelId: string, key: keyof CardAppearance, suffix = 'px') => {
        const el = document.getElementById(id) as HTMLInputElement | null;
        if (!el) return;
        el.addEventListener('input', () => {
            (appearance as any)[key] = parseInt(el.value, 10);
            const labelEl = document.getElementById(labelId);
            if (labelEl) labelEl.textContent = `${el.value}${suffix}`;
            applyCardAppearance(appearance);
            saveCardAppearance(appearance);
        });
    };

    bindRange('slider-card-icon-size', 'val-card-icon-size', 'iconSize');
    bindRange('slider-card-city-size', 'val-card-city-size', 'citySize');
    bindRange('slider-card-value-size', 'val-card-value-size', 'valueSize');
    bindRange('slider-card-gap', 'val-card-gap', 'gap');
    bindRange('slider-card-row-gap', 'val-card-row-gap', 'rowGap');
    bindRange('slider-card-padding-top', 'val-card-padding-top', 'paddingTop');
    bindRange('slider-card-padding-right', 'val-card-padding-right', 'paddingRight');
    bindRange('slider-card-padding-bottom', 'val-card-padding-bottom', 'paddingBottom');
    bindRange('slider-card-padding-left', 'val-card-padding-left', 'paddingLeft');
    bindRange('slider-card-city-offset-x', 'val-card-city-offset-x', 'cityOffsetX');
    bindRange('slider-card-city-offset-y', 'val-card-city-offset-y', 'cityOffsetY');
    bindRange('slider-card-icon-offset-x', 'val-card-icon-offset-x', 'iconOffsetX');
    bindRange('slider-card-icon-offset-y', 'val-card-icon-offset-y', 'iconOffsetY');
    bindRange('slider-card-value-offset-x', 'val-card-value-offset-x', 'valueOffsetX');
    bindRange('slider-card-value-offset-y', 'val-card-value-offset-y', 'valueOffsetY');

    const fontSelect = document.getElementById('select-card-font') as HTMLSelectElement | null;
    fontSelect?.addEventListener('change', () => {
        appearance.fontFamily = fontSelect.value;
        applyCardAppearance(appearance);
        saveCardAppearance(appearance);
    });

    const bindColor = (id: string, key: keyof CardAppearance) => {
        const el = document.getElementById(id) as HTMLInputElement | null;
        if (!el) return;
        el.addEventListener('input', () => {
            (appearance as any)[key] = el.value;
            applyCardAppearance(appearance);
            saveCardAppearance(appearance);
        });
    };

    bindColor('color-card-bg', 'bgColor');
    bindColor('color-card-border', 'borderColor');
    bindColor('color-card-text', 'textColor');

    document.getElementById('btn-reset-card-appearance')?.addEventListener('click', () => {
        appearance = { ...DEFAULT_CARD_APPEARANCE };
        applyCardAppearance(appearance);
        syncCardAppearanceControls(appearance);
        saveCardAppearance(appearance);
    });
}

initCardAppearancePanel();

// 10. MODAL DE CONFIGURAÇÕES E GERENCIAMENTO DE CIDADES (SEM BANCO DE DADOS - LOCALSTORAGE JSON)
const settingsModal = document.getElementById('settings-modal') as HTMLDivElement;
const btnSettings = document.getElementById('btn-settings') as HTMLButtonElement;
const btnCloseSettings = document.getElementById('btn-close-settings') as HTMLButtonElement;
const btnCloseSettingsBottom = document.getElementById('btn-close-settings-bottom') as HTMLButtonElement;

const inputSearchCp = document.getElementById('input-search-cp') as HTMLInputElement;
const btnSearchCp = document.getElementById('btn-search-cp') as HTMLButtonElement;
const searchResultsContainer = document.getElementById('search-results-container') as HTMLDivElement;
const searchResultsList = document.getElementById('search-results-list') as HTMLDivElement;
const searchFeedback = document.getElementById('search-feedback') as HTMLDivElement;
const spinnerSearch = document.getElementById('spinner-search') as HTMLSpanElement;

const modalCitiesList = document.getElementById('modal-cities-list') as HTMLDivElement;
const countModalCities = document.getElementById('count-modal-cities') as HTMLSpanElement;
const btnResetCities = document.getElementById('btn-reset-cities') as HTMLButtonElement;

// Fonction pour mettre à jour la liste des villes affichée dans le modal de paramètres
function rebuildModalCitiesList() {
    if (!modalCitiesList) return;
    modalCitiesList.innerHTML = '';
    
    if (countModalCities) {
        countModalCities.innerText = cities.length.toString();
    }

    cities.forEach((city, index) => {
        const item = document.createElement('div');
        item.className = "flex items-center justify-between px-4 py-3 hover:bg-slate-900/50 transition border-b border-slate-800/40 last:border-0";
        item.innerHTML = `
            <div class="flex flex-col">
                <span class="text-sm font-semibold text-white">${city.name}</span>
                <span class="text-[10px] text-slate-400 font-mono">Dép. ${city.dept} • Lat: ${city.lat.toFixed(4)}, Lon: ${city.lon.toFixed(4)}</span>
            </div>
            <button class="btn-delete-city text-slate-500 hover:text-rose-400 p-1.5 rounded hover:bg-slate-800/40 transition" data-index="${index}" title="Supprimer la station">
                <svg class="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                    <path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M19 7l-.867 12.142A2 2 0 0116.138 21H7.862a2 2 0 01-1.995-1.858L5 7m5 4v6m4-6v6m1-10V4a1 1 0 00-1-1h-4a1 1 0 00-1 1v3M4 7h16"></path>
                </svg>
            </button>
        `;

        item.querySelector('.btn-delete-city')?.addEventListener('click', (e) => {
            const idx = parseInt((e.currentTarget as HTMLButtonElement).getAttribute('data-index') || '0');
            deleteCity(idx);
        });

        modalCitiesList.appendChild(item);
    });
}

function deleteCity(index: number) {
    if (index >= 0 && index < cities.length) {
        const removed = cities[index];
        cities.splice(index, 1);
        saveCities();
        rebuildModalCitiesList();
        rebuildCityDropdown();
        fetchWeatherData();
        showFeedback(`La station <b>${removed.name}</b> a été supprimée.`, 'success');
    }
}

function showFeedback(message: string, type: 'success' | 'error' | 'info') {
    if (!searchFeedback) return;
    searchFeedback.classList.remove('hidden', 'bg-emerald-500/10', 'text-emerald-400', 'border-emerald-500/20', 'bg-rose-500/10', 'text-rose-400', 'border-rose-500/20', 'bg-slate-800/50', 'text-slate-300');
    
    if (type === 'success') {
        searchFeedback.classList.add('bg-emerald-500/10', 'text-emerald-400', 'border', 'border-emerald-500/20');
    } else if (type === 'error') {
        searchFeedback.classList.add('bg-rose-500/10', 'text-rose-400', 'border', 'border-rose-500/20');
    } else {
        searchFeedback.classList.add('bg-slate-800/50', 'text-slate-300');
    }
    
    searchFeedback.innerHTML = message;
    searchFeedback.classList.remove('hidden');
}

// Chamar API de Geocoding por CP ou Nom
async function searchByPostalCode(query: string) {
    if (!query || query.trim().length < 2) {
        showFeedback('Veuillez saisir au moins 2 caractères pour la recherche.', 'error');
        return;
    }

    const trimmedQuery = query.trim();
    const isNumeric = /^\d+$/.test(trimmedQuery);

    // Mostrar loading spinner
    if (spinnerSearch) spinnerSearch.classList.remove('hidden');
    if (btnSearchCp) btnSearchCp.disabled = true;
    if (searchResultsContainer) searchResultsContainer.classList.add('hidden');
    if (searchFeedback) searchFeedback.classList.add('hidden');

    try {
        let url = '';
        if (isNumeric) {
            url = `https://geo.api.gouv.fr/communes?codePostal=${trimmedQuery}&fields=nom,code,centre,codeDepartement,codesPostaux`;
        } else {
            url = `https://geo.api.gouv.fr/communes?nom=${encodeURIComponent(trimmedQuery)}&fields=nom,code,centre,codeDepartement,codesPostaux&boost=population&limit=10`;
        }

        const response = await fetch(url);
        if (!response.ok) {
            throw new Error('Erreur réseau');
        }
        
        const data = await response.json();
        
        if (!data || data.length === 0) {
            showFeedback('Aucune commune trouvée pour cette recherche.', 'error');
            return;
        }

        // Popular os resultados
        if (searchResultsList) {
            searchResultsList.innerHTML = '';
            
            data.forEach((commune: any) => {
                const deptCode = commune.codeDepartement;
                let deptName = 'Autre';
                if (deptCode === '14') deptName = 'Calvados';
                else if (deptCode === '50') deptName = 'Manche';
                else if (deptCode === '61') deptName = 'Orne';
                else deptName = `Dép ${deptCode}`;

                const exists = cities.some(c => c.name.toLowerCase() === commune.nom.toLowerCase());

                const cpToShow = commune.codesPostaux && commune.codesPostaux.length > 0 
                    ? commune.codesPostaux[0] 
                    : (isNumeric ? trimmedQuery : 'N/A');

                const row = document.createElement('div');
                row.className = "flex items-center justify-between p-2 hover:bg-slate-800 rounded transition text-xs border-b border-slate-800 last:border-0";
                row.innerHTML = `
                    <div class="flex flex-col">
                        <span class="font-semibold text-white">${commune.nom} <span class="text-[9px] text-slate-400 font-normal">(${deptName})</span></span>
                        <span class="text-[9px] text-slate-500 font-mono">CP: ${cpToShow}</span>
                    </div>
                    ${exists 
                        ? `<span class="text-[10px] text-slate-500 font-medium px-2 py-1">Enregistrée</span>`
                        : `<button class="btn-add-commune bg-sky-600 hover:bg-sky-500 text-white font-bold px-2.5 py-1 rounded transition text-[10px]" data-name="${commune.nom}" data-lat="${commune.centre.coordinates[1]}" data-lon="${commune.centre.coordinates[0]}" data-dept="${deptName}">
                             Ajouter
                           </button>`
                    }
                `;

                row.querySelector('.btn-add-commune')?.addEventListener('click', (e) => {
                    const btn = e.currentTarget as HTMLButtonElement;
                    const name = btn.getAttribute('data-name') || '';
                    const lat = parseFloat(btn.getAttribute('data-lat') || '0');
                    const lon = parseFloat(btn.getAttribute('data-lon') || '0');
                    const dept = btn.getAttribute('data-dept') || '';
                    addCityFromCommune({ nom: name, centre: { coordinates: [lon, lat] } }, dept);
                });

                searchResultsList.appendChild(row);
            });

            if (searchResultsContainer) searchResultsContainer.classList.remove('hidden');
        }

    } catch (error) {
        console.error(error);
        showFeedback('Erreur lors de la recherche de la commune.', 'error');
    } finally {
        if (spinnerSearch) spinnerSearch.classList.add('hidden');
        if (btnSearchCp) btnSearchCp.disabled = false;
    }
}

function addCityFromCommune(commune: any, deptName: string) {
    if (!commune || !commune.centre || !commune.centre.coordinates) {
        showFeedback('Données de localisation invalides.', 'error');
        return;
    }

    const lon = commune.centre.coordinates[0];
    const lat = commune.centre.coordinates[1];

    // Adiciona ao array global
    const newCity: City = {
        name: commune.nom,
        lat: lat,
        lon: lon,
        dept: deptName
    };

    cities.push(newCity);
    saveCities();
    
    // Atualizar interfaces
    rebuildModalCitiesList();
    rebuildCityDropdown();
    fetchWeatherData();

    // Feedback
    showFeedback(`La station <b>${commune.nom}</b> a été ajoutée !`, 'success');
    if (searchResultsContainer) searchResultsContainer.classList.add('hidden');
    if (inputSearchCp) inputSearchCp.value = '';
}

// Ouvintes do Modal
if (btnSettings) {
    btnSettings.addEventListener('click', () => {
        if (settingsModal) {
            settingsModal.classList.remove('hidden');
            rebuildModalCitiesList();
            if (searchResultsContainer) searchResultsContainer.classList.add('hidden');
            if (searchFeedback) searchFeedback.classList.add('hidden');
            if (inputSearchCp) inputSearchCp.value = '';
        }
    });
}

function closeSettings() {
    if (settingsModal) {
        settingsModal.classList.add('hidden');
    }
}

if (btnCloseSettings) btnCloseSettings.addEventListener('click', closeSettings);
if (btnCloseSettingsBottom) btnCloseSettingsBottom.addEventListener('click', closeSettings);

if (btnSearchCp) {
    btnSearchCp.addEventListener('click', () => {
        if (inputSearchCp) searchByPostalCode(inputSearchCp.value.trim());
    });
}

if (inputSearchCp) {
    inputSearchCp.addEventListener('keypress', (e) => {
        if (e.key === 'Enter') {
            searchByPostalCode(inputSearchCp.value.trim());
        }
    });
}

if (btnResetCities) {
    btnResetCities.addEventListener('click', () => {
        if (confirm('Voulez-vous vraiment réinitialiser la liste des stations par défaut ?')) {
            cities = [...DEFAULT_CITIES];
            saveCities();
            rebuildModalCitiesList();
            rebuildCityDropdown();
            fetchWeatherData();
            showFeedback('Les stations ont été réinitialisées par défaut.', 'info');
        }
    });
}

// 11. GESTION DE LA PERSPECTIVE 3D SUR LE VIEWPORT DE LA CARTE (MapLibre Native 3D Camera Pitch & Rotate)
const toggle3DMode = document.getElementById('toggle-3d-mode') as HTMLInputElement;
const controls3D = document.getElementById('controls-3d') as HTMLDivElement;

const slider3DPitch = document.getElementById('slider-3d-pitch') as HTMLInputElement;
const slider3DYaw = document.getElementById('slider-3d-yaw') as HTMLInputElement;

const val3DPitch = document.getElementById('val-3d-pitch') as HTMLSpanElement;
const val3DYaw = document.getElementById('val-3d-yaw') as HTMLSpanElement;

const btnPresetFlat = document.getElementById('btn-preset-flat') as HTMLButtonElement;
const btnPresetOblique = document.getElementById('btn-preset-oblique') as HTMLButtonElement;
const btnPresetExtreme = document.getElementById('btn-preset-extreme') as HTMLButtonElement;

function update3DTransform() {
    if (!isMapLoaded) return;
    
    const is3DActive = toggle3DMode ? toggle3DMode.checked : false;
    
    if (is3DActive) {
        const pitch = slider3DPitch ? parseInt(slider3DPitch.value) : 35;
        const yaw = slider3DYaw ? parseInt(slider3DYaw.value) : -15;
        
        // Atualizar badges informativas
        if (val3DPitch) val3DPitch.innerText = `${pitch}°`;
        if (val3DYaw) val3DYaw.innerText = `${yaw}°`;
        
        // Aplicar a perspectiva nativa WebGL 3D do MapLibre!
        map.easeTo({
            pitch: pitch,
            bearing: yaw,
            duration: 400
        });
    } else {
        // Modo plano padrão (2D)
        map.easeTo({
            pitch: 0,
            bearing: 0,
            duration: 400
        });
    }
    
    // Forçar atualização imediata do canvas e posições de vento
    setTimeout(() => {
        resizeWindCanvas();
        updateWindEmitters();
    }, 150);
}

// Ouvintes de Eventos para Controle 3D
if (toggle3DMode) {
    toggle3DMode.addEventListener('change', () => {
        const active = toggle3DMode.checked;
        if (controls3D) {
            if (active) {
                controls3D.classList.remove('hidden');
            } else {
                controls3D.classList.add('hidden');
            }
        }
        if (active) {
            // Ao ativar o 3D: aplica automaticamente a inclinação do preset
            // "Oblique" (35°), mas mantendo a orientação voltada para o norte
            // (0°) em vez do yaw padrão do preset. update3DTransform() já anima
            // a transição suavemente (map.easeTo, mesma animação de sempre).
            if (slider3DPitch) slider3DPitch.value = '35';
            if (slider3DYaw) slider3DYaw.value = '0';
        }
        update3DTransform();
    });
}

// Reagir a mudanças nos sliders deslizantes
[slider3DPitch, slider3DYaw].forEach(slider => {
    slider?.addEventListener('input', update3DTransform);
});

// Ações dos botões de predefinição (Presets)
if (btnPresetFlat) {
    btnPresetFlat.addEventListener('click', () => {
        if (slider3DPitch) slider3DPitch.value = '0';
        if (slider3DYaw) slider3DYaw.value = '0';
        update3DTransform();
    });
}

if (btnPresetOblique) {
    btnPresetOblique.addEventListener('click', () => {
        if (slider3DPitch) slider3DPitch.value = '35';
        if (slider3DYaw) slider3DYaw.value = '-15';
        update3DTransform();
    });
}

if (btnPresetExtreme) {
    btnPresetExtreme.addEventListener('click', () => {
        if (slider3DPitch) slider3DPitch.value = '55';
        if (slider3DYaw) slider3DYaw.value = '-8';
        update3DTransform();
    });
}
