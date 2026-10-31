/* =========================================================
   Sistema · levar os dados para o Claude analisar
   Monta um texto com a EVOLUÇÃO financeira para você colar numa
   conversa com o Claude e pedir análise e sugestões de mudança.

   Privacidade: o texto só leva NÚMEROS AGRUPADOS (por mês e por
   categoria). Não vai descrição de lançamento, anotação nem nome
   de ninguém. Você lê tudo antes de copiar, e nada é enviado pelo
   sistema: quem cola é você.
   ========================================================= */

import { abrirFolha, fecharFolha, toast } from '../nucleo/ui.js';
import { brl, r2, isoDia, somarMeses, mesPorExtenso } from '../nucleo/util.js';
import * as S from './gastos.js';
import * as E from './entradas.js';

const pct = (a, b) => (b > 0 ? `${Math.round((a / b) * 100)}%` : '—');
const mesCurto = (ym) => `${mesPorExtenso(ym).slice(0, 3)}/${ym.slice(2, 4)}`;
const tabela = (cab, linhas) => [`| ${cab.join(' | ')} |`, `| ${cab.map(() => '---').join(' | ')} |`, ...linhas.map((l) => `| ${l.join(' | ')} |`)].join('\n');

export const PERIODOS = [['ano', 'Este ano até agora'], ['12', 'Últimos 12 meses'], ['6', 'Últimos 6 meses']];

export function mesesDoPeriodo(opcao, hoje = isoDia()) {
  const atual = hoje.slice(0, 7);
  const n = opcao === 'ano' ? Number(atual.slice(5)) : Number(opcao);
  return Array.from({ length: n }, (_, i) => somarMeses(atual, i - (n - 1)));
}

export function montarRelatorio(opcao = 'ano', hoje = isoDia()) {
  const meses = mesesDoPeriodo(opcao, hoje);
  const linhas = meses.map((ym) => {
    const s = S.calcular(ym), entrou = E.total(ym);
    return [mesCurto(ym), brl(entrou), brl(s.totalFixasCNPJ), brl(r2(entrou - s.totalFixasCNPJ)), brl(s.cpf), brl(s.cnpj), brl(r2(entrou - s.total)), pct(entrou - s.total, entrou)];
  });
  const porCategoria = {};
  for (const ym of meses) for (const c of S.calcular(ym).categorias) porCategoria[c.rotulo] = r2((porCategoria[c.rotulo] || 0) + c.valor);
  const categorias = Object.entries(porCategoria).sort((a, b) => b[1] - a[1]).map(([n, v]) => [n, brl(v)]);

  return [
    'Você é um consultor financeiro para profissionais autônomos. Analise os dados abaixo e responda em português, de forma direta e prática:',
    '1. **Evolução:** o que mudou mês a mês nas entradas, nos gastos e nas sobras.',
    '2. **Pontos de atenção:** custos fixos, categorias que mais pesam, meses fora do padrão.',
    '3. **Cinco sugestões de mudança**, em ordem de prioridade, cada uma com o que fazer, o que esperar e como medir.',
    '4. **O que falta saber:** quais dados ou perguntas ajudariam a melhorar a análise.',
    '',
    `Os dados saíram do meu sistema de gestão em ${hoje}. Estão anonimizados: só números agrupados. Valores em reais.`,
    '',
    `## Financeiro por mês (${mesCurto(meses[0])} a ${mesCurto(meses.at(-1))})`,
    tabela(['Mês', 'Entrou', 'Contas fixas CNPJ', 'Ganho líquido', 'Gastos CPF', 'Gastos CNPJ', 'Sobrou', 'Sobra/Entrou'], linhas),
    '',
    '"Gastos CNPJ" já inclui as contas fixas CNPJ. "Sobrou" = entrou − gastos CPF − gastos CNPJ.',
    '',
    '## Gastos do período por categoria',
    categorias.length ? tabela(['Categoria', 'Total'], categorias) : 'Sem gastos no período.',
    '',
    'Observação: se algum número parecer estranho (por exemplo meses vazios porque ainda não foram lançados), me diga em vez de supor.',
  ].join('\n');
}

/* ---------- folha: escolher o período, ler e copiar ---------- */

export function abrirAnalise() {
  let opcao = 'ano';
  const f = abrirFolha(`
    <h3>Levar para o Claude</h3>
    <p class="sub">Gera um resumo da evolução financeira para você colar numa conversa com o Claude e pedir análise e sugestões. <strong>Sem descrições, anotações ou nomes:</strong> só números agrupados. Leia antes de copiar.</p>
    <div class="fld"><span class="l">Período</span><div class="opcoes" id="an-per">${PERIODOS.map(([v, n]) => `<button type="button" data-v="${v}" aria-pressed="${v === opcao}">${n}</button>`).join('')}</div></div>
    <div class="fld"><label for="an-txt">Texto que será copiado</label><textarea id="an-txt" rows="12" readonly style="font-size:12.5px;line-height:1.4"></textarea></div>
    <div class="acts"><button type="button" class="btn sec" data-fechar>Fechar</button><button type="button" class="btn pri" data-copiar>Copiar</button></div>`);
  const $ = (s) => f.querySelector(s);
  const pintar = () => { $('#an-txt').value = montarRelatorio(opcao); };
  $('#an-per').addEventListener('click', (e) => {
    const b = e.target.closest('button[data-v]');
    if (!b) return;
    opcao = b.dataset.v;
    $('#an-per').querySelectorAll('button').forEach((x) => x.setAttribute('aria-pressed', String(x === b)));
    pintar();
  });
  pintar();
  $('[data-fechar]').onclick = fecharFolha;
  $('[data-copiar]').onclick = async () => {
    try { await navigator.clipboard.writeText($('#an-txt').value); toast('Copiado. Cole numa conversa com o Claude ✦'); }
    catch { $('#an-txt').select(); toast('Não consegui copiar sozinho: o texto ficou selecionado, é só copiar.'); }
  };
}
