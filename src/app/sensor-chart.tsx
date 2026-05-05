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

export type HistorySeriesKey = "temperatureC" | "gravity" | "pH" | "co2Ppm";

const SERIES: Record<
  HistorySeriesKey,
  { label: string; stroke: string }
> = {
  temperatureC: { label: "Temp °C", stroke: "#b74132" },
  gravity: { label: "Gravity", stroke: "#276c5f" },
  pH: { label: "pH", stroke: "#6f5f9c" },
  co2Ppm: { label: "CO₂ (ppm)", stroke: "#9f5b2f" }
};

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
  /** Mirrors the process-map step: null means no step selected or no mapping. */
  seriesKeys: HistorySeriesKey[] | null;
}) {
  const data = readings.map((reading) => ({ ...reading, time: formatTime(reading.timestamp) }));

  if (seriesKeys === null) {
    return (
      <div className="empty-chart">
        Select a process step on the map to plot sensor history for that part of the line.
      </div>
    );
  }

  if (seriesKeys.length === 0) {
    return <div className="empty-chart">No sensors are mapped for this step.</div>;
  }

  if (data.length === 0) {
    return <div className="empty-chart">Waiting for sensor readings</div>;
  }

  const showTemp = seriesKeys.includes("temperatureC");
  const showGravity = seriesKeys.includes("gravity");
  const showPh = seriesKeys.includes("pH");
  const showCo2 = seriesKeys.includes("co2Ppm");

  return (
    <div className="chart-root">
      <ResponsiveContainer width="100%" height="100%">
        <LineChart data={data}>
          <CartesianGrid strokeDasharray="3 3" />
          <XAxis dataKey="time" minTickGap={24} />
          {showTemp ? <YAxis yAxisId="temp" orientation="left" /> : null}
          {showGravity ? (
            <YAxis yAxisId="gravity" orientation="right" domain={[1, 1.1]} width={44} />
          ) : null}
          {showPh ? (
            <YAxis yAxisId="ph" orientation="right" domain={["auto", "auto"]} width={40} />
          ) : null}
          {showCo2 ? (
            <YAxis yAxisId="co2" orientation="right" domain={["auto", "auto"]} width={52} />
          ) : null}
          <Tooltip />
          <Legend />
          {showTemp ? (
            <Line
              yAxisId="temp"
              type="monotone"
              dataKey="temperatureC"
              stroke={SERIES.temperatureC.stroke}
              dot={false}
              name={SERIES.temperatureC.label}
            />
          ) : null}
          {showGravity ? (
            <Line
              yAxisId="gravity"
              type="monotone"
              dataKey="gravity"
              stroke={SERIES.gravity.stroke}
              dot={false}
              name={SERIES.gravity.label}
            />
          ) : null}
          {showPh ? (
            <Line
              yAxisId="ph"
              type="monotone"
              dataKey="pH"
              stroke={SERIES.pH.stroke}
              dot={false}
              name={SERIES.pH.label}
            />
          ) : null}
          {showCo2 ? (
            <Line
              yAxisId="co2"
              type="monotone"
              dataKey="co2Ppm"
              stroke={SERIES.co2Ppm.stroke}
              dot={false}
              name={SERIES.co2Ppm.label}
            />
          ) : null}
        </LineChart>
      </ResponsiveContainer>
    </div>
  );
}
