import type { Metadata } from "next";
import Comp from "@/components/site/DomainsPage";

export const metadata: Metadata = { title: "Dominios" };

export default function Page() {
  return <Comp />;
}
