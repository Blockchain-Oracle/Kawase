import type { Catalog } from "../en/index";

export const fees: Catalog["fees"] = {
  actionsLeft: "~{{n}} actions restantes",
  noneLeft: "Pas d'USDC pour les frais",
  explain: "Sur Arc, les frais de réseau se paient en USDC : voici combien d'envois votre USDC peut encore payer. S'il n'y en a plus, Kawase paie les frais de vos envois d'USDC et d'EURC.",
  cardTitle: "Frais",
  perTransfer: "Un envoi coûte environ {{amount}}",
  relayer: "Si votre portefeuille ne peut pas payer des frais, Kawase les paie pour les envois d'USDC et d'EURC.",
  loading: "Vérification de votre réserve pour les frais…",
};
