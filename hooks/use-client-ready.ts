"use client";

import { useEffect, useState } from "react";

/** True after mount — use to gate DOM attrs that depend on client-only query state (avoids hydration mismatch). */
export function useClientReady() {
  const [ready, setReady] = useState(false);

  useEffect(() => {
    setReady(true);
  }, []);

  return ready;
}
