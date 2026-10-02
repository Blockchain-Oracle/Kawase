import { Capabilities } from "@/components/home/capabilities";
import { Hero } from "@/components/home/hero";
import { JudgeKit } from "@/components/home/judge-kit";
import { Networks } from "@/components/home/networks";
import { Safety } from "@/components/home/safety";
import { VoiceLanguages } from "@/components/home/voice-languages";

export default function Home() {
  return (
    <>
      <Hero />
      <Capabilities />
      <Safety />
      <VoiceLanguages />
      <Networks />
      <JudgeKit />
    </>
  );
}
