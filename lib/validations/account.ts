import { z } from "zod";

export const distributorChangePasswordSchema = z
  .object({
    newPassword: z
      .string()
      .min(8, "Password must be at least 8 characters")
      .max(256, "Password must be 256 characters or fewer"),
    confirmPassword: z.string().min(1, "Confirm your new password"),
  })
  .refine((data) => data.newPassword === data.confirmPassword, {
    message: "Passwords do not match",
    path: ["confirmPassword"],
  });

export type DistributorChangePasswordInput = z.infer<
  typeof distributorChangePasswordSchema
>;
