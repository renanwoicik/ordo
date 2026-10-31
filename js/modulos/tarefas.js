/* =========================================================
   Sistema · módulo Tarefas (e planejador da semana)
   Regras e formulários das tarefas. As telas (Rotina → Semana
   e Hoje) usam as funções daqui.

   Cada tarefa (coleção "tarefas"):
     { titulo, area, dia, prazo, tempo, importante, nota,
       status: 'aberta' | 'feita' | 'recusada' | 'delegada',
       destino, feitaEm }
     dia   → quando você planeja fazer (pode ficar vazio)
     prazo → até quando precisa estar pronta (opcional)
     tempo → minutos estimados

   Horas livres da semana (configurações):
     semanaPadrao        → { horas: [seg, ter, qua, qui, sex, sáb, dom] }
     semana-AAAA-MM-DD   → ajuste só daquela semana (chave = segunda-feira)
   ========================================================= */

import * as dados from '../nucleo/dados.js';
import * as avisos from '../nucleo/avisos.js';
import { abrirFolha, fecharFolha, toast, confirmar } from '../nucleo/ui.js';
import { esc, isoDia, somarDias, segundaDaSemana, diasDaSemana, NOMES_DIAS, duracao, diaMes } from '../nucleo/util.js';

const COL = 'tarefas';

export const AREAS = [
  { id: 'trabalho', nome: 'Trabalho' },
  { id: 'estudos', nome: 'Estudos' },
  { id: 'pessoal', nome: 'Pessoal' },
];
export const nomeArea = (id) => AREAS.find((a) => a.id === id)?.nome ?? 'Pessoal';

const TEMPOS = [15, 30, 45, 60, 90, 120];

/* ---------- leitura ---------- */

export const todas = () => dados.lista(COL);
const ativa = (t) => t.status === 'aberta' || t.status === 'feita';

/** Tarefas planejadas para um dia (abertas e feitas). */
export const doDia = (iso) => todas().filter((t) => t.dia === iso && ativa(t))
  .sort((a, b) => (a.status === 'feita') - (b.status === 'feita') || (b.importante ? 1 : 0) - (a.importante ? 1 : 0));

/** Abertas sem dia definido. */
export const semDia = () => todas().filter((t) => t.status === 'aberta' && !t.dia);

/** Abertas cujo dia ou prazo já passou. */
export const atrasadas = (hoje = isoDia()) =>
  todas().filter((t) => t.status === 'aberta' && ((t.dia && t.dia < hoje) || (t.prazo && t.prazo < hoje)));

/** Recusadas e delegadas (para os quadros "dá para recusar / delegar"). */
export const foraDaSemana = (status) => todas().filter((t) => t.status === status)
  .sort((a, b) => (b.atualizadoEm || 0) - (a.atualizadoEm || 0)).slice(0, 8);

const minutos = (lista) => lista.reduce((s, t) => s + (Number(t.tempo) || 0), 0);

/* ---------- horas livres ---------- */

export const semanaPadrao = () => dados.config('semanaPadrao')?.horas ?? null;
export const ajusteDaSemana = (segunda) => dados.config(`semana-${segunda}`)?.horas ?? null;
/** Horas livres de cada dia da semana (ajuste da semana, senão a semana padrão). null = ainda não definida. */
export const horasLivres = (segunda) => ajusteDaSemana(segunda) ?? semanaPadrao();

/**
 * Resumo da semana para o planejador.
 * Devolve { dias:[{ iso, nome, tarefas, minAbertos, minLivres, passou }], minTarefas, minLivres, fecha }
 */
export function resumoSemana(segunda) {
  const livres = horasLivres(segunda);
  const dias = diasDaSemana(segunda).map((iso, i) => {
    const tarefas = doDia(iso);
    const minAbertos = minutos(tarefas.filter((t) => t.status === 'aberta'));
    const minLivres = livres ? Math.round((Number(livres[i]) || 0) * 60) : null;
    return { iso, nome: NOMES_DIAS[i], tarefas, minAbertos, minLivres, passou: livres ? minAbertos > minLivres : false };
  });
  const minTarefas = dias.reduce((s, d) => s + d.minAbertos, 0);
  const minLivres = livres ? dias.reduce((s, d) => s + d.minLivres, 0) : null;
  return { dias, minTarefas, minLivres, fecha: minLivres == null || minTarefas <= minLivres };
}

/* ---------- ações ---------- */

export async function alternarFeita(t) {
  const feita = t.status !== 'feita';
  await dados.salva(COL, { ...t, status: feita ? 'feita' : 'aberta', feitaEm: feita ? Date.now() : null });
  if (feita) toast('Tarefa concluída ✦');
}

export const moverPara = (t, dia) => dados.salva(COL, { ...t, dia: dia || null, status: 'aberta' });

/* ---------- formulário da tarefa ---------- */

const opcoesArea = (atual) => AREAS.map((a) =>
  `<button type="button" data-v="${a.id}" aria-pressed="${a.id === atual}"><i style="background:var(--area-${a.id})"></i>${a.nome}</button>`).join('');

/** Liga um grupo de botões de escolha única (.opcoes). Devolve uma função que lê o valor escolhido. */
function grupo(el, aoMudar) {
  el.addEventListener('click', (e) => {
    const b = e.target.closest('button[data-v]');
    if (!b) return;
    el.querySelectorAll('button').forEach((x) => x.setAttribute('aria-pressed', String(x === b)));
    aoMudar?.(b.dataset.v);
  });
  return () => el.querySelector('[aria-pressed="true"]')?.dataset.v ?? null;
}

/**
 * Abre a folha para criar ou editar uma tarefa.
 *   abrirTarefa()                      → nova, para hoje
 *   abrirTarefa(null, { dia: iso })    → nova, num dia
 *   abrirTarefa(null, { area: 'estudos' })  → nova, já numa área
 *   abrirTarefa(tarefa)                → editar
 */
export function abrirTarefa(tarefa = null, { dia, area } = {}) {
  const nova = !tarefa;
  const t = tarefa ? { ...tarefa } : { titulo: '', area: area || 'trabalho', dia: dia === undefined ? isoDia() : dia, prazo: '', tempo: 30, importante: false, nota: '', status: 'aberta' };
  const tempoOutro = TEMPOS.includes(Number(t.tempo)) ? '' : t.tempo;

  const f = abrirFolha(`
    <h3>${nova ? 'Nova' : 'Editar'} <em>tarefa</em></h3>
    <form id="f-tarefa" novalidate>
      <div class="fld"><label for="t-titulo">O que fazer</label>
        <input id="t-titulo" value="${esc(t.titulo)}" placeholder="Ex.: enviar o plano alimentar da Ana" autocomplete="off" autofocus></div>
      <div class="fld"><span class="l">Área</span><div class="opcoes" id="t-area">${opcoesArea(t.area)}</div></div>
      <div class="fld"><span class="l">Tempo estimado</span>
        <div class="opcoes" id="t-tempo">${TEMPOS.map((m) => `<button type="button" data-v="${m}" aria-pressed="${Number(t.tempo) === m}">${duracao(m)}</button>`).join('')}</div>
        <input id="t-tempo-outro" type="number" min="5" step="5" inputmode="numeric" placeholder="ou digite os minutos" value="${esc(tempoOutro)}"></div>
      <div class="par">
        <div class="fld"><label for="t-dia">Fazer no dia</label><input id="t-dia" type="date" value="${esc(t.dia || '')}"></div>
        <div class="fld"><label for="t-prazo">Prazo (opcional)</label><input id="t-prazo" type="date" value="${esc(t.prazo || '')}"></div>
      </div>
      <label class="chk"><input type="checkbox" id="t-imp" ${t.importante ? 'checked' : ''}> Importante (aparece primeiro)</label>
      <div class="fld"><label for="t-nota">Anotação (opcional)</label><textarea id="t-nota" rows="2">${esc(t.nota || '')}</textarea></div>
      <div class="erro" id="t-erro" role="alert"></div>
      ${nova ? '' : `
        <div class="opcoes acoes-tarefa">
          <button type="button" data-acao="feita">${t.status === 'feita' ? 'Reabrir' : '✓ Concluir'}</button>
          <button type="button" data-acao="adiar">Adiar</button>
          <button type="button" data-acao="recusar">Recusar</button>
          <button type="button" data-acao="delegar">Delegar</button>
          <button type="button" data-acao="apagar" class="perigo">Apagar</button>
        </div>`}
      <div class="acts">
        <button type="button" class="btn sec" data-fechar>Cancelar</button>
        <button type="submit" class="btn pri">Salvar</button>
      </div>
    </form>`);

  const lerArea = grupo(f.querySelector('#t-area'));
  const lerTempo = grupo(f.querySelector('#t-tempo'), () => { f.querySelector('#t-tempo-outro').value = ''; });
  f.querySelector('#t-tempo-outro').addEventListener('input', () =>
    f.querySelectorAll('#t-tempo button').forEach((b) => b.setAttribute('aria-pressed', 'false')));
  f.querySelector('[data-fechar]').onclick = fecharFolha;

  const montar = () => ({
    ...t,
    titulo: f.querySelector('#t-titulo').value.trim(),
    area: lerArea() || 'pessoal',
    tempo: Number(f.querySelector('#t-tempo-outro').value) || Number(lerTempo()) || 30,
    dia: f.querySelector('#t-dia').value || null,
    prazo: f.querySelector('#t-prazo').value || null,
    importante: f.querySelector('#t-imp').checked,
    nota: f.querySelector('#t-nota').value.trim(),
  });

  f.querySelector('#f-tarefa').onsubmit = async (ev) => {
    ev.preventDefault();
    const novaT = montar();
    if (!novaT.titulo) { f.querySelector('#t-erro').textContent = 'Escreva o que precisa ser feito.'; f.querySelector('#t-titulo').focus(); return; }
    await dados.salva(COL, novaT);
    fecharFolha();
    toast(nova ? 'Tarefa criada.' : 'Tarefa salva.');
  };

  f.querySelector('.acoes-tarefa')?.addEventListener('click', async (e) => {
    const b = e.target.closest('[data-acao]');
    if (!b) return;
    const atual = { ...montar(), titulo: montar().titulo || t.titulo };
    const acao = b.dataset.acao;
    if (acao === 'feita') { fecharFolha(); await alternarFeita(atual); }
    else if (acao === 'adiar') folhaAdiar(atual);
    else if (acao === 'recusar' || acao === 'delegar') folhaDestino(atual, acao);
    else if (acao === 'apagar') {
      fecharFolha();
      if (await confirmar({ titulo: 'Apagar tarefa?', texto: `“${esc(t.titulo)}” será apagada.`, ok: 'Apagar', perigo: true })) {
        await dados.apaga(COL, t.id);
        toast('Tarefa apagada.');
      }
    }
  });
}

function folhaAdiar(t) {
  const hoje = isoDia();
  const opcoes = [
    ['Amanhã', somarDias(hoje, 1)],
    ['Próxima segunda', somarDias(segundaDaSemana(hoje), 7)],
    ['Daqui a 15 dias', somarDias(hoje, 15)],
    ['Sem dia definido', ''],
  ];
  const f = abrirFolha(`
    <h3>Adiar <em>para quando?</em></h3>
    <p class="sub">${esc(t.titulo)}</p>
    <div class="lista">${opcoes.map(([n, d]) => `<button class="item" data-d="${d}"><span class="tx"><b>${n}</b><small>${d ? diaMes(d) : 'fica na lista para encaixar depois'}</small></span></button>`).join('')}</div>
    <div class="fld" style="margin-top:14px"><label for="a-dia">Ou escolha o dia</label><input id="a-dia" type="date"></div>
    <div class="acts"><button type="button" class="btn sec" data-fechar>Cancelar</button><button type="button" class="btn pri" id="a-ok">Adiar</button></div>`);
  const adiar = async (d) => { await moverPara(t, d); fecharFolha(); toast(d ? `Adiada para ${diaMes(d)}.` : 'Tarefa sem dia definido.'); };
  f.querySelectorAll('[data-d]').forEach((b) => b.addEventListener('click', () => adiar(b.dataset.d)));
  f.querySelector('#a-ok').onclick = () => { const d = f.querySelector('#a-dia').value; if (d) adiar(d); else toast('Escolha um dia.'); };
  f.querySelector('[data-fechar]').onclick = fecharFolha;
}

function folhaDestino(t, acao) {
  const delegar = acao === 'delegar';
  const f = abrirFolha(`
    <h3>${delegar ? 'Delegar <em>para quem?</em>' : 'Recusar <em>esta tarefa</em>'}</h3>
    <p class="sub">${esc(t.titulo)}</p>
    <div class="fld"><label for="d-txt">${delegar ? 'Para quem (ou como)' : 'O que fazer no lugar'}</label>
      <input id="d-txt" placeholder="${delegar ? 'Ex.: contadora, secretária da clínica' : 'Ex.: propor para a semana que vem'}" autocomplete="off" autofocus></div>
    <div class="acts"><button type="button" class="btn sec" data-fechar>Cancelar</button><button type="button" class="btn pri" id="d-ok">${delegar ? 'Delegar' : 'Recusar'}</button></div>`);
  f.querySelector('[data-fechar]').onclick = fecharFolha;
  f.querySelector('#d-ok').onclick = async () => {
    await dados.salva(COL, { ...t, status: delegar ? 'delegada' : 'recusada', destino: f.querySelector('#d-txt').value.trim() });
    fecharFolha();
    toast(delegar ? 'Marcada como delegada.' : 'Marcada como recusada.');
  };
}

/* ---------- semana padrão (horas livres) ---------- */

export function abrirHorasLivres(segunda) {
  const atual = horasLivres(segunda) ?? [4, 4, 4, 4, 4, 2, 0];
  const temAjuste = !!ajusteDaSemana(segunda);
  const f = abrirFolha(`
    <h3>Suas <em>horas livres</em></h3>
    <p class="sub">Quantas horas sobram em cada dia para tarefas, fora consultas, visitas e compromissos fixos.</p>
    <form id="f-horas" novalidate>
      <div class="grade-horas">${NOMES_DIAS.map((n, i) => `
        <div class="fld"><label for="h-${i}">${n}</label><input id="h-${i}" type="number" min="0" max="16" step="0.5" inputmode="decimal" value="${Number(atual[i]) || 0}"></div>`).join('')}</div>
      <label class="chk"><input type="checkbox" id="h-so" ${temAjuste ? 'checked' : ''}> Só para a semana de ${diaMes(segunda)} (não muda a semana padrão)</label>
      <div class="acts"><button type="button" class="btn sec" data-fechar>Cancelar</button><button type="submit" class="btn pri">Salvar</button></div>
    </form>`);
  f.querySelector('[data-fechar]').onclick = fecharFolha;
  f.querySelector('#f-horas').onsubmit = async (ev) => {
    ev.preventDefault();
    const horas = NOMES_DIAS.map((_, i) => Math.max(0, Number(String(f.querySelector(`#h-${i}`).value).replace(',', '.')) || 0));
    if (f.querySelector('#h-so').checked) await dados.salvaConfig(`semana-${segunda}`, { horas });
    else {
      await dados.salvaConfig('semanaPadrao', { horas });
      if (temAjuste) await dados.apaga('config', `semana-${segunda}`);
    }
    fecharFolha();
    toast('Horas livres salvas.');
  };
}

/* ---------- texto para o Claude reorganizar a semana ---------- */

export function textoDaSemana(segunda) {
  const r = resumoSemana(segunda);
  const livres = horasLivres(segunda);
  const linha = (t) => `- ${t.titulo} [${nomeArea(t.area)}] · ${duracao(t.tempo)}${t.importante ? ' · importante' : ''}${t.prazo ? ` · prazo ${diaMes(t.prazo)}` : ''}`;
  const partes = [
    `Minha semana de ${diaMes(segunda)} a ${diaMes(somarDias(segunda, 6))}. Organize como secretária: diga se a semana fecha, sugira em que dia encaixar cada tarefa e o que dá para recusar, adiar ou delegar.`,
    '',
    `Horas livres: ${livres ? NOMES_DIAS.map((n, i) => `${n} ${livres[i]}h`).join(', ') : 'ainda não defini'}.`,
    `Total de tarefas: ${duracao(r.minTarefas)}${r.minLivres != null ? ` para ${duracao(r.minLivres)} livres` : ''}.`,
    '',
    ...r.dias.flatMap((d) => {
      const abertas = d.tarefas.filter((t) => t.status === 'aberta');
      return abertas.length ? [`${d.nome} (${diaMes(d.iso)}):`, ...abertas.map(linha)] : [];
    }),
  ];
  const sd = semDia();
  if (sd.length) partes.push('', 'Sem dia definido:', ...sd.map(linha));
  return partes.join('\n');
}

/* ---------- avisos para o painel Hoje ---------- */

avisos.registrar('tarefas', () => {
  const lista = [];
  const atr = atrasadas();
  if (atr.length) lista.push({ id: 'tarefas-atrasadas', tipo: 'warn', prioridade: 4, irPara: '#/rotina/tarefas',
    texto: `Você tem <strong>${atr.length} ${atr.length === 1 ? 'tarefa atrasada' : 'tarefas atrasadas'}</strong>. Toque para reorganizar.` });
  const r = resumoSemana(segundaDaSemana());
  if (!r.fecha) lista.push({ id: 'semana-cheia', tipo: 'mid', prioridade: 3, irPara: '#/rotina/tarefas',
    texto: `<strong>Essa semana não fecha:</strong> ${duracao(r.minTarefas)} de tarefas para ${duracao(r.minLivres)} livres.` });
  return lista;
});
