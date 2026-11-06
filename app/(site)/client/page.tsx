import type { Metadata } from "next";
import Comp from "@/components/site/ClientPage";

export const metadata: Metadata = { title: "Área de cliente" };

export default function Page() {
  return <Comp />;
}
