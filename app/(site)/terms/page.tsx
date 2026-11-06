import type { Metadata } from "next";
import { Terms } from "@/components/site/LegalPages";

export const metadata: Metadata = { title: "Términos y condiciones" };

export default function Page() {
  return <Terms />;
}
