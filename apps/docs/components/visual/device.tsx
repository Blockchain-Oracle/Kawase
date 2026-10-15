// The frames the docs show the app in, and the layer drawn over a capture: numbered pins, a highlighted control and a
// magnifying lens with its leader line. Pure markup (no hooks), so server pages and the client stepper share it.
// The phone is the landing's (apps/landing devices.tsx: Mitoshi's iPhone 15 Pro from 21st.dev), so a capture looks
// the same here as on getkawase.xyz. Styles: visual.css.
import type { CSSProperties, ReactNode } from "react";

import type { Device } from "@/lib/media";

const BODY = "M2 73C2 32.6832 34.6832 0 75 0H357C397.317 0 430 32.6832 430 73V809C430 849.317 397.317 882 357 882H75C34.6832 882 2 849.317 2 809V73Z";
const BUTTONS = [
  "M0 171C0 170.448 0.447715 170 1 170H3V204H1C0.447715 204 0 203.552 0 203V171Z",
  "M1 234C1 233.448 1.44772 233 2 233H3.5V300H2C1.44772 300 1 299.552 1 299V234Z",
  "M1 319C1 318.448 1.44772 318 2 318H3.5V385H2C1.44772 385 1 384.552 1 384V319Z",
  "M430 279H432C432.552 279 433 279.448 433 280V384C433 384.552 432.552 385 432 385H430V279Z",
];
const INNER = "M6 74C6 35.3401 37.3401 4 76 4H356C394.66 4 426 35.3401 426 74V808C426 846.66 394.66 878 356 878H76C37.3401 878 6 846.66 6 808V74Z";
const ISLAND = "M154 48.5C154 38.2827 162.283 30 172.5 30H259.5C269.717 30 278 38.2827 278 48.5C278 58.7173 269.717 67 259.5 67H172.5C162.283 67 154 58.7173 154 48.5Z";

/** A numbered marker: a dot at (x, y), or an outline around a control when `box` is given. Percent of the capture. */
export interface PinData {
  n: number;
  x: number;
  y: number;
  box?: [x: number, y: number, w: number, h: number];
}

/** A lens, precomputed on the server (geometry.ts) so the markup needs no measuring. */
export interface LensData {
  /** Centre in percent of the screen's width and height; diameter in percent of its width. */
  left: number;
  top: number;
  size: number;
  bgSize: number;
  bgX: number;
  bgY: number;
  /** The ring around the magnified spot and the leader, in the overlay's viewBox units (width 100). */
  ring: { x: number; y: number; r: number };
  leader?: [number, number, number, number];
  light: string;
  dark: string;
}

/** The app on a phone or in a desktop window. `children` are the screen's layers, `overlay` what is drawn above. */
export function DeviceFrame({
  device,
  children,
  overlay,
  className,
  style,
}: {
  device: Device;
  children: ReactNode;
  overlay?: ReactNode;
  className?: string;
  style?: CSSProperties;
}) {
  if (device === "desktop") {
    return (
      <div className={cx("kv-window", className)} style={style}>
        <div className="kv-window-bar" aria-hidden>
          <span className="kv-window-light" />
          <span className="kv-window-light" />
          <span className="kv-window-light" />
          <span className="kv-window-address">app.getkawase.xyz</span>
        </div>
        <div className="kv-window-screen">
          <div className="kv-screen-clip">{children}</div>
          {overlay}
        </div>
      </div>
    );
  }
  // The phone's screen is iOS's status bar (47 pt) over the capture (390 × 797 pt), so the Dynamic Island never sits on
  // the app's own header. The overlay sits outside the rounded screen so a lens can reach past the frame.
  return (
    <div className={cx("kv-phone", className)} style={style}>
      <svg className="kv-phone-body" viewBox="0 0 433 882" fill="none" aria-hidden focusable="false">
        <path d={BODY} className="kv-phone-metal" />
        {BUTTONS.map((d) => (
          <path key={d} d={d} className="kv-phone-metal" />
        ))}
        <path d={INNER} className="kv-phone-bezel" />
      </svg>
      <div className="kv-phone-screen">
        <StatusBar />
        <div className="kv-screen-clip">{children}</div>
        <svg className="kv-phone-island" viewBox="21.25 19.25 390.5 843.5" preserveAspectRatio="none" aria-hidden focusable="false">
          <path d={ISLAND} />
        </svg>
      </div>
      {overlay ? <div className="kv-phone-overlay">{overlay}</div> : null}
    </div>
  );
}

/** iOS's status bar at 9:41, drawn in the page's theme. */
function StatusBar() {
  return (
    <svg className="kv-statusbar" viewBox="0 0 390 47" aria-hidden focusable="false">
      <text x="54" y="31" textAnchor="middle" className="kv-statusbar-time">
        9:41
      </text>
      {/* signal */}
      <g transform="translate(294 19)">
        <rect x="0" y="7" width="3.2" height="4.8" rx="0.9" />
        <rect x="4.6" y="5" width="3.2" height="6.8" rx="0.9" />
        <rect x="9.2" y="2.6" width="3.2" height="9.2" rx="0.9" />
        <rect x="13.8" y="0" width="3.2" height="11.8" rx="0.9" />
      </g>
      {/* wi-fi */}
      <g transform="translate(317 18.6)">
        <path d="M8.2 2.6c2.4 0 4.6.9 6.3 2.4l1.2-1.3C13.7 1.8 11 .8 8.2.8S2.7 1.8.7 3.7l1.2 1.3c1.7-1.5 3.9-2.4 6.3-2.4Z" />
        <path d="M8.2 6.1c1.5 0 2.8.5 3.8 1.4l1.2-1.3C11.8 5 10 4.3 8.2 4.3S4.6 5 3.2 6.2l1.2 1.3c1-.9 2.3-1.4 3.8-1.4Z" />
        <path d="M8.2 9.5c.6 0 1.1.2 1.5.5L8.2 11.7 6.7 10c.4-.3.9-.5 1.5-.5Z" />
      </g>
      {/* battery */}
      <g transform="translate(339 17.5)">
        <rect x="0.5" y="0.5" width="24" height="12.5" rx="3.8" className="kv-statusbar-outline" />
        <rect x="2.5" y="2.5" width="20" height="8.5" rx="2.2" />
        <path d="M26 4.6v4.3c.9-.3 1.5-1.2 1.5-2.15S26.9 4.9 26 4.6Z" className="kv-statusbar-cap" />
      </g>
    </svg>
  );
}

/** One capture in both themes; the page's theme shows one (visual.css). */
export function ScreenImage({ light, dark, alt, eager, hidden }: { light: string; dark: string; alt: string; eager?: boolean; hidden?: boolean }) {
  const loading = eager ? "eager" : "lazy";
  if (light === dark) {
    return <img className="kv-screen-img" src={light} alt={alt} loading={loading} decoding="async" data-hidden={hidden || undefined} />;
  }
  return (
    <>
      <img className="kv-screen-img kv-only-light" src={light} alt={alt} loading={loading} decoding="async" data-hidden={hidden || undefined} />
      <img className="kv-screen-img kv-only-dark" src={dark} alt={alt} loading={loading} decoding="async" data-hidden={hidden || undefined} />
    </>
  );
}

/** Pins, the highlighted spot and the lens over one screen. `ratio` is the capture's height over its width. */
export function Overlay({ ratio, pins, lens, hidden }: { ratio: number; pins: PinData[]; lens?: LensData; hidden?: boolean }) {
  if (pins.length === 0 && !lens) return null;
  return (
    <div className="kv-overlay" data-hidden={hidden || undefined} aria-hidden>
      {lens ? (
        <svg className="kv-overlay-lines" viewBox={`0 0 100 ${round(100 * ratio)}`} preserveAspectRatio="none">
          <circle cx={lens.ring.x} cy={lens.ring.y} r={lens.ring.r} className="kv-ring" />
          {lens.leader ? (
            <line x1={lens.leader[0]} y1={lens.leader[1]} x2={lens.leader[2]} y2={lens.leader[3]} className="kv-leader" />
          ) : null}
        </svg>
      ) : null}
      {pins.map((pin, index) =>
        pin.box ? (
          <span
            key={pin.n}
            className="kv-pin-box"
            data-n={pin.n}
            style={{ left: `${pin.box[0]}%`, top: `${pin.box[1]}%`, width: `${pin.box[2]}%`, height: `${pin.box[3]}%`, ["--i" as string]: index }}
          >
            <span className="kv-pin" data-n={pin.n}>
              {pin.n}
            </span>
          </span>
        ) : (
          <span key={pin.n} className="kv-pin kv-pin-dot" data-n={pin.n} style={{ left: `${pin.x}%`, top: `${pin.y}%`, ["--i" as string]: index }}>
            {pin.n}
          </span>
        ),
      )}
      {lens ? (
        <span
          className="kv-lens"
          style={{ left: `${lens.left}%`, top: `${lens.top}%`, width: `${lens.size}%` }}
        >
          {[lens.light, lens.dark].map((src, index) => (
            <span
              key={src + index}
              className={cx("kv-lens-img", lens.light === lens.dark ? undefined : index === 0 ? "kv-only-light" : "kv-only-dark")}
              style={{
                backgroundImage: `url(${src})`,
                backgroundSize: `${round(lens.bgSize)}% auto`,
                backgroundPosition: `${round(lens.bgX)}% ${round(lens.bgY)}%`,
              }}
            />
          ))}
        </span>
      ) : null}
    </div>
  );
}

/** The numbered key under or beside a capture: the pin's number and what it points at. */
export function Legend({ items, className }: { items: { n: number; label: ReactNode }[]; className?: string }) {
  if (items.length === 0) return null;
  return (
    <ol className={cx("kv-legend", className)}>
      {items.map((item) => (
        <li key={item.n} data-n={item.n}>
          <span className="kv-pin kv-pin-static" aria-hidden>
            {item.n}
          </span>
          <span className="kv-legend-text">{item.label}</span>
        </li>
      ))}
    </ol>
  );
}

const round = (value: number) => Math.round(value * 100) / 100;

export const cx = (...names: (string | false | undefined)[]) => names.filter(Boolean).join(" ");
