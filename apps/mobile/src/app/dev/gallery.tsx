// Internal route: the component gallery. The screen is split by platform (src/gallery/gallery-screen*.tsx).
import { GalleryScreen } from "@/gallery/gallery-screen";
import { usePreviewParams } from "@/gallery/use-preview-params";

export default function GalleryRoute() {
  const { locale, scroll } = usePreviewParams();
  return <GalleryScreen key={`${locale}-${scroll}`} initialLocale={locale} initialScroll={scroll} />;
}
