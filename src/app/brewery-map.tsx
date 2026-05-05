"use client";

import type { BrewStage, BatchStatus, SensorReading, AlarmEvent } from "../lib/domain/types";

interface BreweryMapProps {
  stage?: BrewStage;
  health?: BatchStatus;
  currentReading?: SensorReading;
  alarms: AlarmEvent[];
}

const STAGE_ORDER: BrewStage[] = ["queued", "mash", "boil", "chill", "fermentation"];

type EqStatus = "idle" | "active" | "done" | "warn";

function getStatus(stage: BrewStage | undefined, equipStage: BrewStage, health?: BatchStatus): EqStatus {
  if (!stage) return "idle";
  const cur = STAGE_ORDER.indexOf(stage);
  const eq = STAGE_ORDER.indexOf(equipStage);
  if (cur === eq) return health === "needs_attention" && equipStage === "fermentation" ? "warn" : "active";
  if (cur > eq) return "done";
  return "idle";
}

const EQ: Record<EqStatus, { stroke: string; fill: string; label: string; strokeW: number }> = {
  idle:   { stroke: "#c8d4cc", fill: "#f8faf7",  label: "#8a9890", strokeW: 1.5 },
  active: { stroke: "#276c5f", fill: "#eef8f4",  label: "#1a4f46", strokeW: 2.5 },
  done:   { stroke: "#9bcfb8", fill: "#f3faf5",  label: "#3d7a68", strokeW: 1.5 },
  warn:   { stroke: "#e8a83b", fill: "#fff8eb",  label: "#7a4e10", strokeW: 2.5 },
};

const SENS = {
  temp:    "#b74132",
  gravity: "#276c5f",
  ph:      "#6f5f9c",
  co2:     "#a66a19",
};

interface SensorDotProps {
  cx: number;
  cy: number;
  color: string;
  label: string;
  value?: string;
  active: boolean;
}

function SensorDot({ cx, cy, color, label, value, active }: SensorDotProps) {
  return (
    <g>
      <circle cx={cx} cy={cy} r={active ? 9 : 7} fill={active ? color : "#c8d4cc"} opacity={active ? 0.92 : 0.6} />
      <text x={cx} y={cy + 4} textAnchor="middle" fontSize="7" fill="white" fontWeight="bold">{label}</text>
      {value && active && (
        <text x={cx} y={cy + 20} textAnchor="middle" fontSize="8" fill={color} fontWeight="600">{value}</text>
      )}
      <title>{label}: {value ?? "no data"}</title>
    </g>
  );
}

interface PipeProps {
  x1: number; y1: number; x2: number; y2: number;
  active?: boolean;
}
function Pipe({ x1, y1, x2, y2, active }: PipeProps) {
  return (
    <line
      x1={x1} y1={y1} x2={x2} y2={y2}
      stroke={active ? "#276c5f" : "#9aada6"}
      strokeWidth={active ? 3.5 : 2}
      strokeDasharray={active ? undefined : "6 3"}
      markerEnd={active ? "url(#arrow-active)" : "url(#arrow-idle)"}
    />
  );
}

function Tank({ x, y, w, h, status, label, sublabel, coneH = 28 }: {
  x: number; y: number; w: number; h: number;
  status: EqStatus; label: string; sublabel?: string; coneH?: number;
}) {
  const c = EQ[status];
  const cx = x + w / 2;
  return (
    <g>
      <ellipse cx={cx} cy={y} rx={w / 2} ry={w / 6} fill={c.fill} stroke={c.stroke} strokeWidth={c.strokeW} />
      <rect x={x} y={y} width={w} height={h} fill={c.fill} stroke={c.stroke} strokeWidth={c.strokeW} />
      <polygon
        points={`${x},${y + h} ${x + w},${y + h} ${cx},${y + h + coneH}`}
        fill={c.fill} stroke={c.stroke} strokeWidth={c.strokeW}
      />
      <text x={cx} y={y + h / 2 - 8} textAnchor="middle" fontSize="11" fill={c.label} fontWeight="700">{label}</text>
      {sublabel && (
        <text x={cx} y={y + h / 2 + 8} textAnchor="middle" fontSize="9" fill={c.label}>{sublabel}</text>
      )}
      {status === "active" && (
        <text x={cx} y={y + h / 2 + 22} textAnchor="middle" fontSize="8" fill={c.label}>● ACTIVE</text>
      )}
    </g>
  );
}

function Equipment({ x, y, w, h, status, label, sublabel, rx = 8 }: {
  x: number; y: number; w: number; h: number;
  status: EqStatus; label: string; sublabel?: string; rx?: number;
}) {
  const c = EQ[status];
  const cx = x + w / 2;
  const cy = y + h / 2;
  return (
    <g>
      <rect x={x} y={y} width={w} height={h} rx={rx} fill={c.fill} stroke={c.stroke} strokeWidth={c.strokeW} />
      <text x={cx} y={cy - 4} textAnchor="middle" fontSize="10" fill={c.label} fontWeight="700">{label}</text>
      {sublabel && <text x={cx} y={cy + 12} textAnchor="middle" fontSize="8" fill={c.label}>{sublabel}</text>}
      {status === "active" && <text x={cx} y={cy + 26} textAnchor="middle" fontSize="8" fill={c.label}>● ACTIVE</text>}
    </g>
  );
}

export function BreweryMap({ stage, health, currentReading, alarms }: BreweryMapProps) {
  const mashSt  = getStatus(stage, "mash");
  const boilSt  = getStatus(stage, "boil");
  const chillSt = getStatus(stage, "chill");
  const fermSt  = getStatus(stage, "fermentation", health);

  const fermActive = fermSt === "active" || fermSt === "done" || fermSt === "warn";
  const hasAlarms  = alarms.length > 0;

  const tempVal    = currentReading ? `${currentReading.temperatureC}°C` : undefined;
  const gravVal    = currentReading ? `${currentReading.gravity}` : undefined;
  const phVal      = currentReading ? `${currentReading.pH}` : undefined;
  const co2Val     = currentReading ? `${currentReading.co2Ppm}ppm` : undefined;

  return (
    <div className="brewery-map">
      <svg viewBox="0 0 960 490" className="brewery-svg" role="img" aria-label="Brewery warehouse floor plan">
        <defs>
          <marker id="arrow-idle"   markerWidth="7" markerHeight="5" refX="6" refY="2.5" orient="auto">
            <polygon points="0 0, 7 2.5, 0 5" fill="#9aada6" />
          </marker>
          <marker id="arrow-active" markerWidth="7" markerHeight="5" refX="6" refY="2.5" orient="auto">
            <polygon points="0 0, 7 2.5, 0 5" fill="#276c5f" />
          </marker>
        </defs>

        {/* Warehouse outline */}
        <rect x="4" y="4" width="952" height="482" rx="10" fill="none" stroke="#c8d4cc" strokeWidth="2" strokeDasharray="8 4" />

        {/* ── Zone: Brew House ─────────────────────────────────────── */}
        <rect x="10" y="10" width="598" height="298" rx="8" fill="#f5f8f4" stroke="#d0d8d0" strokeWidth="1" />
        <text x="24" y="30" fontSize="10" fill="#5f6d68" fontWeight="700" letterSpacing="1.5">BREW HOUSE</text>

        {/* ── Zone: Fermentation ───────────────────────────────────── */}
        <rect x="620" y="10" width="334" height="298" rx="8" fill="#f0f8f3" stroke="#c8dcd4" strokeWidth="1" />
        <text x="634" y="30" fontSize="10" fill="#5f6d68" fontWeight="700" letterSpacing="1.5">FERMENTATION CELLAR</text>

        {/* ── Zone: Utilities ──────────────────────────────────────── */}
        <rect x="10" y="322" width="944" height="158" rx="8" fill="#f3f5f8" stroke="#d0d4da" strokeWidth="1" />
        <text x="24" y="340" fontSize="10" fill="#5f6d68" fontWeight="700" letterSpacing="1.5">UTILITIES &amp; SUPPORT</text>

        {/* ── Grain Silos ──────────────────────────────────────────── */}
        <Tank x={22} y={48} w={56} h={170} status="idle" label="SILO A" coneH={20} />
        <Tank x={86} y={68} w={56} h={150} status="idle" label="SILO B" coneH={20} />

        <Pipe x1={148} y1={148} x2={188} y2={148} active={false} />

        {/* Mill */}
        <Equipment x={152} y={120} w={34} h={58} status="idle" label="MILL" rx={4} />

        <Pipe x1={190} y1={148} x2={218} y2={148} active={mashSt === "done" || mashSt === "active"} />

        {/* ── Mash Tun ─────────────────────────────────────────────── */}
        <Tank x={220} y={50} w={115} h={185} status={mashSt} label="MASH TUN" coneH={26} />
        {(mashSt === "active" || mashSt === "done") && (
          <SensorDot cx={234} cy={195} color={SENS.temp} label="T°" value={mashSt === "active" ? tempVal : undefined} active={mashSt === "active"} />
        )}

        <Pipe x1={337} y1={148} x2={368} y2={148} active={mashSt === "done"} />

        {/* ── Boil Kettle ──────────────────────────────────────────── */}
        <Tank x={370} y={35} w={128} h={205} status={boilSt} label="BOIL KETTLE" coneH={28} />
        {(boilSt === "active" || boilSt === "done") && (
          <SensorDot cx={384} cy={205} color={SENS.temp} label="T°" value={boilSt === "active" ? tempVal : undefined} active={boilSt === "active"} />
        )}
        {/* Hop addition label */}
        {boilSt === "active" && (
          <text x={434} y={280} textAnchor="middle" fontSize="8" fill="#5f6d68">+ Hop Addition</text>
        )}

        <Pipe x1={500} y1={148} x2={535} y2={148} active={boilSt === "done"} />

        {/* ── Heat Exchanger / Chiller ─────────────────────────────── */}
        <Equipment x={537} y={98} w={72} h={110} status={chillSt} label="HEAT" sublabel="EXCHANGER" rx={6} />
        {/* Chiller detail lines */}
        {[118, 132, 146, 160, 174, 188].map((yy) => (
          <line key={yy} x1={543} y1={yy} x2={603} y2={yy} stroke={EQ[chillSt].stroke} strokeWidth="0.8" opacity="0.4" />
        ))}

        <Pipe x1={610} y1={153} x2={634} y2={153} active={chillSt === "done"} />

        {/* ── Fermentation Tanks ───────────────────────────────────── */}

        {/* FV 1 — active batch */}
        <Tank x={636} y={22} w={92} h={235} status={fermSt} label="FV 1" sublabel={stage === "fermentation" ? "Current Batch" : undefined} coneH={32} />

        {/* Sensors on FV1 */}
        <SensorDot cx={655} cy={132} color={SENS.temp}    label="T°"  value={tempVal} active={fermActive} />
        <SensorDot cx={687} cy={158} color={SENS.gravity} label="SG"  value={gravVal} active={fermActive} />
        <SensorDot cx={655} cy={188} color={SENS.ph}      label="pH"  value={phVal}   active={fermActive} />
        <SensorDot cx={687} cy={218} color={SENS.co2}     label="CO₂" value={co2Val}  active={fermActive} />

        {/* Alarm indicator on FV1 */}
        {hasAlarms && fermActive && (
          <g>
            <circle cx={720} cy={30} r={11} fill="#b74132" />
            <text x={720} y={35} textAnchor="middle" fontSize="10" fill="white" fontWeight="bold">!</text>
            <title>{alarms.length} alarm(s) active on FV 1</title>
          </g>
        )}

        {/* FV 2 — standby */}
        <Tank x={738} y={22} w={92} h={235} status="idle" label="FV 2" sublabel="Standby" coneH={32} />
        <SensorDot cx={757} cy={150} color={SENS.temp}    label="T°"  active={false} />
        <SensorDot cx={789} cy={180} color={SENS.gravity} label="SG"  active={false} />

        {/* FV 3 — standby */}
        <Tank x={840} y={22} w={92} h={235} status="idle" label="FV 3" sublabel="Standby" coneH={32} />
        <SensorDot cx={859} cy={150} color={SENS.temp}    label="T°"  active={false} />
        <SensorDot cx={891} cy={180} color={SENS.gravity} label="SG"  active={false} />

        {/* ── Sensor value display bar (below FV1) ─────────────────── */}
        {currentReading && fermActive && (
          <g>
            <rect x={636} y={294} width={186} height={22} rx="4" fill="rgba(39,108,95,0.1)" stroke="#276c5f" strokeWidth="0.5" />
            <text x={646} y={309} fontSize="8.5" fill="#1a4f46" fontWeight="500">
              {`${currentReading.temperatureC}°C  ·  SG ${currentReading.gravity}  ·  pH ${currentReading.pH}  ·  ${currentReading.co2Ppm}ppm`}
            </text>
          </g>
        )}

        {/* ── Utilities ────────────────────────────────────────────── */}

        {/* Control Room */}
        <g>
          <rect x={18} y={348} width={175} height={120} rx="8" fill="#e8eef5" stroke="#9baabf" strokeWidth="1.5" />
          <text x={105} y={375} textAnchor="middle" fontSize="11" fill="#334466" fontWeight="700">CONTROL ROOM</text>
          <text x={105} y={392} textAnchor="middle" fontSize="8.5" fill="#556688">Temporal Workflows</text>
          <text x={105} y={408} textAnchor="middle" fontSize="8.5" fill="#556688">Batch Management</text>
          {/* Status lights */}
          <circle cx={52} cy={432} r={6} fill={stage ? "#276c5f" : "#c8d4cc"} />
          <circle cx={72} cy={432} r={6} fill={hasAlarms ? "#b74132" : "#c8d4cc"} />
          <circle cx={92} cy={432} r={6} fill="#e8c060" />
          <text x={42}  y={447} fontSize="7" fill="#556688">SYS</text>
          <text x={62}  y={447} fontSize="7" fill="#556688">ALM</text>
          <text x={82}  y={447} fontSize="7" fill="#556688">WARN</text>
          <title>Control Room — System: {stage ? "online" : "idle"} | Alarms: {alarms.length}</title>
        </g>

        {/* CO₂ Recovery System */}
        <g>
          <rect x={210} y={355} width={132} height={110} rx="8" fill="#fff8eb" stroke="#c8a870" strokeWidth="1.5" />
          <text x={276} y={382} textAnchor="middle" fontSize="11" fill="#7a4e10" fontWeight="700">CO₂ SYSTEM</text>
          <text x={276} y={398} textAnchor="middle" fontSize="8.5" fill="#a66a19">Monitor &amp; Recovery</text>
          <circle cx={253} cy={424} r={8} fill={SENS.co2} opacity="0.85" />
          <text x={253} y={428} textAnchor="middle" fontSize="7" fill="white" fontWeight="bold">CO₂</text>
          <text x={270} y={428} fontSize="8.5" fill="#7a4e10">{co2Val ?? "— ppm"}</text>
        </g>

        {/* CIP Station */}
        <g>
          <rect x={358} y={355} width={132} height={110} rx="8" fill="#f5f0fa" stroke="#9a8bbf" strokeWidth="1.5" />
          <text x={424} y={382} textAnchor="middle" fontSize="11" fill="#4a3a7a" fontWeight="700">CIP STATION</text>
          <text x={424} y={398} textAnchor="middle" fontSize="8.5" fill="#6f5f9c">Clean-In-Place</text>
          <text x={424} y={413} textAnchor="middle" fontSize="8.5" fill="#6f5f9c">Automated Rinse Cycle</text>
        </g>

        {/* Yeast Lab */}
        <g>
          <rect x={506} y={355} width={132} height={110} rx="8" fill="#f0faf3" stroke="#8abfa0" strokeWidth="1.5" />
          <text x={572} y={382} textAnchor="middle" fontSize="11" fill="#1a4f46" fontWeight="700">YEAST LAB</text>
          <text x={572} y={398} textAnchor="middle" fontSize="8.5" fill="#276c5f">Propagation</text>
          <text x={572} y={413} textAnchor="middle" fontSize="8.5" fill="#276c5f">Viability Testing</text>
        </g>

        {/* Packaging &amp; Cold Storage */}
        <g>
          <rect x={694} y={348} width={258} height={120} rx="8" fill="#f0f4fa" stroke="#9ab0c8" strokeWidth="1.5" />
          <text x={823} y={373} textAnchor="middle" fontSize="11" fill="#234466" fontWeight="700">PACKAGING &amp; COLD STORAGE</text>
          <text x={823} y={390} textAnchor="middle" fontSize="8.5" fill="#3a5a80">Kegs · Cases · Cans</text>
          {/* Shelf lines */}
          <line x1={710} y1={412} x2={938} y2={412} stroke="#9ab0c8" strokeWidth="1" />
          <line x1={710} y1={428} x2={938} y2={428} stroke="#9ab0c8" strokeWidth="1" />
          <text x={823} y={445} textAnchor="middle" fontSize="8" fill="#3a5a80">Inventory Management</text>
        </g>

        {/* ── Legend ───────────────────────────────────────────────── */}
        <g transform="translate(14, 468)">
          <text fontSize="9" fill="#5f6d68" fontWeight="600" letterSpacing="0.5">SENSORS:</text>
          {[
            { cx: 72,  color: SENS.temp,    lbl: "Temp" },
            { cx: 116, color: SENS.gravity, lbl: "Gravity" },
            { cx: 168, color: SENS.ph,      lbl: "pH" },
            { cx: 208, color: SENS.co2,     lbl: "CO₂" },
          ].map(({ cx, color, lbl }) => (
            <g key={lbl}>
              <circle cx={cx} cy={-3} r={5} fill={color} />
              <text x={cx + 8} y={1} fontSize="9" fill="#5f6d68">{lbl}</text>
            </g>
          ))}

          <text x={270} fontSize="9" fill="#5f6d68" fontWeight="600" letterSpacing="0.5">STATUS:</text>
          {(["active", "done", "warn", "idle"] as EqStatus[]).map((s, i) => (
            <g key={s}>
              <rect x={322 + i * 64} y={-9} width={12} height={12} rx="2" fill={EQ[s].fill} stroke={EQ[s].stroke} strokeWidth="1.5" />
              <text x={338 + i * 64} y={1} fontSize="9" fill="#5f6d68">{s.charAt(0).toUpperCase() + s.slice(1)}</text>
            </g>
          ))}
        </g>
      </svg>
    </div>
  );
}
