import type { Catalog } from "../en/index";

export const wallet: Catalog["wallet"] = {
  title: "Billetera",
  creating: "Creando tu billetera…",
  settingUp: "Configurando tu billetera en {{network}}…",
  ready: "Tu billetera está lista",
  address: "Dirección",
  balance: "Saldo",
  noWallet: "Inicia sesión para obtener una billetera",
  setupNeeded: "Configurar en {{network}}",
  setUp: "Configurar",
  allowanceTitle: "Límite diario",
  allowanceBody: "Kawase puede enviar hasta {{amount}} al día por ti sin preguntar. Por encima, apruebas con Face ID.",
  allowanceBodyAndroid:
    "Kawase puede enviar hasta {{amount}} al día por ti sin preguntar. Por encima, apruebas con tu huella o el bloqueo de pantalla.",
  allowanceAccept: "Aceptar",
  allowanceAcceptFaceId: "Aceptar con Face ID",
  allowanceActive: "Activo · {{amount}} al día",
  allowanceOff: "Desactivado",
  allowanceRevoke: "Desactivar",
  mainnetConsentTitle: "Dinero real",
  mainnetConsentBody:
    "La red principal usa USDC real. Kawase solo lo mueve dentro de los límites que fijes, y nunca por encima de tu límite sin tu Face ID.",
  mainnetConsentBodyWeb:
    "Mainnet usa USDC real. Kawase solo lo mueve dentro de los límites que fijas, y nunca por encima de tu límite diario sin tu confirmación.",
  mainnetConsentBodyAndroid:
    "La red principal usa USDC real. Kawase solo lo mueve dentro de los límites que fijes, y nunca por encima de tu límite sin tu huella o el bloqueo de pantalla.",
  mainnetConsentAccept: "Entendido",
  testnetMoney: "El USDC de pruebas no tiene valor.",
};
