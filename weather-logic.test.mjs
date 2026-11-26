import test from 'node:test';
import assert from 'node:assert/strict';
import { climateAverage, seasonalDistance, yesterdayTemperature, comparison, weatherDescription } from './weather-logic.mjs';

test('seasonal windows wrap around new year and handle leap day', () => {
  assert.equal(seasonalDistance('2020-12-31', '2024-01-01'), 1);
  assert.equal(seasonalDistance('2020-02-29', '2024-03-01'), 1);
  assert.equal(seasonalDistance('2019-02-28', '2024-03-01'), 2);
});
test('climate averages use only nearby dates and require sufficient years', () => {
  const daily = { time: [], temperature_2m_min: [], temperature_2m_max: [] };
  for (let year = 1996; year <= 2025; year++) {
    for (let day = 1; day <= 15; day++) {
      daily.time.push(`${year}-03-${String(day).padStart(2, '0')}`);
      daily.temperature_2m_min.push(2); daily.temperature_2m_max.push(12);
    }
    daily.time.push(`${year}-08-01`); daily.temperature_2m_min.push(90); daily.temperature_2m_max.push(90);
  }
  assert.deepEqual(climateAverage(daily, '2026-03-08'), { min: 2, max: 12, years: 30 });
  assert.equal(climateAverage({ time: ['2025-03-08'], temperature_2m_min: [0], temperature_2m_max: [5] }, '2026-03-08'), null);
});
test('yesterday lookup uses the selected location date across new year', () => {
  const hourly = { time: ['2025-12-31T08:00'], temperature_2m: [-1.5] };
  assert.equal(yesterdayTemperature(hourly, '2026-01-01T08:45'), -1.5);
  assert.equal(yesterdayTemperature(hourly, '2026-01-01T09:00'), null);
});
test('comparisons distinguish similar, warmer, and colder weather', () => {
  assert.match(comparison(0.9).title, /비슷/);
  assert.match(comparison(-3.4).title, /3.4° 낮아요/);
  assert.match(comparison(2).title, /2° 높아요/);
  assert.equal(comparison(null), null);
});
test('unknown weather codes have a safe fallback', () => assert.equal(weatherDescription(123).label, '날씨 정보'));
