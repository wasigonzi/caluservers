import type { Metadata } from "next";
import Comp from "@/components/site/AboutPage";

export const metadata: Metadata = { title: "Nosotros" };

export default function Page() {
  return <Comp />;
}
