import type { Catalog } from "../en/index";

export const receive: Catalog["receive"] = {
  title: "Receber",
  warning: "Só USDC e EURC na Arc. O Kawase não vê dinheiro enviado por outras redes.",
  copy: "Copiar endereço",
  share: "Compartilhar",
  network: "Rede",
  shareMessage: "Meu endereço Kawase na {{network}}: {{address}}",
  otherChains: "Base, Ethereum e outras redes",
  otherChainsBody: "O mesmo endereço funciona lá; depois traga para a Arc.",
  askAmount: "Pedir um valor",
  askAsset: "Ativo",
  askShow: "Mostrar o código",
  askHint: "Qualquer carteira que escanear preenche {{amount}} na {{network}}.",
  askClear: "Remover o valor",
  shareAsk: "Me envie {{amount}} na {{network}}: {{address}}\n{{uri}}",
  noWallet: "Entre para ter um endereço",
  noWalletBody: "Seu endereço é criado junto com a conta.",
  setUpFirst: "Configure sua carteira primeiro",
  setUpFirstBody: "Um passo, e seu endereço está pronto para receber.",
  anyToken:
    "Qualquer token na Arc chega aqui. Enviado por outra rede? Ele chega neste mesmo endereço lá: traga para a Arc em Adicionar dinheiro.",
};
