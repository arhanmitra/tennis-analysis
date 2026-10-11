import { useLayoutEffect, useRef, useState } from "react";

// Measures an element's content width so hand-drawn SVG charts render at real
// pixel size (text never stretches the way a scaled viewBox would).
export function useWidth(initial = 600) {
  const ref = useRef(null);
  const [width, setWidth] = useState(initial);
  useLayoutEffect(() => {
    const el = ref.current;
    if (!el) return;
    setWidth(el.clientWidth);
    const ro = new ResizeObserver(([entry]) => setWidth(Math.round(entry.contentRect.width)));
    ro.observe(el);
    return () => ro.disconnect();
  }, []);
  return [ref, width];
}
