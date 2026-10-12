"use client";

import { useEffect, useRef } from "react";
import { geoDistance, geoGraticule10, geoOrthographic, geoPath } from "d3-geo";
import { feature } from "topojson-client";
import type { FeatureCollection } from "geojson";
import type { GeometryCollection, Topology } from "topojson-specification";
import countriesTopo from "world-atlas/countries-110m.json";

const topo = countriesTopo as unknown as Topology<{ countries: GeometryCollection }>;
const countries = feature(topo, topo.objects.countries) as FeatureCollection;
const graticule = geoGraticule10();

const ACCENT = "110, 220, 255";
const GOLD = "245, 197, 107";
const DEGREES_PER_SECOND = 9;
const TILT = 18;

/** A slowly spinning wireframe Earth with a pulsing marker on [lon, lat]. */
export default function Globe({ lon, lat }: { lon: number; lat: number }) {
  const canvasRef = useRef<HTMLCanvasElement>(null);
  const target = useRef<[number, number]>([lon, lat]);
  target.current = [lon, lat];

  useEffect(() => {
    const canvas = canvasRef.current;
    if (!canvas) return;
    const ctx = canvas.getContext("2d");
    if (!ctx) return;

    const reduceMotion = window.matchMedia("(prefers-reduced-motion: reduce)").matches;
    const projection = geoOrthographic().clipAngle(90).precision(0.5);
    const path = geoPath(projection, ctx);
    let size = 0;
    // Start with the marker facing the viewer.
    let spin = -target.current[0];
    let last = performance.now();
    let frame = 0;

    const resize = () => {
      const dpr = Math.min(window.devicePixelRatio || 1, 2);
      size = canvas.clientWidth;
      canvas.width = size * dpr;
      canvas.height = size * dpr;
      ctx.setTransform(dpr, 0, 0, dpr, 0, 0);
      projection.scale(size / 2 - 6).translate([size / 2, size / 2]);
    };
    const observer = new ResizeObserver(resize);
    observer.observe(canvas);
    resize();

    const draw = (now: number) => {
      const dt = Math.min(now - last, 100) / 1000;
      last = now;
      if (!reduceMotion) spin = (spin + DEGREES_PER_SECOND * dt) % 360;
      projection.rotate([spin, -TILT]);
      const r = projection.scale();
      const c = size / 2;
      ctx.clearRect(0, 0, size, size);

      // Ocean and atmosphere.
      const ocean = ctx.createRadialGradient(c - r * 0.3, c - r * 0.35, r * 0.1, c, c, r);
      ocean.addColorStop(0, "rgba(30, 80, 115, 0.55)");
      ocean.addColorStop(1, "rgba(6, 18, 30, 0.9)");
      ctx.beginPath();
      path({ type: "Sphere" });
      ctx.fillStyle = ocean;
      ctx.fill();
      ctx.shadowColor = `rgba(${ACCENT}, 0.6)`;
      ctx.shadowBlur = 12;
      ctx.strokeStyle = `rgba(${ACCENT}, 0.7)`;
      ctx.lineWidth = 1.2;
      ctx.stroke();
      ctx.shadowBlur = 0;

      ctx.beginPath();
      path(graticule);
      ctx.strokeStyle = `rgba(${ACCENT}, 0.1)`;
      ctx.lineWidth = 0.6;
      ctx.stroke();

      ctx.beginPath();
      path(countries);
      ctx.fillStyle = `rgba(${ACCENT}, 0.2)`;
      ctx.fill();
      ctx.strokeStyle = `rgba(${ACCENT}, 0.55)`;
      ctx.lineWidth = 0.5;
      ctx.stroke();

      // Marker, only while it is on the near side of the globe.
      const point = target.current;
      const centre: [number, number] = [-spin, TILT];
      const xy = projection(point);
      if (xy && geoDistance(point, centre) < Math.PI / 2) {
        const [x, y] = xy;
        const pulse = reduceMotion ? 0.5 : (now / 1400) % 1;
        ctx.beginPath();
        ctx.arc(x, y, 4 + pulse * 14, 0, Math.PI * 2);
        ctx.strokeStyle = `rgba(${GOLD}, ${0.9 * (1 - pulse)})`;
        ctx.lineWidth = 1.5;
        ctx.stroke();
        ctx.beginPath();
        ctx.arc(x, y, 3.5, 0, Math.PI * 2);
        ctx.fillStyle = `rgb(${GOLD})`;
        ctx.shadowColor = `rgb(${GOLD})`;
        ctx.shadowBlur = 10;
        ctx.fill();
        ctx.shadowBlur = 0;
      }

      if (!reduceMotion) frame = requestAnimationFrame(draw);
    };
    frame = requestAnimationFrame(draw);

    return () => {
      cancelAnimationFrame(frame);
      observer.disconnect();
    };
  }, []);

  return <canvas ref={canvasRef} className="globe" role="img" aria-label="Spinning globe marking your location" />;
}
