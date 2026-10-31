/* =========================================================
   Sistema · módulo Hábitos
   Regras, cálculos e formulários dos hábitos. As telas
   (Rotina → Hábitos e Hoje) usam as funções daqui.

   Cada hábito (coleção "habitos"):
     { nome, freq: { tipo: 'diario' } | { tipo: 'semana', vezes: 3 },
       cor (0–6), ordem, ativo, lembrete: 'HH:MM' | null }

   Marcações (coleção "marcacoes"), um registro por hábito e mês:
     id "habitoId|2026-10" → { habito, mes: '2026-10', dias: [1, 2, 5, …] }
   ========================================================= */

import { MARCA } from '../nucleo/marca.js';
import * as dados from '../nucleo/dados.js';
import { abrirFolha, fecharFolha, toast, confirmar } from '../nucleo/ui.js';
import { esc, isoDia, isoMes, diasNoMes } from '../nucleo/util.js';
import * as lembretes from '../nucleo/lembretes.js';

const COL = 'habitos';
const COL_M = 'marcacoes';

// as quatro primeiras são bem diferentes entre si (os hábitos iniciais usam 0 a 3)
export const CORES = ['var(--g4)', 'var(--g6)', 'var(--g3)', 'var(--g7)', 'var(--g5)', 'var(--g2)', 'var(--g8)', 'var(--g1)'];
export const cor = (h) => CORES[(Number(h.cor) || 0) % CORES.length];

/* Hábitos combinados na entrevista: criados uma única vez, no primeiro acesso. */
const INICIAIS = [
  { nome: 'Academia', freq: { tipo: 'semana', vezes: 3 }, cor: 0 },
  { nome: 'Beber 2 L de água', freq: { tipo: 'diario' }, cor: 1 },
  { nome: 'Leitura', freq: { tipo: 'diario' }, cor: 2 },
  { nome: 'Dormir antes da meia-noite', freq: { tipo: 'diario' }, cor: 3 },
];

let criando = false; // evita criar duas vezes se duas telas chamarem ao mesmo tempo
export async function criarIniciais() {
  if (criando || dados.config('habitosIniciais')) return;
  criando = true;
  await dados.salvaConfig('habitosIniciais', { em: Date.now() });
  if (dados.lista(COL).length) return;
  for (const [i, h] of INICIAIS.entries()) await dados.salva(COL, { ...h, ordem: i, ativo: true, lembrete: null });
}

/* ---------- leitura ---------- */

export const lista = () => dados.lista(COL).filter((h) => h.ativo !== false).sort((a, b) => (a.ordem ?? 0) - (b.ordem ?? 0));

export const textoFreq = (h) => (h.freq?.tipo === 'semana' ? `${h.freq.vezes}x por semana` : 'todo dia');

const idMarca = (h, ym) => `${h.id}|${ym}`;

/** Dias do mês (números) em que o hábito foi feito. */
export const diasFeitos = (h, ym) => new Set(dados.pega(COL_M, idMarca(h, ym))?.dias ?? []);

export const feitoEm = (h, iso) => diasFeitos(h, iso.slice(0, 7)).has(Number(iso.slice(8)));

/** Marca ou desmarca o hábito num dia. */
export async function alternar(h, iso) {
  const ym = iso.slice(0, 7), dia = Number(iso.slice(8));
  const set = diasFeitos(h, ym);
  if (set.has(dia)) set.delete(dia); else set.add(dia);
  await dados.salva(COL_M, { id: idMarca(h, ym), habito: h.id, mes: ym, dias: [...set].sort((a, b) => a - b) });
}

/* ---------- cálculos ---------- */

/** Quantos dias do mês já passaram (incluindo hoje). */
export function diasDecorridos(ym) {
  const atual = isoMes();
  if (ym < atual) return diasNoMes(ym);
  if (ym > atual) return 0;
  return new Date().getDate();
}

/** Maior sequência de dias seguidos no mês. */
function maiorSequencia(set, ate) {
  let melhor = 0, atual = 0;
  for (let d = 1; d <= ate; d++) {
    if (set.has(d)) { atual++; melhor = Math.max(melhor, atual); } else atual = 0;
  }
  return melhor;
}

/**
 * Números do mês para cada hábito e no geral.
 * Para hábitos "X por semana", a meta do mês é proporcional aos dias que já passaram.
 */
export function estatisticas(ym) {
  const ate = diasDecorridos(ym);
  const hoje = isoDia();
  const porHabito = lista().map((h) => {
    const set = diasFeitos(h, ym);
    const feitos = [...set].filter((d) => d <= ate).length;
    const meta = h.freq?.tipo === 'semana' ? (h.freq.vezes * ate) / 7 : ate;
    const pct = meta > 0 ? Math.min(1, feitos / meta) : 0;
    return { h, set, feitos, pct, sequencia: maiorSequencia(set, ate), hoje: feitoEm(h, hoje) };
  });
  const melhor = porHabito.reduce((m, x) => (x.sequencia > (m?.sequencia ?? 0) ? x : m), null);
  const geral = porHabito.length ? porHabito.reduce((s, x) => s + x.pct, 0) / porHabito.length : 0;
  return { ate, porHabito, melhor, geral, hojeFeitos: porHabito.filter((x) => x.hoje).length };
}

/**
 * Descobertas automáticas, calculadas no próprio aparelho.
 * Compara: nos dias em que você fez A, quanto B acontece × nos dias em que não fez A.
 */
export function descobertas(ym) {
  const { ate, porHabito } = estatisticas(ym);
  if (ate < 10 || porHabito.length < 2) return ['Marque seus hábitos por pelo menos 10 dias e aqui aparecem descobertas sobre como um hábito puxa o outro.'];
  const achados = [];
  for (const a of porHabito) {
    for (const b of porHabito) {
      if (a === b) continue;
      let comA = 0, bComA = 0, semA = 0, bSemA = 0;
      for (let d = 1; d <= ate; d++) {
        if (a.set.has(d)) { comA++; if (b.set.has(d)) bComA++; } else { semA++; if (b.set.has(d)) bSemA++; }
      }
      if (comA < 4 || semA < 4) continue;
      const pCom = bComA / comA, pSem = bSemA / semA;
      if (pSem === 0 && pCom >= 0.5) achados.push({ forca: 99, texto: `Nos dias em que você faz <b>${esc(a.h.nome.toLowerCase())}</b>, <b>${esc(b.h.nome.toLowerCase())}</b> acontece; nos outros, não aconteceu nenhuma vez.` });
      else if (pSem > 0 && pCom / pSem >= 1.5) {
        const x = pCom / pSem;
        achados.push({ forca: x, texto: `Nos dias em que você faz <b>${esc(a.h.nome.toLowerCase())}</b>, <b>${esc(b.h.nome.toLowerCase())}</b> acontece <b>${x >= 2.6 && x < 3 ? 'quase 3' : x.toFixed(1).replace('.', ',').replace(',0', '')}x mais</b>.` });
      }
    }
  }
  achados.sort((p, q) => q.forca - p.forca);
  const textos = achados.slice(0, 2).map((a) => a.texto);
  const serie = porHabito.filter((x) => x.sequencia >= 5).sort((p, q) => q.sequencia - p.sequencia)[0];
  if (serie) textos.push(`<b>${esc(serie.h.nome)}</b>: sua melhor sequência no mês é de <b>${serie.sequencia} dias seguidos</b> ✦`);
  return textos.length ? textos : ['Ainda não apareceu nenhum padrão forte entre os seus hábitos neste mês.'];
}

/* ---------- formulário do hábito ---------- */

export function abrirHabito(habito = null) {
  const novo = !habito;
  const h = habito ? { ...habito } : { nome: '', freq: { tipo: 'diario' }, cor: lista().length % CORES.length, lembrete: null };
  const semanal = h.freq?.tipo === 'semana';

  const f = abrirFolha(`
    <h3>${novo ? 'Novo' : 'Editar'} <em>hábito</em></h3>
    <form id="f-hab" novalidate>
      <div class="fld"><label for="h-nome">Hábito</label>
        <input id="h-nome" value="${esc(h.nome)}" placeholder="Ex.: sem celular na 1ª hora" autocomplete="off" autofocus></div>
      <div class="fld"><span class="l">Frequência</span>
        <div class="opcoes" id="h-tipo">
          <button type="button" data-v="diario" aria-pressed="${!semanal}">Todo dia</button>
          <button type="button" data-v="semana" aria-pressed="${semanal}">Algumas vezes por semana</button>
        </div>
        <div class="opcoes" id="h-vezes" ${semanal ? '' : 'hidden'}>${[1, 2, 3, 4, 5, 6].map((n) =>
          `<button type="button" data-v="${n}" aria-pressed="${semanal && h.freq.vezes === n}">${n}x</button>`).join('')}</div>
      </div>
      <div class="fld"><span class="l">Cor</span>
        <div class="opcoes" id="h-cor">${CORES.map((c, i) => `<button type="button" class="amostra" data-v="${i}" aria-pressed="${Number(h.cor) === i}" aria-label="Cor ${i + 1}" style="--c:${c}"></button>`).join('')}</div></div>
      <div class="fld"><label for="h-hora">Lembrete (opcional)</label>
        <input id="h-hora" type="time" value="${esc(h.lembrete || '')}">
        <small>O aviso é criado no Calendário do iPhone ou do Mac, que é quem toca na hora certa.</small></div>
      <div class="erro" id="h-erro" role="alert"></div>
      ${novo ? '' : '<div class="opcoes acoes-tarefa"><button type="button" data-acao="arquivar" class="perigo">Remover hábito</button></div>'}
      <div class="acts">
        <button type="button" class="btn sec" data-fechar>Cancelar</button>
        <button type="submit" class="btn pri">Salvar</button>
      </div>
    </form>`);

  const escolha = (id, aoMudar) => {
    const el = f.querySelector(id);
    el.addEventListener('click', (e) => {
      const b = e.target.closest('button[data-v]');
      if (!b) return;
      el.querySelectorAll('button').forEach((x) => x.setAttribute('aria-pressed', String(x === b)));
      aoMudar?.(b.dataset.v);
    });
    return () => el.querySelector('[aria-pressed="true"]')?.dataset.v ?? null;
  };
  const lerTipo = escolha('#h-tipo', (v) => { f.querySelector('#h-vezes').hidden = v !== 'semana'; });
  const lerVezes = escolha('#h-vezes');
  const lerCor = escolha('#h-cor');
  f.querySelector('[data-fechar]').onclick = fecharFolha;

  f.querySelector('#f-hab').onsubmit = async (ev) => {
    ev.preventDefault();
    const nome = f.querySelector('#h-nome').value.trim();
    if (!nome) { f.querySelector('#h-erro').textContent = 'Dê um nome ao hábito.'; return; }
    const tipo = lerTipo();
    const vezes = Number(lerVezes());
    if (tipo === 'semana' && !vezes) { f.querySelector('#h-erro').textContent = 'Escolha quantas vezes por semana.'; return; }
    const lembrete = f.querySelector('#h-hora').value || null;
    const salvo = await dados.salva(COL, {
      ...h, nome, ativo: true, ordem: h.ordem ?? lista().length,
      freq: tipo === 'semana' ? { tipo: 'semana', vezes } : { tipo: 'diario' },
      cor: Number(lerCor() ?? h.cor ?? 0), lembrete,
    });
    fecharFolha();
    toast(novo ? 'Hábito criado ✦' : 'Hábito salvo.');
    if (lembrete && lembrete !== habito?.lembrete) setTimeout(() => oferecerLembrete(salvo), 300);
  };

  f.querySelector('[data-acao="arquivar"]')?.addEventListener('click', async () => {
    fecharFolha();
    if (await confirmar({ titulo: 'Remover hábito?', texto: `“${esc(h.nome)}” sai do tracker. As marcações antigas ficam guardadas.`, ok: 'Remover', perigo: true })) {
      await dados.salva(COL, { ...h, ativo: false });
      toast('Hábito removido.');
    }
  });
}

/* ---------- lembrete no Calendário (arquivo .ics) ---------- */

function oferecerLembrete(h) {
  const f = abrirFolha(`
    <h3>Criar o <em>lembrete</em>?</h3>
    <p class="sub">“${esc(h.nome)}” às ${esc(h.lembrete)}, ${esc(textoFreq(h))}. O Calendário abre e você confirma em “Adicionar”.</p>
    <div class="acts"><button type="button" class="btn sec" data-fechar>Agora não</button><button type="button" class="btn pri" id="l-ok">Adicionar ao Calendário</button></div>`);
  f.querySelector('[data-fechar]').onclick = fecharFolha;
  f.querySelector('#l-ok').onclick = async () => { fecharFolha(); await baixarLembrete(h); };
}

/** Gera um evento que se repete (com alarme na hora) e entrega para o Calendário. */
/** Dias da semana do lembrete de um hábito "X vezes por semana" (bem distribuídos). */
const DIAS_DO_HABITO = { 1: 'MO', 2: 'MO,TH', 3: 'MO,WE,FR', 4: 'MO,TU,TH,FR', 5: 'MO,TU,WE,TH,FR', 6: 'MO,TU,WE,TH,FR,SA' };

/** Evento de calendário do hábito (precisa ter horário de lembrete). */
export function eventoDoHabito(h) {
  const regra = h.freq?.tipo === 'semana' && h.freq.vezes < 7 ? `FREQ=WEEKLY;BYDAY=${DIAS_DO_HABITO[Math.max(1, h.freq.vezes)]}` : 'FREQ=DAILY';
  return lembretes.evento({ uid: `${MARCA.id}-hab-${h.id}@${MARCA.id}`, titulo: `✦ ${h.nome}`, inicio: `${isoDia()}T${h.lembrete}`, duracao: 15, regra, alarmes: ['PT0M'] });
}

export async function baixarLembrete(h) {
  await lembretes.entregar(lembretes.calendario([eventoDoHabito(h)]), `lembrete-${h.nome.toLowerCase().replace(/[^a-z0-9]+/gi, '-')}.ics`);
}

/** Um arquivo só com o lembrete de todos os hábitos que têm horário. Devolve quantos entraram. */
export async function baixarLembretesDeTodos() {
  const com = lista().filter((h) => h.lembrete);
  if (!com.length) return 0;
  await lembretes.entregar(lembretes.calendario(com.map(eventoDoHabito)), 'lembretes-habitos.ics');
  return com.length;
}
