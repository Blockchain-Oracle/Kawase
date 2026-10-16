// A missing guide (the docs page calls notFound()), inside the docs layout: the same 404 as an unmatched address
// (app/global-not-found.tsx), inside the reader's language layout.
import { NotFoundPage } from "@/components/not-found-page";

export default function NotFound() {
  return <NotFoundPage />;
}
