import type { Catalog } from "../en/index";

export const devices: Catalog["devices"] = {
  title: "Dispositivos",
  signedIn: "Con sesión iniciada",
  thisDevice: "Este dispositivo",
  lastActive: "activo {{time}}",
  signOut: "Cerrar sesión",
  signedOut: "Se cerró la sesión en {{name}}",
  signOutEverywhere: "Cerrar sesión en los demás dispositivos",
  signedOutEverywhere: "Se cerró la sesión en todos los demás dispositivos",
  lostPhone: "¿Perdiste un teléfono? Cierra su sesión aquí y luego activa «Pausar todo» en Billetera y límites.",
  failed: "No se pudieron cargar tus dispositivos.",
  stillWorks: "Todo en este dispositivo sigue funcionando.",
  loading: "Cargando tus dispositivos",
  onlyThis: "Solo este dispositivo",
  onlyThisDetail: "Los teléfonos y navegadores donde inicies sesión aparecen aquí.",
  signOutEverywhereTitle: "¿Cerrar sesión en todos los demás dispositivos?",
  signOutThisTitle: "¿Cerrar sesión en este dispositivo?",
  signOutTitle: "¿Cerrar sesión en {{name}}?",
  signOutBody: "Deja de usar tu cuenta al instante. Tu billetera y tu dinero se quedan donde están.",
  signOutFailed: "No se pudo cerrar la sesión. Inténtalo de nuevo.",
};
