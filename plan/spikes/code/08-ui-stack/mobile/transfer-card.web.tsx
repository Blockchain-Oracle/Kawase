// Web twin: a 21st.dev component (DOM + Tailwind + framer-motion) from @kawase/ui-web, fed by the same spec
// and the same tokens.
import { ReceiptCard } from '@kawase/ui-web/components/ui/order-confirmation-card';

import type { TransferReceiptSpec } from './card-spec';

type Props = { spec: TransferReceiptSpec; onAction: (id: string) => void };

export function TransferCard({ spec, onAction }: Props) {
  return (
    <ReceiptCard
      title={spec.title}
      badge={spec.networkLabel}
      details={spec.rows.map((row) => ({ label: row.label, value: row.value, isBold: row.emphasis }))}
      buttonText={spec.action.label}
      onAction={() => onAction(spec.action.id)}
    />
  );
}
