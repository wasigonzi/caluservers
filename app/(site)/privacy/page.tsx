import type { Metadata } from "next";
import { Privacy } from "@/components/site/LegalPages";

export const metadata: Metadata = { title: "Política de privacidad" };

export default function Page() {
  return <Privacy />;
}
