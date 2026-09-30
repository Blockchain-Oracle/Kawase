// Internal route: the Koe home screen with sample content.
import { HomeSample } from "@/gallery/home-sample";
import { usePreviewParams } from "@/gallery/use-preview-params";
import { useTheme } from "@/theme/theme-provider";

export default function HomeSampleRoute() {
  const { locale } = usePreviewParams();
  const { network } = useTheme();
  return <HomeSample network={network} locale={locale} />;
}
