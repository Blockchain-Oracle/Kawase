import type { Catalog } from "../en/index";

export const protect: Catalog["protect"] = {
  title: "Take-profit e stop-loss",
  takeProfit: "Take-profit",
  stopLoss: "Stop-loss",
  takeProfitHint: "Fechar tudo quando {{market}} chegar a",
  stopLossHint: "Fechar tudo quando {{market}} chegar a",
  off: "Desligado",
  save: "Salvar",
  saved: "Salvo. A Kawase acompanha por você.",
  needsGrant:
    "Mais um passo: deixe a Kawase fechar esta posição por você quando estiver fora. Ela só pode fechá-la, para sua própria carteira.",
  turnOn: "Ativar proteção",
  turningOn: "Ativando…",
  grantPrompt: "Deixar a Kawase fechar posições por você",
  onUntil: "Proteção ativa até {{date}}",
  turnOff: "Desativar",
  armed: "Acompanhando",
  closing: "Fechando…",
  unavailable: "Não foi possível fechar a um preço justo",
  liquidationNote: "Liquidação em {{price}}: o stop-loss tem que vir antes.",
  route: "Fecha pela Uniswap na Arc, pago na sua carteira.",
  take_profit_wrong_side: "O take-profit fica além do preço de hoje: acima numa posição comprada, abaixo numa vendida.",
  stop_loss_wrong_side: "O stop-loss fica antes do preço de hoje: abaixo numa posição comprada, acima numa vendida.",
  stop_loss_past_liquidation: "Coloque o stop-loss antes da liquidação.",
  protection_unavailable:
    "A Uniswap na Arc não consegue fechar o tamanho desta posição agora, então a Kawase não promete.",
  failed: "Não foi possível salvar. Tente de novo.",
};
