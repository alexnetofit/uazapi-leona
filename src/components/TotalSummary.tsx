"use client";

interface TotalSummaryProps {
  totalInstances: number;
  totalConnected: number;
  totalDisconnected: number;
  lastPoll: string | null;
}

export default function TotalSummary({
  totalInstances,
  totalConnected,
  totalDisconnected,
  lastPoll,
}: TotalSummaryProps) {
  const formatDate = (iso: string | null) => {
    if (!iso) return "Nunca";
    const d = new Date(iso);
    return d.toLocaleString("pt-BR", { timeZone: "America/Sao_Paulo" });
  };

  const connectedPercent =
    totalInstances > 0
      ? ((totalConnected / totalInstances) * 100).toFixed(1)
      : "0";

  const disconnectedPercent =
    totalInstances > 0
      ? ((totalDisconnected / totalInstances) * 100).toFixed(1)
      : "0";

  return (
    <div className="bg-zinc-900 rounded-2xl border border-zinc-800 p-4 sm:p-6 mb-6">
      <div className="flex items-center justify-between gap-2 mb-3 sm:mb-4">
        <h2 className="text-base sm:text-lg font-semibold text-zinc-100">
          Resumo Geral
        </h2>
        <span className="text-[10px] sm:text-sm text-zinc-400 text-right">
          {formatDate(lastPoll)}
        </span>
      </div>
      <div className="grid grid-cols-3 gap-2 sm:gap-4">
        <div className="bg-zinc-800/50 rounded-xl p-2 sm:p-4 text-center">
          <p className="text-[10px] sm:text-sm text-zinc-400 mb-0.5 sm:mb-1">
            Total
          </p>
          <p className="text-lg sm:text-3xl font-bold text-zinc-100">
            {totalInstances}
          </p>
        </div>
        <div className="bg-emerald-950/30 rounded-xl p-2 sm:p-4 text-center">
          <p className="text-[10px] sm:text-sm text-emerald-400 mb-0.5 sm:mb-1">
            Conectadas
          </p>
          <p className="text-lg sm:text-3xl font-bold text-emerald-400">
            {totalConnected}
          </p>
          <p className="text-[9px] sm:text-xs text-emerald-500 mt-0.5">
            {connectedPercent}%
          </p>
        </div>
        <div className="bg-red-950/30 rounded-xl p-2 sm:p-4 text-center">
          <p className="text-[10px] sm:text-sm text-red-400 mb-0.5 sm:mb-1">
            Desconectadas
          </p>
          <p className="text-lg sm:text-3xl font-bold text-red-400">
            {totalDisconnected}
          </p>
          <p className="text-[9px] sm:text-xs text-red-500 mt-0.5">
            {disconnectedPercent}%
          </p>
        </div>
      </div>
    </div>
  );
}
