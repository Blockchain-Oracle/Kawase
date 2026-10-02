import type { Catalog } from "../en/index";

export const limits: Catalog["limits"] = {
  title: "Billetera y límites",
  setUp: "Configurada · la misma dirección en ambas redes",
  notSetUp: "Aún no está configurada en esta red",
  notSetUpBody: "Primero configura tu billetera en esta red. Tarda unos segundos.",
  offBody: "El límite diario está desactivado, así que cada envío necesita tu Face ID.",
  offBodyWeb: "El límite diario está desactivado, así que cada envío necesita un código de tu email.",
  offBodyAndroid: "El límite diario está desactivado, así que cada envío necesita tu huella o el bloqueo de pantalla.",
  turnOn: "Activar el límite diario",
  holdToRevoke: "Mantén pulsado para desactivar el límite",
  revoking: "Desactivando…",
  revokeNote: "Desactivarlo es una transacción en Arc que tú firmas. Kawase pierde el permiso al instante.",
  revoked: "Límite diario desactivado",
  holdHint: "Mantén pulsado {{seconds}} segundos para confirmar. Si sueltas antes, se cancela.",
  revokeSigning: "Esperando tu firma…",
  revokeChecking: "Consultando con la red…",
  revokeNotSigned: "La firma no se completó. Tu límite sigue activado.",
  revokeFailed: "No se pudo completar. Tu límite sigue activado.",
  revokeReverted: "La red lo rechazó. Tu límite sigue activado.",
  revokeUnconfirmed:
    "Aún sin confirmar. Puede que termine en la red: vuelve a comprobarlo antes de intentarlo otra vez.",
  checkAgain: "Comprobar de nuevo",
};
