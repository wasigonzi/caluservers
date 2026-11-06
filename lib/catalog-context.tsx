"use client";
import { createContext, useContext, type ReactNode } from "react";
import { SEED_CATALOG, type Catalog } from "@/lib/catalog";
import type { SiteSettings } from "@/lib/site-settings";

type Ctx = { catalog: Catalog };
const CatalogContext = createContext<Ctx>({ catalog: SEED_CATALOG });

export function CatalogProvider({
  settings,
  children,
}: {
  settings: SiteSettings;
  children: ReactNode;
}) {
  const catalog: Catalog = { ...SEED_CATALOG, settings };
  return (
    <CatalogContext.Provider value={{ catalog }}>
      {children}
    </CatalogContext.Provider>
  );
}

export function useCatalog() {
  return useContext(CatalogContext);
}
