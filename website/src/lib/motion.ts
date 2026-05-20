import type { Variants } from "framer-motion";

export const pageTransition: Variants = {
  initial: { opacity: 0, y: 8 },
  animate: { opacity: 1, y: 0 },
  exit: { opacity: 0, y: -8 },
};

export const panelTransition = {
  duration: 0.18,
  ease: "easeOut",
};
