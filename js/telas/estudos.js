/* =========================================================
   Sistema · Estudos
   Quadro com três colunas (Quero estudar, Estudando, Concluído).
   A lógica fica em js/modulos/estudos.js.
   ========================================================= */

import * as G from '../nucleo/graficos.js';
import * as avisos from '../nucleo/avisos.js';
import { cabecalho, painel, kpi, icone, areaLimpa } from '../nucleo/ui.js';
import { esc, isoDia, deIso, diaMes } from '../nucleo/util.js';
import * as E from '../modulos/estudos.js';

const estado = { tipo: 'todos' };
let ultimo = null;

export function desenhar(el) {
  el = areaLimpa(el);
  ultimo = { el };
  const hoje = isoDia();
  const todos = E.todos();
  const filtro = (l) => (estado.tipo === 'todos' ? l : l.filter((e) => e.tipo === estado.tipo));
  const ano = hoje.slice(0, 4);
  const concluidosAno = todos.filter((e) => e.status === 'concluido' && (e.concluidoEm || '').startsWith(ano)).length;
  const comPrazo = todos.filter((e) => e.limite && e.status !== 'concluido').sort((a, b) => a.limite.localeCompare(b.limite))[0];

  const card = (e) => {
    const t = E.tipo(e.tipo);
    const p = E.pct(e);
    const dias = e.limite && e.status !== 'concluido' ? Math.round((deIso(e.limite) - deIso(hoje)) / 86400000) : null;
    return `<div class="estudo" style="--a:${t.cor}">
      <button type="button" class="tx" data-estudo="${e.id}"><b>${esc(e.titulo)}</b><small>${t.nome}${e.autor ? ` · ${esc(e.autor)}` : ''}</small></button>
      ${p != null ? `${G.trilho(p, t.cor)}<small class="cap">${Number(e.feito) || 0} de ${e.total} ${t.unidade} · ${p}%</small>` : ''}
      <div class="chips">
        ${dias != null ? `<span class="chip ${dias < 0 ? 'neg' : dias <= 14 ? 'mid' : ''}">${dias < 0 ? 'limite passou' : dias === 0 ? 'limite hoje' : `limite ${diaMes(e.limite)}`}</span>` : ''}
        ${e.valor ? '<span class="chip">pago</span>' : ''}
        ${e.nota ? '<span class="chip">com anotação</span>' : ''}
      </div>
      <div class="chips">
        ${e.status === 'estudando' && t.id === 'curso' && Number(e.total) > 0 ? `<button type="button" class="chip acc" data-mais="${e.id}">+1 aula</button>` : ''}
        ${e.status !== 'concluido' ? `<button type="button" class="chip" data-avancar="${e.id}">${e.status === 'quero' ? 'começar' : 'concluir'} ${icone.seta(12)}</button>` : ''}
        ${e.ref ? `<a class="chip" href="${esc(e.ref)}" target="_blank" rel="noopener">abrir link</a>` : ''}
      </div>
    </div>`;
  };

  const coluna = (st) => {
    const lista = filtro(E.doStatus(st.id));
    const mostrar = st.id === 'concluido' ? lista.slice(0, 8) : lista;
    return painel({ rot: st.nome, titulo: `${lista.length} ${lista.length === 1 ? 'item' : 'itens'}`,
      corpo: lista.length ? `<div class="estudos-lista">${mostrar.map(card).join('')}</div>${lista.length > mostrar.length ? `<small style="color:var(--soft)">e mais ${lista.length - mostrar.length} concluídos</small>` : ''}`
        : `<div class="vazio">${st.id === 'quero' ? 'Guarde aqui o que você quer estudar.' : st.id === 'estudando' ? 'Nada em andamento agora.' : 'Ainda nada concluído.'}</div>` });
  };

  el.innerHTML = `
    ${cabecalho({ voltar: ['#/mais', 'Mais'], sup: 'Frentes', titulo: 'Estudos', avisos: avisos.todos().length })}
    <div class="grade g-kpi">
      ${kpi({ rot: 'Estudando', valor: E.doStatus('estudando').length, sub: 'em andamento' })}
      ${kpi({ rot: 'Quero estudar', valor: E.doStatus('quero').length, sub: 'na fila' })}
      ${kpi({ rot: `Concluídos em ${ano}`, valor: concluidosAno, sub: 'neste ano' })}
      ${kpi({ rot: 'Próxima data limite', valor: comPrazo ? diaMes(comPrazo.limite) : '—', sub: comPrazo ? esc(comPrazo.titulo) : 'nenhum curso com prazo' })}
    </div>
    <div class="filtros">
      ${[['todos', 'Todos'], ...E.TIPOS.map((t) => [t.id, t.plural])].map(([id, n]) => `<button type="button" class="chip ${estado.tipo === id ? 'acc' : ''}" data-tipo="${id}">${n}</button>`).join('')}
      <span style="flex:1"></span>
      <button type="button" class="btn pri" data-novo>${icone.soma(16)} Estudo</button>
    </div>
    <div class="grade g-3">${E.STATUS.map(coluna).join('')}</div>`;

  el.addEventListener('click', async (ev) => {
    const b = ev.target.closest('button');
    if (!b) return;
    const d = b.dataset;
    const achar = (id) => E.todos().find((x) => x.id === id);
    if (d.novo !== undefined) E.abrirEstudo(null, { prefill: estado.tipo !== 'todos' ? { tipo: estado.tipo } : {} });
    else if (d.tipo) { estado.tipo = d.tipo; desenhar(ultimo.el); }
    else if (d.estudo) E.abrirEstudo(achar(d.estudo));
    else if (d.avancar) await E.avancar(achar(d.avancar));
    else if (d.mais) await E.somarProgresso(achar(d.mais), 1);
  });
}
