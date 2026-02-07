"use client";

import { useState } from "react";

interface AddServerModalProps {
  isOpen: boolean;
  onClose: () => void;
  onAdd: (name: string, token: string) => Promise<void>;
}

export default function AddServerModal({
  isOpen,
  onClose,
  onAdd,
}: AddServerModalProps) {
  const [name, setName] = useState("");
  const [token, setToken] = useState("");
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState("");

  if (!isOpen) return null;

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    setError("");

    if (!name.trim() || !token.trim()) {
      setError("Preencha todos os campos");
      return;
    }

    if (!/^[a-zA-Z0-9_-]+$/.test(name.trim())) {
      setError("Nome deve conter apenas letras, números, hífens e underscores");
      return;
    }

    setLoading(true);
    try {
      await onAdd(name.trim(), token.trim());
      setName("");
      setToken("");
      onClose();
    } catch (err) {
      setError(err instanceof Error ? err.message : "Erro ao adicionar");
    } finally {
      setLoading(false);
    }
  };

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center p-4">
      {/* Backdrop */}
      <div
        className="absolute inset-0 bg-black/60 backdrop-blur-sm"
        onClick={onClose}
      />

      {/* Modal */}
      <div className="relative bg-zinc-900 rounded-2xl border border-zinc-800 p-5 sm:p-6 w-full max-w-md shadow-2xl">
        <h2 className="text-lg font-semibold text-zinc-100 mb-4">
          Adicionar Servidor
        </h2>

        <form onSubmit={handleSubmit} className="space-y-4">
          <div>
            <label className="block text-sm font-medium text-zinc-300 mb-1">
              Nome do Servidor
            </label>
            <input
              type="text"
              value={name}
              onChange={(e) => setName(e.target.value)}
              placeholder="meuservidor"
              className="w-full px-4 py-2.5 rounded-xl bg-zinc-800 border border-zinc-700 text-zinc-100 placeholder-zinc-500 focus:outline-none focus:ring-2 focus:ring-blue-500 focus:border-transparent transition-all"
            />
            <p className="text-xs text-zinc-500 mt-1">
              Será usado como: https://<strong className="text-zinc-300">{name || "nome"}</strong>
              .uazapi.com
            </p>
          </div>

          <div>
            <label className="block text-sm font-medium text-zinc-300 mb-1">
              Admin Token
            </label>
            <input
              type="password"
              value={token}
              onChange={(e) => setToken(e.target.value)}
              placeholder="Token do servidor"
              className="w-full px-4 py-2.5 rounded-xl bg-zinc-800 border border-zinc-700 text-zinc-100 placeholder-zinc-500 focus:outline-none focus:ring-2 focus:ring-blue-500 focus:border-transparent transition-all"
            />
          </div>

          {error && (
            <div className="bg-red-950/30 text-red-400 text-sm px-4 py-2 rounded-xl">
              {error}
            </div>
          )}

          <div className="flex gap-3 pt-2">
            <button
              type="button"
              onClick={onClose}
              className="flex-1 px-4 py-2.5 rounded-xl border border-zinc-700 text-zinc-300 hover:bg-zinc-800 transition-colors"
            >
              Cancelar
            </button>
            <button
              type="submit"
              disabled={loading}
              className="flex-1 px-4 py-2.5 rounded-xl bg-blue-600 text-white font-medium hover:bg-blue-700 disabled:opacity-50 disabled:cursor-not-allowed transition-colors"
            >
              {loading ? "Adicionando..." : "Adicionar"}
            </button>
          </div>
        </form>
      </div>
    </div>
  );
}
