import weatherIconsConfig from './config/weather-icons.json';

interface WeatherIconEntry {
    day: string;
    night: string;
    label: string;
}

interface CdnConfig {
    baseUrl: string;
    version: string;
    format: string;
    style: string;
}

const config = weatherIconsConfig as {
    cdn: CdnConfig;
    codes: Record<string, WeatherIconEntry>;
    rainOverride: WeatherIconEntry;
    default: WeatherIconEntry;
};

function resolveEntry(code: number, precipitation: number): WeatherIconEntry {
    // Preserva o comportamento anterior: chuva detectada tem prioridade sobre o código WMO puro.
    if (precipitation > 0.1) return config.rainOverride;
    return config.codes[String(code)] ?? config.default;
}

const ICON_STYLE_STORAGE_KEY = 'meteo_normandie_icon_style';

export interface IconStyleOption {
    value: string;
    label: string;
}

// Estilos disponíveis no CDN do Meteocons (ver src/config/weather-icons.json).
export const AVAILABLE_ICON_STYLES: IconStyleOption[] = [
    { value: 'fill', label: 'Fill' },
    { value: 'flat', label: 'Flat' },
    { value: 'line', label: 'Line' },
    { value: 'monochrome', label: 'Mono' },
];

// O usuário pode escolher o estilo em Configurations; a escolha fica salva no
// localStorage e sobrepõe o valor padrão do JSON (config.cdn.style).
export function getIconStyle(): string {
    const saved = localStorage.getItem(ICON_STYLE_STORAGE_KEY);
    if (saved && AVAILABLE_ICON_STYLES.some((s) => s.value === saved)) return saved;
    return config.cdn.style;
}

export function setIconStyle(style: string): void {
    localStorage.setItem(ICON_STYLE_STORAGE_KEY, style);
}

// Monta a URL do ícone no CDN oficial do Meteocons a partir do slug + estilo
// selecionado (localStorage, com fallback para o padrão do JSON).
function buildIconUrl(slug: string): string {
    const { baseUrl, version, format } = config.cdn;
    return `${baseUrl}/${version}/${format}/${getIconStyle()}/${slug}.svg`;
}

export function getWeatherIconUrl(code: number, precipitation: number, isDay: boolean): string {
    const entry = resolveEntry(code, precipitation);
    const slug = isDay ? entry.day : entry.night;
    return buildIconUrl(slug);
}

export function getWeatherLabel(code: number, precipitation: number): string {
    return resolveEntry(code, precipitation).label;
}
