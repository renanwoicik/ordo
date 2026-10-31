/* =========================================================
   Sistema · módulo Vencimentos
   Tudo o que tem data para renovar ou pagar: anuidade profissional,
   certificado digital, CNH, IPVA e licenciamento, seguros,
   contratos. O sistema avisa antes de vencer.

   Vencimento (coleção "vencimentos"):
     { nome, categoria, data: 'AAAA-MM-DD', recorrencia: 'nenhuma' | 'mensal' |
       'trimestral' | 'semestral' | 'anual', antecedencia: dias, valor, ref, nota }
   Os valores e datas são seus e ficam só no cofre.
   ========================================================= */

import { MARCA } from '../nucleo/marca.js';
import * as dados from '../nucleo/dados.js';
import * as avisos from '../nucleo/avisos.js';
import { abrirFolha, fecharFolha, toast, confirmar } from '../nucleo/ui.js';
import { esc, r2, lerValor, isoDia, deIso, diaMes, somarMeses } from '../nucleo/util.js';
import * as lembretes from '../nucleo/lembretes.js';

const COL = 'vencimentos';

export const CATEGORIAS = [
  { id: 'profissional', nome: 'Profissional', cor: 'var(--g6)' },
  { id: 'veiculo', nome: 'Veículo', cor: 'var(--g3)' },
  { id: 'seguros', nome: 'Seguros e contratos', cor: 'var(--g5)' },
  { id: 'pessoal', nome: 'Pessoal', cor: 'var(--g2)' },
];
export const categoria = (id) => CATEGORIAS.find((c) => c.id === id) ?? CATEGORIAS[3];

export const RECORRENCIAS = [['nenhuma', 'Não se repete'], ['mensal', 'Todo mês'], ['trimestral', 'A cada 3 meses'], ['semestral', 'A cada 6 meses'], ['anual', 'Todo ano']];
const MESES = { mensal: 1, trimestral: 3, semestral: 6, anual: 12 };
export const nomeRecorrencia = (id) => RECORRENCIAS.find((r) => r[0] === id)?.[1] ?? '';

/** Atalhos para cadastrar rápido (só preenchem o formulário; nada é criado sozinho). */
export const SUGESTOES = [
  ['Anuidade profissional', 'profissional', 'anual'], ['Certificado digital', 'profissional', 'anual'], ['CNH', 'pessoal', 'nenhuma'],
  ['IPVA', 'veiculo', 'anual'], ['Licenciamento do carro', 'veiculo', 'anual'], ['Seguro do carro', 'seguros', 'anual'],
  ['Seguro de vida', 'seguros', 'anual'], ['Contrato de aluguel', 'seguros', 'anual'],
];

export const todos = () => dados.lista(COL).sort((a, b) => (a.data || '9999').localeCompare(b.data || '9999'));

const diasAte = (iso, hoje = isoDia()) => Math.round((deIso(iso) - deIso(hoje)) / 86400000);
const janela = (v) => (Number(v.antecedencia) > 0 ? Number(v.antecedencia) : 30);

export function status(v, hoje = isoDia()) {
  if (!v.data) return { dias: null, tipo: '', texto: 'sem data' };
  const dias = diasAte(v.data, hoje);
  if (dias < 0) return { dias, tipo: 'neg', texto: `venceu há ${-dias} ${dias === -1 ? 'dia' : 'dias'}` };
  if (dias === 0) return { dias, tipo: 'neg', texto: 'vence hoje' };
  if (dias <= janela(v)) return { dias, tipo: 'mid', texto: `vence em ${dias} ${dias === 1 ? 'dia' : 'dias'}` };
  return { dias, tipo: 'pos', texto: `em ${dias} dias` };
}

/** Data + n meses, mantendo o dia (31 vira o último dia do mês, quando precisar). */
function somarMesesData(iso, n) {
  const ym = somarMeses(iso.slice(0, 7), n);
  const [a, m] = ym.split('-').map(Number);
  const ultimo = new Date(a, m, 0).getDate();
  return `${ym}-${String(Math.min(Number(iso.slice(8)), ultimo)).padStart(2, '0')}`;
}

/** Renovou: passa a data para o próximo vencimento. Se não se repete, abre o formulário para a data nova. */
export async function renovar(v) {
  const passo = MESES[v.recorrencia];
  if (!passo) { abrirVencimento(v, { renovando: true }); return; }
  let data = v.data;
  const hoje = isoDia();
  do { data = somarMesesData(data, passo); } while (data <= hoje);
  await dados.salva(COL, { ...v, data });
  toast(`Renovado ✦ Próximo vencimento: ${diaMes(data)}/${data.slice(0, 4)}.`);
}

/* ---------- lembretes no Calendário do iPhone ---------- */

const RRULE = { mensal: 'FREQ=MONTHLY', trimestral: 'FREQ=MONTHLY;INTERVAL=3', semestral: 'FREQ=MONTHLY;INTERVAL=6', anual: 'FREQ=YEARLY' };

/** Evento de calendário do vencimento: às 9h, avisando 7 dias antes (ou o prazo escolhido), na véspera e no dia. */
export function eventoDoVencimento(v) {
  const ante = janela(v);
  const alarmes = [...new Set([`-P${ante}D`, ...(ante > 7 ? ['-P7D'] : []), '-P1D', 'PT0M'])];
  return lembretes.evento({
    uid: `${MARCA.id}-venc-${v.id}@${MARCA.id}`, titulo: `Vence: ${v.nome}`, descricao: v.nota || '', inicio: `${v.data}T09:00`, duracao: 30,
    regra: RRULE[v.recorrencia] || '', alarmes,
  });
}

/** Passa vencimentos para o Calendário (um ou todos). Devolve quantos entraram. */
export async function enviarParaCalendario(lista = todos()) {
  // vencimento que não se repete e já passou não precisa de lembrete
  const validos = lista.filter((v) => v.data && (RRULE[v.recorrencia] || v.data >= isoDia()));
  if (!validos.length) return 0;
  await lembretes.entregar(lembretes.calendario(validos.map(eventoDoVencimento)), validos.length === 1 ? `vencimento-${validos[0].nome.toLowerCase().replace(/[^a-z0-9]+/gi, '-')}.ics` : 'vencimentos.ics');
  return validos.length;
}

/* ---------- formulário ---------- */

const numBR = (v) => (v == null || v === '' || Number(v) === 0 ? '' : r2(v).toFixed(2).replace('.', ','));

export function abrirVencimento(venc = null, { prefill = {}, renovando = false } = {}) {
  const novo = !venc;
  const a = venc ? { ...venc } : { nome: '', categoria: 'profissional', data: '', recorrencia: 'anual', antecedencia: 30, valor: '', ref: '', nota: '', ...prefill };
  const f = abrirFolha(`
    <h3>${renovando ? 'Nova data de' : novo ? 'Novo' : 'Editar'} vencimento</h3>
    ${renovando ? `<p class="sub"><strong>${esc(a.nome)}</strong> não se repete sozinho: escolha a data do próximo vencimento.</p>` : ''}
    <form id="f-venc" novalidate>
      <div class="fld"><label for="v-nome">O que vence</label><input id="v-nome" value="${esc(a.nome)}" placeholder="Ex.: anuidade profissional" autocomplete="off" ${renovando ? '' : 'autofocus'}></div>
      <div class="fld"><span class="l">Categoria</span><div class="opcoes" id="v-cat">${CATEGORIAS.map((c) => `<button type="button" data-v="${c.id}" aria-pressed="${c.id === a.categoria}"><span class="dot" style="background:${c.cor};margin:0"></span>${c.nome}</button>`).join('')}</div></div>
      <div class="par">
        <div class="fld"><label for="v-data">Vence em</label><input id="v-data" type="date" value="${esc(a.data || '')}" ${renovando ? 'autofocus' : ''}></div>
        <div class="fld"><label for="v-ante">Avisar com (dias)</label><input id="v-ante" type="number" min="1" inputmode="numeric" value="${esc(a.antecedencia || 30)}"></div>
      </div>
      <div class="fld"><span class="l">Repete</span><div class="opcoes" id="v-rec">${RECORRENCIAS.map(([id, n]) => `<button type="button" data-v="${id}" aria-pressed="${id === a.recorrencia}">${n}</button>`).join('')}</div>
        <small>Quando você toca em “renovei”, a data pula sozinha para o próximo vencimento.</small></div>
      <div class="par">
        <div class="fld"><label for="v-valor">Valor (opcional)</label><input id="v-valor" inputmode="decimal" value="${numBR(a.valor)}" placeholder="R$ 0,00" autocomplete="off"></div>
        <div class="fld"><label for="v-ref">Link (opcional)</label><input id="v-ref" type="url" inputmode="url" value="${esc(a.ref || '')}" placeholder="https://…" autocomplete="off"></div>
      </div>
      <div class="fld"><label for="v-nota">Anotação (opcional)</label><input id="v-nota" value="${esc(a.nota || '')}" autocomplete="off"></div>
      <div class="erro" id="v-erro" role="alert"></div>
      ${novo ? '' : '<div class="opcoes acoes-tarefa"><button type="button" data-acao="calendario">Lembrete no Calendário</button><button type="button" data-acao="apagar" class="perigo">Apagar</button></div>'}
      <div class="acts"><button type="button" class="btn sec" data-fechar>Cancelar</button><button type="submit" class="btn pri">Salvar</button></div>
    </form>`);
  const $ = (s) => f.querySelector(s);
  const unico = (sel) => $(sel).addEventListener('click', (e) => {
    const b = e.target.closest('button[data-v]');
    if (b) $(sel).querySelectorAll('button').forEach((x) => x.setAttribute('aria-pressed', String(x === b)));
  });
  unico('#v-cat'); unico('#v-rec');
  $('[data-fechar]').onclick = fecharFolha;
  $('#f-venc').onsubmit = async (ev) => {
    ev.preventDefault();
    const nome = $('#v-nome').value.trim();
    if (!nome) { $('#v-erro').textContent = 'Escreva o que vence.'; $('#v-nome').focus(); return; }
    if (!$('#v-data').value) { $('#v-erro').textContent = 'Escolha a data do vencimento.'; $('#v-data').focus(); return; }
    const v = lerValor($('#v-valor').value);
    await dados.salva(COL, {
      ...a, nome, categoria: $('#v-cat [aria-pressed="true"]')?.dataset.v ?? a.categoria, data: $('#v-data').value,
      recorrencia: $('#v-rec [aria-pressed="true"]')?.dataset.v ?? 'nenhuma', antecedencia: Math.max(1, Math.round(Number($('#v-ante').value) || 30)),
      valor: Number.isFinite(v) && v > 0 ? r2(v) : '', ref: $('#v-ref').value.trim(), nota: $('#v-nota').value.trim(),
    });
    fecharFolha();
    toast(novo ? 'Vencimento cadastrado ✦' : 'Vencimento salvo.');
  };
  f.querySelector('[data-acao="calendario"]')?.addEventListener('click', async () => {
    if (!(await enviarParaCalendario([a]))) toast('Este vencimento não se repete e a data já passou.');
  });
  f.querySelector('[data-acao="apagar"]')?.addEventListener('click', async () => {
    fecharFolha();
    if (await confirmar({ titulo: 'Apagar vencimento?', texto: esc(a.nome), ok: 'Apagar', perigo: true })) { await dados.apaga(COL, a.id); toast('Vencimento apagado.'); }
  });
}

/* ---------- avisos ---------- */

avisos.registrar('vencimentos', () => todos().flatMap((v) => {
  const s = status(v);
  if (s.dias == null || s.dias > janela(v)) return [];
  return [{
    id: `venc-${v.id}`, tipo: 'warn', prioridade: s.dias < 0 ? 7 : s.dias <= 7 ? 6 : 5, irPara: '#/mais/vencimentos',
    texto: `<strong>${esc(v.nome)}</strong>: ${s.texto} (${diaMes(v.data)}).`,
  }];
}));
