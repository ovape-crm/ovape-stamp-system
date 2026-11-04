# Repository UI conventions

These are product-wide UI rules. Apply them to all new UI and keep them consistent across devices and contributors.

## Filter and search group surface

- Every newly created filter or search group must use the neutral surface established in product search.
- Container border: `border border-gray-200`.
- Container background: `bg-gray-50/70`.
- Standard rounded container: `rounded-xl`.
- Do not introduce a pink/brand-tinted surface for new filter or search groups.

## Standard search input

- The item-name input in `src/app/(auth)/product-search/page.tsx` is the canonical search-input design.
- Reuse its left search icon, white background, subtle shadow, border, hover, focus ring, typography, placeholder, and clear action.
- Canonical input classes:
  `w-full rounded-lg border border-gray-300 bg-white py-2.5 pl-9 pr-10 text-sm font-medium text-gray-900 shadow-sm outline-none transition placeholder:font-normal placeholder:text-gray-500 hover:border-brand-300 focus:border-brand-500 focus:ring-2 focus:ring-brand-100`
- Use the same pattern for newly created search inputs unless a documented product requirement explicitly overrides it.

## List and search result count

- Place the displayed result count outside the table container, immediately above the table on the left.
- Follow the customer-management list count as the canonical layout and typography.
- Use `mb-3 flex items-center justify-start gap-3` for the count row.
- Use `text-xs text-gray-600 sm:text-sm` for the count text.
- Emphasize the numeric value with `font-semibold text-brand-600`.
- Do not place a result count inside a table header bar or inside the bordered table card.

## Responsive filter controls

- Optimize filter controls independently for phone, tablet, and desktop layouts.
- For a two-option search-mode control, use a dropdown only below the `sm` breakpoint.
- Keep the immediately visible segmented-button control from `sm` upward so tablet users do not receive the phone layout.
- Use short option labels when the surrounding field label already provides context, for example `액상` and `나머지` under `검색 구분`.

## Pointer cursor

- Every interactive, clickable control must show the pointer cursor.
- Buttons, links, enabled selects, summaries, and elements with interactive roles are covered by the global rule in `src/app/globals.css`.
- When adding a custom clickable element that is not covered by the global selectors, add `cursor-pointer`.
- Disabled controls must use `cursor-not-allowed`.

## Dropdown selection

- Every dropdown menu must show a check icon beside its currently selected option.
- The check must be visible immediately when the menu opens, including before the user makes a new selection in the current session.
- The opened menu width must exactly match its closed trigger width.
- Dropdowns placed together in the same filter group must use the same trigger width and height.
- Use the shared `Dropdown` component so controlled values, compact sizing, colors, and selected-state checks remain consistent.

## Inventory and search filter toolbar

- The inventory overview filter toolbar is the canonical layout for newly created inventory and search filters.
- Place compact selection cards first, followed by a vertical divider and the grouped search-input card.
- Compact selection cards use the same width (`120px` from the `sm` breakpoint), height, padding, neutral background, border, label spacing, and compact dropdown trigger.
- Use short vertical dividers between logical filter groups. Keep the spacing on both sides compact and consistent.
- Group related search inputs inside one neutral rounded container, separating individual inputs with subtle vertical borders.
- Keep the entire toolbar inside one white rounded outer card with a subtle gray border and shadow.

## Table action row

- Place the result count outside the table, immediately above it on the left.
- When rows are incrementally revealed, show the count as `currently displayed / total`, without a unit suffix, for example `10/856`.
- The compact filter toolbar and the left-aligned `currently displayed / total` count are the reusable standard.
- `카카오톡 복사` is page-specific and is not part of this shared standard; do not add it to new tables unless explicitly requested.
- When a table-wide copy action is explicitly requested, it must operate on the complete filtered result set, not only the currently displayed rows.

## Reuse existing UI before creating new UI

- Before adding a new control, find an existing control with the same purpose and reuse its shared component, size, variant, spacing, and interaction pattern.
- Controls with the same role on the same screen must be visually and behaviorally identical. Do not create a one-off button or input style when the existing `Button`, `Dropdown`, or canonical search input can be reused.
- This reuse rule is required so later product-wide changes can be made from one shared implementation.
- Addition buttons use a plain Korean action label without a leading `+` symbol (for example, `거래처 추가`, not `+ 거래처 추가`).

## Outbound modal variants

- Treat outbound modals as four independent UI variants: inventory adjustment, demo, X customer (male/female), and normal customer.
- Within each variant, creation/processing and editing must use the same modal UI and step structure.
- The creation/processing flow is canonical: inventory-adjustment edits follow inventory-adjustment processing, demo edits follow demo processing, and X/normal edits follow outbound-history creation.
- When changing one variant, do not automatically apply the change to the other three variants unless the requirement explicitly calls for a shared change.

## Completion report format

- When the user asks for a title and detailed completion description, provide both in copy-and-paste-ready code blocks.
- Write the detailed description in Korean using bracketed functional sections (for example, `[종합정산]`, `[재고·원가]`, `[검증]`) followed by concise bullet points.
- Include only implemented and verified items. Put checks such as tests, lint, type checks, browser checks, and database migration status in a final `[검증]` section.
- Do not replace the structured detailed description with a one-line summary unless the user explicitly asks for a short version.

## Persistent user instructions

- 액상 자동 판매금액 계산은 3병 판매 구성을 최대한 우선 적용한다. 가능한 3병 구성 조합이 둘 이상이면 최종 금액이 더 높은 조합을 적용하고, 남는 1~2병은 해당 분류의 추가 1병 금액을 더한다. 이 규칙은 다음 작업에서 출고 이력 추가에 연결한다.
- 액상 자동 판매금액은 일반 고객·X 고객의 기본 출고(출고 구분 미입력 또는 메모입력)에만 적용한다. 일반 고객의 가격조정·서비스·교환입고·교환출고·A/S 교환출고와 시연용·재고조정에는 적용하지 않는다. X 고객은 적립·쿠폰 없이 자동금액만 적용한다.
- 적립 대상은 카테고리 설정으로 관리하며, 입호흡·이벤트 / 입호흡·기본 / 폐호흡·이벤트 / 폐호흡·기본 / 기기만 품목 1개당 1개 적립으로 설정한다. 나머지 카테고리는 적립 0개다. 고객 정보가 미적립대상인 일반 고객은 적립·쿠폰 입력, 검증, 안내 전체에서 제외한다.
- 일반 고객 쿠폰은 입호흡 또는 폐호흡만 선택할 수 있고 직접입력은 제공하지 않는다. 호흡 방식 선택 후 이벤트·기본 버튼을 표시하며 기본값은 이벤트지만 자동 전환하지 않는다. 2단계 다음에서 선택한 호흡 방식·분류 액상 수량이 쿠폰 병수보다 적으면 저장을 막고 변경 안내를 표시한다. 쿠폰 사용 병수는 자동 판매금액 계산과 적립 가능 수량에서 차감한다.
- 적립 부족 안내는 적립 대상 품목별 수량을 명시한다. 예: `입호흡 · 이벤트 3개\n입호흡 · 기본 1개\n4개까지 적립할 수 있습니다.\n\n현재 3개만 적립됩니다. 적립 수량을 확인해 주세요.` 안내에는 `진행하기`와 `수정하기` 버튼을 둔다. 적립 수량이 최대치보다 많으면 저장을 막고, 적으면 진행 여부를 선택하게 한다.
- Do not commit or push work unless the user explicitly asks to do so; keep ongoing work uncommitted while the user is continuing the task.
- When the user says to remember a workflow, reporting format, UI convention, or other instruction for future work, record the instruction in this `AGENTS.md` during the same task so it also applies in new conversations.
- Before recording, preserve the user's intended scope and wording; do not turn a one-off request into a permanent rule unless the user clearly indicates that it should be remembered or applied going forward.
- When the user asks for a modification, change only the explicitly requested content. Do not independently add, remove, or alter any other feature, UI, label, icon, layout, or behavior.
- Do not change an existing control's label, icon, visual treatment, or behavior unless the user explicitly requests that exact change. When restructuring existing controls, preserve their current visible labels and icons by default.
- Action-menu dropdown triggers and every label or icon within their menus must be horizontally and vertically centered by default.
- This project must be deployed to `https://ovape-system.vercel.app/` after the relevant changes are merged to `main`.
- 사용자가 “커밋하고 푸시”라고 말하면 현재 작업 브랜치에 커밋한 뒤 GitHub 원격 브랜치까지만 올린다. GitHub PR 생성·초록색 Merge 버튼을 통한 `main` 병합은 사용자가 직접 수행한다. 사용자가 명시적으로 `main` 병합 또는 main 푸시를 지시하지 않는 한, 에이전트는 절대 작업 브랜치를 `main`에 머지하거나 `main`에 푸시하지 않는다.

## Gear icon

- For every newly added gear/settings control, reuse the exact gear icon design already used by the tab-order management control. Do not substitute a different gear glyph, emoji, or one-off icon treatment.

<!-- BEGIN:nextjs-agent-rules -->

# This is NOT the Next.js you know

This version has breaking changes — APIs, conventions, and file structure may all differ from your training data. Read the relevant guide in `node_modules/next/dist/docs/` (resolved from this file's directory; in monorepos the `next` package may not be visible from the repo root) before writing any code. Heed deprecation notices.

This block is written and re-added by `next dev` — verify at `node_modules/next/dist/server/lib/generate-agent-files.js`. Removing it from a diff only re-creates the uncommitted change; committing it with your work keeps the tree clean.

<!-- END:nextjs-agent-rules -->
