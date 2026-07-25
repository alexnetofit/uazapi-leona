"use client";

import { useState, useEffect, useRef } from "react";
import { CompetitorsData } from "@/lib/types";

interface CompetitorsPanelProps {
  data: CompetitorsData | null;
  loading?: boolean;
}

function DiffBadge({ current, previous }: { current: number; previous: number }) {
  const diff = current - previous;
  if (diff === 0) return null;

  return (
    <span
      className={`text-[10px] font-medium px-1 py-0.5 rounded ${
        diff > 0
          ? "text-emerald-400 bg-emerald-950/40"
          : "text-red-400 bg-red-950/40"
      }`}
    >
      {diff > 0 ? "+" : ""}
      {diff}
    </span>
  );
}

export default function CompetitorsPanel({
  data,
  loading,
}: CompetitorsPanelProps) {
  const [expanded, setExpanded] = useState<string | null>(null);
  const [previous, setPrevious] = useState<Record<string, number> | null>(null);
  const lastCheckedRef = useRef<string | null>(null);
  const currentRef = useRef<Record<string, number>>({});

  useEffect(() => {
    if (!data || lastCheckedRef.current === data.checkedAt) return;
    if (lastCheckedRef.current !== null) setPrevious(currentRef.current);
    lastCheckedRef.current = data.checkedAt;
    currentRef.current = Object.fromEntries(
      data.competitors.map((c) => [c.name, c.connected])
    );
  }, [data]);

  const formatDate = (iso: string) =>
    new Date(iso).toLocaleString("pt-BR", { timeZone: "America/Sao_Paulo" });

  return (
    <div className="bg-zinc-900 rounded-2xl border border-zinc-800 p-4 sm:p-6 mb-6">
      <div className="flex items-center justify-between gap-2 mb-3 sm:mb-4">
        <div className="flex items-center gap-2">
          <h2 className="text-base sm:text-lg font-semibold text-zinc-100">
            Concorrentes
          </h2>
          {loading && (
            <svg className="animate-spin h-3.5 w-3.5 text-blue-400" viewBox="0 0 24 24" fill="none">
              <circle cx="12" cy="12" r="10" stroke="currentColor" strokeWidth="4" className="opacity-25" />
              <path fill="currentColor" d="M4 12a8 8 0 018-8V0C5.373 0 0 5.373 0 12h4z" className="opacity-75" />
            </svg>
          )}
        </div>
        {data && (
          <span className="text-[10px] sm:text-sm text-zinc-400 text-right">
            {formatDate(data.checkedAt)}
          </span>
        )}
      </div>

      {!data ? (
        <p className="text-zinc-500 text-xs sm:text-sm">
          Clique em &quot;Atualizar&quot; para consultar os concorrentes.
        </p>
      ) : (
        <div className="grid grid-cols-1 sm:grid-cols-3 gap-2 sm:gap-4">
          {data.competitors.map((competitor) => {
            const isOpen = expanded === competitor.name;
            const prev = previous?.[competitor.name];

            return (
              <div
                key={competitor.name}
                className="bg-zinc-800/50 rounded-xl p-3 sm:p-4"
              >
                <button
                  onClick={() => setExpanded(isOpen ? null : competitor.name)}
                  className="w-full text-left"
                >
                  <div className="flex items-center justify-between gap-2 mb-1">
                    <span className="text-[11px] sm:text-sm text-zinc-300 font-medium">
                      {competitor.name}
                    </span>
                    <span className="text-[10px] text-zinc-500">
                      {competitor.servers.length} srv
                    </span>
                  </div>
                  <div className="flex items-baseline gap-2">
                    <p className="text-xl sm:text-3xl font-bold text-emerald-400">
                      {competitor.connected}
                    </p>
                    {prev !== undefined && (
                      <DiffBadge current={competitor.connected} previous={prev} />
                    )}
                  </div>
                  <p className="text-[9px] sm:text-xs text-zinc-500 mt-0.5">
                    conectadas de {competitor.total}
                  </p>
                  {competitor.failedServers > 0 && (
                    <p className="text-[9px] sm:text-[10px] text-amber-400 mt-1">
                      {competitor.failedServers} servidor(es) sem resposta
                    </p>
                  )}
                </button>

                {isOpen && (
                  <div className="mt-3 pt-3 border-t border-zinc-700/60 space-y-1.5">
                    {competitor.servers.map((server) => (
                      <div
                        key={server.host}
                        className="flex items-center justify-between gap-2"
                      >
                        <span className="text-[10px] text-zinc-400 truncate">
                          {server.host.replace(".uazapi.com", "")}
                        </span>
                        {server.error ? (
                          <span className="text-[10px] text-red-400 shrink-0">
                            erro
                          </span>
                        ) : (
                          <span className="text-[10px] text-zinc-300 shrink-0">
                            <span className="text-emerald-400 font-medium">
                              {server.connected}
                            </span>
                            <span className="text-zinc-500">/{server.total}</span>
                          </span>
                        )}
                      </div>
                    ))}
                  </div>
                )}
              </div>
            );
          })}
        </div>
      )}
    </div>
  );
}
