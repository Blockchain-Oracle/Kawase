// Handing the person a file Kawase made (a month's CSV or beancount, their conversations as text): on a phone it is
// written to the cache and offered through the share sheet (Files, Mail, an accounting app); on the web it downloads.
import { File, Paths } from "expo-file-system";
import * as Sharing from "expo-sharing";
import { Platform } from "react-native";

export async function shareTextFile(input: { filename: string; body: string; mimeType: string }) {
  if (Platform.OS === "web") {
    const url = URL.createObjectURL(new Blob([input.body], { type: input.mimeType }));
    const link = document.createElement("a");
    link.href = url;
    link.download = input.filename;
    link.click();
    URL.revokeObjectURL(url);
    return;
  }
  const file = new File(Paths.cache, input.filename);
  if (file.exists) file.delete();
  file.create();
  file.write(input.body);
  await Sharing.shareAsync(file.uri, { mimeType: input.mimeType, dialogTitle: input.filename });
}
