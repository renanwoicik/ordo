/* =========================================================
   Sistema · marca
   Lê o config.js (nome, logo, cores e chaves) para o resto do
   sistema. Sem logo configurada, mostra o nome em texto.
   ========================================================= */

export const MARCA = self.CONFIG;

/** A logo nos modos claro e escuro ou, se não houver, o nome em texto. */
export function logoHtml() {
  const { claro, escuro } = MARCA.logo;
  if (!claro) return `<span class="nome-marca">${MARCA.nome}</span>`;
  return `<img class="logo-img logo-claro" src="${claro}" alt="${MARCA.nome}"><img class="logo-img logo-escuro" src="${escuro || claro}" alt="${MARCA.nome}">`;
}
