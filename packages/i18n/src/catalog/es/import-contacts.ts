import type { Catalog } from "../en/index";

export const importContacts: Catalog["importContacts"] = {
  title: "Importar contactos",
  intro:
    "Elige personas de los contactos de tu teléfono. Kawase los lee solo en este teléfono; nada se envía hasta que pidas buscar quién está en Kawase.",
  allow: "Permitir acceso a contactos",
  denied: "Kawase no puede leer tus contactos. Activa el acceso en Ajustes para importar.",
  phoneOnly: "Importar contactos funciona en la app del teléfono.",
  findBody: "{{count}} contactos en este teléfono. ¿Buscar quién de ellos está en Kawase?",
  find: "Buscar quién está en Kawase",
  privacy:
    "Solo se comprueban huellas cifradas (hashes SHA-256) de sus correos, nunca los correos, nombres ni números, y solo aparecen quienes permiten que los encuentren.",
  onKawase: "En Kawase ({{count}})",
  noneOnKawase: "Ninguno está en Kawase todavía.",
  add: "Añadir",
  addFailed: "No se pudo añadir a {{name}}.",
  others: "Invitar a Kawase",
  invite: "Invitar a {{name}}",
  inviteMessage: "Hola {{name}}, uso Kawase para enviar y recibir dólares y euros en Arc. Únete: {{link}}",
  done: "Listo",
  findable: "Que me encuentre quien tenga mi correo",
  findableBody: "Si alguien con tu correo en sus contactos busca, verá tu @usuario. Desactívalo para no aparecer.",
};
