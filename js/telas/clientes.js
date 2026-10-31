/* =========================================================
   Sistema · Clientes
   Duas partes: Clientes (fichas) e Prazos.
   Endereços: #/clientes/lista, #/clientes/prazos e
   #/clientes/lista/ficha/<id> (usado pelos avisos).
   A lógica fica em js/modulos/clientes.js.
   ========================================================= */

import * as avisos from '../nucleo/avisos.js';
import { cabecalho, painel, kpi, abas, icone, areaLimpa, toast } from '../nucleo/ui.js';
import { esc, normal, isoDia } from '../nucleo/util.js';
import * as K from '../modulos/clientes.js';

const PARTES = [
  { rota: 'lista', nome: 'Clientes', desenhar: lista, ligar: ligarLista },
  { rota: 'prazos', nome: 'Prazos', desenhar: prazos, ligar: ligarPrazos },
];
const FILTROS = [['tudo', 'Todos'], ['ativos', 'Em andamento'], ['concluidos', 'Concluídos']];
const estado = { busca: '', filtro: 'tudo' };
let ultimo = null;

export function desenhar(el, partes = ultimo?.partes ?? []) {
  el = areaLimpa(el);
  ultimo = { el, partes };
  const atual = PARTES.find((p) => p.rota === partes[0]) || PARTES[0];
  const hoje = isoDia();
  const n = K.contagem();
  const abertos = K.abertos();
  el.innerHTML = `
    ${cabecalho({ sup: 'Trabalho', titulo: 'Clientes e prazos', avisos: avisos.todos().length })}
    <div class="grade g-kpi">
      ${kpi({ rot: 'Prazos abertos', valor: abertos.length, sub: K.paraOlhar(hoje).length ? `${K.paraOlhar(hoje).length} para olhar agora` : 'nada urgente' })}
      ${kpi({ rot: 'Clientes', valor: K.todos().length, sub: 'cadastrados' })}
      ${kpi({ rot: 'Casos ativos', valor: n.ativos, sub: `${n.concluidos} concluídos` })}
      ${kpi({ rot: 'Extrajudiciais', valor: n.extrajudicial, sub: 'no histórico' })}
    </div>
    ${abas('clientes', PARTES, atual.rota)}
    ${atual.desenhar(hoje)}`;
  atual.ligar(el, hoje);
  // Endereço de um aviso (#/clientes/lista/ficha/<id>): abre a ficha e volta o endereço para a lista.
  if (partes[1] === 'ficha' && partes[2]) {
    history.replaceState(null, '', '#/clientes/lista');
    ultimo.partes = ['lista'];
    K.abrirFicha(partes[2]);
  }
}

/* ---------- clientes ---------- */

function listar(hoje) {
  const q = normal(estado.busca.trim());
  const itens = K.todos().map((c) => ({ c, casos: K.casosDe(c.id), abertos: K.prazosDe(c.id).filter((p) => p.status !== 'cumprido') })).filter(({ c, casos }) => {
    if (q && !normal(`${c.nome} ${c.origem || ''} ${casos.map((k) => `${k.titulo} ${k.materia || ''}`).join(' ')}`).includes(q)) return false;
    const ativo = casos.some((k) => k.situacao !== 'concluido');
    if (estado.filtro === 'ativos') return ativo;
    if (estado.filtro === 'concluidos') return casos.length && !ativo;
    return true;
  });
  if (!itens.length) return `<div class="vazio">${K.todos().length ? 'Ninguém encontrado com esse filtro.' : 'Nenhum cliente cadastrado ainda. Toque em “+ Cliente” para começar ✦'}</div>`;
  return `<div class="linhas">${itens.map(({ c, casos, abertos }) => {
    const urgente = abertos.map((p) => K.estadoPrazo(p, hoje)).find((e) => e.etapa !== 'adiante');
    return `<div class="linha">
      <button type="button" class="inicial" data-ficha="${c.id}" aria-label="Abrir ficha de ${esc(c.nome)}">${esc(c.nome.trim().charAt(0).toUpperCase())}</button>
      <button type="button" class="tx" data-ficha="${c.id}"><b>${esc(c.nome)}</b><small>${casos.length} ${casos.length === 1 ? 'caso' : 'casos'}${abertos.length ? ` · ${abertos.length} ${abertos.length === 1 ? 'prazo aberto' : 'prazos abertos'}` : ''}</small></button>
      ${urgente ? `<span class="chip ${urgente.classe}">${urgente.texto}</span>` : ''}
    </div>`; }).join('')}</div>`;
}

function lista(hoje) {
  const aniv = K.aniversarios(hoje);
  return `
    <div class="alert ok"><span class="d"></span><div>${icone.cadeado(15)} Aqui ficam só dados de gestão dos seus clientes próprios, embaralhados com a sua senha. Documentos e detalhes dos casos continuam nas suas pastas.</div></div>
    <div class="grade g-21">
      ${painel({ rot: 'Fichas', titulo: 'Seus clientes',
        corpo: `
          <div class="filtros" style="margin-bottom:12px">
            <input class="busca" type="search" id="busca-cli" placeholder="Buscar cliente, caso ou matéria" value="${esc(estado.busca)}" autocomplete="off" style="flex:1;min-width:160px;width:auto">
            <button type="button" class="btn pri" data-novo>${icone.soma(16)} Cliente</button>
          </div>
          <div class="filtros" style="margin-bottom:6px">${FILTROS.map(([v, n]) => `<button type="button" class="chip ${estado.filtro === v ? 'acc' : ''}" data-filtro="${v}">${n}</button>`).join('')}</div>
          <div id="lista-cli">${listar(hoje)}</div>` })}
      ${painel({ rot: 'Na semana', titulo: 'Aniversários',
        corpo: aniv.length ? `<div class="linhas">${aniv.map(({ c, dia }) => `<div class="linha"><button type="button" class="tx" data-ficha="${c.id}"><b>${esc(c.nome)}</b><small>${K.dataCurta(dia)}</small></button></div>`).join('')}</div>`
          : '<div class="vazio">Nenhum aniversário nesta semana.</div>' })}
    </div>`;
}

function ligarLista(el, hoje) {
  el.addEventListener('click', (e) => {
    const b = e.target.closest('button');
    if (!b) return;
    if (b.dataset.ficha) K.abrirFicha(b.dataset.ficha);
    else if (b.dataset.novo !== undefined) K.abrirCliente();
    else if (b.dataset.filtro) {
      estado.filtro = b.dataset.filtro;
      el.querySelectorAll('[data-filtro]').forEach((x) => x.classList.toggle('acc', x === b));
      el.querySelector('#lista-cli').innerHTML = listar(hoje);
    }
  });
  el.querySelector('#busca-cli').addEventListener('input', (e) => {
    estado.busca = e.target.value;
    el.querySelector('#lista-cli').innerHTML = listar(hoje);
  });
}

/* ---------- prazos ---------- */

const GRUPOS = [['Vencidos', 'vencido'], ['Hoje', 'hoje'], ['Em aviso', 'aviso'], ['Mais adiante', 'adiante']];

export function linhaPrazo(p, hoje) {
  const e = K.estadoPrazo(p, hoje);
  const origem = K.origemDoPrazo(p);
  return `<div class="linha">
    <button type="button" class="caixa-chk" data-cumprir="${p.id}" aria-label="Marcar como cumprido: ${esc(p.descricao)}"></button>
    <button type="button" class="tx" data-prazo="${p.id}"><b>${esc(p.descricao)}</b><small>${K.dataCurta(p.data)} · ${K.tipoPrazo(p.tipo).nome}${origem ? ` · ${esc(origem)}` : ''}</small></button>
    <span class="chip ${e.classe}">${e.texto}</span>
  </div>`;
}

function prazos(hoje) {
  const abertos = K.abertos();
  const feitos = K.cumpridos().slice(0, 8);
  return `
    <div class="alert mid"><span class="d"></span><div>${K.AVISO_LEGAL}</div></div>
    <div class="filtros" style="justify-content:space-between">
      <button type="button" class="btn pri" data-novo-prazo>${icone.soma(16)} Prazo</button>
      <button type="button" class="btn sec" data-calendario>Alarmes no calendário</button>
    </div>
    <small style="color:var(--soft)">Os alarmes avisam mesmo com o app fechado. Eles não levam nome de cliente, porque o calendário fica fora do cofre. Ao cumprir ou apagar um prazo, apague o alarme no calendário.</small>
    ${abertos.length
      ? GRUPOS.map(([titulo, etapa]) => { const l = abertos.filter((p) => K.estadoPrazo(p, hoje).etapa === etapa); return l.length ? painel({ rot: 'Prazos', titulo, corpo: `<div class="linhas">${l.map((p) => linhaPrazo(p, hoje)).join('')}</div>` }) : ''; }).join('')
      : painel({ rot: 'Prazos', titulo: 'Abertos', corpo: '<div class="vazio">Nenhum prazo aberto.</div>' })}
    ${feitos.length ? painel({ rot: 'Histórico', titulo: 'Cumpridos', corpo: `<div class="linhas">${feitos.map((p) => `<div class="linha">
      <button type="button" class="caixa-chk ok" data-cumprir="${p.id}" aria-label="Reabrir: ${esc(p.descricao)}">${icone.check(14)}</button>
      <button type="button" class="tx" data-prazo="${p.id}"><b style="color:var(--soft)">${esc(p.descricao)}</b><small>${K.dataCurta(p.data)}</small></button></div>`).join('')}</div>` }) : ''}`;
}

function ligarPrazos(el) {
  const acha = (id) => K.prazos().find((p) => p.id === id);
  el.addEventListener('click', async (e) => {
    const b = e.target.closest('button');
    if (!b) return;
    const d = b.dataset;
    if (d.novoPrazo !== undefined) K.abrirPrazo();
    else if (d.prazo) K.abrirPrazo(acha(d.prazo));
    else if (d.cumprir) await K.alternarCumprido(acha(d.cumprir));
    else if (d.calendario !== undefined) { if (!(await K.enviarParaCalendario())) toast('Nenhum prazo aberto de hoje em diante.'); }
  });
}
