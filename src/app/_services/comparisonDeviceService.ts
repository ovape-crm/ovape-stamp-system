import supabase from '@/libs/supabaseClient';
import {
  ComparisonColumnType,
  ComparisonDeviceType,
  ComparisonDeviceValueType,
} from '@/app/_types/comparison.types';

/**
 * 기기 생성 (기기 row + 컬럼 값 일괄 삽입)
 */
export const createComparisonDevice = async (
  values: { column_id: string; value: string }[],
): Promise<ComparisonDeviceType> => {
  const { data: device, error: deviceError } = await supabase
    .from('comparison_devices')
    .insert({})
    .select()
    .single();

  if (deviceError) throw deviceError;

  const deviceValues = values.map((v) => ({
    device_id: device.id,
    column_id: v.column_id,
    value: v.value,
  }));

  const { error: valuesError } = await supabase
    .from('comparison_device_values')
    .insert(deviceValues);

  if (valuesError) throw valuesError;

  return device;
};

/**
 * 기기 목록 + 컬럼 + 값 일괄 조회
 */
export const getComparisonDevicesWithValues = async (): Promise<{
  devices: ComparisonDeviceType[];
  columns: ComparisonColumnType[];
  values: ComparisonDeviceValueType[];
}> => {
  const [devicesResult, columnsResult, valuesResult] = await Promise.all([
    supabase
      .from('comparison_devices')
      .select('*')
      .order('created_at', { ascending: false }),
    supabase
      .from('comparison_columns')
      .select('*')
      .eq('is_active', true)
      .order('sort_order', { ascending: true }),
    supabase.from('comparison_device_values').select('*'),
  ]);

  if (devicesResult.error) throw devicesResult.error;
  if (columnsResult.error) throw columnsResult.error;
  if (valuesResult.error) throw valuesResult.error;

  return {
    devices: devicesResult.data,
    columns: columnsResult.data,
    values: valuesResult.data,
  };
};

/**
 * 기기 값 수정 (기존 값 전체 삭제 후 재삽입)
 */
export const updateComparisonDevice = async (
  deviceId: string,
  values: { column_id: string; value: string }[],
): Promise<void> => {
  const { error: deleteError } = await supabase
    .from('comparison_device_values')
    .delete()
    .eq('device_id', deviceId);

  if (deleteError) throw deleteError;

  const { error: insertError } = await supabase
    .from('comparison_device_values')
    .insert(values.map((v) => ({ device_id: deviceId, ...v })));

  if (insertError) throw insertError;
};

/**
 * 기기 삭제
 */
export const deleteComparisonDevice = async (deviceId: string): Promise<void> => {
  const { error } = await supabase
    .from('comparison_devices')
    .delete()
    .eq('id', deviceId);

  if (error) throw error;
};
