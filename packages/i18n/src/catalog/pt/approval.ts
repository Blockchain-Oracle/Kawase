import type { Catalog } from "../en/index";

export const approval: Catalog["approval"] = {
  title: "Confirme que é você",
  body: "Na web, um código enviado para {{email}} substitui o Face ID. Nada é assinado até você digitá-lo.",
  confirm: "Confirmar",
  sending: "Enviando um código para o seu e-mail…",
  sendFailed: "Não foi possível enviar o código. Tente de novo.",
  refused: "Isto não correspondia ao que aparece na tela, então nada foi assinado.",
};
