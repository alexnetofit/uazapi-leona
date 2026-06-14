# Runbook — Diagnóstico e correção de filas/conexão nos servidores uazapi

> Documento operacional para qualquer IA (ou pessoa técnica) assumir o monitoramento e a
> correção de filas e conexões das instâncias WhatsApp rodando em servidores uazapi.
> Tudo aqui é baseado em incidentes reais já resolvidos. Siga na ordem.

---

## 0. Princípios (leia antes de agir)

1. **Leitura primeiro, ação depois.** Consultar fila/status é seguro (só GET). Ações que
   alteram números/sessões (`/connect`, `/instance/reset`, `/instance/updateDelaySettings`,
   `/admin/restart`) precisam de confirmação do responsável.
2. **Nunca deixe uma falha parar o resto.** Use `Promise.allSettled`, timeouts e retry.
   Um servidor fora do ar não pode abortar a varredura dos outros.
3. **Retry padrão:** 2 retentativas com espera de 2s entre elas. Timeouts: 8s para fila/status,
   15s para `/instance/all`.
4. **Concorrência:** ~60 requisições simultâneas no total; servidores em paralelo entre si.
5. **`delay 0-0s` = sem intervalo entre envios → aumenta risco de bloqueio no WhatsApp.**
   Só aplicar quando explicitamente pedido.

---

## 1. Acesso e arquitetura

- A frota é um conjunto de servidores `https://<nome>.uazapi.com` (ex.: `leona01` … `leona30`).
  **O número de servidores muda com o tempo** — nunca fixe "27"/"30"; sempre leia a lista.
- A lista de servidores (nome + **AdminToken**) fica no **Upstash Redis**, na chave
  `uazapi:servers`, como JSON: `[{ "name": "leona01", "token": "<ADMIN_TOKEN>" }, ...]`.
- Credenciais do Redis (fornecidas pelo responsável; **não versionar**):
  ```
  UPSTASH_REDIS_REST_URL   = https://<...>.upstash.io
  UPSTASH_REDIS_REST_TOKEN = <token>
  ```
  Ler chave: `GET {URL}/get/uazapi:servers` com header `Authorization: Bearer {TOKEN}`.
  A resposta vem em `{ "result": "<json-string>" }` — fazer `JSON.parse(result)`.

### Hierarquia de tokens
- **AdminToken** (por servidor): lista instâncias e reinicia o servidor.
- **token** (por instância): consulta fila/status e age sobre aquela instância.

---

## 2. Endpoints uazapi usados

| Ação | Método | URL | Header | Observação |
|------|--------|-----|--------|------------|
| Listar instâncias | GET | `/instance/all` | `AdminToken: <admin>` | Retorna array de instâncias |
| Status do servidor | GET | `/status` | — | Saúde geral do servidor |
| **Fila da instância** | GET | `/message/async` | `token: <inst>` | Campo `pending` + `status` |
| **Status da instância** | GET | `/instance/status` | `token: <inst>` | `{ instance, status }` |
| Conectar | POST | `/instance/connect` | `token: <inst>` | Reconecta; pode retornar QR/pair |
| Resetar instância | POST | `/instance/reset` | `token: <inst>` | Limpa sessão travada (~3 min) |
| Ajustar delay | POST | `/instance/updateDelaySettings` | `token: <inst>` | Body `{msg_delay_min,msg_delay_max}` |
| Reiniciar servidor | POST | `/admin/restart` | `AdminToken: <admin>` | Afeta TODAS as instâncias do servidor |

### Objeto da instância (`/instance/all`)
Campos úteis: `name`, `owner` (número), `status` (`connected`/`connecting`/`disconnected`),
`token`, `qrcode`, `paircode`.

### Status da instância (`/instance/status`)
```json
{ "instance": { "status": "...", "profileName": "...", "msg_delay_min": 1, "msg_delay_max": 3,
                "lastDisconnectReason": "..." },
  "status":   { "connected": true, "loggedIn": true, "jid": "...", "resetting": false } }
```

### `status` da fila (`/message/async` → campo `status`)
- `processing` — drenando (saudável).
- `idle` — fila vazia.
- `queued` — itens enfileirados, prestes a processar.
- `waiting_connection` — **TRAVADA**: a sessão não está conectada; a fila não anda.
- `waiting_warmup` — aquecimento; normal em chip novo.
- `resetting` — em reset.

---

## 3. A varredura (operação base)

**Definição:** varrer TODOS os servidores e trazer os números com `pending > 5` e o status.

⚠️ **Armadilha crítica (descoberta em incidente):** filtrar só `status === "connected"`
**esconde** instâncias travadas. Uma instância em `connecting`/`disconnected` com fila grande
parada (`waiting_connection`) **não aparece** se você filtrar só conectadas.
→ Para caçar filas travadas, **inclua `connecting` (e, se preciso, `disconnected`)**.

### Pseudo-algoritmo
1. Ler `uazapi:servers` do Redis.
2. Para cada servidor (em paralelo, com retry): `GET /instance/all`.
3. Selecionar instâncias com `token` e status desejado (`connected` sempre;
   `connecting`/`disconnected` quando estiver caçando travadas).
4. Para cada instância (concorrência ~60, com retry): `GET /message/async`.
5. Guardar as com `pending > N` (padrão N=5).
6. Para cada hit, `GET /instance/status` e anexar `connected/loggedIn/resetting`.
7. Ordenar por `pending` desc. Marcar separadamente as que **não** estão `connected`
   (essas são as problemáticas).

### Casamento número → instância (cuidado)
- O `owner` às vezes é salvo **sem o 9 extra** do celular (ex.: usuário digita
  `5531998215920`, mas owner = `553198215920`). Compare por **dígitos**, conferindo os
  **últimos 8**.
- **NUNCA** case por "owner contém X" sem checar tamanho: `owner` vazio (`""`) casa com
  qualquer número. Exija `owner` com **≥ 8 dígitos** e prefira **igualdade exata**.

---

## 4. Árvore de decisão — fila travada / instância caída

Para cada instância problemática, leia `/instance/status` e decida:

```
fila > 0 e status da fila = waiting_connection?
│
├─ connected:true  → está conectando/instável. Geralmente drena sozinha; reavalie em alguns min.
│
├─ connecting OU disconnected, e loggedIn:true
│     → /connect (a sessão ainda existe; costuma religar).
│       Pode precisar repetir o /connect (2ª ou 3ª vez pega).
│
├─ "limbo": /connect retorna HTTP 200 mas NÃO gera QR, e status volta a disconnected,
│   com loggedIn:false e jid:null
│     → /instance/reset → ESPERAR ~3 min (resetting:true) → /connect
│       (o reset limpa o estado travado; depois ele costuma religar SEM precisar de QR)
│
└─ MUITAS instâncias do MESMO servidor em connecting/flapping ao mesmo tempo
      → problema é do SERVIDOR, não das instâncias.
        /admin/restart no servidor. Se reincidir após restart → infra/proxy do servidor.
```

### Notas que vieram de incidentes reais
- **`/connect` é paliativo em servidor instável:** destrava na hora, mas a instância cai de
  novo em minutos (`health_reconnect_timeout`). Se repetir muito, o problema é o servidor.
- **`reset` realmente demora ~3 min** (`resetting:true` o tempo todo). **Espere** antes do
  `/connect`. Não adianta dar `/connect` durante o reset.
- **Após reset, muitas vezes NÃO precisa de QR:** se a conta ainda estava logada de fato, o
  `/connect` pós-reset volta direto para `connected/loggedIn:true`. QR só é necessário quando
  a conta foi realmente deslogada e o pareamento foi perdido.
- **QR não saiu?** Se após `reset + connect` o `qrcode`/`paircode` continuam vazios e o status
  não estabiliza, o servidor provavelmente não consegue subir o socket → tratar como problema
  de infra do servidor.
- **Restart de servidor não é bala de prata:** pode quebrar o loop de `connecting`, mas as
  instâncias podem voltar como `disconnected` (precisando de `/connect`) e o problema pode
  reincidir se a causa for proxy/rede.

---

## 5. Receitas prontas (Node, sem dependências — usa `fetch` nativo)

> Substitua as credenciais do Redis por variáveis de ambiente. Todos os scripts:
> leem a lista de servidores, têm retry/timeout e não deixam uma falha parar o resto.

### 5.1 Helpers comuns
```js
const URL_R = process.env.UPSTASH_REDIS_REST_URL;
const TOK_R = process.env.UPSTASH_REDIS_REST_TOKEN;
const sleep = ms => new Promise(r => setTimeout(r, ms));
const dig = s => (s || "").replace(/\D/g, "");
function to(ms){ const c=new AbortController(); const t=setTimeout(()=>c.abort(),ms);
  return { signal:c.signal, clear:()=>clearTimeout(t) }; }
async function redisGet(key){
  const r = await fetch(`${URL_R}/get/${encodeURIComponent(key)}`,
    { headers:{ Authorization:`Bearer ${TOK_R}` } });
  const j = await r.json(); return j.result ? JSON.parse(j.result) : null;
}
async function withRetry(fn){ let last; for(let a=0;a<3;a++){ if(a>0) await sleep(2000);
  const r = await fn(); if(r && !r.fail) return r; last=r; } return last; }
async function mapLimit(items,limit,fn){ const out=[]; let i=0;
  await Promise.all(Array.from({length:Math.min(limit,items.length)},async()=>{
    while(i<items.length){ const k=i++; out[k]=await fn(items[k]); } })); return out; }
```

### 5.2 Varredura (fila > N, incluindo connecting)
```js
const ALLOWED = new Set(["connected","connecting"]); // inclua "disconnected" p/ caçar tudo
async function instAll(srv){ return withRetry(async()=>{ const t=to(15000);
  try{ const r=await fetch(`https://${srv.name}.uazapi.com/instance/all`,
        {headers:{Accept:"application/json",AdminToken:srv.token},signal:t.signal}); t.clear();
       if(!r.ok) return {fail:true}; const d=await r.json();
       return {arr: Array.isArray(d)?d:(d.instances||d.data||d.result||[])}; }
  catch{ t.clear(); return {fail:true}; } }); }
async function queue(server,token){ return withRetry(async()=>{ const t=to(8000);
  try{ const r=await fetch(`https://${server}.uazapi.com/message/async`,
        {headers:{Accept:"application/json",token},signal:t.signal}); t.clear();
       if(!r.ok) return {fail:true}; const d=await r.json(); const q=d.queue||d;
       return {pending:q.pending??0, status:q.status??"?"}; }
  catch{ t.clear(); return {fail:true}; } }); }

(async()=>{
  const servers = await redisGet("uazapi:servers");
  const lists = await Promise.allSettled(servers.map(async s=>({s, r:await instAll(s)})));
  const all=[];
  for(const x of lists){ if(x.status==="fulfilled" && x.value.r && x.value.r.arr)
    for(const i of x.value.r.arr)
      if(i.token && ALLOWED.has((i.status||"").toLowerCase()))
        all.push({server:x.value.s.name, name:i.name, owner:i.owner, token:i.token, status:i.status}); }
  const hits=[];
  await mapLimit(all,60, async inst=>{ const q=await queue(inst.server,inst.token);
    if(q && !q.fail && q.pending>5) hits.push({...inst, pending:q.pending, qstatus:q.status}); });
  hits.sort((a,b)=>b.pending-a.pending);
  console.log(JSON.stringify(hits,null,2));
})();
```

### 5.3 Só as travadas (connecting/disconnected + fila)
Igual a 5.2, mas `ALLOWED = new Set(["connecting","disconnected"])` e filtre `pending > 0`.

### 5.4 /connect numa lista de instâncias (com recheck)
```js
async function connect(server,token){ return withRetry(async()=>{ const t=to(15000);
  try{ const r=await fetch(`https://${server}.uazapi.com/instance/connect`,
        {method:"POST",headers:{Accept:"application/json","Content-Type":"application/json",token},
         body:"{}",signal:t.signal}); t.clear();
       const d=await r.json().catch(()=>({})); return r.ok?{data:d}:{fail:true,reason:r.status}; }
  catch{ t.clear(); return {fail:true}; } }); }
// fluxo: resolver token via /instance/all (match estrito por owner) → connect →
//        sleep(5000) → reler /instance/status + /message/async para confirmar.
```

### 5.5 Reset + espera + connect (instância em limbo)
```js
// 1) POST /instance/reset (header token)
// 2) Pollar /instance/status a cada 20s até resetting=false (ou ~3 min)
// 3) POST /instance/connect
// 4) Pollar /instance/status + ler qrcode/paircode da instância por ~40s
//    - se voltar connected/loggedIn:true  → resolvido (sem QR)
//    - se aparecer qrcode/paircode        → enviar para o dono escanear/parear
//    - se nada acontecer                  → problema de infra do servidor
```

### 5.6 Ajustar delay
```js
await fetch(`https://${server}.uazapi.com/instance/updateDelaySettings`,
  {method:"POST", headers:{Accept:"application/json","Content-Type":"application/json",token},
   body: JSON.stringify({msg_delay_min:0, msg_delay_max:0})});  // 0-0 = sem intervalo (ver §0.5)
```

### 5.7 Reiniciar servidor
```js
await fetch(`https://${server}.uazapi.com/admin/restart`,
  {method:"POST", headers:{Accept:"application/json", AdminToken:adminToken}});
```

---

## 6. Padrões de incidente já observados

| Sintoma | Causa provável | Ação |
|---------|----------------|------|
| Muitas instâncias caem juntas em vários servidores, `waiting_connection` | Problema de proxy/rede | Confirmar com varredura; `/connect` em massa nas afetadas |
| Travadas concentradas em **1 servidor** | Servidor instável | `/admin/restart` nesse servidor |
| `/connect` religa mas cai em minutos (`health_reconnect_timeout`) | Instabilidade persistente do servidor | Restart; se reincidir, escalar infra |
| `/connect` 200 mas sem QR, `loggedIn:false`/`jid:null`, volta a `disconnected` | Sessão em limbo | `reset` → esperar ~3 min → `connect` |
| Fila gigante mas `connected/processing` | Só volume/ritmo | Não é falha; opcional reduzir delay (com cautela) |
| `/connect` retorna HTTP 404 | Instância recriada / token trocado | Reler `/instance/all` e pegar token novo |

---

## 7. Saída esperada / como reportar
- Tabela ordenada por `pending` desc: número (owner), nome da instância, servidor, fila,
  status da conexão (`connected/loggedIn/resetting`), `qstatus` da fila, delay.
- **Separar** as `connected` saudáveis das que estão `connecting/disconnected` (travadas).
- Sempre informar: total de servidores, instâncias checadas, falhas e quais servidores não
  responderam.
- Para ações, mostrar antes → depois (fila e status) de cada instância.

---

## 8. Checklist rápido
- [ ] Li `uazapi:servers` (não chutei a quantidade de servidores).
- [ ] Varredura incluiu `connecting` (e `disconnected` se caçando travadas).
- [ ] Match número↔instância é estrito (sem casar owner vazio).
- [ ] Retry/timeout aplicados; falhas não pararam o resto.
- [ ] Antes de ação que altera número/sessão, confirmei com o responsável.
- [ ] Reset: esperei ~3 min antes do connect.
- [ ] Reportei antes→depois e separei saudáveis de travadas.
