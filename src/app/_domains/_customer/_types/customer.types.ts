export type GenderType = "male" | "female";

export type CustomerType = {
  id: string;
  name: string;
  phone: string;
  gender: GenderType;
  is_stamp_eligible?: boolean;
  address?: string | null;
  note?: string | null;
  adult_verified?: boolean;
  adult_verified_at?: string | null;
  adult_verification_method?: "bbaton" | "physical_id" | "manual" | null;
  adult_verified_by?: string | null;
  created_at: string;
  updated_at: string;
  stamps: { count: number }[];
};
