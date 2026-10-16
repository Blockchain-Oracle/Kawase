// The landing's shared motion values (a constant module: the repo's lint lets numbers live in `*.config.*` files).
/** The ease every reveal and entrance uses: a quick start that settles softly (an "expo out" curve). */
export const EASE_OUT = [0.22, 1, 0.36, 1] as const;
/**
 * Holds a motion element at rest under reduced motion, from the server's first paint: the media query is CSS, and an
 * `!important` rule outranks the inline styles (and animations) motion writes. Never branch the render on
 * `useReducedMotion()` instead: it is null on the server, so the client hydrates against HTML rendered for full motion
 * and React keeps the server's styles (10-16: every Reveal block stayed invisible). Lint: kawase/no-reduced-motion-in-render.
 */
export const STILL_WITH_REDUCED_MOTION = "motion-reduce:transform-none! motion-reduce:opacity-100!";
