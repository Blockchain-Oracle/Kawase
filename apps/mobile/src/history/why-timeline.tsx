// The decision record behind one movement as a process timeline (21st.dev 28381 Process Timeline twin): what was
// asked and where, the checks, the route, the approval, what was sent and what it matched, each with its time. A step
// that stopped it (a blocking check, a send that failed) is the red one. Shared by the Why screen and the chat's Why
// card (explain_transaction).
import type { WhyStep, WhyView } from "@kawase/api-client";
import { ProcessTimeline, type TimelineStep } from "@kawase/ui-native/components/process-timeline";

import { useLocale } from "@/i18n/locale-provider";
import { useT } from "@/i18n";
import { useThemeColors } from "@/theme/use-theme-colors";

export function useStepText() {
  const { t, i18n } = useT();
  // An automation run's own reasons (not answered, declined, practice…) read from the automation words first.
  const policy = (code: string) => (i18n.exists(`automation.reason_${code}`) ? t(`automation.reason_${code}`) : t(`policy.${code}`, { defaultValue: code }));
  return (step: WhyStep): { title: string; detail?: string } => {
    switch (step.step) {
      case "asked":
        return { title: t(`why.asked.${step.surface}`), detail: Object.values(step.words).filter((value) => typeof value === "string" || typeof value === "number").join(" · ") || undefined };
      case "automation":
        return { title: t("why.automation", { kind: t(`why.automationKind.${step.kind}`) }) };
      case "checked":
        return {
          title: step.blocking ? t("why.checkedBlocked") : step.warnings.length > 0 ? t("why.checkedWarnings") : t("why.checkedClear"),
          detail: [...(step.blocking ? [policy(step.blocking)] : []), ...step.warnings.map(policy), ...step.open.map(policy)].join(" · ") || undefined,
        };
      case "route":
        return {
          title: step.provider ? t("why.routeVia", { provider: step.provider }) : t(`why.route.${step.route ?? "none"}`),
          detail: step.alternatives.length > 0 ? t("why.compared", { providers: step.alternatives.map((entry) => entry.provider).join(", ") }) : undefined,
        };
      case "approved":
        return { title: t(`why.approved.${step.route}`), detail: t(`why.asked.${step.via}`) };
      case "sent":
        return { title: t(`why.sentBy.${step.by}`), detail: t(`why.status.${step.status}`) };
      case "matched":
        return { title: t("why.matchedRequest"), detail: step.reference ? t("why.byReference") : undefined };
      case "audit":
        return { title: t(`why.audit.${step.action.replace(/[^a-z_.]/gi, "_")}`, { defaultValue: t("why.recorded") }) };
    }
  };
}

/** The one-line "what it was" above the timeline. */
export function useWhyHeadline() {
  const { t } = useT();
  return (why: WhyView) => t(`why.kind.${why.kind}`, Object.fromEntries(Object.entries(why.facts).map(([key, value]) => [key, String(value ?? "")])));
}

const FAILED_SENDS = new Set(["failed", "reverted"]);

export function WhyTimeline({ why, max }: { why: WhyView; max?: number }) {
  const { locale } = useLocale();
  const colors = useThemeColors();
  const text = useStepText();
  const time = (iso: string) => new Intl.DateTimeFormat(locale, { day: "numeric", month: "short", hour: "numeric", minute: "2-digit", second: "2-digit" }).format(new Date(iso));
  // Per-request rows ("POST /…") are the raw audit trail; the timeline shows what each step meant.
  const shown = why.steps.filter((step) => !(step.step === "audit" && step.action.includes(" ")));
  const steps: TimelineStep[] = (max ? shown.slice(0, max) : shown).map((step, index) => {
    const { title, detail } = text(step);
    const failed = (step.step === "checked" && Boolean(step.blocking)) || (step.step === "sent" && FAILED_SENDS.has(step.status));
    // The step's detail, then when it happened.
    return { id: `${step.step}-${index}`, title, description: [detail, time(step.at)].filter(Boolean).join("\n"), state: failed ? "failed" : "done" };
  });
  return <ProcessTimeline steps={steps} spinnerColor={colors.foreground} />;
}
