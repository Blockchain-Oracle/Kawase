import type { Catalog } from "../en/index";

export const errors: Catalog["errors"] = {
  offline: "Estás sin conexión. Mostramos lo último que Kawase sabía.",
  serverTrouble: "No se puede conectar con Kawase ahora. Mostramos lo último que sabía.",
  storageUnavailable:
    "El almacenamiento seguro no está disponible. Desbloquea el dispositivo e inténtalo de nuevo. Tu cuenta no se ha restablecido.",
  offlineAction: "Sin conexión. Revisa tu internet e inténtalo de nuevo.",
  expiredCode: "Ese código caducó. Pide uno nuevo.",
  rateLimited: "Se enviaron demasiados códigos. Espera unos minutos y vuelve a intentarlo.",
  signInFailed: "No se pudo iniciar sesión. Inténtalo de nuevo.",
  walletFailed: "Ya iniciaste sesión, pero tu billetera no se creó. Inténtalo de nuevo: no se perdió nada.",
  resendIn: "Enviar un código nuevo en {{seconds}} s",
  startFailed: "Kawase no pudo empezar. Revisa tu conexión e inténtalo de nuevo.",
  walletLoadFailed: "No se pudo cargar tu billetera.",
  scopeLoadFailed: "No se pudo preparar tu límite diario.",
  scopeRefreshed: "El límite diario se actualizó. Léelo de nuevo y luego apruébalo.",
  notSigned: "No se firmó nada.",
  biometricUnavailable: "Activa Face ID, Touch ID, tu huella o un código en los Ajustes del teléfono para aprobar.",
  biometricUnavailableWeb:
    "Para aprobar en la web hace falta el email de tu cuenta. Inicia sesión con tu email para continuar.",
  biometricUnavailableAndroid:
    "Configura una huella o un bloqueo de pantalla en los Ajustes del teléfono para aprobar.",
  biometricFailed: "No coincidió. No se firmó nada. Inténtalo de nuevo.",
};
