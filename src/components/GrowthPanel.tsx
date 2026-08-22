"use client";

import { useMemo, useState } from "react";
import { GrowthData, GrowthSeriesPoint } from "@/lib/types";

type Metric = "connected" | "total";

const PLAYER_COLOR: Record<string, string> = {
  Leona: "text-blue-400",
  Zapdata: "text-amber-400",
  Zapix: "text-violet-400",
  BrutalZap: "text-rose-400",
};

const PLAYER_STROKE: Record<string, string> = {
  Leona: "#60a5fa",
  Zapdata: "#fbbf24",
  Zapix: "#a78bfa",
  BrutalZap: "#fb7185",
};

function formatDay(isoDay: string) {
  const [y, m, d] = isoDay.split("-");
  return `${d}/${m}`;
}

function Delta({ value }: { value: number | null }) {
  if (value == null) return <span className="text-zinc-600">—</span>;
  if (value === 0) return <span className="text-zinc-500">0</span>;
  return (
    <span className={value > 0 ? "text-emerald-400" : "text-red-400"}>
      {value > 0 ? "+" : ""}
      {value}
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
  const players = Object.keys(series);
  const days = players[0] ? series[players[0]].map((p) => p.day) : [];
  const values = players.flatMap((name) =>
    series[name].map((p) => p[metric]).filter((n): n is number => n != null)
  );
  if (days.length < 2 || values.length === 0) return null;

  const min = Math.min(...values);
  const max = Math.max(...values);
  const span = Math.max(max - min, 1);
  const w = 640;
  const h = 140;
  const pad = 8;

  const x = (i: number) =>
    pad + (i * (w - pad * 2)) / Math.max(days.length - 1, 1);
  const y = (v: number) => pad + ((max - v) * (h - pad * 2)) / span;

  return (
    <svg
      viewBox={`0 0 ${w} ${h}`}
      className="w-full h-36"
      role="img"
      aria-label={`Crescimento diário (${metric === "connected" ? "conectadas" : "criadas"})`}
    >
      {players.map((name) => {
        const pts = series[name]
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
            stroke={PLAYER_STROKE[name] || "#a1a1aa"}
            strokeWidth="2"
            points={pts}
          />
        );
      })}
    </svg>
  );
}

interface GrowthPanelProps {
  data: GrowthData | null;
  loading?: boolean;
  sampling?: boolean;
  isAdmin?: boolean;
  onSample?: () => void;
}

export default function GrowthPanel({
  data,
  loading,
  sampling,
  isAdmin,
  onSample,
}: GrowthPanelProps) {
  const [metric, setMetric] = useState<Metric>("connected");
  const days = data?.days ?? [];
  const latest = days.at(-1);

  const latestCards = useMemo(() => {
    if (!data || !latest) return [];
    return data.players.map((name) => {
      const point = data.series[name]?.at(-1);
      return {
        name,
        value: point?.[metric] ?? null,
        delta: metric === "connected" ? point?.connectedDelta ?? null : point?.totalDelta ?? null,
      };
    });
  }, [data, latest, metric]);

  const formatStamp = (iso: string | null) => {
    if (!iso) return "Nenhuma amostra ainda";
    if (/^\d{4}-\d{2}-\d{2}$/.test(iso)) return formatDay(iso);
    return new Date(iso).toLocaleString("pt-BR", {
      timeZone: "America/Sao_Paulo",
    });
  };

  return (
    <div className="bg-zinc-900 rounded-2xl border border-zinc-800 p-4 sm:p-6 mb-6">
      <div className="flex flex-wrap items-center justify-between gap-2 mb-3 sm:mb-4">
        <div className="flex items-center gap-2">
          <h2 className="text-base sm:text-lg font-semibold text-zinc-100">
            Crescimento
          </h2>
          {loading && (
            <svg className="animate-spin h-3.5 w-3.5 text-blue-400" viewBox="0 0 24 24" fill="none">
              <circle cx="12" cy="12" r="10" stroke="currentColor" strokeWidth="4" className="opacity-25" />
              <path fill="currentColor" d="M4 12a8 8 0 018-8V0C5.373 0 0 5.373 0 12h4z" className="opacity-75" />
            </svg>
          )}
        </div>
        <div className="flex items-center gap-2">
          <div className="flex rounded-lg bg-zinc-800 p-0.5">
            <button
              onClick={() => setMetric("connected")}
              className={`px-2.5 py-1 text-[10px] sm:text-xs rounded-md ${
                metric === "connected"
                  ? "bg-zinc-700 text-zinc-100"
                  : "text-zinc-400"
              }`}
            >
              Conectadas
            </button>
            <button
              onClick={() => setMetric("total")}
              className={`px-2.5 py-1 text-[10px] sm:text-xs rounded-md ${
                metric === "total"
                  ? "bg-zinc-700 text-zinc-100"
                  : "text-zinc-400"
              }`}
            >
              Criadas
            </button>
          </div>
          {isAdmin && onSample && (
            <button
              onClick={onSample}
              disabled={sampling}
              className="px-2.5 py-1 text-[10px] sm:text-xs rounded-lg bg-zinc-800 text-zinc-300 hover:bg-zinc-700 disabled:opacity-50"
            >
              {sampling ? "Coletando..." : "Amostra agora"}
            </button>
          )}
        </div>
      </div>

      <p className="text-[10px] sm:text-xs text-zinc-500 mb-3">
        Média do dia com 9 amostras (3 manhã, 3 tarde, 3 noite, BRT).{" "}
        {latest
          ? `${latest.sampleCount}/9 hoje · última ${formatStamp(data?.lastSampleAt ?? null)}`
          : "Histórico começa nesta amostra."}
      </p>

      {!data || days.length === 0 ? (
        <p className="text-zinc-500 text-xs sm:text-sm">
          Ainda não tem série. O cron grava às 08, 10, 12, 14, 16, 18, 20, 22 e 00 (BRT),
          ou use &quot;Amostra agora&quot; pra abrir o primeiro ponto.
        </p>
      ) : (
        <>
          <div className="grid grid-cols-2 sm:grid-cols-4 gap-2 sm:gap-3 mb-4">
            {latestCards.map((card) => (
              <div key={card.name} className="bg-zinc-800/50 rounded-xl p-3">
                <p className={`text-[11px] sm:text-sm font-medium ${PLAYER_COLOR[card.name] || "text-zinc-300"}`}>
                  {card.name}
                </p>
                <p className="text-xl sm:text-2xl font-bold text-zinc-100">
                  {card.value ?? "—"}
                </p>
                <p className="text-[10px] sm:text-xs mt-0.5">
                  <Delta value={card.delta} /> vs ontem
                </p>
              </div>
            ))}
          </div>

          {days.length >= 2 && data && (
            <div className="mb-4">
              <Sparkline series={data.series} metric={metric} />
            </div>
          )}

          <div className="overflow-x-auto">
            <table className="w-full text-[10px] sm:text-xs text-left">
              <thead>
                <tr className="text-zinc-500">
                  <th className="pb-2 pr-3 font-medium">Dia</th>
                  <th className="pb-2 pr-3 font-medium">n</th>
                  {data.players.map((name) => (
                    <th key={name} className={`pb-2 pr-3 font-medium ${PLAYER_COLOR[name] || ""}`}>
                      {name}
                    </th>
                  ))}
                </tr>
              </thead>
              <tbody>
                {[...days].reverse().map((day) => (
                  <tr key={day.day} className="border-t border-zinc-800">
                    <td className="py-1.5 pr-3 text-zinc-300">{formatDay(day.day)}</td>
                    <td className="py-1.5 pr-3 text-zinc-500">{day.sampleCount}/9</td>
                    {data.players.map((name) => {
                      const point = data.series[name]?.find((p) => p.day === day.day);
                      const value = point?.[metric];
                      const delta =
                        metric === "connected"
                          ? point?.connectedDelta
                          : point?.totalDelta;
                      return (
                        <td key={name} className="py-1.5 pr-3 text-zinc-200">
                          {value ?? "—"}{" "}
                          <span className="text-zinc-500">
                            (<Delta value={delta ?? null} />)
                          </span>
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
    </div>
  );
}
