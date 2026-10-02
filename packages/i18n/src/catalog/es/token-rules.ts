import type { Catalog } from "../en/index";

export const tokenRules: Catalog["tokenRules"] = {
  title: "Reglas de tokens",
  row: "Qué tokens se pueden comprar, límites, impacto en el precio",
  intro: "Se aplican a cada compra: en pantalla, en el chat, por voz y en automatizaciones.",
  accessTitle: "Qué tokens",
  access_verified: "Solo verificados",
  access_verifiedBody: "Solo tokens que Kawase respalda",
  access_warned: "Verificados y populares, con avisos",
  access_warnedBody: "También tokens sin verificar, dentro de los límites de abajo",
  capsTitle: "Tokens sin verificar",
  perTrade: "Máximo por operación",
  perDay: "Máximo por día",
  usedToday: "{{used}} de {{cap}} usados hoy",
  capsOff: "Desactivado mientras solo se puedan comprar tokens verificados.",
  impactTitle: "Impacto en el precio",
  impactBody: "Se rechaza cualquier intercambio que perdería más que esto por el impacto en el precio.",
  always:
    "Las copias, los tokens trampa y los tokens que no se pueden vender nunca se compran, digan lo que digan estas reglas.",
  save: "Guardar",
  saveLoosen: "Guardar con Face ID",
  how: "Endurecer una regla se aplica al instante. Relajarla pide Face ID, y tu cartera firma las nuevas reglas.",
  faceId: "Relajar tus reglas de tokens",
  notChanged: "Sin cambios.",
  saved: "Reglas de tokens guardadas",
  failed: "No se pudieron guardar las reglas. Inténtalo de nuevo.",
  change: "Cambiar reglas de tokens",
};
