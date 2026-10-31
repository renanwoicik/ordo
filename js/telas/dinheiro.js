/* =========================================================
   Sistema · Dinheiro
   Três partes: Resumo geral · Entradas · Gastos.
   Endereços: #/dinheiro/resumo, #/dinheiro/entradas, #/dinheiro/gastos
   ========================================================= */

import * as G from '../nucleo/graficos.js';
import { cabecalho, painel, kpi, abas, icone, areaLimpa } from '../nucleo/ui.js';
import { brl, r2, esc, normal, isoMes, mesPorExtenso, somarMeses, diaPorExtenso, deIso } from '../nucleo/util.js';
import * as S from '../modulos/gastos.js';
import * as E from '../modulos/entradas.js';
import * as An from '../modulos/analise.js';

const PARTES = [
  { rota: 'resumo', nome: 'Resumo geral', desenhar: resumo, ligar: (el) => el.addEventListener('click', (e) => { if (e.target.closest('[data-cfg-g]')) S.abrirConfigGastos(); else if (e.target.closest('[data-meta]')) E.abrirMeta(); else if (e.target.closest('[data-analise]')) An.abrirAnalise(); }) },
  { rota: 'entradas', nome: 'Entradas', desenhar: entradas, ligar: ligarEntradas },
  { rota: 'gastos', nome: 'Gastos', desenhar: gastos, ligar: ligarGastos },
];

/* O que a tela lembra enquanto você navega */
const estado = { mes: isoMes(), filtroG: 'tudo', buscaG: '' };
let ultimo = null;

export function desenhar(el, partes = ultimo?.partes ?? []) {
  el = areaLimpa(el);
  ultimo = { el, partes };
  const atual = PARTES.find((p) => p.rota === partes[0]) || PARTES[0];
  el.innerHTML = `
    ${cabecalho({ sup: 'Finanças', titulo: mesPorExtenso(estado.mes).replace(/ (\d{4})$/, ' <em>$1</em>') })}
    <div class="nav-mes">
      ${abas('dinheiro', PARTES, atual.rota)}
      <div class="nav-semana">
        <button class="redondo" data-mes="-1" aria-label="Mês anterior">${icone.voltar(18)}</button>
        <button class="redondo" data-mes="1" aria-label="Próximo mês">${icone.seta(18)}</button>
        ${estado.mes !== isoMes() ? '<button class="link-mini" data-mes="hoje">mês atual</button>' : ''}
      </div>
    </div>
    ${atual.desenhar()}`;
  el.addEventListener('click', (e) => {
    const b = e.target.closest('[data-mes]');
    if (!b) return;
    estado.mes = b.dataset.mes === 'hoje' ? isoMes() : somarMeses(estado.mes, Number(b.dataset.mes));
    redesenhar();
  });
  atual.ligar?.(el);
}
const redesenhar = () => ultimo && desenhar(ultimo.el, ultimo.partes);

const pct = (v, total) => (total > 0 ? Math.round((v / total) * 100) : 0);
const curto = (v) => (Math.abs(v) >= 100000 ? `R$ ${(v / 1000).toLocaleString('pt-BR', { maximumFractionDigits: 1 })} mil` : Math.abs(v) >= 1000 ? brl(Math.round(v)).replace(/,00$/, '') : brl(v).replace(/,00$/, ''));
/** Para o meio das roscas, onde cabe pouco: 4450 → "R$ 4,5 mil" */
const mini = (v) => (Math.abs(v) >= 1000 ? `R$ ${(v / 1000).toLocaleString('pt-BR', { maximumFractionDigits: 1 })} mil` : brl(v).replace(',00', ''));

/* =========================================================
   ENTRADAS
   ========================================================= */

function entradas() {
  const L = E.doMes(estado.mes);
  const total = E.total(estado.mes), antes = E.total(somarMeses(estado.mes, -1));
  return `
    <div class="duas">
      ${kpi({ rot: 'Entrou no mês', valor: curto(total), sub: `${L.length} ${L.length === 1 ? 'lançamento' : 'lançamentos'}`, classe: 'verde' })}
      ${kpi({ rot: 'Mês anterior', valor: curto(antes), sub: antes > 0 && total > 0 ? `${total >= antes ? 'subiu' : 'caiu'} ${Math.abs(Math.round(((total - antes) / antes) * 100))}%` : '—' })}
    </div>
    ${painel({ rot: 'Extrato', titulo: 'Entradas do mês',
      corpo: `<div class="filtros"><span style="flex:1"></span><button class="btn pri" data-nova-e>${icone.soma(16)} Entrada</button></div>
        ${L.length ? `<div class="linhas">${L.map((e) => `
          <div class="linha">
            <button class="tx" data-editar-e="${e.id}" style="text-align:left"><b>${esc(e.desc)}</b><small>${diaPorExtenso(deIso(e.data))}${e.nota ? ` · ${esc(e.nota)}` : ''}</small></button>
            <span class="num" style="font-weight:600">${brl(e.valor)}</span>
          </div>`).join('')}</div>` : '<div class="vazio">Nenhuma entrada neste mês. Toque em “+ Entrada” ✦</div>'}` })}`;
}

function ligarEntradas(el) {
  el.addEventListener('click', (e) => {
    const b = e.target.closest('button');
    if (!b) return;
    if (b.dataset.novaE !== undefined) E.abrirEntrada(null, { mes: estado.mes === isoMes() ? undefined : estado.mes });
    else if (b.dataset.editarE) E.abrirEntrada(E.todas().find((x) => x.id === b.dataset.editarE));
  });
}


/* =========================================================
   GASTOS (CPF e CNPJ)
   ========================================================= */
const FILTROS_GASTO = [['tudo', 'Tudo'], ['CNPJ', 'CNPJ'], ['CPF', 'CPF'], ['rev', 'Revisar']];

function gastos() {
  const s = S.calcular(estado.mes);
  const cfg = S.config();
  const q = normal(estado.buscaG.trim());
  const lista = s.L.filter((g) => {
    if (estado.filtroG === 'CNPJ' && g.conta !== 'CNPJ') return false;
    if (estado.filtroG === 'CPF' && g.conta !== 'CPF') return false;
    if (estado.filtroG === 'rev' && !g.revisar) return false;
    if (q && !normal(`${g.desc} ${g.cat} ${g.conta} ${S.nomeMeio(g.meio)}`).includes(q)) return false;
    return true;
  });
  const grupos = [];
  for (const g of lista) { if (!grupos.length || grupos.at(-1).data !== g.data) grupos.push({ data: g.data, itens: [] }); grupos.at(-1).itens.push(g); }
  const pagos = S.fixasPagas(estado.mes);
  const cores = s.categorias.map((c, i) => ({ ...c, cor: G.CORES[i % G.CORES.length] }));
  const dicas = S.dicas(estado.mes);

  return `
    <div class="grade g-kpi">
      ${kpi({ rot: 'Gasto no mês', valor: curto(s.total), sub: s.limite ? `limite de ${brl(s.limite)}` : '<button class="link-mini" data-cfg-g>definir limite</button>', extra: s.pctLimite == null ? '' : G.trilho(s.pctLimite, s.pctLimite >= 100 ? 'var(--neg-forte)' : s.pctLimite >= 80 ? 'var(--g3)' : 'var(--g4)'), classe: 'quente' })}
      ${kpi({ rot: 'CPF', valor: curto(s.cpf), sub: `${pct(s.cpf, s.total)}% do total`, classe: 'rosa' })}
      ${kpi({ rot: 'CNPJ', valor: curto(s.cnpj), sub: s.totalFixasCNPJ ? `${brl(s.totalFixasCNPJ)} em contas fixas (custo do trabalho)` : `${pct(s.cnpj, s.total)}% do total` })}
      ${kpi({ rot: 'Para revisar', valor: s.revisar, unidade: s.revisar === 1 ? 'gasto' : 'gastos', sub: s.revisar ? '<button class="link-mini" data-filtro-g="rev">ver agora</button>' : 'CPF ou CNPJ?' })}
    </div>

    <div class="grade g-12">
      ${painel({ rot: 'Para onde foi', titulo: 'Por <em>categoria</em>',
        corpo: `<div class="rosca-bloco">${G.rosca(cores, { centro: mini(s.total), sub: 'gastos do mês' })}
          <div class="legenda">${cores.length ? cores.slice(0, 7).map((c) => `<div><i style="background:${c.cor}"></i><span>${esc(c.rotulo)}</span><span class="p">${pct(c.valor, s.total)}%</span></div>`).join('') : '<div class="vazio" style="padding:0;text-align:left">Sem gastos neste mês.</div>'}</div></div>` })}
      ${painel({ rot: 'Faturas e contas fixas', titulo: 'O que <em>pagar</em>',
        corpo: `
          ${s.porMeio.length ? `<div class="linhas">${s.porMeio.map((m) => `<div class="linha"><span class="tx"><b>${esc(m.nome)}</b><small>${m.qtd} ${m.qtd === 1 ? 'lançamento' : 'lançamentos'}</small></span><span class="num">${brl(m.valor)}</span></div>`).join('')}</div>` : ''}
          ${s.F.length ? `<div class="rot">Contas fixas · ${s.fixasPagasN} de ${s.F.length} pagas</div>
            <div class="linhas quebra">${s.F.map((f) => `<div class="linha">
              <button class="caixa-chk ${pagos[f.id] ? 'ok' : ''}" data-fixa-paga="${f.id}" aria-label="Marcar ${esc(f.nome)}">${pagos[f.id] ? icone.check(14) : ''}</button>
              <button class="tx" data-fixa="${f.id}" style="text-align:left"><b style="${pagos[f.id] ? 'color:var(--soft)' : ''}">${esc(f.nome)}</b><small>vence dia ${f.dia} · ${f.conta}${f.conta === 'CNPJ' ? ' · custo do trabalho' : ''}</small></button>
              <span class="num">${brl(f.valor)}</span></div>`).join('')}</div>` : '<div class="vazio" style="padding:8px 0">Aluguel, luz, internet, academia… cadastre uma vez e elas entram todo mês.</div>'}
          ${s.futuros ? `<div class="dica"><span>Já comprometido nos próximos meses (parcelas): <b>${brl(s.futuros)}</b></span></div>` : ''}
          <div class="acts"><button class="btn contorno" data-nova-fixa>${icone.soma(16)} Conta fixa</button><button class="btn contorno" data-cfg-g>${icone.ajustes(16)} Ajustes</button></div>` })}
    </div>

    ${dicas.map((t) => `<div class="dica"><span>${t}</span></div>`).join('')}

    ${painel({ rot: 'Extrato', titulo: 'Lançamentos do <em>mês</em>',
      corpo: `
        <input class="busca" type="search" id="busca-g" placeholder="Buscar por descrição, categoria ou cartão" value="${esc(estado.buscaG)}" autocomplete="off">
        <div class="filtros">${FILTROS_GASTO.map(([v, n]) => `<button class="chip ${estado.filtroG === v ? 'acc' : ''}" data-filtro-g="${v}">${n}${v === 'rev' && s.revisar ? ` · ${s.revisar}` : ''}</button>`).join('')}
          <span style="flex:1"></span><button class="btn contorno" data-importar>Importar fatura</button><button class="btn pri" data-novo-g>${icone.soma(16)} Gasto</button></div>
        ${lista.length ? grupos.map((gr) => `
          <div class="dia-ext">${diaPorExtenso(deIso(gr.data))}</div>
          <div class="linhas">${gr.itens.map((g) => `
            <div class="linha">
              <button class="tx" data-editar-g="${g.id}" style="text-align:left"><b>${esc(g.desc)}</b>
                <small>${esc(g.cat)} · ${esc(S.nomeMeio(g.meio))}${g.revisar ? ' · <span class="chip neg" style="padding:1px 8px">revisar</span>' : ''}</small></button>
              <span class="chips" style="flex-direction:column;align-items:flex-end;gap:4px"><span class="num ${g.valor < 0 ? 'neg-txt' : ''}" style="font-weight:600">${brl(g.valor)}</span>
                <span class="chips">${g.revisar && estado.filtroG === 'rev' ? `<button class="chip pos" data-confirmar-g="${g.id}">confirmar</button>` : ''}<button class="chip ${g.conta === 'CNPJ' ? 'mid' : 'acc'}" data-trocar-g="${g.id}" aria-label="Trocar conta (agora ${g.conta})">${g.conta}</button></span></span>
            </div>`).join('')}</div>`).join('')
          : `<div class="vazio">${s.L.length ? 'Nada com esse filtro.' : 'Nenhum gasto neste mês. Toque em “+ Gasto” ou em “Importar fatura” ✦'}</div>`}` })}`;
}

function ligarGastos(el) {
  const acha = (id) => S.todos().find((g) => g.id === id);
  el.addEventListener('click', async (e) => {
    const b = e.target.closest('button');
    if (!b) return;
    const d = b.dataset;
    if (d.novoG !== undefined) S.abrirGasto(null, { mes: estado.mes });
    else if (d.editarG) S.abrirGasto(acha(d.editarG));
    else if (d.importar !== undefined) S.abrirImportacao();
    else if (d.trocarG) await S.trocarConta(acha(d.trocarG));
    else if (d.confirmarG) await S.confirmarGasto(acha(d.confirmarG));
    else if (d.filtroG) { estado.filtroG = d.filtroG; redesenhar(); }
    else if (d.novaFixa !== undefined) S.abrirFixa();
    else if (d.fixa) S.abrirFixa(S.fixasTodas().find((f) => f.id === d.fixa));
    else if (d.fixaPaga) await S.alternarFixaPaga(estado.mes, d.fixaPaga);
    else if (d.cfgG !== undefined) S.abrirConfigGastos();
  });
  const busca = el.querySelector('#busca-g');
  busca?.addEventListener('input', () => {
    estado.buscaG = busca.value;
    const pos = busca.selectionStart;
    redesenhar();
    const nova = ultimo.el.querySelector('#busca-g');
    nova.focus(); nova.setSelectionRange(pos, pos);
  });
}

/* =========================================================
   RESUMO GERAL (ganho líquido · saiu · sobrou)
   Ganho líquido = entradas − contas fixas do CNPJ (custos do trabalho).
   Saiu = TUDO: gastos CPF e CNPJ + contas fixas CPF e CNPJ.
   Sobrou = entradas − tudo que saiu.
   ========================================================= */
function resumo() {
  const ym = estado.mes;
  const s = S.calcular(ym), cfg = S.config();
  const entrou = E.total(ym);
  const ganho = r2(entrou - s.totalFixasCNPJ);
  const saiu = s.total;
  const sobrou = r2(entrou - saiu);
  const meta = E.meta();
  const metaPct = meta > 0 ? (ganho / meta) * 100 : null;
  const meses = Array.from({ length: 6 }, (_, i) => somarMeses(ym, i - 5));
  const barras = meses.map((m) => {
    const v = r2(E.total(m) - S.calcular(m).total);
    return { rotulo: mesPorExtenso(m).slice(0, 3).toLowerCase(), valor: Math.max(0, v), on: m === ym, dica: brl(v) };
  });
  const cores = s.categorias.map((x, i) => ({ ...x, cor: G.CORES[i % G.CORES.length] }));
  const sobraPct = cfg.metaSobra > 0 ? Math.max(0, (sobrou / cfg.metaSobra) * 100) : null;
  const dicas = S.dicas(ym);
  const linha = (cor, nome, valor) => `<div><i style="background:${cor}"></i><span>${nome}</span><span class="p">${brl(valor)}</span></div>`;
  const total = (nome, valor, cls = '') => `<div style="border-top:1px solid var(--line);padding-top:9px"><i style="background:transparent"></i><span><b>${nome}</b></span><span class="p ${cls}"><b>${brl(valor)}</b></span></div>`;
  return `
    <section class="resumo-hero">
      <div class="rot">Ganho líquido do mês</div>
      <div class="num2 ${ganho < 0 ? 'neg-txt' : ''}">${brl(Math.round(ganho)).replace(/,00$/, '')}</div>
      <small>depois das contas fixas do CNPJ · entrou ${curto(entrou)}</small>
      ${metaPct == null ? '<small><button type="button" class="link-mini" data-meta>definir meta do mês</button></small>'
        : `${G.trilho(metaPct, metaPct >= 100 ? 'var(--g4)' : 'var(--g1)')}<small><b class="${metaPct >= 100 ? 'pos-txt' : ''}">${Math.round(metaPct)}% da meta de ${brl(meta)}</b>${metaPct >= 100 ? ' · meta batida ✦' : ` · faltam ${brl(meta - ganho)}`} <button type="button" class="link-mini" data-meta>ajustar</button></small>`}
    </section>
    <div class="duas">
      ${kpi({ rot: 'Saiu', valor: curto(saiu), sub: `CNPJ ${curto(s.cnpj)} + CPF ${curto(s.cpf)}` })}
      ${kpi({ rot: 'Sobrou', valor: curto(sobrou), sub: `entrou ${curto(entrou)} − saiu ${curto(saiu)}`, extra: sobraPct == null ? '' : G.trilho(sobraPct, sobraPct >= 100 ? 'var(--g4)' : 'var(--g1)'), classe: 'verde' })}
    </div>
    <div class="grade g-2">
      ${painel({ rot: 'De onde veio', titulo: 'Ganho líquido',
        corpo: `<div class="legenda">
          ${linha('var(--g1)', 'Entradas', entrou)}
          ${linha('var(--g5)', 'Contas fixas CNPJ', -s.totalFixasCNPJ)}
          ${total('Ganho líquido', ganho, ganho < 0 ? 'neg-txt' : '')}</div>` })}
      ${painel({ rot: 'Para onde saiu', titulo: 'Saídas',
        corpo: `<div class="legenda">
          ${linha('var(--g5)', 'Contas fixas CNPJ', s.totalFixasCNPJ)}
          ${linha('var(--g7)', 'Outros gastos CNPJ', r2(s.cnpj - s.totalFixasCNPJ))}
          ${linha('var(--g2)', 'Contas fixas pessoais (CPF)', s.totalFixasCPF)}
          ${linha('var(--g4)', 'Outros gastos CPF', r2(s.cpf - s.totalFixasCPF))}
          ${total('Saiu (tudo)', saiu)}</div>
          <small style="color:var(--soft)">${cfg.metaSobra ? `Meta de sobra: ${brl(cfg.metaSobra)} (${sobrou >= cfg.metaSobra ? 'batida ✦' : `faltam ${brl(cfg.metaSobra - sobrou)}`}).` : '<button type="button" class="link-mini" data-cfg-g>definir meta de sobra</button>'}</small>` })}
    </div>
    <div class="grade g-2">
      ${painel({ rot: 'Para onde foi', titulo: 'Gastos por categoria',
        corpo: `<div class="rosca-bloco">${G.rosca(cores, { centro: mini(s.total), sub: 'CPF + CNPJ' })}
          <div class="legenda">${cores.length ? cores.slice(0, 7).map((x) => `<div><i style="background:${x.cor}"></i><span>${esc(x.rotulo)}</span><span class="p">${pct(x.valor, s.total)}%</span></div>`).join('') : '<div class="vazio" style="padding:0;text-align:left">Sem gastos neste mês.</div>'}</div></div>` })}
      ${painel({ rot: 'Quanto sobrou por mês', titulo: 'Últimos 6 meses', corpo: G.barras(barras, { altura: 150 }) })}
    </div>
    ${dicas.map((t) => `<div class="dica"><span>${t}</span></div>`).join('')}
    ${painel({ rot: 'Evolução', titulo: 'Analisar com o Claude',
      corpo: `<p class="sub" style="margin:0">Leva um resumo da evolução financeira (só números agrupados) para você colar numa conversa com o Claude e pedir análise e sugestões de mudança.</p><button type="button" class="btn pri" data-analise style="align-self:flex-start">Levar para o Claude</button>` })}`;
}
