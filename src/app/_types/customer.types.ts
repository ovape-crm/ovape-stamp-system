export type GenderType = 'male' | 'female';

export type CustomerType = {
  id: string;
  name: string;
  phone: string;
  gender: GenderType;
  note?: string | null;
  created_at: string;
  updated_at: string;
  stamps: { count: number }[];
};
