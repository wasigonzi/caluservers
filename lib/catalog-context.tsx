"use client";

import { createContext, useContext, type ReactNode } from "react";
import { SEED_CATALOG, type Catalog } from "@/lib/catalog";

type Ctx = { catalog: Catalog };
const CatalogContext = createContext<Ctx>({ catalog: SEED_CATALOG });

export function CatalogProvider({
  catalog,
  children,
}: {
  catalog: Catalog;
  children: ReactNode;
}) {
  return (
    <CatalogContext.Provider value={{ catalog }}>
      {children}
    </CatalogContext.Provider>
  );
}

export function useCatalog() {
  return useContext(CatalogContext);
}
