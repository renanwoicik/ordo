/* =========================================================
   Sistema · módulo Gastos (Pessoal e Trabalho)
   Lançamentos, parcelados, estornos, contas fixas, importação
   de fatura/extrato e cálculos do mês. A tela Dinheiro → Gastos
   e o Resumo geral usam as funções daqui.

   Gasto (coleção "gastos"):
     { desc, valor (negativo = estorno), conta: 'CPF' | 'CNPJ', cat,
       data, mes (mês da FATURA, AAAA-MM), meio, revisar,
       grupo, parcela, parcelas }
   Conta fixa (coleção "fixas"):
     { nome, valor, dia, conta, cat, ativo, desde: 'AAAA-MM', ate: 'AAAA-MM' (opcional) }
     → entra todo mês, de "desde" até "ate" (sem "ate": até hoje e nos próximos meses).
     Quando o valor muda, a conta antiga termina (ate) e nasce uma nova (desde),
     assim os meses passados não mudam.
     pagamento do mês: config "fixas-AAAA-MM" → { pagos: { id: true } }
   Configuração (config "gastosConfig"):
     { cartoes: [{ id, nome }], categorias: { CPF: [...], CNPJ: [...] },
       limite (gasto máximo por mês), metaSobra }
     Valem todo mês, até você mudar.

   Na tela aparecem Pessoal e Trabalho; por dentro os valores continuam
   'CPF' e 'CNPJ'. Assim, basta mudar nomeConta quando houver PJ.

   Contas fixas de Trabalho são os CUSTOS FIXOS DO TRABALHO: o
   Resumo geral as desconta das entradas para chegar ao ganho líquido.
   ========================================================= */

import * as dados from '../nucleo/dados.js';
import * as avisos from '../nucleo/avisos.js';
import { abrirFolha, fecharFolha, toast, confirmar } from '../nucleo/ui.js';
import { esc, brl, r2, lerValor, isoDia, isoMes, somarMeses, normal, mesPorExtenso, novoId } from '../nucleo/util.js';

const COL = 'gastos';
const COL_F = 'fixas';

export const CATS_PADRAO = {
  CNPJ: ['Sistemas', 'Anuidades', 'Internet e telefone', 'Educação', 'Serviços', 'Custas', 'Impostos', 'Outros'],
  CPF: ['Mercado', 'Restaurante', 'Casa', 'Pet', 'Roupas', 'Beleza', 'Saúde', 'Lazer', 'Transporte', 'Educação', 'Serviços', 'Juros e taxas', 'Outros'],
};
const CARTOES_PADRAO = [{ id: 'c1', nome: 'Cartão' }];
const OUTROS_MEIOS = [{ id: 'pix', nome: 'Pix' }, { id: 'debito', nome: 'Débito' }, { id: 'dinheiro', nome: 'Dinheiro' }];

export const nomeConta = (c) => (c === 'CNPJ' ? 'Trabalho' : 'Pessoal');

/* ---------- configuração ---------- */

export function config() {
  const c = dados.config('gastosConfig') ?? {};
  return {
    cartoes: c.cartoes?.length ? c.cartoes : CARTOES_PADRAO,
    categorias: { CPF: c.categorias?.CPF?.length ? c.categorias.CPF : CATS_PADRAO.CPF, CNPJ: c.categorias?.CNPJ?.length ? c.categorias.CNPJ : CATS_PADRAO.CNPJ },
    limite: Number(c.limite) || 0,
    metaSobra: Number(c.metaSobra) || 0,
  };
}
export const meios = () => [...config().cartoes, ...OUTROS_MEIOS];
export const nomeMeio = (id) => meios().find((m) => m.id === id)?.nome ?? id ?? '';
const numBR = (v) => (v == null || v === '' || v === 0 ? '' : r2(v).toFixed(2).replace('.', ',').replace(/,00$/, ''));

/* ---------- leitura e cálculos ---------- */

export const todos = () => dados.lista(COL);
/** Primeiro mês em que a conta fixa vale (as antigas valem desde janeiro do ano em que foram criadas). */
export const desdeDe = (f) => f.desde || `${new Date(f.criadoEm || Date.now()).getFullYear()}-01`;

/** Todas as contas fixas (de qualquer mês), menos as removidas por completo. */
export const fixasTodas = () => dados.lista(COL_F).filter((f) => f.ativo !== false).sort((a, b) => (a.dia || 0) - (b.dia || 0));

/** As contas fixas do CNPJ de um mês: são os custos fixos do trabalho. */
export const fixasCNPJ = (ym = isoMes()) => fixas(ym).filter((f) => f.conta === 'CNPJ');

/** As contas fixas que valem num mês: já começaram (desde) e ainda não terminaram (ate). */
export const fixas = (ym = isoMes()) => fixasTodas().filter((f) => desdeDe(f) <= ym && (!f.ate || ym <= f.ate));
export const doMes = (ym) => todos().filter((g) => g.mes === ym)
  .sort((a, b) => (b.data || '').localeCompare(a.data || '') || (b.criadoEm || 0) - (a.criadoEm || 0));
export const fixasPagas = (ym) => dados.config(`fixas-${ym}`)?.pagos ?? {};
export const paraRevisar = () => todos().filter((g) => g.revisar);

const soma = (xs) => r2(xs.reduce((s, x) => s + (Number(x.valor) || 0), 0));

/** Tudo que o mês precisa: totais por conta, por categoria, por meio, limite e parcelados futuros. */
export function calcular(ym) {
  const L = doMes(ym);
  const F = fixas(ym);
  const itens = [...L.map((g) => ({ valor: g.valor, conta: g.conta, cat: g.cat })), ...F.map((f) => ({ valor: f.valor, conta: f.conta, cat: f.cat }))];
  const porCat = {};
  for (const i of itens) porCat[i.cat] = r2((porCat[i.cat] || 0) + i.valor);
  const categorias = Object.entries(porCat).map(([rotulo, valor]) => ({ rotulo, valor })).filter((x) => x.valor > 0).sort((a, b) => b.valor - a.valor);
  const total = soma(itens);
  const cfg = config();
  const pagos = fixasPagas(ym);
  const porMeio = meios().map((m) => ({ ...m, valor: soma(L.filter((g) => g.meio === m.id)), qtd: L.filter((g) => g.meio === m.id).length })).filter((m) => m.qtd);
  const futuros = todos().filter((g) => g.mes > ym && g.grupo);
  return {
    ym, L, F, total,
    cpf: soma(itens.filter((i) => i.conta === 'CPF')),
    cnpj: soma(itens.filter((i) => i.conta === 'CNPJ')),
    totalFixas: soma(F),
    fixasPagasN: F.filter((f) => pagos[f.id]).length,
    categorias, porMeio, limite: cfg.limite,
    pctLimite: cfg.limite > 0 ? (total / cfg.limite) * 100 : null,
    revisar: L.filter((g) => g.revisar).length,
    futuros: soma(futuros),
    // contas fixas do CNPJ contam como custo do trabalho
    totalFixasCNPJ: soma(F.filter((f) => f.conta === 'CNPJ')),
    totalFixasCPF: soma(F.filter((f) => f.conta !== 'CNPJ')),
    // o que vai para "Saiu" no Resumo geral: tudo, menos as contas fixas do CNPJ
    totalPessoal: r2(total - soma(F.filter((f) => f.conta === 'CNPJ'))),
  };
}

/** Dicas automáticas, calculadas no aparelho. */
export function dicas(ym) {
  const a = calcular(ym), b = calcular(somarMeses(ym, -1));
  const textos = [];
  const ant = Object.fromEntries(b.categorias.map((c) => [c.rotulo, c.valor]));
  const subidas = a.categorias
    .filter((c) => (ant[c.rotulo] || 0) >= 100 && c.valor > ant[c.rotulo] * 1.2)
    .map((c) => ({ ...c, pct: Math.round(((c.valor - ant[c.rotulo]) / ant[c.rotulo]) * 100), dif: r2(c.valor - ant[c.rotulo]) }))
    .sort((x, y) => y.dif - x.dif);
  if (subidas[0]) textos.push(`<b>${esc(subidas[0].rotulo)}</b> subiu <b>${subidas[0].pct}%</b> em relação a ${mesPorExtenso(b.ym).split(' ')[0].toLowerCase()}. Se voltasse ao nível de lá, sobrariam <b>${brl(subidas[0].dif)}</b> a mais.`);
  if (a.categorias[0] && a.total > 0) textos.push(`<b>${esc(a.categorias[0].rotulo)}</b> é a sua maior categoria: <b>${Math.round((a.categorias[0].valor / a.total) * 100)}%</b> dos gastos do mês.`);
  const juros = a.L.filter((g) => g.cat === 'Juros e taxas').reduce((s, g) => s + g.valor, 0);
  if (juros > 0) textos.push(`Você pagou <b>${brl(juros)}</b> de juros e taxas neste mês.`);
  if (a.futuros > 0) textos.push(`Já estão comprometidos <b>${brl(a.futuros)}</b> em parcelas dos próximos meses.`);
  return textos;
}

/* ---------- ações ---------- */

export async function alternarFixaPaga(ym, id) {
  const atual = fixasPagas(ym);
  await dados.salvaConfig(`fixas-${ym}`, { pagos: { ...atual, [id]: !atual[id] } });
}
export const trocarConta = (g) => {
  const conta = g.conta === 'CNPJ' ? 'CPF' : 'CNPJ';
  const cats = config().categorias[conta];
  return dados.salva(COL, { ...g, conta, cat: cats.includes(g.cat) ? g.cat : 'Outros' });
};
export const confirmarGasto = (g) => dados.salva(COL, { ...g, revisar: false });

/* ---------- peças de formulário ---------- */

function escolha(raiz, sel, aoMudar) {
  const el = raiz.querySelector(sel);
  el.addEventListener('click', (e) => {
    const b = e.target.closest('button[data-v]');
    if (!b) return;
    el.querySelectorAll('button[data-v]').forEach((x) => x.setAttribute('aria-pressed', String(x === b)));
    aoMudar?.(b.dataset.v);
  });
  return () => el.querySelector('[aria-pressed="true"]')?.dataset.v ?? null;
}
const botoes = (lista, atual) => lista.map((x) => `<button type="button" data-v="${x.id}" aria-pressed="${x.id === atual}">${x.nome}</button>`).join('');
const opcoesCat = (lista, atual) => lista.map((c) => `<option ${c === atual ? 'selected' : ''}>${esc(c)}</option>`).join('');

/* =========================================================
   FORMULÁRIO DO GASTO
   ========================================================= */

/**
 * Novo gasto ou edição. `mes` = mês da fatura sugerido. `prefill` = campos já preenchidos (ex.: { desc, valor, conta, cat }).
 * Em gastos novos dá para parcelar: lança uma vez e o sistema cria as parcelas nas próximas faturas.
 */
export function abrirGasto(gasto = null, { mes, prefill = {} } = {}) {
  const novo = !gasto;
  const cfg = config();
  const g = gasto ? { ...gasto } : { desc: '', valor: '', conta: 'CPF', cat: 'Mercado', data: isoDia(), mes: mes || isoMes(), meio: cfg.cartoes[0].id, revisar: false, ...prefill };
  const parcelado = !novo && g.grupo;

  const f = abrirFolha(`
    <h3>${novo ? 'Novo' : 'Editar'} <em>gasto</em></h3>
    <form id="f-gasto" novalidate>
      <div class="fld valor-grande"><label for="g-valor">Valor (use sinal de menos para estorno)</label>
        <input id="g-valor" inputmode="decimal" value="${numBR(g.valor)}" placeholder="R$ 0,00" autocomplete="off" autofocus></div>
      <div class="fld"><label for="g-desc">Descrição</label>
        <input id="g-desc" value="${esc(g.desc)}" placeholder="Ex.: mercado, assinatura, material de escritório" autocomplete="off"></div>
      <div class="fld"><span class="l">Conta</span>
        <div class="opcoes" id="g-conta"><button type="button" data-v="CPF" aria-pressed="${g.conta === 'CPF'}">Pessoal</button><button type="button" data-v="CNPJ" aria-pressed="${g.conta === 'CNPJ'}">Trabalho</button></div></div>
      <div class="fld"><label for="g-cat">Categoria</label><select id="g-cat">${opcoesCat(cfg.categorias[g.conta], g.cat)}</select></div>
      <div class="fld"><span class="l">Como pagou</span><div class="opcoes" id="g-meio">${botoes(meios(), g.meio)}</div></div>
      <div class="par">
        <div class="fld"><label for="g-data">Data da compra</label><input id="g-data" type="date" value="${esc(g.data)}"></div>
        <div class="fld"><label for="g-mes">Mês da fatura</label><input id="g-mes" type="month" value="${esc(g.mes)}"></div>
      </div>
      ${novo ? `<div class="fld"><label for="g-parc">Parcelas</label>
        <select id="g-parc">${[1, 2, 3, 4, 5, 6, 7, 8, 9, 10, 11, 12].map((n) => `<option value="${n}">${n === 1 ? 'À vista (1x)' : `${n}x`}</option>`).join('')}</select>
        <small id="g-parc-info">O valor digitado é o total da compra.</small></div>` : (parcelado ? `<div class="previa">Parcela ${g.parcela} de ${g.parcelas}. Para mudar as outras, edite cada uma.</div>` : '')}
      <label class="chk"><input type="checkbox" id="g-rev" ${g.revisar ? 'checked' : ''}> Ainda não sei se é pessoal ou do trabalho</label>
      <div class="erro" id="g-erro" role="alert"></div>
      ${novo ? '' : '<div class="opcoes acoes-tarefa"><button type="button" data-acao="apagar" class="perigo">Apagar gasto</button></div>'}
      <div class="acts"><button type="button" class="btn sec" data-fechar>Cancelar</button><button type="submit" class="btn pri">Salvar</button></div>
    </form>`);

  const $ = (s) => f.querySelector(s);
  const lerConta = escolha(f, '#g-conta', (c) => { $('#g-cat').innerHTML = opcoesCat(cfg.categorias[c], $('#g-cat').value); if (!cfg.categorias[c].includes($('#g-cat').value)) $('#g-cat').value = 'Outros'; });
  const lerMeio = escolha(f, '#g-meio');
  $('[data-fechar]').onclick = fecharFolha;
  // A data da compra sugere o mês da fatura (se ainda não mexeu nele)
  let mesTocado = !novo;
  $('#g-mes').addEventListener('input', () => { mesTocado = true; });
  $('#g-data').addEventListener('change', () => { if (!mesTocado && $('#g-data').value) $('#g-mes').value = $('#g-data').value.slice(0, 7); });
  const atualizarParc = () => {
    const n = Number($('#g-parc')?.value || 1), v = lerValor($('#g-valor').value);
    if ($('#g-parc-info')) $('#g-parc-info').textContent = n > 1 && Number.isFinite(v) ? `${n} parcelas de ${brl(v / n)}, uma em cada fatura a partir do mês escolhido.` : 'O valor digitado é o total da compra.';
  };
  $('#g-parc')?.addEventListener('change', atualizarParc);
  $('#g-valor').addEventListener('input', atualizarParc);

  $('#f-gasto').onsubmit = async (ev) => {
    ev.preventDefault();
    const valor = lerValor($('#g-valor').value);
    if (!Number.isFinite(valor) || valor === 0) { $('#g-erro').textContent = 'Digite um valor válido.'; $('#g-valor').focus(); return; }
    const desc = $('#g-desc').value.trim();
    if (!desc) { $('#g-erro').textContent = 'Escreva uma descrição.'; $('#g-desc').focus(); return; }
    const base = { ...g, desc, conta: lerConta(), cat: $('#g-cat').value, meio: lerMeio(), data: $('#g-data').value || isoDia(), revisar: $('#g-rev').checked };
    const mesFatura = $('#g-mes').value || isoMes();
    const n = Number($('#g-parc')?.value || 1);
    if (novo && n > 1) {
      const grupo = novoId(), parcela = r2(Math.floor((valor / n) * 100) / 100);
      for (let i = 0; i < n; i++) {
        await dados.salva(COL, { ...base, desc: `${desc} (${i + 1}/${n})`, valor: i === n - 1 ? r2(valor - parcela * (n - 1)) : parcela, mes: somarMeses(mesFatura, i), grupo, parcela: i + 1, parcelas: n });
      }
    } else {
      await dados.salva(COL, { ...base, valor: r2(valor), mes: mesFatura });
    }
    fecharFolha();
    toast(novo ? (n > 1 ? `${n} parcelas lançadas ✦` : 'Gasto lançado ✦') : 'Gasto salvo.');
  };

  f.querySelector('[data-acao="apagar"]')?.addEventListener('click', async () => {
    fecharFolha();
    if (await confirmar({ titulo: 'Apagar gasto?', texto: `${esc(g.desc)} · ${brl(g.valor)}`, ok: 'Apagar', perigo: true })) {
      await dados.apaga(COL, g.id);
      toast('Gasto apagado.');
    }
  });
}

/* =========================================================
   CONTAS FIXAS
   ========================================================= */

export function abrirFixa(fixa = null) {
  const novo = !fixa;
  const cfg = config();
  const x = fixa ? { ...fixa } : { nome: '', valor: '', dia: 5, conta: 'CPF', cat: 'Casa' };
  const desde = fixa ? desdeDe(fixa) : `${new Date().getFullYear()}-01`;
  const f = abrirFolha(`
    <h3>${novo ? 'Nova' : 'Editar'} <em>conta fixa</em></h3>
    <p class="sub">Entra sozinha todo mês, do período que você escolher. Você só marca quando pagar.</p>
    <form id="f-fixa" novalidate>
      <div class="fld"><label for="x-nome">Nome</label><input id="x-nome" value="${esc(x.nome)}" placeholder="Ex.: aluguel, luz, internet, academia" autocomplete="off" autofocus></div>
      <div class="par">
        <div class="fld"><label for="x-valor">Valor</label><input id="x-valor" inputmode="decimal" value="${numBR(x.valor)}" placeholder="R$ 0,00" autocomplete="off"></div>
        <div class="fld"><label for="x-dia">Vence no dia</label><input id="x-dia" type="number" min="1" max="31" value="${x.dia || ''}" inputmode="numeric"></div>
      </div>
      <div class="fld"><span class="l">Conta</span>
        <div class="opcoes" id="x-conta"><button type="button" data-v="CPF" aria-pressed="${x.conta === 'CPF'}">Pessoal</button><button type="button" data-v="CNPJ" aria-pressed="${x.conta === 'CNPJ'}">Trabalho</button></div>
        <small>Trabalho vira custo sozinho (desconta do ganho líquido). Pessoal entra só nos seus gastos.</small></div>
      <div class="fld"><label for="x-cat">Categoria</label><select id="x-cat">${opcoesCat(cfg.categorias[x.conta], x.cat)}</select></div>
      <div class="par">
        <div class="fld"><label for="x-desde">Vale a partir de</label><input id="x-desde" type="month" value="${esc(desde)}"></div>
        <div class="fld"><label for="x-ate">Até (opcional)</label><input id="x-ate" type="month" value="${esc(x.ate || '')}"></div>
      </div>
      ${novo ? '' : `<label class="chk"><input type="checkbox" id="x-split"> Mudei o valor (ou o dia): vale só a partir de um mês, e os meses anteriores ficam como estavam</label>
        <div class="fld" id="x-corte-box" hidden><label for="x-corte">Novo valor vale a partir de</label><input id="x-corte" type="month" value="${esc(isoMes())}"></div>`}
      <div class="erro" id="x-erro" role="alert"></div>
      ${novo ? '' : '<div class="opcoes acoes-tarefa"><button type="button" data-acao="remover" class="perigo">Encerrar conta fixa</button></div>'}
      <div class="acts"><button type="button" class="btn sec" data-fechar>Cancelar</button><button type="submit" class="btn pri">Salvar</button></div>
    </form>`);
  const $ = (s) => f.querySelector(s);
  const lerConta = escolha(f, '#x-conta', (c) => { $('#x-cat').innerHTML = opcoesCat(cfg.categorias[c], 'Outros'); });
  $('[data-fechar]').onclick = fecharFolha;
  $('#x-split')?.addEventListener('change', () => { $('#x-corte-box').hidden = !$('#x-split').checked; });
  $('#f-fixa').onsubmit = async (ev) => {
    ev.preventDefault();
    const valor = lerValor($('#x-valor').value), nome = $('#x-nome').value.trim();
    if (!nome) { $('#x-erro').textContent = 'Dê um nome à conta.'; return; }
    if (!Number.isFinite(valor) || valor <= 0) { $('#x-erro').textContent = 'Digite o valor.'; return; }
    const de = $('#x-desde').value || desde, ate = $('#x-ate').value || '';
    if (ate && ate < de) { $('#x-erro').textContent = 'O último mês não pode ser antes do primeiro.'; return; }
    const campos = { nome, valor: r2(valor), dia: Math.min(31, Math.max(1, Number($('#x-dia').value) || 1)), conta: lerConta(), cat: $('#x-cat').value };
    if (!novo && $('#x-split')?.checked) {
      const corte = $('#x-corte').value;
      if (!corte || corte <= desdeDe(x)) { $('#x-erro').textContent = `Escolha um mês depois de ${desdeDe(x)}, para os meses anteriores ficarem como estavam.`; return; }
      // a conta antiga termina no mês anterior; nasce uma nova a partir do corte
      await dados.salva(COL_F, { ...x, ate: somarMeses(corte, -1) });
      await dados.salva(COL_F, { ...campos, desde: corte, ate, ativo: true });
      fecharFolha();
      toast('Valor novo a partir do mês escolhido ✦ Os meses anteriores continuam iguais.');
      return;
    }
    await dados.salva(COL_F, { ...x, ...campos, desde: de, ate, ativo: true });
    fecharFolha();
    toast(novo ? 'Conta fixa criada ✦' : 'Conta fixa salva.');
  };
  $('[data-acao="remover"]')?.addEventListener('click', async () => {
    fecharFolha();
    if (await confirmar({ titulo: 'Encerrar conta fixa?', texto: `“${esc(x.nome)}” deixa de entrar a partir deste mês. Os meses anteriores continuam como estão.`, ok: 'Encerrar', perigo: true })) {
      // se ela só começaria agora ou depois, remove de vez; senão, termina no mês passado
      if (desdeDe(x) >= isoMes()) await dados.salva(COL_F, { ...x, ativo: false });
      else await dados.salva(COL_F, { ...x, ate: somarMeses(isoMes(), -1) });
      toast('Conta fixa encerrada.');
    }
  });
}

/* =========================================================
   CONFIGURAÇÃO (cartões, limite, meta, categorias)
   ========================================================= */

export function abrirConfigGastos() {
  const cfg = config();
  const f = abrirFolha(`
    <h3>Ajustes dos <em>gastos</em></h3>
    <form id="f-cfg" novalidate>
      <div class="rot acc">Seus cartões</div>
      <div id="k-lista">${cfg.cartoes.map((c, i) => `<div class="fld"><input class="k-nome" data-id="${esc(c.id)}" value="${esc(c.nome)}" aria-label="Nome do cartão ${i + 1}" placeholder="Ex.: Nubank"></div>`).join('')}</div>
      <button type="button" class="link-mini" id="k-mais">+ adicionar cartão</button>
      <div class="rot acc" style="margin-top:16px">Metas (valem todo mês)</div>
      <div class="par">
        <div class="fld"><label for="c-lim">Limite de gastos</label><div class="com-sufixo"><input id="c-lim" inputmode="decimal" value="${numBR(cfg.limite)}"><span>R$/mês</span></div></div>
        <div class="fld"><label for="c-sobra">Quanto quer que sobre</label><div class="com-sufixo"><input id="c-sobra" inputmode="decimal" value="${numBR(cfg.metaSobra)}"><span>R$/mês</span></div></div>
      </div>
      <div class="rot acc">Categorias</div>
      <div class="fld"><label for="c-cpf">Pessoal (separe por vírgula)</label><textarea id="c-cpf" rows="3">${esc(cfg.categorias.CPF.join(', '))}</textarea></div>
      <div class="fld"><label for="c-cnpj">Trabalho (separe por vírgula)</label><textarea id="c-cnpj" rows="2">${esc(cfg.categorias.CNPJ.join(', '))}</textarea>
        <small>Lembre de manter “Outros”. Gastos já lançados com uma categoria removida continuam como estão.</small></div>
      <div class="acts"><button type="button" class="btn sec" data-fechar>Cancelar</button><button type="submit" class="btn pri">Salvar</button></div>
    </form>`);
  const $ = (s) => f.querySelector(s);
  $('[data-fechar]').onclick = fecharFolha;
  $('#k-mais').onclick = () => $('#k-lista').insertAdjacentHTML('beforeend', `<div class="fld"><input class="k-nome" data-id="${novoId()}" placeholder="Nome do cartão"></div>`);
  $('#f-cfg').onsubmit = async (ev) => {
    ev.preventDefault();
    const lista = (s) => [...new Set(s.split(/[,\n]/).map((x) => x.trim()).filter(Boolean))];
    const num = (id) => { const v = lerValor($(id).value); return Number.isFinite(v) ? r2(v) : 0; };
    const cpf = lista($('#c-cpf').value), cnpj = lista($('#c-cnpj').value);
    if (!cpf.includes('Outros')) cpf.push('Outros');
    if (!cnpj.includes('Outros')) cnpj.push('Outros');
    const cartoes = [...f.querySelectorAll('.k-nome')].map((i) => ({ id: i.dataset.id, nome: i.value.trim() })).filter((c) => c.nome);
    await dados.salvaConfig('gastosConfig', { cartoes: cartoes.length ? cartoes : CARTOES_PADRAO, categorias: { CPF: cpf, CNPJ: cnpj }, limite: num('#c-lim'), metaSobra: num('#c-sobra') });
    fecharFolha();
    toast('Ajustes salvos ✦');
  };
}

/* =========================================================
   IMPORTAÇÃO DE FATURA / EXTRATO (CSV e OFX)
   Tudo é lido aqui no aparelho; nada é enviado para fora.
   ========================================================= */

const PALAVRAS = [
  [/ifood|restaurante|lanche|pizza|burger|padaria|cafe|cafeteria|sushi|bar /, 'CPF', 'Restaurante'],
  [/uber|99 ?pop|99app|posto|combust|estacionamento|sem parar|veloe/, 'CPF', 'Transporte'],
  [/mercado|supermerc|atacad|carrefour|assai|angeloni|condor|hortifruti/, 'CPF', 'Mercado'],
  [/farmacia|drogaria|droga raia|panvel|pague menos|clinica|hospital|laborat/, 'CPF', 'Saúde'],
  [/jusbrasil|projuris|astrea|adv ?box|certisign|serasa experian|valid certificadora/, 'CNPJ', 'Sistemas'],
  [/\boab\b|ordem dos advogados/, 'CNPJ', 'Anuidades'],
  [/juros|iof|encargos|multa|tarifa|anuidade/, 'CPF', 'Juros e taxas'],
  [/netflix|spotify|disney|hbo|prime video|cinema|ingresso/, 'CPF', 'Lazer'],
];

/** Sugere conta e categoria: primeiro pelo que você já lançou antes, depois por palavras-chave. */
function sugerir(desc, aprendido) {
  const chave = normal(desc).replace(/[^a-z0-9 ]/g, ' ').replace(/\s+/g, ' ').trim();
  const visto = aprendido.get(chave);
  if (visto) return visto;
  for (const [re, conta, cat] of PALAVRAS) if (re.test(chave)) return { conta, cat };
  return { conta: 'CPF', cat: 'Outros' };
}

function aprender() {
  const m = new Map();
  for (const g of [...todos()].sort((a, b) => (a.criadoEm || 0) - (b.criadoEm || 0))) {
    const base = normal(g.desc.replace(/\(\d+\/\d+\)$/, '')).replace(/[^a-z0-9 ]/g, ' ').replace(/\s+/g, ' ').trim();
    if (base) m.set(base, { conta: g.conta, cat: g.cat });
  }
  return m;
}

const dataBR = (s) => {
  s = String(s).trim();
  let m = s.match(/^(\d{4})-(\d{2})-(\d{2})/); if (m) return `${m[1]}-${m[2]}-${m[3]}`;
  m = s.match(/^(\d{2})\/(\d{2})\/(\d{4})/); if (m) return `${m[3]}-${m[2]}-${m[1]}`;
  m = s.match(/^(\d{2})\/(\d{2})\/(\d{2})$/); if (m) return `20${m[3]}-${m[2]}-${m[1]}`;
  return null;
};

function lerOFX(texto) {
  const itens = [];
  for (const bloco of texto.split(/<STMTTRN>/i).slice(1)) {
    const pega = (tag) => bloco.match(new RegExp(`<${tag}>([^<\\r\\n]*)`, 'i'))?.[1]?.trim();
    const d = pega('DTPOSTED')?.slice(0, 8), v = Number(String(pega('TRNAMT') ?? '').replace(',', '.'));
    if (!d || !Number.isFinite(v)) continue;
    itens.push({ data: `${d.slice(0, 4)}-${d.slice(4, 6)}-${d.slice(6, 8)}`, desc: pega('MEMO') || pega('NAME') || 'Sem descrição', bruto: v });
  }
  return itens;
}

function lerCSV(texto) {
  const linhas = texto.replace(/\r/g, '').split('\n').filter((l) => l.trim());
  if (linhas.length < 2) return [];
  const sep = (linhas[0].match(/;/g) || []).length >= (linhas[0].match(/,/g) || []).length ? ';' : ',';
  const partir = (l) => {
    const out = []; let cur = '', asp = false;
    for (const ch of l) { if (ch === '"') asp = !asp; else if (ch === sep && !asp) { out.push(cur); cur = ''; } else cur += ch; }
    out.push(cur); return out.map((x) => x.trim());
  };
  const cab = partir(linhas[0]).map((c) => normal(c));
  const idx = (re) => cab.findIndex((c) => re.test(c));
  let iData = idx(/data|date/), iDesc = idx(/descri|lancamento|historico|estabelec|title|nome/), iVal = idx(/valor|amount|quantia/);
  const sTemCab = iData >= 0 && iVal >= 0;
  const corpo = sTemCab ? linhas.slice(1) : linhas;
  if (!sTemCab) { iData = 0; iDesc = 1; iVal = partir(linhas[0]).length - 1; }
  if (iDesc < 0) iDesc = cab.findIndex((_, i) => i !== iData && i !== iVal);
  const itens = [];
  for (const l of corpo) {
    const c = partir(l);
    const data = dataBR(c[iData] ?? ''), v = lerValor(c[iVal]);
    if (!data || !Number.isFinite(v)) continue;
    itens.push({ data, desc: c[iDesc] || 'Sem descrição', bruto: v });
  }
  return itens;
}

/** Abre a escolha de arquivo e, depois, a folha de conferência. */
export function abrirImportacao() {
  const entrada = Object.assign(document.createElement('input'), { type: 'file', accept: '.csv,.ofx,.txt,text/csv' });
  entrada.onchange = async () => {
    const arq = entrada.files[0];
    if (!arq) return;
    const texto = await arq.text();
    const ehOfx = /<STMTTRN>/i.test(texto) || /\.ofx$/i.test(arq.name);
    const itens = ehOfx ? lerOFX(texto) : lerCSV(texto);
    if (!itens.length) { toast('Não consegui ler lançamentos neste arquivo.'); return; }
    conferirImportacao(itens, ehOfx);
  };
  entrada.click();
}

function conferirImportacao(itens, ehOfx) {
  const cfg = config();
  const aprendido = aprender();
  // O sinal dos gastos varia por banco: se a maioria é negativa, gasto = negativo.
  const negativos = itens.filter((i) => i.bruto < 0).length;
  let gastoNegativo = ehOfx ? true : negativos > itens.length / 2;
  const existentes = new Set(todos().map((g) => `${g.data}|${r2(g.valor)}|${normal(g.desc)}`));
  const maxData = itens.map((i) => i.data).sort().at(-1);
  const linhas = () => itens.map((i, k) => {
    const valor = r2(gastoNegativo ? -i.bruto : i.bruto);
    const sug = sugerir(i.desc, aprendido);
    return { k, ...i, valor, ...sug, repetido: existentes.has(`${i.data}|${valor}|${normal(i.desc)}`), marcada: ehOfx && valor < 0 ? false : undefined };
  });
  let rows = linhas();

  const f = abrirFolha(`
    <h3>Importar <em>fatura</em></h3>
    <p class="sub" id="i-sub"></p>
    <div class="par">
      <div class="fld"><label for="i-mes">Mês da fatura</label><input id="i-mes" type="month" value="${maxData.slice(0, 7)}"></div>
      <div class="fld"><label for="i-meio">Como pagou</label><select id="i-meio">${meios().map((m) => `<option value="${esc(m.id)}">${esc(m.nome)}</option>`).join('')}</select></div>
    </div>
    <label class="chk"><input type="checkbox" id="i-inv"> Os gastos neste arquivo aparecem com sinal ${gastoNegativo ? 'positivo' : 'negativo'} (inverter)</label>
    <div id="i-lista" class="import-lista"></div>
    <div class="erro" id="i-erro" role="alert"></div>
    <div class="acts"><button type="button" class="btn sec" data-fechar>Cancelar</button><button type="button" class="btn pri" id="i-ok">Importar</button></div>`);
  const $ = (s) => f.querySelector(s);

  const desenhar = () => {
    const marcadas = rows.filter((r) => r.marcada !== false && !r.repetido);
    $('#i-sub').textContent = `${rows.length} lançamentos lidos · ${rows.filter((r) => r.repetido).length} já existiam · ${marcadas.length} para importar. Confira as categorias; o sistema aprende com o que você corrige.`;
    $('#i-lista').innerHTML = rows.map((r) => `
      <div class="imp-linha ${r.repetido ? 'repetido' : ''}" data-k="${r.k}">
        <label class="imp-top"><input type="checkbox" class="i-chk" ${r.marcada !== false && !r.repetido ? 'checked' : ''} ${r.repetido ? 'disabled' : ''}>
          <span class="imp-desc">${esc(r.desc)}<small>${r.data.split('-').reverse().slice(0, 2).join('/')}${r.repetido ? ' · já lançado' : ''}</small></span>
          <span class="num ${r.valor < 0 ? 'neg-txt' : ''}">${brl(r.valor)}</span></label>
        <div class="imp-sel"><select class="i-conta"><option value="CPF" ${r.conta === 'CPF' ? 'selected' : ''}>Pessoal</option><option value="CNPJ" ${r.conta === 'CNPJ' ? 'selected' : ''}>Trabalho</option></select>
          <select class="i-cat">${opcoesCat(cfg.categorias[r.conta], r.cat)}</select></div>
      </div>`).join('');
  };
  desenhar();

  $('#i-inv').onchange = () => { gastoNegativo = !gastoNegativo; rows = linhas(); desenhar(); };
  $('#i-lista').addEventListener('change', (e) => {
    const linha = e.target.closest('.imp-linha'); if (!linha) return;
    const r = rows.find((x) => x.k === Number(linha.dataset.k));
    if (e.target.classList.contains('i-chk')) r.marcada = e.target.checked;
    if (e.target.classList.contains('i-conta')) { r.conta = e.target.value; r.cat = cfg.categorias[r.conta].includes(r.cat) ? r.cat : 'Outros'; }
    if (e.target.classList.contains('i-cat')) r.cat = e.target.value;
    desenhar();
  });
  $('[data-fechar]').onclick = fecharFolha;
  $('#i-ok').onclick = async () => {
    const mes = $('#i-mes').value, meio = $('#i-meio').value;
    const escolhidas = rows.filter((r) => r.marcada !== false && !r.repetido);
    if (!escolhidas.length) { $('#i-erro').textContent = 'Nenhum lançamento marcado para importar.'; return; }
    $('#i-ok').disabled = true; $('#i-ok').textContent = 'Importando…';
    for (const r of escolhidas) await dados.salva(COL, { desc: r.desc, valor: r.valor, conta: r.conta, cat: r.cat, data: r.data, mes, meio, revisar: false });
    fecharFolha();
    toast(`${escolhidas.length} gastos importados ✦`);
  };
}

/* =========================================================
   AVISOS PARA O PAINEL HOJE
   ========================================================= */

avisos.registrar('gastos', () => {
  const lista = [];
  const ym = isoMes(), hoje = new Date().getDate();
  const rev = paraRevisar().length;
  if (rev) lista.push({ id: 'gastos-revisar', tipo: 'mid', prioridade: 3, irPara: '#/dinheiro/gastos', texto: `<strong>${rev}</strong> ${rev === 1 ? 'gasto marcado' : 'gastos marcados'} para revisar (pessoal ou trabalho?).` });
  const pagos = fixasPagas(ym);
  const vencidas = fixas(ym).filter((f) => !pagos[f.id] && f.dia <= hoje);
  if (vencidas.length) lista.push({ id: 'fixas-vencidas', tipo: 'warn', prioridade: 4, irPara: '#/dinheiro/gastos', texto: `Contas fixas já vencidas e não marcadas como pagas: ${vencidas.map((f) => esc(f.nome)).join(', ')}.` });
  const c = calcular(ym);
  if (c.pctLimite != null && c.pctLimite >= 100) lista.push({ id: 'limite', tipo: 'warn', prioridade: 4, irPara: '#/dinheiro/gastos', texto: 'Você passou do <strong>limite de gastos</strong> do mês.' });
  else if (c.pctLimite != null && c.pctLimite >= 80) lista.push({ id: 'limite', tipo: 'mid', prioridade: 3, irPara: '#/dinheiro/gastos', texto: 'Você está perto do <strong>limite de gastos</strong> do mês.' });
  return lista;
});
