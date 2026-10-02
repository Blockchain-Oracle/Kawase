import type { Catalog } from "../en/index";

export const receive: Catalog["receive"] = {
  title: "Recibir",
  warning: "Solo USDC y EURC en Arc. Kawase no ve el dinero enviado por otras redes.",
  copy: "Copiar dirección",
  share: "Compartir",
  network: "Red",
  shareMessage: "Mi dirección de Kawase en {{network}}: {{address}}",
  noWallet: "Inicia sesión para tener una dirección",
  noWalletBody: "Tu dirección se crea con tu cuenta.",
  setUpFirst: "Configura primero tu billetera",
  setUpFirstBody: "Un paso y tu dirección estará lista para recibir.",
};
