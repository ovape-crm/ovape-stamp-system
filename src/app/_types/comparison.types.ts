export type ComparisonColumnType = {
  id: string;
  name: string;
  key: string;
  sort_order: number;
  is_active: boolean;
  created_at: string;
  updated_at: string;
};

export type ComparisonDeviceType = {
  id: string;
  created_at: string;
  updated_at: string;
};

export type ComparisonDeviceValueType = {
  id: string;
  device_id: string;
  column_id: string;
  value: string;
  created_at: string;
  updated_at: string;
};
