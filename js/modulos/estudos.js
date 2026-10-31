/* =========================================================
   Sistema · módulo Estudos
   Cursos, artigos científicos, livros e temas para pesquisar,
   num quadro de três colunas: Quero estudar → Estudando →
   Concluído. Sem meta de estudo: é para não perder nada.

   Item (coleção "estudos"):
     { titulo, tipo: 'curso' | 'artigo' | 'livro' | 'tema',
       status: 'quero' | 'estudando' | 'concluido',
       autor, ref (link), feito, total (aulas do curso ou páginas do livro),
       limite: 'AAAA-MM-DD' (data limite do curso), valor (curso pago),
       nota (texto livre: links e trechos), concluidoEm }
   Ligação: "lançar gasto" abre o gasto no CNPJ, categoria Educação.
   ========================================================= */

import * as dados from '../nucleo/dados.js';
import * as avisos from '../nucleo/avisos.js';
import { abrirFolha, fecharFolha, toast, confirmar } from '../nucleo/ui.js';
import { esc, r2, lerValor, isoDia, deIso, diaMes } from '../nucleo/util.js';
import * as S from './gastos.js';

const COL = 'estudos';

export const TIPOS = [
  { id: 'curso', nome: 'Curso', plural: 'Cursos', cor: 'var(--g6)', unidade: 'aulas' },
  { id: 'artigo', nome: 'Artigo', plural: 'Artigos', cor: 'var(--g5)' },
  { id: 'livro', nome: 'Livro', plural: 'Livros', cor: 'var(--g3)', unidade: 'páginas' },
  { id: 'tema', nome: 'Tema para pesquisar', plural: 'Temas', cor: 'var(--g7)' },
];
export const tipo = (id) => TIPOS.find((t) => t.id === id) ?? TIPOS[3];

export const STATUS = [
  { id: 'quero', nome: 'Quero estudar' },
  { id: 'estudando', nome: 'Estudando' },
  { id: 'concluido', nome: 'Concluído' },
];
export const nomeStatus = (id) => STATUS.find((s) => s.id === id)?.nome ?? id;

export const todos = () => dados.lista(COL).sort((a, b) => (a.criadoEm || 0) - (b.criadoEm || 0));
export const doStatus = (st) => todos().filter((e) => e.status === st)
  .sort((a, b) => (st === 'concluido' ? (b.concluidoEm || '').localeCompare(a.concluidoEm || '') : (a.limite || '9999').localeCompare(b.limite || '9999') || (a.criadoEm || 0) - (b.criadoEm || 0)));

/** Progresso do item, de 0 a 100, ou null quando não há total. */
export const pct = (e) => (Number(e.total) > 0 ? Math.round(Math.max(0, Math.min(100, ((Number(e.feito) || 0) / Number(e.total)) * 100))) : null);
const diasAte = (iso, hoje = isoDia()) => Math.round((deIso(iso) - deIso(hoje)) / 86400000);

/** Passa o item para a próxima coluna. */
export async function avancar(e) {
  const prox = e.status === 'quero' ? 'estudando' : 'concluido';
  if (e.status === 'concluido') return;
  const concluido = prox === 'concluido';
  await dados.salva(COL, { ...e, status: prox, ...(concluido ? { concluidoEm: isoDia(), feito: Number(e.total) > 0 ? Number(e.total) : e.feito } : {}) });
  toast(concluido ? 'Concluído ✦' : 'Agora você está estudando ✦');
}

/** Soma uma aula (ou o que for) ao progresso; ao chegar no total, conclui. */
export async function somarProgresso(e, n = 1) {
  const feito = Math.min(Number(e.total) || Infinity, (Number(e.feito) || 0) + n);
  const acabou = Number(e.total) > 0 && feito >= Number(e.total);
  await dados.salva(COL, { ...e, feito, status: acabou ? 'concluido' : (e.status === 'quero' ? 'estudando' : e.status), ...(acabou ? { concluidoEm: isoDia() } : {}) });
  toast(acabou ? 'Concluído ✦' : `${feito} de ${e.total}`);
}

/** Abre o gasto de um curso pago, já no CNPJ e na categoria Educação. */
export function lancarGasto(e) {
  S.abrirGasto(null, { prefill: { desc: e.titulo, valor: Number(e.valor) || '', conta: 'CNPJ', cat: 'Educação' } });
}

/* ---------- formulário ---------- */

const numBR = (v) => (v == null || v === '' || Number(v) === 0 ? '' : String(r2(v)).replace('.', ','));

export function abrirEstudo(item = null, { prefill = {} } = {}) {
  const novo = !item;
  const a = item ? { ...item } : { titulo: '', tipo: 'curso', status: 'quero', autor: '', ref: '', feito: '', total: '', limite: '', valor: '', nota: '', ...prefill };
  const f = abrirFolha(`
    <h3>${novo ? 'Novo' : 'Editar'} estudo</h3>
    <form id="f-estudo" novalidate>
      <div class="fld"><label for="e-titulo">Título</label><input id="e-titulo" value="${esc(a.titulo)}" placeholder="Ex.: curso de atualização" autocomplete="off" autofocus></div>
      <div class="fld"><span class="l">Tipo</span><div class="opcoes" id="e-tipo">${TIPOS.map((t) => `<button type="button" data-v="${t.id}" aria-pressed="${t.id === a.tipo}"><span class="dot" style="background:${t.cor};margin:0"></span>${t.nome}</button>`).join('')}</div></div>
      <div class="fld"><span class="l">Em que ponto está</span><div class="opcoes" id="e-status">${STATUS.map((s) => `<button type="button" data-v="${s.id}" aria-pressed="${s.id === a.status}">${s.nome}</button>`).join('')}</div></div>
      <div class="fld"><label for="e-autor">Autor ou instituição (opcional)</label><input id="e-autor" value="${esc(a.autor || '')}" autocomplete="off"></div>
      <div class="fld"><label for="e-ref">Link (opcional)</label><input id="e-ref" type="url" inputmode="url" value="${esc(a.ref || '')}" placeholder="https://…" autocomplete="off"></div>
      <div id="e-prog" class="par">
        <div class="fld"><label for="e-feito" id="e-feito-l">Já fiz</label><input id="e-feito" type="number" min="0" inputmode="numeric" value="${esc(a.feito ?? '')}"></div>
        <div class="fld"><label for="e-total" id="e-total-l">Total</label><input id="e-total" type="number" min="0" inputmode="numeric" value="${esc(a.total ?? '')}"></div>
      </div>
      <div id="e-curso" class="par">
        <div class="fld"><label for="e-limite">Data limite (opcional)</label><input id="e-limite" type="date" value="${esc(a.limite || '')}"></div>
        <div class="fld"><label for="e-valor">Valor, se for pago</label><input id="e-valor" inputmode="decimal" value="${numBR(a.valor)}" placeholder="R$ 0,00" autocomplete="off"></div>
      </div>
      <div class="fld"><label for="e-nota">Anotações</label><textarea id="e-nota" rows="4" placeholder="Links, trechos, o que aprendeu…">${esc(a.nota || '')}</textarea></div>
      <div class="erro" id="e-erro" role="alert"></div>
      <div class="opcoes acoes-tarefa">
        <button type="button" data-acao="gasto" id="e-gasto" hidden>Lançar gasto no CNPJ</button>
        ${novo ? '' : '<button type="button" data-acao="apagar" class="perigo">Apagar</button>'}
      </div>
      <div class="acts"><button type="button" class="btn sec" data-fechar>Cancelar</button><button type="submit" class="btn pri">Salvar</button></div>
    </form>`);
  const $ = (s) => f.querySelector(s);
  const escolhido = (sel) => $(sel).querySelector('[aria-pressed="true"]')?.dataset.v;
  const unico = (sel, aoMudar) => $(sel).addEventListener('click', (e) => {
    const b = e.target.closest('button[data-v]');
    if (!b) return;
    $(sel).querySelectorAll('button').forEach((x) => x.setAttribute('aria-pressed', String(x === b)));
    aoMudar?.();
  });
  const atualizar = () => {
    const t = tipo(escolhido('#e-tipo'));
    $('#e-prog').hidden = !t.unidade;
    $('#e-feito-l').textContent = t.unidade === 'páginas' ? 'Páginas lidas' : 'Aulas feitas';
    $('#e-total-l').textContent = t.unidade === 'páginas' ? 'Total de páginas' : 'Total de aulas';
    $('#e-curso').hidden = t.id !== 'curso';
    $('#e-gasto').hidden = !(t.id === 'curso' && lerValor($('#e-valor').value) > 0);
  };
  unico('#e-tipo', atualizar); unico('#e-status');
  $('#e-valor').addEventListener('input', atualizar);
  atualizar();
  $('[data-fechar]').onclick = fecharFolha;

  const lerNum = (sel) => { const v = Number($(sel).value); return Number.isFinite(v) && v > 0 ? Math.round(v) : ''; };
  const montar = () => {
    const t = tipo(escolhido('#e-tipo'));
    const status = escolhido('#e-status');
    const v = lerValor($('#e-valor').value);
    return {
      ...a, titulo: $('#e-titulo').value.trim(), tipo: t.id, status, autor: $('#e-autor').value.trim(), ref: $('#e-ref').value.trim(),
      feito: t.unidade ? lerNum('#e-feito') : '', total: t.unidade ? lerNum('#e-total') : '',
      limite: t.id === 'curso' ? $('#e-limite').value : '', valor: t.id === 'curso' && Number.isFinite(v) && v > 0 ? r2(v) : '',
      nota: $('#e-nota').value.trim(),
      concluidoEm: status === 'concluido' ? (a.concluidoEm || isoDia()) : null,
    };
  };
  $('#f-estudo').onsubmit = async (ev) => {
    ev.preventDefault();
    const e = montar();
    if (!e.titulo) { $('#e-erro').textContent = 'Escreva o título.'; $('#e-titulo').focus(); return; }
    await dados.salva(COL, e);
    fecharFolha();
    toast(novo ? 'Estudo guardado ✦' : 'Estudo salvo.');
  };
  f.querySelector('[data-acao="gasto"]').addEventListener('click', () => { const e = montar(); fecharFolha(); setTimeout(() => lancarGasto(e), 260); });
  f.querySelector('[data-acao="apagar"]')?.addEventListener('click', async () => {
    fecharFolha();
    if (await confirmar({ titulo: 'Apagar estudo?', texto: esc(a.titulo), ok: 'Apagar', perigo: true })) { await dados.apaga(COL, a.id); toast('Estudo apagado.'); }
  });
}

/* ---------- avisos: curso com data limite chegando ---------- */

avisos.registrar('estudos', () => todos().filter((e) => e.limite && e.status !== 'concluido').flatMap((e) => {
  const dias = diasAte(e.limite);
  if (dias > 14) return [];
  return [{
    id: `estudo-${e.id}`, tipo: 'warn', prioridade: dias < 0 ? 6 : 4, irPara: '#/mais/estudos',
    texto: `Curso <strong>${esc(e.titulo)}</strong>: ${dias < 0 ? `a data limite passou em ${diaMes(e.limite)}` : dias === 0 ? 'a data limite é hoje' : `data limite em ${dias} ${dias === 1 ? 'dia' : 'dias'} (${diaMes(e.limite)})`}${pct(e) != null ? `, ${pct(e)}% feito` : ''}.`,
  }];
}));

