// Voice and the ten languages: each language in its own script, with who hears it and who speaks it (VOICE_SPEECH),
// and voice's real state from the registry, including what it does not do yet.
import { CAPABILITIES, CAPABILITY_SCOPE, SUPPORTED_LOCALES, VOICE_SPEECH, type VoiceSpeech } from "@kawase/config";
import { LANGUAGE_NAMES, isRtlLocale } from "@kawase/i18n";

import { Section } from "@/components/section";
import { StateChip } from "@/components/state-chip";
import { NETWORKS } from "@/lib/capabilities";
import { links } from "@/lib/links";

const HEARS = "ElevenLabs Scribe v2";
const speaker = (speech: VoiceSpeech) =>
  speech.tts.provider === "elevenlabs" ? "ElevenLabs Flash v2.5" : "OpenAI gpt-4o-mini-tts";
const NETWORK_NAME = { mainnet: "Mainnet", testnet: "Testnet" } as const;

export function VoiceLanguages() {
  const voice = CAPABILITY_SCOPE.voice;
  return (
    <Section
      id="voice"
      eyebrow="Voice and languages"
      title={`Speak in any of ${SUPPORTED_LOCALES.length} languages`}
      body={
        <>
          The whole app follows your language from the first screen, right-to-left included. Voice is one conversation
          with chat: what you say lands in the same thread, and the same cards appear on screen. A send by voice waits on its card for your tap.
        </>
      }
    >
      <div className="mb-6 flex flex-wrap items-center gap-2 text-sm">
        <span className="font-medium">Voice</span>
        {NETWORKS.map((network) => (
          <StateChip key={network} state={CAPABILITIES.voice[network]} prefix={NETWORK_NAME[network]} />
        ))}
        {voice?.notYet[0] ? <span className="text-muted-foreground">· Not yet: {voice.notYet[0]}.</span> : null}
      </div>
      <ul className="grid grid-cols-2 gap-3 sm:grid-cols-3 lg:grid-cols-5">
        {SUPPORTED_LOCALES.map((locale) => (
          <li key={locale} className="rounded-3xl border border-border bg-card p-4">
            <p
              lang={locale}
              dir={isRtlLocale(locale) ? "rtl" : "ltr"}
              className="font-display text-xl font-semibold"
            >
              {LANGUAGE_NAMES[locale]}
            </p>
            <p className="mt-0.5 font-mono text-xs uppercase text-muted-foreground">{locale}</p>
            <dl className="mt-3 space-y-1 text-xs text-muted-foreground">
              <div>
                <dt className="inline font-semibold text-foreground/80">Hears: </dt>
                <dd className="inline">{HEARS}</dd>
              </div>
              <div>
                <dt className="inline font-semibold text-foreground/80">Speaks: </dt>
                <dd className="inline">{speaker(VOICE_SPEECH[locale])}</dd>
              </div>
            </dl>
          </li>
        ))}
      </ul>
      <p className="mt-4 text-sm text-muted-foreground">
        How it works:{" "}
        <a className="underline underline-offset-4 hover:text-foreground" href={`${links.docs}/docs/features/voice`}>
          voice
        </a>{" "}
        and{" "}
        <a className="underline underline-offset-4 hover:text-foreground" href={`${links.docs}/docs/features/languages`}>
          languages
        </a>{" "}
        in the docs.
      </p>
    </Section>
  );
}
