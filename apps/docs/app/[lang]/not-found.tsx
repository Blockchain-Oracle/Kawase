// A missing guide inside the docs (the page calls notFound()): the same 404 as an unmatched address
// (app/global-not-found.tsx), inside the reader's language layout.
import { NotFoundPage } from "@/components/not-found-page";

export default function NotFound() {
  return <NotFoundPage />;
}
