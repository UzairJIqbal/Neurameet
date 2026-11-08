"use client";

import React from "react";
import { motion, useReducedMotion } from "motion/react";

type RevealProps = {
  children: React.ReactNode;
  delay?: number;
  className?: string;
};

// Fade up once when scrolled into view. Transform and opacity only, off under reduced motion.
const Reveal = ({ children, delay = 0, className }: RevealProps) => {
  const reduce = useReducedMotion();
  if (reduce) return <div className={className}>{children}</div>;
  return (
    <motion.div
      className={className}
      initial={{ opacity: 0, y: 24 }}
      whileInView={{ opacity: 1, y: 0 }}
      viewport={{ once: true, margin: "-60px" }}
      transition={{ duration: 0.6, delay, ease: [0.22, 1, 0.36, 1] }}
    >
      {children}
    </motion.div>
  );
};

export default Reveal;
