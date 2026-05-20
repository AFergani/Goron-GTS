import type { LoginPayload } from "../../../types";

export type LoginFormState = LoginPayload;

export type PasswordUpdateFormState = {
  newPassword: string;
  confirmPassword: string;
};
