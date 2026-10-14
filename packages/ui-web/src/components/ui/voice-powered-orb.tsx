"use client";

import React, { useEffect, useRef, type FC } from "react";
import { Renderer, Program, Mesh, Triangle, Vec3, type OGLRenderingContext } from "ogl";
import { tokens } from "@kawase/ui-tokens";

// Source: 21st.dev isaiahbjork/voice-powered-orb. Changes for Kawase: type fixes (the published source does not
// compile under current TypeScript DOM types), the voice level and colours as props, a still frame when the visitor
// prefers reduced motion, and (10-14) the ring shader replaced by a fluid magenta orb that flows faster with the voice.
type OrbGL = OGLRenderingContext & { canvas: HTMLCanvasElement };
const DEFAULT_ORB_COLORS: readonly [string, string, string] = tokens.orb.mainnet;
const hexToVec3 = (hex: string) => {
  const n = Number.parseInt(hex.replace("#", ""), 16);
  return new Vec3(((n >> 16) & 255) / 255, ((n >> 8) & 255) / 255, (n & 255) / 255);
};
import { cn } from "@kawase/ui-web/lib/utils";

interface VoicePoweredOrbProps {
  className?: string;
  hue?: number;
  /** Kawase: the three ring colours as hex, so the orb follows the tokens (default: the mainnet orb colours). */
  colors?: readonly [string, string, string];
  /** Kawase: a voice level from 0 to 1 supplied by the app. When set, the orb does not open the microphone itself. */
  level?: number;
  enableVoiceControl?: boolean;
  voiceSensitivity?: number;
  maxRotationSpeed?: number;
  maxHoverIntensity?: number;
  onVoiceDetected?: (detected: boolean) => void;
}

export const VoicePoweredOrb: FC<VoicePoweredOrbProps> = ({
  className,
  hue = 0,
  colors = DEFAULT_ORB_COLORS,
  level,
  enableVoiceControl = true,
  voiceSensitivity = 1.5,
  maxRotationSpeed = 1.2,
  maxHoverIntensity = 0.8,
  onVoiceDetected,
}) => {
  const ctnDom = useRef<HTMLDivElement>(null);
  const audioContextRef = useRef<AudioContext | null>(null);
  const analyserRef = useRef<AnalyserNode | null>(null);
  const microphoneRef = useRef<MediaStreamAudioSourceNode | null>(null);
  const dataArrayRef = useRef<Uint8Array<ArrayBuffer> | null>(null);
  const animationFrameRef = useRef<number | undefined>(undefined);
  const mediaStreamRef = useRef<MediaStream | null>(null);
  const levelRef = useRef(level);
  levelRef.current = level;
  const colorsRef = useRef(colors);
  colorsRef.current = colors;
  const ownsMicrophone = enableVoiceControl && level === undefined;

  const vert = /* glsl */ `
    precision highp float;
    attribute vec2 position;
    attribute vec2 uv;
    varying vec2 vUv;
    void main() {
      vUv = uv;
      gl_Position = vec4(position, 0.0, 1.0);
    }
  `;

  const frag = /* glsl */ `
    precision highp float;

    uniform float iTime;
    uniform vec3 iResolution;
    uniform float hue;
    uniform float hover;
    uniform float rot;
    uniform float hoverIntensity;
    varying vec2 vUv;

    vec3 rgb2yiq(vec3 c) {
      float y = dot(c, vec3(0.299, 0.587, 0.114));
      float i = dot(c, vec3(0.596, -0.274, -0.322));
      float q = dot(c, vec3(0.211, -0.523, 0.312));
      return vec3(y, i, q);
    }

    vec3 yiq2rgb(vec3 c) {
      float r = c.x + 0.956 * c.y + 0.621 * c.z;
      float g = c.x - 0.272 * c.y - 0.647 * c.z;
      float b = c.x - 1.106 * c.y + 1.703 * c.z;
      return vec3(r, g, b);
    }

    vec3 adjustHue(vec3 color, float hueDeg) {
      float hueRad = hueDeg * 3.14159265 / 180.0;
      vec3 yiq = rgb2yiq(color);
      float cosA = cos(hueRad);
      float sinA = sin(hueRad);
      float i = yiq.y * cosA - yiq.z * sinA;
      float q = yiq.y * sinA + yiq.z * cosA;
      yiq.y = i;
      yiq.z = q;
      return yiq2rgb(yiq);
    }

    vec3 hash33(vec3 p3) {
      p3 = fract(p3 * vec3(0.1031, 0.11369, 0.13787));
      p3 += dot(p3, p3.yxz + 19.19);
      return -1.0 + 2.0 * fract(vec3(
        p3.x + p3.y,
        p3.x + p3.z,
        p3.y + p3.z
      ) * p3.zyx);
    }

    float snoise3(vec3 p) {
      const float K1 = 0.333333333;
      const float K2 = 0.166666667;
      vec3 i = floor(p + (p.x + p.y + p.z) * K1);
      vec3 d0 = p - (i - (i.x + i.y + i.z) * K2);
      vec3 e = step(vec3(0.0), d0 - d0.yzx);
      vec3 i1 = e * (1.0 - e.zxy);
      vec3 i2 = 1.0 - e.zxy * (1.0 - e);
      vec3 d1 = d0 - (i1 - K2);
      vec3 d2 = d0 - (i2 - K1);
      vec3 d3 = d0 - 0.5;
      vec4 h = max(0.6 - vec4(
        dot(d0, d0),
        dot(d1, d1),
        dot(d2, d2),
        dot(d3, d3)
      ), 0.0);
      vec4 n = h * h * h * h * vec4(
        dot(d0, hash33(i)),
        dot(d1, hash33(i + i1)),
        dot(d2, hash33(i + i2)),
        dot(d3, hash33(i + 1.0))
      );
      return dot(vec4(31.316), n);
    }

    vec4 extractAlpha(vec3 colorIn) {
      float a = max(max(colorIn.r, colorIn.g), colorIn.b);
      return vec4(colorIn.rgb / (a + 1e-5), a);
    }

    uniform vec3 baseColor1;
    uniform vec3 baseColor2;
    uniform vec3 baseColor3;
    // Kawase (Senryo, 10-14): a living fluid orb, the voice's one figure (ChatGPT's voice mode, Siri). Three tones
    // flow through the whole sphere by domain-warped noise: baseColor1 = the vivid body (magenta), baseColor2 = the
    // light currents, baseColor3 = the depth. The voice level (hover) speeds the flow, deepens the warp, brightens the
    // inner glow and swells the sphere a little; a soft rim and highlight keep it round.
    const float sphereRadius = 0.86;
    const float edgeSoftness = 0.012;

    vec4 draw(vec2 uv) {
      vec3 color1 = adjustHue(baseColor1, hue);
      vec3 color2 = adjustHue(baseColor2, hue);
      vec3 color3 = adjustHue(baseColor3, hue);

      float r = sphereRadius * (0.95 + hover * 0.07);
      float len = length(uv);
      float inside = 1.0 - smoothstep(r - edgeSoftness, r + edgeSoftness, len);
      if (inside <= 0.0) return vec4(0.0);
      vec2 p = uv / r;
      float z = sqrt(max(0.0, 1.0 - dot(p, p)));
      float t = iTime * (0.16 + hover * 0.6) + rot * 0.2;

      vec2 q = vec2(snoise3(vec3(p * 1.1, t)), snoise3(vec3(p * 1.1 + 5.2, t + 1.7)));
      vec2 w = p + q * (0.55 + hover * 0.4);
      float f1 = snoise3(vec3(w * 1.5, t * 1.2)) * 0.5 + 0.5;
      float f2 = snoise3(vec3(w * 2.3 + 3.1, t * 0.8 + 2.0)) * 0.5 + 0.5;

      vec3 col = mix(color3, color1, smoothstep(0.12, 0.8, f1));
      col = mix(col, color2, smoothstep(0.55, 0.95, f2) * 0.7);
      col *= 0.72 + 0.38 * z;
      col += color2 * (0.06 + hover * 0.28) * smoothstep(1.0, 0.0, length(p));
      float fresnel = pow(1.0 - z, 2.5);
      col = mix(col, color2, fresnel * 0.4);
      vec2 hd = (p - vec2(-0.38, -0.46)) * vec2(4.5, 6.0);
      col += vec3(1.0) * exp(-dot(hd, hd)) * 0.32;
      return vec4(clamp(col, 0.0, 1.0), inside);
    }

    vec4 mainImage(vec2 fragCoord) {
      vec2 center = iResolution.xy * 0.5;
      float size = min(iResolution.x, iResolution.y);
      vec2 uv = (fragCoord - center) / size * 2.0;

      return draw(uv);
    }

    void main() {
      vec2 fragCoord = vUv * iResolution.xy;
      vec4 col = mainImage(fragCoord);
      gl_FragColor = vec4(col.rgb * col.a, col.a);
    }
  `;

  // Voice analysis function
  const analyzeAudio = () => {
    if (!analyserRef.current || !dataArrayRef.current) return 0;

    analyserRef.current.getByteFrequencyData(dataArrayRef.current);

    // Calculate RMS (Root Mean Square) for better voice detection
    let sum = 0;
    for (let i = 0; i < dataArrayRef.current.length; i++) {
      const value = dataArrayRef.current[i] / 255;
      sum += value * value;
    }
    const rms = Math.sqrt(sum / dataArrayRef.current.length);

    // Apply sensitivity and boost the signal
    const level = Math.min(rms * voiceSensitivity * 3.0, 1);

    return level;
  };

  // Stop microphone and cleanup
  const stopMicrophone = () => {
    try {
      // Stop all tracks in the media stream
      if (mediaStreamRef.current) {
        mediaStreamRef.current.getTracks().forEach(track => {
          track.stop();
        });
        mediaStreamRef.current = null;
      }

      // Disconnect and cleanup audio nodes
      if (microphoneRef.current) {
        microphoneRef.current.disconnect();
        microphoneRef.current = null;
      }

      if (analyserRef.current) {
        analyserRef.current.disconnect();
        analyserRef.current = null;
      }

      // Close audio context
      if (audioContextRef.current && audioContextRef.current.state !== 'closed') {
        audioContextRef.current.close();
        audioContextRef.current = null;
      }

      dataArrayRef.current = null;
    } catch (error) {
      console.warn('Error stopping microphone:', error);
    }
  };

  // Initialize microphone access
  const initMicrophone = async () => {
    try {
      // Clean up any existing microphone first
      stopMicrophone();

      const stream = await navigator.mediaDevices.getUserMedia({
        audio: {
          echoCancellation: false,  // Better for voice analysis
          noiseSuppression: false,  // Better for voice analysis
          autoGainControl: false,   // Better for voice analysis
          sampleRate: 44100,
        },
      });

      // Store the stream reference for cleanup
      mediaStreamRef.current = stream;

      audioContextRef.current = new (window.AudioContext || (window as any).webkitAudioContext)();

      // Resume audio context if needed
      if (audioContextRef.current.state === 'suspended') {
        await audioContextRef.current.resume();
      }

      analyserRef.current = audioContextRef.current.createAnalyser();
      microphoneRef.current = audioContextRef.current.createMediaStreamSource(stream);

      // Optimize for voice detection
      analyserRef.current.fftSize = 512;  // Higher resolution
      analyserRef.current.smoothingTimeConstant = 0.3;  // Less smoothing for responsiveness
      analyserRef.current.minDecibels = -90;
      analyserRef.current.maxDecibels = -10;

      microphoneRef.current.connect(analyserRef.current);
      dataArrayRef.current = new Uint8Array(analyserRef.current.frequencyBinCount);

      return true;
    } catch (error) {
      console.warn("Microphone access denied or not available:", error);
      return false;
    }
  };

  useEffect(() => {
    const container = ctnDom.current;
    if (!container) return;

    let rendererInstance: Renderer | null = null;
    let glContext: OrbGL | null = null;
    let rafId: number;
    let program: Program | null = null;

    try {
      rendererInstance = new Renderer({
        alpha: true,
        // Kawase: the shader outputs premultiplied colour; blending it as straight alpha darkened the glow's
        // edge, which showed as a grey halo on light backgrounds.
        premultipliedAlpha: true,
        antialias: true,
        dpr: window.devicePixelRatio || 1
      });
      glContext = rendererInstance.gl;
      // Set clear color to transparent to avoid white flash
      glContext.clearColor(0, 0, 0, 0);
      // Enable alpha blending for proper transparency
      glContext.enable(glContext.BLEND);
      glContext.blendFunc(glContext.ONE, glContext.ONE_MINUS_SRC_ALPHA);

      // Clear any existing canvas
      while (container.firstChild) {
        container.removeChild(container.firstChild);
      }
      // Kawase: absolutely placed, so the canvas's own size can never push the container's layout.
      Object.assign(glContext.canvas.style, { position: "absolute", inset: "0", display: "block" });
      container.appendChild(glContext.canvas);

      const geometry = new Triangle(glContext);
      program = new Program(glContext, {
        vertex: vert,
        fragment: frag,
        uniforms: {
          iTime: { value: 0 },
          iResolution: {
            value: new Vec3(
              glContext.canvas.width,
              glContext.canvas.height,
              glContext.canvas.width / glContext.canvas.height
            ),
          },
          hue: { value: hue },
          baseColor1: { value: hexToVec3(colors[0]) },
          baseColor2: { value: hexToVec3(colors[1]) },
          baseColor3: { value: hexToVec3(colors[2]) },
          hover: { value: 0 },
          rot: { value: 0 },
          hoverIntensity: { value: 0 },
        },
      });

      const mesh = new Mesh(glContext, { geometry, program });

      const resize = () => {
        if (!container || !rendererInstance || !glContext) return;
        const dpr = window.devicePixelRatio || 1;
        const width = container.clientWidth;
        const height = container.clientHeight;

        if (width === 0 || height === 0) return;

        rendererInstance.setSize(width * dpr, height * dpr);
        glContext.canvas.style.width = width + "px";
        glContext.canvas.style.height = height + "px";

        if (program) {
          program.uniforms.iResolution.value.set(
            glContext.canvas.width,
            glContext.canvas.height,
            glContext.canvas.width / glContext.canvas.height
          );
        }
      };
      window.addEventListener("resize", resize);
      // Kawase: the container is sized by its parent (a dock slot, a story disc), which can settle after mount; follow
      // it, not only the window, so the canvas never keeps the browser's default 300×150.
      const observer = typeof ResizeObserver === "undefined" ? undefined : new ResizeObserver(resize);
      observer?.observe(container);
      resize();

      let lastTime = 0;
      let currentRot = 0;
      let voiceLevel = 0;
      const baseRotationSpeed = 0.3;
      let isMicrophoneInitialized = false;

      const reducedMotion = window.matchMedia("(prefers-reduced-motion: reduce)").matches;

      // Initialize or stop microphone based on voice control setting
      if (ownsMicrophone) {
        initMicrophone().then((success) => {
          isMicrophoneInitialized = success;
        });
      } else {
        // Stop microphone when voice control is disabled
        stopMicrophone();
        isMicrophoneInitialized = false;
      }

      const update = (t: number) => {
        rafId = requestAnimationFrame(update);
        if (!program) return;

        const dt = (t - lastTime) * 0.001;
        lastTime = t;
        program.uniforms.iTime.value = reducedMotion ? 2.4 : t * 0.001;
        program.uniforms.hue.value = hue;
        const [c1, c2, c3] = colorsRef.current;
        program.uniforms.baseColor1.value = hexToVec3(c1);
        program.uniforms.baseColor2.value = hexToVec3(c2);
        program.uniforms.baseColor3.value = hexToVec3(c3);

        // Handle voice input: the app's level when given, otherwise the orb's own microphone.
        const external = levelRef.current;
        const hasLevel = !reducedMotion && (external !== undefined || (ownsMicrophone && isMicrophoneInitialized));
        if (hasLevel) {
          voiceLevel =
            external !== undefined
              ? voiceLevel + (Math.min(Math.max(external, 0), 1) - voiceLevel) * Math.min(1, dt * 8)
              : analyzeAudio();

          // Notify parent component about voice detection
          if (onVoiceDetected) {
            onVoiceDetected(voiceLevel > 0.1);
          }

          // Map voice level to rotation speed with more visible effect
          const voiceRotationSpeed = baseRotationSpeed + (voiceLevel * maxRotationSpeed * 2.0);

          // Always rotate when there's voice input, even at low levels
          if (voiceLevel > 0.05) {
            currentRot += dt * voiceRotationSpeed;
          }

          // Use voice level to drive hover effects for visual feedback
          program.uniforms.hover.value = Math.min(voiceLevel * 2.0, 1.0);
          program.uniforms.hoverIntensity.value = Math.min(voiceLevel * maxHoverIntensity * 0.8, maxHoverIntensity);
        } else {
          // Keep effects at 0 when not using voice control
          program.uniforms.hover.value = 0;
          program.uniforms.hoverIntensity.value = 0;
          if (onVoiceDetected) {
            onVoiceDetected(false);
          }
        }

        program.uniforms.rot.value = currentRot;

        if (rendererInstance && glContext) {
          // Clear the canvas with transparent background before rendering
          glContext.clear(glContext.COLOR_BUFFER_BIT | glContext.DEPTH_BUFFER_BIT);
          rendererInstance.render({ scene: mesh });
        }
      };

      rafId = requestAnimationFrame(update);

      return () => {
        cancelAnimationFrame(rafId);
        window.removeEventListener("resize", resize);
        observer?.disconnect();

        // Clean up canvas safely
        if (container && glContext && glContext.canvas) {
          try {
            if (container.contains(glContext.canvas)) {
              container.removeChild(glContext.canvas);
            }
          } catch (error) {
            console.warn("Canvas cleanup error:", error);
          }
        }

        // Stop microphone and clean up audio resources
        stopMicrophone();

        if (glContext) {
          glContext.getExtension("WEBGL_lose_context")?.loseContext();
        }
      };

    } catch (error) {
      console.error("Error initializing Voice Powered Orb:", error);
      if (container && container.firstChild) {
        container.removeChild(container.firstChild);
      }
      return () => {
        window.removeEventListener("resize", () => {});
      };
    }
  }, [
    hue,
    ownsMicrophone,
    voiceSensitivity,
    maxRotationSpeed,
    maxHoverIntensity,
    vert,
    frag
  ]);

  // Handle microphone state changes separately
  useEffect(() => {
    let isMounted = true;

    const handleMicrophoneState = async () => {
      if (ownsMicrophone) {
        const success = await initMicrophone();
        if (!isMounted) return;
        // Update the microphone state in the WebGL context if needed
      } else {
        stopMicrophone();
      }
    };

    handleMicrophoneState();

    return () => {
      isMounted = false;
      // Don't stop microphone here as it will be handled by the main cleanup
    };
  }, [ownsMicrophone]);

  return (
    <div
      ref={ctnDom}
      className={cn(
        "w-full h-full relative",
        className
      )}
    >
     
    </div>
  );
};