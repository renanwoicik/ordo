/* =========================================================
   Sistema · lembretes no Calendário do iPhone
   Gera arquivos .ics (o formato de agenda que o iPhone e o Mac
   entendem) com alarmes. Ao abrir o arquivo, o Calendário pede
   "Adicionar" e passa a avisar sozinho, mesmo com o sistema
   fechado. Nada sai do aparelho: o arquivo é criado aqui.

   Cada lembrete tem um UID fixo (ex.: modelo-venc-<id>@modelo).
   Se você adicionar de novo, o Calendário atualiza em vez de
   duplicar.

   Uso:
     const ics = calendario([evento({ uid, titulo, inicio: '2026-11-08T09:00', alarmes: ['PT0M', '-P1D'] })]);
     await entregar(ics, 'vencimentos.ics');
   ========================================================= */

import { MARCA } from './marca.js';
import { toast } from './ui.js';

const texto = (t) => String(t ?? '').replace(/\\/g, '\\\\').replace(/;/g, '\;').replace(/,/g, '\\,').replace(/\r?\n/g, '\\n');

/** Linhas do arquivo .ics não passam de 75 caracteres: as maiores continuam na linha seguinte. */
function dobrar(linha) {
  const partes = [];
  let resto = linha;
  while (resto.length > 74) { partes.push(resto.slice(0, 74)); resto = ` ${resto.slice(74)}`; }
  partes.push(resto);
  return partes;
}

const compacto = (iso) => iso.replace(/[-:]/g, '');
const agora = () => `${new Date().toISOString().replace(/[-:]/g, '').split('.')[0]}Z`;

/**
 * Um evento com alarmes.
 *   inicio: 'AAAA-MM-DDTHH:MM' (hora do aparelho) · duracao em minutos
 *   regra: texto RRULE sem o prefixo (ex.: 'FREQ=WEEKLY;BYDAY=SU')
 *   alarmes: durações ISO relativas ao início ('PT0M' na hora, '-PT30M' 30 min antes, '-P1D' 1 dia antes)
 */
export function evento({ uid, titulo, descricao = '', inicio, duracao = 15, regra = '', alarmes = ['PT0M'] }) {
  return [
    'BEGIN:VEVENT', `UID:${uid}`, `DTSTAMP:${agora()}`, `DTSTART:${compacto(inicio)}00`, `DURATION:PT${duracao}M`,
    ...(regra ? [`RRULE:${regra}`] : []),
    `SUMMARY:${texto(titulo)}`, ...(descricao ? [`DESCRIPTION:${texto(descricao)}`] : []),
    ...alarmes.flatMap((a) => ['BEGIN:VALARM', 'ACTION:DISPLAY', `DESCRIPTION:${texto(titulo)}`, `TRIGGER:${a}`, 'END:VALARM']),
    'END:VEVENT',
  ];
}

/** Junta os eventos num arquivo de calendário completo. */
export function calendario(eventos) {
  return ['BEGIN:VCALENDAR', 'VERSION:2.0', `PRODID:-//${MARCA.nome}//Lembretes//PT`, 'CALSCALE:GREGORIAN', ...eventos.flat(), 'END:VCALENDAR']
    .flatMap(dobrar).join('\r\n') + '\r\n';
}

/** No iPhone abre a folha de compartilhar (com "Calendário"); no Mac baixa o arquivo. */
export async function entregar(ics, nome) {
  const arquivo = new File([ics], nome, { type: 'text/calendar' });
  try {
    if (navigator.canShare?.({ files: [arquivo] }) && /iPhone|iPad/.test(navigator.userAgent)) {
      await navigator.share({ files: [arquivo] });
      return true;
    }
  } catch (e) { if (e.name === 'AbortError') return false; }
  const url = URL.createObjectURL(arquivo);
  const a = Object.assign(document.createElement('a'), { href: url, download: nome });
  document.body.append(a); a.click(); a.remove();
  setTimeout(() => URL.revokeObjectURL(url), 5000);
  toast('Abra o arquivo baixado para adicionar ao Calendário.');
  return true;
}
