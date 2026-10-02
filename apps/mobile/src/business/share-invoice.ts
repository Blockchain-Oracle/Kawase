// Sending an invoice: its link (the client pays through it), or a PDF made on the phone from the printable invoice the
// api serves (the same document a browser prints).
import * as Print from "expo-print";
import * as Sharing from "expo-sharing";
import { Platform, Share } from "react-native";

import { api } from "@/session/api";

export async function shareInvoiceLink(input: { number: string; link: string; message: string }) {
  await Share.share({ title: input.number, message: `${input.message}\n${input.link}`, url: input.link });
}

export async function shareInvoicePdf(input: { token: string; number: string }) {
  const url = api.business.documentUrl(input.token);
  if (Platform.OS === "web") {
    window.open(url, "_blank", "noopener");
    return;
  }
  const html = await (await fetch(url)).text();
  const { uri } = await Print.printToFileAsync({ html });
  await Sharing.shareAsync(uri, { mimeType: "application/pdf", UTI: "com.adobe.pdf", dialogTitle: input.number });
}
