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

function formatTime(value: string): string {
  return new Intl.DateTimeFormat(undefined, {
    hour: "2-digit",
    minute: "2-digit",
    second: "2-digit"
  }).format(new Date(value));
}

export function SensorChart({ readings }: { readings: SensorReading[] }) {
  const data = readings.map((reading) => ({ ...reading, time: formatTime(reading.timestamp) }));

  return (
    <div className="chart-root">
      {data.length === 0 ? (
        <div className="empty-chart">Waiting for sensor readings</div>
      ) : (
        <ResponsiveContainer width="100%" height="100%">
          <LineChart data={data}>
            <CartesianGrid strokeDasharray="3 3" />
            <XAxis dataKey="time" minTickGap={24} />
            <YAxis yAxisId="temp" orientation="left" />
            <YAxis yAxisId="gravity" orientation="right" domain={[1, 1.08]} />
            <Tooltip />
            <Legend />
            <Line yAxisId="temp" type="monotone" dataKey="temperatureC" stroke="#b74132" dot={false} name="Temp C" />
            <Line yAxisId="gravity" type="monotone" dataKey="gravity" stroke="#276c5f" dot={false} name="Gravity" />
            <Line yAxisId="temp" type="monotone" dataKey="pH" stroke="#6f5f9c" dot={false} name="pH" />
          </LineChart>
        </ResponsiveContainer>
      )}
    </div>
  );
}
