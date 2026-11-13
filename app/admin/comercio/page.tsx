import { redirect } from "next/navigation";

/** La antigua página única de comercio se repartió en secciones propias. */
export default function CommerceRedirect() {
  redirect("/admin/facturas");
}
