"use client";

import { PreviousCount } from "@/lib/types";

interface ServerCardProps {
  serverName: string;
  totalInstances: number;
  connectedInstances: number;
  disconnectedInstances: number;
  timestamp: string;
  previous: PreviousCount | null;
  error?: boolean;
  dc?: string;
  isRefreshing?: boolean;
  onRemove?: (name: string) => void;
}

function DiffBadge({ current, previous }: { current: number; previous: number }) {
  const diff = current - previous;
  if (diff === 0) return null;

  const isPositive = diff > 0;
  return (
    <span
      className={`text-[10px] font-medium px-1 py-0.5 rounded ${
        isPositive
          ? "text-emerald-400 bg-emerald-950/40"
          : "text-red-400 bg-red-950/40"
      }`}
    >
      {isPositive ? "+" : ""}
      {diff}
    </span>
  );
}

export default function ServerCard({
  serverName,
  totalInstances,
  connectedInstances,
  disconnectedInstances,
  timestamp,
  previous,
  error,
  dc,
  isRefreshing,
  onRemove,
}: ServerCardProps) {
  const formatDate = (iso: string) => {
    if (!iso) return "";
    const d = new Date(iso);
    return d.toLocaleString("pt-BR", { timeZone: "America/Sao_Paulo" });
  };

  const connectedPercent =
    totalInstances > 0
      ? ((connectedInstances / totalInstances) * 100).toFixed(1)
      : "0";

  return (
    <div className={`relative bg-zinc-900 rounded-2xl border p-4 sm:p-5 hover:shadow-lg hover:shadow-zinc-900/50 transition-shadow ${error ? "border-red-800/60" : "border-zinc-800"} ${isRefreshing ? "animate-pulse" : ""}`}>
      {isRefreshing && (
        <div className="absolute inset-0 bg-zinc-900/40 rounded-2xl z-10 flex items-center justify-center">
          <div className="flex items-center gap-2 bg-zinc-800 px-3 py-1.5 rounded-lg">
            <svg className="animate-spin h-3.5 w-3.5 text-blue-400" viewBox="0 0 24 24" fill="none">
              <circle cx="12" cy="12" r="10" stroke="currentColor" strokeWidth="4" className="opacity-25" />
              <path fill="currentColor" d="M4 12a8 8 0 018-8V0C5.373 0 0 5.373 0 12h4z" className="opacity-75" />
            </svg>
            <span className="text-[10px] text-zinc-300">Atualizando...</span>
          </div>
        </div>
      )}
      <div className="flex items-center justify-between mb-3 sm:mb-4">
        <div className="flex items-center gap-2">
          <div
            className={`w-2.5 h-2.5 rounded-full ${
              error
                ? "bg-red-500 shadow-red-500/50 shadow-sm"
                : connectedInstances > 0
                  ? "bg-emerald-500 shadow-emerald-500/50 shadow-sm"
                  : "bg-zinc-400"
            }`}
          />
          <h3 className="text-sm sm:text-base font-semibold text-zinc-100">
            {serverName}
          </h3>
          {dc && (
            <span className="text-[10px] font-medium text-zinc-500 bg-zinc-800 px-1.5 py-0.5 rounded">
              {dc.toUpperCase()}
            </span>
          )}
        </div>
        {onRemove && (
          <button
            onClick={() => {
              if (confirm(`Remover servidor "${serverName}"?`)) {
                onRemove(serverName);
              }
            }}
            className="text-zinc-500 hover:text-red-400 transition-colors"
            title="Remover servidor"
          >
            <svg
              xmlns="http://www.w3.org/2000/svg"
              width="16"
              height="16"
              viewBox="0 0 24 24"
              fill="none"
              stroke="currentColor"
              strokeWidth="2"
              strokeLinecap="round"
              strokeLinejoin="round"
            >
              <path d="M3 6h18" />
              <path d="M19 6v14c0 1-1 2-2 2H7c-1 0-2-1-2-2V6" />
              <path d="M8 6V4c0-1 1-2 2-2h4c1 0 2 1 2 2v2" />
            </svg>
          </button>
        )}
      </div>

      {error ? (
        /* Estado de erro */
        <div className="bg-red-950/20 border border-red-900/30 rounded-xl p-3 text-center">
          <p className="text-xs text-red-400 font-medium mb-1">
            Servidor inacessível
          </p>
          <p className="text-[10px] text-red-500/70">
            Não foi possível conectar. Verifique o nome e token ou remova este servidor.
          </p>
        </div>
      ) : (
        <>
          {/* Contagem atual */}
          <div className="grid grid-cols-3 gap-2 sm:gap-3 mb-2">
            <div className="text-center">
              <p className="text-[10px] sm:text-xs text-zinc-400">Total</p>
              <p className="text-lg sm:text-xl font-bold text-zinc-100">
                {totalInstances}
              </p>
              {previous && (
                <DiffBadge current={totalInstances} previous={previous.totalInstances} />
              )}
            </div>
            <div className="text-center">
              <p className="text-[10px] sm:text-xs text-emerald-400">Conectadas</p>
              <p className="text-lg sm:text-xl font-bold text-emerald-400">
                {connectedInstances}
              </p>
              {previous && (
                <DiffBadge current={connectedInstances} previous={previous.connectedInstances} />
              )}
            </div>
            <div className="text-center">
              <p className="text-[10px] sm:text-xs text-red-400">Desconectadas</p>
              <p className="text-lg sm:text-xl font-bold text-red-400">
                {disconnectedInstances}
              </p>
              {previous && (
                <DiffBadge current={disconnectedInstances} previous={previous.disconnectedInstances} />
              )}
            </div>
          </div>

          {/* Contagem anterior */}
          {previous && (
            <div className="bg-zinc-800/50 rounded-lg px-3 py-2 mb-3">
              <p className="text-[9px] sm:text-[10px] text-zinc-500 mb-1 uppercase tracking-wide">
                Anterior ({formatDate(previous.timestamp)})
              </p>
              <div className="grid grid-cols-3 gap-2 text-center">
                <span className="text-[11px] sm:text-xs text-zinc-400 font-medium">
                  {previous.totalInstances}
                </span>
                <span className="text-[11px] sm:text-xs text-emerald-500 font-medium">
                  {previous.connectedInstances}
                </span>
                <span className="text-[11px] sm:text-xs text-red-500 font-medium">
                  {previous.disconnectedInstances}
                </span>
              </div>
            </div>
          )}

          {/* Barra de progresso */}
          <div className="w-full bg-zinc-800 rounded-full h-1.5 sm:h-2 mb-2 sm:mb-3">
            <div
              className="bg-emerald-500 h-1.5 sm:h-2 rounded-full transition-all duration-500"
              style={{ width: `${connectedPercent}%` }}
            />
          </div>

          <p className="text-[10px] sm:text-xs text-zinc-500 text-right">
            {formatDate(timestamp)}
          </p>
        </>
      )}
    </div>
  );
}
