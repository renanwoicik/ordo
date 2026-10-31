/* =========================================================
   Sistema · módulo Entradas
   O que entrou de dinheiro no mês, lançado à mão. É o ponto de
   partida do Resumo geral; o módulo da profissão (honorários,
   vendas…) pode substituir ou somar a isto depois.

   Entrada (coleção "entradas"):
     { desc, valor, data: 'AAAA-MM-DD', nota }
   Configuração (config "entradasConfig"): { meta } = meta de ganho do mês.
   Os valores são seus e ficam só no cofre.
   ========================================================= */

import * as dados from '../nucleo/dados.js';
import { abrirFolha, fecharFolha, toast, confirmar } from '../nucleo/ui.js';
import { esc, r2, lerValor, isoDia } from '../nucleo/util.js';

const COL = 'entradas';

export const todas = () => dados.lista(COL);
export const doMes = (ym) => todas().filter((e) => (e.data || '').slice(0, 7) === ym)
  .sort((a, b) => (b.data || '').localeCompare(a.data || '') || (b.criadoEm || 0) - (a.criadoEm || 0));
export const total = (ym) => r2(doMes(ym).reduce((s, e) => s + (Number(e.valor) || 0), 0));
export const meta = () => Number(dados.config('entradasConfig')?.meta) || 0;

const numBR = (v) => (v == null || v === '' || Number(v) === 0 ? '' : r2(v).toFixed(2).replace('.', ',').replace(/,00$/, ''));

export function abrirEntrada(item = null, { mes } = {}) {
  const novo = !item;
  const a = item ? { ...item } : { desc: '', valor: '', data: mes ? `${mes}-01` : isoDia(), nota: '' };
  const f = abrirFolha(`
    <h3>${novo ? 'Nova' : 'Editar'} entrada</h3>
    <form id="f-entrada" novalidate>
      <div class="fld"><label for="en-desc">De onde veio</label><input id="en-desc" value="${esc(a.desc)}" placeholder="Ex.: salário, serviço prestado" autocomplete="off" autofocus></div>
      <div class="par">
        <div class="fld"><label for="en-valor">Valor</label><input id="en-valor" inputmode="decimal" value="${numBR(a.valor)}" placeholder="R$ 0,00" autocomplete="off"></div>
        <div class="fld"><label for="en-data">Data</label><input id="en-data" type="date" value="${esc(a.data)}"></div>
      </div>
      <div class="fld"><label for="en-nota">Anotação (opcional)</label><input id="en-nota" value="${esc(a.nota || '')}" autocomplete="off"></div>
      <div class="erro" id="en-erro" role="alert"></div>
      ${novo ? '' : '<div class="opcoes acoes-tarefa"><button type="button" data-apagar class="perigo">Apagar</button></div>'}
      <div class="acts"><button type="button" class="btn sec" data-fechar>Cancelar</button><button type="submit" class="btn pri">Salvar</button></div>
    </form>`);
  const $ = (s) => f.querySelector(s);
  $('[data-fechar]').onclick = fecharFolha;
  $('#f-entrada').onsubmit = async (ev) => {
    ev.preventDefault();
    const desc = $('#en-desc').value.trim();
    const valor = lerValor($('#en-valor').value);
    const data = $('#en-data').value;
    const erro = !desc ? 'Escreva de onde veio.' : !(valor > 0) ? 'Digite o valor.' : !data ? 'Escolha a data.' : '';
    if (erro) { $('#en-erro').textContent = erro; return; }
    await dados.salva(COL, { ...a, desc, valor: r2(valor), data, nota: $('#en-nota').value.trim() });
    fecharFolha();
    toast(novo ? 'Entrada lançada ✦' : 'Entrada salva.');
  };
  $('[data-apagar]')?.addEventListener('click', async () => {
    fecharFolha();
    if (await confirmar({ titulo: 'Apagar entrada?', texto: esc(a.desc), ok: 'Apagar', perigo: true })) { await dados.apaga(COL, a.id); toast('Entrada apagada.'); }
  });
}

export function abrirMeta() {
  const f = abrirFolha(`
    <h3>Meta de ganho do mês</h3>
    <p class="sub">Vale para todos os meses e compara com o ganho líquido. Deixe vazio para não usar.</p>
    <form id="f-meta" novalidate>
      <div class="fld"><label for="en-meta">Meta</label><input id="en-meta" inputmode="decimal" value="${numBR(meta())}" placeholder="R$ 0,00" autocomplete="off" autofocus></div>
      <div class="acts"><button type="button" class="btn sec" data-fechar>Cancelar</button><button type="submit" class="btn pri">Salvar</button></div>
    </form>`);
  f.querySelector('[data-fechar]').onclick = fecharFolha;
  f.querySelector('#f-meta').onsubmit = async (ev) => {
    ev.preventDefault();
    const v = lerValor(f.querySelector('#en-meta').value);
    await dados.salvaConfig('entradasConfig', { meta: v > 0 ? r2(v) : 0 });
    fecharFolha();
    toast('Meta salva ✦');
  };
}
