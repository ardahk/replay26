"use client";

import { useState } from "react";
import {
  CartesianGrid,
  Legend,
  Line,
  LineChart,
  ResponsiveContainer,
  Tooltip,
  XAxis,
  YAxis
} from "recharts";
import type { SensorReading } from "../lib/domain/types";

type SensorKey = "temperatureC" | "gravity" | "pH" | "co2Ppm";

const SENSORS: { key: SensorKey; label: string; color: string; unit: string; yAxisId: string }[] = [
  { key: "temperatureC", label: "Temp °C",  color: "#b74132", unit: "°C",  yAxisId: "left"  },
  { key: "gravity",      label: "Gravity",  color: "#276c5f", unit: "",    yAxisId: "right" },
  { key: "pH",           label: "pH",       color: "#6f5f9c", unit: "",    yAxisId: "left"  },
  { key: "co2Ppm",       label: "CO₂ ppm", color: "#a66a19", unit: "ppm", yAxisId: "right" },
];

const RANGES = [
  { label: "10",  value: 10  },
  { label: "25",  value: 25  },
  { label: "50",  value: 50  },
  { label: "All", value: 0   },
];

function fmtTime(ts: string) {
  return new Intl.DateTimeFormat(undefined, { hour: "2-digit", minute: "2-digit", second: "2-digit" }).format(new Date(ts));
}

export function SensorPanel({ readings }: { readings: SensorReading[] }) {
  const [visible, setVisible] = useState<Set<SensorKey>>(
    new Set(["temperatureC", "gravity", "pH", "co2Ppm"])
  );
  const [range, setRange] = useState(25);

  const displayed = range === 0 ? readings : readings.slice(-range);
  const latest = readings.at(-1);

  function toggle(key: SensorKey) {
    setVisible((prev) => {
      const next = new Set(prev);
      if (next.has(key)) next.delete(key);
      else next.add(key);
      return next;
    });
  }

  const data = displayed.map((r) => ({ ...r, time: fmtTime(r.timestamp) }));

  const leftActive  = visible.has("temperatureC") || visible.has("pH");
  const rightActive = visible.has("gravity") || visible.has("co2Ppm");

  return (
    <div className="sensor-panel">
      {/* ── Metric stat cards (click to toggle) ── */}
      <div className="sensor-stats">
        {SENSORS.map((s) => {
          const on = visible.has(s.key);
          const val = latest ? `${latest[s.key]}${s.unit}` : "n/a";
          return (
            <button
              key={s.key}
              className={`sensor-stat ${on ? "on" : "off"}`}
              style={{ "--sensor-color": s.color } as React.CSSProperties}
              onClick={() => toggle(s.key)}
            >
              <span className="sensor-stat-label">{s.label}</span>
              <strong className="sensor-stat-value" style={{ color: on ? s.color : undefined }}>
                {val}
              </strong>
              <span className="sensor-stat-toggle">{on ? "● visible" : "○ hidden"}</span>
            </button>
          );
        })}
      </div>

      {/* ── Time range controls ── */}
      <div className="sensor-controls">
        <span className="note">Last readings:</span>
        {RANGES.map((r) => (
          <button
            key={r.label}
            className={range === r.value ? "selected" : ""}
            onClick={() => setRange(r.value)}
          >
            {r.label}
          </button>
        ))}
        <span className="note" style={{ marginLeft: "auto" }}>
          {displayed.length} / {readings.length} readings shown
        </span>
      </div>

      {/* ── Chart ── */}
      <div className="chart-wrap tall">
        {data.length === 0 ? (
          <div className="empty-chart">Waiting for sensor readings</div>
        ) : visible.size === 0 ? (
          <div className="empty-chart">Select a sensor above to display data</div>
        ) : (
          <ResponsiveContainer width="100%" height="100%">
            <LineChart data={data} margin={{ top: 8, right: 16, left: 0, bottom: 0 }}>
              <CartesianGrid strokeDasharray="3 3" stroke="#e8ede8" />
              <XAxis dataKey="time" minTickGap={28} tick={{ fontSize: 11 }} />
              <YAxis
                yAxisId="left"
                orientation="left"
                hide={!leftActive}
                tick={{ fontSize: 11 }}
                width={40}
              />
              <YAxis
                yAxisId="right"
                orientation="right"
                domain={[1, 1.12]}
                hide={!rightActive}
                tick={{ fontSize: 11 }}
                width={50}
              />
              <Tooltip
                contentStyle={{ fontSize: 12, borderRadius: 6, border: "1px solid #d8ded5" }}
                formatter={(value, name) => {
                  const s = SENSORS.find((x) => x.label === name);
                  return [`${value}${s?.unit ?? ""}`, name];
                }}
              />
              <Legend wrapperStyle={{ fontSize: 12, paddingTop: 8 }} />
              {SENSORS.filter((s) => visible.has(s.key)).map((s) => (
                <Line
                  key={s.key}
                  yAxisId={s.yAxisId}
                  type="monotone"
                  dataKey={s.key}
                  stroke={s.color}
                  dot={false}
                  name={s.label}
                  strokeWidth={2}
                  isAnimationActive={false}
                />
              ))}
            </LineChart>
          </ResponsiveContainer>
        )}
      </div>

      {/* ── Latest reading detail row ── */}
      {latest && (
        <div className="sensor-latest">
          {SENSORS.map((s) => (
            <div key={s.key} className="sensor-latest-item">
              <span style={{ color: s.color, fontWeight: 600 }}>{s.label}</span>
              <strong>{latest[s.key]}{s.unit}</strong>
              <small>latest</small>
            </div>
          ))}
          <div className="sensor-latest-item">
            <span style={{ color: "#5f6d68" }}>Scenario</span>
            <strong style={{ fontSize: 13, textTransform: "capitalize" }}>{latest.scenario.replace(/_/g, " ")}</strong>
            <small>tick #{latest.tick}</small>
          </div>
        </div>
      )}
    </div>
  );
}
