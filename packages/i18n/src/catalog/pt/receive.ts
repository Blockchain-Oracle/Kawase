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
};
