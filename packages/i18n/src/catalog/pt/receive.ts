import type { Catalog } from "../en/index";

export const receive: Catalog["receive"] = {
  title: "Receber",
  warning: "Só USDC e EURC na Arc. O Kawase não vê dinheiro enviado por outras redes.",
  copy: "Copiar endereço",
  share: "Compartilhar",
  network: "Rede",
  shareMessage: "Meu endereço Kawase na {{network}}: {{address}}",
  noWallet: "Entre para ter um endereço",
  noWalletBody: "Seu endereço é criado junto com a conta.",
  setUpFirst: "Configure sua carteira primeiro",
  setUpFirstBody: "Um passo, e seu endereço está pronto para receber.",
  anyToken:
    "Qualquer token na Arc chega aqui. Enviado por outra rede? Ele chega neste mesmo endereço lá: traga para a Arc em Adicionar dinheiro.",
};
