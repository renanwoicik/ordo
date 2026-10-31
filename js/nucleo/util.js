/* =========================================================
   Sistema · utilidades
   Funções pequenas usadas em todo o sistema: dinheiro em R$,
   datas em português, ids e proteção de texto.
   ========================================================= */

import { MARCA } from './marca.js';

const formatoBRL = new Intl.NumberFormat('pt-BR', { style: 'currency', currency: 'BRL' });

/** 1234.5 → "R$ 1.234,50" */
export const brl = (v) => formatoBRL.format(Number(v) || 0);

/** Arredonda para centavos (evita 0,1 + 0,2 = 0,30000000004). */
export const r2 = (v) => Math.round((Number(v) || 0) * 100) / 100;

/** Lê um valor digitado em português: "1.234,50", "R$ 90", "-15,9". Retorna NaN se não der. */
export function lerValor(texto) {
  let s = String(texto ?? '').replace(/\s|R\$/g, '');
  if (!s) return NaN;
  if (s.includes(',')) s = s.replace(/\./g, '').replace(',', '.');
  return Number(s);
}

/** Protege um texto antes de colocá-lo no HTML (evita que "<" quebre a tela). */
export function esc(s) {
  return String(s ?? '').replace(/[&<>"']/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]));
}

/** Tira acentos e deixa minúsculo, para buscas ("Conceição" acha "conceicao"). */
export const normal = (s) => String(s ?? '').normalize('NFD').replace(/[̀-ͯ]/g, '').toLowerCase();

/** Id único curto, ex.: "m3k9x2ab7f". */
export const novoId = () => Date.now().toString(36) + crypto.getRandomValues(new Uint32Array(1))[0].toString(36);

/* ---------- datas (sempre no fuso do aparelho) ---------- */

const dois = (n) => String(n).padStart(2, '0');

/** Date → "2026-10-27" */
export const isoDia = (d = new Date()) => `${d.getFullYear()}-${dois(d.getMonth() + 1)}-${dois(d.getDate())}`;

/** Date → "2026-10" */
export const isoMes = (d = new Date()) => `${d.getFullYear()}-${dois(d.getMonth() + 1)}`;

/** "2026-10-27" → Date (meia-noite local) */
export function deIso(iso) {
  const [a, m, d] = String(iso).split('-').map(Number);
  return new Date(a, (m || 1) - 1, d || 1);
}

const primeiraMaiuscula = (s) => s.charAt(0).toUpperCase() + s.slice(1);

/** → "Segunda-feira, 27 de outubro" */
export const diaPorExtenso = (d = new Date()) =>
  primeiraMaiuscula(d.toLocaleDateString('pt-BR', { weekday: 'long', day: 'numeric', month: 'long' }));

/** "2026-10" → "Outubro 2026" */
export const mesPorExtenso = (ym) =>
  primeiraMaiuscula(deIso(ym + '-01').toLocaleDateString('pt-BR', { month: 'long', year: 'numeric' }).replace(' de ', ' '));

/** Timestamp → "27/10/2026 às 14:03" */
export function dataHora(ms) {
  const d = new Date(ms);
  return `${d.toLocaleDateString('pt-BR')} às ${dois(d.getHours())}:${dois(d.getMinutes())}`;
}

/** Quantos dias inteiros se passaram desde um timestamp. */
export const diasDesde = (ms) => Math.floor((Date.now() - ms) / 86400000);

/** Saudação conforme a hora. */
export function saudacao(d = new Date()) {
  const h = d.getHours();
  return h < 12 ? 'Bom dia' : h < 18 ? 'Boa tarde' : 'Boa noite';
}

/* ---------- preferências do aparelho (não sensíveis) ---------- */
// Guardadas fora do cofre porque precisam existir antes da senha (ex.: tema da tela de senha).

export const pref = {
  ler(chave, padrao = null) {
    try { const v = localStorage.getItem(MARCA.id + '.' + chave); return v === null ? padrao : JSON.parse(v); } catch { return padrao; }
  },
  gravar(chave, valor) {
    try { localStorage.setItem(MARCA.id + '.' + chave, JSON.stringify(valor)); } catch { /* modo privado: ignora */ }
  },
};

/* ---------- semanas e durações (tarefas e hábitos) ---------- */

/** "2026-10-27" + 3 → "2026-10-30" */
export function somarDias(iso, n) {
  const d = deIso(iso);
  d.setDate(d.getDate() + n);
  return isoDia(d);
}

/** Segunda-feira da semana do dia dado (a semana começa na segunda). */
export function segundaDaSemana(iso = isoDia()) {
  const d = deIso(iso);
  const dow = (d.getDay() + 6) % 7; // 0 = segunda … 6 = domingo
  d.setDate(d.getDate() - dow);
  return isoDia(d);
}

/** Os 7 dias (segunda a domingo) da semana que começa em `segunda`. */
export const diasDaSemana = (segunda) => Array.from({ length: 7 }, (_, i) => somarDias(segunda, i));

export const NOMES_DIAS = ['seg', 'ter', 'qua', 'qui', 'sex', 'sáb', 'dom'];

/** "2026-10-27" → "27/10" */
export const diaMes = (iso) => { const [, m, d] = String(iso).split('-'); return `${d}/${m}`; };

/** Minutos → "45 min", "1h", "2h30" */
export function duracao(min) {
  min = Math.round(Number(min) || 0);
  if (min < 60) return `${min} min`;
  const h = Math.floor(min / 60), m = min % 60;
  return m ? `${h}h${String(m).padStart(2, '0')}` : `${h}h`;
}

/** Quantos dias tem o mês "2026-10". */
export function diasNoMes(ym) {
  const [a, m] = ym.split('-').map(Number);
  return new Date(a, m, 0).getDate();
}

/** "2026-10" + 1 → "2026-11" */
export function somarMeses(ym, n) {
  const [a, m] = ym.split('-').map(Number);
  return isoMes(new Date(a, m - 1 + n, 1));
}
