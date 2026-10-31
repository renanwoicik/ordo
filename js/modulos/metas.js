/* =========================================================
   Sistema · módulo Metas do semestre
   Quatro pilares (Carreira, Finanças, Saúde e
   Desenvolvimento). Cada meta pertence a um pilar e a um
   semestre (1º = janeiro a junho, 2º = julho a dezembro).

   O progresso pode ser:
   - manual: você informa o alvo e atualiza o quanto já fez;
   - automático: o sistema calcula a partir de outro módulo
     (entradas, sobra do mês, hábitos).

   Meta (coleção "metas"):
     { titulo, pilar, semestre: 'AAAA-S1' | 'AAAA-S2', tipo: 'manual' | 'auto',
       fonte (se auto), habitoId (se a fonte for um hábito),
       alvo, atual (se manual), unidade, nota }
   Os valores (alvos) são seus e ficam só no cofre.
   ========================================================= */

import * as dados from '../nucleo/dados.js';
import * as avisos from '../nucleo/avisos.js';
import { abrirFolha, fecharFolha, toast, confirmar } from '../nucleo/ui.js';
import { esc, brl, r2, lerValor, isoDia, deIso, isoMes, somarMeses } from '../nucleo/util.js';
import * as S from './gastos.js';
import * as Ho from './honorarios.js';
import * as H from './habitos.js';

const COL = 'metas';

export const PILARES = [
  { id: 'carreira', nome: 'Carreira', cor: 'var(--g6)' },
  { id: 'financas', nome: 'Finanças', cor: 'var(--g3)' },
  { id: 'saude', nome: 'Saúde', cor: 'var(--g4)' },
  { id: 'desenvolvimento', nome: 'Desenvolvimento', cor: 'var(--g7)' },
];
export const pilar = (id) => PILARES.find((p) => p.id === id) ?? PILARES[0];

/* ---------- semestres ---------- */

export function semestreDe(iso = isoDia()) {
  const ano = Number(iso.slice(0, 4)), num = Number(iso.slice(5, 7)) <= 6 ? 1 : 2;
  const primeiro = num === 1 ? 1 : 7;
  const meses = Array.from({ length: 6 }, (_, i) => `${ano}-${String(primeiro + i).padStart(2, '0')}`);
  return { id: `${ano}-S${num}`, ano, num, meses, inicio: `${meses[0]}-01`, fim: `${meses[5]}-${meses[5].endsWith('12') ? '31' : '30'}`, nome: `${num}º semestre de ${ano}` };
}
export const semestreSomar = (sem, n) => semestreDe(`${somarMeses(sem.meses[0], 6 * n)}-01`);

/** Quanto do semestre já passou (0 a 1) e em que semana (1 a 26) ele está. */
export function andamento(sem, hoje = isoDia()) {
  const total = (deIso(sem.fim) - deIso(sem.inicio)) / 86400000 + 1;
  const dias = (deIso(hoje) - deIso(sem.inicio)) / 86400000 + 1;
  const fracao = Math.max(0, Math.min(1, dias / total));
  const semana = hoje < sem.inicio ? 0 : hoje > sem.fim ? 27 : Math.min(26, Math.floor((dias - 1) / 7) + 1);
  return { fracao, semana };
}

/* ---------- fontes de progresso automático ---------- */

const ateAgora = (sem) => sem.meses.filter((m) => m <= isoMes());

export const FONTES = [
  { id: 'entradas', nome: 'Total de entradas', unidade: 'R$', calc: (m, sem) => r2(ateAgora(sem).reduce((s, ym) => s + Ho.totalMes(ym), 0)) },
  { id: 'sobra', nome: 'Quanto sobrou (entradas − tudo que saiu)', unidade: 'R$', calc: (m, sem) => r2(ateAgora(sem).reduce((s, ym) => s + Ho.totalMes(ym) - S.calcular(ym).total, 0)) },
  { id: 'honorarios', nome: 'Honorários recebidos', unidade: 'R$', calc: (m, sem) => r2(ateAgora(sem).reduce((s, ym) => s + Ho.doMesResumo(ym).honorarios, 0)) },
  { id: 'habito', nome: 'Vezes que fiz um hábito', unidade: 'vezes', calc: (m, sem) => { const h = H.lista().find((x) => x.id === m.habitoId); return h ? sem.meses.reduce((s, ym) => s + H.diasFeitos(h, ym).size, 0) : 0; } },
];
const fonte = (id) => FONTES.find((f) => f.id === id);

/* ---------- leitura e cálculo ---------- */

export const todas = () => dados.lista(COL);
export const doSemestre = (sem) => todas().filter((m) => m.semestre === sem.id)
  .sort((a, b) => (a.criadoEm || 0) - (b.criadoEm || 0));

export const unidadeDe = (m) => (m.tipo === 'auto' ? (fonte(m.fonte)?.unidade ?? '') : (m.unidade || ''));
export const fmtValor = (m, v) => (unidadeDe(m) === 'R$' ? brl(v) : `${Number(v).toLocaleString('pt-BR', { maximumFractionDigits: 1 })}${unidadeDe(m) ? ` ${unidadeDe(m)}` : ''}`);

export function progresso(m, sem) {
  const alvo = Number(m.alvo) || 0;
  const atual = m.tipo === 'auto' ? (fonte(m.fonte)?.calc(m, sem) ?? 0) : (Number(m.atual) || 0);
  return { alvo, atual, pct: alvo > 0 ? Math.round(Math.max(0, Math.min(100, (atual / alvo) * 100))) : 0 };
}

/** Progresso por pilar (média das metas do pilar) e geral (média dos pilares que têm metas). */
export function resumo(sem) {
  const metas = doSemestre(sem).map((m) => ({ m, p: progresso(m, sem) }));
  const porPilar = PILARES.map((pl) => {
    const l = metas.filter((x) => x.m.pilar === pl.id);
    return { ...pl, metas: l, pct: l.length ? Math.round(l.reduce((s, x) => s + x.p.pct, 0) / l.length) : null };
  });
  const comMetas = porPilar.filter((x) => x.pct !== null);
  return { metas, porPilar, geral: comMetas.length ? Math.round(comMetas.reduce((s, x) => s + x.pct, 0) / comMetas.length) : 0 };
}

/* ---------- formulários ---------- */

const numBR = (v) => (v == null || v === '' || Number(v) === 0 ? '' : String(r2(v)).replace('.', ','));
const lerNum = (txt) => { const v = lerValor(txt); return Number.isFinite(v) ? r2(v) : 0; };

export function abrirMeta(meta = null, { pilarId = 'carreira', sem = semestreDe() } = {}) {
  const nova = !meta;
  const a = meta ? { ...meta } : { titulo: '', pilar: pilarId, semestre: sem.id, tipo: 'manual', fonte: 'faturamento', habitoId: '', alvo: '', atual: '', unidade: '', nota: '' };
  const habitos = H.lista();
  const f = abrirFolha(`
    <h3>${nova ? 'Nova' : 'Editar'} meta</h3>
    <p class="sub">${semestreDe(`${a.semestre.slice(0, 4)}-${a.semestre.endsWith('S1') ? '01' : '07'}-01`).nome}</p>
    <form id="f-meta" novalidate>
      <div class="fld"><label for="mt-titulo">Meta</label><input id="mt-titulo" value="${esc(a.titulo)}" placeholder="Ex.: faturar mais no segundo semestre" autocomplete="off" autofocus></div>
      <div class="fld"><span class="l">Pilar</span><div class="opcoes" id="mt-pilar">${PILARES.map((p) => `<button type="button" data-v="${p.id}" aria-pressed="${p.id === a.pilar}"><span class="dot" style="background:${p.cor};margin:0"></span>${p.nome}</button>`).join('')}</div></div>
      <div class="fld"><span class="l">Como acompanhar</span><div class="opcoes" id="mt-fonte">
        <button type="button" data-v="manual" aria-pressed="${a.tipo === 'manual'}">Eu atualizo</button>
        ${FONTES.map((x) => `<button type="button" data-v="${x.id}" aria-pressed="${a.tipo === 'auto' && a.fonte === x.id}">${x.nome}</button>`).join('')}</div>
        <small id="mt-aviso"></small></div>
      <div id="mt-habito" class="fld" hidden><span class="l">Qual hábito</span><div class="opcoes" id="mt-hab">${habitos.map((h) => `<button type="button" data-v="${h.id}" aria-pressed="${h.id === a.habitoId}">${esc(h.nome)}</button>`).join('') || '<small>Nenhum hábito criado.</small>'}</div></div>
      <div class="par">
        <div class="fld"><label for="mt-alvo">Alvo <span id="mt-un"></span></label><input id="mt-alvo" inputmode="decimal" value="${numBR(a.alvo)}" placeholder="Quanto quer alcançar" autocomplete="off"></div>
        <div class="fld" id="mt-atual-box"><label for="mt-atual">Já fiz</label><input id="mt-atual" inputmode="decimal" value="${numBR(a.atual)}" placeholder="0" autocomplete="off"></div>
      </div>
      <div class="fld" id="mt-unidade-box"><label for="mt-unidade">Unidade (opcional)</label><input id="mt-unidade" value="${esc(a.unidade || '')}" placeholder="kg, livros, R$, vezes…" autocomplete="off"></div>
      <div class="fld"><label for="mt-nota">Anotação (opcional)</label><input id="mt-nota" value="${esc(a.nota || '')}" autocomplete="off"></div>
      <div class="erro" id="mt-erro" role="alert"></div>
      ${nova ? '' : '<div class="opcoes acoes-tarefa"><button type="button" data-acao="apagar" class="perigo">Apagar meta</button></div>'}
      <div class="acts"><button type="button" class="btn sec" data-fechar>Cancelar</button><button type="submit" class="btn pri">Salvar</button></div>
    </form>`);
  const $ = (s) => f.querySelector(s);
  const escolhido = (sel) => $(sel)?.querySelector('[aria-pressed="true"]')?.dataset.v ?? null;
  const unico = (sel, aoMudar) => $(sel)?.addEventListener('click', (e) => {
    const b = e.target.closest('button[data-v]');
    if (!b) return;
    $(sel).querySelectorAll('button').forEach((x) => x.setAttribute('aria-pressed', String(x === b)));
    aoMudar?.();
  });
  const atualizar = () => {
    const fo = escolhido('#mt-fonte') || 'manual';
    const auto = fo !== 'manual';
    $('#mt-atual-box').hidden = auto;
    $('#mt-unidade-box').hidden = auto;
    $('#mt-habito').hidden = fo !== 'habito';
    $('#mt-un').textContent = auto && fonte(fo)?.unidade ? `(${fonte(fo).unidade})` : '';
    $('#mt-aviso').textContent = auto ? 'O sistema calcula sozinho a partir dos seus dados, somando o semestre inteiro.' : 'Você digita o quanto já fez e atualiza quando quiser.';
  };
  unico('#mt-pilar');
  unico('#mt-fonte', atualizar);
  unico('#mt-hab');
  atualizar();
  $('[data-fechar]').onclick = fecharFolha;

  $('#f-meta').onsubmit = async (ev) => {
    ev.preventDefault();
    const titulo = $('#mt-titulo').value.trim();
    if (!titulo) { $('#mt-erro').textContent = 'Escreva a meta.'; $('#mt-titulo').focus(); return; }
    const fo = escolhido('#mt-fonte') || 'manual';
    const auto = fo !== 'manual';
    if (fo === 'habito' && !escolhido('#mt-hab')) { $('#mt-erro').textContent = 'Escolha o hábito.'; return; }
    const alvo = lerNum($('#mt-alvo').value);
    if (!(alvo > 0)) { $('#mt-erro').textContent = 'Informe o alvo (um número maior que zero).'; $('#mt-alvo').focus(); return; }
    await dados.salva(COL, {
      ...a, titulo, pilar: escolhido('#mt-pilar') || a.pilar, tipo: auto ? 'auto' : 'manual', fonte: auto ? fo : '',
      habitoId: fo === 'habito' ? escolhido('#mt-hab') : '', alvo,
      atual: auto ? 0 : lerNum($('#mt-atual').value), unidade: auto ? '' : $('#mt-unidade').value.trim(), nota: $('#mt-nota').value.trim(),
    });
    fecharFolha();
    toast(nova ? 'Meta criada ✦' : 'Meta salva.');
  };
  f.querySelector('[data-acao="apagar"]')?.addEventListener('click', async () => {
    fecharFolha();
    if (await confirmar({ titulo: 'Apagar meta?', texto: esc(a.titulo), ok: 'Apagar', perigo: true })) { await dados.apaga(COL, a.id); toast('Meta apagada.'); }
  });
}

/** Atualização rápida do quanto já foi feito (metas manuais). */
export function abrirAtualizar(m) {
  const f = abrirFolha(`
    <h3>Atualizar meta</h3>
    <p class="sub">${esc(m.titulo)}${m.alvo ? ` · alvo: ${fmtValor(m, m.alvo)}` : ''}</p>
    <form id="f-atual" novalidate>
      <div class="fld valor-grande"><label for="at-valor">Já fiz${m.unidade ? ` (${esc(m.unidade)})` : ''}</label><input id="at-valor" inputmode="decimal" value="${numBR(m.atual)}" placeholder="0" autocomplete="off" autofocus></div>
      <div class="acts"><button type="button" class="btn sec" data-fechar>Cancelar</button><button type="submit" class="btn pri">Salvar</button></div>
    </form>`);
  f.querySelector('[data-fechar]').onclick = fecharFolha;
  f.querySelector('#f-atual').onsubmit = async (ev) => {
    ev.preventDefault();
    const nova = await dados.salva(COL, { ...m, atual: lerNum(f.querySelector('#at-valor').value) });
    fecharFolha();
    const p = progresso(nova, semestreDe(`${nova.semestre.slice(0, 4)}-${nova.semestre.endsWith('S1') ? '01' : '07'}-01`));
    toast(p.pct >= 100 ? 'Meta batida ✦' : `Atualizado: ${p.pct}% da meta.`);
  };
}

/* ---------- avisos ---------- */

avisos.registrar('metas', () => {
  const sem = semestreDe();
  const { fracao } = andamento(sem);
  if (fracao < 0.25) return [];
  return doSemestre(sem).map((m) => ({ m, p: progresso(m, sem) }))
    .filter(({ p }) => p.alvo > 0 && p.pct < 100 && p.pct < fracao * 100 - 25)
    .sort((a, b) => (a.p.pct - fracao * 100) - (b.p.pct - fracao * 100)).slice(0, 3)
    .map(({ m, p }) => ({
      id: `meta-${m.id}`, tipo: 'info', prioridade: 3, irPara: '#/rotina/metas',
      texto: `Meta <strong>${esc(m.titulo)}</strong> (${pilar(m.pilar).nome}): ${p.pct}% feito e já passou ${Math.round(fracao * 100)}% do semestre.`,
    }));
});
