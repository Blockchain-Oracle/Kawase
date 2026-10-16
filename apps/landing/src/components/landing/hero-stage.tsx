"use client";

// The hero's devices in 3D (the owner, 10-15: "this is 3D, it has to be"): the web app's window behind, two phones in
// front, composed like the README banner. The stage starts tilted back in perspective and flattens as the hero
// scrolls away (21st.dev 27355 ruixen.ui/phone-scroll-hero: a tilted device that straightens on scroll; kept its
// scroll-to-rotation idea, dropped its headline overlap and its own frame), and on a desktop it leans a few degrees
// toward the pointer, on a spring. Reduced motion: flat and still, held by CSS (STILL_WITH_REDUCED_MOTION) so the
// server's HTML is already right; the hook only keeps the pointer listener off.
import { motion, useMotionValue, useReducedMotion, useScroll, useSpring, useTransform } from "motion/react";
import { useEffect, useRef } from "react";

import { EASE_OUT, STILL_WITH_REDUCED_MOTION } from "@/lib/landing.config";
import { cn } from "@/lib/utils";

import { PhoneShot, Window } from "./devices";

/** Where the stage starts, in degrees: tilted back and turned a little toward the copy. */
const TILT_X = 16;
const TURN_Y = -14;
const ROLL_Z = 2;
/** How far the pointer leans it, in degrees, at the window's edge. */
const LEAN = 5;
const SPRING = { stiffness: 120, damping: 20, mass: 0.6 };
/** How far the stage rises as it settles, in px: from below the fold to a little above its place. */
const LIFT_FROM = 40;
const LIFT_TO = -20;
/** A pointer position across the window as −1…1 (the window's width spans 2). */
const SPAN = 2;
const centred = (at: number, size: number) => (at / size) * SPAN - 1;

export function HeroStage() {
  const reduced = useReducedMotion();
  const ref = useRef<HTMLDivElement>(null);
  const { scrollYProgress } = useScroll({ target: ref, offset: ["start 80%", "end 30%"] });
  const settle = useSpring(scrollYProgress, SPRING);
  const leanX = useMotionValue(0);
  const leanY = useMotionValue(0);
  const springX = useSpring(leanX, SPRING);
  const springY = useSpring(leanY, SPRING);

  const rotateX = useTransform([settle, springY], ([p, y]: number[]) => (1 - (p ?? 0)) * TILT_X - (y ?? 0));
  const rotateY = useTransform([settle, springX], ([p, x]: number[]) => (1 - (p ?? 0)) * TURN_Y + (x ?? 0));
  const rotateZ = useTransform(settle, (p) => (1 - p) * ROLL_Z);
  const lift = useTransform(settle, [0, 1], [LIFT_FROM, LIFT_TO]);

  useEffect(() => {
    if (reduced) return;
    const fine = window.matchMedia("(pointer: fine)");
    if (!fine.matches) return;
    const move = (event: PointerEvent) => {
      leanX.set(centred(event.clientX, window.innerWidth) * LEAN);
      leanY.set(centred(event.clientY, window.innerHeight) * LEAN);
    };
    window.addEventListener("pointermove", move, { passive: true });
    return () => window.removeEventListener("pointermove", move);
  }, [reduced, leanX, leanY]);

  return (
    <div ref={ref} className="relative [perspective:1800px]" aria-label="Kawase on the web, on iPhone and on Android">
      <motion.div
        className={cn("relative mx-auto h-[min(118vw,560px)] w-full max-w-[760px] [transform-style:preserve-3d] lg:h-[640px]", STILL_WITH_REDUCED_MOTION)}
        style={{ rotateX, rotateY, rotateZ, y: lift }}
        initial={{ opacity: 0, y: 60 }}
        animate={{ opacity: 1, y: 0 }}
        transition={{ duration: 0.9, ease: EASE_OUT }}
      >
        {/* The web app, behind: hidden on a narrow phone, where two phones already fill the width. */}
        <div className="absolute top-0 right-0 hidden w-[92%] sm:block lg:w-[96%]" style={{ transform: "translateZ(-80px)" }}>
          <Window name="desktop-home" alt="Kawase in a browser: Home, the sidebar and Trending on Arc" eager />
        </div>
        <div className="absolute bottom-0 left-[4%] sm:left-[6%]" style={{ transform: "translateZ(60px)" }}>
          <PhoneShot name="welcome" alt="Kawase on iPhone: asking it to bring USDC from Base, five routes checked, the best one picked" eager className="[--phone-w:min(46vw,250px)] lg:[--phone-w:262px]" />
        </div>
        <div className="absolute right-[2%] bottom-[-6%] sm:right-[8%]" style={{ transform: "translateZ(120px)" }}>
          <PhoneShot name="markets" alt="Kawase Markets: long or short on Arc's majors, and the marketplace of paid tools" eager className="[--phone-w:min(44vw,236px)] lg:[--phone-w:246px]" />
        </div>
      </motion.div>
    </div>
  );
}
