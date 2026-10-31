/* =========================================================
   Sistema · Vencimentos e documentos
   Linha do tempo do que vence, por urgência.
   A lógica fica em js/modulos/vencimentos.js.
   ========================================================= */

import * as avisos from '../nucleo/avisos.js';
import { cabecalho, painel, kpi, icone, areaLimpa, toast } from '../nucleo/ui.js';
import { esc, isoDia, diaMes, deIso } from '../nucleo/util.js';
import * as V from '../modulos/vencimentos.js';

const estado = { cat: 'todas' };
let ultimo = null;

export function desenhar(el) {
  el = areaLimpa(el);
  ultimo = { el };
  const hoje = isoDia();

  // Vencimentos de todas as categorias, numa lista só
  const itens = [
    ...V.todos().map((v) => ({ tipo: 'v', id: v.id, nome: v.nome, data: v.data, cat: v.categoria, sub: `${V.categoria(v.categoria).nome} · ${V.nomeRecorrencia(v.recorrencia).toLowerCase()}`, s: V.status(v, hoje), v })),
  ].sort((a, b) => a.data.localeCompare(b.data));
  const filtrados = estado.cat === 'todas' ? itens : itens.filter((i) => i.cat === estado.cat);

  const grupos = [
    ['Vencidos', (i) => i.s.dias < 0, 'neg'],
    ['Nos próximos 30 dias', (i) => i.s.dias >= 0 && i.s.dias <= 30],
    ['Entre 30 e 90 dias', (i) => i.s.dias > 30 && i.s.dias <= 90],
    ['Mais adiante', (i) => i.s.dias > 90],
  ];
  const vencidos = itens.filter((i) => i.s.dias < 0).length;
  const proximos = itens.filter((i) => i.s.dias >= 0 && i.s.dias <= 30).length;

  const linha = (i) => `<div class="linha">
    <span class="marca-area" style="background:${V.categoria(i.cat).cor}"></span>
    <button type="button" class="tx" data-${i.tipo === 'v' ? 'venc' : 'doc'}="${i.id}"><b>${esc(i.nome)}</b><small>${esc(i.sub)} · ${diaMes(i.data)}/${i.data.slice(0, 4)}${i.v?.valor ? ` · ${Number(i.v.valor).toLocaleString('pt-BR', { style: 'currency', currency: 'BRL' })}` : ''}</small></button>
    <span class="chip ${i.s.tipo}">${i.s.texto}</span>
    ${i.tipo === 'v' ? `<button type="button" class="chip acc" data-renovei="${i.id}">renovei</button>` : ''}
  </div>`;

  el.innerHTML = `
    ${cabecalho({ voltar: ['#/mais', 'Mais'], sup: 'Organização', titulo: 'Vencimentos e documentos', avisos: avisos.todos().length })}
    <div class="grade g-kpi">
      ${kpi({ rot: 'Vencidos', valor: vencidos, sub: vencidos ? 'renove assim que puder' : 'nenhum' })}
      ${kpi({ rot: 'Próximos 30 dias', valor: proximos, sub: proximos ? 'a renovar logo' : 'nada chegando' })}
      ${kpi({ rot: 'Cadastrados', valor: itens.length, sub: itens.length ? 'com data de vencimento' : 'cadastre os seus' })}
      <div class="kpi"><div class="rot">Novo</div><button type="button" class="btn pri" data-novo style="margin-top:4px">${icone.soma(16)} Vencimento</button></div>
    </div>

    <div class="filtros" style="justify-content:space-between"><div class="filtros">${[['todas', 'Todos'], ...V.CATEGORIAS.map((c) => [c.id, c.nome])].map(([id, n]) => `<button type="button" class="chip ${estado.cat === id ? 'acc' : ''}" data-cat="${id}">${n}</button>`).join('')}</div>
      <button type="button" class="btn sec" data-calendario>Alarmes no calendário</button></div>

    ${filtrados.length
      ? grupos.map(([titulo, teste]) => { const l = filtrados.filter(teste); return l.length ? painel({ rot: 'Linha do tempo', titulo, corpo: `<div class="linhas">${l.map(linha).join('')}</div>` }) : ''; }).join('')
      : painel({ rot: 'Linha do tempo', titulo: 'O que vence', corpo: '<div class="vazio">Nenhum vencimento cadastrado ainda. Use os atalhos abaixo para começar.</div>' })}

    ${painel({ rot: 'Atalhos', titulo: 'Cadastrar rápido',
      corpo: `<div class="chips">${V.SUGESTOES.map(([nome, cat, rec], i) => `<button type="button" class="chip" data-sug="${i}">${esc(nome)}</button>`).join('')}</div>
        <small style="color:var(--soft)">O atalho só preenche o formulário. Você escolhe a data e confirma.</small>` })}`;

  el.addEventListener('click', async (e) => {
    const b = e.target.closest('button');
    if (!b) return;
    const d = b.dataset;
    if (d.novo !== undefined) V.abrirVencimento();
    else if (d.cat) { estado.cat = d.cat; desenhar(ultimo.el); }
    else if (d.calendario !== undefined) { const n = await V.enviarParaCalendario(); if (!n) toast('Cadastre um vencimento primeiro.'); }
    else if (d.venc) V.abrirVencimento(V.todos().find((v) => v.id === d.venc));
    else if (d.renovei) await V.renovar(V.todos().find((v) => v.id === d.renovei));
    else if (d.sug !== undefined) { const [nome, categoria, recorrencia] = V.SUGESTOES[Number(d.sug)]; V.abrirVencimento(null, { prefill: { nome, categoria, recorrencia } }); }
  });
}
