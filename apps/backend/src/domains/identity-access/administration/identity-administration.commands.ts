export const IDENTITY_ADMINISTRATION_COMMANDS = Symbol("IDENTITY_ADMINISTRATION_COMMANDS");

export interface IdentityAdministrationUserRemark {
  id: string;
  remark: string | null;
  updatedAt: string;
}

export interface IdentityAdministrationError {
  code: "USER_NOT_FOUND";
  userId: string;
}

export type IdentityAdministrationResult<Value> =
  | { ok: true; value: Value }
  | { error: IdentityAdministrationError; ok: false };

export interface IdentityAdministrationCommands {
  updateUserRemark(
    userId: string,
    remark: string | null | undefined,
  ): Promise<IdentityAdministrationResult<IdentityAdministrationUserRemark>>;
}
