// Handing the card over on a phone: the system share sheet with the PNG (it carries Save Image, Messages, X, WhatsApp…),
// as the receipt does; where sharing files is not available, the words and the link instead.
import * as Sharing from "expo-sharing";
import { Share } from "react-native";

import type { CardFile } from "./card-handle";

export async function shareCardFile(file: CardFile, title: string, text: string): Promise<"shared" | "saved"> {
  if (file.kind === "uri" && (await Sharing.isAvailableAsync())) {
    await Sharing.shareAsync(file.uri, { mimeType: "image/png", dialogTitle: title, UTI: "public.png" });
    return "shared";
  }
  await Share.share({ message: text });
  return "shared";
}

export const saveCardFile = shareCardFile;
