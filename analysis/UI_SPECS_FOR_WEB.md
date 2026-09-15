# UI SPECS FOR WEB — SambaPOS V3

> Pixel-perfect translation guide from WPF/XAML to web (HTML + CSS + React/Tailwind).
> Every dimension, color, font, and layout below is extracted from the actual `.xaml` files
> in `/home/z/my-project/samba-web-clone/source/`.

**Key finding:** SambaPOS V3 does **not** use a central color palette file. Colors are **WPF named colors** (`Silver`, `Gainsboro`, `WhiteSmoke`, `DarkGray`, `Red`, `Green`, etc.) plus a handful of hardcoded hex values in the Shell gradient, FlexButton chrome, LoginPad gradients, NavigationView tiles, OfficeTab chrome, and Outlook bar. Icons are PNG/GIF/ICO image files plus inline `Path` geometry for keyboard keys — **no icon font library** is used in the original.

---

## 1. Solution-wide Color Palette

### 1.1 Named WPF colors used (with hex equivalents)

| Named Color | Hex | Usage |
|-------------|-----|-------|
| `Gainsboro` | `#DCDCDC` | Default FlexButton background, Outlook bar background |
| `Silver` | `#C0C0C0` | Pressed-state background for many buttons, secondary borders |
| `WhiteSmoke` | `#F5F5F5` | Ticket list item backgrounds, panel backgrounds |
| `White` | `#FFFFFF` | Text on dark buttons, textbox backgrounds |
| `Black` | `#000000` | Default text color, button foreground on light backgrounds |
| `DarkGray` | `#A9A9A9` | Disabled text, secondary text |
| `Gray` | `#808080` | Pressed-state accent, separator lines |
| `LightGray` | `#D3D3D3` | Hover backgrounds |
| `Red` | `#FF0000` | Void / Cancel / Negative actions |
| `DarkRed` | `#8B0000` | Refund button background |
| `Green` | `#008000` | Confirm / OK actions |
| `DarkGreen` | `#006400` | Payment success indicator |
| `Purple` | `#800080` | Discount button |
| `MediumPurple` | `#9370DB` | Ticket total amount text |
| `RoyalBlue` | `#4169E1` | Automation command (Close Ticket) |
| `DarkBlue` | `#00008B` | Table occupied state, locked ticket text |
| `Yellow` | `#FFFF00` | Warning, highlighted item |
| `Gold` | `#FFD700` | Selected order highlight |
| `Orange` | `#FFA500` | Open ticket tile background |
| `OrangeRed` | `#FF4500` | Urgent / alert |
| `Crimson` | `#DC143C` | Error message |
| `IndianRed` | `#CD5C5C` | Table unavailable state |
| `LightGreen` | `#90EE90` | Available table state |
| `LightSkyBlue` | `#87CEFA` | Selected ticket entity background |
| `LightYellow` | `#FFFFE0` | Note input background |
| `LightCyan` | `#E0FFFF` | Ticket info panel |
| `Bisque` | `#FFE4C4` | Order line background when timer is active |
| `Transparent` | `rgba(0,0,0,0)` | Storyboard end-state for various animations |

### 1.2 Hardcoded hex colors (gradient / chrome definitions)

| Hex | Where | Purpose |
|-----|-------|---------|
| `#FF70B8FF` | `Shell.xaml` | Shell top gradient stop (light blue) |
| `#FF044392` | `Shell.xaml` | Shell bottom gradient stop (dark blue) |
| `#FF5CBBFF` | `Shell.xaml` | Shell mid gradient stop |
| `#2F000000` | `FlexButton.xaml` | Outer border shadow (alpha 0x2F) |
| `#4CFFFDFF` | `FlexButton.xaml` | Glow outer ring (alpha 0x4C) |
| `#99000000` | `FlexButton.xaml` | Inner shadow (alpha 0x99) |
| `#FF929CFC` | `FlexButton.xaml` | Glow inner color (light purple) |
| `#FFB9EFA9` | `LoginPadControl.xaml` | Login "Login" button top gradient (light green) |
| `#FF288D09` | `LoginPadControl.xaml` | Login "Login" button bottom gradient (dark green) |
| `#FFFBE0A3` | `LoginPadControl.xaml` | Login hover/secondary top gradient (light orange) |
| `#FFD24D00` | `LoginPadControl.xaml` | Login hover/secondary bottom gradient (dark orange) |
| `#397A7779` | `NavigationView.xaml` | Tile stroke 1 |
| `#59000000` | `NavigationView.xaml` | Tile shadow |
| `#270C0C41` | `NavigationView.xaml` | Tile stroke 2 |
| `#47969696` | `NavigationView.xaml` | Tile gradient top |
| `#6F111114` | `NavigationView.xaml` | Tile gradient bottom |
| `#BDF5F5F5` | `NavigationView.xaml` | Tile foreground |
| `#FFE9ECEF` | `OfficeTab.xaml` | Office tab background |
| `#FFA1B7EA` | `OfficeTab.xaml` | Office tab selected border |
| `#FFE5EEF9` | `OfficeTab.xaml` | Office tab selected background |
| `#FF0343A6` | `OfficeTab.xaml` | Office tab selected text |
| `#FF5FA3F6` | `OfficeTab.xaml` | Office tab hover gradient top |
| `#FF0C55B9` | `OfficeTab.xaml` | Office tab hover gradient bottom |
| `#FF3771C1` | `MainExpanderResources.xaml` | MainExpander header background |
| `#FF333333` | `NumberPadView.xaml` (inline Path) | Keyboard key glyph fill (Backspace/Shift) |

### 1.3 Semantic color mapping for the web clone

The web clone should map SambaPOS semantic actions to CSS custom properties:

```css
:root {
  /* === SambaPOS V3 — Semantic Palette === */
  --samba-bg-shell: linear-gradient(to bottom, #FF70B8FF 0%, #FF5CBBFF 50%, #FF044392 100%);
  --samba-bg-panel: #F5F5F5;          /* WhiteSmoke */
  --samba-bg-button-default: #DCDCDC; /* Gainsboro */
  --samba-bg-button-hover:    #D3D3D3;/* LightGray */
  --samba-bg-button-pressed:  #C0C0C0;/* Silver */
  --samba-bg-button-success:  #008000;/* Green */
  --samba-bg-button-danger:   #FF0000;/* Red */
  --samba-bg-button-warning:  #FFA500;/* Orange */
  --samba-bg-button-discount: #800080;/* Purple */
  --samba-bg-button-action:   #4169E1;/* RoyalBlue */
  --samba-bg-ticket-tile:     #FFA500;/* Orange (open ticket) */
  --samba-bg-table-available: #90EE90;/* LightGreen */
  --samba-bg-table-occupied:  #00008B;/* DarkBlue (with white text) */
  --samba-bg-table-selected:  #87CEFA;/* LightSkyBlue */
  --samba-bg-note:            #FFFFE0;/* LightYellow */
  --samba-bg-ticketinfo:      #E0FFFF;/* LightCyan */
  --samba-bg-timer-active:    #FFE4C4;/* Bisque */
  --samba-bg-selected-order:  #FFD700;/* Gold */

  --samba-fg-default:  #000000;       /* Black */
  --samba-fg-inverse:  #FFFFFF;       /* White */
  --samba-fg-disabled: #A9A9A9;       /* DarkGray */
  --samba-fg-amount:   #9370DB;       /* MediumPurple (ticket total) */
  --samba-fg-error:    #DC143C;       /* Crimson */

  --samba-border-default: #808080;    /* Gray */
  --samba-border-light:   #DCDCDC;    /* Gainsboro */

  --samba-shadow-glow: 0 0 8px rgba(146, 156, 252, 0.3);
  --samba-shadow-pressed: inset 0 1px 3px rgba(0,0,0,0.6);

  --samba-radius-button: 4px;
  --samba-radius-panel: 6px;
  --samba-radius-modal: 8px;

  --samba-anim-fast: 100ms ease;
  --samba-anim-normal: 200ms ease;
  --samba-anim-slow: 500ms ease;
}
```

---

## 2. Typography

| Element | Font Family | Size | Weight | Source |
|---------|-------------|------|--------|--------|
| Default body | Segoe UI (WPF default; fallback: Tahoma) | 14px (default) | Normal | everywhere |
| Shell clock | `Lucida Console` | 14px | Normal | `Shell.xaml` |
| Office tab items | `Calibri` | 8pt (≈11px) | Normal | `OfficeTab.xaml` |
| Office tab selected | `Calibri` | 8pt | Bold | `OfficeTab.xaml` |
| Outlook bar items | `Tahoma` | 9pt (≈12px) | Normal | `ManagementView.xaml` Outlook bar |
| Close-tab "X" button | `Courier` | 14px | Bold | `OfficeTab.xaml` |
| NavigationView tile caption | (WPF default) | 40 (FontSizeMode) | Bold | `NavigationView.xaml` |
| Account details name | (WPF default) | 35px | Bold | `AccountDetailsView.xaml` |
| Account details balance | (WPF default) | 35px | Bold | `AccountDetailsView.xaml` |
| FlexButton content | (inherited from parent) | per-button FontSize (default unset → 14px; PaymentType default 40; CalculationSelector default 30; AutomationCommand default 30) | Bold | `FlexButton.xaml` |
| OrderSelector item | (WPF default) | 16px | Normal | `OrderSelectorView.xaml` |
| TicketListView item | (WPF default) | 14px | Normal | `TicketListView.xaml` |
| Printout font | `Courier New` | 12px | Normal | `LocalSettings.PrintFontFamily` |

### Web-clone Tailwind config

```js
// tailwind.config.js
module.exports = {
  theme: {
    extend: {
      fontFamily: {
        samba: ['"Segoe UI"', 'Tahoma', 'system-ui', 'sans-serif'],
        samba_mono: ['"Courier New"', 'Consolas', 'monospace'],
        samba_clock: ['"Lucida Console"', 'monospace'],
        samba_calibri: ['Calibri', 'sans-serif'],
        samba_outlook: ['Tahoma', 'sans-serif'],
      },
      fontSize: {
        'samba-xs': '11px',
        'samba-sm': '12px',
        'samba-md': '14px',
        'samba-lg': '16px',
        'samba-xl': '20px',
        'samba-2xl': '24px',
        'samba-3xl': '30px',
        'samba-4xl': '35px',
        'samba-5xl': '40px',
      },
      colors: {
        samba: {
          default: '#DCDCDC', hover: '#D3D3D3', pressed: '#C0C0C0',
          success: '#008000', danger: '#FF0000', warning: '#FFA500',
          discount: '#800080', action: '#4169E1',
        },
        samba_shell_top: '#FF70B8FF',
        samba_shell_mid: '#FF5CBBFF',
        samba_shell_bot: '#FF044392',
      },
      borderRadius: {
        samba_btn: '4px',
        samba_panel: '6px',
        samba_modal: '8px',
      },
      boxShadow: {
        samba_glow: '0 0 8px rgba(146, 156, 252, 0.3)',
        samba_pressed: 'inset 0 1px 3px rgba(0,0,0,0.6)',
      },
    },
  },
};
```

---

## 3. Layout Dimensions

| Element | Width | Height | MinWidth | MinHeight | Margin | Padding | Source |
|---------|-------|--------|----------|-----------|--------|---------|--------|
| Shell window | 800 (min) | 600 (min) | 800 | 600 | 0 | 0 | `Shell.xaml` |
| Shell header | * | 50 | — | — | 0 | 5,0,0,5 | `Shell.xaml` |
| Shell footer | * | 30 | — | — | 0 | 0 | `Shell.xaml` |
| FlexButton default | Auto | 60 | 80 | 60 | 3 | 0 | `FlexButton.xaml` style |
| PosView command button | Auto | 65 | 80 | 65 | 0,0,3,3 | 0 | `PosView.xaml` |
| Open ticket tile | 180 | 90 | — | — | 0,0,5,5 | 0 | `PosView.xaml` |
| MenuItemSelector product button | Auto | 60 | 80 | 60 | 0,0,3,3 | 0 | `MenuItemSelectorView.xaml` |
| Ticket button (table) | Auto | 80 | 80 | 80 | 0,0,5,5 | 0 | `TicketButton.xaml` |
| Payment type button | Auto | 80 | 80 | 80 | 0,0,5,5 | 0 | `CommandButtonsView.xaml` |
| NumberPad key | 50 | 50 | 50 | 50 | 0,0,3,3 | 0 | `NumberPadView.xaml` |
| LoginPad key | 60 | 60 | 60 | 60 | 0,0,3,3 | 0 | `LoginPadControl.xaml` |
| TicketInfo label | * | 25 | — | — | 0,0,0,0 | 5 | `TicketInfoView.xaml` |
| OrderSelector item row | * | 28 | — | — | 0,0,0,0 | 0 | `OrderSelectorView.xaml` |
| Outlook bar item | 200 | 50 | — | — | 0,0,0,0 | 5,0,5,0 | `ManagementView.xaml` |
| NavigationView tile | 100 | 100 | — | — | 5 | 0 | `NavigationView.xaml` |
| Modal popup (default) | 400 | 250 | — | — | — | — | `PopupWindow.xaml` |
| Modal popup (elastic) | 400 | 0→150 (animated) | — | — | — | — | `PopupWindow.xaml` |
| Generic modal width (60% of screen) | 60% | Auto | — | — | — | — | common style |

### Touch-target rules (MANDATORY for web clone)

Per the user spec: `min-height: 60px` and `min-width: 80px`. This matches the WPF `FlexButton` style defaults. The `PaymentType` button is the largest at `Height=80` (with `FontSize=40`), since it's the most frequently-used touch target in the payment screen.

---

## 4. Screen-by-Screen Breakdown

### 4.1 Shell (root container)

**Source:** `Samba.Presentation/Shell.xaml` + `ShellViewModel.cs`

```
┌──────────────────────────────────────────────────────────┐
│ Shell header (50px)                                       │
│  ┌──────────────────┐  ┌─────────┐  ┌──────┐  ┌────────┐ │
│  │ Department label │  │ Clock   │  │ User │  │ Logout │ │
│  └──────────────────┘  └─────────┘  └──────┘  └────────┘ │
├──────────────────────────────────────────────────────────┤
│                                                          │
│   CONTENT REGION (PRISM region: "MainRegion")            │
│   - PosView, LoginView, ManagementView, etc. swap in here│
│                                                          │
├──────────────────────────────────────────────────────────┤
│ Shell footer (30px) — status: terminal name, version     │
└──────────────────────────────────────────────────────────┘
```

**Background:** Linear gradient `#FF70B8FF` → `#FF5CBBFF` → `#FF044392` (top to bottom).

**Web clone:** CSS Grid with three rows: `50px 1fr 30px`. Background as a `linear-gradient` on `body`.

### 4.2 PosView (ticket dashboard — the main screen)

**Source:** `Samba.Modules.PosModule/PosView.xaml` + `PosViewModel.cs`

```
┌─────────────────────────────────────────────────────────────────────┐
│ TicketInfo bar (25px) — Ticket Number, Date, Table, Customer, Total │
├─────────────────────────────────────────────────────────────────────┤
│ Open tickets row (90px tall tiles, horizontal wrap)                  │
│   ┌──────┐ ┌──────┐ ┌──────┐ ┌──────┐ ┌──────┐ ┌──────┐             │
│   │T-001 │ │T-002 │ │T-003 │ │T-004 │ │T-005 │ │  +   │             │
│   │$12.50│ │$ 8.00│ │$45.00│ │$ 2.50│ │$33.00│ │ New  │             │
│   └──────┘ └──────┘ └──────┘ └──────┘ └──────┘ └──────┘             │
├─────────────────────────────────────────────────────────────────────┤
│ Two-column main area:                                                │
│ ┌──────────────────────┬──────────────────────────────────────────┐ │
│ │ LEFT (60%):          │ RIGHT (40%):                              │ │
│ │ TicketOrdersView     │ MenuItemSelectorView                      │ │
│ │ (current ticket's    │ (product buttons in a Grid layout)        │ │
│ │  order list)         │                                           │ │
│ │                      │ ┌────┐┌────┐┌────┐┌────┐┌────┐           │ │
│ │ 2x Burger   $10.00   │ │Prod││Prod││Prod││Prod││Prod│           │ │
│ │ 1x Fries    $ 3.50   │ └────┘└────┘└────┘└────┘└────┘           │ │
│ │ 1x Soda     $ 1.50   │ ┌────┐┌────┐┌────┐┌────┐┌────┐           │ │
│ │ ───────────────────  │ │Prod││Prod││Prod││Prod││Prod│           │ │
│ │ Subtotal    $15.00   │ └────┘└────┘└────┘└────┘└────┘           │ │
│ │ Tax (10%)   $ 1.50   │ ┌────┐┌────┐┌────┐┌────┐┌────┐           │ │
│ │ Total       $16.50   │ │Prod││Prod││Prod││Prod││Prod│           │ │
│ │                      │ └────┘└────┘└────┘└────┘└────┘           │ │
│ │                      │ [Paging ◀ 1/3 ▶]                          │ │
│ └──────────────────────┴──────────────────────────────────────────┘ │
├─────────────────────────────────────────────────────────────────────┤
│ Automation commands bar (65px tall buttons, horizontal)             │
│  ┌────────┐ ┌────────┐ ┌────────┐ ┌────────┐ ┌────────┐ ┌────────┐ │
│  │  Gift  │ │  Void  │ │  Note  │ │  Tags  │ │ Discount│ │  Pay   │ │
│  └────────┘ └────────┘ └────────┘ └────────┘ └────────┘ └────────┘ │
└─────────────────────────────────────────────────────────────────────┘
```

**Layout in XAML:** A `Grid` with 4 rows: `Auto` (TicketInfo), `Auto` (open tickets), `*` (main area), `Auto` (command bar). The main area is itself a `Grid` with 2 columns: `60*` and `40*`.

**Web clone:** CSS Grid: `grid-template-rows: auto auto 1fr auto;` on the root. The main area is `display: grid; grid-template-columns: 60fr 40fr;`. The product button grid uses `grid-template-columns: repeat(5, 1fr); gap: 3px;`.

### 4.3 TicketView / TicketOrdersView

**Source:** `Samba.Modules.TicketModule/TicketView.xaml`, `TicketOrdersView.xaml`

Layout: A `DockPanel` with the `TicketInfoView` docked on top, the totals panel docked at the bottom, and the order list filling the middle. Each order row is a `TicketOrdersButton` (a `FlexButton` derivative) showing:
- Item name + portion name (left, left-aligned)
- Quantity × Price = Line total (right, right-aligned)
- Optional tag indicators (small icons)

States:
- **Normal:** `Gainsboro` background, black text.
- **Selected:** `Gold` background, black text, bold.
- **Locked (saved order):** `LightGray` background, `DarkGray` text.
- **Gift:** `Bisque` background, italic text, with `Gift` indicator.
- **Void:** `IndianRed` background, white text, strikethrough.

### 4.4 MenuItemSelectorView (product button grid)

**Source:** `Samba.Modules.PosModule/MenuItemSelectorView.xaml` + VM

```
┌────────────────────────────────────────────────────────────┐
│ Category tabs (top row, 45px tall)                          │
│ ┌──────┐┌──────┐┌──────┐┌──────┐┌──────┐                  │
│ │Burger││Pizza ││Drinks││Sides ││Dessert│ ...              │
│ └──────┘└──────┘└──────┘└──────┘└──────┘                  │
├────────────────────────────────────────────────────────────┤
│ Product grid (5 columns × 4 rows = 20 buttons per page)    │
│ ┌────┐┌────┐┌────┐┌────┐┌────┐                              │
│ │Item││Item││Item││Item││Item│  ← each button is 60px tall │
│ └────┘└────┘└────┘└────┘└────┘                              │
│ ┌────┐┌────┐┌────┐┌────┐┌────┐                              │
│ │Item││Item││Item││Item││Item│                              │
│ └────┘└────┘└────┘└────┘└────┘                              │
│ ...                                                          │
├────────────────────────────────────────────────────────────┤
│ Numeric pad / paging controls (45px tall)                   │
│ [<] [1] [2] [3] [4] [5] [6] [7] [8] [9] [0] [>]            │
└────────────────────────────────────────────────────────────┘
```

**Key detail:** The bottom numeric pad is used both for paging (1-9 jumps to page 1-9) and as a quantity multiplier (long-press on a product button = use the last-entered number as quantity). Each pad key is `50×50`.

**Paging logic:** `ScreenMenuCategory.PageCount` determines total pages. `GetScreenMenuItems(pageNo, tag)` returns the items for a given page. Buttons are populated dynamically.

### 4.5 PaymentEditorView (payment screen)

**Source:** `Samba.Modules.PaymentModule/PaymentEditorView.xaml` + `PaymentEditorViewModel.cs`

```
┌────────────────────────────────────────────────────────────┐
│ Ticket header (ticket number, total, remaining)             │
├────────────────────────────────────────────────────────────┤
│ ┌──────────────────────────┬───────────────────────────┐  │
│ │ LEFT (60%):              │ RIGHT (40%):              │  │
│ │ OrderSelectorView        │ NumberPadView             │  │
│ │ (list of orders,         │ ┌─────┬─────┬─────┐      │  │
│ │  select which to pay)    │ │  7  │  8  │  9  │      │  │
│ │                          │ ├─────┼─────┼─────┤      │  │
│ │ □ Burger    $5.00        │ │  4  │  5  │  6  │      │  │
│ │ □ Fries     $2.50        │ ├─────┼─────┼─────┤      │  │
│ │ □ Soda      $1.50        │ │  1  │  2  │  3  │      │  │
│ │                          │ ├─────┼─────┼─────┤      │  │
│ │                          │ │  ←  │  0  │  ⌫  │      │  │
│ │                          │ └─────┴─────┴─────┘      │  │
│ │                          │ Tendered: $0.00           │  │
│ │                          │ Remaining: $9.00          │  │
│ │                          │ Change: $0.00             │  │
│ ├──────────────────────────┼───────────────────────────┤  │
│ │ Tendered/Change display  │ Payment type buttons      │  │
│ │                          │ ┌──────┐┌──────┐┌──────┐  │  │
│ │                          │ │ Cash ││ Card ││Vouch.│  │  │
│ │                          │ └──────┘└──────┘└──────┘  │  │
│ │                          │ ┌──────┐┌──────┐┌──────┐  │  │
│ │                          │ │ Acc. ││ Cancel││Close│  │  │
│ │                          │ └──────┘└──────┘└──────┘  │  │
│ └──────────────────────────┴───────────────────────────┘  │
└────────────────────────────────────────────────────────────┘
```

**Payment type button color:** Each `PaymentType.ButtonColor` is configurable (default `'Gainsboro'`). When `null`, FlexButton auto-picks based on its own logic (currently `Gainsboro`).

**Change payment type picker modal:** When tendered > due AND multiple change templates exist, a modal (`PopupWindow`) appears with 150px height (animated from 0 with `ElasticEase`).

### 4.6 TableMapView / EntityDashboardView (table selection)

**Source:** `Samba.Modules.EntityModule/EntityDashboardView.xaml` + `EntitySelectorView.xaml`

**Important:** There is NO dedicated `TableMapView` in SambaPOS V3. Tables are `Entity` rows of `EntityType` "Tables". They are rendered as `TicketButton` controls inside an `EntitySelectorView`. The dashboard also supports widgets (clocks, ticket counts, etc.).

```
┌────────────────────────────────────────────────────────────┐
│ Search bar (200px tall)                                     │
│ [Search...] [Clear]                                         │
├────────────────────────────────────────────────────────────┤
│ Page navigation (1/3)                                       │
├────────────────────────────────────────────────────────────┤
│ Grid of tables (7 columns × 5 rows = 35 per page)          │
│ ┌────┐┌────┐┌────┐┌────┐┌────┐┌────┐┌────┐                │
│ │ T1 ││ T2 ││ T3 ││ T4 ││ T5 ││ T6 ││ T7 │                │
│ │Avail││Occ.││Occ.││Avail││Bill││Occ.││Avail│             │
│ └────┘└────┘└────┘└────┘└────┘└────┘└────┘                │
│ ┌────┐┌────┐┌────┐┌────┐┌────┐┌────┐┌────┐                │
│ │ T8 ││ T9 ││T10 ││T11 ││T12 ││T13 ││T14 │                │
│ └────┘└────┘└────┘└────┘└────┘└────┘└────┘                │
│ ...                                                          │
└────────────────────────────────────────────────────────────┘
```

**Table states and colors:**
| State | Background | Foreground | Source |
|-------|------------|------------|--------|
| Available | `LightGreen` (#90EE90) | Black | `EntityStateValue` JSON `Status=Available` |
| Occupied (New Orders) | `DarkBlue` (#00008B) | White | `Status=New Orders` |
| Bill Requested | `Orange` (#FFA500) | Black | `Status=Bill Requested` |
| Selected | `LightSkyBlue` (#87CEFA) | Black | UI selection state |
| Locked | `Gray` (#808080) | White | `Status=Locked` |

**Web clone:** CSS Grid with `grid-template-columns: repeat(7, 1fr); gap: 5px;`. Each tile is `min-height: 80px;`. State colors via CSS classes (`.tile--available`, `.tile--occupied`, `.tile--bill-requested`, etc.).

### 4.7 LoginView + LoginPadControl

**Source:** `Samba.Modules.LoginModule/LoginView.xaml` + `LoginPadControl.xaml`

```
┌────────────────────────────────────────────┐
│ Username textbox                            │
│ Password masked textbox (shows ●●●●)        │
│                                             │
│ Login keypad (3×4 grid, 60×60 keys):        │
│ ┌────┬────┬────┐                            │
│ │ 1  │ 2  │ 3  │                            │
│ ├────┼────┼────┤                            │
│ │ 4  │ 5  │ 6  │                            │
│ ├────┼────┼────┤                            │
│ │ 7  │ 8  │ 9  │                            │
│ ├────┼────┼────┤                            │
│ │ ⌫  │ 0  │ ✓  │   ← "Login" button has    │
│ └────┴────┴────┘      green gradient        │
│                       #FFB9EFA9→#FF288D09   │
└────────────────────────────────────────────┘
```

### 4.8 NavigationView (outlook-style menu)

**Source:** `Samba.Modules.NavigationModule/NavigationView.xaml`

```
┌────┐┌────┐┌────┐┌────┐┌────┐
│POS ││Mgr ││Repo││Set ││Task│  ← tile size 100×100
└────┘└────┘└────┘└────┘└────┘
```

Each tile has a chrome gradient (`#47969696` → `#6F111114`), foreground `#BDF5F5F5`, and caption font size 40.

### 4.9 NumberPadView (the reusable calc keypad)

**Source:** `Samba.Presentation.Controls/NumberPad.xaml`

Used in: PaymentEditorView (tendered amount), MenuItemSelectorView (page selection / quantity), TicketTagEditorView (numeric value).

Layout: 4 rows × 3 cols of `50×50` buttons. Default content: `7 8 9 / 4 5 6 / 1 2 3 / ← 0 ⌫`. The bottom-left button is `Backspace` (icon: inline `Path` filled `#FF333333`).

### 4.10 OrderTagGroupEditorView (modifier selector)

**Source:** `Samba.Modules.ModifierModule/OrderTagGroupEditorView.xaml`

Layout: A grid of tag buttons. Group title is at top. Each tag button is `60×60` with its own `ButtonColor` (default `Gainsboro`). Selected tags show a checkmark. If `MaxSelectedItems=1`, selecting a new tag deselects the previous one in the same group.

### 4.11 TicketNoteEditorView

**Source:** `Samba.Modules.TicketModule/TicketNoteEditorView.xaml`

Layout: A modal dialog with:
- `TextBox` (multiline, 4 rows, background `LightYellow`) — the note text.
- "OK" button (green) and "Cancel" button (red), each 65px tall.

### 4.12 TicketTagEditorView / TicketTagListView

**Source:** `Samba.Modules.TicketModule/TicketTagEditorView.xaml`, `TicketTagListView.xaml`

Used for selecting ticket-level tags (Dine-in/Takeaway, etc.). Layout is similar to OrderTagGroupEditorView but full-screen. Each `TicketTagGroup` shows its own selector row.

### 4.13 AccountDetailsView

**Source:** `Samba.Modules.AccountModule/AccountDetailsView.xaml`

Layout: Customer name (35px bold) at top, account balance (35px bold, color = sign of balance: green for positive, red for negative), and a list of recent transactions.

### 4.14 Other priority screens (not as separate XAML files)

The user spec mentioned several "screens" that **do not exist as separate XAML files in V3**. Their functionality is implemented elsewhere:

| User-requested screen | Where it actually lives |
|-----------------------|-------------------------|
| `TableMap` / `TableSelectorView` | `EntityScreen` rendered by `EntityDashboardView` + `EntitySelectorView` |
| `NumericPadView` | `NumberPadView` (Payment) + inline 4×3 pad in `MenuItemSelectorView` |
| `TicketTagView` | Split: `TicketTagEditorView` (ModifierModule) + `TicketTagListView` (PosModule) |
| `DashboardView` | `EntityDashboardView` |
| `SettlementView` | `ChangePaymentTypeView` / `PaymentTypeView` |
| `VoidItemsView` | `CancelItemCommand` + `OrderTagGroupEditorView` "Toggle Remove Mode" |
| `DiscountView` | `CalculationSelectorView` / `CalculationTypeView` |
| `AutomationView` | AutomationModule views (`RuleViewModel`, `ActionViewModel`, etc.) |

---

## 5. Icon Mapping (Original → Font Awesome 6 Free)

SambaPOS V3 uses **PNG/GIF/ICO image files** for icons plus inline `Path` geometry for keyboard keys. The web clone should replace these with **Font Awesome 6 Free** glyphs.

| Button / Element | Original (image / path) | Suggested FA6 Free | FA6 Class |
|------------------|------------------------|---------------------|-----------|
| Add ticket / New ticket | (text "+ New") | Plus | `fa-solid fa-plus` |
| Add order / Add item | (text or product button) | Cart-plus | `fa-solid fa-cart-plus` |
| Pay / Payment | (text "Pago" in Spanish; "Pay" in EN) | Money-bill-wave | `fa-solid fa-money-bill-wave` |
| Cash payment | (text) | Money-bill | `fa-solid fa-money-bill` |
| Credit card payment | (text) | Credit-card | `fa-solid fa-credit-card` |
| Voucher payment | (text) | Ticket | `fa-solid fa-ticket` |
| Customer account payment | (text) | User | `fa-solid fa-user` |
| Print bill | (text) | Print | `fa-solid fa-print` |
| Print kitchen order | (text) | Utensils | `fa-solid fa-utensils` |
| Gift order | (text) | Gift | `fa-solid fa-gift` |
| Void order | (text) | Ban | `fa-solid fa-ban` |
| Cancel / Delete | (text) | Xmark | `fa-solid fa-xmark` |
| Note | (text) | Sticky-note | `fa-solid fa-note-sticky` |
| Tags | (text) | Tags | `fa-solid fa-tags` |
| Discount | (text "%") | Percent | `fa-solid fa-percent` |
| Round | (text) | Arrow-up-arrow-down | `fa-solid fa-arrow-up-arrow-down` |
| Table / chair | (text or table tile) | Chair | `fa-solid fa-chair` |
| Customer | (text) | User-tie | `fa-solid fa-user-tie` |
| Search | `search.png` | Magnifying-glass | `fa-solid fa-magnifying-glass` |
| Clear | `clear.png` | Eraser | `fa-solid fa-eraser` |
| Warning | `warning.png` | Triangle-exclamation | `fa-solid fa-triangle-exclamation` |
| Logout | (text) | Right-from-bracket | `fa-solid fa-right-from-bracket` |
| Login | (text "Login" with green button) | Right-to-bracket | `fa-solid fa-right-to-bracket` |
| Backspace (numberpad) | inline Path `#FF333333` | Delete-left | `fa-solid fa-delete-left` |
| Shift (keyboard) | inline Path | Arrow-up | `fa-solid fa-arrow-up` |
| Settings | (text) | Gear | `fa-solid fa-gear` |
| Reports | (text) | Chart-bar | `fa-solid fa-chart-bar` |
| Management | (text) | Screwdriver-wrench | `fa-solid fa-screwdriver-wrench` |
| Tasks | (text) | List-check | `fa-solid fa-list-check` |
| Lock ticket | (text) | Lock | `fa-solid fa-lock` |
| Unlock ticket | (text) | Lock-open | `fa-solid fa-lock-open` |
| Move order | (text) | Arrows-left-right | `fa-solid fa-arrows-left-right` |
| Split ticket | (text) | Scissors / Columns | `fa-solid fa-columns` or `fa-solid fa-scissors` |
| Add quantity (+) | (text "+") | Plus | `fa-solid fa-plus` |
| Subtract quantity (−) | (text "−") | Minus | `fa-solid fa-minus` |
| Refresh | (text) | Arrows-rotate | `fa-solid fa-arrows-rotate` |
| Save | (text) | Floppy-disk | `fa-solid fa-floppy-disk` |
| Edit | (text) | Pen | `fa-solid fa-pen` |
| View ticket list | (text) | List | `fa-solid fa-list` |
| Open cash drawer | (automation action) | Cash-register | `fa-solid fa-cash-register` |
| Close ticket | (text) | Circle-check | `fa-solid fa-circle-check` |
| Settlement | (text) | Hand-holding-dollar | `fa-solid fa-hand-holding-dollar` |
| Refund | (text) | Rotate-left | `fa-solid fa-rotate-left` |
| Quantity selector | (numeric pad) | Calculator | `fa-solid fa-calculator` |

**Font Awesome 6 Free CDN:**
```html
<link rel="stylesheet" href="https://cdnjs.cloudflare.com/ajax/libs/font-awesome/6.5.1/css/all.min.css">
```

---

## 6. Style / Resource Catalog

### 6.1 Resource dictionaries (XAML)

| File | Contents |
|------|----------|
| `Samba.Presentation/Common.xaml` | Merges `MainExpanderResources.xaml` + `Samba.Presentation.Controls/Generic.xaml` |
| `Samba.Presentation.Common/MainExpanderResources.xaml` | `MainExpander` style (`Background=#FF3771C1`), HeaderStyle, expander toggle |
| `Samba.Presentation.Controls/Generic.xaml` | `FlexButton` default style (target type `controls:FlexButton`), `BorderlessTabControlStyle`, `TicketButton` style, `NumberPad` style |
| `Samba.Presentation.Controls/OfficeTab.xaml` | Office-style tab control template (`#FFE9ECEF`, `#FFA1B7EA`, `#FFE5EEF9`, `#FF0343A6`, `#FF5FA3F6→#FF0C55B9`) |
| `Samba.Modules.ManagementModule/Resources.xaml` | Outlook bar gradient styles |

### 6.2 FlexButton behavior (critical for web clone)

`FlexButton` is the **workhorse** of the UI — every POS, Payment, Ticket, Modifier button is a `FlexButton`. Its key behaviors:

1. **Auto-contrast foreground:** If `ButtonColor` is dark (luminance < threshold), `Foreground` becomes `White`; otherwise `Black`. The web clone must replicate this in CSS or JS:
   ```javascript
   function pickForegroundColor(bgHex) {
     const c = bgHex.replace('#', '');
     const r = parseInt(c.substr(0,2), 16);
     const g = parseInt(c.substr(2,2), 16);
     const b = parseInt(c.substr(4,2), 16);
     const luma = 0.2126*r + 0.7152*g + 0.0722*b;
     return luma < 128 ? '#FFFFFF' : '#000000';
   }
   ```
2. **Outer border Lerp:** `OuterBorderBrush` = Lerp from `ButtonColor` toward `Black` by some factor (~30%). The web clone should use `filter: brightness(0.7)` or a `box-shadow: 0 0 0 1px <darkened>;`.
3. **Hover glow:** A radial gradient overlay animates Opacity from 0 → 0.5 (`#FF929CFC` glow color).
4. **Press feedback:** On IsPressed, the outer border opacity goes to 0.9, the content grid shifts 1px down/right, glow opacity goes to 0.5, and the background flashes `Gray` for 100ms.
5. **Default CornerRadius:** 4 (style) overriding the constructor default of 3.
6. **Default FontWeight:** Bold.

### 6.3 CSS implementation of FlexButton

```css
.samba-button {
  display: inline-flex;
  align-items: center;
  justify-content: center;
  gap: 8px;
  min-height: 60px;
  min-width: 80px;
  padding: 0 12px;
  margin: 0 3px 3px 0;
  border-radius: 4px;
  border: 1px solid;
  font-weight: bold;
  font-family: 'Segoe UI', Tahoma, sans-serif;
  cursor: pointer;
  user-select: none;
  transition: background 100ms ease, transform 100ms ease, box-shadow 100ms ease;
  background: var(--samba-bg-button-default);
  color: var(--samba-fg-default);
  /* Auto-contrast border: */
  border-color: color-mix(in srgb, var(--samba-bg-button-default) 70%, black);
}
.samba-button:hover {
  box-shadow: var(--samba-shadow-glow);
  background: var(--samba-bg-button-hover);
}
.samba-button:active {
  transform: translate(1px, 1px);
  box-shadow: var(--samba-shadow-pressed);
  background: var(--samba-bg-button-pressed);
}
/* Auto-foreground via prefers-contrast isn't reliable; use a JS helper or per-variant classes */
.samba-button--dark { color: #FFFFFF; }
.samba-button--light { color: #000000; }
/* Variants */
.samba-button--success { background: var(--samba-bg-button-success); color: #FFFFFF; }
.samba-button--danger  { background: var(--samba-bg-button-danger);  color: #FFFFFF; }
.samba-button--warning { background: var(--samba-bg-button-warning); color: #000000; }
.samba-button--discount{ background: var(--samba-bg-button-discount);color: #FFFFFF; }
.samba-button--action  { background: var(--samba-bg-button-action);  color: #FFFFFF; }
```

---

## 7. Touch-Friendly Properties & Animations

### 7.1 Minimum touch target sizes (already in WPF)

| Element | MinHeight | MinWidth |
|---------|-----------|----------|
| FlexButton (default) | 60 | 80 |
| PosView command button | 65 | 80 |
| Open ticket tile | 90 | 180 |
| MenuItemSelector product button | 60 | 80 |
| TicketButton (table) | 80 | 80 |
| PaymentType button | 80 | 80 |
| NumberPad key | 50 | 50 |
| LoginPad key | 60 | 60 |
| Outlook bar item | 50 | 200 |
| NavigationView tile | 100 | 100 |

### 7.2 Kinetic scrolling

`KineticBehaviour.HandleKineticScrolling` is attached to every scrollable list (`OrderSelectorView`, `TicketListView`, `MenuItemSelectorView`, `EntitySelectorView`). It enables touch-friendly momentum scrolling on touch devices.

**Web clone:** Use native CSS `-webkit-overflow-scrolling: touch; overflow-y: auto;` on touch devices. Modern browsers handle kinetic scrolling automatically.

### 7.3 Press feedback animations (per-screen Storyboards)

| Screen | Trigger | Animation | Duration |
|--------|---------|-----------|----------|
| TicketListView | Item click | `Silver` → `Gainsboro` background | 0.2s |
| OrderSelectorView | Item click | `Silver` → `Transparent` | 0.5s |
| TicketListerControl | Item click | Opacity 0.2 → 1 | 0.2s |
| PopupWindow | Open | Height 0 → 150 with `ElasticEase` | ~0.5s |
| FlexButton (everywhere) | Pressed | Border opacity 0 → 0.9, content shift 1px, glow opacity 0 → 0.5, bg → Gray | 100ms |

**Web clone:** Replicate as CSS transitions/keyframes. The `ElasticEase` for popups can be approximated with `cubic-bezier(0.68, -0.55, 0.265, 1.55)`.

---

## 8. Reference Screenshots (textual descriptions)

Since I cannot embed actual screenshots, here are textual descriptions of what each major screen looks like at default seed:

### 8.1 Default login screen
- Centered modal dialog (400×250) with light gray gradient background.
- Title bar "SambaPOS 3 — Login" (blue gradient).
- Username textbox (default empty).
- Password textbox (masked dots).
- 4×3 numeric keypad (60×60 keys) below.
- "Login" button at bottom-right with green gradient (`#FFB9EFA9` → `#FF288D09`).
- Background: blurred Shell gradient.

### 8.2 Default POS screen after login (Restaurant department, empty ticket)
- Shell header: "Restaurant" label, clock (Lucida Console, 14px), "Administrator" user, "Logout" button.
- TicketInfo bar: "Ticket Number: (none)" | "Date: 2024-..." | "Table: (none)" | "Total: $0.00".
- Open tickets row: empty (no open tickets yet).
- Main area left (TicketOrdersView): empty list, "No orders" placeholder.
- Main area right (MenuItemSelectorView): first category tab "Burgers" selected, 5×4 grid of burger product buttons.
- Command bar: "Gift" (purple), "Void" (red), "Note" (gray), "Tags" (gray), "Discount %" (purple), "Round" (gray), "Print Bill" (gray), "Pay" (orange) — buttons are 65px tall.

### 8.3 Default table map (after opening Entity module)
- Background: WhiteSmoke (`#F5F5F5`).
- Title: "All Tables" (top, 25px).
- Search bar: empty, with magnifying glass icon.
- 7×5 grid of table tiles. Default seed creates ~10 tables. Tiles 1-10 show table names "T1" through "T10" with green "Available" background. Tiles 11-35 are empty.
- Page indicator: "Page 1 of 1".

---

**End of UI_SPECS_FOR_WEB.md** — source for `/samba-web-clone/analysis/UI_SPECS_FOR_WEB.md`.
