/* =========================================================
   Sistema · módulo Honorários e salário
   O dinheiro do trabalho conta no mês em que foi RECEBIDO.
   O êxito fica só como % no contrato, sem previsão nos totais:
   entra quando você registra o valor recebido.

   Contrato (coleção "honorarios"):
     { clienteId, casoId, descricao, exitoPct,
       parcelas: [{ id, nome, venc, valor, pago, pagoEm }],
       exitos: [{ id, data, valor }] }
   Salário: config "salario" { valor, dia } e, por mês,
     config "salario-AAAA-MM" { recebido, valor, em }.
     O valor fica guardado no mês: mudar o salário não altera o passado.

   Os avisos não mostram valores: dinheiro não aparece no painel Hoje.
   ========================================================= */

import * as dados from '../nucleo/dados.js';
import * as avisos from '../nucleo/avisos.js';
import { abrirFolha, fecharFolha, toast, confirmar, icone } from '../nucleo/ui.js';
import { esc, brl, r2, lerValor, isoDia, isoMes, somarMeses, diasNoMes, diaMes, novoId } from '../nucleo/util.js';
import * as E from './entradas.js';
import * as K from './clientes.js';

const COL = 'honorarios';

const numBR = (v) => (v == null || v === '' || Number(v) === 0 ? '' : r2(v).toFixed(2).replace('.', ',').replace(/,00$/, ''));
const soma = (xs) => r2(xs.reduce((s, x) => s + (Number(x.valor) || 0), 0));
const dataBR = (iso) => (iso ? iso.split('-').reverse().join('/') : '');

/* =========================================================
   LEITURA E CÁLCULOS
   ========================================================= */

export const contratos = () => dados.lista(COL).sort((a, b) => (b.criadoEm || 0) - (a.criadoEm || 0));
export const pega = (id) => dados.pega(COL, id);
export const doCliente = (id) => contratos().filter((h) => h.clienteId === id);

/** Todas as parcelas, cada uma com o seu contrato: [{ h, p }]. */
export const parcelas = () => contratos().flatMap((h) => (h.parcelas || []).map((p) => ({ h, p })));
export const emAberto = () => parcelas().filter(({ p }) => !p.pago).sort((a, b) => a.p.venc.localeCompare(b.p.venc));
export const atrasadas = (hoje = isoDia()) => emAberto().filter(({ p }) => p.venc < hoje);

/** Parcelas para mostrar num mês: vencem nele ou foram pagas nele. */
export const doMes = (ym) => parcelas().filter(({ p }) => (p.pago ? (p.pagoEm || '').slice(0, 7) === ym : p.venc.slice(0, 7) === ym))
  .sort((a, b) => a.p.venc.localeCompare(b.p.venc));

export const pagoDe = (h) => soma((h.parcelas || []).filter((p) => p.pago));
export const exitoDe = (h) => soma(h.exitos || []);
export const abertoDe = (h) => soma((h.parcelas || []).filter((p) => !p.pago));
export const nomeCliente = (h) => K.pega(h.clienteId)?.nome ?? 'Sem cliente';

/* ---------- salário ---------- */

export const salario = () => dados.config('salario') ?? { valor: 0, dia: 5 };
export const salarioDoMes = (ym) => dados.config(`salario-${ym}`);

/* ---------- tudo que entrou ---------- */

/** Cada dinheiro recebido: [{ data, valor, tipo }]. As entradas avulsas vêm junto. */
export function movimentos() {
  const out = [];
  for (const { p } of parcelas()) if (p.pago && p.pagoEm) out.push({ data: p.pagoEm, valor: Number(p.valor) || 0, tipo: 'honorario' });
  for (const h of contratos()) for (const x of h.exitos || []) out.push({ data: x.data, valor: Number(x.valor) || 0, tipo: 'exito' });
  for (const c of dados.lista('config')) if (c.id.startsWith('salario-') && c.recebido) out.push({ data: c.em || `${c.id.slice(8)}-01`, valor: Number(c.valor) || 0, tipo: 'salario' });
  for (const e of E.todas()) out.push({ data: e.data, valor: Number(e.valor) || 0, tipo: 'outra' });
  return out;
}

/** O que entrou num mês, por origem. */
export function doMesResumo(ym) {
  const m = movimentos().filter((x) => (x.data || '').slice(0, 7) === ym);
  const de = (t) => soma(m.filter((x) => x.tipo === t));
  const honorarios = r2(de('honorario') + de('exito'));
  return { salario: de('salario'), parcelas: de('honorario'), exito: de('exito'), honorarios, outras: de('outra'), total: soma(m) };
}
export const totalMes = (ym) => doMesResumo(ym).total;
export const entrouEntre = (de, ate) => movimentos().filter((x) => x.data >= de && x.data <= ate);

/* =========================================================
   AVISOS (sem valores)
   ========================================================= */

avisos.registrar('honorarios', () => {
  const hoje = isoDia();
  const lista = atrasadas(hoje).map(({ h, p }) => ({
    id: `parcela-${h.id}-${p.id}`, tipo: 'warn', prioridade: 5, irPara: '#/dinheiro/entradas',
    texto: `Parcela em atraso desde ${diaMes(p.venc)}: <strong>${esc(nomeCliente(h))}</strong>.`,
  }));
  const ym = isoMes();
  const s = salario();
  if (Number(s.valor) > 0 && !salarioDoMes(ym)?.recebido && Number(hoje.slice(8)) >= Math.min(Number(s.dia) || 1, diasNoMes(ym))) {
    lista.push({ id: `salario-${ym}`, tipo: 'info', prioridade: 2, irPara: '#/dinheiro/entradas', texto: 'Marque o <strong>salário</strong> deste mês quando cair.' });
  }
  return lista;
});

/* =========================================================
   SALÁRIO
   ========================================================= */

export function abrirConfigSalario() {
  const s = salario();
  const f = abrirFolha(`
    <h3>Salário fixo</h3>
    <p class="sub">Fica só no seu cofre. Mudar aqui vale daqui em diante; os meses já marcados não mudam.</p>
    <form id="f-sal" novalidate>
      <div class="par">
        <div class="fld"><label for="s-valor">Valor</label><input id="s-valor" inputmode="decimal" value="${numBR(s.valor)}" placeholder="R$ 0,00" autocomplete="off" autofocus></div>
        <div class="fld"><label for="s-dia">Dia em que costuma cair</label><input id="s-dia" type="number" min="1" max="31" inputmode="numeric" value="${esc(s.dia)}"></div>
      </div>
      <div class="acts"><button type="button" class="btn sec" data-fechar>Cancelar</button><button type="submit" class="btn pri">Salvar</button></div>
    </form>`);
  f.querySelector('[data-fechar]').onclick = fecharFolha;
  f.querySelector('#f-sal').onsubmit = async (ev) => {
    ev.preventDefault();
    const v = lerValor(f.querySelector('#s-valor').value);
    const dia = Math.max(1, Math.min(31, Number(f.querySelector('#s-dia').value) || 5));
    await dados.salvaConfig('salario', { valor: v > 0 ? r2(v) : 0, dia });
    fecharFolha();
    toast('Salário salvo ✦');
  };
}

/** Marca (com valor e data) ou desmarca o salário de um mês. */
export function abrirSalarioDoMes(ym) {
  const atual = salarioDoMes(ym);
  const dia = String(Math.min(Number(salario().dia) || 5, diasNoMes(ym))).padStart(2, '0');
  const f = abrirFolha(`
    <h3>Salário do mês</h3>
    <form id="f-salm" novalidate>
      <div class="par">
        <div class="fld"><label for="sm-valor">Valor recebido</label><input id="sm-valor" inputmode="decimal" value="${numBR(atual?.valor ?? salario().valor)}" placeholder="R$ 0,00" autocomplete="off"></div>
        <div class="fld"><label for="sm-data">Data</label><input id="sm-data" type="date" value="${esc(atual?.em || `${ym}-${dia}`)}"></div>
      </div>
      <div class="erro" id="sm-erro" role="alert"></div>
      ${atual?.recebido ? '<div class="opcoes acoes-tarefa"><button type="button" data-desfazer class="perigo">Ainda não recebi</button></div>' : ''}
      <div class="acts"><button type="button" class="btn sec" data-fechar>Cancelar</button><button type="submit" class="btn pri">Recebi</button></div>
    </form>`);
  const $ = (s) => f.querySelector(s);
  $('[data-fechar]').onclick = fecharFolha;
  $('#f-salm').onsubmit = async (ev) => {
    ev.preventDefault();
    const v = lerValor($('#sm-valor').value);
    const em = $('#sm-data').value;
    if (!(v > 0) || !em) { $('#sm-erro').textContent = 'Preencha o valor e a data.'; return; }
    await dados.salvaConfig(`salario-${ym}`, { recebido: true, valor: r2(v), em });
    fecharFolha();
    toast('Salário marcado ✦');
  };
  $('[data-desfazer]')?.addEventListener('click', async () => {
    await dados.salvaConfig(`salario-${ym}`, { recebido: false, valor: 0, em: '' });
    fecharFolha();
    toast('Salário desmarcado.');
  });
}

/* =========================================================
   CONTRATO: novo
   ========================================================= */

function vencimentoDe(primeiro, i) {
  const ym = somarMeses(primeiro.slice(0, 7), i);
  return `${ym}-${String(Math.min(Number(primeiro.slice(8)), diasNoMes(ym))).padStart(2, '0')}`;
}

export function abrirNovoHonorario({ clienteId = '', casoId = '' } = {}) {
  if (!K.todos().length) { toast('Cadastre um cliente primeiro.'); return; }
  const opcoesCaso = (cli, atual) => `<option value="">Sem caso</option>${K.casosDe(cli).map((k) => `<option value="${k.id}" ${k.id === atual ? 'selected' : ''}>${esc(k.titulo)}</option>`).join('')}`;
  const f = abrirFolha(`
    <h3>Novo contrato de honorários</h3>
    <form id="f-hon" novalidate>
      <div class="fld"><label for="h-cli">Cliente</label><select id="h-cli"><option value="">Escolha</option>${K.todos().map((c) => `<option value="${c.id}" ${c.id === clienteId ? 'selected' : ''}>${esc(c.nome)}</option>`).join('')}</select></div>
      <div class="fld"><label for="h-caso">Caso (opcional)</label><select id="h-caso">${opcoesCaso(clienteId, casoId)}</select></div>
      <div class="par">
        <div class="fld"><label for="h-ent">Entrada</label><input id="h-ent" inputmode="decimal" placeholder="R$ 0,00" autocomplete="off"></div>
        <div class="fld"><label for="h-entd">Data da entrada</label><input id="h-entd" type="date" value="${isoDia()}"></div>
      </div>
      <label class="chk" style="margin-bottom:12px"><input type="checkbox" id="h-entp"> Entrada já recebida</label>
      <div class="par">
        <div class="fld"><label for="h-qtd">Parcelas (quantas)</label><input id="h-qtd" type="number" min="0" max="120" inputmode="numeric" placeholder="0"></div>
        <div class="fld"><label for="h-val">Valor de cada uma</label><input id="h-val" inputmode="decimal" placeholder="R$ 0,00" autocomplete="off"></div>
      </div>
      <div class="fld"><label for="h-pri">1º vencimento</label><input id="h-pri" type="date"></div>
      <div class="fld"><label for="h-pct">Êxito (%), se houver</label><input id="h-pct" inputmode="decimal" placeholder="Ex.: 20" autocomplete="off"><small>Fica só como referência. O valor entra quando você registrar o recebimento.</small></div>
      <div class="erro" id="h-erro" role="alert"></div>
      <div class="acts"><button type="button" class="btn sec" data-fechar>Cancelar</button><button type="submit" class="btn pri">Salvar</button></div>
    </form>`);
  const $ = (s) => f.querySelector(s);
  $('[data-fechar]').onclick = fecharFolha;
  $('#h-cli').addEventListener('change', () => { $('#h-caso').innerHTML = opcoesCaso($('#h-cli').value, ''); });
  $('#f-hon').onsubmit = async (ev) => {
    ev.preventDefault();
    const cli = $('#h-cli').value;
    const ent = lerValor($('#h-ent').value), entd = $('#h-entd').value, entp = $('#h-entp').checked;
    const qtd = Math.round(Number($('#h-qtd').value) || 0), val = lerValor($('#h-val').value), pri = $('#h-pri').value;
    const pctTxt = $('#h-pct').value.trim();
    const pct = pctTxt ? lerValor(pctTxt) : 0;
    const temEnt = ent > 0;
    const erro = !cli ? 'Escolha o cliente.'
      : (temEnt && !entd) ? 'Escolha a data da entrada.'
      : (qtd < 0 || qtd > 120) ? 'As parcelas vão de 0 a 120.'
      : (qtd > 0 && !(val > 0)) ? 'Digite o valor de cada parcela.'
      : (qtd > 0 && !pri) ? 'Escolha o 1º vencimento.'
      : (pctTxt && !(pct > 0 && pct <= 100)) ? 'O êxito vai de 0 a 100%.'
      : (!temEnt && !qtd && !pct) ? 'Preencha a entrada, as parcelas ou o êxito.' : '';
    if (erro) { $('#h-erro').textContent = erro; return; }
    const lista = [];
    if (temEnt) lista.push({ id: novoId(), nome: 'Entrada', venc: entd, valor: r2(ent), pago: entp, pagoEm: entp ? entd : '' });
    for (let i = 0; i < qtd; i++) lista.push({ id: novoId(), nome: `Parcela ${i + 1} de ${qtd}`, venc: vencimentoDe(pri, i), valor: r2(val), pago: false, pagoEm: '' });
    const h = await dados.salva(COL, { clienteId: cli, casoId: $('#h-caso').value, exitoPct: pct > 0 ? r2(pct) : 0, parcelas: lista, exitos: [] });
    fecharFolha();
    toast('Contrato salvo ✦');
    setTimeout(() => abrirHonorario(h.id), 260);
  };
}

/* =========================================================
   CONTRATO: detalhe
   ========================================================= */

const reabrir = (id) => { fecharFolha(); setTimeout(() => abrirHonorario(id), 260); };

/** Marca ou desmarca uma parcela como recebida hoje. */
export async function alternarParcela(hId, pId) {
  const h = pega(hId);
  if (!h) return;
  const lista = (h.parcelas || []).map((p) => (p.id === pId ? { ...p, pago: !p.pago, pagoEm: p.pago ? '' : isoDia() } : p));
  await dados.salva(COL, { ...h, parcelas: lista });
  toast(lista.find((p) => p.id === pId)?.pago ? 'Parcela recebida ✦' : 'Parcela reaberta.');
}

function abrirParcela(hId, pId) {
  const h = pega(hId);
  const nova = !pId;
  const p = nova ? { id: novoId(), nome: 'Parcela', venc: isoDia(), valor: '', pago: false, pagoEm: '' } : h.parcelas.find((x) => x.id === pId);
  const f = abrirFolha(`
    <h3>${esc(p.nome)}</h3>
    <form id="f-par" novalidate>
      <div class="par">
        <div class="fld"><label for="pa-val">Valor</label><input id="pa-val" inputmode="decimal" value="${numBR(p.valor)}" placeholder="R$ 0,00" autocomplete="off"></div>
        <div class="fld"><label for="pa-venc">Vencimento</label><input id="pa-venc" type="date" value="${esc(p.venc)}"></div>
      </div>
      <label class="chk" style="margin-bottom:12px"><input type="checkbox" id="pa-pago" ${p.pago ? 'checked' : ''}> Recebida</label>
      <div class="fld" id="pa-em-c"><label for="pa-em">Data do recebimento</label><input id="pa-em" type="date" value="${esc(p.pagoEm || isoDia())}"></div>
      <div class="erro" id="pa-erro" role="alert"></div>
      ${nova ? '' : '<div class="opcoes acoes-tarefa"><button type="button" data-apagar class="perigo">Apagar parcela</button></div>'}
      <div class="acts"><button type="button" class="btn sec" data-fechar>Cancelar</button><button type="submit" class="btn pri">Salvar</button></div>
    </form>`);
  const $ = (s) => f.querySelector(s);
  const ajustar = () => { $('#pa-em-c').hidden = !$('#pa-pago').checked; };
  $('#pa-pago').addEventListener('change', ajustar);
  ajustar();
  $('[data-fechar]').onclick = () => reabrir(hId);
  $('#f-par').onsubmit = async (ev) => {
    ev.preventDefault();
    const v = lerValor($('#pa-val').value), venc = $('#pa-venc').value, pago = $('#pa-pago').checked, em = $('#pa-em').value;
    if (!(v > 0) || !venc || (pago && !em)) { $('#pa-erro').textContent = 'Preencha o valor e as datas.'; return; }
    const item = { ...p, valor: r2(v), venc, pago, pagoEm: pago ? em : '' };
    const atual = pega(hId);
    const lista = nova ? [...(atual.parcelas || []), item] : atual.parcelas.map((x) => (x.id === p.id ? item : x));
    await dados.salva(COL, { ...atual, parcelas: lista });
    reabrir(hId);
  };
  $('[data-apagar]')?.addEventListener('click', async () => {
    const atual = pega(hId);
    await dados.salva(COL, { ...atual, parcelas: atual.parcelas.filter((x) => x.id !== p.id) });
    toast('Parcela apagada.');
    reabrir(hId);
  });
}

function abrirExito(hId, xId) {
  const h = pega(hId);
  const nova = !xId;
  const x = nova ? { id: novoId(), data: isoDia(), valor: '' } : h.exitos.find((e) => e.id === xId);
  const f = abrirFolha(`
    <h3>Êxito recebido</h3>
    <form id="f-exi" novalidate>
      <div class="par">
        <div class="fld"><label for="ex-val">Valor recebido</label><input id="ex-val" inputmode="decimal" value="${numBR(x.valor)}" placeholder="R$ 0,00" autocomplete="off"></div>
        <div class="fld"><label for="ex-data">Data</label><input id="ex-data" type="date" value="${esc(x.data)}"></div>
      </div>
      <div class="erro" id="ex-erro" role="alert"></div>
      ${nova ? '' : '<div class="opcoes acoes-tarefa"><button type="button" data-apagar class="perigo">Apagar</button></div>'}
      <div class="acts"><button type="button" class="btn sec" data-fechar>Cancelar</button><button type="submit" class="btn pri">Salvar</button></div>
    </form>`);
  const $ = (s) => f.querySelector(s);
  $('[data-fechar]').onclick = () => reabrir(hId);
  $('#f-exi').onsubmit = async (ev) => {
    ev.preventDefault();
    const v = lerValor($('#ex-val').value), data = $('#ex-data').value;
    if (!(v > 0) || !data) { $('#ex-erro').textContent = 'Preencha o valor e a data.'; return; }
    const atual = pega(hId);
    const item = { ...x, valor: r2(v), data };
    const lista = nova ? [...(atual.exitos || []), item] : atual.exitos.map((e) => (e.id === x.id ? item : e));
    await dados.salva(COL, { ...atual, exitos: lista });
    reabrir(hId);
  };
  $('[data-apagar]')?.addEventListener('click', async () => {
    const atual = pega(hId);
    await dados.salva(COL, { ...atual, exitos: atual.exitos.filter((e) => e.id !== x.id) });
    reabrir(hId);
  });
}

function abrirPct(hId) {
  const h = pega(hId);
  const f = abrirFolha(`
    <h3>Percentual de êxito</h3>
    <form id="f-pct" novalidate>
      <div class="fld"><label for="pc-val">Êxito (%)</label><input id="pc-val" inputmode="decimal" value="${numBR(h.exitoPct)}" autocomplete="off"></div>
      <div class="erro" id="pc-erro" role="alert"></div>
      <div class="acts"><button type="button" class="btn sec" data-fechar>Cancelar</button><button type="submit" class="btn pri">Salvar</button></div>
    </form>`);
  const $ = (s) => f.querySelector(s);
  $('[data-fechar]').onclick = () => reabrir(hId);
  $('#f-pct').onsubmit = async (ev) => {
    ev.preventDefault();
    const txt = $('#pc-val').value.trim();
    const v = txt ? lerValor(txt) : 0;
    if (txt && !(v >= 0 && v <= 100)) { $('#pc-erro').textContent = 'O êxito vai de 0 a 100%.'; return; }
    await dados.salva(COL, { ...h, exitoPct: r2(v) });
    reabrir(hId);
  };
}

export function abrirHonorario(id) {
  const h = pega(id);
  if (!h) return;
  const hoje = isoDia();
  const lista = [...(h.parcelas || [])].sort((a, b) => a.venc.localeCompare(b.venc));
  const caso = K.pegaCaso(h.casoId);
  const f = abrirFolha(`
    <div id="honor">
      <h3>${esc(nomeCliente(h))}</h3>
      ${caso ? `<p class="sub">${esc(caso.titulo)}</p>` : ''}
      <div class="ficha-bloco">
        <div class="rot">Recebido ${brl(pagoDe(h))} · a receber ${brl(abertoDe(h))}</div>
        ${lista.length ? `<div class="linhas">${lista.map((p) => `
          <div class="linha">
            <button type="button" class="caixa-chk ${p.pago ? 'ok' : ''}" data-alternar="${p.id}" aria-label="${p.pago ? 'Reabrir' : 'Marcar como recebida'}: ${esc(p.nome)}">${p.pago ? icone.check(14) : ''}</button>
            <button type="button" class="tx" data-parcela="${p.id}"><b>${esc(p.nome)}</b><small>${p.pago ? `recebida em ${dataBR(p.pagoEm)}` : `vence ${dataBR(p.venc)}`}</small></button>
            ${!p.pago && p.venc < hoje ? '<span class="chip neg">em atraso</span>' : ''}
            <span class="num">${brl(p.valor)}</span>
          </div>`).join('')}</div>` : '<div class="vazio" style="text-align:left;padding:4px 0">Nenhuma parcela.</div>'}
        <button type="button" class="link-mini" data-nova-parcela style="margin-top:10px">${icone.soma(13)} Parcela</button>
      </div>
      <div class="ficha-bloco">
        <div class="ficha-linha"><div class="rot" style="margin:0">Êxito${h.exitoPct ? ` · ${String(h.exitoPct).replace('.', ',')}%` : ''}</div><button type="button" class="link-mini" data-pct>${h.exitoPct ? 'alterar %' : 'definir %'}</button></div>
        ${(h.exitos || []).length ? `<div class="linhas">${h.exitos.map((x) => `<div class="linha"><button type="button" class="tx" data-exito="${x.id}"><b>Recebido em ${dataBR(x.data)}</b></button><span class="num">${brl(x.valor)}</span></div>`).join('')}</div>` : ''}
        <button type="button" class="link-mini" data-novo-exito style="margin-top:10px">${icone.soma(13)} Registrar êxito recebido</button>
      </div>
      <div class="opcoes acoes-tarefa"><button type="button" data-apagar class="perigo">Apagar contrato</button></div>
      <div class="acts"><button type="button" class="btn sec" data-fechar>Fechar</button></div>
    </div>`);
  f.querySelector('[data-fechar]').onclick = fecharFolha;
  f.querySelector('#honor').addEventListener('click', async (e) => {
    const b = e.target.closest('button');
    if (!b) return;
    const d = b.dataset;
    const trocar = (fn) => { fecharFolha(); setTimeout(fn, 260); };
    if (d.alternar) { await alternarParcela(id, d.alternar); reabrir(id); }
    else if (d.parcela) trocar(() => abrirParcela(id, d.parcela));
    else if (d.novaParcela !== undefined) trocar(() => abrirParcela(id));
    else if (d.exito) trocar(() => abrirExito(id, d.exito));
    else if (d.novoExito !== undefined) trocar(() => abrirExito(id));
    else if (d.pct !== undefined) trocar(() => abrirPct(id));
    else if (d.apagar !== undefined) {
      fecharFolha();
      if (await confirmar({ titulo: 'Apagar contrato?', texto: `${esc(nomeCliente(h))}: parcelas e êxitos saem dos totais de todos os meses.`, ok: 'Apagar', perigo: true })) { await dados.apaga(COL, id); toast('Contrato apagado.'); }
    }
  });
}

/* =========================================================
   NA FICHA DO CLIENTE
   ========================================================= */

K.registrarExtraFicha({
  html: (c) => {
    const lista = doCliente(c.id);
    return `<div class="ficha-bloco">
      <div class="rot">Honorários pagos: ${brl(r2(lista.reduce((s, h) => s + pagoDe(h) + exitoDe(h), 0)))}</div>
      ${lista.length ? `<div class="linhas">${lista.map((h) => `<div class="linha"><button type="button" class="tx" data-honorario="${h.id}"><b>${esc(K.pegaCaso(h.casoId)?.titulo || 'Contrato')}</b><small>a receber ${brl(abertoDe(h))}${h.exitoPct ? ` · êxito ${String(h.exitoPct).replace('.', ',')}%` : ''}</small></button></div>`).join('')}</div>` : ''}
      <button type="button" class="link-mini" data-novo-honorario style="margin-top:8px">${icone.soma(13)} Contrato de honorários</button>
    </div>`;
  },
  clique: (d, trocar, c) => {
    if (d.honorario) { trocar(() => abrirHonorario(d.honorario)); return true; }
    if (d.novoHonorario !== undefined) { trocar(() => abrirNovoHonorario({ clienteId: c.id })); return true; }
    return false;
  },
  apagar: async (c) => { for (const h of doCliente(c.id)) await dados.apaga(COL, h.id); },
  texto: (c) => ['', 'Honorários:', ...doCliente(c.id).flatMap((h) => [
    ...(h.parcelas || []).map((p) => `- ${p.nome}: ${brl(p.valor)}, vence ${dataBR(p.venc)}${p.pago ? `, recebida em ${dataBR(p.pagoEm)}` : ''}`),
    ...(h.exitos || []).map((x) => `- Êxito recebido em ${dataBR(x.data)}: ${brl(x.valor)}`),
    ...(h.exitoPct ? [`- Êxito combinado: ${String(h.exitoPct).replace('.', ',')}%`] : []),
  ])],
});
