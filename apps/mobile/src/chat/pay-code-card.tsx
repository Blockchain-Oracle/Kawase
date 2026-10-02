// pay_from_code when the code cannot be paid here: the reason and its fix (switch network), the same card and words
// as the scanner (T3: one blocker wording in UI and chat). A payable code becomes the send card instead.
import type { PayCodeView } from "@kawase/api-client";

import { PayCodeProblem } from "@/scan/scanner";

export function PayCodeCard({ view }: { view: PayCodeView }) {
  return view.status === "unsupported" ? <PayCodeProblem view={view} /> : null;
}
