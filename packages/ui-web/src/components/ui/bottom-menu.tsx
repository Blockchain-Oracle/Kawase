"use client";

// Source: 21st.dev 0xUrvish/bottom-menu. Reskinned for Kawase: the toolbar items and their pop-up lists
// come from props (the original hard-coded a note/search/theme menu). Motion and layout are unchanged.
import React, { useMemo, useState, useRef, useEffect } from "react";
import { AnimatePresence, motion } from "motion/react";
import useMeasure from "react-use-measure";
import { cn } from "@kawase/ui-web/lib/utils";

export interface BottomMenuItem {
  name: string;
  label: string;
  icon: React.ReactNode;
  /** Optional pop-up list shown above the toolbar when the item is pressed. */
  items?: { id: string; text: string; icon?: React.ReactNode }[];
}

export interface BottomMenuProps {
  nav: BottomMenuItem[];
  active?: string;
  onSelect?: (name: string, itemId?: string) => void;
  className?: string;
}

const BottomMenu = ({ nav, active, onSelect, className }: BottomMenuProps) => {
  const containerRef = useRef<HTMLDivElement>(null);
  const [elementRef] = useMeasure();
  const [hiddenRef, hiddenBounds] = useMeasure();
  const [view, setView] = useState<string>("default");

  useEffect(() => {
    const handleClickOutside = (event: MouseEvent) => {
      if (containerRef.current && !containerRef.current.contains(event.target as Node)) {
        setView("default");
      }
    };
    document.addEventListener("mousedown", handleClickOutside);
    return () => {
      document.removeEventListener("mousedown", handleClickOutside);
    };
  }, []);

  const sharedHover =
    "group flex items-center gap-2 transition-colors duration-75 px-3 py-2 text-[15px] text-muted-foreground w-full text-start rounded-[12px] hover:bg-muted/80 hover:text-foreground";

  const content = useMemo(() => {
    const entry = nav.find((item) => item.name === view);
    if (!entry?.items?.length) return null;
    return (
      <div className="space-y-[2px] min-w-[200px] p-1">
        {entry.items.map((item) => (
          <button key={item.id} type="button" className={sharedHover} onClick={() => { onSelect?.(entry.name, item.id); setView("default"); }}>
            {item.icon}
            <span>{item.text}</span>
          </button>
        ))}
      </div>
    );
  }, [view, nav, onSelect]);

  return (
    <div
      ref={containerRef}
      className={cn("relative flex flex-col items-center", className)}
    >
      {/* Hidden for measurement */}
      <div
        ref={hiddenRef}
        className="absolute left-[-9999px] top-[-9999px] invisible pointer-events-none"
      >
        <div className="rounded-[18px] bg-background/95 border border-border py-1">
          {content}
        </div>
      </div>

      {/* Animated submenu */}
      <AnimatePresence mode="wait">
        {view !== "default" && content && (
          <motion.div
            key="submenu"
            initial={{
              opacity: 0,
              scaleY: 0.9,
              scaleX: 0.95,
              height: 0,
              width: 0,
              originY: 1,
              originX: 0.5,
            }}
            animate={{
              opacity: 1,
              scaleY: 1,
              scaleX: 1,
              height: hiddenBounds.height || "auto",
              width: hiddenBounds.width || "auto",
              originY: 1,
              originX: 0.5,
            }}
            exit={{
              opacity: 0,
              scaleY: 0.9,
              scaleX: 0.95,
              height: 0,
              width: 0,
              originY: 1,
              originX: 0.5,
            }}
            transition={{
              duration: 0.3,
              ease: [0.45, 0, 0.25, 1],
            }}
            style={{
              transformOrigin: "bottom center",
            }}
            className="absolute bottom-[70px] overflow-hidden"
          >
            <div
              ref={elementRef}
              className="rounded-[18px] bg-background/95 backdrop-blur-xl border border-border"
            >
              <AnimatePresence initial={false} mode="popLayout">
                <motion.div
                  key={view}
                  initial={{
                    opacity: 0,
                    scale: 0.96,
                    filter: "blur(10px)",
                  }}
                  animate={{
                    opacity: 1,
                    scale: 1,
                    filter: "blur(0px)",
                  }}
                  exit={{
                    opacity: 0,
                    scale: 0.95,
                    filter: "blur(12px)",
                  }}
                  transition={{
                    duration: 0.25,
                    ease: [0.42, 0, 0.58, 1],
                  }}
                  className="py-1"
                >
                  {content}
                </motion.div>
              </AnimatePresence>
            </div>
          </motion.div>
        )}
      </AnimatePresence>

      {/* Toolbar */}
      <div className="flex items-center gap-1 bg-background/95 backdrop-blur-xl border border-border rounded-[18px] p-1 mt-3 z-10">
        {nav.map((item) => {
          const selected = view === item.name || (view === "default" && active === item.name);
          return (
            <button
              key={item.name}
              type="button"
              aria-label={item.label}
              aria-current={active === item.name ? "page" : undefined}
              className={cn("p-3 rounded-[16px] transition-colors", selected ? "bg-accent text-accent-foreground" : "text-muted-foreground hover:bg-muted")}
              onClick={() => {
                if (item.items?.length) setView(view === item.name ? "default" : item.name);
                else { setView("default"); onSelect?.(item.name); }
              }}
            >
              {item.icon}
            </button>
          );
        })}
      </div>
    </div>
  );
};

export default BottomMenu;
