// 天氣查詢：用 Open-Meteo（免費、不用金鑰）。預設城市是台南，句子裡有別的縣市就用那個。
// 只做「查某一天的預報」，最多看未來 7 天。
const { parseDueDate, taipeiKey } = require('./time');

const DEFAULT_CITY = process.env.WEATHER_CITY || '台南';
const MAX_DAYS = 7;

// 縣市（市政府附近的座標）。「臺」「台」都認。
const CITIES = {
  台北: [25.0330, 121.5654], 新北: [25.0120, 121.4650], 基隆: [25.1276, 121.7392], 桃園: [24.9937, 121.3010],
  新竹: [24.8138, 120.9675], 苗栗: [24.5602, 120.8214], 台中: [24.1477, 120.6736], 彰化: [24.0518, 120.5161],
  南投: [23.9157, 120.6869], 雲林: [23.7092, 120.4313], 嘉義: [23.4801, 120.4491], 台南: [22.9999, 120.2269],
  高雄: [22.6273, 120.3014], 屏東: [22.6762, 120.4940], 宜蘭: [24.7021, 121.7378], 花蓮: [23.9871, 121.6015],
  台東: [22.7583, 121.1444], 澎湖: [23.5711, 119.5793], 金門: [24.4493, 118.3767], 連江: [26.1608, 119.9517],
};

// WMO 天氣代碼 → 中文
function describeCode(code) {
  if (code === 0) return '晴天';
  if (code === 1) return '大致晴朗';
  if (code === 2) return '多雲時晴';
  if (code === 3) return '陰天';
  if (code === 45 || code === 48) return '有霧';
  if (code >= 51 && code <= 57) return '毛毛雨';
  if (code >= 61 && code <= 67) return '下雨';
  if (code >= 71 && code <= 77) return '下雪';
  if (code >= 80 && code <= 82) return '陣雨';
  if (code === 85 || code === 86) return '陣雪';
  if (code >= 95) return '雷雨';
  return '天氣不明';
}

function emojiForCode(code) {
  if (code === 0 || code === 1) return '☀️';
  if (code === 2) return '⛅';
  if (code === 3) return '☁️';
  if (code === 45 || code === 48) return '🌫';
  if (code >= 51 && code <= 67) return '🌧';
  if (code >= 80 && code <= 82) return '🌦';
  if (code >= 71 && code <= 86) return '❄️';
  if (code >= 95) return '⛈';
  return '🌡';
}

// 是不是在問天氣（短句才算，避免「天氣好的時候去爬山」這種一般待辦被攔走）
function isWeatherQuery(text) {
  const t = String(text || '').trim();
  return t.length <= 24 && /天氣|氣象|會下雨嗎|下雨嗎|要帶傘嗎|需要帶傘/.test(t);
}

// 從句子找縣市；找不到回預設
function findCity(text) {
  const norm = String(text).replace(/臺/g, '台');
  const hit = Object.keys(CITIES).find(c => norm.includes(c));
  return hit || DEFAULT_CITY;
}

// 這句話問的是哪一天（YYYY-MM-DD，台北時間）；沒講日期就是今天。
// 「那天」這類要靠上一件事的日期，由呼叫端帶進 fallbackISO。
function findDateKey(text, fallbackISO, now = new Date()) {
  const iso = parseDueDate(text);
  if (iso) return taipeiKey(iso);
  if (fallbackISO && /那天|那一天|當天|那時候/.test(text)) return taipeiKey(fallbackISO);
  return taipeiKey(now.toISOString());
}

async function fetchDaily(lat, lon) {
  const url = 'https://api.open-meteo.com/v1/forecast'
    + `?latitude=${lat}&longitude=${lon}`
    + '&daily=weather_code,temperature_2m_max,temperature_2m_min,precipitation_probability_max'
    + `&timezone=Asia%2FTaipei&forecast_days=${MAX_DAYS}`;
  const ctrl = new AbortController();
  const timer = setTimeout(() => ctrl.abort(), 6000);
  try {
    const res = await fetch(url, { signal: ctrl.signal });
    if (!res.ok) throw new Error(`weather HTTP ${res.status}`);
    return (await res.json()).daily;
  } finally {
    clearTimeout(timer);
  }
}

function dayLabel(dateKey, todayKey) {
  const diff = Math.round((Date.parse(`${dateKey}T00:00:00Z`) - Date.parse(`${todayKey}T00:00:00Z`)) / 86400000);
  const md = `${+dateKey.slice(5, 7)}/${+dateKey.slice(8, 10)}`;
  const name = diff === 0 ? '今天' : diff === 1 ? '明天' : diff === 2 ? '後天' : '';
  return name ? `${name}（${md}）` : md;
}

// 純函式：把預報整理成一段文字
function formatForecast(city, dateKey, daily, now = new Date()) {
  const todayKey = taipeiKey(now.toISOString());
  const i = daily && daily.time ? daily.time.indexOf(dateKey) : -1;
  if (i < 0) {
    return dateKey < todayKey
      ? `${city} ${dayLabel(dateKey, todayKey)} 已經過去了，我只能查今天起 ${MAX_DAYS} 天內的預報。`
      : `${city} ${dayLabel(dateKey, todayKey)} 太遠了，我只能查未來 ${MAX_DAYS} 天內的預報。`;
  }
  const code = daily.weather_code[i];
  const hi = Math.round(daily.temperature_2m_max[i]);
  const lo = Math.round(daily.temperature_2m_min[i]);
  const rain = daily.precipitation_probability_max && daily.precipitation_probability_max[i];
  const lines = [
    `${emojiForCode(code)} ${city} ${dayLabel(dateKey, todayKey)}：${describeCode(code)}`,
    `🌡 ${lo}–${hi}°C`,
  ];
  if (typeof rain === 'number') lines.push(`☔ 降雨機率 ${rain}%${rain >= 50 ? '，記得帶傘' : ''}`);
  return lines.join('\n');
}

async function handleWeather(text, { fallbackISO = null, fetchDailyFn = fetchDaily, now = new Date() } = {}) {
  const city = findCity(text);
  const dateKey = findDateKey(text, fallbackISO, now);
  const [lat, lon] = CITIES[city];
  try {
    return formatForecast(city, dateKey, await fetchDailyFn(lat, lon), now);
  } catch (err) {
    console.error('weather error:', err);
    return '天氣服務暫時連不上，等一下再問我一次。';
  }
}

module.exports = { isWeatherQuery, handleWeather, _test: { findCity, findDateKey, formatForecast, describeCode, CITIES } };
