"use client";

import { useEffect, useState } from "react";

type Forecast = {
  temp: number;
  feels: number;
  code: number;
  wind: number;
  isDay: boolean;
  high: number;
  low: number;
  hours: { time: string; temp: number }[];
};

// WMO weather codes used by Open-Meteo.
function describe(code: number): string {
  if (code === 0) return "Clear";
  if (code <= 2) return "Partly cloudy";
  if (code === 3) return "Overcast";
  if (code <= 48) return "Fog";
  if (code <= 57) return "Drizzle";
  if (code <= 67) return "Rain";
  if (code <= 77) return "Snow";
  if (code <= 82) return "Showers";
  if (code <= 86) return "Snow showers";
  return "Thunderstorms";
}

const REFRESH_MS = 15 * 60 * 1000;

async function fetchForecast(lat: number, lon: number): Promise<Forecast> {
  const url = new URL("https://api.open-meteo.com/v1/forecast");
  url.search = new URLSearchParams({
    latitude: lat.toFixed(3),
    longitude: lon.toFixed(3),
    current: "temperature_2m,apparent_temperature,weather_code,wind_speed_10m,is_day",
    hourly: "temperature_2m",
    daily: "temperature_2m_max,temperature_2m_min",
    temperature_unit: "fahrenheit",
    wind_speed_unit: "mph",
    timezone: "auto",
    forecast_days: "2",
  }).toString();
  const res = await fetch(url);
  if (!res.ok) throw new Error(`Weather HTTP ${res.status}`);
  const d = await res.json();
  // Hourly series starts at local midnight; take the 12 hours from the current hour.
  const start = Math.max(0, (d.hourly.time as string[]).findIndex((t) => t >= d.current.time.slice(0, 13)));
  return {
    temp: d.current.temperature_2m,
    feels: d.current.apparent_temperature,
    code: d.current.weather_code,
    wind: d.current.wind_speed_10m,
    isDay: d.current.is_day === 1,
    high: d.daily.temperature_2m_max[0],
    low: d.daily.temperature_2m_min[0],
    hours: (d.hourly.time as string[])
      .slice(start, start + 12)
      .map((time, i) => ({ time, temp: d.hourly.temperature_2m[start + i] })),
  };
}

function hourLabel(iso: string) {
  const h = Number(iso.slice(11, 13));
  return `${h % 12 || 12}${h < 12 ? "a" : "p"}`;
}

function Sparkline({ hours }: { hours: Forecast["hours"] }) {
  if (hours.length < 2) return null;
  const w = 240;
  const h = 56;
  const temps = hours.map((p) => p.temp);
  const lo = Math.min(...temps);
  const hi = Math.max(...temps);
  const span = hi - lo || 1;
  const x = (i: number) => 6 + (i / (hours.length - 1)) * (w - 12);
  const y = (t: number) => 10 + (1 - (t - lo) / span) * (h - 22);
  const line = hours.map((p, i) => `${i ? "L" : "M"}${x(i).toFixed(1)} ${y(p.temp).toFixed(1)}`).join(" ");
  const peak = temps.indexOf(hi);
  return (
    <svg viewBox={`0 0 ${w} ${h + 14}`} className="spark" role="img" aria-label={`Next 12 hours: ${Math.round(lo)} to ${Math.round(hi)} degrees`}>
      <defs>
        <linearGradient id="spark-fill" x1="0" x2="0" y1="0" y2="1">
          <stop offset="0%" style={{ stopColor: "var(--accent)", stopOpacity: 0.3 }} />
          <stop offset="100%" style={{ stopColor: "var(--accent)", stopOpacity: 0 }} />
        </linearGradient>
      </defs>
      <path d={`${line} L${x(hours.length - 1)} ${h} L${x(0)} ${h} Z`} fill="url(#spark-fill)" />
      <path d={line} className="spark-line" />
      <circle cx={x(0)} cy={y(temps[0])} r="3" className="spark-now" />
      <text x={x(peak)} y={y(hi) - 4} textAnchor="middle" className="spark-peak">
        {Math.round(hi)}°
      </text>
      <text x={x(0)} y={h + 12} className="spark-axis">Now</text>
      <text x={x(hours.length - 1)} y={h + 12} textAnchor="end" className="spark-axis">
        {hourLabel(hours[hours.length - 1].time)}
      </text>
    </svg>
  );
}

/** Live conditions for the current location from Open-Meteo (free, no API key). */
export default function Weather({ lat, lon }: { lat: number; lon: number }) {
  const [data, setData] = useState<Forecast | null>(null);
  const [failed, setFailed] = useState(false);

  useEffect(() => {
    let alive = true;
    const load = () =>
      fetchForecast(lat, lon)
        .then((f) => {
          if (!alive) return;
          setData(f);
          setFailed(false);
        })
        .catch(() => alive && setFailed(true));
    load();
    const timer = setInterval(load, REFRESH_MS);
    return () => {
      alive = false;
      clearInterval(timer);
    };
  }, [lat, lon]);

  return (
    <section className="glass card weather">
      <p className="eyebrow">Atmospherics</p>
      {data ? (
        <>
          <div className="weather-now">
            <span className="weather-temp">{Math.round(data.temp)}°</span>
            <span className="weather-meta">
              <span>{describe(data.code)}</span>
              <span className="muted">
                H {Math.round(data.high)}° · L {Math.round(data.low)}°
              </span>
            </span>
          </div>
          <p className="muted weather-detail mono">
            Feels {Math.round(data.feels)}° · Wind {Math.round(data.wind)} mph
          </p>
          <Sparkline hours={data.hours} />
        </>
      ) : (
        <p className="muted">{failed ? "Weather is unavailable right now." : "Reading the sky…"}</p>
      )}
    </section>
  );
}
