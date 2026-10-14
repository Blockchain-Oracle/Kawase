import type { Catalog } from "../en/index";

export const alerts: Catalog["alerts"] = {
  deviceSignedInTitle: "Nuevo inicio de sesión en {{name}}",
  deviceSignedInBody:
    "{{platform}} · {{location}}. Si no fuiste tú, cierra su sesión en Dispositivos y activa «Pausar todo».",
  deviceSignedInBodyNoPlace: "{{platform}}. Si no fuiste tú, cierra su sesión en Dispositivos y activa «Pausar todo».",
  deviceSignedOutTitle: "Se cerró la sesión en {{name}}",
  deviceSignedOutBody: "Ya no puede usar tu cuenta. Si no fuiste tú, revisa Dispositivos ahora.",
  kindDeviceSignedIn: "Nuevos inicios de sesión",
  kindDeviceSignedOut: "Sesiones cerradas en dispositivos",
  aDevice: "un dispositivo",
};
