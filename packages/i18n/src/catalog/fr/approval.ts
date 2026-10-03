import type { Catalog } from "../en/index";

export const approval: Catalog["approval"] = {
  title: "Confirmez que c’est vous",
  body: "Sur le web, un code envoyé à {{email}} remplace Face ID. Rien n’est signé avant que vous le saisissiez.",
  confirm: "Confirmer",
  refused: "Cela ne correspondait pas à ce qui s'affiche à l'écran : rien n'a été signé.",
};
