/* =========================================================
   Sistema · Mais
   Os módulos que não estão na barra de baixo, em blocos
   visuais. Endereços: #/mais e #/mais/<parte>
   Começa vazio; chega nas etapas 7 a 11.
   ========================================================= */

import * as G from '../nucleo/graficos.js';
import { cabecalho, painel, kpi, icone } from '../nucleo/ui.js';
import * as ajustes from './ajustes.js';
import * as vencimentosTela from './vencimentos.js';
import * as V from '../modulos/vencimentos.js';
import * as revisaoTela from './revisao.js';
import * as estudosTela from './estudos.js';
import * as Es from '../modulos/estudos.js';
import * as Rv from '../modulos/revisao.js';
import { segundaDaSemana } from '../nucleo/util.js';

const PARTES = [
  { rota: 'estudos', nome: 'Estudos', desc: 'Cursos, artigos, livros e temas', icone: icone.estudos, chips: () => `<span class="chip">${Es.doStatus('estudando').length} estudando</span><span class="chip">${Es.doStatus('quero').length} na fila</span>`, tela: estudosTela },
  { rota: 'vencimentos', nome: 'Vencimentos', desc: 'Anuidade, certificado, CNH, IPVA…', icone: icone.vencimentos, chips: () => { const n = V.todos().filter((v) => { const s = V.status(v); return s.dias != null && s.dias <= 30; }).length; return n ? `<span class="chip neg">${n} vencendo</span>` : `<span class="chip">${V.todos().length ? 'tudo em dia' : 'nada cadastrado'}</span>`; }, tela: vencimentosTela },
  { rota: 'revisao', nome: 'Revisão semanal', desc: 'Domingo, 10 minutos', icone: icone.revisao, chips: () => `<span class="chip ${Rv.daSemana(segundaDaSemana()) ? 'pos' : ''}">${Rv.daSemana(segundaDaSemana()) ? 'feita nesta semana' : 'próxima: domingo'}</span>`, tela: revisaoTela },
  { rota: 'ajustes', nome: 'Ajustes e backup', desc: 'Senha, aparência, backup', icone: icone.ajustes, chips: () => '', tela: ajustes },
];

export function desenhar(el, [sub, ...resto]) {
  const parte = PARTES.find((p) => p.rota === sub);
  if (parte?.tela) return parte.tela.desenhar(el, resto);
  if (parte) {
    el.innerHTML = `${cabecalho({ voltar: ['#/mais', 'Mais'], titulo: parte.nome })}${parte.desenhar()}`;
    return;
  }
  el.innerHTML = `
    ${cabecalho({ sup: 'Tudo o mais', titulo: 'Suas <em>frentes</em>' })}
    <div class="grade g-3">${PARTES.map((p) => `
      <a class="ladrilho" href="#/mais/${p.rota}">
        <span class="ic">${p.icone(22)}</span>
        <b>${p.nome}</b><small>${p.desc}</small>
        <span class="rodape chips">${p.chips()}</span>
      </a>`).join('')}</div>`;
}

