/* =========================================================
   Sistema · backup
   - Fazer backup: gera um arquivo ".cofre" com os dados
     JÁ EMBARALHADOS (o mesmo jeito que estão no aparelho).
     Sem a senha (ou a chave de recuperação) da época do
     backup, o arquivo é ilegível.
   - Restaurar: lê o arquivo, pede a senha DO BACKUP e
     substitui os dados deste aparelho.
   ========================================================= */

import { MARCA } from './marca.js';
import * as cofre from './cofre.js';
import * as C from './cripto.js';
import * as dados from './dados.js';
import * as nuvem from './sincronia.js';
import { isoDia, pref } from './util.js';

const FORMATO = 'cofre-backup';

/** Monta o arquivo de backup e entrega para salvar (no iPhone abre o "Salvar em Arquivos"). */
export async function fazer() {
  const { meta, registros } = await cofre.exportarBruto();
  const conteudo = JSON.stringify({ formato: FORMATO, versao: 1, criadoEm: Date.now(), meta, registros });
  const nome = `${MARCA.id}-backup-${isoDia()}.cofre`;
  const arquivo = new File([conteudo], nome, { type: 'application/json' });

  // iPhone/iPad: a folha de compartilhar permite "Salvar em Arquivos" → iCloud Drive
  if (navigator.canShare && navigator.canShare({ files: [arquivo] }) && /iPhone|iPad|iPod/.test(navigator.userAgent)) {
    try {
      await navigator.share({ files: [arquivo], title: `Backup do ${MARCA.nome}` });
    } catch (e) {
      if (e.name === 'AbortError') return false; // a usuária cancelou
      throw e;
    }
  } else {
    // Mac: baixa o arquivo para a pasta Downloads
    const url = URL.createObjectURL(arquivo);
    const a = Object.assign(document.createElement('a'), { href: url, download: nome });
    document.body.append(a);
    a.click();
    a.remove();
    setTimeout(() => URL.revokeObjectURL(url), 5000);
  }
  pref.gravar('ultimoBackup', Date.now());
  return true;
}

/** Lê o arquivo e confere se é mesmo um backup deste sistema. Devolve o conteúdo ou lança erro. */
export async function lerArquivo(arquivo) {
  let obj;
  try { obj = JSON.parse(await arquivo.text()); } catch { throw new Error(`Este arquivo não é um backup do ${MARCA.nome}.`); }
  if (obj?.formato !== FORMATO || !obj.meta || !Array.isArray(obj.registros)) throw new Error(`Este arquivo não é um backup do ${MARCA.nome}.`);
  return obj;
}

/**
 * Restaura um backup já lido. Aceita a senha ou a chave de recuperação
 * da época do backup. Devolve quantos itens foram restaurados.
 */
export async function restaurar(backup, { senha, chaveRec }) {
  let mestraDoBackup;
  try {
    mestraDoBackup = await cofre.destrancarMeta(backup.meta, senha != null ? { senha } : { chaveRec });
  } catch {
    throw new Error('Senha ou chave de recuperação incorreta para este backup.');
  }
  const itens = [];
  for (const r of backup.registros) {
    if (r.del) { itens.push({ id: r.id, col: r.col, upd: r.upd, del: true }); continue; }
    itens.push({ id: r.id, col: r.col, upd: r.upd, del: false, dados: await C.decifrar(mestraDoBackup, r) });
  }
  await cofre.substituirTudo(itens);
  nuvem.recomecarAcompanhamento();
  await dados.carregar();
  return itens.filter((i) => !i.del).length;
}

/** Data do último backup feito neste aparelho (ou null). */
export const ultimo = () => pref.ler('ultimoBackup');
