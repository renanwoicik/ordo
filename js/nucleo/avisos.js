/* =========================================================
   Sistema · central de avisos
   Cada módulo registra uma função que devolve os seus avisos
   do momento. O painel Hoje junta todos num lugar só.

   Formato de um aviso:
     { id, texto (pode ter <strong>), tipo: 'warn' | 'ok' | 'info',
       area: 'trabalho' | ..., irPara: '#/rota' (opcional),
       prioridade: número (maior aparece primeiro) }

   Uso num módulo:
     avisos.registrar('financeiro', () => [ {...}, ... ]);

   Dispensar: você pode tirar um aviso da lista (o "×" no painel Hoje).
   A lista de dispensados fica no cofre (configuração "avisosDispensados"),
   então vale nos dois aparelhos. Um aviso dispensado só volta se a
   situação que o gerou deixar de existir e depois acontecer de novo.
   ========================================================= */

import * as dados from './dados.js';

const fontes = new Map();

export function registrar(nome, fn) {
  fontes.set(nome, fn);
}

const dispensados = () => new Set(dados.config('avisosDispensados')?.ids ?? []);

function juntar() {
  const lista = [];
  for (const [nome, fn] of fontes) {
    try { lista.push(...(fn() || [])); } catch (e) { console.error('Aviso com erro em', nome, e); }
  }
  return lista.sort((a, b) => (b.prioridade || 0) - (a.prioridade || 0));
}

/** Todos os avisos de todos os módulos, do mais importante para o menos (sem os dispensados). */
export function todos({ incluirDispensados = false } = {}) {
  const lista = juntar();
  if (incluirDispensados) return lista;
  const fora = dispensados();
  return lista.filter((a) => !fora.has(a.id));
}

/** Quantos avisos que existem agora estão dispensados. */
export function totalDispensados() {
  const fora = dispensados();
  return juntar().filter((a) => fora.has(a.id)).length;
}

export async function dispensar(id) {
  await dados.salvaConfig('avisosDispensados', { ids: [...new Set([...dispensados(), id])] });
}

export const restaurarTodos = () => dados.salvaConfig('avisosDispensados', { ids: [] });

/** Esquece os dispensados cujo aviso já não existe (assim, se a situação voltar, o aviso volta). */
export async function limparObsoletos() {
  const atuais = new Set(juntar().map((a) => a.id));
  const antes = [...dispensados()];
  const depois = antes.filter((id) => atuais.has(id));
  if (depois.length !== antes.length) await dados.salvaConfig('avisosDispensados', { ids: depois });
}
