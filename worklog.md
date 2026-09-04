# SambaPOS V3 — Forensic UI Analysis Worklog

## Task ID: 0-C — Forensic UI Analysis of every XAML file

Scope: `Samba.Presentation/`, `Samba.Presentation.Common/`,
`Samba.Presentation.Controls/`, `Samba.Presentation.ViewModels/`,
and every `Samba.Modules.*/` directory under
`/home/z/my-project/samba-web-clone/source/`.

115 XAML files were located and the priority screens were read in full.
The analysis below is grouped into the seven requested sections.

---

### Section 1 — Solution-wide Color Palette

| Color Hex | Usage | Semantic Name | Source File:Line |
|-----------|-------|---------------|-------------------|
| `#FF70B8FF` | Shell background gradient stop 0 | ShellBg-Top | `Samba.Presentation/Shell.xaml:9` |
| `#FF5CBBFF` | Shell background gradient stop 0.992 | ShellBg-Bottom | `Samba.Presentation/Shell.xaml:10` |
| `#FF044392` | Shell background gradient stop 0.085 (deep blue band) | ShellBg-Mid | `Samba.Presentation/Shell.xaml:11` |
| `White` | Shell header text ("SambaPOS 3") | HeaderText | `Samba.Presentation/Shell.xaml:29` |
| `LightGray` | Shell footer bar background | FooterBarBg | `Samba.Presentation/Shell.xaml:41` |
| `DarkGray` | Ticket title label background | TicketTitleBg | `Samba.Modules.PosModule/TicketView.xaml:23` |
| `WhiteSmoke` | Ticket title foreground | TicketTitleFg | `Samba.Modules.PosModule/TicketView.xaml:23` |
| `Red` | Cancel / Close / Balance due / Workperiod warning | DangerBrush | `Samba.Modules.PosModule/TicketTotalsView.xaml:92`; `Samba.Presentation/WorkPeriodStatusView.xaml:7`; many `ButtonColor="Red"` |
| `Green` | Payment quick-value buttons (1, 5, 10, 20, 50, 100) | MoneyQuickButton | `Samba.Modules.PaymentModule/NumberPadView.xaml:18` |
| `Purple` | Tender All / Change balance mode buttons | ActionPrimary | `Samba.Modules.PaymentModule/NumberPadView.xaml:82,90` |
| `MediumPurple` | Last tendered amount button | ActionSecondary | `Samba.Modules.PaymentModule/NumberPadView.xaml:93` |
| `RoyalBlue` | Divide value (1/2, 1/3, 1/n) buttons | DivideBrush | `Samba.Modules.PaymentModule/NumberPadView.xaml:84,86,88` |
| `Black` | Clear (`C`) button on number pad | ClearBrush | `Samba.Modules.PaymentModule/NumberPadView.xaml:79` |
| `Silver` | Open-ticket list buttons; ListView background | NeutralBg | `Samba.Modules.PosModule/OpenTicketsView.xaml:23`; `Samba.Modules.EntityModule/EntitySearchView.xaml:36` |
| `Gainsboro` | Default FlexButton background; keyboard border | DefaultButtonBg | `Lib/FlexButton/FlexButton.cs:176`; `Samba.Presentation.Controls/VirtualKeyboard/KeyboardView3.xaml:50` |
| `Gray` | Group label foreground; pressed keyboard background | MutedText | `Samba.Modules.PosModule/TicketOrdersView.xaml:43,45`; `KeyboardView3.xaml:42` |
| `DarkGreen` | Service / Payment line items foreground | ServiceMoney | `Samba.Modules.PosModule/TicketTotalsView.xaml:31,33` |
| `DarkBlue` | Order-tag value text | TagText | `Samba.Modules.PosModule/TicketOrdersView.xaml:105,107` |
| `WhiteSmoke` | Foreground on RoyalBlue divide buttons | OnBlueText | `Samba.Modules.PaymentModule/NumberPadView.xaml:85,87,89` |
| `#FF3771C1` | MainExpander header background | ExpanderHeaderBg | `Samba.Presentation/Themes/MainExpanderResources.xaml:8` |
| `#FF929CFC` | FlexButton glow color (default) | ButtonGlow | `Lib/FlexButton/Themes/resXSButtonStyles.xaml:9` |
| `#2F000000` | FlexButton clear-glass background (semi-transparent) | ClearGlass | `Lib/FlexButton/Themes/resXSButtonStyles.xaml:6` |
| `#4CFFFDFF` | FlexButton outer border brush | OuterBorder | `Lib/FlexButton/Themes/resXSButtonStyles.xaml:7` |
| `#99000000` | FlexButton inner border brush | InnerBorder | `Lib/FlexButton/Themes/resXSButtonStyles.xaml:8` |
| `#FFB9EFA9` | GreenButtonStyle normal top gradient stop | GreenBtn-Top | `Samba.Modules.LoginModule/LoginPadControl.xaml:18` |
| `#FF288D09` | GreenButtonStyle normal bottom gradient stop | GreenBtn-Bottom | `Samba.Modules.LoginModule/LoginPadControl.xaml:19` |
| `#B7707070` | Login button normal border | LoginBtn-Border | `Samba.Modules.LoginModule/LoginPadControl.xaml:21` |
| `#FFFBE0A3` | Submit (Login) button gradient top | SubmitBtn-Top | `Samba.Modules.LoginModule/LoginPadControl.xaml:90` |
| `#FFD24D00` | Submit (Login) button gradient bottom | SubmitBtn-Bottom | `Samba.Modules.LoginModule/LoginPadControl.xaml:91` |
| `#ADADAD` | Login button disabled foreground | DisabledFg | `Samba.Modules.LoginModule/LoginPadControl.xaml:75,144` |
| `#397A7779` | NavigationView panel background (translucent gray) | NavPanelBg | `Samba.Modules.NavigationModule/NavigationView.xaml:18` |
| `#59000000` | NavigationView panel border | NavPanelBorder | `Samba.Modules.NavigationModule/NavigationView.xaml:18` |
| `#270C0C41` | NavigationView tile border | NavTileBorder | `Samba.Modules.NavigationModule/NavigationView.xaml:37` |
| `#47969696` / `#6F111114` | NavigationView tile gradient stops | NavTileGrad | `Samba.Modules.NavigationModule/NavigationView.xaml:41,42` |
| `#69D1D1D1` / `#FFBABABA` | NavigationView inner-border gradient stops | NavTileInnerBorder | `Samba.Modules.NavigationModule/NavigationView.xaml:48,49` |
| `#BDF5F5F5` | NavigationView caption text (translucent white) | NavCaption | `Samba.Modules.NavigationModule/NavigationView.xaml:60` |
| `#FFE9ECEF` | OfficeTab left-column background | OfficeTabBg | `Samba.Presentation.Controls/OfficeTab.xaml:122` |
| `#FFA1B7EA` | OfficeTab hover border | OfficeTabHoverBorder | `Samba.Presentation.Controls/OfficeTab.xaml:71` |
| `#FFE5EEF9` | OfficeTab hover background | OfficeTabHoverBg | `Samba.Presentation.Controls/OfficeTab.xaml:73` |
| `#FF0343A6` | OfficeTab selected border | OfficeTabSelBorder | `Samba.Presentation.Controls/OfficeTab.xaml:83` |
| `#FF5FA3F6` / `#FF0C55B9` | OfficeTab selected fill gradient | OfficeTabSelFill | `Samba.Presentation.Controls/OfficeTab.xaml:94,95` |
| `#FFA4B97F` | Rule view expander border | RuleExpanderBorder | `Samba.Modules.AutomationModule/RuleView.xaml` (commented/inline trigger) |
| `#8C8E94` | TabControl normal border brush | TabBorder | `Samba.Presentation.Controls/Generic.xaml:21` |
| `#FF9097A3` / `#FF444D5B` | IPhoneSteelBackground gradient | SteelGradient | `Samba.Presentation/Common.xaml:104,105` |
| `#FFABADB3` etc. | SearchTextBox border gradient stops | SearchBox-Border | `Samba.Presentation.Controls/Generic.xaml:142-149` |
| `#FF5C97C1` / `#FFB9D7EB` etc. | SearchTextBox hover gradient stops | SearchBox-Hover | `Samba.Presentation.Controls/Generic.xaml:147-149` |
| `#888` | Disabled foreground brush (QuickNumerator) | DisabledFg | `Samba.Modules.PosModule/MenuItemSelectorView.xaml:100` |
| `LightSteelBlue` | Login pad border (350×400 panel) | LoginPanelBorder | `Samba.Modules.LoginModule/LoginView.xaml:27` |
| `LightSlateGray` | `BlueBackground` GridViewColumnHeader bg | GridHeader-Blue | `Samba.Presentation.Controls/Generic.xaml:77` |
| `LightGoldenrodYellow` | Ticket-explorer row-details background | RowDetailBg | `Samba.Modules.TicketModule/TicketExplorerView.xaml:87` |
| `DarkSlateGray` | SplashScreen background | SplashBg | `Samba.Presentation.Controls/Interaction/SplashScreenForm.xaml:9` |
| `DarkBlue` | KeyboardWindow title bar | KeyboardTitleBg | `Samba.Presentation.Controls/Interaction/KeyboardWindow.xaml:19` |
| `#AADDDDEE` | KeyboardWindow body translucent fill | KeyboardBodyBg | `Samba.Presentation.Controls/Interaction/KeyboardWindow.xaml:12` |
| `#FF333333` | Path icon fill on Backspace/Shift keys | KeyboardIconFill | `Samba.Presentation.Controls/VirtualKeyboard/KeyboardView.xaml:33,63,77`; `KeyboardView3.xaml:87,164` |
| `#FFFFFFFF` | PopupWindow border bottom gradient | PopupBottomGrad | `Samba.Presentation.Controls/Interaction/PopupWindow.xaml:28` |
| `#FFD24D00` (reused as `#FFE8A7` family) | Outlook tab button group gradients | OutlookBtn-Gradients | `Samba.Modules.ManagementModule/Resources.xaml:81-108` |
| `#15428B` | Outlook caption foreground | OutlookCaptionFg | `Samba.Modules.ManagementModule/Resources.xaml:79` |
| `#6593CF` | Outlook border | OutlookBorder | `Samba.Modules.ManagementModule/Resources.xaml:80` |

> Notes:
> - **There is no Material Design Icons nor FontAwesome usage anywhere in the codebase.** Icons are loaded from PNG/GIF/ICO image files (e.g. `Images/103.png`, `Images/LanShutDown.icon.gif`, `apple-icon.png`, `logo.png`, `Wallpaper3.jpg`) and from inline `Path` geometry (backspace/shift keys on virtual keyboards). The `ButtonImage` property on `FlexButton` is data-bound to a per-menu-item `ImagePath`.
> - The `Shell.xaml` main window is the only place that uses a deep blue gradient; everything else uses solid named colors (Silver, Gainsboro, WhiteSmoke, DarkGray, Red, Green, etc.) and a few specific hex values around Login/Navigation/OfficeTab/FlexButton chrome.

---

### Section 2 — Typography

| Element Type | Font Family | Size | Weight | Source |
|--------------|-------------|------|--------|--------|
| Shell title "SambaPOS 3" | default (Segoe UI on Win) | 24 | Bold | `Samba.Presentation/Shell.xaml:29` |
| Shell time label "SAAT" | Lucida Console | 18 | normal | `Samba.Presentation/Shell.xaml:31` |
| Shell footer buttons (auto-style) | default | 16 | normal | `Samba.Presentation/Shell.xaml:44` |
| Ticket title (Label) | default | 18 | Bold | `Samba.Modules.PosModule/TicketView.xaml:23` |
| Ticket-order row (Quantity/Desc/Price) | default | 21 | bound (`{Binding FontWeight}`) | `Samba.Modules.PosModule/TicketOrdersView.xaml:76,80,88` |
| Ticket-order PriceTag (small label) | default | 12 | normal | `Samba.Modules.PosModule/TicketOrdersView.xaml:84` |
| Ticket-order state line | default | 12 | normal | `Samba.Modules.PosModule/TicketOrdersView.xaml:92` |
| Ticket-order timer line | default | 14 | Bold | `Samba.Modules.PosModule/TicketOrdersView.xaml:95` |
| Ticket-order OrderTagValue lines | default | 14 | Bold | `Samba.Modules.PosModule/TicketOrdersView.xaml:105,107` |
| Ticket totals row labels | default | 18 | normal (auto-style) | `Samba.Modules.PosModule/TicketTotalsView.xaml:13` |
| Service line items (pre/post services) | default | 16 | normal | `Samba.Modules.PosModule/TicketTotalsView.xaml:31,33` |
| Balance due (red) | default | 22 | Bold | `Samba.Modules.PosModule/TicketTotalsView.xaml:92,94` |
| FlexButton (default style) | default | (inherited) | Bold | `Lib/FlexButton/Themes/resXSButton.xaml:35` |
| FlexButton inside TicketView command column | default | 18 | Bold | `Samba.Modules.PosModule/TicketView.xaml:79` |
| Under-ticket automation FlexButtons | default | `{Binding FontSize}` (data-driven) | Bold | `Samba.Modules.PosModule/TicketView.xaml:47,64` |
| Number-pad numerator TextBox | default | 30 | Bold | `Samba.Modules.PosModule/MenuItemSelectorView.xaml:207` |
| Numeric pad buttons 1..9, C | default | inherited (Bold via FlexButton) | Bold | `Samba.Modules.PosModule/MenuItemSelectorView.xaml:212-235` |
| Payment `TenderedValueView` Labels | default | 28 | normal | `Samba.Modules.PaymentModule/TenderedValueView.xaml:10,13` |
| Payment `TenderedValueView` TextBox | default | 30 | Bold | `Samba.Modules.PaymentModule/TenderedValueView.xaml:11,14` |
| Payment `PaymentTotalsView` rows | default | 16 | normal (auto-style) | `Samba.Modules.PaymentModule/PaymentTotalsView.xaml:11` |
| Payment `PaymentTotalsView` service lines | default | 14 | normal | `Samba.Modules.PaymentModule/PaymentTotalsView.xaml:45,47` |
| Payment `PaymentTotalsView` Balance | default | 20 | Bold | `Samba.Modules.PaymentModule/PaymentTotalsView.xaml:119,121` |
| Login pad PIN TextBox | default | 32 | Bold | `Samba.Modules.LoginModule/LoginPadControl.xaml:169` |
| Login pad GreenButtonStyle | default | 24 | Bold | `Samba.Modules.LoginModule/LoginPadControl.xaml:81-82` |
| Login pad SubmitButtonStyle | default | 24 | Bold | `Samba.Modules.LoginModule/LoginPadControl.xaml:150-151` |
| Login "Exit" button | default | 18 | Bold | `Samba.Modules.LoginModule/LoginView.xaml:32-33` |
| Login hint text | default | 14 | normal | `Samba.Modules.LoginModule/LoginView.xaml:30` |
| Login AppLabel (bottom-left) | default | 30 | Black | `Samba.Modules.LoginModule/LoginView.xaml:18` |
| NavigationView tile caption | default | 40 | Bold | `Samba.Modules.NavigationModule/NavigationView.xaml:60` |
| OfficeTab TabItem text | Calibri | 12pt | normal | `Samba.Presentation.Controls/OfficeTab.xaml:104-105` |
| Outlook-tab caption (Management) | Tahoma | 18 | Bold | `Samba.Modules.ManagementModule/Resources.xaml:168-172` |
| Outlook-tab TabItem text | Tahoma | 8pt | Bold | `Samba.Modules.ManagementModule/Resources.xaml:154` |
| Management command links (Hyperlinks) | default | 14 | normal | `Samba.Modules.ManagementModule/Resources.xaml:183` |
| Splash window — none | — | — | — | no text |
| KeyboardWindow title | default | 15 | Bold | `Samba.Presentation.Controls/Interaction/KeyboardWindow.xaml:26` |
| KeyboardWindow X / ▄ buttons | default | (inherited) | Bold | `Samba.Presentation.Controls/Interaction/KeyboardWindow.xaml:27-28` |
| KeyboardWindow TextBox | default | 20 | normal | `Samba.Presentation.Controls/Interaction/KeyboardWindow.xaml:31` |
| KeyboardView (canvas) buttons | default | 18 | normal | `Samba.Presentation.Controls/VirtualKeyboard/KeyboardView.xaml:13-14` |
| KeyboardView3 buttons | default | inherited | Bold | `Samba.Presentation.Controls/VirtualKeyboard/KeyboardView3.xaml:14-15` |
| FeedbackWindow message | default | 30 | normal | `Samba.Presentation.Controls/Interaction/FeedbackWindow.xaml:10` |
| FeedbackWindow OK button | default | 30 | normal | `Samba.Presentation.Controls/Interaction/FeedbackWindow.xaml:11-12` |
| PopupWindow title | default | 18 | Bold | `Samba.Presentation.Controls/Interaction/PopupWindow.xaml:55` |
| PopupWindow content | default | 12 | Bold | `Samba.Presentation.Controls/Interaction/PopupWindow.xaml:56` |
| AccountDetailsView account name & balance | default | 35 | Bold | `Samba.Modules.AccountModule/AccountDetailsView.xaml:26,28,29` |
| AccountDetailsView ListView cells | default | 18 | `{Binding IsBold,...}` | `Samba.Modules.AccountModule/AccountDetailsView.xaml:60,68,76,84,92` |
| AccountSelectorView button labels | default | 26 | Bold (via FlexButton) | `Samba.Modules.AccountModule/AccountSelectorView.xaml:41` |
| TicketLister widget FontSize | default | `{Binding FontSize}` | normal | `Samba.Modules.TicketModule/Widgets/TicketLister/TicketListerControl.xaml:36` |
| TicketExplorer grid (auto-style) | default | 20 | normal | `Samba.Modules.TicketModule/TicketExplorerView.xaml:4` |
| TicketExplorer DatePicker | default | 16 | normal | `Samba.Modules.TicketModule/TicketExplorerView.xaml:25,30` |
| ClosableTabItem X button | Courier | 9 | Bold | `Samba.Modules.ManagementModule/Resources.xaml:12-14` |
| Workperiod warning | default | 18 | Bold | `Samba.Presentation/WorkPeriodStatusView.xaml:7` |
| Message client status | default | 16 | normal | `Samba.Presentation/MessageClientStatusView.xaml:9` |
| Splash image | — (image only) | — | — | n/a |

Font families explicitly named (everything else uses the WPF default Segoe UI on modern Windows):
**Calibri** (OfficeTab), **Courier** (close-tab X), **Lucida Console** (Shell clock), **Tahoma** (Outlook bar).

---

### Section 3 — Layout Dimensions

#### Window / Shell

| Element | Property | Value | Source |
|---------|----------|-------|--------|
| Shell window | Width × Height | 800 × 600 (design), WindowState=Normal | `Samba.Presentation/Shell.xaml:6` |
| Shell MainGrid | LayoutTransform | ScaleTransform (data-bound from settings → `WindowScale%`) | `Shell.xaml:15-17`, `SettingsView.xaml:61-65` |
| Shell grid rows | Row 0/1/2 | auto / * / auto (header / content / footer) | `Shell.xaml:18-22` |
| Shell grid cols | Col 0/1 | * / * (header bar split) | `Shell.xaml:23-26` |
| Splash window | Width × Height | 421 × 156 (SizeToContent=WidthAndHeight) | `Samba.Presentation.Controls/Interaction/SplashScreenForm.xaml:7` |
| Splash image | Width × Height | 366 × 71 | `SplashScreenForm.xaml:10` |
| KeyboardWindow | Width × Height | 710 × 278 | `KeyboardWindow.xaml:8` |
| FeedbackWindow | Width | 350 (text block), SizeToContent=WidthAndHeight | `FeedbackWindow.xaml:9` |
| Login design width | Width | 774 (d:DesignWidth) | `LoginView.xaml:4` |

#### Default button sizes

| Context | Height | Width | Margin | Source |
|---------|--------|-------|--------|--------|
| TicketView command column FlexButtons (auto-style) | **65** | stretch | 0,0,0,3 | `TicketView.xaml:77-78` |
| TicketView under-ticket automation FlexButtons | **65** | stretch | 0,0,3,3 | `TicketView.xaml:45,62` |
| MenuItemSelector sub-category FlexButtons | `{Binding Height}` | stretch | 0,0,0,5 | `MenuItemSelectorView.xaml:140` |
| MenuItemSelector page nav buttons | **45** | stretch | 0,3,3,3 / 0,3,0,3 | `MenuItemSelectorView.xaml:183,185` |
| MenuItemSelector category buttons | `{Binding MButtonHeight}` | stretch | 0,1,1,1 | `MenuItemSelectorView.xaml:52` |
| MenuItemSelector numerator "C" button | — | MinWidth=40 | 2,0,0,2 | `MenuItemSelectorView.xaml:208` |
| MenuItemSelector alpha buttons | MaxHeight=40 | stretch | 0,0,2,2 | `MenuItemSelectorView.xaml:246` |
| OpenTicketsView ticket buttons | **90** | stretch | 0,0,0,0 | `OpenTicketsView.xaml:24` |
| TicketListView bottom command buttons | (auto) | stretch | 3,3,3,0 | `TicketListView.xaml:142` |
| PaymentEditor NumberPad buttons | (auto-grid) | stretch | 2 | `NumberPadView.xaml:57-79` |
| PaymentButtonsView payment buttons | (auto) | stretch | 5 | `PaymentButtonsView.xaml:18` |
| ForeignCurrencyButtonsView buttons | **60** | stretch | 5 | `ForeignCurrencyButtonsView.xaml:16` |
| ChangeTemplatesView buttons | — (auto) | stretch | 5 | `ChangeTemplatesView.xaml:17` |
| LoginPad Green/Submit buttons | (auto grid) | stretch | 3 | `LoginPadControl.xaml:170-193` |
| LoginPad PIN TextBox | (auto) | stretch (col span 3) | 5 | `LoginPadControl.xaml:168-169` |
| Login Exit button | **50** | MinWidth=110 | 5 | `LoginView.xaml:32` |
| Login panel border | 400 × 350 | (fixed) | — | `LoginView.xaml:26` |
| AccountDetailsView right-column FlexButtons | **60** | stretch | 2 | `AccountDetailsView.xaml:136-149` |
| EntitySearchView right-column FlexButtons | **60** | stretch | 2 | `EntitySearchView.xaml:59-75` |
| DepartmentSelectorView buttons | MinHeight=30 | MinWidth=70 | 5,0,0,0 | `DepartmentSelectorView.xaml:15` |
| LoggedInUserView "MainMenu" button | — | **70** | (default) | `LoggedInUserView.xaml:13` |
| TicketListerControl tickets | (auto) | (auto, MinWidth={Binding MinWidth}) | 0,3 | `TicketListerControl.xaml:40-42` |
| Generic Save button (entity views) | — | MinWidth=70 | 0,10 / 0,10,3,0 | `GenericEntityView.xaml:16`; many |
| ClosableTabItem X button | 16 × 16 | | 0,1,0,0 | `ManagementModule/Resources.xaml:18` |
| FeedbackWindow OK button | — | — | 10, Padding=15 | `FeedbackWindow.xaml:11-12` |
| NavigationView tile | (auto-grid 3 cols) | (auto) | 10 | `NavigationView.xaml:30` |
| NavigationView tile inner border | — | — | 5 | `NavigationView.xaml:45` |
| KeyboardView keys (1..9, etc.) | **50 × 50** (default) | | Canvas positioned | `KeyboardView.xaml:19-79` |
| KeyboardView Backspace | 50 × 95 | | Canvas.Left=734 | `KeyboardView.xaml:32` |
| KeyboardView Tab | 50 × 64 | | Canvas.Left=6 | `KeyboardView.xaml:35` |
| KeyboardView Enter | 50 × 123 | | Canvas.Left=706 | `KeyboardView.xaml:49` |
| KeyboardView Caps | 50 × 78 | | Canvas.Left=6 | `KeyboardView.xaml:50` |
| KeyboardView Shift (left/right) | 50 × 92 / 50 × 109 | | | `KeyboardView.xaml:62,76` |
| KeyboardView Space | 50 × 498 | | Canvas.Left=160 | `KeyboardView.xaml:79` |
| KeyboardView Up/Down arrows | 50 × 71/72 | | | `KeyboardView.xaml:80-81` |
| KeyboardView3 keys | (auto-grid, row-height *) | (auto-grid, col-width *) | | `KeyboardView3.xaml:60-191` |

#### Grid cell proportions (priority screens)

| Screen | Column / Row split | Source |
|--------|---------------------|--------|
| **TicketView** | Cols: `2* : 7*` (CommandButtonsColumn : Content). Rows: auto / `8*` / auto / auto / auto / auto | `TicketView.xaml:9-20` |
| **PosView** | Cols: `45* : 55*` (TicketRegion : MenuRegion). Outer TabControl hides tabs. | `PosView.xaml:23-26` |
| **MenuItemSelectorView** | Outer rows: auto / `*`. Inner grid cols: `25* : 75*`. Inner rows: auto / auto / `60*` / `40*`. | `MenuItemSelectorView.xaml:10-40` |
| **PaymentEditorView** | Cols: `35* : 50* : 15*` (Order list : NumberPad : Payment buttons). Middle rows: `105` / `6*` / `*` (MinHeight=60, MaxHeight=100) | `PaymentEditorView.xaml:8-12,39-43` |
| **NumberPadView** | Cols: `17* : 56* : 17*` (Quick values : Digits : Divide/Tender). Digits grid 4×3. | `NumberPadView.xaml:9-13,44-55` |
| **LoginView** | Cols: `* : *`. Rows: `*` / auto. Right side hosts LoginPad 350×400. | `LoginView.xaml:7-14,26` |
| **LoginPadControl** | 3 cols × 5 rows (PIN TextBox spans 3 cols, then 4 rows of 3 buttons) | `LoginPadControl.xaml:155-167` |
| **NavigationView** | Single ItemsControl, `UniformGrid Columns="3"`, Margin=40; panel border Margin=25 | `NavigationView.xaml:18,22,26` |
| **EntityDashboardView** | Viewbox → Grid → Image (background) + DiagramCanvas (MinSize 640×480) | `EntityDashboardView.xaml:10-16` |
| **EntitySearchView** | Cols: `7* : *` (MinWidth=80, MaxWidth=300). Rows: auto / `*` / auto / `*` (header/list/splitter/keyboard). | `EntitySearchView.xaml:12-21` |
| **TicketListerControl** | ItemsControl + WrapPanel inside ScrollViewer | `TicketListerControl.xaml:34-55` |
| **AccountSelectorView** | Cols: `9* : *`. Rows: `*` / `9*`. Top row = account type buttons (UniformGrid Rows=1). | `AccountSelectorView.xaml:30-37` |
| **AccountDetailsView** | Cols: `7* : 1*`. Rows: auto / auto / `*` / auto. | `AccountDetailsView.xaml:11-20` |
| **TicketExplorerView** | Rows: auto / auto / `*` / auto. DatePicker has LayoutTransform ScaleTransform ScaleX/Y=2. | `TicketExplorerView.xaml:7-12,25-34` |
| **BasicReportView** | Cols: `25* : 75*` (Reports list : Active report) | `BasicReportView.xaml:8-11` |
| **ReportView** | Rows: auto / `*`. Cols: `*` / Auto / Auto (filters / date textboxes / action buttons). | `ReportView.xaml:7-14` |
| **ManagementView** | Cols: auto / `*`. Rows: `*` / 5 / `*` (splitter row). | `ManagementView.xaml:15-23` |
| **TicketOrdersView** | Single ItemsControl with GroupStyle; item template uses 4-col Grid (Quantity/Desc/PriceTag/TotalPrice) + Row 1 state. | `TicketOrdersView.xaml:57-124` |
| **TicketInfoView** | Rows: auto / auto. Borders with `BorderThickness="1,0,1,1"`. | `TicketInfoView.xaml:9-12` |
| **TicketTotalsView** | StackPanel of DockPanels, Margin=5. Default TextBlock FontSize=18. | `TicketTotalsView.xaml:9-15` |
| **OrderTagGroupEditorView** | Rows: auto / auto / `*` / auto / auto. GroupBoxes with `UniformGrid Columns="5"` for portions. | `OrderTagGroupEditorView.xaml:61-68` |
| **OrderSelectorView** | ScrollViewer → ItemsControl with 3-col grid (Quantity / Description / Total). MinHeight=45 per row. | `OrderSelectorView.xaml:47-65` |
| **OpenTicketsView** | UniformGrid `Columns="{Binding OpenTicketListViewColumnCount}"`, VerticalAlignment=Top. | `OpenTicketsView.xaml:14-20` |
| **TicketListView** | Rows: `*` / `8*` / `*`. Bottom ItemsControl with `UniformGrid Rows=1`. | `TicketListView.xaml:9-13` |
| **TicketTagListView / TicketEntityListView / TicketTypeListView** | Rows: `*` / auto. Bottom Close button (Height=60, ButtonColor=Red, Margin=3). | `TicketTagListView.xaml:9-12` |
| **EntityScreenView** | TabControl with 3 tabs (General / List / Mappings). | `EntityScreenView.xaml:15-165` |
| **MapControllerView** | Rows: auto / `*`. DataGrid MinWidth=300. | `MapControllerView.xaml:9-12` |
| **GenericEntityView** | Rows: `*` / auto. PropertyControl + Save button (MinWidth=70). | `GenericEntityView.xaml:9-12` |

#### Default ticket panel widths / column ratios

- TicketView left command column: `2*` (~22 % of width)
- TicketView right content column: `7*` (~78 %)
- PosView TicketRegion: `45*` (45 %)
- PosView MenuRegion: `55*` (55 %)
- MenuItemSelectorView categories: `25*` (~25 %)
- MenuItemSelectorView menu items: `75*` (~75 %)
- PaymentEditor left/middle/right: `35*` / `50*` / `15*`
- AccountDetailsView content/sidebar: `7*` / `1*`
- EntitySearchView content/sidebar: `7*` / `*` (MinWidth=80, MaxWidth=300)
- AccountSelectorView content/sidebar: `9*` / `*`

---

### Section 4 — Screen-by-Screen Breakdown

#### Screen: Shell (root window)

- **Source file**: `Samba.Presentation/Shell.xaml`
- **Layout**:
  ```
  ┌──────────────────────────────────────────────┐
  │ [apple-icon] SambaPOS 3            SAAT     │ ← Row 0 (auto)
  ├──────────────────────────────────────────────┤
  │                                              │
  │   MainTabControl (BorderlessTabControlStyle) │ ← Row 1 (*)
  │   cal:RegionManager.RegionName="MainRegion"  │
  │                                              │
  ├──────────────────────────────────────────────┤
  │ UserRegion │ MessageRegion │ … │ RightUserRegion │ ← Row 2 (auto, LightGray)
  └──────────────────────────────────────────────┘
  ```
- **Background**: LinearGradient `#FF70B8FF → #FF044392 → #FF5CBBFF` (vertical).
- **Controls**:

| Name | Type | Position | Size | Colors | Content | Icon |
|------|------|----------|------|--------|---------|------|
| apple-icon Image | Image | Row 0 Col 0 | Stretch=UniformToFill, Margin 0,0,0,2 | — | apple-icon.png | apple-icon.png |
| "SambaPOS 3" | TextBlock | Row 0 Col 0 (after image) | Margin 10,0 | Foreground=White, FontSize=24, Bold | "SambaPOS 3" | — |
| TimeLabel | TextBlock | Row 0 Col 1 | Margin 10,5,10,0 | Foreground=White, FontSize=18, Lucida Console, Right-aligned | "SAAT" (bound at runtime) | — |
| MainTabControl | TabControl | Row 1 ColSpan 2 | stretch | Style=BorderlessTabControlStyle; ItemContainerStyle hides TabItems | Region host | — |
| UserRegion | ItemsControl | Row 2 Col 0 | auto | Background=Transparent, StackPanel Horizontal | LoggedInUserView | — |
| MessageRegion | ItemsControl | Row 2 Col 1 | * | Background=Transparent | MessageClientStatusView, WorkPeriodStatusView | — |
| RightUserRegion | ItemsControl | Row 2 Col 3 | auto | Background=Transparent | DepartmentSelector etc. | — |

- **Style references**: `BorderlessTabControlStyle` (defined in `Common.xaml:71`).
- **Footer button auto-style**: `FontSize=16` (Shell.xaml:43-45).

---

#### Screen: TicketView

- **Source file**: `Samba.Modules.PosModule/TicketView.xaml`
- **ViewModel**: `Samba.Modules.PosModule/TicketViewModel.cs`
- **Layout** (6 rows × 2 cols; col 0 spans rows 0–4):
  ```
  ┌──────────────┬──────────────────────────────┐
  │              │ TitleLabel                   │ Row 0 (auto)
  │              ├──────────────────────────────┤
  │              │ TicketOrdersRegion           │ Row 1 (8*)
  │   CommandBtn │                              │
  │   Column     ├──────────────────────────────┤
  │   (Col 0)    │ TicketInfoRegion             │ Row 2 (auto)
  │   2*         ├──────────────────────────────┤
  │              │ TicketTotalsRegion           │ Row 3 (auto)
  │              ├──────────────────────────────┤
  │              │ UnderTicketAutomationCommands│ Row 4 (auto)
  │              │   UniformGrid Rows=1         │
  │              ├──────────────────────────────┤
  │              │ UnderTicketRow2AutomationCmd │ Row 5 (auto)
  └──────────────┴──────────────────────────────┘
  ```
- **Controls table**:

| Name | Type | Position | Size | Colors | Content | Icon |
|------|------|----------|------|--------|---------|------|
| TitleLabel | Label | R0C1 | Margin 0,0,3,0 | BG=DarkGray, FG=WhiteSmoke, BorderThickness=0, FontSize=18, Bold | `{Binding SelectedTicketTitle}` | — |
| TicketOrdersRegion | ContentControl | R1C1 | Margin 0,0,3,0 | — | Prism region `TicketOrdersRegion` | — |
| TicketInfoRegion | ContentControl | R2C1 | Margin 0,0,3,0 | — | Prism region `TicketInfoRegion` | — |
| TicketTotalsRegion | ContentControl | R3C1 | Margin 0,0,3,0 | — | Prism region `TicketTotalsRegion` | — |
| UnderTicketAutomationCommands | ItemsControl | R4C1 | UniformGrid Rows=1 | — | Data-bound buttons | — |
| (ItemTemplate) | FlexButton | — | Height=65, Margin 0,0,3,3 | ButtonColor={Binding Color}; FontSize={Binding FontSize} | `{Binding Display}` | — |
| UnderTicketRow2AutomationCommands | ItemsControl | R5C1 | UniformGrid Rows=1 | — | Data-bound buttons | — |
| CommandButtonsColumn | StackPanel | C0, R0–R4 | VerticalAlignment=Top, Margin 0,0,3,0 | Auto-style: FlexButton Height=65, Margin 0,0,0,3, FontSize=18 | — | — |
| AddOrderCommand | FlexButton | col 0 | auto | — | "Add\nOrder" (Resources.AddOrder with newline) | — |
| ModifyOrderCommand | FlexButton | col 0 | auto | — | "Modify\nOrder" | — |
| EntityButtons (ItemsControl) | FlexButton | col 0 | auto | — | `{Binding Name}` (entity type name) | — |
| TicketTagButtons (ItemsControl) | FlexButton | col 0 | auto | ButtonColor={Binding ButtonColor} | `{Binding Caption}` ("Tag") | — |
| EditTicketNoteCommand | FlexButton | col 0 | auto | — | "Ticket\nNote" | — |
| TicketAutomationCommands (ItemsControl) | FlexButton | col 0 | auto | ButtonColor={Binding Color} | `{Binding Display}` | — |
| IncQuantityCommand | FlexButton | col 0 | auto | — | "+" | — |
| DecQuantityCommand | FlexButton | col 0 | auto | — | "-" | — |
| IncSelectionQuantityCommand | FlexButton | col 0 | auto | — | "(+)" | — |
| DecSelectionQuantityCommand | FlexButton | col 0 | auto | — | "(-)" | — |
| OrderAutomationCommands (ItemsControl) | FlexButton | col 0 | auto | ButtonColor={Binding Color} | TextBlock 16/Bold/Center/Wrap `{Binding Display}` | — |
| CancelItemCommand | FlexButton | col 0 | auto | — | TextBlock 16/Bold/Center/Wrap `{Binding CancelItemCommand.Caption}` (= "Cancel") | — |
| MoveOrdersCommand | FlexButton | col 0 | auto | — | "Move Ticket Line" | — |
| ChangePriceCommand | FlexButton | col 0 | auto | — | "Change Price" | — |

- **Style references**:
  - Implicit style on `FlexButton` in `StackPanel.Resources` (`TicketView.xaml:75-81`): Height=65, Margin=0,0,0,3, FontSize=18.
  - Converters: `NullBrushConverter`, `VisibilityConverter` (from `Samba.Presentation.Controls/Generic.xaml`).
- **Notes**:
  - The TicketView is composed of 4 child regions (`TicketOrdersRegion`, `TicketInfoRegion`, `TicketTotalsRegion`, `UnderTicketAutomationCommands`). The actual ticket list is rendered by `TicketOrdersView` (see below).
  - "Pago" button is NOT defined statically — it is one of the `UnderTicketAutomationCommands` and is configured by the user (default color is whatever the AutomationCommand.Color is). Typical SambaPOS installs set this to orange (#FF9800-ish) but the XAML itself does not hard-code it.
  - The button "Cancel", "Move Ticket Line", "Change Price" use a TextBlock child with `FontSize=16` `FontWeight=Bold` `TextAlignment=Center` `TextWrapping=Wrap` instead of plain string content (so they wrap nicely).

---

#### Screen: TicketOrdersView (the ticket lines list inside TicketView)

- **Source file**: `Samba.Modules.PosModule/TicketOrdersView.xaml`
- **Layout**:
  ```
  ┌─────────────────────────────────────────────┐
  │ Border BorderThickness=1 ActiveBorderBrush  │
  │  ScrollViewer (KineticBehaviour)            │
  │   ItemsControl (AlternationCount=2)         │
  │     GroupStyle: header w/ Order# + Time     │
  │     ItemTemplate: Button > Grid (4 cols × 2)│
  │       Col0 Quantity (21px, bound FontWeight)│
  │       Col1 Description (21px)               │
  │       Col2 PriceTag (12px, Gray)            │
  │       Col3 TotalPrice (21px, right-aligned) │
  │       Row1: State (12px, Visibility bound)  │
  │     Timer line: 14px Bold, TimerColor bound │
  │     OrderTagValues: 14px Bold DarkBlue      │
  │     Selection rectangle: StrokeDashArray=5   │
  └─────────────────────────────────────────────┘
  ```
- **Style references**: `ItemsControlButtonStyle` (from `Common.xaml:61`) — strips Button chrome so the whole row is clickable.
- **Background**: `Background="{Binding TicketBackground}"` (per-ticket; often transparent or white).

---

#### Screen: MenuItemSelectorView (the menu/product selector)

- **Source file**: `Samba.Modules.PosModule/MenuItemSelectorView.xaml`
- **ViewModel**: `MenuItemSelectorViewModel.cs`
- **Layout**:
  ```
  ┌─────────────────────────────────────────────────────┐
  │ MostUsedMenuItems (MaxHeight=70, UniformGrid Row=1) │
  ├──────────────┬──────────────────────────────────────┤
  │ Categories   │ SelectedMenuItems + CloseMenuView    │ R0 (auto)
  │ ScrollViewer │  (Border Silver + ListBox + Close Btn)│
  │  UniformGrid │ ├───────────────────────────────────┤
  │  Columns=    │ QuickNumeratorValues (UniformGrid    │ R1 (auto)
  │   binding    │  Rows=1, MinHeight=60) — list items  │
  │              │  in WhiteSmoke borders, CornerRadius=4│
  │              ├───────────────────────────────────┤
  │              │ SubCategories (UniformGrid Rows=    │ R2 (60*)
  │              │  binding) — sub-cat buttons         │
  │              │ MenuItems (VirtualizingTilePanel)   │
  │              │  ItemHeight={Binding ...ButtonHeight}│
  │              │  ColumnCount={Binding ...ColumnCount}│
  │              ├───────────────────────────────────┤
  │              │ PageNav (UniformGrid 2x1, Height=45)│
  │              ├───────────────────────────────────┤
  │              │ Numerator Editor (TextBox + C btn)  │ R3 (40*)
  │              │ Numeric pad 4×3 (1-9,"," 0 x)       │
  │              │ Alpha button row (MaxHeight=40)     │
  └──────────────┴──────────────────────────────────────┘
  ```
- **Controls**:

| Name | Type | Size | Colors | Content / Notes |
|------|------|------|--------|-----------------|
| MostUsed items | FlexButton | Margin 5,0,0,7 | ButtonColor={Binding ButtonColor} | `{Binding Caption}`, ButtonImage={Binding ImagePath} |
| Categories | FlexButton | Height={Binding MButtonHeight}, Margin 0,1,1,1 | ButtonColor={Binding MButtonColor} | `{Binding Caption}`, ButtonImage |
| SelectedMenuItems ListBox | ListBox | stretch | Border Silver 1px | DataTemplate: DockPanel with Qty (18px) + Caption (18px) |
| CloseMenuView button | FlexButton | Height=40 | **ButtonColor=Red** | Margin 3,0 |
| QuickNumerator ListBox | ListBox | MinHeight=60 | BG=Transparent; item Border: WhiteSmoke, BorderBrush=Gray, CornerRadius=4, Margin 0,0,4,4 | Selected trigger: BorderThickness=2, Foreground=Red |
| SubCategories | FlexButton | Height={Binding Height}, Margin 0,0,0,5 | ButtonColor={Binding ButtonColor} | `{Binding Caption}` |
| MenuItems | FlexButton | Margin 1 | ButtonColor={Binding ButtonColor} | `{Binding Caption}`, ButtonImage |
| Page nav buttons | FlexButton | Height=45, Margin 0,3,3,3 / 0,3,0,3 | — | "‹" / "›" (Dec/Inc captions) |
| Numerator TextBox | TextBox | stretch | FontSize=30, Bold | `{Binding NumeratorValue}` IsReadOnly=True |
| Numerator "C" | FlexButton | MinWidth=40, Margin 2,0,0,2 | — | "C" |
| Numeric pad 1-9, ", 0, x | FlexButton | Margin 0,0,2,2 | — | "1".."9",",","0","x" |
| Alpha buttons | FlexButton | MaxHeight=40, Margin 0,0,2,2 | — | `{Binding}` (alpha letters) |

- **Style references**: `VisibilityConverter`, `NullBrushConverter`, `KineticBehaviour` (attached property for touch inertia).
- **Note**: MenuItems use a `VirtualizingTilePanel` (custom UIControls) so the column count and item height are data-bound to the selected category.

---

#### Screen: PaymentEditorView (Payment screen)

- **Source file**: `Samba.Modules.PaymentModule/PaymentEditorView.xaml`
- **Layout** (3 columns × middle grid 3 rows):
  ```
  ┌────────────────┬─────────────────────────┬──────────────┐
  │ TicketTitle    │ TenderedValueRegion     │              │
  │  (FontSize 18, │  (TabControl, height=105)│ Payment      │
  │   Bold)        │                         │ Buttons      │
  │                │ NumberPadRegion         │ Region       │
  │ OrderSelector  │  (6* row)               │ (15*)        │
  │  Region (35*)  │                         │              │
  │                │ CommandButtonsRegion    │              │
  │ PaymentTotals  │  (* row, MinHeight=60,  │              │
  │  Region        │   MaxHeight=100)        │              │
  │ ForeignCurrency│                         │              │
  │  Region        │                         │              │
  └────────────────┴─────────────────────────┴──────────────┘
  ```
- **Middle grid Margin**: 5.
- **Style references**: `BorderlessTabControlStyle` for the TenderedValue tab control (hidden tab items).

##### Sub-screen: NumberPadView (within PaymentEditorView middle column)

- **Source**: `Samba.Modules.PaymentModule/NumberPadView.xaml`
- **Layout**:
  ```
  ┌──────────┬──────────────────────┬──────────────┐
  │ Quick    │  Digits 4×3          │ Tender All   │
  │ Values   │   1 2 3              │ 1/2          │
  │ (Green)  │   4 5 6              │ 1/3          │
  │ 1,5,10,  │   7 8 9              │ 1/n          │
  │ 20,50,   │   . 0 C              │ Balance Mode │
  │ 100      │                      │ LastTendered │
  └──────────┴──────────────────────┴──────────────┘
  ```
- **Column widths**: `17* : 56* : 17*`.
- **Buttons**:

| Button | Color | Foreground | Content | Source line |
|--------|-------|-----------|---------|-------------|
| Quick value buttons | Green | (auto-contrast) | "1","5","10","20","50","100" | `NumberPadView.xaml:18` |
| 1..9, ".", 0 | (default Gainsboro) | Black | "1".."9",".","0" | `NumberPadView.xaml:56-77` |
| C (clear) | **Black** | White (auto-contrast) | "C" | `NumberPadView.xaml:78-79` |
| Tender All | **Purple** | (auto) | `{Binding TenderAllCommand.Caption}` | `NumberPadView.xaml:82-83` |
| 1/2 | **RoyalBlue** | WhiteSmoke | "1/2" | `NumberPadView.xaml:84-85` |
| 1/3 | **RoyalBlue** | WhiteSmoke | "1/3" | `NumberPadView.xaml:86-87` |
| 1/n | **RoyalBlue** | WhiteSmoke | "1/n" | `NumberPadView.xaml:88-89` |
| Balance mode | **Purple** | (auto) | `{Binding BalanceModeCaption}` | `NumberPadView.xaml:90-91` |
| Last tendered | **MediumPurple** | (auto) | `{Binding LastTenderedAmount}` | `NumberPadView.xaml:92-94` |

- All number pad buttons: `Margin="2"`.

##### Sub-screen: TenderedValueView

- **Source**: `Samba.Modules.PaymentModule/TenderedValueView.xaml`
- **Layout**: `UniformGrid 2×2`, Margin=5.
- **Total label** & **Charged amount label**: `Label` FontSize=28.
- **Total TextBox** & **Tendered TextBox**: `TextBox` FontSize=30, Bold, Right-aligned, IsReadOnly=True.

##### Sub-screen: ReturningAmountView (the "Change" popup)

- **Source**: `Samba.Modules.PaymentModule/ReturningAmountView.xaml`
- **Layout**: `Border` Background=**Red**, BorderBrush=WhiteSmoke, BorderThickness=2, CornerRadius=5. Viewbox → TextBlock Foreground=WhiteSmoke Bold Centered.

##### Sub-screen: PaymentTotalsView

- **Source**: `Samba.Modules.PaymentModule/PaymentTotalsView.xaml`
- 11-row Grid (auto each), default TextBlock FontSize=16.
- Service/payment lines: Foreground=DarkGreen, FontSize=14.
- Balance row: FontSize=20, Bold, Foreground=Red.

##### Sub-screen: ChangeTemplatesView

- **Source**: `Samba.Modules.PaymentModule/ChangeTemplatesView.xaml`
- `Border` Background=Gainsboro → ItemsControl `UniformGrid Rows=1` → FlexButton `FontSize=40`, Margin=5.

##### Sub-screen: ForeignCurrencyButtonsView

- **Source**: `Samba.Modules.PaymentModule/ForeignCurrencyButtonsView.xaml`
- ItemsControl `UniformGrid Rows=1`, FlexButton `Height=60`, Margin=5.

##### Sub-screen: PaymentButtonsView

- **Source**: `Samba.Modules.PaymentModule/PaymentButtonsView.xaml`
- ItemsControl `UniformGrid Columns=1` MinHeight=60, FlexButton `Margin=5`, FontSize={Binding FontSize}, ButtonColor={Binding Color}.
- These are the payment-type buttons ("Cash", "Credit Card", "Voucher", etc.) — colors are user-configured per payment type.

##### Sub-screen: OrderSelectorView (within PaymentEditorView left column)

- **Source**: `Samba.Modules.PaymentModule/OrderSelectorView.xaml`
- ScrollViewer → ItemsControl, each item is a Button (MinHeight=45) wrapping a 3-col Grid (Quantity / Description / Total, all FontSize=20). Selected item → Bold (DataTrigger). Border Silver 1px bottom. Has ButtonClick / Release storyboards animating Background Silver→Transparent on press.

##### Sub-screen: CommandButtonsView

- **Source**: `Samba.Modules.PaymentModule/CommandButtonsView.xaml`
- ItemsControl `UniformGrid Rows=1`, FlexButton Margin 3,3,3,0.

---

#### Screen: LoginView + LoginPadControl

- **Source files**: `Samba.Modules.LoginModule/LoginView.xaml`, `LoginPadControl.xaml`
- **LoginView layout**:
  ```
  ┌────────────────────┬─────────────────────────┐
  │                    │  ┌──────────────────┐   │
  │   LogoPath Image   │  │  LoginPad 350×400│   │
  │   (Centered)       │  │  Border CornerRadius=10│
  │                    │  │  BorderBrush=LightSteelBlue│
  │                    │  │  BorderThickness=2│   │
  │                    │  └──────────────────┘   │
  │                    │  AdminPasswordHint (14)  │
  │                    │  [Exit button 110×50]    │
  ├────────────────────┴─────────────────────────┤
  │ AppLabel TextBlock (FontSize=30, Black,      │
  │  WhiteSmoke, DropShadowEffect 0.3)           │
  └──────────────────────────────────────────────┘
  ```
- **LoginPadControl layout** (3×5 grid):
  ```
  ┌─────────────────────────────────┐
  │ PIN TextBox (col span 3, 32pt,  │
  │  Bold, IsReadOnly, "Enter Pin") │
  ├──────────┬──────────┬──────────┤
  │ 1 Green  │ 2 Green  │ 3 Green  │
  │ 4 Green  │ 5 Green  │ 6 Green  │
  │ 7 Green  │ 8 Green  │ 9 Green  │
  │ Clear    │ 0 Green  │ Login    │ ← SubmitButtonStyle (orange gradient)
  └──────────┴──────────┴──────────┘
  ```
- **Buttons** (all `Margin="3"`):

| Button | Style | Background | Foreground | Source |
|--------|-------|-----------|-----------|--------|
| 1-9, 0, Clear | GreenButtonStyle | LinearGradient `#FFB9EFA9 → #FF288D09` | ControlText (Black) | `LoginPadControl.xaml:170-191` |
| Login (submit) | SubmitButtonStyle | LinearGradient `#FFFBE0A3 → #FFD24D00` (orange) | ControlText (Black) | `LoginPadControl.xaml:192-193` |

- **Border**: `#B7707070` (semi-transparent gray) for normal border on both styles.
- **Disabled foreground**: `#ADADAD`.
- **Exit button** (in LoginView): `MinWidth=110, Height=50, FontSize=18, FontWeight=Bold`. Contains DockPanel with `Images/LanShutDown.icon.gif` + Label "Exit".

---

#### Screen: NavigationView (main menu / dashboard tiles)

- **Source file**: `Samba.Modules.NavigationModule/NavigationView.xaml`
- **Layout**:
  ```
  ┌──────────────────────────────────────────────┐
  │ Background: Wallpaper3.jpg (Opacity=0.5)     │
  │  ┌────────────────────────────────────────┐  │
  │  │ Border #397A7779, Margin=25,           │  │
  │  │  BorderThickness=5, BorderBrush=#59000000,│  │
  │  │  CornerRadius=15                       │  │
  │  │  ItemsControl Margin=40, UniformGrid   │  │
  │  │   Columns=3                            │  │
  │  │   ┌────────┐ ┌────────┐ ┌────────┐    │  │
  │  │   │ Tile   │ │ Tile   │ │ Tile   │    │  │
  │  │   │ Image  │ │ Image  │ │ Image  │    │  │
  │  │   │Caption │ │Caption │ │Caption │    │  │
  │  │   └────────┘ └────────┘ └────────┘    │  │
  │  └────────────────────────────────────────┘  │
  └──────────────────────────────────────────────┘
  ```
- **Tile template** (custom ControlTemplate):
  - Outer Border: `BorderBrush=#270C0C41`, `BorderThickness=5`, `CornerRadius=8`. Background = LinearGradient `#47969696 → #6F111114` (translucent gray gradient).
  - Inner Border: `Margin=5`, `BorderThickness=1`, `CornerRadius=5`. BorderBrush = LinearGradient `#69D1D1D1 → #FFBABABA`.
  - Content Grid: 3 rows `10* : 45* : 45*`. Row 0 = empty top spacer, Row 1 = `Image` (Stretch=Uniform, DownOnly, DropShadowEffect), Row 2 = `Viewbox` containing TextBlock `Foreground=#BDF5F5F5`, `FontSize=40`, `FontWeight=Bold`, `DropShadowEffect ShadowDepth=2 BlurRadius=3 Opacity=0.5`.
- **Triggers**:
  - `IsPressed=True` → textbox Margin becomes 20 (push caption down for press feedback).
  - `IsEnabled=False` → Opacity=0.4.

---

#### Screen: OpenTicketsView (open-ticket grid)

- **Source file**: `Samba.Modules.PosModule/OpenTicketsView.xaml`
- **Layout**: ScrollViewer (KineticBehaviour, BorderThickness=1, ActiveBorderBrush) → ItemsControl `UniformGrid Columns={Binding OpenTicketListViewColumnCount}` VerticalAlignment=Top.
- **Item template**: FlexButton `Height=90`, `ButtonColor=Silver`, `Padding=2`, `HorizontalContentAlignment=Left`, `VerticalContentAlignment=Stretch`.
  - Inside: Grid (2 rows). Row 0 = `Viewbox MaxHeight=50` showing ticket Title (Foreground bound). Row 1 = `Viewbox MaxHeight=40` with inner Grid showing TicketTime + Total (MinWidth=55).

---

#### Screen: TicketListView (ticket list with merge buttons)

- **Source file**: `Samba.Modules.PosModule/TicketListView.xaml`
- **Layout**: 3 rows (`*` / `8*` / `*`).
  - Row 0: header Grid with Viewbox list name (Bold) + Viewbox TotalRemainingAmount.
  - Row 1: ItemsControl `UniformGrid Rows={Binding RowCount}`. Each item:
    - Grid 2 cols (auto / `*`, SharedSizeGroup `Grp1`).
    - Col 0: Button (ItemsControlButtonStyle) → Border `CornerRadius=5,0,0,5` BorderBrush=Silver Background={Binding SelectionBackground}. Viewbox → TicketNumber TextBlock (Foreground={Binding SelectionForeground}).
    - Col 1: Button → Border `BorderThickness=1` BorderBrush={Binding SelectionBackground} Background=Gainsboro. Grid 2 rows:
      - Row 0: WrapPanel of TicketTags (Border Silver BG LightGray CornerRadius=2 Margin=3 Padding=3 + TextBlock).
      - Row 1: WrapPanel of ResourceNames (Border Silver CornerRadius=2 Margin=3 Padding=3 + TextBlock) + Viewbox RemainingAmount.
  - Row 2: ItemsControl `UniformGrid Rows=1` of command buttons (FlexButton FontSize={Binding FontSize}, ButtonColor={Binding Color}, Margin 3,3,3,0).
- **Animations**: `ButtonClick` storyboard (Background → Silver instantly) and `Release` storyboard (Silver → Gainsboro over 0.2s) on press.

---

#### Screen: TicketInfoView (ticket tags + ticket time area)

- **Source file**: `Samba.Modules.PosModule/TicketInfoView.xaml`
- **Layout**: 2 rows (auto / auto).
  - Row 0 StackPanel:
    - Border `Background=SystemColors.InfoBrush`, `BorderBrush=SystemColors.ActiveBorderBrush`, `BorderThickness=1,0,1,1`, Visibility bound to IsTicketTagged. TextBlock Margin=3, TextTrimming=WordEllipsis, Text={Binding TicketTagDisplay}.
    - Same Border for Note (Visibility bound to IsTicketNoteVisible).
  - Row 1 Border (same border style), Visibility bound to IsTicketTimeVisible. Inner Grid 3×2 with TextBlocks for "Ticket Opening Time", "Last Order", "Last Payment Time" and their bound date values.

---

#### Screen: TicketTotalsView (totals panel under ticket)

- **Source file**: `Samba.Modules.PosModule/TicketTotalsView.xaml`
- **Layout**: StackPanel Margin=5. Auto-style: TextBlock FontSize=18.
- **Rows** (each DockPanel with label + right-aligned value):
  1. TicketTotal (PlainTotal) — visible if IsPlainTotalVisible
  2. PreServicesList (ItemsControl, DarkGreen, FontSize=16)
  3. SubTotal
  4. TaxTotal
  5. PostServicesList (DarkGreen, 16)
  6. GrandTotal
  7. ChargedAmount (TicketPayment)
  8. ChangeTotal
  9. **Balance** — `FontSize=22, FontWeight=Bold, Foreground=Red` (left + right).

---

#### Screen: TicketTagListView / TicketEntityListView / TicketTypeListView (modal selectors)

- **Source files**: `Samba.Modules.PosModule/TicketTagListView.xaml`, `TicketEntityListView.xaml`, `TicketTypeListView.xaml`.
- All three share the same layout: 2 rows (`*` / auto). Row 0 = ItemsControl `UniformGrid Rows={Binding RowCount} [Columns={Binding ColumnCount}]` of FlexButtons (`FontSize=30, Margin=5`). Row 1 = `UniformGrid` containing a single Close FlexButton (`Height=60, Margin=3, ButtonColor=Red`).

---

#### Screen: OrderTagGroupEditorView (modifier / portion selector)

- **Source file**: `Samba.Modules.ModifierModule/OrderTagGroupEditorView.xaml`
- **Layout**: 5 rows (auto / auto / `*` / auto / auto), MinHeight=50.
  - Row 0: GroupBox "Portions" (Bold 16) → ItemsControl `UniformGrid Columns=5` of FlexButtons `Height=60, Margin=0,5,5,0` (TextBlock wrap centered).
  - Row 1: ItemsControl of grouped OrderTagGroups → GroupBox per group → `UniformGrid Columns={Binding ColumnCount}` of FlexButtons `Height={Binding ButtonHeight}`.
  - Row 2: ScrollViewer (KineticBehaviour) → ItemsControl of OrderTagGroups (each GroupBox with free-tag row + ItemsControl of order tags).
  - Row 3: Embedded `AutomationCommandSelectorView`.
  - Row 4: `UniformGrid Rows=1` → FlexButton "Toggle Remove Mode" (ButtonColor={Binding RemoveModeButtonColor}) + FlexButton Close (ButtonColor=Red). Both Height=60, Margin=3.
- **Group box style**: custom template with `BorderBrush=SystemColors.ActiveBorderBrush`, `BorderThickness=1`, header background `SystemColors.ControlBrush`, `CornerRadius=2`.

---

#### Screen: TicketNoteEditorView

- **Source**: `Samba.Modules.ModifierModule/TicketNoteEditorView.xaml`
- Rows: `3*` / `2*` / auto. Row 0 = TextBox `FontSize=22, MinHeight=60, AcceptsReturn=True, TextWrapping=Wrap`. Row 1 = `KeyboardView3`. Row 2 = Close FlexButton `Height=65, ButtonColor=Red, Margin=3`.

---

#### Screen: TicketTagEditorView

- **Source**: `Samba.Modules.ModifierModule/TicketTagEditorView.xaml`
- Rows: auto / `*` / auto.
- Row 0: GroupBox "Tag" (Visibility bound to IsFreeTagEditorVisible) → Grid 2 cols: FilteredTextBox `FontSize=24` + FlexButton "Update" (Margin 5,0, Padding 3).
- Row 1: ItemsControl `UniformGrid Columns={Binding TagColumnCount}` of FlexButtons `MaxHeight=65, Margin=5`.
- Row 2: Close FlexButton `Height=60, ButtonColor=Red, Margin=3`.

---

#### Screen: AutomationCommandSelectorView / AutomationCommandValueSelectorView

- **Sources**: `Samba.Modules.ModifierModule/AutomationCommandSelectorView.xaml`, `AutomationCommandValueSelectorView.xaml`
- Rows: `*` / auto.
- Row 0: ItemsControl `UniformGrid Columns={Binding ColumnCount}` of FlexButtons `MinHeight=65, Margin=5` (ButtonColor={Binding AutomationCommand.Color}).
- Row 1 (only in ValueSelector): Close FlexButton `Height=60, Margin=3, ButtonColor=Red`.

---

#### Screen: ProductTimerEditorView

- **Source**: `Samba.Modules.ModifierModule/ProductTimerEditorView.xaml`
- Rows: `*` / auto.
- Row 0: Grid 2 cols (auto / auto), 6 rows auto. TextBlock auto-style: FontSize=20, Margin=5. Bottom: Border Silver top border. Price (FontSize=24) + Value (FontSize=24 Bold).
- Row 1: UniformGrid Rows=1 → FlexButton Stop Timer (ButtonColor={Binding ButtonColor}, Height=60, Margin=3) + FlexButton Close (Height=60, Margin=3).

---

#### Screen: EntityDashboardView (table-map / entity screen)

- **Source**: `Samba.Modules.EntityModule/EntityDashboardView.xaml`
- **Layout**: `Border` (BorderBrush=Transparent, Background={Binding SelectedEntityScreen.BackgroundColor}) → `Viewbox Stretch=Uniform` → Grid (Image background + `DiagramCanvas` MinSize 640×480, EditingMode=None, Background=Transparent).
- **ContextMenu**: "Edit Mode" toggle + "Add Widget" (design mode only).
- Used as the **TableMap / TableSelectorView** equivalent (there is no separate `TableSelectorView.xaml` in V3 — tables are an EntityScreen rendered via this dashboard).

---

#### Screen: EntitySelectorView (entity grid selector)

- **Source**: `Samba.Modules.EntityModule/EntitySelectorView.xaml`
- Rows: `*` / auto.
- Row 0: ItemsControl `UniformGrid Rows={Binding ...RowCount} Columns={Binding ...ColumnCount}` of `FastButton` (not FlexButton) — `Height={Binding ButtonHeight}, FontSize={Binding FontSize}, Margin=2, ButtonColor={Binding ButtonColor}`.
- Row 1: `UniformGrid 2×1, MaxHeight=60` (page nav) — two FastButtons (Dec/Inc page).

---

#### Screen: EntitySearchView

- **Source**: `Samba.Modules.EntityModule/EntitySearchView.xaml`
- **Layout**: Grid 2 cols (`7*` / `*` MinWidth=80 MaxWidth=300) × 4 rows (auto / `*` / auto / `*`).
  - Row 0: Search label (FontSize=30) + TextBox (FontSize=30) + FlexButton "X" (MinWidth=50).
  - Row 1: ListView (Background=LightGray) with `BlueBackground` header style and `WrappedHeaderTemplate`.
  - Row 2: GridSplitter (Height=5, Background=Transparent).
  - Row 3: `KeyboardView3`.
- Right column StackPanel (Background=LightGray): FlexButtons `Height=60, Margin=2` — Select, Edit, Create, Remove, Display Account, Display Inventory.

---

#### Screen: AccountSelectorView

- **Source**: `Samba.Modules.AccountModule/AccountSelectorView.xaml`
- **Layout**: Grid 2 cols (`9*` / `*`) × 2 rows (`*` / `9*`).
- Top row (col span 2): ItemsControl `UniformGrid Rows=1`, Background=LightGray. FlexButton `Margin=2, FontSize=26, ButtonColor={Binding ButtonColor}`.
- Bottom-left (Row 1 Col 0): ListView with two columns (Name MinWidth=250, Balance MinWidth=150). GroupStyle with Gainsboro border + Gray bold group header.
- Bottom-right (Row 1 Col 1): StackPanel Background=LightGray with FlexButtons `Height=60, FontSize=20, Margin=2` — Show Account Details, Print, Automation Commands, Batch Document buttons.

---

#### Screen: AccountDetailsView

- **Source**: `Samba.Modules.AccountModule/AccountDetailsView.xaml`
- **Layout**: Grid 2 cols (`7*` / `1*`) × 4 rows.
  - Row 0: Account name (FontSize=35 Bold) + "Balance:" label + TotalBalance (FontSize=35 Bold).
  - Row 1: Filter ComboBox + StartDate/EndDate ClickSelectTextBox (FontSize=16) + Refresh button + Print button.
  - Row 2: ListView with 5 columns (Date, Description, Debit, Credit, Balance) all FontSize=18. Header = `BlueBackground` style.
  - Row 3: Account summaries (nested ListViews with `hs` Gray/White header style).
- Right column (RowSpan 4, Background=LightGray): Close (Red), Display Ticket, Document Type buttons (FlexButton Height=60, Margin=2).

---

#### Screen: TicketExplorerView

- **Source**: `Samba.Modules.TicketModule/TicketExplorerView.xaml`
- **Layout**: 4 rows (auto / auto / `*` / auto). FontSize=20 default.
- Row 0: 4-col grid with 2 DatePickers (LayoutTransform ScaleTransform 2× — these are visually doubled in size) + Previous/Next WorkPeriod buttons (MinWidth=50) + Refresh button.
- Row 1: Filters ItemsControl — each row is a FilterType ComboBox + FilterValue ComboBox (MinWidth=200, IsEditable).
- Row 2: DataGrid with columns Number / Date / OpenClose / TicketNote (`*`) / Total (MinWidth=65, RightAlignedCellStyle). AlternatingRowBackground=WhiteSmoke. VerticalScrollBarWidth overridden to 30. RowDetailsTemplate = Grid Height=114, Background=LightGoldenrodYellow, with Details ItemsControl + Display Ticket FlexButton.
- Row 3: TotalStr TextBlock (Bold, right-aligned).

---

#### Screen: BasicReportView / ReportView

- **BasicReportView** (`Samba.Modules.BasicReports/BasicReportView.xaml`): 2 cols (`25*` / `75*`). Left = ItemsControl of report buttons (Label inside Button, BG={Binding Background}, FG={Binding Foreground}, FontSize=16 Bold). Right = embedded `ReportView`.
- **ReportView** (`Samba.Modules.BasicReports/ReportView.xaml`): 2 rows × 3 cols. Top: filter ComboBoxes + start/end date TextBoxes (MinWidth=60, FontSize=16) + Refresh/Print/Save buttons (MinWidth=60, FontSize=16). Bottom: `FlowDocumentScrollViewer`.

---

#### Screen: ManagementView (Outlook-style nav + tabbed content)

- **Source**: `Samba.Modules.ManagementModule/ManagementView.xaml` (+ `Resources.xaml`)
- **Layout**: 2 cols × 3 rows. Left = Outlook-style `TabControl` (`OutlookTab` template). Right = tabbed `ViewsTemplate`. Bottom-right = `KeyboardView` in a Viewbox.
- **Outlook bar colors** (defined in `Resources.xaml:78-108`):
  - `LabelHighlightBrush` = #FFFFFF
  - `CaptionBrush` = #15428B
  - `BorderBrush` = #6593CF
  - `LabelBrush` = linear gradient #E3EFFF → #AFD2FF
  - `ButtonNormalBrush` = #E3EFFF → #C4DDFF → #ADD1FF → #C0DBFF
  - `ButtonSelectedBrush` = #FFD9AA → #FFBB6E → #FFAB3F → #FEE17A (orange-yellow)
  - `ButtonPressedBrush` = #FFBD69 → #FFAC42 → #FB8C3C → #FED364
  - `ButtonHoverBrush` = #FFFEE4 → #FFE8A7 → #FFD767 → #FFE69E
- Each TabItem: MinHeight=32, Tahoma 8pt Bold.
- Selected content pane: ScrollViewer with ItemsControl of command Hyperlinks (FontSize=14, Margin=2,6).

---

#### Screen: SettingsView / GenericEntityView / EntityScreenView / OrderTagGroupView / AutomationCommandView / RuleView

All of these follow the same skeleton:
```
Grid (2 rows: * / auto)
├─ TabControl Template=OfficeTabControl
│   ├─ TabItem "General Settings" → StackPanel of Label+TextBox pairs
│   ├─ TabItem "List" → DataGrid
│   └─ TabItem "Mappings" → DataGrid (MapController pattern)
└─ StackPanel
    ├─ Button Save (MinWidth=70, Margin=0,10)
    └─ Label Error (Foreground=Red)
```
- All labels use default font; TextBoxes typically MinWidth=200, HorizontalAlignment=Left.
- `OfficeTabControl` template lives in `Samba.Presentation.Controls/OfficeTab.xaml`.

---

#### Screen: Shell footer / status regions

- **MessageClientStatusView** (`Samba.Presentation/MessageClientStatusView.xaml`): single Label `FontSize=16, Foreground=Green`, initial text "Kontrol…".
- **WorkPeriodStatusView** (`Samba.Presentation/WorkPeriodStatusView.xaml`): TextBlock `FontSize=18, Foreground=Red, FontWeight=Bold, Margin=7,2,0,0`, Visibility=Collapsed by default (toggled at runtime).
- **LoggedInUserView** (`Samba.Modules.UserModule/LoggedInUserView.xaml`): Grid 2 cols (`*` / auto). Left = StackPanel with "User:" + user name TextBlocks. Right = FlexButton `Width=70` "MainMenu" (logout command).
- **DepartmentSelectorView** (`Samba.Modules.DepartmentModule/DepartmentSelectorView.xaml`): DockPanel of FlexButtons `MinWidth=70, MinHeight=30, Margin=5,0,0,0`, FontSize=12 inside.

---

#### Screen: Virtual keyboards (KeyboardView, KeyboardView3)

- **KeyboardView** (`Samba.Presentation.Controls/VirtualKeyboard/KeyboardView.xaml`): fixed `Width=836 Height=287`. Canvas with absolutely positioned Buttons (Height=50, Width=50 default; Backspace 95; Tab 64; Caps 78; Enter 123; Shift 92/109; Space 498; Up 71; Down 72). Auto-style: FontSize=18, Focusable=False. Backspace & Shift keys use `Path` geometry with `Fill=#FF333333` (vector icons).
- **KeyboardView3** (`Samba.Presentation.Controls/VirtualKeyboard/KeyboardView3.xaml`): 5-row grid layout, fully relative. Auto-style: FontWeight=Bold, Focusable=False, custom ControlTemplate with `Border BorderBrush=Gray Background=Gainsboro` (pressed → Background=Gray, Foreground=White). Backspace/Shift keys use the same `Path` icon.

---

#### Screen: PopupWindow / FeedbackWindow / SplashScreenForm / KeyboardWindow

- **PopupWindow** (`Samba.Presentation.Controls/Interaction/PopupWindow.xaml`): Window Style=None, Topmost, AllowsTransparency, Background=Transparent. ItemsControl of Buttons; each Button wraps a Border (Height=150, BorderBrush={Binding HeaderColor}, BorderThickness=2, CornerRadius=3) with a `LinearGradientBrush` from `{Binding ContentColor}` to `#FFFFFFFF`. TitleBar TextBlock: Background={Binding HeaderColor}, Foreground=White, FontSize=18 Bold. Content TextBlock: FontSize=12 Bold. Border animates Height 0→150 with `ElasticEase` easing (Oscillations=3, Springiness=8, Duration=0.5s).
- **FeedbackWindow** (`FeedbackWindow.xaml`): Window Style=ToolWindow, SizeToContent=WidthAndHeight. TextBlock Width=350, FontSize=30, Margin=30. OK Button: FontSize=30, Padding=15, Margin=10.
- **SplashScreenForm** (`SplashScreenForm.xaml`): 421×156, Window Style=None, AllowsTransparency. Border: BorderBrush=Black, BorderThickness=3, CornerRadius=5, Background=DarkSlateGray. Image: 366×71, Source=logo.png, Margin=10.
- **KeyboardWindow** (`KeyboardWindow.xaml`): 710×278, ResizeMode=CanResizeWithGrip, Window Style=None, Topmost. Border: BorderBrush=DarkBlue, BorderThickness=1, CornerRadius=5, Background=#AADDDDEE. Header bar: Background=DarkBlue, TextBlock "Samba Keyboard" White Bold 15. Two window control buttons: ▄ (minimize) and X (close), Width=50, Margin=3, FontWeight=Bold. TextBox: FontSize=20. Embedded `KeyboardView` inside `Viewbox`.

---

### Section 5 — Icon Mapping

The original codebase uses **NO icon font library** (no MaterialDesignIcons, no FontAwesome). Icons come from three sources:

1. **PNG/GIF/ICO files** under each project's `Images/` folder:
   - `apple-icon.png` — Shell header logo (`Samba.Presentation/Images/`)
   - `logo.png` — Splash screen (`Samba.Presentation.Controls/Images/`)
   - `Wallpaper3.jpg` — NavigationView background (`Samba.Modules.NavigationModule/Images/`)
   - `LanShutDown.icon.gif` — Login Exit button
   - `103.png`, `104.png`, `105.png`, `106.png` — Management module toolbar icons (add page, delete page, etc.)
   - `warning.png` — Error report view
   - `search.png`, `clear.png` — SearchTextBox inside Generic.xaml
2. **Per-menu-item images** bound through `FlexButton.ButtonImage="{Binding ImagePath}"` — these are user-configured per `ScreenMenuItem` in the menu editor.
3. **Inline `Path` vector geometry** on virtual-keyboard Backspace and Shift keys:
   - Backspace Path Data: `F1M555.0371,274.4893L552.7871...` (filled `#FF333333`)
   - Shift Path Data: `F1M269.5,262C269.026,262...` (filled `#FF333333`)

#### Suggested FontAwesome 6 Free equivalents for the priority buttons

| Button Label (SambaPOS) | Original Source | Suggested FA6 Free equivalent |
|--------------------------|-----------------|-------------------------------|
| Add Order / "Add\nOrder" | FlexButton text only | `fa-solid fa-plus` (`\f067`) |
| Modify Order | FlexButton text only | `fa-solid fa-pen-to-square` (`\f044`) |
| Cancel / CancelItem | FlexButton text only | `fa-solid fa-ban` (`\f05e`) |
| Move Ticket Line | FlexButton text only | `fa-solid fa-arrows-up-down-left-right` (`\f047`) |
| Change Price | FlexButton text only | `fa-solid fa-tag` (`\f02b`) |
| Tag (Ticket Tag) | FlexButton text only | `fa-solid fa-hashtag` (`\f292`) |
| Ticket Note | FlexButton text only | `fa-solid fa-note-sticky` (`\f249`) |
| + / - (Inc/Dec Quantity) | FlexButton text "+" / "-" | `fa-solid fa-plus` / `fa-solid fa-minus` |
| (+) / (-) (Inc/Dec Selection Qty) | FlexButton text "(+)" / "(-)" | `fa-solid fa-square-plus` / `fa-solid fa-square-minus` |
| Close / CloseAccountScreen | FlexButton text + ButtonColor=Red | `fa-solid fa-xmark` (`\f00d`) |
| Logout / MainMenu | FlexButton text | `fa-solid fa-right-from-bracket` (`\f2f5`) |
| Login (Submit) | SubmitButtonStyle (orange gradient) | `fa-solid fa-arrow-right-to-bracket` (`\f2f6`) |
| Exit (Login screen) | `LanShutDown.icon.gif` image | `fa-solid fa-power-off` (`\f011`) |
| Clear (Login pad) | FlexButton text "Clear" | `fa-solid fa-eraser` (`\f12d`) |
| C (Number pad clear) | FlexButton text "C", ButtonColor=Black | `fa-solid fa-delete-left` (`\f55a`) |
| Backspace (virtual keyboard) | Path geometry | `fa-solid fa-delete-left` (`\f55a`) |
| Shift (virtual keyboard) | Path geometry | `fa-solid fa-arrow-up` (`\f062`) |
| Caps (virtual keyboard) | text "Caps" | `fa-solid fa-arrow-up-from-bracket` (`\f093`) or `fa-solid fa-font` |
| Tab (virtual keyboard) | text "Tab" | `fa-solid fa-arrows-left-right` (`\f07e`) |
| Enter (virtual keyboard) | text "Enter" | `fa-solid fa-arrow-turn-down` (`\f349`) or `fa-solid fa-return` |
| Space (virtual keyboard) | text "Space" | `fa-solid fa-keyboard` (`\f11c`) |
| Tender All (NumberPadView) | FlexButton, ButtonColor=Purple | `fa-solid fa-hand-holding-dollar` (`\f4b0`) |
| 1/2, 1/3, 1/n | FlexButton, ButtonColor=RoyalBlue | `fa-solid fa-divide` (`\f529`) |
| Balance Mode | FlexButton, ButtonColor=Purple | `fa-solid fa-scale-balanced` (`\f24e`) |
| Page Nav (Dec / Inc) | FlexButton "‹" / "›" | `fa-solid fa-angle-left` / `fa-solid fa-angle-right` |
| Cash / Credit Card / Voucher (PaymentButtonsView) | FlexButton, per-payment-type color | `fa-solid fa-money-bill-wave` / `fa-solid fa-credit-card` / `fa-solid fa-ticket` |
| Print Ticket / Print Invoice / Print | FlexButton | `fa-solid fa-print` (`\f02f`) |
| Display Ticket | FlexButton | `fa-solid fa-receipt` (`\f543`) |
| Save (entity forms) | Button | `fa-solid fa-floppy-disk` (`\f0c7`) |
| Refresh (reports/explorer) | Button | `fa-solid fa-rotate-right` (`\f2f1`) |
| Work Period warning | TextBlock (no icon) | `fa-solid fa-triangle-exclamation` (`\f071`) |
| Message client status | Label (no icon) | `fa-solid fa-signal` (`\f012`) |
| Edit Mode (EntityDashboard context menu) | MenuItem text | `fa-solid fa-pen` (`\f304`) |
| Add Widget (EntityDashboard) | MenuItem text | `fa-solid fa-cube` (`\f1b2`) |
| Search (SearchTextBox) | `search.png` image | `fa-solid fa-magnifying-glass` (`\f002`) |
| Clear search | `clear.png` image | `fa-solid fa-circle-xmark` (`\f057`) |
| Wallpaper (NavigationView bg) | `Wallpaper3.jpg` image | (CSS background-image, not an icon) |
| Logo (Splash, Shell header) | `logo.png` / `apple-icon.png` | (brand image, not an icon) |
| Add Map / Delete Map (MapController) | Hyperlink text | `fa-solid fa-plus` / `fa-solid fa-trash` |
| Add Order Tag / Delete / Sort (OrderTagGroupView) | Hyperlink / context menu text | `fa-solid fa-plus` / `fa-solid fa-trash` / `fa-solid fa-arrow-up-z-a` |
| Add Category / Edit / Delete (ScreenMenuView) | Hyperlink text | `fa-solid fa-plus` / `fa-solid fa-pen` / `fa-solid fa-trash` |
| Stop Timer (ProductTimerEditor) | FlexButton | `fa-solid fa-stop` (`\f04d`) |

---

### Section 6 — Style / Resource Catalog

#### `Samba.Presentation/Common.xaml` (merged into App.xaml)

| Key | Type | Value | Notes |
|-----|------|-------|-------|
| `Settings` | `properties:Settings` | (singleton) | App settings holder |
| `LeftAlignedGridCell` | Style<DataGridCell> | BorderThickness=0; IsSelected→InactiveBorderBrush+WindowText; IsFocused→HighlightBrush+HighlightText | Used by DataGrids |
| `RightAlignedGridCell` | Style<DataGridCell> | BasedOn LeftAligned; TextBlock.TextAlignment=Right | |
| `CenterAlignedGridCell` | Style<DataGridCell> | Custom template: Grid + ContentPresenter VerticalAlignment=Center | |
| `RightAlignedCellStyle` | Style<DataGridCell> | Custom template: ContentPresenter HorizontalAlignment=Right | |
| `ItemsControlButtonStyle` | Style<Button> | Template strips chrome: just `<ContentPresenter HorizontalAlignment="Stretch"/>` | Used for list-item Buttons |
| `BorderlessTabControlStyle` | Style<TabControl> | Hides TabPanel (Col 0 width=0), ContentPresenter in Col 1; BG=SystemColors.ControlLight | Used everywhere tabs are hidden |
| `CollapsedTextStyle` | Style<TextBlock> | Margin=3; collapses when Text="" | |
| `IPhoneSteelBackground` | LinearGradientBrush | `#FF9097A3 → #FF444D5B` (vertical) | (unused in priority screens) |

#### `Samba.Presentation/Themes/MainExpanderResources.xaml`

| Key | Type | Value |
|-----|------|-------|
| `MainExpanderHeaderBackgroundBrush` | SolidColorBrush | `#FF3771C1` (blue) |
| `MainExpanderHeaderBorderBrush` | SolidColorBrush | Black |
| `MainExpanderContentBorderBrush` | SolidColorBrush | Black |
| `MainExpanderControlNormalForegroundBrush` | SolidColorBrush | White |
| `MainExpanderControlDisabledForegroundBrush` | SolidColorBrush | DarkGray |
| `MainExpanderControlDisabledBackgroundBrush` | SolidColorBrush | LightGray |
| `MainExpanderControlDisabledBorderBrush` | SolidColorBrush | LightGray |
| `ExpanderToggleButtonBackgroundBrush` | SolidColorBrush | White |
| `ExpanderToggleButtonMouseOverFillBrush` | SolidColorBrush | Green |
| `ExpanderToggleButtonPressedFillBrush` | SolidColorBrush | Yellow |
| `ExpanderToggleButton` | ControlTemplate<ToggleButton> | Chevron path `M 0 0 L 5 5 L 10 0 Z` (collapsed) / `M 0 5 L 5 0 L 10 5 Z` (expanded) |
| `MainViewExpander` | Style<Expander> | Header Border + Content Border, BorderThickness=1 | Used in `RuleView.xaml` |

#### `Samba.Presentation.Controls/Generic.xaml`

| Key | Type | Value |
|-----|------|-------|
| `VisibilityConverter`, `FontWeightConverter`, `NullValueConverter`, `NullBrushConverter` | Converters | (referenced everywhere via StaticResource) |
| `NameTokenTemplate` | DataTemplate | Border Silver 1px, CornerRadius=3, Background=WhiteSmoke, Padding=2, Margin=2,2,5,2 |
| `TabControlNormalBorderBrush` | SolidColorBrush | `#8C8E94` |
| `HeaderTemplateSortAsc` / `HeaderTemplateSortDesc` / `HeaderTemplateSortNon` | DataTemplate | 30px header with arrow Path |
| `BlueBackground` | Style<GridViewColumnHeader> | Background=LightSlateGray, Foreground=White |
| `SilverBackground` | Style<GridViewColumnHeader> | Background=Gray, Foreground=White |
| `BlueHeader` | Style<TextBlock> | Background=WhiteSmoke, Foreground=Black |
| `WrappedHeaderTemplate` | DataTemplate | 30px DockPanel with wrap TextBlock |
| `WrappedFooterTemplate` | DataTemplate | 25px DockPanel, FontSize=16 Bold |
| `ListViewItemExContainerStyle` | Style<ListViewItem> | Custom template using GridViewRowPresenter; IsSelected→HighlightBrush |
| `SearchTextBox_Background` | SolidColorBrush | White |
| `SearchTextBox_Foreground` | SolidColorBrush | Black |
| `SearchTextBox_Border` | LinearGradientBrush | `#FFABADB3 / #FFE2E3EA / #FFE3E9EF` |
| `SearchTextBox_BorderMouseOver` | LinearGradientBrush | `#FF5C97C1 / #FFB9D7EB / #FFC7E2F1` |
| `SearchTextBox_SearchIconBorder` | SolidColorBrush | White |
| `SearchTextBox_SearchIconBackground` | SolidColorBrush | White |
| `SearchTextBox_SearchIconBorder_MouseOver` | LinearGradientBrush | `#FFFFFFFF → #FFE5F4FC` |
| `SearchTextBox_SearchIconBackground_MouseOver` | LinearGradientBrush | `#FFE7F5FD / #FFD2EDFC / #FFB6E3FD / #FF9DD5F3` |
| `SearchTextBox_SearchIconBorder_MouseDown` | LinearGradientBrush | same as MouseOver border |
| `SearchTextBox_SearchIconBackground_MouseDown` | LinearGradientBrush | same as MouseOver bg |
| `SearchTextBox_LabelTextColor` | SolidColorBrush | Gray |
| (Default `SearchTextBox` style) | Style<SearchTextBox> | MinHeight=20, BorderThickness=1, LabelText="Search", includes 15×15 search.png icon |

#### `Samba.Presentation.Controls/OfficeTab.xaml`

| Key | Type | Value |
|-----|------|-------|
| `OfficeTabControl` | ControlTemplate<TabControl> | Left strip `#FFE9ECEF` + ContentPresenter Margin=15,5,0,0. TabItem template uses VisualStateManager with hoverShape (`#FFE5EEF9` bg, `#FFA1B7EA` border), buttonShape (RadialGradient `#FF5FA3F6 → #FF0C55B9`, border `#FF0343A6`). Tab text: Calibri 12pt. TabItem height = 40. |

#### `Lib/FlexButton/Themes/resXSButtonStyles.xaml`

| Key | Type | Value |
|-----|------|-------|
| `brushClearGlass` | SolidColorBrush | `#2F000000` (translucent black) |
| `brushOuterBorder` | SolidColorBrush | `#4CFFFDFF` (translucent cyan) |
| `brushInnerBorder` | SolidColorBrush | `#99000000` |
| `brushGlow` | SolidColorBrush | `#FF929CFC` (lavender glow) |
| `GlowOn` / `GlowOff` | Storyboard | Opacity 0→1 (0.1s) / 1→0 (0.5s) on `Glow` border |
| `ColorToAlphaColorConverter`, `HighlightCornerRadiusConverter`, `BrightnessToColorConverter`, `fontSizeToViewBoxDirectionConverter` | Converters | used internally by FlexButton template |

#### `Lib/FlexButton/Themes/resXSButton.xaml`

| Key | Type | Value |
|-----|------|-------|
| `stringTemplate` | DataTemplate | Viewbox + TextBlock (FontSize bound to FlexButton.FontSize) |
| `defaultTemplate` | DataTemplate | empty |
| `buttonContentTemplateSelector` | local:ButtonContentTemplateSelector | picks stringTemplate for string content |
| (Default `FlexButton` style) | Style<FlexButton> | Focusable=False, CornerRadius=4, OuterBorderThickness=1, InnerBorderThickness=1, FontWeight=Bold, HighlightMargin=1,1,0,0, HighlightBrightness=184. Template has OuterBorder + InnerBorder + Glow + Highlight (linear gradient brightness→ButtonColor) + Image + ContentPresenter. Triggers: IsPressed→Opacity 0.9 on borders, content shifted, Color=Gray; IsEnabled False→Foreground=Gray; IsMouseOver→GlowOn/GlowOff storyboard + Image Opacity=1. |

#### `Lib/FlexButton/FlexButton.cs` — code-level defaults

Constructed in instance constructor (`FlexButton.cs:163-180`):
- `HighlightMargin = 0`
- `HighlightBrightness = 100`
- `GlowColor = Brushes.WhiteSmoke`
- `OuterBorderBrush = Brushes.Gray`
- `InnerBorderBrush = LinearGradientBrush(White → LightGray, 90°)`
- `InnerBorderThickness = 1`
- `CornerRadius = 3`  *(note: style overrides this to 4)*
- `UpdateButtonColor(this, Brushes.Gainsboro)` → default Background = **Gainsboro**
- `Foreground = Brushes.Black`

`UpdateButtonColor` (FlexButton.cs:209-222): When `ButtonColor` changes:
- `InnerBorderBrush = LinearGradient(White → Transparent, 90°) Opacity=0.5`
- `OuterBorderBrush =` color.Lerp(Black, 0.3) if button color brightness > 150 else color.Lerp(Black, 0)
- `Background = ButtonColor`
- `GlowColor =` color.Lerp(White, 0.65)
- `Foreground =` White if brightness < 150 else Black (auto-contrast)

`UpdateForeground` (FlexButton.cs:232-239): if disabled, Foreground = color.Lerp(Black, 0.25).

#### `Samba.Modules.ManagementModule/Resources.xaml`

| Key | Type | Value |
|-----|------|-------|
| `ClosableTabItemTemplate` | DataTemplate | 150px DockPanel with 16×16 X Button (Courier, 9pt, Bold) + ContentPresenter |
| `ViewSelector` | local:ViewSelector | (template selector) |
| `ViewsTemplate` | DataTemplate | TabControlEx with custom template (TabPanel + Border Padding=6) |
| `CommandsTemplate` | DataTemplate | Outlook bar TabControl template (see Section 4 ManagementView) |

Brushes inside `OutlookTab` template:
- `LabelHighlightBrush` = #FFFFFF
- `CaptionBrush` = #15428B
- `BorderBrush` = #6593CF
- `LabelBrush` = `#E3EFFF → #AFD2FF`
- `ButtonNormalBrush` = `#E3EFFF → #C4DDFF → #ADD1FF → #C0DBFF`
- `ButtonSelectedBrush` = `#FFD9AA → #FFBB6E → #FFAB3F → #FEE17A`
- `ButtonPressedBrush` = `#FFBD69 → #FFAC42 → #FB8C3C → #FED364`
- `ButtonHoverBrush` = `#FFFEE4 → #FFE8A7 → #FFD767 → #FFE69E`

#### Per-screen implicit styles (in UserCode.Resources)

| Location | Style key | Target | Key values |
|----------|-----------|--------|------------|
| `TicketOrdersView.xaml:11` | `GroupLabelStyle` | TextBlock | Collapses when Name is null |
| `MenuItemSelectorView.xaml:99-122` | (default ListBoxItem) | ListBoxItem | Border WhiteSmoke, BorderBrush=Gray, CornerRadius=4, Margin=0,0,4,4; IsSelected→BorderThickness=2 + Foreground=Red |
| `TicketListView.xaml:36-48` | `ButtonClick` / `Release` Storyboards | Border Background | Silver→Silver (press), Silver→Gainsboro (release, 0.2s) |
| `OrderSelectorView.xaml:33-45` | `ButtonClick` / `Release` Storyboards | Border Background | Silver→Silver (press), Silver→Transparent (release, 0.5s) |
| `TicketListerControl.xaml:11-32` | `FadeIn` / `FadeStop` Storyboards, `FadingBorder` Style | Border Opacity | 0.2→1 over 0.2s on MouseDown |
| `LoginPadControl.xaml:22-84` | `GreenButtonStyle` | Button | Green gradient + ButtonChrome template, Bold 24pt |
| `LoginPadControl.xaml:85-153` | `SubmitButtonStyle` | Button | Orange gradient + ButtonChrome template, Bold 24pt |
| `KeyboardView3.xaml:12-48` | (default Button) | Button | Border `BorderThickness=1,1,0,0` BorderBrush=Gray Background=Gainsboro; pressed→Gray bg + White fg |
| `OrderTagGroupEditorView.xaml:11-59` | (default GroupBox) | GroupBox | Custom chrome with rounded corners + header on ControlBrush background |
| `AccountDetailsView.xaml:106-115` | `hs` / `hsr` | GridViewColumnHeader | Gray BG / White FG; right-aligned + Bold for `hsr` |

---

### Section 7 — Touch-friendly Properties

#### Explicit touch target sizes already in the XAML

| Screen / Control | Property | Value | Source |
|------------------|----------|-------|--------|
| TicketView command column FlexButtons | Height | 65 | `TicketView.xaml:77` |
| TicketView under-ticket automation FlexButtons | Height | 65 | `TicketView.xaml:45,62` |
| MenuItemSelector page nav | Height | 45 | `MenuItemSelectorView.xaml:183,185` |
| MenuItemSelector close-menu button | Height | 40 | `MenuItemSelectorView.xaml:78` |
| MenuItemSelector alpha buttons | MaxHeight | 40 | `MenuItemSelectorView.xaml:246` |
| OpenTicketsView ticket buttons | Height | 90 | `OpenTicketsView.xaml:24` |
| TicketTagList / TicketEntityList / TicketTypeList Close button | Height | 60 | `TicketTagListView.xaml:27` |
| AccountDetailsView right-column buttons | Height | 60 | `AccountDetailsView.xaml:136-149` |
| EntitySearchView right-column buttons | Height | 60 | `EntitySearchView.xaml:59-75` |
| AccountSelectorView side buttons | Height | 60 | `AccountSelectorView.xaml:124-141` |
| EntityEditorView side buttons | Height | 60 | `EntityEditorView.xaml:26-32` |
| DocumentCreatorView side buttons | Height | 60 | `DocumentCreatorView.xaml:39-41` |
| OrderTagGroupEditorView portions/tags | Height | 60 | `OrderTagGroupEditorView.xaml:80,162,164` |
| ForeignCurrencyButtons | Height | 60 | `ForeignCurrencyButtonsView.xaml:16` |
| PaymentEditorView command row | MinHeight / MaxHeight | 60 / 100 | `PaymentEditorView.xaml:42` |
| PaymentEditorView tendered region | Height | 105 (fixed) | `PaymentEditorView.xaml:40` |
| PaymentButtonsView panel | MinHeight | 60 | `PaymentButtonsView.xaml:12` |
| TicketNoteEditor Close | Height | 65 | `TicketNoteEditorView.xaml:18` |
| TicketLogViewer Close | Height | 65 | `TicketLogViewerView.xaml:15` |
| AutomationCommandSelector items | MinHeight | 65 | `AutomationCommandSelectorView.xaml:18` |
| AutomationCommandValueSelector items | MinHeight | 65 | `AutomationCommandValueSelectorView.xaml:15` |
| TicketTagEditor items | MaxHeight | 65 | `TicketTagEditorView.xaml:34` |
| Login Exit button | Height / MinWidth | 50 / 110 | `LoginView.xaml:32` |
| LoginPad buttons | (auto-grid, ~80-100px tall at 350×400 panel) | — | `LoginPadControl.xaml:170-193` |
| DepartmentSelectorView buttons | MinHeight / MinWidth | 30 / 70 | `DepartmentSelectorView.xaml:15` |
| LoggedInUserView MainMenu button | Width | 70 | `LoggedInUserView.xaml:13` |
| KeyboardView keys | Height × Width | 50 × 50 (default), 50×95 (Bksp), 50×123 (Enter), 50×498 (Space) | `KeyboardView.xaml:19-81` |
| PopupWindow items | Height | 150 | `PopupWindow.xaml:24` |
| FeedbackWindow OK button | Padding | 15 | `FeedbackWindow.xaml:12` |
| Generic Save button | MinWidth | 70 | many entity views |
| Generic MinHeight on text fields (FilteredTextBox) | MinWidth | 50 | entity screens |

#### Touch inertia / kinetic scrolling

Used in:
- `TicketOrdersView.xaml:20` — `UIControls:KineticBehaviour.HandleKineticScrolling="True"` on the orders ScrollViewer.
- `MenuItemSelectorView.xaml:41,159` — Kinetic scroll on categories list and menu items.
- `OpenTicketsView.xaml:12` — Kinetic scroll on open tickets.
- `OrderSelectorView.xaml:18` — Kinetic scroll on payment order selector.
- `EntitySearchView.xaml` (implied via ScrollViewer on ListView).
- `TicketListerControl.xaml:35` — Kinetic scroll on ticket lister widget.
- `MenuItemView.xaml:6` — Kinetic scroll on the menu item editor.
- `EntityScreenView.xaml` (via ScrollViewer on General tab).

#### Tap feedback / press animations

| Screen | Mechanism | Source |
|--------|-----------|--------|
| FlexButton (everywhere) | IsPressed trigger: OuterBorder/InnerBorder Opacity=0.9, content grid rows/cols shift (R1 5→10, R2 90→85, C1 4→7, C2 92→86), Glow opacity 0→0.5, Highlight opacity →0.5, Color→Gray | `Lib/FlexButton/Themes/resXSButton.xaml:121-134` |
| FlexButton hover | GlowOn Storyboard (Opacity 0→1 over 0.1s), GlowOff (1→0 over 0.5s) | `resXSButtonStyles.xaml:11-23` |
| KeyboardView3 buttons | IsPressed→Background=Gray, Foreground=White | `KeyboardView3.xaml:40-43` |
| NavigationView tiles | IsPressed→textbox Margin 5→20 (caption nudges down) | `NavigationView.xaml:75-77` |
| TicketListView ticket items | `ButtonClick` Storyboard (Background→Silver instantly) + `Release` Storyboard (Silver→Gainsboro over 0.2s) | `TicketListView.xaml:36-48` |
| OrderSelectorView items | `ButtonClick` + `Release` (Silver→Transparent over 0.5s) | `OrderSelectorView.xaml:33-45` |
| TicketListerControl | `FadeIn` Storyboard (Opacity 0.2→1 over 0.2s) on MouseDown; `FadeStop` on MouseUp | `TicketListerControl.xaml:11-32` |
| PopupWindow | Loaded EventTrigger: Height 0→150 over 0.5s with `ElasticEase` (Oscillations=3, Springiness=8) + Visibility delayed 0.001s | `PopupWindow.xaml:31-53` |
| OpenTickets buttons | No explicit press animation — relies on FlexButton press trigger only. |
| LoginPad GreenButtonStyle | Uses `Microsoft_Windows_Themes:ButtonChrome` with `RenderMouseOver` / `RenderPressed` (Aero chrome) | `LoginPadControl.xaml:35-38` |

#### RenderTransform / LayoutTransform usage

| Location | Transform | Purpose |
|----------|-----------|---------|
| `Samba.Presentation/Shell.xaml:15-17` | `ScaleTransform` (data-bound from `WindowScale` setting) on `MainGrid.LayoutTransform` | Whole-UI zoom for high-DPI / touch |
| `Samba.Modules.TicketModule/TicketExplorerView.xaml:27,32` | `ScaleTransform ScaleX=2 ScaleY=2` on DatePicker `LayoutTransform` | Enlarges date pickers for touch |
| `Samba.Presentation.Controls/VirtualKeyboard/KeyboardView.xaml:9` | (none — fixed `Width=836 Height=287`) | Used inside `Viewbox` in `KeyboardWindow` and `ManagementView` |
| `Lib/FlexButton/Themes/resXSButton.xaml:81-95` | `Image.OpacityMask` with `LinearGradientBrush.RelativeTransform` containing `RotateTransform Angle=-90` | Image opacity fades bottom→right |
| `Samba.Modules.LoginModule/LoginPadControl.xaml:39-46, 108-115` | `TransformGroup` (Scale/Skew/Rotate/Translate) on `ButtonChrome.RenderTransform` | (default empty transforms, no actual visual effect) |
| `Samba.Modules.EntityModule/EntityDashboardView.xaml:10` | `Viewbox Stretch=Uniform` | Scales table map to fit |
| `Samba.Modules.BasicReports/ReportView.xaml:42` | `FlowDocumentScrollViewer` (no transform) | — |
| `Samba.Modules.PaymentModule/ReturningAmountView.xaml:10` | `Viewbox` | Scales change amount to fit |
| `Samba.Modules.PosModule/OpenTicketsView.xaml:31,34` | `Viewbox MaxHeight=50` / `MaxHeight=40` | Scales ticket title and ticket time/total |
| `Samba.Modules.PosModule/TicketListView.xaml:20,23,69,90,106` | `Viewbox` for list name, total, ticket tags, resource names, remaining amount | Auto-fit text |

---

## Summary of Findings

1. **Color system is informal** — no central palette file. Named colors (Silver, Gainsboro, WhiteSmoke, DarkGray, Red, Green, Purple, RoyalBlue, Black, DarkGreen, DarkBlue, Gray, LightSteelBlue, LightSlateGray, LightGoldenrodYellow, DarkSlateGray) dominate. Hex colors appear only in: Shell background, FlexButton chrome, LoginPad gradients, NavigationView tile chrome, OfficeTab chrome, Outlook bar gradients, PopupWindow, and a handful of borders.
2. **The "Pago" button is NOT statically defined** — it is generated from `UnderTicketAutomationCommands` whose `Color` and `FontSize` come from the user's AutomationCommand configuration. The XAML only supplies `Height=65, Margin=0,0,3,3`. In a typical SambaPOS install, the Pago automation command is configured with an orange color (the `SubmitButtonStyle` orange `#FFFBE0A3 → #FFD24D00` gradient on the Login pad is the closest match in the codebase).
3. **FlexButton is the workhorse**: every interactive button on POS / Payment / Ticket / Modifier screens is a `FlexButton`. It auto-computes `Foreground` (Black or White) based on `ButtonColor` brightness (`Brightness()` formula in `FlexButton.cs:224-230`), auto-derives `OuterBorderBrush` from a Lerp toward Black, and animates a `Glow` on hover.
4. **Touch is well-supported**: minimum target sizes are 45–65 px tall for most buttons, 90 px for open-ticket tiles, 50×50 for keyboard keys. Kinetic scrolling (`KineticBehaviour.HandleKineticScrolling`) is applied to every scrollable list. Press feedback is implemented via FlexButton's `IsPressed` trigger (border opacity + content shift + glow) and via per-screen `Storyboard` animations (Silver→Gainsboro/Transparent).
5. **No icon font is used** — icons are PNG/GIF/ICO images or inline `Path` geometry. For the web clone, FontAwesome 6 Free (suggested in Section 5) is the recommended replacement.
6. **Typography is inconsistent** — font sizes range from 8pt (Outlook tab items) to 40 (NavigationView captions, ChangeTemplates buttons) to 35 (AccountDetailsView name/balance). Most text uses the WPF default (Segoe UI on Windows). Explicit families: Calibri (OfficeTab), Tahoma (Outlook bar), Lucida Console (Shell clock), Courier (close-tab X).
7. **Layout is mostly star-proportioned Grids** with a few fixed sizes (PaymentEditor row 0 = 105, LoginView panel = 350×400, KeyboardView = 836×287). The Shell uses a `ScaleTransform` on `LayoutTransform` for whole-UI zoom based on the `WindowScale` percentage setting.
8. **Resource dictionaries** are concentrated in `Samba.Presentation/Common.xaml` (which merges `MainExpanderResources.xaml` and `Samba.Presentation.Controls/Generic.xaml`), plus per-module `Resources.xaml` files in `ManagementModule` and `OfficeTab.xaml` in `Samba.Presentation.Controls`.
9. **Priority screens that DO NOT exist as separate files in V3**:
   - `TicketView.xaml` exists ✅
   - `ProductSelectorView.xaml` → the equivalent is `MenuItemSelectorView.xaml` ✅
   - `TicketItemSelectorView.xaml` → does not exist (no such file)
   - `PaymentView.xaml` → the equivalent is `PaymentEditorView.xaml` ✅
   - `PaymentScreenView.xaml` → does not exist (no such file)
   - `TableMap` / `TableSelectorView.xaml` / `TableScreenView.xaml` → tables are an `EntityScreen` rendered by `EntityDashboardView.xaml` + `EntitySelectorView.xaml`. There is no dedicated Table* file.
   - `LoginView.xaml` ✅
   - `MainMenuView.xaml` / `NavigationMenuView.xaml` → equivalent is `NavigationView.xaml` ✅
   - `TicketEditorView.xaml` / `TicketQuantityView.xaml` → do not exist as separate files; ticket editing happens inline in `TicketView` + `TicketOrdersView`, and quantity editing uses the `+`/`-` FlexButtons + the embedded numeric pad in `MenuItemSelectorView`.
   - `NumericPadView.xaml` → equivalent is `NumberPadView.xaml` (in PaymentModule) and the inline numeric pad in `MenuItemSelectorView.xaml` (rows 4×3).
   - `TicketTagView.xaml` → equivalent is `TicketTagEditorView.xaml` (in ModifierModule) + `TicketTagListView.xaml` (in PosModule).
   - `DashboardView.xaml` → equivalent is `EntityDashboardView.xaml`.
   - `SettlementView.xaml` → does not exist (settlements are configured via `ChangePaymentTypeView.xaml` and `PaymentTypeView.xaml` in TicketModule).
   - `VoidItemsView.xaml` → does not exist (voiding is done via `CancelItemCommand` in TicketView and `OrderTagGroupEditorView` with "Toggle Remove Mode").
   - `DiscountView.xaml` → does not exist (discounts are `CalculationSelectorView.xaml` + `CalculationTypeView.xaml` in TicketModule).
   - `AutomationView.xaml` → equivalent is `AutomationCommandView.xaml` + `RuleView.xaml` + `RuleActionView.xaml` + `TriggerView.xaml` + `ScriptView.xaml` in AutomationModule.

This completes Task 0-C. The next step is to use this catalog to build a CSS variable palette and Tailwind component classes that mirror these dimensions, colors, and font sizes for the web clone.
