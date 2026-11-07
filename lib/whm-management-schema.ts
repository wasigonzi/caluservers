import "server-only";
import { WhmError } from "@/lib/whm-security";
export const WHM_MANAGEMENT_ACTIONS = [
  "createacct",
  "suspendacct",
  "unsuspendacct",
  "changepackage",
  "addpkg",
  "editpkg",
] as const;
export type WhmManagementAction = (typeof WHM_MANAGEMENT_ACTIONS)[number];
export type WhmManagementInput = {
  action: WhmManagementAction;
  target: string;
  params: Record<string, string>;
};
export function accountName(value: unknown): string {
  if (
    typeof value !== "string" ||
    !/^[a-z][a-z0-9_]{0,15}$/.test(value) ||
    value.startsWith("test")
  )
    throw new WhmError("invalid");
  return value;
}
export function packageName(value: unknown): string {
  if (
    typeof value !== "string" ||
    !/^[A-Za-z0-9][A-Za-z0-9_.-]{0,63}$/.test(value) ||
    value.includes("..")
  )
    throw new WhmError("invalid");
  return value;
}
function quota(value: unknown, count: boolean): string {
  if (value === "unlimited") return value;
  if (
    typeof value !== "string" ||
    !/^[1-9][0-9]{0,8}$/.test(value) ||
    Number(value) > (count ? 1_000_000 : 999_999_999)
  )
    throw new WhmError("invalid");
  return value;
}
export function parseWhmManagement(input: unknown): WhmManagementInput {
  if (!input || typeof input !== "object" || Array.isArray(input))
    throw new WhmError("invalid");
  const data = input as Record<string, unknown>;
  if (
    typeof data.action !== "string" ||
    !(WHM_MANAGEMENT_ACTIONS as readonly string[]).includes(data.action)
  )
    throw new WhmError("invalid");
  const action = data.action as WhmManagementAction;
  const fields: Record<WhmManagementAction, string[]> = {
    createacct: ["username", "domain", "password", "plan"],
    suspendacct: ["user", "reason"],
    unsuspendacct: ["user"],
    changepackage: ["user", "pkg"],
    addpkg: ["name", "quota", "bwlimit", "maxpop", "maxsql"],
    editpkg: ["name", "quota", "bwlimit", "maxpop", "maxsql"],
  };
  if (
    Object.keys(data).some(
      (key) =>
        ![
          "action",
          "confirmation",
          "notificationsAcknowledged",
          ...fields[action],
        ].includes(key),
    ) ||
    fields[action].some((key) => typeof data[key] !== "string")
  )
    throw new WhmError("invalid");
  const target =
    action === "createacct"
      ? accountName(data.username)
      : action === "addpkg" || action === "editpkg"
        ? packageName(data.name)
        : accountName(data.user);
  if (data.notificationsAcknowledged !== true)
    throw new WhmError("confirmation");
  if (data.confirmation !== target) throw new WhmError("confirmation");
  let params: Record<string, string>;
  if (action === "createacct") {
    const domain = (data.domain as string).toLowerCase(),
      password = data.password as string;
    if (
      domain.length > 253 ||
      !/^(?:[a-z0-9](?:[a-z0-9-]{0,61}[a-z0-9])?\.)+[a-z]{2,63}$/.test(
        domain,
      ) ||
      !/^[\x20-\x7e]{16,128}$/.test(password) ||
      [/[a-z]/, /[A-Z]/, /[0-9]/, /[^A-Za-z0-9]/].filter((pattern) =>
        pattern.test(password),
      ).length < 3 ||
      password.toLowerCase().includes(target)
    )
      throw new WhmError("invalid");
    params = {
      username: target,
      domain,
      password,
      plan: packageName(data.plan),
      showpass: "n",
      forcedns: "0",
      reseller: "0",
      savepkg: "0",
    };
  } else if (action === "suspendacct") {
    const reason = (data.reason as string).trim();
    if (
      reason.length < 3 ||
      reason.length > 160 ||
      /[\u0000-\u001f\u007f]/.test(data.reason as string)
    )
      throw new WhmError("invalid");
    params = { user: target, reason, disallowun: "0" };
  } else if (action === "unsuspendacct") params = { user: target };
  else if (action === "changepackage")
    params = { user: target, pkg: packageName(data.pkg) };
  else
    params = {
      name: target,
      quota: quota(data.quota, false),
      bwlimit: quota(data.bwlimit, false),
      maxpop: quota(data.maxpop, true),
      maxsql: quota(data.maxsql, true),
    };
  if (action === "addpkg") Object.assign(params, { hasshell: "0", ip: "n" });
  return { action, target, params };
}
