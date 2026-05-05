"use client";

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

const ALL_SERIES: { key: SensorKey; name: string; color: string; yAxisId: string }[] = [
  { key: "temperatureC", name: "Temp °C",  color: "#b74132", yAxisId: "temp"    },
  { key: "gravity",      name: "Gravity",  color: "#276c5f", yAxisId: "gravity" },
  { key: "pH",           name: "pH",       color: "#6f5f9c", yAxisId: "temp"    },
  { key: "co2Ppm",       name: "CO₂ ppm", color: "#a66a19", yAxisId: "temp"    },
];

function formatTime(value: string): string {
  return new Intl.DateTimeFormat(undefined, {
    hour: "2-digit",
    minute: "2-digit",
    second: "2-digit"
  }).format(new Date(value));
}

export function SensorChart({
  readings,
  seriesKeys
}: {
  readings: SensorReading[];
  seriesKeys?: SensorKey[] | null;
}) {
  const data = readings.map((r) => ({ ...r, time: formatTime(r.timestamp) }));
  const active = seriesKeys ? ALL_SERIES.filter((s) => seriesKeys.includes(s.key)) : ALL_SERIES;
  const showGravityAxis = active.some((s) => s.yAxisId === "gravity");

  return (
    <div className="chart-root">
      {data.length === 0 ? (
        <div className="empty-chart">
          {seriesKeys === null
            ? "Select a process step on the map to plot sensor history."
            : "Waiting for sensor readings"}
        </div>
      ) : (
        <ResponsiveContainer width="100%" height="100%">
          <LineChart data={data}>
            <CartesianGrid strokeDasharray="3 3" stroke="#e8ede8" />
            <XAxis dataKey="time" minTickGap={24} tick={{ fontSize: 11 }} />
            <YAxis yAxisId="temp" orientation="left" tick={{ fontSize: 11 }} width={38} />
            {showGravityAxis && (
              <YAxis yAxisId="gravity" orientation="right" domain={[1, 1.08]} tick={{ fontSize: 11 }} width={50} />
            )}
            <Tooltip contentStyle={{ fontSize: 12, borderRadius: 6 }} />
            <Legend wrapperStyle={{ fontSize: 12 }} />
            {active.map((s) => (
              <Line
                key={s.key}
                yAxisId={s.yAxisId}
                type="monotone"
                dataKey={s.key}
                stroke={s.color}
                dot={false}
                name={s.name}
                strokeWidth={2}
                isAnimationActive={false}
              />
            ))}
          </LineChart>
        </ResponsiveContainer>
      )}
    </div>
  );
}
