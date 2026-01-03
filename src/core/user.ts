type DEFAULT_USER_ROLE_LIST = "none" | "user" | "admin" | "service";

/** Common identity fields shared by all callers */
type CtxUserBase = {
  /** Stable unique identifier of the caller */
  id: string;
  /** Fine-grained permission scopes granted to the caller */
  scope: string[];
  /** Human-readable identifier (username or service name) */
  handle: string | null;
};

/** Identity of the caller executing the current context */
export type CtxUser = CtxUserBase &
  (
    | {
        /** Human user */
        kind: "user";
        /** User roles (service role excluded) */
        role: Exclude<DEFAULT_USER_ROLE_LIST, "service">[];
      }
    | {
        /** Calling service */
        kind: "service";
        /** Services are restricted to the service role */
        role: ["service"];
      }
  );
