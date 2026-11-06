import type { Metadata } from "next";
import Comp from "@/components/site/DedicatedPage";

export const metadata: Metadata = { title: "Servidores dedicados" };

export default function Page() {
  return <Comp />;
}
