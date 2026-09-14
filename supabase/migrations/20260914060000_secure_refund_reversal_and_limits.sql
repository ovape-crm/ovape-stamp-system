-- 환불은 회수 방식과 무관하게 원출고 금액·품목 수량을 한 번만 사용할 수 있다.
create or replace function public.create_customer_refund(
  p_source_log_id bigint, p_recovery_type text, p_refund_amount integer,
  p_selected_limit_amount integer, p_adjustment_reason text, p_reason text,
  p_memo text, p_lines jsonb, p_payments jsonb
) returns uuid language plpgsql security definer set search_path = public as $$
declare v_source public.logs%rowtype; v_refund_id uuid; v_line jsonb; v_payment jsonb; v_sum integer := 0;
  v_source_total integer; v_already_refunded integer; v_source_item jsonb; v_source_quantity integer;
  v_line_index integer; v_line_quantity integer; v_existing_quantity integer; v_line_sum integer := 0;
begin
  if auth.uid() is null then raise exception 'AUTH_REQUIRED'; end if;
  select * into v_source from public.logs where id=p_source_log_id for update;
  if not found or v_source.customer_id is null or v_source.category <> 'stamp' then raise exception 'REFUND_SOURCE_NOT_FOUND'; end if;
  v_source_total := greatest(0, coalesce((v_source.jsonb->>'totalAmount')::integer, 0));
  select coalesce(sum(refund_amount), 0) into v_already_refunded
  from public.customer_refunds where source_log_id=p_source_log_id and status='completed';
  if p_recovery_type not in ('none','normal','defective') or p_refund_amount <= 0 or p_refund_amount > v_source_total-v_already_refunded then raise exception 'INVALID_REFUND'; end if;
  if nullif(btrim(p_reason),'') is null then raise exception 'REFUND_REASON_REQUIRED'; end if;
  select coalesce(sum((value->>'amount')::integer),0) into v_sum from jsonb_array_elements(coalesce(p_payments,'[]'::jsonb));
  if v_sum <> p_refund_amount then raise exception 'REFUND_PAYMENT_MISMATCH'; end if;
  for v_line in select value from jsonb_array_elements(coalesce(p_lines,'[]'::jsonb)) loop
    v_line_index := (v_line->>'sourceLineIndex')::integer; v_line_quantity := (v_line->>'quantity')::integer; v_source_item := v_source.jsonb->'items'->v_line_index; v_source_quantity := coalesce((v_source_item->>'quantity')::integer,0);
    select coalesce(sum(line.quantity),0) into v_existing_quantity
    from public.customer_refund_lines line join public.customer_refunds refund on refund.id=line.refund_id
    where refund.source_log_id=p_source_log_id and refund.status='completed' and line.source_line_index=v_line_index;
    if v_source_item is null or v_line_quantity <= 0 or v_line_quantity > v_source_quantity-v_existing_quantity or btrim(coalesce(v_line->>'itemName','')) <> btrim(coalesce(v_source_item->>'itemName','')) then raise exception 'INVALID_REFUND_LINE'; end if;
    v_line_sum := v_line_sum+coalesce((v_line->>'refundableAmount')::integer,0);
  end loop;
  if v_line_sum <= 0 or p_selected_limit_amount <> v_line_sum or p_refund_amount > v_line_sum then raise exception 'INVALID_REFUND_AMOUNT'; end if;
  insert into public.customer_refunds(source_log_id,customer_id,recovery_type,refund_amount,selected_limit_amount,adjustment_amount,adjustment_reason,reason,memo,created_by) values(p_source_log_id,v_source.customer_id,p_recovery_type,p_refund_amount,p_selected_limit_amount,p_selected_limit_amount-p_refund_amount,case when p_selected_limit_amount<>p_refund_amount then nullif(btrim(p_adjustment_reason),'') else null end,nullif(btrim(p_reason),''),nullif(btrim(p_memo),''),auth.uid()) returning id into v_refund_id;
  for v_line in select value from jsonb_array_elements(coalesce(p_lines,'[]'::jsonb)) loop insert into public.customer_refund_lines(refund_id,source_line_index,item_id,item_name,quantity,gross_unit_price,allocated_discount_amount,refundable_amount,recovery_type) values(v_refund_id,(v_line->>'sourceLineIndex')::integer,nullif(v_line->>'itemId','')::bigint,v_line->>'itemName',(v_line->>'quantity')::integer,coalesce((v_line->>'grossUnitPrice')::integer,0),coalesce((v_line->>'allocatedDiscountAmount')::integer,0),(v_line->>'refundableAmount')::integer,p_recovery_type); end loop;
  for v_payment in select value from jsonb_array_elements(coalesce(p_payments,'[]'::jsonb)) loop insert into public.customer_refund_payments(refund_id,payment_type,amount) values(v_refund_id,v_payment->>'paymentType',(v_payment->>'amount')::integer); end loop;
  if p_recovery_type='defective' then insert into public.defective_inventory_holds(refund_line_id,customer_id,item_id,item_name,quantity,source_log_id,refund_id,reason,memo) select line.id,v_source.customer_id,line.item_id,line.item_name,line.quantity,p_source_log_id,v_refund_id,p_reason,p_memo from public.customer_refund_lines line where line.refund_id=v_refund_id;
  elsif p_recovery_type='normal' then perform public.receive_customer_refund_inventory(v_refund_id); end if;
  insert into public.logs(admin_id,customer_id,category,action,note,jsonb) values(auth.uid(),v_source.customer_id,'stamp','refund',coalesce(p_reason,''),jsonb_build_object('refundId',v_refund_id,'sourceLogId',p_source_log_id,'totalAmount',-p_refund_amount,'payments',p_payments,'paymentType',v_source.jsonb->>'paymentType','storeName',v_source.jsonb->>'storeName','recoveryType',p_recovery_type));
  return v_refund_id;
end $$;

-- 취소는 원환불의 결제수단별 금액을 양수로 되돌려 보고서에서 상계한다.
-- 이후 새 결제수단으로 환불을 다시 만들 수 있다.
create or replace function public.cancel_customer_refund(p_refund_id uuid, p_reason text)
returns void language plpgsql security definer set search_path = public as $$
declare refund public.customer_refunds%rowtype; source_log public.logs%rowtype; refund_payments jsonb;
begin
  if auth.uid() is null then raise exception 'AUTH_REQUIRED'; end if;
  if not public.is_current_user_master() then raise exception 'MASTER_REQUIRED'; end if;
  if nullif(btrim(p_reason), '') is null then raise exception 'CANCELLATION_REASON_REQUIRED'; end if;

  select * into refund from public.customer_refunds where id = p_refund_id for update;
  if not found or refund.status <> 'completed' then raise exception 'REFUND_NOT_CANCELLABLE'; end if;
  if exists (select 1 from public.customer_refund_lines where refund_id = p_refund_id and inventory_movement_id is not null) then raise exception 'REFUND_INVENTORY_ALREADY_RECEIVED'; end if;
  if exists (select 1 from public.defective_inventory_holds hold where hold.refund_id = p_refund_id and (hold.status <> 'held' or hold.after_service_id is not null))
    or exists (select 1 from public.supplier_refund_settlements settlement join public.defective_inventory_holds hold on hold.id = settlement.defective_hold_id where hold.refund_id = p_refund_id) then raise exception 'REFUND_FOLLOW_UP_ALREADY_PROCESSED'; end if;

  select * into source_log from public.logs where id = refund.source_log_id;
  select coalesce(jsonb_agg(jsonb_build_object('paymentType', payment.payment_type, 'amount', payment.amount)), '[]'::jsonb)
  into refund_payments from public.customer_refund_payments payment where payment.refund_id = p_refund_id;

  delete from public.defective_inventory_holds where refund_id = p_refund_id and status = 'held' and after_service_id is null;
  update public.customer_refunds set status = 'cancelled', cancelled_at = now(), cancelled_by = auth.uid(), cancellation_reason = btrim(p_reason), updated_at = now() where id = p_refund_id;
  insert into public.logs(admin_id, customer_id, category, action, note, jsonb)
  values(auth.uid(), refund.customer_id, 'stamp', 'refund_cancel', btrim(p_reason), jsonb_build_object(
    'refundId', p_refund_id, 'sourceLogId', refund.source_log_id, 'totalAmount', refund.refund_amount,
    'payments', refund_payments, 'paymentType', source_log.jsonb->>'paymentType', 'storeName', source_log.jsonb->>'storeName',
    'recoveryType', refund.recovery_type
  ));
end $$;
