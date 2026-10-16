// Any address the docs do not have lands on the 404 (an i18n root has no app-level not-found of its own): Next prefers
// every specific route (the docs, the Markdown twins) over this catch-all.
import { notFound } from "next/navigation";

export default function Missing() {
  notFound();
}
