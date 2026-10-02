import type { Catalog } from "../en/index";

export const help: Catalog["help"] = {
  title: "Ayuda y confianza",
  intro: "Qué puede y qué no puede hacer Kawase con tu dinero, dónde está y cómo irte sin Kawase.",
  canTitle: "Lo que Kawase puede hacer",
  allowanceTitle: "Solo lo que firmaste",
  allowanceBody:
    "Kawase mueve dinero por ti solo dentro del límite diario que firmaste con Face ID: por token, hasta ese importe al día, hasta que caduque. Lo hace cumplir Arc, no los servidores de Kawase.",
  asksTitle: "Todo lo demás te lo pregunta",
  asksBody:
    "Lo que supere el límite, un destinatario nuevo o que se parezca a otro, los intercambios, las operaciones de trading, los puentes y los retiros esperan tu Face ID en la tarjeta.",
  pauseTitle: "Pausa o revoca cuando quieras",
  pauseBody:
    "«Pausar todo» detiene a Kawase y tus automatizaciones al instante. Revocar termina un permiso en Arc, así que no se puede volver a usar.",
  limits: "Billetera y límites",
  neverTitle: "Lo que nunca puede hacer",
  neverBody:
    "Tomar más de tu límite, pagar a una dirección que no indicaste o mover dinero sin un registro en Actividad que diga por qué.",
  whereTitle: "Dónde está tu dinero",
  walletTitle: "En tu propia billetera",
  walletBody: "Tu dinero está en tu propia billetera en Arc, no en una cuenta de Kawase.",
  copy: "Copiar",
  copied: "Copiado",
  keyTitle: "Tu clave",
  keyBody:
    "La clave de tu billetera la crea y la guarda Turnkey en hardware seguro. Kawase nunca la ve; la desbloquean tu Face ID o tu llave de acceso.",
  codeTitle: "Funciones inteligentes en tu dirección",
  codeBody:
    "Tu dirección ejecuta el código abierto DeleGator de MetaMask (EIP-7702), así que varios pasos van en un solo Face ID y tus límites se hacen cumplir. Nunca mueve dinero por sí solo.",
  leaveTitle: "Irte sin Kawase",
  exportTitle: "Exporta tu billetera",
  exportBody: "Exporta la clave de tu billetera y guárdala bien. Funciona sin Kawase.",
  export: "Exportar",
  anyWalletTitle: "Usa cualquier billetera",
  anyWalletBody: "Importa la clave en MetaMask, Rabby o cualquier billetera EVM y añade {{network}} con estos datos:",
  chainId: "ID de cadena",
  rpc: "RPC",
  explorer: "Explorador",
  gasToken: "Comisiones en",
  statusTitle: "¿Funciona Kawase?",
  statusUnread: "No se pudo leer el estado ahora mismo.",
  askTitle: "Pregunta y lee más",
  chatTitle: "Pregunta a Kawase",
  chatBody: "Pregunta en el chat qué es algo, por qué se movió dinero o si Arc está funcionando.",
  open: "Abrir",
  docsTitle: "Lee la documentación",
  reportTitle: "Informa de un problema",
  reportBody: "Abre un informe en GitHub. Nunca compartas tu clave ni tu frase de recuperación con nadie.",
  statusLinkTitle: "Página de estado",
};
