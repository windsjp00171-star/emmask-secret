require('./helpers/env');
const test = require('node:test');
const assert = require('node:assert/strict');
const { isWeatherQuery, handleWeather, _test } = require('../lib/weather');
const { findCity, findDateKey, formatForecast } = _test;

// 日期解析（明天、後天）看的是真實時鐘，所以測試也用真實的現在，日期全部由它推出來，
// 不然跨過台北午夜測試就會莫名失敗
const NOW = new Date();
const dayKey = (offset) => new Date(NOW.getTime() + offset * 86400000).toLocaleDateString('en-CA', { timeZone: 'Asia/Taipei' });
const D = (i) => dayKey(i);
const daily = {
  time: [0, 1, 2, 3, 4, 5, 6].map(D),
  weather_code: [0, 2, 61, 3, 95, 1, 80],
  temperature_2m_max: [31.2, 30.4, 26.1, 27, 25, 29, 28],
  temperature_2m_min: [23.6, 23, 22.2, 22, 21, 22, 22],
  precipitation_probability_max: [5, 20, 80, 30, 90, 10, 60],
};

test('isWeatherQuery：短句問天氣才算，一般待辦不攔', () => {
  assert.equal(isWeatherQuery('明天天氣如何'), true);
  assert.equal(isWeatherQuery('高雄後天會下雨嗎'), true);
  assert.equal(isWeatherQuery('那天天氣如何'), true);
  assert.equal(isWeatherQuery('提醒我天氣好的時候帶爸爸去台南新營的糖廠走走順便買東西'), false);
  assert.equal(isWeatherQuery('買牛奶'), false);
});

test('findCity：預設台南，句子裡有縣市就用那個，臺／台都行', () => {
  assert.equal(findCity('明天天氣'), '台南');
  assert.equal(findCity('高雄明天天氣'), '高雄');
  assert.equal(findCity('臺北後天會下雨嗎'), '台北');
});

test('findDateKey：沒講日期是今天；「那天」用帶進來的日期', () => {
  assert.equal(findDateKey('天氣如何', null, NOW), D(0));
  assert.equal(findDateKey('明天天氣', null, NOW), D(1));
  assert.equal(findDateKey('那天天氣如何', '2026-11-18T10:30:00+08:00', NOW), '2026-11-18');
  assert.equal(findDateKey('那天天氣如何', null, NOW), D(0));
});

test('formatForecast：天氣、溫度、降雨機率；機率高會提醒帶傘', () => {
  const sunny = formatForecast('台南', D(1), daily, NOW);
  assert.match(sunny, /台南 明天（\d+\/\d+）：多雲時晴/);
  assert.match(sunny, /23–30°C/);
  assert.match(sunny, /降雨機率 20%$/);
  assert.match(formatForecast('台南', D(2), daily, NOW), /下雨[\s\S]*80%，記得帶傘/);
});

test('formatForecast：超出 7 天或已過去要說明', () => {
  assert.match(formatForecast('台南', D(30), daily, NOW), /太遠了/);
  assert.match(formatForecast('台南', D(-10), daily, NOW), /已經過去/);
});

test('handleWeather：用模擬資料走完整流程；服務連不上時回說明', async () => {
  const ok = await handleWeather('明天天氣如何', { fetchDailyFn: async () => daily, now: NOW });
  assert.match(ok, /台南 明天/);
  const bad = await handleWeather('明天天氣如何', { fetchDailyFn: async () => { throw new Error('x'); }, now: NOW });
  assert.match(bad, /暫時連不上/);
});
