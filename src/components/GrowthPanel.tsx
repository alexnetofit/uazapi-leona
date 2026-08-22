"use client";

import { useMemo, useState } from "react";
import { GrowthData, GrowthLive, GrowthSeriesPoint } from "@/lib/types";

type Metric = "connected" | "total";

const PLAYERS = ["Leona", "Zapdata", "Zapix", "BrutalZap"] as const;

const COLOR: Record<string, string> = {
  Leona: "#34d8a0",
  Zapdata: "#6ea8ff",
  Zapix: "#f5c15a",
  BrutalZap: "#c084fc",
};

function formatDay(isoDay: string) {
  const [, m, d] = isoDay.split("-");
  return `${d}/${m}`;
}

function formatNumber(value: number | null) {
  if (value == null) return "—";
  return value.toLocaleString("pt-BR");
}

function lastHourLabel(hours: number[] | undefined) {
  if (!hours?.length) return null;
  const ordered = [...hours].sort((a, b) => (a === 0 ? 24 : a) - (b === 0 ? 24 : b));
  const hour = ordered.at(-1)!;
  return `${String(hour).padStart(2, "0")}h`;
}

function Delta({ value }: { value: number | null }) {
  if (value == null) return <span className="text-[#6a6a7c]">—</span>;
  if (value === 0) return <span className="text-[#6a6a7c]">0</span>;
  const up = value > 0;
  return (
    <span className={up ? "text-[#34d8a0]" : "text-[#ff6b7a]"}>
      {up ? "+" : ""}
      {value.toLocaleString("pt-BR")}
    </span>
  );
}

function Sparkline({
  series,
  metric,
}: {
  series: Record<string, GrowthSeriesPoint[]>;
  metric: Metric;
}) {
  const days = series.Leona?.map((p) => p.day) ?? [];
  const values = PLAYERS.flatMap((name) =>
    (series[name] || []).map((p) => p[metric]).filter((n): n is number => n != null)
  );
  if (days.length < 2 || values.length === 0) return null;

  const min = Math.min(...values);
  const max = Math.max(...values);
  const span = Math.max(max - min, 1);
  const w = 720;
  const h = 200;
  const padL = 8;
  const padR = 8;
  const padT = 16;
  const padB = 28;

  const x = (i: number) =>
    padL + (i * (w - padL - padR)) / Math.max(days.length - 1, 1);
  const y = (v: number) => padT + ((max - v) * (h - padT - padB)) / span;

  return (
    <div>
      <svg
        viewBox={`0 0 ${w} ${h}`}
        className="w-full h-48 sm:h-56"
        role="img"
        aria-label={metric === "connected" ? "Conectadas por dia" : "Criadas por dia"}
      >
        {[0, 0.5, 1].map((t) => {
          const gy = padT + t * (h - padT - padB);
          return (
            <line
              key={t}
              x1={padL}
              x2={w - padR}
              y1={gy}
              y2={gy}
              stroke="rgba(255,255,255,0.06)"
            />
          );
        })}
        {PLAYERS.map((name) => {
          const pts = (series[name] || [])
            .map((p, i) =>
              p[metric] == null ? null : `${x(i).toFixed(1)},${y(p[metric]!).toFixed(1)}`
            )
            .filter(Boolean)
            .join(" ");
          if (!pts) return null;
          return (
            <polyline
              key={name}
              fill="none"
              stroke={COLOR[name] ?? "#8b8b98"}
              strokeWidth={name === "Leona" ? 2.4 : 1.6}
              strokeLinecap="round"
              strokeLinejoin="round"
              points={pts}
            />
          );
        })}
        {days.map((day, i) => (
          <text
            key={day}
            x={x(i)}
            y={h - 6}
            textAnchor="middle"
            fill="#6a6a7c"
            fontSize="11"
          >
            {formatDay(day)}
          </text>
        ))}
      </svg>
      <div className="flex flex-wrap gap-x-5 gap-y-2 mt-1">
        {PLAYERS.map((name) => (
          <div key={name} className="flex items-center gap-2 text-[13px] text-[#9d9dad]">
            <span
              className="w-2 h-2 rounded-full"
              style={{ background: COLOR[name] ?? "#8b8b98" }}
            />
            {name}
          </div>
        ))}
      </div>
    </div>
  );
}

interface GrowthPanelProps {
  data: GrowthData | null;
  live?: GrowthLive | null;
  loading?: boolean;
}

function formatLiveTime(at: string | undefined) {
  if (!at) return null;
  return new Date(at).toLocaleTimeString("pt-BR", {
    timeZone: "America/Sao_Paulo",
    hour: "2-digit",
    minute: "2-digit",
  });
}

export default function GrowthPanel({
  data,
  live,
  loading,
}: GrowthPanelProps) {
  const [metric, setMetric] = useState<Metric>("connected");
  const days = data?.days ?? [];
  const latest = days.at(-1);
  const lastHour = lastHourLabel(latest?.hours);
  const liveTime = formatLiveTime(live?.at);

  /**
   * Cards do topo = contagem ATUAL (ao vivo).
   * O delta continua comparando com a média do último dia fechado.
   * Sem dado ao vivo, cai para o último ponto da série.
   */
  const latestCards = useMemo(() => {
    if (!data || !latest) return [];
    return (data.players.length ? data.players : [...PLAYERS]).map((name) => {
      const point = data.series[name]?.at(-1);
      const liveCounts = live?.players?.[name];
      const liveValue = liveCounts
        ? metric === "connected"
          ? liveCounts.connected
          : liveCounts.total
        : null;
      const value = liveValue ?? point?.[metric] ?? null;

      const previous =
        metric === "connected"
          ? point?.connected ?? null
          : point?.total ?? null;
      const seriesDelta =
        metric === "connected"
          ? point?.connectedDelta ?? null
          : point?.totalDelta ?? null;

      return {
        name,
        value,
        // com valor ao vivo, o delta é contra a média do dia; senão mantém o da série
        delta:
          liveValue != null && previous != null
            ? liveValue - previous
            : seriesDelta,
        isLive: liveValue != null,
      };
    });
  }, [data, latest, live, metric]);

  return (
    <section className="mb-14">
      <div className="flex flex-col sm:flex-row sm:items-end sm:justify-between gap-5 mb-8">
        <div>
          <h2 className="text-[28px] sm:text-[32px] font-semibold tracking-[-0.03em] text-[#f4f4f7] leading-tight">
            Instâncias
          </h2>
          <p className="text-[15px] text-[#9d9dad] mt-1.5 max-w-xl leading-snug">
            {liveTime
              ? `Agora ${liveTime} · série: média do dia`
              : "Média do dia · 9 snaps (08h às 00h)"}
            {lastHour ? ` · último snap ${lastHour}` : ""}
          </p>
        </div>
        <div className="flex items-center gap-3 shrink-0">
          <div className="flex rounded-full bg-[#16161f] p-1">
            {(["connected", "total"] as const).map((key) => (
              <button
                key={key}
                onClick={() => setMetric(key)}
                className={`px-3.5 py-1.5 text-[13px] rounded-full transition-colors ${
                  metric === key
                    ? key === "connected"
                      ? "bg-[#34d8a0] text-[#06261b] font-medium"
                      : "bg-[#6ea8ff] text-[#081428] font-medium"
                    : "text-[#9d9dad] hover:text-[#f4f4f7]"
                }`}
              >
                {key === "connected" ? "Conectadas" : "Criadas"}
              </button>
            ))}
          </div>
          {loading && (
            <span className="w-3.5 h-3.5 rounded-full border border-[#6a6a7c] border-t-[#f4f4f7] animate-spin" />
          )}
        </div>
      </div>

      {!data || days.length === 0 ? (
        <div className="rounded-2xl bg-[#101016] border border-white/[0.06] px-5 py-10 text-[15px] text-[#9d9dad]">
          Sem série ainda. O cron coleta às 08, 10, 12, 14, 16, 18, 20, 22 e 00.
        </div>
      ) : (
        <>
          <div className="grid grid-cols-2 lg:grid-cols-4 gap-px rounded-2xl overflow-hidden bg-white/[0.06] border border-white/[0.06] mb-8">
            {latestCards.map((card) => (
              <div key={card.name} className="bg-[#101016] px-5 py-5 sm:px-6 sm:py-6">
                <p className="flex items-center gap-2 text-[13px]">
                  <span
                    className="w-2 h-2 rounded-full shrink-0"
                    style={{ background: COLOR[card.name] ?? "#8b8b98" }}
                  />
                  <span style={{ color: COLOR[card.name] ?? "#9d9dad" }}>{card.name}</span>
                </p>
                <p className="mt-2 text-[28px] sm:text-[34px] font-semibold tracking-[-0.04em] text-[#f4f4f7] leading-none">
                  {formatNumber(card.value)}
                </p>
                <p className="mt-2 text-[13px]">
                  <Delta value={card.delta} />
                  <span className="text-[#6a6a7c]">
                    {card.isLive ? " vs média do dia" : " vs ontem"}
                  </span>
                </p>
              </div>
            ))}
          </div>

          {days.length >= 2 && data && (
            <div className="rounded-2xl bg-[#101016] border border-white/[0.06] px-4 sm:px-6 pt-5 pb-4 mb-8">
              <Sparkline series={data.series} metric={metric} />
            </div>
          )}

          <div className="rounded-2xl bg-[#101016] border border-white/[0.06] overflow-hidden">
            <table className="w-full text-left">
              <thead>
                <tr className="text-[13px] text-[#6a6a7c]">
                  <th className="font-medium px-5 sm:px-6 py-3">Dia</th>
                  {(data.players.length ? data.players : [...PLAYERS]).map((name) => (
                    <th
                      key={name}
                      className="font-medium px-3 sm:px-4 py-3 text-right"
                      style={{ color: COLOR[name] ?? "#6a6a7c" }}
                    >
                      {name}
                    </th>
                  ))}
                </tr>
              </thead>
              <tbody>
                {[...days].reverse().map((day) => (
                  <tr key={day.day} className="border-t border-white/[0.06]">
                    <td className="px-5 sm:px-6 py-3.5 text-[15px] text-[#f4f4f7]">
                      {formatDay(day.day)}
                    </td>
                    {(data.players.length ? data.players : [...PLAYERS]).map((name) => {
                      const point = data.series[name]?.find((p) => p.day === day.day);
                      const value = point?.[metric] ?? null;
                      const delta =
                        metric === "connected"
                          ? point?.connectedDelta ?? null
                          : point?.totalDelta ?? null;
                      return (
                        <td key={name} className="px-3 sm:px-4 py-3.5 text-right">
                          <div className="text-[15px] text-[#f4f4f7] tabular-nums">
                            {formatNumber(value)}
                          </div>
                          <div className="text-[12px] tabular-nums">
                            <Delta value={delta} />
                          </div>
                        </td>
                      );
                    })}
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </>
      )}
    </section>
  );
}
