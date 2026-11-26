export const finite = value => typeof value === 'number' && Number.isFinite(value);
export const degree = value => finite(value) ? `${Number(value.toFixed(1))}°` : '—';
export const difference = value => `${Math.abs(value).toFixed(1).replace(/\.0$/, '')}°`;

// Compare month/day on a leap-year calendar so December and January are adjacent.
export function seasonalDistance(date, target) {
  const day = value => Date.UTC(2000, Number(value.slice(5, 7)) - 1, Number(value.slice(8, 10))) / 86400000;
  const distance = Math.abs(day(date) - day(target));
  return Math.min(distance, 366 - distance);
}

export function climateAverage(daily, today) {
  if (!daily || !Array.isArray(daily.time)) return null;
  const min = [], max = [], years = new Set();
  daily.time.forEach((date, index) => {
    if (seasonalDistance(date, today) > 7) return;
    if (finite(daily.temperature_2m_min?.[index]) && finite(daily.temperature_2m_max?.[index])) {
      min.push(daily.temperature_2m_min[index]); max.push(daily.temperature_2m_max[index]); years.add(date.slice(0, 4));
    }
  });
  if (years.size < 25 || min.length < 300) return null;
  const avg = values => values.reduce((sum, value) => sum + value, 0) / values.length;
  return { min: avg(min), max: avg(max), years: years.size };
}

export function yesterdayTemperature(hourly, currentTime) {
  if (!hourly?.time || !currentTime) return null;
  const date = new Date(`${currentTime.slice(0, 10)}T00:00:00Z`);
  date.setUTCDate(date.getUTCDate() - 1);
  const time = `${date.toISOString().slice(0, 10)}T${currentTime.slice(11, 13)}:00`;
  const value = hourly.temperature_2m?.[hourly.time.indexOf(time)];
  return finite(value) ? value : null;
}

export function comparison(delta) {
  if (!finite(delta)) return null;
  if (Math.abs(delta) < 1) return { title: '어제와 비슷해요', text: '어제 같은 시각 무렵과 기온 차이가 1° 미만이에요.' };
  const colder = delta < 0;
  return { title: `어제보다 ${difference(delta)} ${colder ? '낮아요' : '높아요'}`, text: `어제 같은 시각 무렵보다 ${difference(delta)} ${colder ? '낮아 더 서늘하게' : '높아 더 따뜻하게'} 느껴질 수 있어요.` };
}

export function weatherDescription(code) {
  if (code === 0) return { label: '맑음', icon: '☀' };
  if ([1, 2].includes(code)) return { label: '구름 조금', icon: '⛅' };
  if (code === 3) return { label: '흐림', icon: '☁' };
  if ([45, 48].includes(code)) return { label: '안개', icon: '≋' };
  if ([51, 53, 55, 56, 57].includes(code)) return { label: '이슬비', icon: '☂' };
  if ([61, 63, 65, 66, 67, 80, 81, 82].includes(code)) return { label: '비', icon: '☂' };
  if ([71, 73, 75, 77, 85, 86].includes(code)) return { label: '눈', icon: '❄' };
  if ([95, 96, 99].includes(code)) return { label: '천둥번개', icon: 'ϟ' };
  return { label: '날씨 정보', icon: '✳' };
}
