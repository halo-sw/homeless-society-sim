package: @astryxdesign/core

# Table

Table displays structured data in rows and columns with consistent dimensionality. It supports rich cell content, sorting, selection, pagination, and column management through a composable plugin system. Use Table for data sets with uniform structure; for simpler or inconsistent data, consider a list or card layout instead.

**Import:** `import {Table} from '@astryxdesign/core/Table';`

## Anatomy

| Element | Required | Description |
|---------|----------|-------------|
| Table | Yes | Semantic table element that groups the table sections, rows, and cells. |
| Scroll region | Yes | Outer region that scrolls horizontally, enters the keyboard order, and contains overscroll only while the columns overflow. |
| Header section | No | Column-heading section generated when data-driven columns are present or supplied with TableHeader in children mode. |
| Column header cell | No | Cell that identifies one column and may contain sorting or bulk-selection controls. |
| Sort control | No | Button that wraps a sortable column label and changes that column's sort direction. |
| Sort indicator glyph | No | Directional symbol rendered by Icon inside a Sort control. |
| Sort priority | No | Number shown for a sorted column when multi-column sorting is active. |
| Selection control | No | CheckboxInput rendered in the header and selectable body rows by the selection plugin. |
| Body section | Yes | Section containing data rows or the current empty state; data-driven mode renders it automatically. |
| Row | No | Repeated TableRow that groups cells in a standard header, body, or footer row. |
| Cell | No | TableCell containing one value or caller-provided content in a standard body or footer row. |
| Default empty state | No | Compact EmptyState shown for an empty data array unless it is replaced or disabled. |
| Expansion control | No | Button in a leading cell that expands or collapses one expandable row. |
| Expansion glyph | No | Directional symbol rendered by Icon inside an Expansion control. |
| Expanded detail panel | No | Detail row and spanning cell rendered below an expanded row around caller-provided content. |
| Footer section | No | Optional summary or totals section supplied with TableFooter in children mode. |

## Best Practices

- **Do:** Use density and divider variants to match the information density and scanning needs of your data.
- **Do:** Compose rich cell content with Astryx components like Badge, StatusDot, and Avatar via renderCell.
- **Do:** In children mode, put every row inside TableHeader, TableBody, or TableFooter. <table> cannot contain a <tr> directly: the HTML parser inserts an implied <tbody> for server-rendered markup and React does not on the client, so unwrapped rows mismatch on hydration.
- **Do:** Omit width for equal flexible columns with a compact 60px readability floor. Give one column its own floor with proportional(1, {minWidth}), weight columns with proportional(n), and fix widths with pixel(); the Table scroll region activates when the combined floors no longer fit.
- **Do:** Use the data-driven API from React Server Components: proportional(), pixel(), and column definitions without function props are server-safe. Columns using renderCell (or any function prop) need the table wrapped in a "use client" component, since functions cannot cross the server-client boundary.
- **Don't:** Use a table for data without consistent columns. Use a list or card layout for heterogeneous content.
- **Don't:** Enable every plugin at once. Add only the features your use case requires to keep the interface focused.
- **Don't:** Rely on the 60px omitted-width floor when a text-heavy column needs more room; set proportional(1, {minWidth}) on that column instead.

## Props

| Prop | Type | Default | Description |
|------|------|---------|-------------|
| `data` | `T[]` | - | Array of data items to render as rows. T must extend Record<string, unknown> (use `interface MyRow extends Record<string, unknown>` for custom types). |
| `columns` | `TableColumn<T>[]` | - | Column definitions: each column has {key, header, width?, align?, renderCell?}. The `header` field sets the column heading text. If omitted, columns are auto-generated from data object keys. The `width` field is typed as `ColumnWidth` (not a number); use `proportional(n)` or `pixel(n)` helpers imported from `@astryxdesign/core/Table`. Omitting `width` keeps an equal flexible share with a compact 60px readability floor. To give one column a different floor, set `width: proportional(1, {minWidth: 80})`; its `minWidth` replaces the 60px floor for that column. Example: `width: pixel(120)` for 120px fixed, `width: proportional(1)` for a flexible column with a 120px default minimum. |
| `idKey` | `(keyof T & string) \| ((item: T) => string \| number)` | - | Row key for React reconciliation. Pass a property name string or a function. Falls back to row index if omitted. |
| `density` | `'compact' \| 'balanced' \| 'spacious'` | `'balanced'` | Row density controlling cell padding and font size. |
| `dividers` | `'rows' \| 'columns' \| 'grid' \| 'none'` | `'rows'` | Divider style rendered between cells. |
| `isStriped` | `boolean` | `false` | Applies a background wash to even-numbered rows. |
| `hasHover` | `boolean` | `false` | Applies a hover highlight background to rows on pointer devices. |
| `verticalAlign` | `'middle' \| 'top' \| 'bottom'` | `'middle'` | Vertical alignment for body row cells. Controls `vertical-align` on the `<td>` elements. |
| `textOverflow` | `'wrap' \| 'truncate'` | `'wrap'` | How body cell text behaves when it exceeds the column width. 'wrap' lets text wrap and the row grow taller; 'truncate' clips with an ellipsis (default-rendered cells show a tooltip on hover when truncated). Header cells always truncate. |
| `plugins` | `Record<string, TablePlugin<T>>` | - | Named plugins that extend table behavior via the transform pipeline. Converted to an ordered array internally. |
| `rowIndexStart` | `number` | `1` | ARIA row index (1-based) for the first rendered body row. The row ordinal is an accessibility concern independent of any visible index column, so setting this (or rowCount) makes the table emit aria-rowindex on body rows and aria-rowcount on the table. For a paginated/windowed view, pass the offset of the first visible row (e.g. (page - 1) * pageSize + 1) so aria-rowindex reflects position in the full dataset. Data-driven mode only. |
| `rowCount` | `number` | - | Total number of body rows across all pages/windows, used for aria-rowcount so assistive tech can announce "row X of Y" against the full dataset. When omitted but rowIndexStart is set (windowed view with an unknown total), aria-rowcount is set to -1 per the ARIA unknown-count convention. Data-driven mode only. |
| `children` | `ReactNode` | - | Children mode: compose the table yourself from TableHeader / TableBody / TableFooter, each holding TableRow and TableCell, instead of using data-driven rendering. The children are passed straight to the <table>, so the section is yours to supply. A TableRow placed directly in Table emits <table><tr>, which is invalid HTML and mismatches on hydration (the parser inserts an implied <tbody> for server-rendered markup; React does not on the client). Data-driven mode renders the sections for you. |
| `xstyle` | `StyleXStyles` | - | StyleX styles for layout customization (margins, positioning, sizing). Must be a stylex.create() value: not an inline style object like style={{}}. |

## Components

### TableHeader

See `npx astryx component TableHeader` for props and usage.

### TableBody

See `npx astryx component TableBody` for props and usage.

### TableFooter

See `npx astryx component TableFooter` for props and usage.

### TableRow

See `npx astryx component TableRow` for props and usage.

### TableCell

See `npx astryx component TableCell` for props and usage.

### TableHeaderCell

See `npx astryx component TableHeaderCell` for props and usage.

### useTableSelection

See `npx astryx component useTableSelection` for props and usage.

### useTableSelectionState

See `npx astryx component useTableSelectionState` for props and usage.

### TableSelectionToolbar

See `npx astryx component TableSelectionToolbar` for props and usage.

### useTableSortable

See `npx astryx component useTableSortable` for props and usage.

### useTableTreeData

See `npx astryx component useTableTreeData` for props and usage.

### useTableTreeState

See `npx astryx component useTableTreeState` for props and usage.

### useTablePagination

See `npx astryx component useTablePagination` for props and usage.

### useTableColumnSettings

See `npx astryx component useTableColumnSettings` for props and usage.

### useTableFiltering

See `npx astryx component useTableFiltering` for props and usage.

### useTableFilterState

See `npx astryx component useTableFilterState` for props and usage.

## Theming

| Component class | Preferred data attributes | Props | States |
|-----------------|---------------------------|-------|--------|
| `astryx-table` | - | - | - |
| `astryx-table-scroll-wrapper` | - | - | - |
| `astryx-table-header` | - | - | - |
| `astryx-table-body` | - | - | - |
| `astryx-table-footer` | - | - | - |
| `astryx-table-row` | - | - | - |
| `astryx-table-cell` | `data-density` | density | - |
| `astryx-table-header-cell` | `data-density` | density | - |

Override in defineTheme:
```ts
components: {
  'table': {
    base: { /* CSS properties */ },
  },
  'table-scroll-wrapper': {
    base: { /* CSS properties */ },
  },
}
```

