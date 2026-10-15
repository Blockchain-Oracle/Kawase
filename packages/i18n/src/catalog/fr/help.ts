import type { Catalog } from "../en/index";

export const help: Catalog["help"] = {
  title: "Aide et confiance",
  intro: "Ce que Kawase peut faire ou non avec votre argent, où il se trouve, et comment partir sans Kawase.",
  canTitle: "Ce que Kawase peut faire",
  allowanceTitle: "Seulement ce que vous avez signé",
  allowanceBody:
    "Kawase ne déplace de l'argent pour vous que dans le plafond quotidien que vous avez signé avec Face ID : par jeton, jusqu'à ce montant par jour, jusqu'à son expiration. C'est Arc qui applique la limite, pas les serveurs de Kawase.",
  asksTitle: "Tout le reste vous est demandé",
  asksBody:
    "Au-delà du plafond, un destinataire nouveau ou qui en imite un autre, les échanges, le trading, les ponts et les retraits attendent votre Face ID sur la carte.",
  pauseTitle: "Mettre en pause ou révoquer à tout moment",
  pauseBody:
    "« Tout mettre en pause » arrête aussitôt Kawase et vos automatisations. Révoquer met fin à une autorisation sur Arc : elle ne peut plus servir.",
  limits: "Portefeuille et limites",
  neverTitle: "Ce qu'il ne peut jamais faire",
  neverBody:
    "Prendre plus que votre plafond, payer une adresse que vous n'avez pas indiquée, ou déplacer de l'argent sans une trace dans Activité qui dit pourquoi.",
  whereTitle: "Où se trouve votre argent",
  walletTitle: "Dans votre propre portefeuille",
  walletBody: "Votre argent est dans votre propre portefeuille sur Arc, pas sur un compte chez Kawase.",
  copy: "Copier",
  copied: "Copié",
  keyTitle: "Votre clé",
  keyBody:
    "La clé de votre portefeuille est fractionnée et conservée par Privy dans des enclaves sécurisées. Kawase ne la voit jamais ; seule votre propre connexion peut l'utiliser.",
  codeTitle: "Des fonctions intelligentes sur votre adresse",
  codeBody:
    "Votre adresse exécute le code open source DeleGator de MetaMask (EIP-7702) : plusieurs étapes passent en un seul Face ID et vos limites sont appliquées. Il ne déplace jamais d'argent de lui-même.",
  leaveTitle: "Partir sans Kawase",
  exportTitle: "Exporter votre portefeuille",
  exportBody: "Exportez la clé de votre portefeuille et gardez-la en lieu sûr. Elle fonctionne sans Kawase.",
  export: "Exporter",
  anyWalletTitle: "Utiliser n'importe quel portefeuille",
  anyWalletBody:
    "Importez la clé dans MetaMask, Rabby ou tout portefeuille EVM, puis ajoutez {{network}} avec ces informations :",
  chainId: "ID de chaîne",
  rpc: "RPC",
  explorer: "Explorateur",
  gasToken: "Frais payés en",
  statusTitle: "Kawase fonctionne-t-il ?",
  statusUnread: "Impossible de lire l'état pour le moment.",
  askTitle: "Poser une question et en savoir plus",
  chatTitle: "Demander à Kawase",
  chatBody: "Demandez dans la discussion ce qu'est quelque chose, pourquoi de l'argent a bougé, ou si Arc fonctionne.",
  open: "Ouvrir",
  docsTitle: "Lire la documentation",
  reportTitle: "Signaler un problème",
  reportBody:
    "Ouvrez un signalement sur GitHub. Ne partagez jamais votre clé ni votre phrase de récupération avec qui que ce soit.",
  statusLinkTitle: "Page d'état",
};
