"use client";

import { useState } from "react";
import { Instance } from "@/lib/types";
import { UserRole } from "@/lib/auth";

interface SearchResult {
  found: boolean;
  results?: { server: string; instance: Instance }[];
  // legacy single-result format
  server?: string;
  instance?: Instance;
}

interface ResultEntry {
  server: string;
  instance: Instance;
  queuePending: number | null;
  queueStatus: string;
  queueLoading: boolean;
  delayLoading: boolean;
  delayResult: string;
  resetLoading: boolean;
  resetResult: string;
  clearLoading: boolean;
  clearResult: string;
  syncLoading: boolean;
  syncResult: string;
  limitsLoading: boolean;
  limitsData: unknown;
  limitsError: string;
}

interface SearchBarProps {
  userRole?: UserRole | null;
}

export default function SearchBar({ userRole }: SearchBarProps) {
  const [query, setQuery] = useState("");
  const [loading, setLoading] = useState(false);
  const [results, setResults] = useState<ResultEntry[]>([]);
  const [error, setError] = useState("");
  const [searchExhausted, setSearchExhausted] = useState(false);

  const isAdmin = userRole === "admin";

  const normalizeNumber = (input: string): string => {
    const digitsOnly = input.replace(/\D/g, "");
    return digitsOnly.length > 8 ? digitsOnly.slice(-8) : digitsOnly;
  };

  const newResultEntry = (server: string, instance: Instance): ResultEntry => ({
    server,
    instance,
    queuePending: null,
    queueStatus: "",
    queueLoading: false,
    delayLoading: false,
    delayResult: "",
    resetLoading: false,
    resetResult: "",
    clearLoading: false,
    clearResult: "",
    syncLoading: false,
    syncResult: "",
    limitsLoading: false,
    limitsData: null,
    limitsError: "",
  });

  const handleSearch = async () => {
    const cleaned = normalizeNumber(query);
    if (cleaned.length < 4) {
      setError("Digite pelo menos 4 dígitos");
      return;
    }

    setError("");
    setResults([]);
    setSearchExhausted(false);
    setLoading(true);

    try {
      const url = `/api/search?number=${encodeURIComponent(cleaned)}`;
      const res = await fetch(url);
      const raw = await res.text();
      let data: SearchResult;
      try {
        data = JSON.parse(raw) as SearchResult;
      } catch {
        throw new Error(
          res.status === 504 || raw.startsWith("An error")
            ? "Busca expirou — algum servidor demorou demais. Tente de novo."
            : "Resposta inválida do servidor"
        );
      }
      if (!res.ok) throw new Error((data as unknown as { error: string }).error || "Erro na busca");

      if (data.found && data.results && data.results.length > 0) {
        setResults(data.results.map((r) => newResultEntry(r.server, r.instance)));
      } else {
        setSearchExhausted(true);
      }
    } catch (err) {
      setError(err instanceof Error ? err.message : "Erro ao conectar com o servidor");
    } finally {
      setLoading(false);
    }
  };

  const updateResult = (index: number, updates: Partial<ResultEntry>) => {
    setResults((prev) =>
      prev.map((r, i) => (i === index ? { ...r, ...updates } : r))
    );
  };

  const handleCheckQueue = async (index: number) => {
    const entry = results[index];
    const number = entry.instance.owner || entry.instance.name || "";
    if (!number) {
      setError("Número da instância não disponível");
      return;
    }

    updateResult(index, { queueLoading: true, queuePending: null, queueStatus: "", delayResult: "", resetResult: "", clearResult: "" });
    setError("");

    try {
      const res = await fetch("/api/queue", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          action: "check",
          server: entry.server,
          number,
          instanceToken: entry.instance.token || undefined,
        }),
      });

      const data = await res.json();
      if (res.ok) {
        updateResult(index, {
          queuePending: data.pending ?? 0,
          queueStatus: data.status ?? "",
        });
      } else {
        const detail = data.details ? ` | API: ${JSON.stringify(data.details)}` : "";
        setError(`${data.error || "Erro ao verificar fila"}${detail}`);
      }
    } catch {
      setError("Erro ao conectar para verificar fila");
    } finally {
      updateResult(index, { queueLoading: false });
    }
  };

  const handleReduceDelay = async (index: number) => {
    const entry = results[index];
    const number = entry.instance.owner || entry.instance.name || "";

    updateResult(index, { delayLoading: true, delayResult: "" });

    try {
      const res = await fetch("/api/queue", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          action: "reduce-delay",
          server: entry.server,
          number,
          instanceToken: entry.instance.token || undefined,
        }),
      });

      const data = await res.json();
      if (res.ok) {
        updateResult(index, { delayResult: "Delay reduzido com sucesso!" });
      } else {
        updateResult(index, { delayResult: data.error || "Erro ao reduzir delay" });
      }
    } catch {
      updateResult(index, { delayResult: "Erro ao conectar" });
    } finally {
      updateResult(index, { delayLoading: false });
    }
  };

  const handleResetInstance = async (index: number) => {
    const entry = results[index];
    const number = entry.instance.owner || entry.instance.name || "";

    updateResult(index, { resetLoading: true, resetResult: "" });

    try {
      const res = await fetch("/api/queue", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          action: "reset-instance",
          server: entry.server,
          number,
          instanceToken: entry.instance.token || undefined,
        }),
      });

      const data = await res.json();
      if (res.ok) {
        updateResult(index, { resetResult: "Instância reiniciada com sucesso!" });
      } else {
        updateResult(index, { resetResult: data.error || "Erro ao reiniciar instância" });
      }
    } catch {
      updateResult(index, { resetResult: "Erro ao conectar" });
    } finally {
      updateResult(index, { resetLoading: false });
    }
  };

  const handleClearQueue = async (index: number) => {
    if (!confirm("Tem certeza? Isso vai cancelar TODAS as mensagens pendentes na fila.")) {
      return;
    }
    if (!confirm("ÚLTIMA CONFIRMAÇÃO: Todas as mensagens serão marcadas como canceladas. Deseja prosseguir?")) {
      return;
    }

    const entry = results[index];
    const number = entry.instance.owner || entry.instance.name || "";

    updateResult(index, { clearLoading: true, clearResult: "" });

    try {
      const res = await fetch("/api/queue", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          action: "clear-queue",
          server: entry.server,
          number,
          instanceToken: entry.instance.token || undefined,
        }),
      });

      const data = await res.json();
      if (res.ok) {
        updateResult(index, { clearResult: "Fila apagada com sucesso!" });
      } else {
        updateResult(index, { clearResult: data.error || "Erro ao apagar fila" });
      }
    } catch {
      updateResult(index, { clearResult: "Erro ao conectar" });
    } finally {
      updateResult(index, { clearLoading: false });
    }
  };

  const handleTestSync = async (index: number) => {
    const entry = results[index];
    const number = entry.instance.owner || entry.instance.name || "";

    updateResult(index, { syncLoading: true, syncResult: "" });

    try {
      const res = await fetch("/api/queue", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          action: "test-sync",
          server: entry.server,
          number,
          instanceToken: entry.instance.token || undefined,
        }),
      });

      const data = await res.json();
      if (res.ok) {
        updateResult(index, { syncResult: "Enviado com sucesso!" });
      } else {
        updateResult(index, { syncResult: data.error || "Erro ao enviar" });
      }
    } catch {
      updateResult(index, { syncResult: "Erro ao conectar" });
    } finally {
      updateResult(index, { syncLoading: false });
    }
  };

  const handleCheckLimits = async (index: number) => {
    const entry = results[index];
    const number = entry.instance.owner || entry.instance.name || "";

    if (entry.limitsData !== null || entry.limitsError) {
      updateResult(index, { limitsData: null, limitsError: "" });
      return;
    }

    updateResult(index, { limitsLoading: true, limitsData: null, limitsError: "" });

    try {
      const res = await fetch("/api/queue", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          action: "wa-limits",
          server: entry.server,
          number,
          instanceToken: entry.instance.token || undefined,
        }),
      });

      const data = await res.json();
      if (res.ok) {
        updateResult(index, { limitsData: data.data ?? data });
      } else {
        const detail = data.details ? `\n${JSON.stringify(data.details, null, 2)}` : "";
        updateResult(index, { limitsError: `${data.error || "Erro ao verificar bloqueio"}${detail}` });
      }
    } catch {
      updateResult(index, { limitsError: "Erro ao conectar" });
    } finally {
      updateResult(index, { limitsLoading: false });
    }
  };

  const handleKeyDown = (e: React.KeyboardEvent) => {
    if (e.key === "Enter") {
      handleSearch();
    }
  };

  return (
    <section className="mb-14">
      <div className="mb-6">
        <h2 className="text-[28px] sm:text-[32px] font-semibold tracking-[-0.03em] text-[#f4f4f7] leading-tight">
          Buscar
        </h2>
        <p className="text-[15px] text-[#9d9dad] mt-1.5">
          Número da instância em qualquer servidor
        </p>
      </div>

      <div className="rounded-2xl bg-[#101016] border border-white/[0.06] p-5 sm:p-6">
      <div className="flex gap-2 sm:gap-3">
        <input
          type="text"
          value={query}
          onChange={(e) => setQuery(e.target.value)}
          onKeyDown={handleKeyDown}
          placeholder="Digite o número (ex: 5511999...)"
          className="flex-1 min-w-0 px-4 py-2.5 rounded-full bg-[#16161f] border border-white/[0.06] text-[15px] text-[#f4f4f7] placeholder-[#6a6a7c] focus:outline-none focus:border-[#6ea8ff]/50 transition-colors"
        />
        <button
          onClick={handleSearch}
          disabled={loading}
          className="px-5 sm:px-6 py-2.5 rounded-full bg-[#6ea8ff] text-[#081428] text-[13px] font-medium hover:bg-[#8cbcff] disabled:opacity-50 disabled:cursor-not-allowed transition-colors whitespace-nowrap"
        >
          {loading ? (
            <span className="flex items-center gap-2">
              <svg
                className="animate-spin h-4 w-4"
                viewBox="0 0 24 24"
                fill="none"
              >
                <circle
                  cx="12"
                  cy="12"
                  r="10"
                  stroke="currentColor"
                  strokeWidth="4"
                  className="opacity-25"
                />
                <path
                  fill="currentColor"
                  d="M4 12a8 8 0 018-8V0C5.373 0 0 5.373 0 12h4z"
                  className="opacity-75"
                />
              </svg>
              <span className="hidden sm:inline">Buscando...</span>
            </span>
          ) : (
            "Buscar"
          )}
        </button>
      </div>

      {error && (
        <div className="mt-3 bg-[#ff6b7a]/10 text-[#ff6b7a] text-[13px] px-4 py-2 rounded-xl">
          {error}
        </div>
      )}

      {results.length > 0 && (
        <div className="mt-4 space-y-3">
          {results.map((entry, index) => (
            <div
              key={`${entry.server}-${index}`}
              className="rounded-xl border border-[#34d8a0]/25 bg-[#34d8a0]/6 p-4"
            >
              <div className="flex items-center justify-between mb-3 gap-2 flex-wrap">
                <div className="flex items-center gap-2 min-w-0">
                  <div className="w-2 h-2 rounded-full bg-[#34d8a0] shadow-[0_0_8px_#34d8a0] shrink-0" />
                  <span className="font-semibold text-[#34d8a0] text-[15px] truncate">
                    Encontrado no servidor: {entry.server}
                  </span>
                </div>
                <div className="flex items-center gap-2 flex-wrap">
                  <button
                    onClick={() => handleCheckLimits(index)}
                    disabled={entry.limitsLoading}
                    className="px-3 py-1.5 rounded-full bg-[#c084fc] text-[#1a0828] text-[12px] font-medium hover:bg-[#d4a5ff] disabled:opacity-50 transition-colors whitespace-nowrap"
                  >
                    {entry.limitsLoading
                      ? "Verificando..."
                      : entry.limitsData !== null || entry.limitsError
                        ? "Fechar Bloqueio"
                        : "Verificar Bloqueio"}
                  </button>
                  <button
                    onClick={() => handleCheckQueue(index)}
                    disabled={entry.queueLoading}
                    className="px-3 py-1.5 rounded-full bg-[#6ea8ff] text-[#081428] text-[12px] font-medium hover:bg-[#8cbcff] disabled:opacity-50 transition-colors whitespace-nowrap"
                  >
                    {entry.queueLoading ? "Verificando..." : "Verificar Fila"}
                  </button>
                </div>
              </div>

              {(entry.limitsData !== null || entry.limitsError) && (
                <div className="mb-3 rounded-xl border border-[#c084fc]/30 bg-[#c084fc]/8 overflow-hidden">
                  <div className="px-3 py-1.5 border-b border-[#c084fc]/20 flex items-center justify-between">
                    <span className="text-[12px] font-semibold text-[#c084fc]">
                      Limites / Bloqueio WhatsApp
                    </span>
                  </div>
                  <div className="p-3 max-h-80 overflow-auto">
                    {entry.limitsError ? (
                      <pre className="text-[11px] text-[#ff6b7a] whitespace-pre-wrap break-all font-mono">
                        {entry.limitsError}
                      </pre>
                    ) : (
                      <pre className="text-[11px] text-[#f4f4f7] whitespace-pre-wrap break-all font-mono">
                        {JSON.stringify(entry.limitsData, null, 2)}
                      </pre>
                    )}
                  </div>
                </div>
              )}

              <div className="space-y-1.5 sm:space-y-2 text-xs sm:text-sm overflow-x-auto">
                {Object.entries(entry.instance).map(([key, value]) => (
                  <div key={key} className="flex gap-2">
                    <span className="font-medium text-[#9d9dad] min-w-[100px] sm:min-w-[140px] shrink-0">
                      {key}:
                    </span>
                    <span className="text-[#f4f4f7] break-all">
                      {typeof value === "object"
                        ? JSON.stringify(value)
                        : String(value ?? "")}
                    </span>
                  </div>
                ))}
              </div>

              {entry.queuePending !== null && (
                <div className="mt-3 pt-3 border-t border-[#34d8a0]/15">
                  <div className="flex flex-wrap items-center gap-3 mb-2">
                    <span className="text-[15px] text-[#f4f4f7]">
                      Mensagens na fila:{" "}
                      <strong className={`tabular-nums ${entry.queuePending > 20 ? "text-[#ff6b7a]" : "text-[#f5c15a]"}`}>
                        {entry.queuePending}
                      </strong>
                    </span>
                    {entry.queueStatus && (
                      <span className="text-[11px] bg-[#16161f] text-[#9d9dad] px-1.5 py-0.5 rounded-full">
                        {entry.queueStatus}
                      </span>
                    )}
                  </div>
                  <div className="flex flex-wrap items-center gap-2">
                    <button
                      onClick={() => handleReduceDelay(index)}
                      disabled={entry.delayLoading}
                      className="px-3 py-1.5 rounded-full bg-[#f5c15a] text-[#1a1404] text-[12px] font-medium disabled:opacity-50"
                    >
                      {entry.delayLoading ? "Reduzindo..." : "Reduzir Delay"}
                    </button>
                    <button
                      onClick={() => handleResetInstance(index)}
                      disabled={entry.resetLoading}
                      className="px-3 py-1.5 rounded-full bg-[#ff6b7a] text-[#1a0608] text-[12px] font-medium disabled:opacity-50"
                    >
                      {entry.resetLoading ? "Reiniciando..." : "Reiniciar Instância"}
                    </button>
                    <button
                      onClick={() => handleTestSync(index)}
                      disabled={entry.syncLoading}
                      className="px-3 py-1.5 rounded-full bg-[#6ea8ff] text-[#081428] text-[12px] font-medium disabled:opacity-50"
                    >
                      {entry.syncLoading ? "Enviando..." : "Teste Sync"}
                    </button>
                    {isAdmin && (
                      <button
                        onClick={() => handleClearQueue(index)}
                        disabled={entry.clearLoading}
                        className="px-3 py-1.5 rounded-full border border-[#ff6b7a]/40 text-[#ff6b7a] text-[12px] font-medium disabled:opacity-50"
                      >
                        {entry.clearLoading ? "Apagando..." : "Apagar Fila"}
                      </button>
                    )}
                  </div>
                  <div className="flex flex-wrap gap-2 mt-2">
                    {entry.delayResult && (
                      <span className={`text-[12px] ${entry.delayResult.includes("sucesso") ? "text-[#34d8a0]" : "text-[#ff6b7a]"}`}>
                        {entry.delayResult}
                      </span>
                    )}
                    {entry.resetResult && (
                      <span className={`text-[12px] ${entry.resetResult.includes("sucesso") ? "text-[#34d8a0]" : "text-[#ff6b7a]"}`}>
                        {entry.resetResult}
                      </span>
                    )}
                    {entry.clearResult && (
                      <span className={`text-[12px] ${entry.clearResult.includes("sucesso") ? "text-[#34d8a0]" : "text-[#ff6b7a]"}`}>
                        {entry.clearResult}
                      </span>
                    )}
                    {entry.syncResult && (
                      <span className={`text-[12px] ${entry.syncResult.includes("sucesso") ? "text-[#34d8a0]" : "text-[#ff6b7a]"}`}>
                        {entry.syncResult}
                      </span>
                    )}
                  </div>
                </div>
              )}
            </div>
          ))}

          {results.length > 1 && (
            <div className="bg-[#16161f] text-[#9d9dad] text-[13px] px-4 py-2 rounded-xl text-center">
              Encontrado em {results.length} servidores
            </div>
          )}
        </div>
      )}

      {results.length === 0 && searchExhausted && (
        <div className="mt-4">
          <div className="bg-[#16161f] text-[#9d9dad] text-[15px] px-4 py-3 rounded-xl text-center">
            Número não encontrado em nenhum servidor
          </div>
        </div>
      )}
      </div>
    </section>
  );
}
