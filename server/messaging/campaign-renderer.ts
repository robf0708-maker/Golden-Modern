/**
 * Renderiza variáveis de uma mensagem de campanha.
 * Variáveis suportadas: {{nome}}, {{barbearia}}
 */
export function renderCampaignMessage(
  template: string,
  vars: { nome: string; barbearia: string }
): string {
  return template
    .replace(/\{\{nome\}\}/gi, vars.nome)
    .replace(/\{\{barbearia\}\}/gi, vars.barbearia);
}
