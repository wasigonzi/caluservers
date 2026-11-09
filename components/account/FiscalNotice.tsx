import { billingPolicy } from "@/lib/commerce";
import { EXPLICIT_TAX_ENVIRONMENT_NOTE, ISSUER_CONTEXT, MISSING_TAX_POLICY_ERROR } from "@/lib/money";

export function FiscalNotice() {
  const policy = billingPolicy();
  return (
    <div className="fiscal-callout">
      <p>{ISSUER_CONTEXT}</p>
      <p>{policy.ok ? EXPLICIT_TAX_ENVIRONMENT_NOTE : MISSING_TAX_POLICY_ERROR}</p>
    </div>
  );
}
