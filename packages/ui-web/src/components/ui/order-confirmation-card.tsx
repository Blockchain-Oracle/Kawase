import * as React from "react";
import { motion, AnimatePresence, type Variants } from "framer-motion";
import { CheckCircle2 } from "lucide-react";
import { cn } from "@kawase/ui-web/lib/utils"; // Your utility for merging class names
import { Button } from "@kawase/ui-web/components/ui/button"; // Assuming shadcn Button

// Source: 21st.dev kavikatiyar/order-confirmation-card. Reskinned for Kawase: the fixed order fields became
// a `details` list and a network badge, so one card spec can drive it. Layout, tokens and motion are unchanged.
export interface ReceiptCardProps {
  title: string;
  details: { label: string; value: string; isBold?: boolean | undefined }[];
  buttonText: string;
  onAction: () => void;
  badge?: string;
  icon?: React.ReactNode;
  className?: string;
}

export const ReceiptCard: React.FC<ReceiptCardProps> = ({
  title,
  details,
  buttonText,
  onAction,
  badge,
  icon = <CheckCircle2 className="h-12 w-12 text-green-500" />,
  className,
}) => {
  // Animation variants for Framer Motion
  const containerVariants: Variants = {
    hidden: { opacity: 0, scale: 0.95 },
    visible: {
      opacity: 1,
      scale: 1,
      transition: {
        duration: 0.4,
        ease: "easeInOut",
        staggerChildren: 0.1,
      },
    },
  };

  const itemVariants: Variants = {
    hidden: { opacity: 0, y: 20 },
    visible: { opacity: 1, y: 0, transition: { type: "spring", stiffness: 100 } },
  };

  return (
    <AnimatePresence>
      <motion.div
        variants={containerVariants}
        initial="hidden"
        animate="visible"
        aria-live="polite"
        className={cn(
          "w-full max-w-sm rounded-xl border bg-card text-card-foreground shadow-lg p-6 sm:p-8",
          className
        )}
      >
        <div className="flex flex-col items-center space-y-6 text-center">
          {/* Success Icon */}
          <motion.div variants={itemVariants}>{icon}</motion.div>

          {badge ? (
            <motion.span
              variants={itemVariants}
              className="rounded-full bg-network-surface px-2.5 py-0.5 text-xs font-medium text-network"
            >
              {badge}
            </motion.span>
          ) : null}

          {/* Title */}
          <motion.h2 variants={itemVariants} className="text-2xl font-semibold">
            {title}
          </motion.h2>

          {/* Order Details Section */}
          <motion.div variants={itemVariants} className="w-full space-y-4 pt-4">
            {details.map((item, index) => (
              <div
                key={item.label}
                className={cn(
                  "flex items-center justify-between border-b pb-4 text-sm text-muted-foreground",
                  {
                    "border-none pb-0": index === details.length - 1, // No border for the last item
                    "font-bold text-card-foreground": item.isBold, // Bold style for Total
                  }
                )}
              >
                <span>{item.label}</span>
                <span className={cn({ "text-lg": item.isBold })}>{item.value}</span>
              </div>
            ))}
          </motion.div>

          {/* Action Button */}
          <motion.div variants={itemVariants} className="w-full pt-4">
            <Button
              onClick={onAction}
              className="w-full h-12 text-md bg-network text-network-foreground hover:bg-network/90"
              size="lg"
            >
              {buttonText}
            </Button>
          </motion.div>
        </div>
      </motion.div>
    </AnimatePresence>
  );
};