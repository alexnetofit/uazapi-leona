"use client";

import { useState } from "react";

interface QueueResult {
  found: boolean;
  server?: string;
  error?: string;
  queue?: {
    pending: number;
    status: string;
    processingNow: boolean;
    sessionReady: boolean;
    resetting: boolean;
  };
}

const STATUS_LABELS: Record<string, string> = {
  idle: "Ociosa",
  queued: "Na fila",
  processing: "Processando",
  waiting_connection: "Aguardando conexão",
  resetting: "Reiniciando",
  unknown: "Desconhecido",
};

export default function FilaPage() {
  const [query, setQuery] = useState("");
  const [loading, setLoading] = useState(false);
  const [result, setResult] = useState<QueueResult | null>(null);
  const [error, setError] = useState("");
  const [searched, setSearched] = useState(false);

  const handleSearch = async () => {
    const cleaned = query.replace(/\D/g, "");
    if (cleaned.length < 8) {
      setError("Informe pelo menos 8 dígitos");
      return;
    }

    setLoading(true);
    setError("");
    setResult(null);
    setSearched(true);

    try {
      const res = await fetch(`/api/fila?number=${encodeURIComponent(cleaned)}`);
      const data: QueueResult = await res.json();

      if (!res.ok) {
        setError((data as unknown as { error: string }).error || "Erro na busca");
        return;
      }

      setResult(data);
    } catch {
      setError("Erro ao conectar com o servidor");
    } finally {
      setLoading(false);
    }
  };

  const handleKeyDown = (e: React.KeyboardEvent) => {
    if (e.key === "Enter") handleSearch();
  };

  return (
    <div className="min-h-screen bg-zinc-950 flex items-center justify-center p-4">
      <div className="w-full max-w-md">
        <div className="text-center mb-8">
          <div className="w-14 h-14 bg-zinc-800 rounded-2xl flex items-center justify-center mx-auto mb-4">
            <svg xmlns="http://www.w3.org/2000/svg" width="28" height="28" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" className="text-amber-400">
              <path d="M22 12h-4l-3 9L9 3l-3 9H2" />
            </svg>
          </div>
          <h1 className="text-xl font-bold text-zinc-100">Consulta de Fila</h1>
          <p className="text-sm text-zinc-500 mt-1">
            Informe o número para verificar a fila de mensagens
          </p>
        </div>

        <div className="bg-zinc-900 rounded-2xl border border-zinc-800 p-5">
          <div className="flex gap-2">
            <input
              type="text"
              value={query}
              onChange={(e) => setQuery(e.target.value)}
              onKeyDown={handleKeyDown}
              placeholder="Ex: 5511999999999"
              className="flex-1 bg-zinc-800 border border-zinc-700 rounded-xl px-4 py-3 text-sm text-zinc-100 placeholder-zinc-500 focus:outline-none focus:ring-2 focus:ring-amber-500/50 focus:border-amber-500/50"
            />
            <button
              onClick={handleSearch}
              disabled={loading}
              className="px-5 py-3 bg-amber-600 text-white rounded-xl text-sm font-medium hover:bg-amber-700 disabled:opacity-50 transition-colors shrink-0"
            >
              {loading ? (
                <svg className="animate-spin h-5 w-5" viewBox="0 0 24 24" fill="none">
                  <circle cx="12" cy="12" r="10" stroke="currentColor" strokeWidth="4" className="opacity-25" />
                  <path fill="currentColor" d="M4 12a8 8 0 018-8V0C5.373 0 0 5.373 0 12h4z" className="opacity-75" />
                </svg>
              ) : (
                "Buscar"
              )}
            </button>
          </div>

          {error && (
            <div className="mt-4 bg-red-950/30 border border-red-900/40 rounded-xl px-4 py-3">
              <p className="text-sm text-red-400">{error}</p>
            </div>
          )}

          {searched && !loading && result && !result.found && (
            <div className="mt-4 bg-zinc-800/50 rounded-xl px-4 py-6 text-center">
              <p className="text-sm text-zinc-400">Número não encontrado</p>
            </div>
          )}

          {result?.found && result.error && (
            <div className="mt-4 bg-amber-950/30 border border-amber-900/40 rounded-xl px-4 py-3">
              <p className="text-sm text-amber-400">
                Encontrado em {result.server}, mas: {result.error}
              </p>
            </div>
          )}

          {result?.found && result.queue && (
            <div className="mt-4 space-y-3">
              <div className={`rounded-xl p-5 text-center border ${
                result.queue.pending === 0
                  ? "bg-emerald-950/20 border-emerald-800/40"
                  : result.queue.pending <= 10
                    ? "bg-blue-950/20 border-blue-800/40"
                    : result.queue.pending <= 20
                      ? "bg-amber-950/20 border-amber-800/40"
                      : "bg-red-950/20 border-red-800/40"
              }`}>
                <p className="text-xs text-zinc-500 mb-1 uppercase tracking-wide">
                  Mensagens na fila
                </p>
                <p className={`text-5xl font-bold ${
                  result.queue.pending === 0
                    ? "text-emerald-400"
                    : result.queue.pending <= 10
                      ? "text-blue-400"
                      : result.queue.pending <= 20
                        ? "text-amber-400"
                        : "text-red-400"
                }`}>
                  {result.queue.pending}
                </p>
              </div>

              <div className="grid grid-cols-2 gap-2">
                <div className="bg-zinc-800/50 rounded-lg px-3 py-2.5">
                  <p className="text-[10px] text-zinc-500 uppercase tracking-wide">Status</p>
                  <p className="text-sm text-zinc-200 font-medium mt-0.5">
                    {STATUS_LABELS[result.queue.status] || result.queue.status}
                  </p>
                </div>
                <div className="bg-zinc-800/50 rounded-lg px-3 py-2.5">
                  <p className="text-[10px] text-zinc-500 uppercase tracking-wide">Servidor</p>
                  <p className="text-sm text-zinc-200 font-medium mt-0.5">{result.server}</p>
                </div>
              </div>

              <div className="flex flex-wrap gap-1.5">
                {result.queue.processingNow && (
                  <span className="text-[10px] bg-blue-950/50 text-blue-400 px-2 py-1 rounded-lg">
                    Processando agora
                  </span>
                )}
                {result.queue.resetting && (
                  <span className="text-[10px] bg-red-950/50 text-red-400 px-2 py-1 rounded-lg">
                    Reiniciando
                  </span>
                )}
                {!result.queue.sessionReady && (
                  <span className="text-[10px] bg-orange-950/50 text-orange-400 px-2 py-1 rounded-lg">
                    Sessão não pronta
                  </span>
                )}
                {result.queue.pending === 0 && result.queue.sessionReady && (
                  <span className="text-[10px] bg-emerald-950/50 text-emerald-400 px-2 py-1 rounded-lg">
                    Tudo limpo
                  </span>
                )}
              </div>
            </div>
          )}
        </div>

        <p className="text-center text-[10px] text-zinc-700 mt-4">
          UAZAPI Monitor
        </p>
      </div>
    </div>
  );
}
