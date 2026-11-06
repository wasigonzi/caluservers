import type { Metadata } from "next";
import { Aup } from "@/components/site/LegalPages";

export const metadata: Metadata = { title: "Política de uso aceptable" };

export default function Page() {
  return <Aup />;
}
