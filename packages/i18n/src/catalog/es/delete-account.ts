import type { Catalog } from "../en/index";

export const deleteAccount: Catalog["deleteAccount"] = {
  title: "Eliminar cuenta",
  body: "Tu billetera sigue siendo tuya. Kawase borra lo que guarda sobre ti: contactos, conversaciones, bandeja y ajustes.",
  holdings: "Lo que tiene tu cuenta",
  agentWallet: "Billetera del agente: {{amount}} (primero vuelve a tu billetera)",
  revoke: "Desactiva lo que Kawase puede hacer",
  revokeOn: "Revocar en {{network}} ({{count}})",
  revokePrompt: "Revocar los permisos de Kawase",
  revoked: "Revocado en la cadena",
  revokeFailed: "La revocación no terminó. Inténtalo de nuevo.",
  noGrants: "No hay nada que revocar.",
  revokeNote:
    "Revocar requiere un poco de USDC para la comisión, así que hazlo antes de mover tu dinero. Lo que no se revoque no podrá usarse una vez eliminada la cuenta.",
  takeOut: "Saca tu dinero",
  takeOutBody:
    "Envíalo a otro sitio o exporta la billetera para usarla en otra app. También puedes dejarlo: la billetera sigue siendo tuya.",
  send: "Enviar",
  confirm: "Escribe {{handle}} para confirmar",
  delete: "Eliminar mi cuenta",
  done: "Tu cuenta se eliminó",
  failed: "No se pudo eliminar. No se borró nada.",
  after:
    "Tu @alias queda reservado 30 días para que nadie más lo tome. Si vuelves a iniciar sesión más adelante, empezarás una cuenta nueva con la misma billetera.",
  holdToDelete: "Mantén pulsado para eliminar mi cuenta",
  typeFirst: "Primero escribe {{handle}}",
  keepHolding: "Sigue pulsando",
  stillWorks: "No se eliminó nada. Tu cuenta funciona como antes.",
  loading: "Revisando lo que tiene tu cuenta",
  agentWalletRow: "Billetera del agente",
  agentWalletBack: "Vuelve primero a tu billetera",
  needsWallet: "Configura tu billetera",
};
