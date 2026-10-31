/* =========================================================
   Sistema · módulo Revisão semanal
   Passo a passo de uns 10 minutos, na segunda-feira: fecha a semana
   que passou e planeja a que começa:
   1. como foi a semana · 2. dinheiro · 3. hábitos e metas ·
   4. pendências · 5. planejar a próxima semana.
   O sistema junta os números sozinho; você escreve o que deu
   certo, o que melhorar e as prioridades da semana seguinte.

   Revisão (coleção "revisoes"):
     { semana: 'AAAA-MM-DD' (a segunda-feira), certo, melhorar, prioridades, concluidaEm }
   ========================================================= */

import { MARCA } from '../nucleo/marca.js';
import * as dados from '../nucleo/dados.js';
import * as avisos from '../nucleo/avisos.js';
import { r2, isoDia, isoMes, deIso, somarDias, segundaDaSemana, diasDaSemana, pref } from '../nucleo/util.js';
import { abrirFolha, fecharFolha } from '../nucleo/ui.js';
import * as lembretes from '../nucleo/lembretes.js';
import * as T from './tarefas.js';
import * as H from './habitos.js';
import * as M from './metas.js';
import * as S from './gastos.js';
import * as Ho from './honorarios.js';
import * as V from './vencimentos.js';
import * as K from './clientes.js';

const COL = 'revisoes';

export const todas = () => dados.lista(COL).sort((a, b) => b.semana.localeCompare(a.semana));
export const daSemana = (segunda) => dados.lista(COL).find((r) => r.semana === segunda) ?? null;

export async function concluir(segunda, { certo, melhorar, prioridades }) {
  const atual = daSemana(segunda);
  return dados.salva(COL, { ...(atual || {}), semana: segunda, certo, melhorar, prioridades, concluidaEm: Date.now() });
}

const dia = (ms) => isoDia(new Date(ms));

/** Os números da semana que começa em `segunda` e o que vem pela frente. */
export function coletar(segunda, hoje = isoDia()) {
  const dom = somarDias(segunda, 6);
  const dentro = (d) => !!d && d >= segunda && d <= dom;
  const dias = diasDaSemana(segunda);
  const prox = somarDias(segunda, 7);
  const domProx = somarDias(prox, 6);

  const feitas = T.todas().filter((t) => t.status === 'feita' && t.feitaEm && dentro(dia(t.feitaEm)));
  const entradas = Ho.entrouEntre(segunda, dom);
  const gastos = S.todos().filter((g) => dentro(g.data));
  const ym = isoMes(hoje.length === 10 ? deIso(hoje) : new Date());
  const metasAtras = M.doSemestre(M.semestreDe(hoje)).map((m) => ({ m, p: M.progresso(m, M.semestreDe(hoje)) }))
    .filter(({ p }) => p.alvo > 0 && p.pct < 100 && p.pct < M.andamento(M.semestreDe(hoje), hoje).fracao * 100 - 25);

  return {
    segunda, dom, prox, domProx,
    feitas,
    entradas, entradasTotal: r2(entradas.reduce((s, e) => s + (Number(e.valor) || 0), 0)),
    gastos, gastosTotal: r2(gastos.reduce((s, g) => s + (Number(g.valor) || 0), 0)),
    entrouMes: Ho.totalMes(ym), saiuMes: S.calcular(ym).total,
    paraRevisar: S.paraRevisar().length,
    habitos: H.lista().map((h) => ({ h, marcas: dias.map((d) => H.feitoEm(h, d)), feitos: dias.filter((d) => H.feitoEm(h, d)).length, meta: h.freq?.tipo === 'semana' ? h.freq.vezes : 7 })),
    metasAtras,
    atrasadas: T.atrasadas(hoje), semDia: T.semDia(),
    pendencias: avisos.todos().filter((a) => a.id !== 'backup'),
    proxima: {
      plano: T.resumoSemana(prox),
      prazosProc: K.abertos().filter((p) => p.data <= domProx),
      prazos: T.todas().filter((t) => t.status === 'aberta' && t.prazo && t.prazo >= prox && t.prazo <= domProx),
      vencimentos: V.todos().filter((v) => v.data >= prox && v.data <= somarDias(prox, 13)),
    },
  };
}

/* ---------- aviso ---------- */

/** A semana que a revisão fecha: a que terminou no último domingo. */
export const semanaARevisar = (hoje = isoDia()) => somarDias(segundaDaSemana(hoje), -7);

avisos.registrar('revisao', () => {
  const hoje = isoDia();
  const dow = (deIso(hoje).getDay() + 6) % 7; // 0 = segunda … 6 = domingo
  if (daSemana(semanaARevisar(hoje))) return [];
  if (dow === 0) return [{ id: 'revisao', tipo: 'info', prioridade: 4, irPara: '#/mais/revisao', texto: 'Hoje é dia da <strong>revisão semanal</strong>: uns 10 minutos para fechar a semana e planejar esta.' }];
  if (dow === 1 && dados.lista('tarefas').length) return [{ id: 'revisao', tipo: 'info', prioridade: 3, irPara: '#/mais/revisao', texto: 'A revisão da semana passada não foi feita. Dá tempo de fazer agora.' }];
  return [];
});

/* ---------- lembrete de segunda no calendário ---------- */

/** Pergunta o horário e cria o lembrete que se repete toda segunda. */
export function abrirLembreteSegunda() {
  const f = abrirFolha(`
    <h3>Lembrete de segunda</h3>
    <p class="sub">O calendário do aparelho avisa toda segunda, no horário que você escolher, para fazer a revisão semanal (uns 10 minutos).</p>
    <form id="f-dom" novalidate>
      <div class="fld"><label for="d-hora">Horário</label><input id="d-hora" type="time" value="${pref.ler('horaRevisao', '08:00')}"></div>
      <div class="acts"><button type="button" class="btn sec" data-fechar>Cancelar</button><button type="submit" class="btn pri">Adicionar ao Calendário</button></div>
    </form>`);
  f.querySelector('[data-fechar]').onclick = fecharFolha;
  f.querySelector('#f-dom').onsubmit = async (ev) => {
    ev.preventDefault();
    const hora = f.querySelector('#d-hora').value || '08:00';
    pref.gravar('horaRevisao', hora);
    fecharFolha();
    // primeira segunda de hoje em diante
    const hoje = isoDia();
    const ate = (7 - ((deIso(hoje).getDay() + 6) % 7)) % 7;
    await lembretes.entregar(lembretes.calendario([lembretes.evento({
      uid: `${MARCA.id}-revisao@${MARCA.id}`, titulo: `Revisão semanal do ${MARCA.nome}`, descricao: 'Uns 10 minutos para fechar a semana e planejar a próxima.',
      inicio: `${somarDias(hoje, ate)}T${hora}`, duracao: 30, regra: 'FREQ=WEEKLY;BYDAY=MO', alarmes: ['PT0M'],
    })]), 'revisao-semanal.ics');
  };
}
