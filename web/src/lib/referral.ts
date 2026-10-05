/** Set by /invite/<user id> for 30 days; read once at sign-up. */
export const REF_COOKIE = "remixt_ref";

/** A person's own invite link (path only; make it absolute with absoluteUrl). */
export const invitePath = (userId: string) => `/invite/${userId}`;
