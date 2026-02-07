"use client";

interface ServerCardProps {
  serverName: string;
  totalInstances: number;
  connectedInstances: number;
  disconnectedInstances: number;
  timestamp: string;
  onRemove: (name: string) => void;
}

export default function ServerCard({
  serverName,
  totalInstances,
  connectedInstances,
  disconnectedInstances,
  timestamp,
  onRemove,
}: ServerCardProps) {
  const formatDate = (iso: string) => {
    const d = new Date(iso);
    return d.toLocaleString("pt-BR", { timeZone: "America/Sao_Paulo" });
  };

  const connectedPercent =
    totalInstances > 0
      ? ((connectedInstances / totalInstances) * 100).toFixed(1)
      : "0";

  return (
    <div className="bg-white dark:bg-zinc-900 rounded-2xl border border-zinc-200 dark:border-zinc-800 p-5 hover:shadow-lg transition-shadow">
      <div className="flex items-center justify-between mb-4">
        <div className="flex items-center gap-2">
          <div
            className={`w-2.5 h-2.5 rounded-full ${
              connectedInstances > 0
                ? "bg-emerald-500 shadow-emerald-500/50 shadow-sm"
                : "bg-zinc-400"
            }`}
          />
          <h3 className="text-base font-semibold text-zinc-900 dark:text-zinc-100">
            {serverName}
          </h3>
        </div>
        <button
          onClick={() => {
            if (confirm(`Remover servidor "${serverName}"?`)) {
              onRemove(serverName);
            }
          }}
          className="text-zinc-400 hover:text-red-500 dark:text-zinc-500 dark:hover:text-red-400 transition-colors text-sm"
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
      </div>

      <div className="grid grid-cols-3 gap-3 mb-3">
        <div className="text-center">
          <p className="text-xs text-zinc-500 dark:text-zinc-400">Total</p>
          <p className="text-xl font-bold text-zinc-900 dark:text-zinc-100">
            {totalInstances}
          </p>
        </div>
        <div className="text-center">
          <p className="text-xs text-emerald-600 dark:text-emerald-400">
            Conectadas
          </p>
          <p className="text-xl font-bold text-emerald-600 dark:text-emerald-400">
            {connectedInstances}
          </p>
        </div>
        <div className="text-center">
          <p className="text-xs text-red-600 dark:text-red-400">
            Desconectadas
          </p>
          <p className="text-xl font-bold text-red-600 dark:text-red-400">
            {disconnectedInstances}
          </p>
        </div>
      </div>

      {/* Barra de progresso */}
      <div className="w-full bg-zinc-100 dark:bg-zinc-800 rounded-full h-2 mb-3">
        <div
          className="bg-emerald-500 h-2 rounded-full transition-all duration-500"
          style={{ width: `${connectedPercent}%` }}
        />
      </div>

      <p className="text-xs text-zinc-400 dark:text-zinc-500 text-right">
        {formatDate(timestamp)}
      </p>
    </div>
  );
}
