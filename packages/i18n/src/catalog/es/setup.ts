import type { Catalog } from "../en/index";

export const setup: Catalog["setup"] = {
  title: "Preparando tu billetera",
  subtitle: "En {{network}}. Tarda unos segundos y Kawase paga la comisión de red.",
  stepWallet: "Crear tu billetera",
  stepNetwork: "Configurarla en {{network}}",
  settingUpDetail: "Firmando y enviando a través del relayer de Kawase…",
  failed: "No se completó. Inténtalo de nuevo.",
  notReady: "Kawase está preparando {{network}}. No se firmó nada y tu dinero está a salvo; inténtalo de nuevo pronto.",
  primerTitle: "Un Face ID para tu límite diario",
  primerTitleAndroid: "Una aprobación para tu límite diario",
  primerBody:
    "Kawase puede enviar hasta {{amount}} al día por ti sin preguntar. Para más, necesitará tu Face ID de nuevo, y puedes desactivarlo cuando quieras.",
  primerBodyAndroid:
    "Kawase puede enviar hasta {{amount}} al día por ti sin preguntar. Para más, necesitará de nuevo tu huella o el bloqueo de pantalla, y puedes desactivarlo cuando quieras.",
  acceptFaceId: "Aceptar con Face ID",
  acceptTouchId: "Aceptar con Touch ID",
  acceptFingerprint: "Aceptar con tu huella",
  scopeTitle: "Lo que vas a permitir",
  scopeBody:
    "Léelo una vez. Es exactamente lo que apruebas, tomado del propio permiso, y puedes desactivarlo cuando quieras.",
  acceptFace: "Aceptar con desbloqueo facial",
  acceptPasscode: "Aceptar con tu código",
  acceptEmailCode: "Aceptar con un código por email",
  faceIdPrompt: "Permitir que Kawase envíe hasta {{amount}} al día",
  approving: "Aprobando…",
  notNow: "Ahora no",
  doneTitle: "Todo listo",
  doneBody: "Tu billetera está lista en {{network}}. Esto es exactamente lo que Kawase puede hacer con ella.",
  terms: "Al continuar, aceptas las condiciones de uso de Kawase.",
  readTerms: "Leer las condiciones",
  termsFailed: "No se pudo guardar que aceptaste. Revisa tu conexión e inténtalo de nuevo.",
};
