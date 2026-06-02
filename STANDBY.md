# Funcionalidades em standby

Polling automático e monitor de filas foram **desativados** (modo manual). O código foi preservado para reativar no futuro.

## O que está desativado

- Cron `/api/poll` (a cada 2 min)
- Cron `/api/queue-monitor` (a cada 5 min)
- Countdown / auto-refresh no dashboard
- Botão e painel "Monitor de Filas"
- `saveConnectedInstances` no poll (cache para o monitor)
- Action `batch-check-all` em `/api/queue`

## O que continua ativo

- Botão **Atualizar** → `POST /api/poll/server` por servidor
- Busca com **Verificar Fila** e ações manuais → `/api/queue`
- Página pública `/fila`

## Reativar polling automático

1. Copiar o conteúdo de `crons` de [`vercel.crons.standby.json`](vercel.crons.standby.json) para [`vercel.json`](vercel.json)
2. Em [`src/middleware.ts`](src/middleware.ts), descomentar `/api/poll` e `/api/queue-monitor` nos paths públicos
3. Em [`src/app/page.tsx`](src/app/page.tsx), descomentar blocos `STANDBY: auto-refresh countdown` e `STANDBY: monitor de filas`
4. Em [`src/app/api/poll/route.ts`](src/app/api/poll/route.ts), descomentar `saveConnectedInstances`
5. Em [`src/app/api/queue/route.ts`](src/app/api/queue/route.ts), descomentar action `batch-check-all` e `handleBatchCheckAll`
6. Em [`src/app/api/queue-monitor/route.ts`](src/app/api/queue-monitor/route.ts) e [`data/route.ts`](src/app/api/queue-monitor/data/route.ts), alterar `QUEUE_MONITOR_STANDBY = false`
7. Redeploy

## Reativar só o monitor de filas (sem cron de poll)

Passos 1 (só cron queue-monitor), 3 (só QueuePanel), 4, 5, 6 e redeploy.
