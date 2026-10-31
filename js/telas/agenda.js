/* =========================================================
   Sistema · Rotina → Agenda
   Compromissos dos próximos 30 dias, por dia.
   A lógica fica em js/modulos/compromissos.js.
   ========================================================= */

import { painel, icone } from '../nucleo/ui.js';
import { esc, isoDia, somarDias } from '../nucleo/util.js';
import * as M from '../modulos/compromissos.js';
import * as K from '../modulos/clientes.js';

/** Uma linha de compromisso (também usada no painel Hoje). */
export function linhaCompromisso(c) {
  const cliente = K.pega(c.clienteId)?.nome;
  const detalhe = [M.tipo(c.tipo).nome, c.local && esc(c.local), cliente && esc(cliente), c.repete === 'semanal' && 'toda semana'].filter(Boolean).join(' · ');
  return `<div class="linha">
    <span class="hora">${M.horaCurta(c.hora)}</span>
    <button type="button" class="tx" data-comp="${c.id}" style="text-align:left"><b>${esc(c.titulo)}</b><small><span class="dot" style="background:${M.tipo(c.tipo).cor}"></span>${detalhe}</small></button>
    <a class="chip" href="${esc(M.linkGoogle(c))}" target="_blank" rel="noopener" aria-label="Enviar ao Google Agenda: ${esc(c.titulo)}">Google</a>
  </div>`;
}

export function desenhar() {
  const hoje = isoDia();
  const dias = M.periodo(hoje, somarDias(hoje, 30));
  return `
    <div class="filtros" style="justify-content:flex-end"><button type="button" class="btn pri" data-novo-comp>${icone.soma(16)} Compromisso</button></div>
    ${dias.length
      ? dias.map(({ dia, itens }) => painel({ rot: dia === hoje ? 'Hoje' : dia === somarDias(hoje, 1) ? 'Amanhã' : 'Agenda', titulo: K.dataCurta(dia), corpo: `<div class="linhas">${itens.map(linhaCompromisso).join('')}</div>` })).join('')
      : painel({ rot: 'Agenda', titulo: 'Próximos 30 dias', corpo: '<div class="vazio">Nenhum compromisso marcado. Audiências, reuniões e aulas entram aqui ✦</div>' })}
    <small style="color:var(--soft)">O botão “Google” abre o evento preenchido para você confirmar lá. O envio é em uma só direção: o que mudar no Google não volta para cá.</small>`;
}

export function ligar(el) {
  el.addEventListener('click', (e) => {
    const b = e.target.closest('button');
    if (!b) return;
    if (b.dataset.novoComp !== undefined) M.abrirCompromisso();
    else if (b.dataset.comp) M.abrirCompromisso(M.todos().find((c) => c.id === b.dataset.comp));
  });
}
