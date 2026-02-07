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

  return (
    <div className="bg-white dark:bg-zinc-900 rounded-2xl border border-zinc-200 dark:border-zinc-800 p-6 mb-6">
      <div className="flex flex-col sm:flex-row items-start sm:items-center justify-between gap-4 mb-4">
        <h2 className="text-lg font-semibold text-zinc-900 dark:text-zinc-100">
          Resumo Geral
        </h2>
        <span className="text-sm text-zinc-500 dark:text-zinc-400">
          Última atualização: {formatDate(lastPoll)}
        </span>
      </div>
      <div className="grid grid-cols-1 sm:grid-cols-3 gap-4">
        <div className="bg-zinc-50 dark:bg-zinc-800/50 rounded-xl p-4 text-center">
          <p className="text-sm text-zinc-500 dark:text-zinc-400 mb-1">
            Total de Instâncias
          </p>
          <p className="text-3xl font-bold text-zinc-900 dark:text-zinc-100">
            {totalInstances}
          </p>
        </div>
        <div className="bg-emerald-50 dark:bg-emerald-950/30 rounded-xl p-4 text-center">
          <p className="text-sm text-emerald-600 dark:text-emerald-400 mb-1">
            Conectadas
          </p>
          <p className="text-3xl font-bold text-emerald-600 dark:text-emerald-400">
            {totalConnected}
          </p>
          <p className="text-xs text-emerald-500 dark:text-emerald-500 mt-1">
            {connectedPercent}%
          </p>
        </div>
        <div className="bg-red-50 dark:bg-red-950/30 rounded-xl p-4 text-center">
          <p className="text-sm text-red-600 dark:text-red-400 mb-1">
            Desconectadas
          </p>
          <p className="text-3xl font-bold text-red-600 dark:text-red-400">
            {totalDisconnected}
          </p>
          <p className="text-xs text-red-500 dark:text-red-500 mt-1">
            {totalInstances > 0
              ? ((totalDisconnected / totalInstances) * 100).toFixed(1)
              : "0"}
            %
          </p>
        </div>
      </div>
    </div>
  );
}
