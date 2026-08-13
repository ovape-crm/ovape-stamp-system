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
