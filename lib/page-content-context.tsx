"use client";

import { createContext, useContext } from "react";
import { pc } from "@/lib/page-content";

const Ctx = createContext<Record<string, string>>({});

export function PageContentProvider({
  payload,
  children,
}: {
  payload: Record<string, string>;
  children: React.ReactNode;
}) {
  return <Ctx.Provider value={payload}>{children}</Ctx.Provider>;
}

export function usePageCopy() {
  return useContext(Ctx);
}

export function useCopy(id: string, fallback = "") {
  const payload = useContext(Ctx);
  return pc(payload, id, fallback);
}
