import type { Catalog } from "../en/index";

export const approval: Catalog["approval"] = {
  title: "Confirma que eres tú",
  body: "En la web, un código enviado a {{email}} sustituye a Face ID. No se firma nada hasta que lo introduzcas.",
  confirm: "Confirmar",
  sending: "Enviando un código a tu correo…",
  sendFailed: "No se pudo enviar el código. Inténtalo de nuevo.",
  refused: "Esto no coincidía con lo que se muestra en pantalla, así que no se firmó nada.",
};
