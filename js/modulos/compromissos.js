/* =========================================================
   Sistema · módulo Compromissos
   Audiências, reuniões, aulas e o que tiver hora marcada. São
   lançados aqui e enviados ao Google Agenda por um botão, em uma
   só direção: o que mudar lá não volta para cá.

   Compromisso (coleção "compromissos"):
     { titulo, tipo: 'audiencia' | 'reuniao' | 'aula' | 'outro',
       data: 'AAAA-MM-DD', hora: 'HH:MM', horaFim, local, clienteId,
       repete: 'nao' | 'semanal', ate: 'AAAA-MM-DD' }
   O cliente ligado NÃO vai para o Google; título e local vão.
   ========================================================= */

import * as dados from '../nucleo/dados.js';
import { abrirFolha, fecharFolha, toast, confirmar } from '../nucleo/ui.js';
import { esc, isoDia, deIso, somarDias } from '../nucleo/util.js';
import * as K from './clientes.js';

const COL = 'compromissos';

export const TIPOS = [
  { id: 'audiencia', nome: 'Audiência', cor: 'var(--g2)' },
  { id: 'reuniao', nome: 'Reunião', cor: 'var(--g6)' },
  { id: 'aula', nome: 'Aula', cor: 'var(--g3)' },
  { id: 'outro', nome: 'Outro', cor: 'var(--g5)' },
];
export const tipo = (id) => TIPOS.find((t) => t.id === id) ?? TIPOS[3];
export const horaCurta = (h) => (!h ? 'dia todo' : h.endsWith(':00') ? `${h.slice(0, 2)}h` : h.replace(':', 'h'));

export const todos = () => dados.lista(COL);
const porHora = (a, b) => a.data.localeCompare(b.data) || (a.hora || '').localeCompare(b.hora || '');

/** Vale neste dia? O semanal repete no mesmo dia da semana, da data inicial até "ate". */
function caiEm(c, iso) {
  if (c.repete !== 'semanal') return c.data === iso;
  if (iso < c.data || (c.ate && iso > c.ate)) return false;
  return deIso(iso).getDay() === deIso(c.data).getDay();
}

export const doDia = (iso = isoDia()) => todos().filter((c) => caiEm(c, iso)).map((c) => ({ ...c, dia: iso })).sort((a, b) => (a.hora || '').localeCompare(b.hora || ''));

/** Dias de `de` a `ate` que têm compromisso: [{ dia, itens }]. */
export function periodo(de, ate) {
  const out = [];
  for (let d = de; d <= ate; d = somarDias(d, 1)) {
    const itens = doDia(d);
    if (itens.length) out.push({ dia: d, itens });
  }
  return out;
}

/* ---------- enviar ao Google Agenda ---------- */

const compacto = (iso, hora) => `${iso.replace(/-/g, '')}${hora ? `T${hora.replace(':', '')}00` : ''}`;
function maisUmaHora(hora) {
  const [h, m] = hora.split(':').map(Number);
  return `${String(Math.min(h + 1, 23)).padStart(2, '0')}:${String(h >= 23 ? 59 : m).padStart(2, '0')}`;
}

/** Link que abre o evento já preenchido no Google Agenda; quem confirma é você, lá. */
export function linkGoogle(c) {
  const datas = c.hora
    ? `${compacto(c.data, c.hora)}/${compacto(c.data, c.horaFim || maisUmaHora(c.hora))}`
    : `${compacto(c.data)}/${compacto(somarDias(c.data, 1))}`;
  const q = new URLSearchParams({ action: 'TEMPLATE', text: c.titulo, dates: datas });
  if (c.hora) q.set('ctz', 'America/Sao_Paulo');
  if (c.local) q.set('location', c.local);
  if (c.repete === 'semanal') q.set('recur', `RRULE:FREQ=WEEKLY${c.ate ? `;UNTIL=${somarDias(c.ate, 1).replace(/-/g, '')}T025959Z` : ''}`);
  return `https://calendar.google.com/calendar/render?${q}`;
}

/* ---------- formulário ---------- */

export function abrirCompromisso(item = null, { data, clienteId = '' } = {}) {
  const novo = !item;
  const a = item ? { ...item } : { titulo: '', tipo: 'audiencia', data: data || isoDia(), hora: '', horaFim: '', local: '', clienteId, repete: 'nao', ate: '' };
  const f = abrirFolha(`
    <h3>${novo ? 'Novo' : 'Editar'} compromisso</h3>
    <form id="f-comp" novalidate>
      <div class="fld"><label for="m-tit">O que é</label><input id="m-tit" value="${esc(a.titulo)}" placeholder="Ex.: audiência de conciliação" autocomplete="off"><small>Título e local vão para o Google se você enviar. Evite nome de cliente neles.</small></div>
      <div class="fld"><span class="l">Tipo</span><div class="opcoes" id="m-tipo">${TIPOS.map((t) => `<button type="button" data-v="${t.id}" aria-pressed="${t.id === a.tipo}"><span class="dot" style="background:${t.cor};margin:0"></span>${t.nome}</button>`).join('')}</div></div>
      <div class="fld"><label for="m-data">Data</label><input id="m-data" type="date" value="${esc(a.data)}"></div>
      <div class="par">
        <div class="fld"><label for="m-hora">Início</label><input id="m-hora" type="time" value="${esc(a.hora)}"></div>
        <div class="fld"><label for="m-fim">Fim (opcional)</label><input id="m-fim" type="time" value="${esc(a.horaFim)}"></div>
      </div>
      <div class="fld"><label for="m-local">Local (opcional)</label><input id="m-local" value="${esc(a.local)}" autocomplete="off"></div>
      <div class="fld"><label for="sel-cli">Cliente (opcional)</label><select id="sel-cli"><option value="">Sem cliente</option>${K.todos().map((c) => `<option value="${c.id}" ${c.id === a.clienteId ? 'selected' : ''}>${esc(c.nome)}</option>`).join('')}</select></div>
      <div class="fld"><span class="l">Repetir</span><div class="opcoes" id="m-rep"><button type="button" data-v="nao" aria-pressed="${a.repete !== 'semanal'}">Não</button><button type="button" data-v="semanal" aria-pressed="${a.repete === 'semanal'}">Toda semana</button></div></div>
      <div class="fld" id="m-ate-c"><label for="m-ate">Até (opcional)</label><input id="m-ate" type="date" value="${esc(a.ate)}"></div>
      <div class="erro" id="m-erro" role="alert"></div>
      ${novo ? '' : '<div class="opcoes acoes-tarefa"><button type="button" data-apagar class="perigo">Apagar</button></div>'}
      <div class="acts"><button type="button" class="btn sec" data-fechar>Cancelar</button><button type="submit" class="btn pri">Salvar</button></div>
    </form>`);
  const $ = (s) => f.querySelector(s);
  const escolhido = (sel) => $(sel).querySelector('[aria-pressed="true"]')?.dataset.v;
  const unico = (sel, aoMudar) => $(sel).addEventListener('click', (e) => {
    const b = e.target.closest('button[data-v]');
    if (!b) return;
    $(sel).querySelectorAll('button').forEach((x) => x.setAttribute('aria-pressed', String(x === b)));
    aoMudar?.();
  });
  const ajustar = () => { $('#m-ate-c').hidden = escolhido('#m-rep') !== 'semanal'; };
  unico('#m-tipo'); unico('#m-rep', ajustar);
  ajustar();
  $('[data-fechar]').onclick = fecharFolha;
  $('#f-comp').onsubmit = async (ev) => {
    ev.preventDefault();
    const titulo = $('#m-tit').value.trim();
    const dia = $('#m-data').value;
    const hora = $('#m-hora').value, horaFim = $('#m-fim').value;
    const repete = escolhido('#m-rep');
    const ate = repete === 'semanal' ? $('#m-ate').value : '';
    const erro = !titulo ? 'Escreva o que é.' : !dia ? 'Escolha a data.' : (horaFim && !hora) ? 'Preencha o início.' : (horaFim && horaFim <= hora) ? 'O fim precisa ser depois do início.' : (ate && ate < dia) ? 'O "até" precisa ser depois da data.' : '';
    if (erro) { $('#m-erro').textContent = erro; return; }
    await dados.salva(COL, { ...a, titulo, tipo: escolhido('#m-tipo'), data: dia, hora, horaFim, local: $('#m-local').value.trim(), clienteId: $('#sel-cli').value, repete, ate });
    fecharFolha();
    toast(novo ? 'Compromisso lançado ✦ Toque em “Google” para enviar à sua agenda.' : 'Compromisso salvo. Se já estava no Google, altere lá também.');
  };
  $('[data-apagar]')?.addEventListener('click', async () => {
    fecharFolha();
    if (await confirmar({ titulo: 'Apagar compromisso?', texto: `${esc(a.titulo)}${a.repete === 'semanal' ? ', com todas as repetições' : ''}. Se estiver no Google, apague lá também.`, ok: 'Apagar', perigo: true })) { await dados.apaga(COL, a.id); toast('Compromisso apagado.'); }
  });
}
