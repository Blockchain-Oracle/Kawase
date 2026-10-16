// Handing the card over in a browser: the share sheet with the file where the browser shares files (phones, Safari,
// Edge), otherwise a download of the PNG or the MP4.
import type { CardFile } from "./card-handle";

const REVOKE_MS = 1000;

function download(blob: Blob, name: string) {
  const url = URL.createObjectURL(blob);
  const a = document.createElement("a");
  a.href = url;
  a.download = name;
  document.body.appendChild(a);
  a.click();
  a.remove();
  setTimeout(() => URL.revokeObjectURL(url), REVOKE_MS);
}

export async function shareCardFile(file: CardFile, title: string, text: string): Promise<"shared" | "saved"> {
  if (file.kind !== "blob") return "saved";
  const shared = new File([file.blob], file.name, { type: file.blob.type });
  if (navigator.canShare?.({ files: [shared] })) {
    try {
      await navigator.share({ files: [shared], title, text });
      return "shared";
    } catch (error) {
      // The person closed the sheet: nothing to do. Anything else falls back to the download.
      if (error instanceof DOMException && error.name === "AbortError") return "shared";
    }
  }
  download(file.blob, file.name);
  return "saved";
}

/** Saving is a download in a browser (the title and words are for the phone's share sheet). */
export async function saveCardFile(...[file]: [file: CardFile, title?: string, text?: string]): Promise<"saved"> {
  if (file.kind === "blob") download(file.blob, file.name);
  return "saved";
}
