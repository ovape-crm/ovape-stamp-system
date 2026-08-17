import { CustomerType } from "@/app/_domains/_customer/_types/customer.types";
import supabase from "@/libs/supabaseClient";
import { createLog } from "@/app/_domains/_log/_services/logService";
import { LogCategoryEnum } from "@/app/_enums/enums";
import { getUpdateLogNote } from "@/app/_utils/utils";

export interface SearchParams {
  target?: "all" | "name" | "phone";
  keyword?: string;
  sortBy?: "recent_usage" | "name" | "stamp" | "created_at";
  sortOrder?: "asc" | "desc";
}

export type CustomerQuickLink = Pick<
  CustomerType,
  "id" | "name" | "phone" | "gender"
>;

export type ExistingCustomerMatch = Pick<
  CustomerType,
  "id" | "name" | "phone" | "address" | "note" | "is_stamp_eligible"
>;

export const findCustomersByNameAndPhoneLastDigits = async (
  name: string,
  phoneLastDigits: string,
): Promise<ExistingCustomerMatch[]> => {
  const normalizedName = name.trim();
  const normalizedDigits = phoneLastDigits.replace(/\D/g, "");
  const hasName =
    normalizedName.length > 0 && normalizedName.toUpperCase() !== "X";
  const hasPhoneLastDigits = normalizedDigits.length === 4;
  if (!hasName && !hasPhoneLastDigits) return [];

  let query = supabase
    .from("customers")
    .select("id, name, phone, address, note, is_stamp_eligible")
    .neq("phone", "X")
    .limit(5);

  if (hasName) query = query.eq("name", normalizedName);
  if (hasPhoneLastDigits) query = query.like("phone", `%${normalizedDigits}`);

  const { data, error } = await query;

  if (error) throw error;
  return data ?? [];
};

export const getCustomerQuickLinks = async (): Promise<CustomerQuickLink[]> => {
  const { data, error } = await supabase
    .from("customers")
    .select("id, name, phone, gender, created_at")
    .or("and(name.eq.X,phone.eq.X),name.eq.시연용,name.eq.재고조정")
    .order("created_at", { ascending: true });

  if (error) throw error;
  return (data ?? []).map(({ id, name, phone, gender }) => ({
    id,
    name,
    phone,
    gender,
  }));
};

/**
 * 전체 고객 수 조회
 */
export const getCustomersCount = async (
  params?: SearchParams,
): Promise<number> => {
  let query = supabase.from("customers").select("*", {
    count: "exact",
    head: true,
  });

  // 특수 고객은 바로가기와 이력에서만 접근하고 일반 고객 목록에서는 제외합니다.
  query = query
    .not("name", "in", '("시연용","재고조정")')
    .or("name.neq.X,phone.neq.X");

  // 검색 조건 추가
  if (params?.keyword) {
    const { target, keyword } = params;

    if (target === "name") {
      query = query.ilike("name", `%${keyword}%`);
    } else if (target === "phone") {
      query = query.ilike("phone", `%${keyword}%`);
    } else if (target === "all") {
      query = query.or(`name.ilike.%${keyword}%,phone.ilike.%${keyword}%`);
    }
  }

  const { count, error } = await query;

  if (error) throw error;

  return count || 0;
};

/**
 * 고객 목록 조회
 */
export const getCustomers = async (
  limit = 10,
  offset = 0,
  params?: SearchParams,
): Promise<CustomerType[]> => {
  const from = offset;
  const to = offset + limit - 1;

  let query = supabase.from("customers").select(`
    *,
    stamps(count)
  `);

  // 특수 고객은 바로가기와 이력에서만 접근하고 일반 고객 목록에서는 제외합니다.
  query = query
    .not("name", "in", '("시연용","재고조정")')
    .or("name.neq.X,phone.neq.X");

  // 검색 조건 추가
  if (params?.keyword) {
    const { target, keyword } = params;

    if (target === "name") {
      query = query.ilike("name", `%${keyword}%`);
    } else if (target === "phone") {
      query = query.ilike("phone", `%${keyword}%`);
    } else if (target === "all") {
      query = query.or(`name.ilike.%${keyword}%,phone.ilike.%${keyword}%`);
    }
  }

  // 정렬 처리
  const sortBy = params?.sortBy || "recent_usage";
  const sortOrder = params?.sortOrder || (sortBy === "name" ? "asc" : "desc");

  if (sortBy === "recent_usage") {
    const { data: usageLogs, error: logError } = await supabase
      .from("logs")
      .select("customer_id, created_at")
      .eq("category", LogCategoryEnum.STAMP.value)
      .not("customer_id", "is", null)
      .order("created_at", { ascending: false })
      .limit(15);

    if (logError) throw logError;

    const recentCustomerIds = Array.from(
      new Set(
        (usageLogs ?? []).map((log) => String(log.customer_id)),
      ),
    ).slice(0, 5);
    if (!recentCustomerIds.length || offset > 0) return [];

    const { data: recentCustomers, error: customerError } = await query.in(
      "id",
      recentCustomerIds,
    );
    if (customerError) throw customerError;

    const orderByCustomerId = new Map(
      recentCustomerIds.map((customerId, index) => [customerId, index]),
    );
    return [...recentCustomers].sort(
      (left, right) =>
        (orderByCustomerId.get(String(left.id)) ?? Number.MAX_SAFE_INTEGER) -
        (orderByCustomerId.get(String(right.id)) ?? Number.MAX_SAFE_INTEGER),
    );
  } else if (sortBy === "stamp") {
    // 스탬프 많은 순/적은 순은 클라이언트에서 정렬해야 함 (관계형 데이터이므로)
    // 페이지네이션 없이 모든 데이터 가져오기
    const { data: allData, error } = await query;

    if (error) throw error;

    // 클라이언트에서 정렬
    const sortedData = [...allData].sort((a, b) => {
      const aCount = a.stamps?.[0]?.count || 0;
      const bCount = b.stamps?.[0]?.count || 0;
      const countDifference =
        sortOrder === "desc" ? bCount - aCount : aCount - bCount;
      if (countDifference !== 0) return countDifference;
      return Number(a.id) - Number(b.id);
    });

    // 정렬 후 페이지네이션 적용
    return sortedData.slice(from, to + 1);
  } else if (sortBy === "created_at") {
    query = query
      .order("created_at", { ascending: sortOrder === "asc" })
      .order("id", { ascending: true });
  } else {
    // 기본: 이름 가나다 순
    query = query
      .order("name", { ascending: sortOrder === "asc" })
      .order("id", { ascending: true });
  }

  // 페이지네이션 적용
  query = query.range(from, to);

  const { data, error } = await query;

  if (error) throw error;

  return data;
};

/**
 * 고객 상세 조회
 */
export const getCustomerById = async (id: string): Promise<CustomerType> => {
  const { data, error } = await supabase
    .from("customers")
    .select(
      `
      *,
      stamps(count)
    `,
    )
    .eq("id", id)
    .single();

  if (error) throw error;

  return data;
};

/**
 * 고객 생성
 */
export const createCustomer = async (customer: {
  name: string;
  phone: string;
  gender: "male" | "female";
  is_stamp_eligible?: boolean;
  address?: string;
  note?: string;
  adult_verification_method?: "unverified" | "physical_id" | "bbaton";
  adult_verification_request_id?: string;
}) => {
  const {
    data: { session },
  } = await supabase.auth.getSession();
  const isDirectlyVerified =
    customer.adult_verification_method === "physical_id";
  const insertPayload = {
    name: customer.name,
    phone: customer.phone,
    gender: customer.gender,
    is_stamp_eligible: customer.is_stamp_eligible ?? true,
    note: customer.note,
    adult_verified: isDirectlyVerified,
    adult_verified_at: isDirectlyVerified ? new Date().toISOString() : null,
    adult_verification_method: isDirectlyVerified ? "physical_id" : null,
    adult_verified_by: isDirectlyVerified ? (session?.user.id ?? null) : null,
    ...(customer.address?.trim() ? { address: customer.address.trim() } : {}),
  };

  const { data, error } = await supabase.rpc("create_customer_with_log", {
    p_customer: insertPayload,
    p_adult_verification_request_id:
      customer.adult_verification_method === "bbaton"
        ? (customer.adult_verification_request_id ?? null)
        : null,
  });

  if (error) throw error;

  return data;
};

/**
 * 고객 수정
 */
export const updateCustomer = async (
  id: string,
  updates: {
    name?: string;
    phone?: string;
    gender?: "male" | "female";
    is_stamp_eligible?: boolean;
    address?: string;
    note?: string;
  },
) => {
  const prevCustomer = await getCustomerById(id);

  const changeObj = getUpdateLogNote(
    {
      name: prevCustomer.name,
      phone: prevCustomer.phone,
      gender: prevCustomer.gender,
      is_stamp_eligible: prevCustomer.is_stamp_eligible ?? true,
      address: prevCustomer?.address ?? "",
      note: prevCustomer?.note ?? "",
    },
    {
      name: updates.name ?? prevCustomer.name,
      phone: updates.phone ?? prevCustomer.phone,
      gender: updates.gender ?? prevCustomer.gender,
      is_stamp_eligible:
        updates.is_stamp_eligible ?? prevCustomer.is_stamp_eligible ?? true,
      address: updates.address ?? prevCustomer?.address ?? "",
      note: updates.note ?? prevCustomer?.note ?? "",
    },
  );

  if (Object.keys(changeObj).length === 0) return prevCustomer;

  const { data, error } = await supabase.rpc("update_customer_with_log", {
    p_customer_id: Number(id),
    p_updates: updates,
    p_changes: changeObj,
  });

  if (error) throw error;
  if (!data) throw new Error("NOT_FOUND_CUSTOMER");

  return data;
};

export const updateCustomerWithAdultVerification = async (
  id: string,
  updates: {
    name?: string;
    phone?: string;
    gender?: "male" | "female";
    is_stamp_eligible?: boolean;
    address?: string;
    note?: string;
  },
  verification: {
    method: "physical_id" | "bbaton";
    requestId?: string;
  },
) => {
  const prevCustomer = await getCustomerById(id);
  const changeObj = getUpdateLogNote(
    {
      name: prevCustomer.name,
      phone: prevCustomer.phone,
      gender: prevCustomer.gender,
      is_stamp_eligible: prevCustomer.is_stamp_eligible ?? true,
      address: prevCustomer.address ?? "",
      note: prevCustomer.note ?? "",
    },
    {
      name: updates.name ?? prevCustomer.name,
      phone: updates.phone ?? prevCustomer.phone,
      gender: updates.gender ?? prevCustomer.gender,
      is_stamp_eligible:
        updates.is_stamp_eligible ?? prevCustomer.is_stamp_eligible ?? true,
      address: updates.address ?? prevCustomer.address ?? "",
      note: updates.note ?? prevCustomer.note ?? "",
    },
  );
  const requestId =
    verification.method === "bbaton" && verification.requestId !== "__current__"
      ? (verification.requestId ?? null)
      : null;

  const { data, error } = await supabase.rpc(
    "update_customer_with_adult_verification",
    {
      p_customer_id: Number(id),
      p_updates: updates,
      p_changes: changeObj,
      p_adult_verification_method: verification.method,
      p_adult_verification_request_id: requestId,
    },
  );

  if (error) {
    const isMissingMigration =
      error.code === "PGRST202" ||
      error.message.includes("update_customer_with_adult_verification");
    if (!isMissingMigration) throw error;

    await updateCustomer(id, updates);
    if (verification.method === "physical_id") {
      return updateCustomerAdultVerification(id, true, "physical_id");
    }
    if (requestId) {
      await attachAdultVerificationToCustomer(id, requestId);
    }
    return getCustomerById(id);
  }
  if (!data) throw new Error("NOT_FOUND_CUSTOMER");
  return data;
};

/**
 * 고객 삭제
 */
export const deleteCustomer = async (id: string) => {
  const { error } = await supabase.from("customers").delete().eq("id", id);

  if (error) throw error;
};

export const updateCustomerAdultVerification = async (
  id: string,
  verified: boolean,
  method: "physical_id" | "manual" = "physical_id",
) => {
  const {
    data: { session },
  } = await supabase.auth.getSession();
  if (!session) throw new Error("AUTH_REQUIRED");

  const previous = await getCustomerById(id);
  const previousMethod = previous.adult_verification_method ?? null;
  const nextMethod = verified ? method : null;
  if (
    (previous.adult_verified ?? false) === verified &&
    previousMethod === nextMethod
  ) {
    return previous;
  }
  const verifiedAt = verified ? new Date().toISOString() : null;
  const { data, error } = await supabase
    .from("customers")
    .update({
      adult_verified: verified,
      adult_verified_at: verifiedAt,
      adult_verification_method: nextMethod,
      adult_verified_by: verified ? session.user.id : null,
    })
    .eq("id", id)
    .select()
    .maybeSingle();

  if (error) throw error;
  if (!data) throw new Error("NOT_FOUND_CUSTOMER");

  await createLog(
    LogCategoryEnum.CUSTOMER.value,
    id,
    verified
      ? "adult-verification-manual-complete"
      : "adult-verification-revoked",
    verified
      ? "성인 인증을 수동으로 완료했습니다."
      : "성인 인증을 해제했습니다.",
    {
      adultVerification: {
        before: previous.adult_verified ?? false,
        after: verified,
        method: verified ? method : null,
        verifiedAt,
      },
    },
  );

  return data;
};

export const attachAdultVerificationToCustomer = async (
  customerId: string,
  requestId: string,
) => {
  const previous = await getCustomerById(customerId);
  const { data, error } = await supabase.rpc(
    "attach_adult_verification_to_customer",
    {
      p_request_id: requestId,
      p_customer_id: Number(customerId),
    },
  );

  if (error) throw error;
  if (!data) throw new Error("ADULT_VERIFICATION_ATTACH_FAILED");

  const updated = await getCustomerById(customerId);
  await createLog(
    LogCategoryEnum.CUSTOMER.value,
    customerId,
    "adult-verification-link-complete",
    "성인 인증이 링크 확인으로 완료되었습니다.",
    {
      adultVerification: {
        before: previous.adult_verified ?? false,
        after: true,
        method: "bbaton",
        verifiedAt: updated.adult_verified_at,
        requestId,
      },
    },
  );
  return data;
};
