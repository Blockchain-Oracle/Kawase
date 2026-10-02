import type { Catalog } from "../en/index";

export const story: Catalog["story"] = {
  haveAccount: "Ya tengo una cuenta",
  panelOf: "Paso {{n}} de {{total}}",
  requestTitle: "Dile a Kawase lo que necesitas.",
  requestBody:
    "Escríbelo como lo dirías. Kawase lo convierte en un pago exacto que revisas antes de que se mueva nada.",
  boundsTitle: "Tú decides cuánto puede gastar.",
  boundsBody:
    "Un Face ID fija un límite diario. Dentro de él, los envíos salen sin preguntarte; más allá, hace falta tu Face ID. Puedes desactivarlo cuando quieras.",
  boundsBodyWeb:
    "Una confirmación fija un límite diario. Dentro de él, los envíos salen sin preguntar; para más, se necesita un código de tu email. Desactívalo cuando quieras.",
  boundsBodyAndroid:
    "Una aprobación fija un límite diario. Dentro de él, los envíos salen sin preguntarte; más allá, hace falta tu huella o el bloqueo de pantalla. Puedes desactivarlo cuando quieras.",
  practiceTitle: "Practica con dinero de prueba.",
  practiceBody:
    "Arc Testnet funciona como la red real, con USDC de prueba gratis de Circle. El dinero real está a un toque, y Kawase siempre muestra en cuál estás.",
  languageTitle: "En tu idioma.",
  languageBody:
    "Diez idiomas, leídos y escritos. Cámbialo con el botón de arriba: todo cambia, también la escritura de derecha a izquierda.",
  firstTitle: "Pruébalo en un minuto.",
  firstBody: "Consigue USDC de prueba gratis y envía un poco a un amigo. Nada de dinero real hasta que tú lo elijas.",
  example: "Ejemplo",
  exampleRequest: "Envía 10 USDC a @amina",
  fieldAmount: "Importe",
  fieldTo: "Para",
  fieldNetwork: "Red",
  typingNow: "Escribir ya funciona · la voz llega pronto",
  perDay: "al día",
  boundsInside: "Los envíos dentro salen sin preguntar",
  boundsAbove: "Más que eso: tu Face ID",
  boundsAboveWeb: "Más que eso: un código de tu email",
  boundsAboveAndroid: "Más que eso: tu huella o el bloqueo de pantalla",
  boundsNever: "Nunca otros tokens, nunca tus límites",
  testMoney: "dinero de prueba",
  realMoney: "dinero real",
  faucetLine: "USDC de prueba gratis de Circle",
  sameMeaning: "Misma petición, mismo pago",
  firstStep1: "Consigue USDC de prueba gratis",
  firstStep2: "Envía un poco al @handle de un amigo",
  goTo: "Ir al paso {{n}}",
  canvasHint: "Desliza arriba o abajo para cambiar de paso",
};
