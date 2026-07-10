export type AccountIdentityStatus = "guest" | "loading" | "registered" | "error";

export function isAccountIdentityReady(status: AccountIdentityStatus): boolean {
  return status !== "loading";
}
