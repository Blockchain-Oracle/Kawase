// A design-review page (not part of the product): its screen and sample data load only when the page is opened, so
// none of it rides in the app's first load (the web bundle carried every board and catalog).
import * as React from "react";

const Page = React.lazy(() => import("@/dev/art-route"));

export default function ArtRoute() {
  return (
    <React.Suspense fallback={null}>
      <Page />
    </React.Suspense>
  );
}
