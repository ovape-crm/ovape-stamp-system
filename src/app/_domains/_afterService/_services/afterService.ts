import {
  AfterServiceStatusEnum,
  AfterServiceStatusEnumType,
  AfterServiceStatusGroupEnumType,
} from '@/app/_enums/enums';
import supabase from '@/libs/supabaseClient';
import { createAfterServiceLog } from '@/app/_domains/_log/_services/logService';
import { getAfterServiceStatusGroups } from '@/app/_utils/utils';

export const createAfterService = async ({
  customerId,
  itemType,
  itemName,
  quantity,
  symptom,
  shopNote = '',
  customerNote = '',
  isLoanerDeviceIssued = false,
  receivedNote = '',
  statusNote = '',
  status = AfterServiceStatusEnum.RECEIVED.value,
  caseType = 'customer_as',
  supplierId,
  intake,
}: {
  customerId: string | null;
  itemType: string;
  itemName: string;
  quantity: number;
  symptom: string;
  shopNote?: string;
  customerNote?: string;
  isLoanerDeviceIssued?: boolean;
  receivedNote?: string;
  statusNote?: string;
  status?: AfterServiceStatusEnumType['value'];
  caseType?: 'customer_as' | 'vendor_exchange' | 'store_product_as';
  supplierId?: string;
  intake?: {
    customerPurchaseDate?: string;
    customerReceivedDate?: string;
    supplierName?: string;
    hasAfterServiceCost: boolean;
    afterServicePaymentMethod?: 'card' | 'transfer' | 'cash';
    afterServiceCostAmount: number;
    afterServiceCostMemo?: string;
    isRentalIssued: boolean;
    rentalDate?: string;
    rentalNote?: string;
    isExchangeIssued: boolean;
    exchangeDate?: string;
    exchangeItemId?: string;
    exchangeItemName?: string;
    exchangeItemCategoryName?: string;
    exchangeQuantity: number;
    exchangeNote?: string;
  };
}) => {
  const {
    data: { session },
    error: sessionError,
  } = await supabase.auth.getSession();

  if (sessionError || !session) {
    throw new Error('세션을 찾을 수 없습니다');
  }

  const adminId = session.user.id;

  const { data, error } = await supabase
    .from('after_services')
    .insert({
      admin_id: adminId,
      customer_id: customerId ? String(customerId) : null,
      item_type: itemType,
      item_name: itemName,
      quantity: quantity,
      symptom: symptom,
      shop_note: shopNote,
      customer_note: customerNote,
      is_loaner_device_issued: isLoanerDeviceIssued,
      status,
      service_case_type: caseType,
      outbound_supplier_id: supplierId || null,
      customer_purchase_date: intake?.customerPurchaseDate || null,
      customer_received_date: intake?.customerReceivedDate || null,
      supplier_name: intake?.supplierName || null,
      has_after_service_cost: intake?.hasAfterServiceCost ?? false,
      after_service_payment_method: intake?.afterServicePaymentMethod ?? null,
      after_service_cost_amount: intake?.hasAfterServiceCost
        ? intake.afterServiceCostAmount
        : null,
      after_service_cost_memo: intake?.afterServiceCostMemo || null,
      is_rental_issued: intake?.isRentalIssued ?? false,
      rental_date: intake?.rentalDate || null,
      rental_note: intake?.rentalNote || null,
      is_exchange_issued: intake?.isExchangeIssued ?? false,
      exchange_date: intake?.exchangeDate || null,
      exchange_item_id: intake?.exchangeItemId || null,
      exchange_item_name: intake?.exchangeItemName || null,
      exchange_item_category_name: intake?.exchangeItemCategoryName || null,
      exchange_quantity: intake?.isExchangeIssued
        ? intake.exchangeQuantity
        : null,
      exchange_note: intake?.exchangeNote || null,
    })
    .select()
    .single();

  if (error) throw error;

  await createAfterServiceLog(
    customerId ? String(customerId) : null,
    data.id,
    'after-service-received',
    receivedNote
  );

  if (status !== AfterServiceStatusEnum.RECEIVED.value) {
    await createAfterServiceLog(
      customerId ? String(customerId) : null,
      data.id,
      `after-service-${status}`,
      statusNote
    );
  }

  return data;
};

/**
 * 전체 AS 수 조회
 */
export const getAfterServicesCount = async (filters?: {
  status?: AfterServiceStatusEnumType['value'];
  groupStatus?: AfterServiceStatusGroupEnumType['value'];
  searchTarget?: 'name' | 'phone' | 'item_name';
  searchKeyword?: string;
  customerId?: string;
}): Promise<number> => {
  // customers 테이블로 필터링할 경우 inner join 사용
  const needsInnerJoin =
    filters?.searchKeyword &&
    filters.searchKeyword.trim() &&
    filters.searchTarget &&
    (filters.searchTarget === 'name' || filters.searchTarget === 'phone');

  // select 쿼리 조건부 설정
  const selectQuery = needsInnerJoin
    ? '*, customers!inner(name, phone)'
    : '*';

  let query = supabase
    .from('after_services')
    .select(selectQuery, {
      count: 'exact',
      head: true,
    });

  // customerId 필터링 (선택사항)
  if (filters?.customerId) {
    query = query.eq('customer_id', filters.customerId);
  }

  // status 필터링 (선택사항)
  // groupStatus가 우선 (그룹 필터링이 있으면 그룹의 모든 status로 필터링)
  if (filters?.groupStatus) {
    const statusGroups = getAfterServiceStatusGroups();
    let statusArray: string[] = [];
    if (filters.groupStatus === 'received') {
      statusArray = statusGroups.received;
    } else if (filters.groupStatus === 'inProgress') {
      statusArray = statusGroups.inProgress;
    } else if (filters.groupStatus === 'completed') {
      statusArray = statusGroups.completed;
    }
    if (statusArray.length > 0) {
      query = query.in('status', statusArray);
    }
  } else if (filters?.status) {
    query = query.eq('status', filters.status);
  }

  // 검색 필터링
  if (
    filters?.searchKeyword &&
    filters.searchKeyword.trim() &&
    filters.searchTarget
  ) {
    const keyword = filters.searchKeyword.trim();
    if (filters.searchTarget === 'name') {
      query = query.ilike('customers.name', `%${keyword}%`);
    } else if (filters.searchTarget === 'phone') {
      query = query.ilike('customers.phone', `%${keyword}%`);
    } else if (filters.searchTarget === 'item_name') {
      query = query.ilike('item_name', `%${keyword}%`);
    }
  }

  const { count, error } = await query;

  if (error) throw error;

  return count || 0;
};

/**
 * 전체 AS 조회 (페이지네이션)
 */
export const getAfterServices = async (
  limit = 10,
  offset = 0,
  filters?: {
    status?: AfterServiceStatusEnumType['value'];
    groupStatus?: AfterServiceStatusGroupEnumType['value'];
    searchTarget?: 'name' | 'phone' | 'item_name';
    searchKeyword?: string;
    customerId?: string;
  }
) => {
  const from = offset;
  const to = offset + limit - 1;

  // customers 테이블로 필터링할 경우 inner join 사용
  const needsInnerJoin =
    filters?.searchKeyword &&
    filters.searchKeyword.trim() &&
    filters.searchTarget &&
    (filters.searchTarget === 'name' || filters.searchTarget === 'phone');

  const selectQuery = needsInnerJoin
    ? `
      *,
      users!admin_id(name, email),
      customers!inner(name, phone)
    `
    : `
      *,
      users!admin_id(name, email),
      customers(name, phone)
    `;

  let query = supabase
    .from('after_services')
    .select(selectQuery)
    .order('created_at', { ascending: false })
    .range(from, to);

  // customerId 필터링 (선택사항)
  if (filters?.customerId) {
    query = query.eq('customer_id', filters.customerId);
  }

  // status 필터링 (선택사항)
  // groupStatus가 우선 (그룹 필터링이 있으면 그룹의 모든 status로 필터링)
  if (filters?.groupStatus) {
    const statusGroups = getAfterServiceStatusGroups();
    let statusArray: string[] = [];
    if (filters.groupStatus === 'received') {
      statusArray = statusGroups.received;
    } else if (filters.groupStatus === 'inProgress') {
      statusArray = statusGroups.inProgress;
    } else if (filters.groupStatus === 'completed') {
      statusArray = statusGroups.completed;
    }
    if (statusArray.length > 0) {
      query = query.in('status', statusArray);
    }
  } else if (filters?.status) {
    query = query.eq('status', filters.status);
  }

  // 검색 필터링
  if (
    filters?.searchKeyword &&
    filters.searchKeyword.trim() &&
    filters.searchTarget
  ) {
    const keyword = filters.searchKeyword.trim();
    if (filters.searchTarget === 'name') {
      query = query.ilike('customers.name', `%${keyword}%`);
    } else if (filters.searchTarget === 'phone') {
      query = query.ilike('customers.phone', `%${keyword}%`);
    } else if (filters.searchTarget === 'item_name') {
      query = query.ilike('item_name', `%${keyword}%`);
    }
  }

  const { data, error } = await query;

  if (error) throw error;
  return data;
};

/**
 * AS 상세 조회
 */
export const getAfterServiceDetail = async (id: string) => {
  const { data, error } = await supabase
    .from('after_services')
    .select(
      `
      *,
      users!admin_id(name, email),
      customers(name, phone)
    `
    )
    .eq('id', id)
    .single();

  if (error) throw error;
  return data;
};

/**
 * AS 상태 업데이트
 */
export const updateAfterServiceStatus = async (
  id: string,
  status: AfterServiceStatusEnumType['value'],
  note: string = ''
) => {
  const {
    data: { session },
    error: sessionError,
  } = await supabase.auth.getSession();

  if (sessionError || !session) {
    throw new Error('세션을 찾을 수 없습니다');
  }

  // 동일 상태의 재요청은 이력까지 중복 생성하지 않습니다.
  const { data: afterService, error: updateError } = await supabase
    .from('after_services')
    .update({ status })
    .eq('id', id)
    .neq('status', status)
    .select()
    .maybeSingle();

  if (updateError) throw updateError;
  if (!afterService) return getAfterServiceDetail(id);

  // 로그 생성
  const action = `after-service-${status}`;
  await createAfterServiceLog(
    afterService.customer_id,
    afterService.id,
    action,
    note
  );

  return afterService;
};

export const processAfterServiceRepairReceipt = async (values: {
  afterServiceId: string;
  arrivedOn: string;
  itemName: string;
  quantity: number;
  matchType: 'match' | 'mismatch';
  memo: string;
}) => {
  const { data, error } = await supabase.rpc(
    'process_after_service_repair_receipt_with_cost',
    {
      p_after_service_id: Number(values.afterServiceId),
      p_arrived_on: values.arrivedOn,
      p_item_name: values.itemName,
      p_quantity: values.quantity,
      p_match_type: values.matchType,
      p_memo: values.memo || null,
    },
  );
  if (error) throw error;
  return data as string;
};

export const processAfterServiceRepairIntake = async (values: {
  afterServiceId: string;
  receivedOn: string;
  memo: string;
  hasStoreCost: boolean;
  storeCostAmount: number | null;
}) => {
  const { error } = await supabase.rpc('process_after_service_repair_intake', {
    p_after_service_id: Number(values.afterServiceId),
    p_received_on: values.receivedOn,
    p_memo: values.memo || null,
    p_has_store_cost: values.hasStoreCost,
    p_store_cost_amount: values.storeCostAmount,
  });
  if (error) throw error;
};

export type AfterServiceIntakeExpense = {
  expense_date: string;
  has_store_cost: boolean;
  store_cost_amount: number;
};

export const getAfterServiceIntakeExpense = async (afterServiceId: string) => {
  const { data, error } = await supabase.rpc(
    'get_after_service_intake_expense',
    { p_after_service_id: Number(afterServiceId) },
  );
  if (error) throw error;
  return ((data ?? [])[0] ?? null) as AfterServiceIntakeExpense | null;
};

export const editAfterServiceStatusProcessing = async (values: {
  afterServiceId: string;
  logId?: string;
  status: AfterServiceStatusEnumType['value'];
  statusDate: string;
  memo: string;
  hasStoreCost: boolean;
  storeCostAmount: number | null;
}) => {
  const { error } = await supabase.rpc(
    'edit_after_service_status_processing_log',
    {
      p_after_service_id: Number(values.afterServiceId),
      p_log_id: values.logId == null ? null : Number(values.logId),
      p_status: values.status,
      p_status_date: values.statusDate,
      p_memo: values.memo || null,
      p_has_store_cost: values.hasStoreCost,
      p_store_cost_amount: values.storeCostAmount,
    },
  );
  if (error) throw error;
};

export type ItemPurchaseCostOption = {
  source_receipt_line_id: string;
  arrived_on: string;
  supplier_name: string;
  unit_price: number;
  received_quantity: number;
};

export const getItemPurchaseCostOptions = async (itemName: string) => {
  const { data, error } = await supabase.rpc('get_item_purchase_cost_options', {
    p_item_name: itemName,
  });
  if (error) throw error;
  return (data ?? []) as ItemPurchaseCostOption[];
};

export const processInventoryServiceOutbound = async (values: {
  afterServiceId: number;
  caseType: 'vendor_exchange' | 'store_product_as';
  supplierId: string;
  allocations: Array<{
    sourceReceiptLineId: string | null;
    unitPrice: number;
    quantity: number;
  }>;
}) => {
  const { error } = await supabase.rpc('process_inventory_service_outbound', {
    p_after_service_id: values.afterServiceId,
    p_case_type: values.caseType,
    p_supplier_id: values.supplierId,
    p_allocations: values.allocations,
  });
  if (error) throw error;
};

export const confirmInventoryServiceOutbound = async (afterServiceId: number) => {
  const { error } = await supabase.rpc(
    'confirm_inventory_service_outbound',
    { p_after_service_id: afterServiceId },
  );
  if (error) throw error;
};

export type InventoryServiceProgress = {
  outbound_quantity: number;
  received_quantity: number;
  remaining_quantity: number;
};

export const getInventoryServiceProgress = async (afterServiceId: number) => {
  const { data, error } = await supabase.rpc(
    'get_inventory_service_progress',
    { p_after_service_id: afterServiceId },
  );
  if (error) throw error;
  return ((data ?? [])[0] ?? {
    outbound_quantity: 0,
    received_quantity: 0,
    remaining_quantity: 0,
  }) as InventoryServiceProgress;
};

export type AfterServiceOutboundCostAllocation = {
  id: string;
  unit_price: number;
  outbound_quantity: number;
  received_quantity: number;
};

export const getAfterServiceOutboundCostAllocations = async (
  afterServiceId: number,
) => {
  const { data, error } = await supabase
    .from('after_service_outbound_cost_allocations')
    .select('id, unit_price, outbound_quantity, received_quantity')
    .eq('after_service_id', afterServiceId)
    .order('created_at', { ascending: true })
    .order('id', { ascending: true });
  if (error) throw error;
  return (data ?? []) as AfterServiceOutboundCostAllocation[];
};

/** 기존 재고처리 A/S 건의 실제 수리 원가를 마스터가 직접 등록합니다. */
export const setAfterServiceManualCost = async (values: {
  afterServiceId: number;
  unitPrice: number;
}) => {
  const { error } = await supabase.rpc('set_after_service_manual_cost', {
    p_after_service_id: values.afterServiceId,
    p_unit_price: values.unitPrice,
  });
  if (error) throw error;
};

export const processInventoryServiceInbound = async (values: {
  afterServiceId: string;
  arrivedOn: string;
  itemName: string;
  quantity: number;
  memo: string;
}) => {
  const { data, error } = await supabase.rpc(
    'process_inventory_service_inbound_with_change',
    {
      p_after_service_id: Number(values.afterServiceId),
      p_arrived_on: values.arrivedOn,
      p_item_name: values.itemName,
      p_quantity: values.quantity,
      p_memo: values.memo || null,
    },
  );
  if (error) throw error;
  return data as string;
};

/**
 * AS 정보 업데이트
 */
export const updateAfterService = async (
  id: string,
  {
    customerId,
    itemType,
    itemName,
    quantity,
    symptom,
    shopNote,
    customerNote,
    isLoanerDeviceIssued,
    intake,
  }: {
    customerId: string | null;
    itemType: string;
    itemName: string;
    quantity: number;
    symptom: string;
    shopNote?: string;
    customerNote?: string;
    isLoanerDeviceIssued?: boolean;
    intake?: {
      customerPurchaseDate?: string;
      customerReceivedDate?: string;
      supplierName?: string;
      hasAfterServiceCost: boolean;
      afterServicePaymentMethod?: 'card' | 'transfer' | 'cash';
      afterServiceCostAmount: number;
      afterServiceCostMemo?: string;
      isRentalIssued: boolean;
      rentalDate?: string;
      rentalNote?: string;
      isExchangeIssued: boolean;
      exchangeDate?: string;
      exchangeItemId?: string;
      exchangeItemName?: string;
      exchangeItemCategoryName?: string;
      exchangeQuantity: number;
      exchangeNote?: string;
    };
  }
) => {
  const {
    data: { session },
    error: sessionError,
  } = await supabase.auth.getSession();

  if (sessionError || !session) {
    throw new Error('세션을 찾을 수 없습니다');
  }

  // 기존 AS 정보 가져오기
  const prevAfterService = await getAfterServiceDetail(id);

  // AS 업데이트
  const { data, error } = await supabase
    .from('after_services')
    .update({
      customer_id: customerId ? String(customerId) : null,
      item_type: itemType,
      item_name: itemName,
      quantity: quantity,
      symptom: symptom,
      shop_note: shopNote || null,
      customer_note: customerNote || null,
      is_loaner_device_issued: isLoanerDeviceIssued ?? false,
      customer_purchase_date: intake?.customerPurchaseDate || null,
      customer_received_date: intake?.customerReceivedDate || null,
      supplier_name: intake?.supplierName || null,
      has_after_service_cost: intake?.hasAfterServiceCost ?? false,
      after_service_payment_method: intake?.afterServicePaymentMethod ?? null,
      after_service_cost_amount: intake?.hasAfterServiceCost
        ? intake.afterServiceCostAmount
        : null,
      after_service_cost_memo: intake?.afterServiceCostMemo || null,
      is_rental_issued: intake?.isRentalIssued ?? false,
      rental_date: intake?.rentalDate || null,
      rental_note: intake?.rentalNote || null,
      is_exchange_issued: intake?.isExchangeIssued ?? false,
      exchange_date: intake?.exchangeDate || null,
      exchange_item_id: intake?.exchangeItemId || null,
      exchange_item_name: intake?.exchangeItemName || null,
      exchange_item_category_name: intake?.exchangeItemCategoryName || null,
      exchange_quantity: intake?.isExchangeIssued
        ? intake.exchangeQuantity
        : null,
      exchange_note: intake?.exchangeNote || null,
    })
    .eq('id', id)
    .select()
    .single();

  if (error) throw error;

  // 변경사항 추적
  const changeObj: Record<
    string,
    { old: string | number | null; new: string | number | null }
  > = {};

  const prevCustomerId = prevAfterService.customer_id
    ? String(prevAfterService.customer_id)
    : null;
  const newCustomerId = customerId ? String(customerId) : null;

  if (prevCustomerId !== newCustomerId) {
    changeObj.customer_id = { old: prevCustomerId, new: newCustomerId };
  }
  if (prevAfterService.item_type !== itemType) {
    changeObj.item_type = { old: prevAfterService.item_type, new: itemType };
  }
  if (prevAfterService.item_name !== itemName) {
    changeObj.item_name = { old: prevAfterService.item_name, new: itemName };
  }
  if (prevAfterService.quantity !== quantity) {
    changeObj.quantity = { old: prevAfterService.quantity, new: quantity };
  }
  if (prevAfterService.symptom !== symptom) {
    changeObj.symptom = { old: prevAfterService.symptom, new: symptom };
  }
  const prevShopNote = prevAfterService.shop_note || '';
  const newShopNote = shopNote || '';
  if (prevShopNote !== newShopNote) {
    changeObj.shop_note = { old: prevShopNote || null, new: newShopNote || null };
  }
  const prevCustomerNote = prevAfterService.customer_note || '';
  const newCustomerNote = customerNote || '';
  if (prevCustomerNote !== newCustomerNote) {
    changeObj.customer_note = { old: prevCustomerNote || null, new: newCustomerNote || null };
  }
  const prevIsLoanerDeviceIssued = prevAfterService.is_loaner_device_issued ?? false;
  const newIsLoanerDeviceIssued = isLoanerDeviceIssued ?? false;
  if (prevIsLoanerDeviceIssued !== newIsLoanerDeviceIssued) {
    changeObj.is_loaner_device_issued = { old: prevIsLoanerDeviceIssued ? 1 : 0, new: newIsLoanerDeviceIssued ? 1 : 0 };
  }

  // 변경사항이 있을 때만 로그 생성
  if (Object.keys(changeObj).length > 0) {
    await createAfterServiceLog(
      newCustomerId,
      data.id,
      'update-after-service-info',
      '',
      changeObj
    );
  }

  return data;
};

/**
 * AS 삭제
 */
export const deleteAfterService = async (id: string) => {
  const { error } = await supabase.rpc(
    'delete_after_service_with_inventory_cleanup',
    { p_after_service_id: Number(id) },
  );

  if (error) throw error;
};
