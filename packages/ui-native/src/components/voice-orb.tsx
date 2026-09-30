// Native twin of ui-web's voice-powered-orb (21st.dev isaiahbjork/voice-powered-orb).
// The same fragment shader, ported from WebGL to Skia's shader language: since the revamp (Lime on Ink, D35) a glass
// sphere with a core that breathes with the voice level. The level comes from a prop (the app owns the microphone),
// and with reduced motion the orb is a still frame.
import { tokens } from "@kawase/ui-tokens";
import { cn } from "@kawase/ui-native/lib/utils";
import { Canvas, Fill, Shader, Skia, type SkSize } from "@shopify/react-native-skia";
import * as React from "react";
import { View, type ViewProps } from "react-native";
import {
  useDerivedValue,
  useFrameCallback,
  useReducedMotion,
  useSharedValue,
  type SharedValue,
} from "react-native-reanimated";

const ORB_SHADER = Skia.RuntimeEffect.Make(`
uniform float iTime;
uniform float2 iResolution;
uniform float hover;
uniform float rot;
uniform float hoverIntensity;
uniform float3 baseColor1;
uniform float3 baseColor2;
uniform float3 baseColor3;

float3 hash33(float3 p3) {
  p3 = fract(p3 * float3(0.1031, 0.11369, 0.13787));
  p3 += dot(p3, p3.yxz + 19.19);
  return -1.0 + 2.0 * fract(float3(p3.x + p3.y, p3.x + p3.z, p3.y + p3.z) * p3.zyx);
}

float snoise3(float3 p) {
  const float K1 = 0.333333333;
  const float K2 = 0.166666667;
  float3 i = floor(p + (p.x + p.y + p.z) * K1);
  float3 d0 = p - (i - (i.x + i.y + i.z) * K2);
  float3 e = step(float3(0.0), d0 - d0.yzx);
  float3 i1 = e * (1.0 - e.zxy);
  float3 i2 = 1.0 - e.zxy * (1.0 - e);
  float3 d1 = d0 - (i1 - K2);
  float3 d2 = d0 - (i2 - K1);
  float3 d3 = d0 - 0.5;
  float4 h = max(0.6 - float4(dot(d0, d0), dot(d1, d1), dot(d2, d2), dot(d3, d3)), 0.0);
  float4 n = h * h * h * h * float4(
    dot(d0, hash33(i)),
    dot(d1, hash33(i + i1)),
    dot(d2, hash33(i + i2)),
    dot(d3, hash33(i + 1.0))
  );
  return dot(float4(31.316), n);
}

// Kawase (Lime on Ink): a glass sphere lit from the top-start, with a lime core that breathes with the voice
// level. baseColor1 = the core, baseColor2 = the rim light, baseColor3 = the glass body.
const float sphereRadius = 0.86;
const float edgeSoftness = 0.012;

float4 draw(float2 uv) {
  float3 color1 = baseColor1;
  float3 color2 = baseColor2;
  float3 color3 = baseColor3;

  float len = length(uv);
  float inside = 1.0 - smoothstep(sphereRadius - edgeSoftness, sphereRadius + edgeSoftness, len);
  if (inside <= 0.0) return float4(0.0);
  float z = sqrt(max(0.0, 1.0 - (len * len) / (sphereRadius * sphereRadius)));
  float3 n = normalize(float3(uv / sphereRadius, z));
  float3 lightDir = normalize(float3(-0.45, -0.6, 0.65));
  float diff = max(dot(n, lightDir), 0.0);
  float fresnel = pow(1.0 - z, 3.0);

  float n0 = snoise3(float3(uv * 1.4, iTime * 0.3 + rot)) * 0.5 + 0.5;
  float coreR = 0.22 + hover * 0.30 + n0 * 0.04;
  float core = smoothstep(coreR, 0.0, len);
  float halo = smoothstep(coreR + 0.35, coreR * 0.6, len) * (0.30 + hover * 0.30);
  float n1 = snoise3(float3(uv * 3.0 + 7.0, iTime * 0.15)) * 0.5 + 0.5;
  float edge = smoothstep(sphereRadius - 0.07, sphereRadius - 0.006, len);

  float2 hp = float2(-0.34, -0.42);
  float2 hd = (uv - hp) * float2(6.0, 9.0);
  float spec = exp(-dot(hd, hd));

  float3 col = color3 * (0.10 + 0.10 * diff) + color3 * n1 * 0.06;
  col += color1 * (core * (0.9 + hover * 0.3) + halo);
  col += color2 * (fresnel * 0.6 + edge * 0.5) * (1.0 + hover * 0.3);
  col += float3(1.0) * (spec * 0.85 + edge * 0.15);
  float alpha = inside * (0.30 + 0.70 * max(max(fresnel * 1.4, edge * 0.8), core) + spec);
  return float4(clamp(col, 0.0, 1.0), clamp(alpha, 0.0, 1.0));
}

half4 main(float2 fragCoord) {
  float2 center = iResolution * 0.5;
  float size = min(iResolution.x, iResolution.y);
  float2 uv = (fragCoord - center) / size * 2.0;

  float4 col = draw(uv);
  return half4(col.rgb * col.a, col.a);
}
`)!;

// The motion values below are the web component's, so both orbs move alike.
const BASE_ROTATION_SPEED = 0.3;
const MAX_ROTATION_SPEED = 1.2;
const ROTATION_GAIN = 2;
const ROTATION_THRESHOLD = 0.05;
const MAX_HOVER_INTENSITY = 0.8;
const HOVER_GAIN = 2;
const HOVER_INTENSITY_GAIN = 0.8;
const LEVEL_SMOOTHING = 8;
// The frame the still ring is drawn from when motion is reduced.
const STILL_TIME = 2.4;
const MS_PER_SECOND = 1000;
const DEFAULT_FRAME_MS = 16;
// A long pause (the app was in the background) must not make the orb jump.
const MAX_FRAME_MS = 64;

const HEX_RADIX = 16;
const CHANNEL_MAX = 255;
const RED_SHIFT = 16;
const GREEN_SHIFT = 8;

type OrbColors = readonly [string, string, string];

function hexToRgb(hex: string): [number, number, number] {
  const n = Number.parseInt(hex.replace("#", ""), HEX_RADIX);
  const channel = (shift: number) => ((n >> shift) & CHANNEL_MAX) / CHANNEL_MAX;
  return [channel(RED_SHIFT), channel(GREEN_SHIFT), channel(0)];
}

type VoiceOrbProps = Omit<ViewProps, "children"> & {
  /** The three ring colours as hex. Defaults to the mainnet orb colours from the tokens. */
  colors?: OrbColors;
  /** Voice level from 0 to 1. A number re-renders; a shared value updates without rendering. */
  level?: number | SharedValue<number>;
};

function VoiceOrb({ colors = tokens.orb.mainnet, level = 0, className, ...props }: VoiceOrbProps) {
  const reduced = useReducedMotion();
  const size = useSharedValue<SkSize>({ width: 0, height: 0 });
  const time = useSharedValue(STILL_TIME);
  const rot = useSharedValue(0);
  const smoothed = useSharedValue(0);
  const levelValue = useSharedValue(typeof level === "number" ? level : 0);
  const source = typeof level === "number" ? levelValue : level;

  React.useEffect(() => {
    if (typeof level === "number") levelValue.value = level;
  }, [level, levelValue]);

  useFrameCallback((frame) => {
    "worklet";
    if (reduced) return;
    const dt = Math.min(frame.timeSincePreviousFrame ?? DEFAULT_FRAME_MS, MAX_FRAME_MS) / MS_PER_SECOND;
    time.value += dt;
    const target = Math.min(Math.max(source.value, 0), 1);
    smoothed.value += (target - smoothed.value) * Math.min(1, dt * LEVEL_SMOOTHING);
    if (smoothed.value > ROTATION_THRESHOLD) {
      rot.value += dt * (BASE_ROTATION_SPEED + smoothed.value * MAX_ROTATION_SPEED * ROTATION_GAIN);
    }
  });

  const [c1, c2, c3] = colors;
  const baseColor1 = hexToRgb(c1);
  const baseColor2 = hexToRgb(c2);
  const baseColor3 = hexToRgb(c3);

  const uniforms = useDerivedValue(() => ({
    iTime: time.value,
    iResolution: [size.value.width, size.value.height],
    hover: Math.min(smoothed.value * HOVER_GAIN, 1),
    hoverIntensity: Math.min(smoothed.value * MAX_HOVER_INTENSITY * HOVER_INTENSITY_GAIN, MAX_HOVER_INTENSITY),
    rot: rot.value,
    baseColor1,
    baseColor2,
    baseColor3,
  }));

  return (
    <View accessibilityRole="image" className={cn("aspect-square w-full", className)} {...props}>
      <Canvas style={{ flex: 1 }} onSize={size}>
        <Fill>
          <Shader source={ORB_SHADER} uniforms={uniforms} />
        </Fill>
      </Canvas>
    </View>
  );
}

export { VoiceOrb };
export type { OrbColors, VoiceOrbProps };
