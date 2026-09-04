import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import { after, before, test } from "node:test";
import { PGlite } from "@electric-sql/pglite";

let db;
const migration = (name) =>
  readFile(new URL(`../supabase/migrations/${name}.sql`, import.meta.url), "utf8");

before(async () => {
  db = new PGlite();
  await db.exec(`
    create role anon;
    create role authenticated;
    create role service_role;
    create schema auth;
    create table public.users(id uuid primary key, oss_role text not null);
    create table public.customers(
      id bigint primary key,
      adult_verified boolean not null default false,
      adult_verified_at timestamptz,
      adult_verification_method text,
      adult_verified_by uuid
    );
    create function auth.uid() returns uuid language sql stable as
      $$ select nullif(current_setting('request.jwt.claim.sub', true), '')::uuid $$;
  `);
  await db.exec(await migration("20260810000000_adult_verification"));
  await db.exec(await migration("20260810010000_attach_adult_verification_to_customer"));
  await db.exec(`
    insert into public.users(id, oss_role) values
      ('00000000-0000-0000-0000-000000000001', 'staff');
    insert into public.customers(id) values (1), (2);
  `);
});

after(async () => db?.close());

const insertRequest = async ({ id, hash, status = "pending", expiresAt }) =>
  db.query(
    `insert into adult_verification_requests
      (id, request_label, token_hash, status, expires_at, created_by)
     values ($1, '테스트', $2, $3, $4, '00000000-0000-0000-0000-000000000001')`,
    [id, hash, status, expiresAt],
  );

test("만료된 성인인증 요청은 완료되지 않고 고객 상태도 바뀌지 않는다", async () => {
  const id = "10000000-0000-0000-0000-000000000001";
  await insertRequest({
    id,
    hash: "expired-token-hash",
    expiresAt: "2026-01-01T00:00:00Z",
  });
  const { rows } = await db.query(
    "select complete_adult_verification_request($1, 'provider', '2026-01-02T00:00:00Z') completed",
    [id],
  );
  assert.equal(rows[0].completed, false);
  assert.equal(
    (await db.query("select status from adult_verification_requests where id=$1", [id])).rows[0].status,
    "pending",
  );
});

test("같은 요청의 중복 완료와 같은 토큰 해시의 중복 발급을 차단한다", async () => {
  const id = "10000000-0000-0000-0000-000000000002";
  await insertRequest({
    id,
    hash: "one-time-token-hash",
    expiresAt: "2027-01-01T00:00:00Z",
  });
  const complete = () =>
    db.query(
      "select complete_adult_verification_request($1, 'provider', '2026-09-04T00:00:00Z') completed",
      [id],
    );
  assert.equal((await complete()).rows[0].completed, true);
  assert.equal((await complete()).rows[0].completed, false);
  await assert.rejects(
    insertRequest({
      id: "10000000-0000-0000-0000-000000000003",
      hash: "one-time-token-hash",
      expiresAt: "2027-01-01T00:00:00Z",
    }),
    /unique|duplicate/i,
  );
});

test("완료된 미연결 요청은 한 고객에게만 한 번 연결된다", async () => {
  const id = "10000000-0000-0000-0000-000000000004";
  await insertRequest({
    id,
    hash: "attach-once-token-hash",
    status: "completed",
    expiresAt: "2027-01-01T00:00:00Z",
  });
  await db.query("select set_config('request.jwt.claim.sub',$1,false)", [
    "00000000-0000-0000-0000-000000000001",
  ]);
  const attach = (customerId) =>
    db.query(
      "select attach_adult_verification_to_customer($1,$2) attached",
      [id, customerId],
    );
  assert.equal((await attach(1)).rows[0].attached, true);
  assert.equal((await attach(2)).rows[0].attached, false);
  const customers = await db.query(
    "select id, adult_verified from customers order by id",
  );
  assert.deepEqual(customers.rows, [
    { id: 1, adult_verified: true },
    { id: 2, adult_verified: false },
  ]);
});
