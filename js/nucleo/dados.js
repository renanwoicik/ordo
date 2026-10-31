/* =========================================================
   Sistema · dados
   A "porta de entrada" que os módulos usam para ler e gravar.
   Os módulos nunca falam com o cofre diretamente: falam com
   este arquivo, que mantém uma cópia desembaralhada em memória
   (rápida) e grava embaralhado no aparelho.

   Uso nos módulos:
     import * as dados from '../nucleo/dados.js';
     dados.lista('entradas')            → [ {...}, ... ]
     dados.pega('entradas', id)         → {...} ou null
     await dados.salva('entradas', obj) → obj com id
     await dados.apaga('entradas', id)
     dados.ouvir(() => redesenhar())        → avisa quando algo muda
   ========================================================= */

import * as cofre from './cofre.js';
import { novoId } from './util.js';

/** Memória: Map<coleção, Map<id, objeto>> */
const memoria = new Map();
const ouvintes = new Set();

function colecao(col) {
  if (!memoria.has(col)) memoria.set(col, new Map());
  return memoria.get(col);
}

function avisar(col) {
  for (const fn of ouvintes) {
    try { fn(col); } catch (e) { console.error(e); }
  }
}

/** Carrega tudo do cofre para a memória (chamado logo depois de digitar a senha). */
export async function carregar() {
  memoria.clear();
  for (const r of await cofre.lerTodos()) {
    if (!r.del) colecao(r.col).set(r.id, { ...r.dados, id: r.id });
  }
  avisar('*');
}

/** Esquece tudo da memória (ao bloquear). */
export function esquecer() {
  memoria.clear();
}

/** Lista os itens de uma coleção. */
export const lista = (col) => [...colecao(col).values()];

/** Um item pelo id. */
export const pega = (col, id) => colecao(col).get(id) ?? null;

/** Cria ou atualiza um item. Coloca id e datas automaticamente. */
export async function salva(col, obj) {
  const agora = Date.now();
  const id = obj.id || novoId();
  const anterior = colecao(col).get(id);
  const item = { ...obj, id, criadoEm: anterior?.criadoEm ?? obj.criadoEm ?? agora, atualizadoEm: agora };
  const { id: _, ...semId } = item;
  await cofre.gravar(col, id, semId);
  colecao(col).set(id, item);
  avisar(col);
  return item;
}

/** Apaga um item. */
export async function apaga(col, id) {
  await cofre.apagar(col, id);
  colecao(col).delete(id);
  avisar(col);
}

/* ---------- configurações (uma coleção especial, com chaves fixas) ---------- */
// Ex.: dados.config('perfil', { nome: ... })

export const config = (chave, padrao = null) => pega('config', chave) ?? padrao;
export const salvaConfig = (chave, valor) => salva('config', { ...valor, id: chave });

/** Registra uma função chamada sempre que algum dado muda. Devolve a função para parar de ouvir. */
export function ouvir(fn) {
  ouvintes.add(fn);
  return () => ouvintes.delete(fn);
}

/** Quantos itens existem em cada coleção (usado em Ajustes). */
export function contagem() {
  const out = {};
  for (const [col, m] of memoria) if (m.size) out[col] = m.size;
  return out;
}
