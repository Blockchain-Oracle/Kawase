import type { Catalog } from "../en/index";

export const forYou: Catalog["forYou"] = {
  title: "Para ti",
  loading: "Buscando lo que necesita tu atención…",
  nothing: "Ahora mismo nada necesita tu atención.",
  hide: "Ocultar",
  hideThis: "Ocultar esto",
  muteKind: "No mostrar este tipo",
  showAgain: "Volver a mostrar los tipos ocultos ({{count}})",
  idleTitle: "{{amount}} USDC están parados",
  idleBody:
    "{{vault}} paga ahora un {{apy}}% anual aprox. y puede devolverlo todo al momento. {{keep}} USDC quedan listos para gastar.",
  idleAction: "Ponerlos a trabajar",
  idlePrompt: "Pon {{amount}} USDC a trabajar en {{vault}} y deja {{keep}} USDC en mi monedero.",
  requestTitle: "Tu solicitud de {{amount}} {{asset}} vence pronto",
  requestBody: "Quedan unas {{hours}} h para pagarla. ¿Compartir el enlace otra vez?",
  requestAction: "Compartir enlace",
  bridgeTitle: "Tu puente a {{chain}} está tardando",
  bridgeBody: "Lleva {{minutes}} min; normalmente llega en un minuto. Mira dónde está.",
  bridgeAction: "Revisarlo",
  healthTitle: "Tu {{side}} en {{market}} está cerca de la liquidación",
  healthBody:
    "Salud {{health}}; se liquida si el precio se mueve {{distance}} en tu contra. Añadir margen o cerrar una parte lo mantiene seguro.",
  healthAction: "Revisarlo",
  healthPrompt: "Mi {{side}} en {{market}} tiene salud {{health}}. ¿Qué opciones tengo?",
  moveTitle: "{{asset}} se movió {{change}} hoy",
  moveBody: "Tus {{held}} {{asset}} están {{valueChange}} en dólares ({{price}} cada uno ahora).",
  moveAction: "Preguntar por qué",
  movePrompt: "¿Por qué se movió {{asset}} {{change}} hoy y qué significa para mis {{held}} {{asset}}?",
};
