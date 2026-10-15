// QR codes drawn on the server as SVG (the `qrcode` package the app's Receive screen uses): no client code, crisp at
// any size, dark modules on white in both themes so every camera reads them. Medium error correction survives a glare.
import QRCode from "qrcode";

export async function qrSvg(url: string): Promise<string> {
  return QRCode.toString(url, { type: "svg", margin: 1, errorCorrectionLevel: "M", color: { dark: "#000000", light: "#ffffff" } });
}
