import type { Metadata } from "next";
import Comp from "@/components/site/ContactPage";

export const metadata: Metadata = { title: "Contacto" };

export default function Page() {
  return <Comp />;
}
