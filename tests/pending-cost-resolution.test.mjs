import { readFile } from 'node:fs/promises';
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { PGlite } from '@electric-sql/pglite';
import { initializeCostTestDb } from './helpers/cost-db-fixture.mjs';

test('미확정 원가는 단가 혼합과 보호된 서비스 연결을 차단하고 일반 출고는 확정한다', async () => {
  const db = new PGlite();
  try {
    await initializeCostTestDb(db);
    await db.exec(`create function public.save_settlement_item_cost_segments(bigint,text,text,jsonb) returns void language sql as $$ select $$;`);
    await db.exec(await readFile(new URL('../supabase/migrations/20261120020000_guard_pending_cost_resolution.sql', import.meta.url), 'utf8'));
    await db.exec(await readFile(new URL('../supabase/migrations/20261120030000_scope_pending_cost_event_updates.sql', import.meta.url), 'utf8'));
    await db.exec(`
      insert into logs(id,category,jsonb) values (1,'stamp','{}');
      insert into inventory_cost_events(id,event_type,event_at,item_name,direction,quantity,reference_type,reference_id) values
      ('00000000-0000-0000-0000-000000000010','opening','2026-08-01','검증품목','in',1,'cost_missing','1'),
      ('00000000-0000-0000-0000-000000000011','sale_out','2026-08-02','검증품목','out',1,'stamp_log','1');
      insert into inventory_cost_layers(id,source_event_id,item_name,original_quantity,remaining_quantity,unit_cost,queue_sequence,cost_status) values
      ('00000000-0000-0000-0000-000000000012','00000000-0000-0000-0000-000000000010','검증품목',1,0,null,1,'pending');
      insert into inventory_cost_allocations(id,outbound_event_id,source_layer_id,quantity,unit_cost) values
      ('00000000-0000-0000-0000-000000000013','00000000-0000-0000-0000-000000000011','00000000-0000-0000-0000-000000000012',1,null);
      insert into inventory_service_cost_links(log_id,line_index,allocation_id,quantity) values (1,1,'00000000-0000-0000-0000-000000000013',1);
    `);
    const sql = "select save_and_resolve_missing_inventory_cost(null,'검증품목','opening_20260722',$1::jsonb)";
    await assert.rejects(db.query(sql, [JSON.stringify([{quantity:1,unit_cost:100},{quantity:1,unit_cost:200}])]), /단가가 다른 구간/);
    await assert.rejects(db.query(sql, [JSON.stringify([{quantity:1,unit_cost:100}])]), /서비스 또는 A\/S/);
    assert.equal((await db.query('select unit_cost from inventory_cost_allocations')).rows[0].unit_cost, null);
    await db.exec('delete from inventory_service_cost_links');
    await db.query(sql, [JSON.stringify([{quantity:1,unit_cost:100}])]);
    const { rows } = await db.query('select a.id,a.unit_cost,l.remaining_quantity,e.total_cost from inventory_cost_allocations a join inventory_cost_layers l on l.id=a.source_layer_id join inventory_cost_events e on e.id=a.outbound_event_id');
    assert.equal(rows[0].id, '00000000-0000-0000-0000-000000000013');
    assert.equal(rows[0].unit_cost, 100);
    assert.equal(rows[0].total_cost, 100);
    assert.equal(rows[0].remaining_quantity, 0);
  } finally { await db.close(); }
});

test('같은 품목의 다른 서비스 연결 출고는 누락 원가 확정 시 갱신하지 않는다', async () => {
  const db = new PGlite();
  try {
    await initializeCostTestDb(db);
    await db.exec(`create function public.save_settlement_item_cost_segments(bigint,text,text,jsonb) returns void language sql as $$ select $$;`);
    await db.exec(await readFile(new URL('../supabase/migrations/20261120030000_scope_pending_cost_event_updates.sql', import.meta.url), 'utf8'));
    await db.exec(`
      insert into logs(id,category,jsonb) values (1,'stamp','{}');
      insert into inventory_cost_events(id,event_type,event_at,item_name,direction,quantity,total_cost,reference_type,reference_id) values
        ('00000000-0000-0000-0000-000000000020','opening','2026-08-01','품목','in',1,null,'cost_missing','20'),
        ('00000000-0000-0000-0000-000000000021','sale_out','2026-08-02','품목','out',1,null,'stamp_log','21'),
        ('00000000-0000-0000-0000-000000000022','opening','2026-08-01','품목','in',1,200,'purchase_receipt','22'),
        ('00000000-0000-0000-0000-000000000023','sale_out','2026-08-02','품목','out',1,200,'stamp_log','23');
      insert into inventory_cost_layers(id,source_event_id,item_name,original_quantity,remaining_quantity,unit_cost,queue_sequence,cost_status) values
        ('00000000-0000-0000-0000-000000000024','00000000-0000-0000-0000-000000000020','품목',1,0,null,1,'pending'),
        ('00000000-0000-0000-0000-000000000025','00000000-0000-0000-0000-000000000022','품목',1,0,200,2,'confirmed');
      insert into inventory_cost_allocations(id,outbound_event_id,source_layer_id,quantity,unit_cost) values
        ('00000000-0000-0000-0000-000000000026','00000000-0000-0000-0000-000000000021','00000000-0000-0000-0000-000000000024',1,null),
        ('00000000-0000-0000-0000-000000000027','00000000-0000-0000-0000-000000000023','00000000-0000-0000-0000-000000000025',1,200);
      insert into inventory_service_cost_links(log_id,line_index,allocation_id,quantity) values (1,1,'00000000-0000-0000-0000-000000000027',1);
    `);
    await db.query("select save_and_resolve_missing_inventory_cost(null,'품목','opening_20260722',$1::jsonb)", [JSON.stringify([{quantity:1,unit_cost:100}])]);
    const { rows } = await db.query("select id,total_cost from inventory_cost_events where id in ('00000000-0000-0000-0000-000000000021','00000000-0000-0000-0000-000000000023') order by id");
    assert.deepEqual(rows.map((row) => row.total_cost), [100, 200]);
    assert.equal((await db.query('select count(*)::int as count from inventory_service_cost_links')).rows[0].count, 1);
  } finally { await db.close(); }
});
