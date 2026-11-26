import { finite, degree, difference, climateAverage, yesterdayTemperature, comparison, weatherDescription } from './weather-logic.mjs';

const $ = id => document.getElementById(id);
const storageKey = 'today-temperature-location-v1';
let selected = null, generation = 0, searchGeneration = 0, geoLastCall = 0, geoQueue = Promise.resolve();
const set = (id, value) => { $(id).textContent = value; };
const show = (id, visible) => { $(id).hidden = !visible; };
const stored = { get(key) { try { return JSON.parse(localStorage.getItem(key)); } catch { return null; } }, set(key, value) { try { localStorage.setItem(key, JSON.stringify(value)); } catch { /* storage is optional */ } } };

async function json(url) {
  const response = await fetch(url);
  if (!response.ok) throw new Error(`HTTP ${response.status}`);
  const result = await response.json();
  if (result.error) throw new Error(result.reason || 'API error');
  return result;
}
function url(base, params) { const result = new URL(base); Object.entries(params).forEach(([key, value]) => result.searchParams.set(key, value)); return result; }
// The public Nominatim service asks clients to stay below one request per second.
function geocode(params, reverse = false) {
  const run = async () => {
    const delay = Math.max(0, 1100 - (Date.now() - geoLastCall));
    if (delay) await new Promise(resolve => setTimeout(resolve, delay));
    geoLastCall = Date.now();
    return json(url(`https://nominatim.openstreetmap.org/${reverse ? 'reverse' : 'search'}`, { ...params, format: 'jsonv2', addressdetails: 1, 'accept-language': 'ko' }));
  };
  const task = geoQueue.then(run, run); geoQueue = task.catch(() => {}); return task;
}
function placeLabel(item) {
  const a = item.address || {};
  return item.name || a.city || a.town || a.village || a.county || a.state || '현재 위치';
}
function placeDetail(item) {
  return item.display_name || [item.address?.state, item.address?.country].filter(Boolean).join(', ');
}
function setLocation(location) {
  if (!finite(location.lat) || !finite(location.lon)) return;
  selected = location; stored.set(storageKey, location);
  set('location-status', ''); show('search-results', false); show('welcome', false); show('weather', true);
  loadWeather();
}

$('search-form').addEventListener('submit', async event => {
  event.preventDefault();
  const query = $('city-input').value.trim();
  if (query.length < 2) { set('location-status', '지역 이름을 두 글자 이상 입력해 주세요.'); return; }
  const request = ++searchGeneration;
  set('location-status', '지역을 찾고 있어요…'); show('search-results', false);
  try {
    const results = await geocode({ q: query, limit: 5 });
    if (request !== searchGeneration) return;
    const list = $('search-results'); list.replaceChildren();
    if (!Array.isArray(results) || !results.length) { set('location-status', '검색 결과가 없어요. 다른 지역 이름으로 검색해 주세요.'); return; }
    results.forEach(item => {
      const lat = Number(item.lat), lon = Number(item.lon); if (!finite(lat) || !finite(lon)) return;
      const li = document.createElement('li'), button = document.createElement('button'), name = document.createElement('strong'), detail = document.createElement('small');
      button.type = 'button'; name.textContent = placeLabel(item); detail.textContent = placeDetail(item); button.append(name, detail);
      button.addEventListener('click', () => { searchGeneration++; setLocation({ name: placeLabel(item), lat, lon }); });
      li.append(button); list.append(li);
    });
    set('location-status', '원하는 지역을 선택해 주세요.'); show('search-results', true);
  } catch { if (request === searchGeneration) set('location-status', '지역 검색에 실패했어요. 인터넷 연결을 확인하고 다시 시도해 주세요.'); }
});

$('locate-button').addEventListener('click', () => {
  const request = ++searchGeneration; show('search-results', false);
  if (!navigator.geolocation) { set('location-status', '이 브라우저에서는 위치를 사용할 수 없어요. 지역을 검색해 주세요.'); return; }
  set('location-status', '현재 위치를 확인하고 있어요…');
  navigator.geolocation.getCurrentPosition(async position => {
    if (request !== searchGeneration) return;
    const lat = position.coords.latitude, lon = position.coords.longitude;
    setLocation({ name: '현재 위치', lat, lon });
    const currentGeneration = generation;
    try {
      const result = await geocode({ lat, lon, zoom: 10 }, true);
      if (currentGeneration !== generation || request !== searchGeneration) return;
      selected.name = placeLabel(result); stored.set(storageKey, selected); set('place-name', selected.name);
    } catch { /* Coordinates are enough to show weather. */ }
  }, error => {
    if (request !== searchGeneration) return;
    set('location-status', error.code === 1 ? '위치 권한이 허용되지 않았어요. 브라우저 설정에서 허용하거나 지역을 검색해 주세요.' : '현재 위치를 확인하지 못했어요. 다시 시도하거나 지역을 검색해 주세요.');
  }, { enableHighAccuracy: false, timeout: 12000, maximumAge: 300000 });
});

$('refresh').addEventListener('click', () => { if (selected) loadWeather(); });
$('climate-retry').addEventListener('click', () => { if (selected && $('weather-content').dataset.date) loadClimate(selected, $('weather-content').dataset.date, generation); });

async function loadWeather() {
  const request = ++generation, location = { ...selected };
  set('place-name', location.name); set('updated', ''); set('weather-status', '날씨를 불러오고 있어요…'); show('weather-content', false); show('climate-retry', false);
  try {
    const data = await json(url('https://api.open-meteo.com/v1/forecast', { latitude: location.lat, longitude: location.lon, current: 'temperature_2m,apparent_temperature,wind_speed_10m,weather_code', hourly: 'temperature_2m', daily: 'temperature_2m_max,temperature_2m_min', past_days: 1, forecast_days: 1, timezone: 'auto' }));
    if (request !== generation) return;
    if (!data.current?.time || !finite(data.current.temperature_2m)) throw new Error('missing current');
    const current = data.current, date = current.time.slice(0, 10);
    const dailyIndex = data.daily?.time?.indexOf(date) ?? -1;
    const low = data.daily?.temperature_2m_min?.[dailyIndex], high = data.daily?.temperature_2m_max?.[dailyIndex];
    const previous = yesterdayTemperature(data.hourly, current.time), compare = finite(previous) ? comparison(current.temperature_2m - previous) : null;
    const weather = weatherDescription(current.weather_code);
    set('updated', `${date.replaceAll('-', '. ')} · ${current.time.slice(11, 16)} 기준 (${data.timezone})`);
    set('current-temp', degree(current.temperature_2m).replace('°', '')); set('low-temp', degree(low)); set('high-temp', degree(high)); set('feels-temp', degree(current.apparent_temperature)); set('condition', weather.label); set('weather-icon', weather.icon);
    set('yesterday-title', compare?.title || '비교 정보가 없어요');
    set('yesterday-copy', compare ? `${compare.text} 어제 기온은 ${degree(previous)}였어요.` : '어제 같은 시각 무렵의 기온을 불러오지 못했어요.');
    const delta = finite(current.apparent_temperature) ? current.apparent_temperature - current.temperature_2m : null;
    let windTitle = '체감 정보를 확인할 수 없어요', windCopy = '체감온도 또는 바람 정보를 불러오지 못했어요.';
    if (finite(delta)) {
      windTitle = delta <= -1 ? `실제보다 ${difference(delta)} 낮게 느껴져요` : delta >= 1 ? `실제보다 ${difference(delta)} 높게 느껴져요` : '기온과 비슷하게 느껴져요';
      windCopy = `현재 기온 ${degree(current.temperature_2m)}, 체감온도 ${degree(current.apparent_temperature)}예요. ${finite(current.wind_speed_10m) && current.wind_speed_10m >= 20 ? '바람이 강해 더 서늘하게 느껴질 수 있어요. ' : ''}체감온도에는 바람과 습도 등이 함께 반영돼요.`;
    }
    set('wind-title', windTitle); set('wind-copy', windCopy); set('wind-tag', finite(current.wind_speed_10m) ? `현재 바람 ${Math.round(current.wind_speed_10m)} km/h` : '바람 정보 없음');
    set('headline', compare ? compare.title + '.' : `${weather.label}, ${degree(current.temperature_2m)}의 날씨예요.`);
    set('story', `${compare ? compare.text + ' ' : ''}${finite(delta) && delta <= -1 ? `체감온도는 ${degree(current.apparent_temperature)}로, 실제 기온보다 낮아요.` : finite(current.apparent_temperature) ? `지금 체감온도는 ${degree(current.apparent_temperature)}예요.` : '체감온도 정보는 현재 제공되지 않아요.'}`);
    $('weather-content').dataset.date = date; $('weather-content').dataset.low = finite(low) ? low : ''; $('weather-content').dataset.high = finite(high) ? high : '';
    set('weather-status', ''); show('weather-content', true);
    loadClimate(location, date, request);
  } catch { if (request === generation) set('weather-status', '날씨를 불러오지 못했어요. 인터넷 연결을 확인한 뒤 새로고침해 주세요.'); }
}

async function loadClimate(location, date, request) {
  set('climate-title', '이맘때 기온을 살펴보고 있어요'); set('climate-copy', '지난 30년의 기온을 비교하고 있어요.'); show('climate-retry', false);
  const year = Number(date.slice(0, 4));
  const key = `today-temperature-climate-v1:${location.lat.toFixed(3)}:${location.lon.toFixed(3)}:${date}`;
  try {
    let avg = stored.get(key);
    if (!avg || !finite(avg.min) || !finite(avg.max)) {
      const data = await json(url('https://archive-api.open-meteo.com/v1/archive', { latitude: location.lat, longitude: location.lon, start_date: `${year - 30}-01-01`, end_date: `${year - 1}-12-31`, daily: 'temperature_2m_max,temperature_2m_min', timezone: 'auto' }));
      avg = climateAverage(data.daily, date); if (!avg) throw new Error('not enough climate data');
      stored.set(key, avg);
    }
    if (request !== generation) return;
    const rawLow = $('weather-content').dataset.low, rawHigh = $('weather-content').dataset.high;
    const low = rawLow === '' ? null : Number(rawLow), high = rawHigh === '' ? null : Number(rawHigh);
    if (!finite(low) || !finite(high)) throw new Error('missing today forecast');
    const lowDiff = low - avg.min, highDiff = high - avg.max;
    const describe = delta => Math.abs(delta) < 1 ? '비슷해요' : `${difference(delta)} ${delta < 0 ? '낮아요' : '높아요'}`;
    set('climate-title', `최저 ${describe(lowDiff)}`);
    set('climate-copy', `이맘때 평균 최저 ${degree(avg.min)}, 최고 ${degree(avg.max)}예요. 오늘 예상 최고는 평균과 ${Math.abs(highDiff) < 1 ? '비슷해요' : `${difference(highDiff)} 차이로 ${highDiff < 0 ? '낮아요' : '높아요'}`} (${year - 30}–${year - 1}년 중 ${avg.years}년).`);
  } catch {
    if (request !== generation) return;
    set('climate-title', '비교 정보를 불러오지 못했어요'); set('climate-copy', '이맘때 기온을 확인할 수 없어요. 잠시 후 다시 시도해 주세요.'); show('climate-retry', true);
  }
}

const saved = stored.get(storageKey);
if (saved && typeof saved.name === 'string' && finite(saved.lat) && finite(saved.lon)) setLocation(saved);
