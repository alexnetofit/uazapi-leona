"use client";

import { useState, useEffect } from "react";

export default function WebhookConfig() {
  const [url, setUrl] = useState("");
  const [savedUrl, setSavedUrl] = useState("");
  const [loading, setLoading] = useState(false);
  const [message, setMessage] = useState("");
  const [isOpen, setIsOpen] = useState(false);

  useEffect(() => {
    fetchWebhookUrl();
  }, []);

  const fetchWebhookUrl = async () => {
    try {
      const res = await fetch("/api/webhook");
      const data = await res.json();
      setUrl(data.url || "");
      setSavedUrl(data.url || "");
    } catch {
      console.error("Erro ao buscar webhook URL");
    }
  };

  const handleSave = async () => {
    setLoading(true);
    setMessage("");

    try {
      const res = await fetch("/api/webhook", {
        method: "PUT",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ url }),
      });

      const data = await res.json();

      if (!res.ok) {
        setMessage(data.error || "Erro ao salvar");
        return;
      }

      setSavedUrl(url);
      setMessage("Webhook salvo com sucesso!");
      setTimeout(() => setMessage(""), 3000);
    } catch {
      setMessage("Erro ao conectar com o servidor");
    } finally {
      setLoading(false);
    }
  };

  return (
    <div className="relative">
      <button
        onClick={() => setIsOpen(!isOpen)}
        className="flex items-center gap-1.5 sm:gap-2 px-3 sm:px-4 py-2 rounded-xl border border-zinc-700 text-zinc-300 hover:bg-zinc-800 transition-colors text-xs sm:text-sm"
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
          <path d="M15 17h5l-1.405-1.405A2.032 2.032 0 0118 14.158V11a6.002 6.002 0 00-4-5.659V5a2 2 0 10-4 0v.341C7.67 6.165 6 8.388 6 11v3.159c0 .538-.214 1.055-.595 1.436L4 17h5m6 0v1a3 3 0 11-6 0v-1m6 0H9" />
        </svg>
        <span className="hidden sm:inline">Webhook</span>
        {savedUrl && (
          <span className="w-2 h-2 rounded-full bg-emerald-500" />
        )}
      </button>

      {isOpen && (
        <>
          {/* Backdrop mobile */}
          <div
            className="fixed inset-0 z-30 sm:hidden"
            onClick={() => setIsOpen(false)}
          />
          <div className="fixed inset-x-4 top-20 z-40 sm:absolute sm:inset-auto sm:right-0 sm:top-full sm:mt-2 sm:w-96 bg-zinc-900 rounded-2xl border border-zinc-800 p-4 shadow-2xl">
            <h3 className="text-sm font-semibold text-zinc-100 mb-3">
              URL do Webhook de Alerta
            </h3>
            <p className="text-xs text-zinc-400 mb-3">
              Receba um POST quando mais de 20 instâncias desconectarem em 2min em
              um servidor.
            </p>
            <input
              type="url"
              value={url}
              onChange={(e) => setUrl(e.target.value)}
              placeholder="https://exemplo.com/webhook"
              className="w-full px-3 py-2 rounded-lg bg-zinc-800 border border-zinc-700 text-zinc-100 placeholder-zinc-500 text-sm focus:outline-none focus:ring-2 focus:ring-blue-500 focus:border-transparent"
            />
            {message && (
              <p
                className={`text-xs mt-2 ${
                  message.includes("sucesso")
                    ? "text-emerald-400"
                    : "text-red-400"
                }`}
              >
                {message}
              </p>
            )}
            <div className="flex gap-2 mt-3">
              <button
                onClick={() => setIsOpen(false)}
                className="flex-1 px-3 py-2 rounded-lg border border-zinc-700 text-zinc-400 hover:bg-zinc-800 text-sm transition-colors"
              >
                Fechar
              </button>
              <button
                onClick={handleSave}
                disabled={loading}
                className="flex-1 px-3 py-2 rounded-lg bg-blue-600 text-white text-sm font-medium hover:bg-blue-700 disabled:opacity-50 transition-colors"
              >
                {loading ? "Salvando..." : "Salvar"}
              </button>
            </div>
          </div>
        </>
      )}
    </div>
  );
}
