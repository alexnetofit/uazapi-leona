"use client";

import { useState } from "react";
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
  isAdmin?: boolean;
  onRemove?: (name: string) => void;
}

function DiffBadge({ current, previous }: { current: number; previous: number }) {
  const diff = current - previous;
  if (diff === 0) return null;

  const isPositive = diff > 0;
  return (
    <span
      className={`text-[11px] font-medium ${
        isPositive ? "text-[#34d8a0]" : "text-[#ff6b7a]"
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
  isAdmin,
  onRemove,
}: ServerCardProps) {
  const [restarting, setRestarting] = useState(false);
  const [restartResult, setRestartResult] = useState("");
  const [showRestartConfirm, setShowRestartConfirm] = useState(false);
  const [showRemoveConfirm, setShowRemoveConfirm] = useState(false);

  const handleRestartServer = async () => {
    setShowRestartConfirm(false);
    setRestarting(true);
    setRestartResult("");
    try {
      const res = await fetch("/api/queue", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ action: "restart-server", server: serverName }),
      });
      const data = await res.json();
      setRestartResult(res.ok ? "Reinício agendado!" : (data.error || "Erro"));
    } catch {
      setRestartResult("Erro ao conectar");
    } finally {
      setRestarting(false);
      setTimeout(() => setRestartResult(""), 5000);
    }
  };

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
    <div className={`relative rounded-2xl bg-[#101016] border p-5 sm:p-6 ${error ? "border-[#ff6b7a]/35" : "border-white/[0.06]"} ${isRefreshing ? "animate-pulse" : ""}`}>
      {isRefreshing && (
        <div className="absolute inset-0 bg-[#101016]/70 rounded-2xl z-10 flex items-center justify-center">
          <div className="flex items-center gap-2 bg-[#16161f] px-3 py-1.5 rounded-full">
            <svg className="animate-spin h-3.5 w-3.5 text-[#6ea8ff]" viewBox="0 0 24 24" fill="none">
              <circle cx="12" cy="12" r="10" stroke="currentColor" strokeWidth="4" className="opacity-25" />
              <path fill="currentColor" d="M4 12a8 8 0 018-8V0C5.373 0 0 5.373 0 12h4z" className="opacity-75" />
            </svg>
            <span className="text-[12px] text-[#f4f4f7]">Atualizando...</span>
          </div>
        </div>
      )}
      <div className="flex items-center justify-between mb-5">
        <div className="flex items-center gap-2 min-w-0">
          <div
            className={`w-2 h-2 rounded-full shrink-0 ${
              error
                ? "bg-[#ff6b7a] shadow-[0_0_8px_#ff6b7a]"
                : connectedInstances > 0
                  ? "bg-[#34d8a0] shadow-[0_0_8px_#34d8a0]"
                  : "bg-[#6a6a7c]"
            }`}
          />
          <h3 className="text-[15px] font-semibold tracking-[-0.02em] text-[#f4f4f7] truncate">
            {serverName}
          </h3>
          {dc && (
            <span className="text-[11px] font-medium text-[#9d9dad] bg-[#16161f] px-1.5 py-0.5 rounded-full">
              {dc.toUpperCase()}
            </span>
          )}
        </div>
        <div className="flex items-center gap-1.5">
          {isAdmin && (
            <button
              onClick={() => setShowRestartConfirm(true)}
              disabled={restarting || showRestartConfirm}
              className="text-[#6a6a7c] hover:text-[#f5c15a] transition-colors disabled:opacity-50"
              title="Reiniciar servidor"
            >
              {restarting ? (
                <svg className="animate-spin h-4 w-4" viewBox="0 0 24 24" fill="none">
                  <circle cx="12" cy="12" r="10" stroke="currentColor" strokeWidth="4" className="opacity-25" />
                  <path fill="currentColor" d="M4 12a8 8 0 018-8V0C5.373 0 0 5.373 0 12h4z" className="opacity-75" />
                </svg>
              ) : (
                <svg xmlns="http://www.w3.org/2000/svg" width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
                  <path d="M21 2v6h-6" />
                  <path d="M3 12a9 9 0 0 1 15-6.7L21 8" />
                  <path d="M3 22v-6h6" />
                  <path d="M21 12a9 9 0 0 1-15 6.7L3 16" />
                </svg>
              )}
            </button>
          )}
          {onRemove && (
            <button
              onClick={() => setShowRemoveConfirm(true)}
              disabled={showRemoveConfirm}
              className="text-[#6a6a7c] hover:text-[#ff6b7a] transition-colors disabled:opacity-50"
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
      </div>

      {showRestartConfirm && (
        <div className="mb-4 rounded-xl border border-[#f5c15a]/30 bg-[#f5c15a]/8 p-3">
          <p className="text-[13px] text-[#f5c15a] font-medium mb-1">
            Reiniciar {serverName}?
          </p>
          <p className="text-[12px] text-[#9d9dad] mb-3">
            Isso reinicia toda a aplicação e força a reconexão de todas as instâncias.
          </p>
          <div className="flex items-center gap-2">
            <button
              onClick={handleRestartServer}
              className="px-3 py-1.5 rounded-full bg-[#f5c15a] text-[#1a1404] text-[12px] font-medium"
            >
              Confirmar
            </button>
            <button
              onClick={() => setShowRestartConfirm(false)}
              className="px-3 py-1.5 rounded-full bg-[#16161f] text-[#9d9dad] text-[12px] font-medium hover:text-[#f4f4f7]"
            >
              Cancelar
            </button>
          </div>
        </div>
      )}

      {showRemoveConfirm && (
        <div className="mb-4 rounded-xl border border-[#ff6b7a]/30 bg-[#ff6b7a]/8 p-3">
          <p className="text-[13px] text-[#ff6b7a] font-medium mb-1">
            Remover {serverName}?
          </p>
          <p className="text-[12px] text-[#9d9dad] mb-3">
            O servidor será removido do painel. Essa ação não afeta o servidor em si.
          </p>
          <div className="flex items-center gap-2">
            <button
              onClick={() => { setShowRemoveConfirm(false); onRemove?.(serverName); }}
              className="px-3 py-1.5 rounded-full bg-[#ff6b7a] text-[#1a0608] text-[12px] font-medium"
            >
              Remover
            </button>
            <button
              onClick={() => setShowRemoveConfirm(false)}
              className="px-3 py-1.5 rounded-full bg-[#16161f] text-[#9d9dad] text-[12px] font-medium hover:text-[#f4f4f7]"
            >
              Cancelar
            </button>
          </div>
        </div>
      )}

      {error ? (
        /* Estado de erro */
        <div className="rounded-xl border border-[#ff6b7a]/25 bg-[#ff6b7a]/8 px-4 py-4 text-center">
          <p className="text-[13px] text-[#ff6b7a] font-medium mb-1">
            Servidor inacessível
          </p>
          <p className="text-[12px] text-[#9d9dad]">
            Não foi possível conectar. Verifique o nome e token ou remova este servidor.
          </p>
        </div>
      ) : (
        <>
          {/* Contagem atual */}
          <div className="grid grid-cols-3 gap-2 mb-4">
            <div>
              <p className="text-[12px] text-[#9d9dad]">Total</p>
              <p className="mt-1 text-[22px] font-semibold tracking-[-0.03em] text-[#f4f4f7] leading-none tabular-nums">
                {totalInstances}
              </p>
              {previous && (
                <DiffBadge current={totalInstances} previous={previous.totalInstances} />
              )}
            </div>
            <div>
              <p className="text-[12px] text-[#34d8a0]">Conectadas</p>
              <p className="mt-1 text-[22px] font-semibold tracking-[-0.03em] text-[#34d8a0] leading-none tabular-nums">
                {connectedInstances}
              </p>
              {previous && (
                <DiffBadge current={connectedInstances} previous={previous.connectedInstances} />
              )}
            </div>
            <div>
              <p className="text-[12px] text-[#ff6b7a]">Desconectadas</p>
              <p className="mt-1 text-[22px] font-semibold tracking-[-0.03em] text-[#ff6b7a] leading-none tabular-nums">
                {disconnectedInstances}
              </p>
              {previous && (
                <DiffBadge current={disconnectedInstances} previous={previous.disconnectedInstances} />
              )}
            </div>
          </div>

          {previous && (
            <div className="rounded-xl bg-[#16161f] px-3 py-2.5 mb-4">
              <p className="text-[11px] text-[#6a6a7c] mb-1.5">
                Anterior · {formatDate(previous.timestamp)}
              </p>
              <div className="grid grid-cols-3 gap-2">
                <span className="text-[13px] text-[#9d9dad] tabular-nums">
                  {previous.totalInstances}
                </span>
                <span className="text-[13px] text-[#34d8a0] tabular-nums">
                  {previous.connectedInstances}
                </span>
                <span className="text-[13px] text-[#ff6b7a] tabular-nums">
                  {previous.disconnectedInstances}
                </span>
              </div>
            </div>
          )}

          <div className="w-full bg-[#16161f] rounded-full h-1.5 mb-3">
            <div
              className="bg-[#34d8a0] h-1.5 rounded-full transition-all duration-500"
              style={{ width: `${connectedPercent}%` }}
            />
          </div>

          <div className="flex items-center justify-between">
            {restartResult && (
              <span className={`text-[12px] font-medium ${restartResult.includes("agendado") ? "text-[#34d8a0]" : "text-[#ff6b7a]"}`}>
                {restartResult}
              </span>
            )}
            <p className="text-[12px] text-[#6a6a7c] text-right ml-auto">
              {formatDate(timestamp)}
            </p>
          </div>
        </>
      )}
    </div>
  );
}
