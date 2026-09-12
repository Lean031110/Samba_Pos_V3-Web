# BUSINESS RULES ENGINE — SambaPOS V3

> Pseudocode for the web clone. Every line that affects money or state is annotated with the
> original C# source: `file:line`. The web-clone developer should translate this pseudocode
> 1:1 into TypeScript/JavaScript (using `decimal.js` for monetary math — **never `number`**).
>
> Source repo: `/home/z/my-project/samba-web-clone/source/`
> Critical files:
> - `Samba.Domain/Models/Tickets/Ticket.cs` (862 lines — heart of the system)
> - `Samba.Domain/Models/Tickets/Order.cs` (528 lines)
> - `Samba.Domain/Models/Tickets/Calculation.cs` (67 lines — the discount/service/rounding engine)
> - `Samba.Domain/Models/Tickets/TaxValue.cs` (66 lines — the tax formula)
> - `Samba.Domain/Models/Tickets/ProductTimerValue.cs` (69 lines — time-based pricing)
> - `Samba.Domain/Models/Accounts/AccountTransaction.cs` (234 lines — double-entry with auto-reverse)
> - `Samba.Domain/Builders/TicketBuilder.cs` (151 lines)
> - `Samba.Domain/Builders/OrderBuilder.cs` (192 lines)
> - `Samba.Presentation.Services/Implementations/TicketModule/TicketService.cs`
> - `Samba.Presentation.Services/Implementations/TicketModule/PaymentEditor.cs`
> - `Samba.Services/Implementations/PrinterModule/Tools/LinePrinter.cs` (ESC/POS)
> - `Samba.Infrastructure/Settings/LocalSettings.cs` (`Decimals = 2`)

---

## 0. Global Constants & Helpers

```pseudo
# Source: Samba.Infrastructure/Settings/LocalSettings.cs:78
DECIMALS = 2                  # hardcoded; do NOT change without understanding the implications

# Source: decimal.Round(value, n) in C# defaults to MidpointRounding.ToEven (banker's rounding)
# Source: decimal.Round(value, n, MidpointRounding.AwayFromZero) uses schoolbook rounding
# CRITICAL: SambaPOS mixes both modes — preserve exactly!

function roundBankers(value, decimals = DECIMALS):
    # JS equivalent:
    # const f = Math.pow(10, decimals);
    # const n = value * f;
    # const isHalf = Math.abs(n % 1) === 0.5;
    # if (isHalf) return Math.sign(n) * Math.round(Math.abs(n) % 2 === 0 ? Math.floor(Math.abs(n)) : Math.ceil(Math.abs(n))) / f;
    # return Math.round(n) / f;
    # OR: use decimal.js with Decimal.ROUND_HALF_EVEN
    return Decimal.round(value, decimals, ROUND_HALF_EVEN)

function roundAway(value, decimals = DECIMALS):
    # JS equivalent: Math.sign(value) * Math.round(Math.abs(value) * Math.pow(10, decimals)) / Math.pow(10, decimals)
    # OR: decimal.js with Decimal.ROUND_HALF_UP
    return Decimal.round(value, decimals, ROUND_HALF_UP)   # HALF_UP matches AwayFromZero for positives

# Auto-contrast foreground (used by FlexButton and table tiles)
function pickForeground(hexColor):
    r = parseHex(hexColor, 0, 2)
    g = parseHex(hexColor, 2, 2)
    b = parseHex(hexColor, 4, 2)
    luma = 0.2126 * r + 0.7152 * g + 0.0722 * b
    return luma < 128 ? '#FFFFFF' : '#000000'
```

---

## 1. Ticket Lifecycle State Machine

**Source:** `Ticket.cs` (no formal state machine; encoded as `(IsClosed, IsLocked)` booleans + JSON `TicketStates`).

```
                                  ┌──────────────┐
                                  │     New      │  (Id=0, IsClosed=false, IsLocked=false)
                                  │ TicketBuilder│
                                  │   .Build()   │
                                  └──────┬───────┘
                                         │ Order added / Tag set / Entity linked
                                         ▼
                                  ┌──────────────┐
                                  │     Open     │  (Orders > 0, IsClosed=false, IsLocked=false)
                                  │   (Active)   │
                                  └──────┬───────┘
                                         │ CloseTicket() + LockTicket()
                       ┌─────────────────┘  OR  user clicks "Pay" then "Close"
                       ▼
                  ┌──────────┐
                  │  Locked  │  (IsLocked=true; Orders have Locked=true;
                  └────┬─────┘   adding items requires AddItemsToLockedTickets permission)
                       │
                       │ GetRemainingAmount() == 0
                       ▼
                  ┌──────────┐
                  │   Paid   │  (still IsClosed=false, but RemainingAmount=0)
                  └────┬─────┘
                       │ MarkTicketAsClosed action fires (typically on TicketClosing event)
                       │ Ticket.Close()  [Ticket.cs:79]
                       │   requires: RemainingAmount == 0 AND !HasActiveTimers()
                       ▼
                  ┌──────────┐
                  │  Closed  │  (IsClosed=true; PaidItems cleared;
                  └──────────┘   zero-amount AccountTransactions removed)
```

### Derived predicates

```pseudo
function isTicketNew(ticket):    return ticket.Id == 0
function isTicketOpen(ticket):   return !ticket.IsClosed && !ticket.IsLocked && ticket.Orders.length > 0
function isTicketLocked(ticket): return ticket.IsLocked == true
function isTicketPaid(ticket):   return !ticket.IsClosed && ticket.GetRemainingAmount() == 0 && ticket.Payments.length > 0
function isTicketClosed(ticket): return ticket.IsClosed == true
```

### OrderState state machine (free-form JSON)

States are stored as JSON in `Order.OrderStates` and named by convention. The built-in automation rules use `Status` as the group name:

| State | Trigger | Effect |
|-------|---------|--------|
| New | OrderBuilder.Build() | Default |
| Submitted | OrderNumber assigned at CloseTicket | (implicit) |
| Void | `UpdateOrderState` action with `Status=Void` | `CalculatePrice=false` (excluded from totals) |
| Gift | `UpdateOrderState` action with `Status=Gift` | `CalculatePrice=false` + visual indicator |
| Cancelled | `UpdateOrderState` action with `Status=Cancelled` | Excluded from reports |

---

## 2. CreateTicket Flow

**Source:** `PosViewModel.cs:290` → `TicketService.cs:111` → `TicketService.cs:124` → `TicketBuilder.cs:33` → `Ticket.cs:26`

### Step-by-step pseudocode

```pseudo
# ENTRY POINTS:
# 1. UI button on dashboard → EventTopicNames.CreateTicket → PosViewModel.CreateTicket()
# 2. Entity selected with no open ticket → PosViewModel.OnEntitySelectedForTicket → OpenTicket(0)
# 3. Automation action "CreateTicket" → ActionProcessors.CreateTicket

function PosViewModel.CreateTicket():                                # [PosViewModel.cs:290]
    if SelectedTicket != null:
        capturedEntities = SelectedTicket.TicketEntities
            .Where(te => te.EntityTypeAssignment.CopyToNewTickets).ToList()
        CloseTicket()                                                # see Section 7
    OpenTicket(0)                                                    # [PosViewModel.cs:450]
    foreach entity in capturedEntities:
        _ticketService.UpdateEntity(SelectedTicket, entity)          # [TicketService.cs:104]

function PosViewModel.OpenTicket(ticketId):                          # [PosViewModel.cs:450]
    _applicationStateSetter.SetApplicationLocked(true)
    SelectedTicket = _ticketService.OpenTicket(ticketId)             # [TicketService.cs:111]

function TicketService.OpenTicket(ticketId):                         # [TicketService.cs:111]
    Debug.Assert(_applicationState.CurrentDepartment != null)
    if ticketId == 0:
        ticket = CreateTicket()                                      # [TicketService.cs:124]
    else:
        ticket = _ticketDao.OpenTicket(ticketId)                     # [TicketDao.cs:40]
        # EF Load with Includes:
        #   Orders, ProductTimerValue, TicketEntities, Calculations,
        #   Payments, PaidItems, ChangePayments
    _applicationState.NotifyEvent("TicketOpened", {Ticket, OrderCount: ticket.Orders.Count})
    return ticket

function TicketService.CreateTicket():                               # [TicketService.cs:124]
    account = _cacheService.GetAccountById(
        _applicationState.CurrentTicketType.SaleTransactionType.DefaultTargetAccountId)
    result = TicketBuilder.Create(
        _applicationState.CurrentTicketType,
        _applicationState.CurrentDepartment.Model)                   # [TicketBuilder.cs:28]
        .WithExchangeRate(GetExchangeRate(account))
        .WithCalculations(
            _applicationState.GetCalculationSelectors()
                .Where(x => string.IsNullOrEmpty(x.ButtonHeader))    # auto-applied calcs only
                .SelectMany(y => y.CalculationTypes))
        .Build()                                                     # [TicketBuilder.cs:33]
    _applicationState.NotifyEvent("TicketCreated", {Ticket: result, TicketTypeName: result.TicketType.Name})
    return result

function TicketBuilder.Build():                                      # [TicketBuilder.cs:33]
    if _ticketType == null or _department == null: throw

    result = new Ticket {                                            # [Ticket.cs:26]
        TicketTypeId:        _ticketType.Id,
        DepartmentId:        _department.Id,
        ExchangeRate:        _exchangeRate,                  # default 1
        TaxIncluded:         _ticketType.TaxIncluded,
        TransactionDocument: new AccountTransactionDocument(),
        Date:                DateTime.Now,
        LastPaymentDate:     DateTime.Now,
        LastOrderDate:       DateTime.Now,
        LastUpdateTime:      DateTime.Now,
        IsClosed:            false,
        IsLocked:            false,
        TicketNumber:        null,                  # assigned at first Save (CloseTicket)
        TicketTags:          null,                  # null until first SetTagValue
        TicketStates:        null,                  # null until first SetStateValue
    }

    foreach orderData in _orders:
        result.AddOrder(orderData.Order, orderData.TaxTemplates, orderData.Template, orderData.UserName)
                                                                     # [Ticket.cs:232]
    foreach calc in _calculations:
        result.AddCalculation(calc, calc.Amount)                     # [Ticket.cs:379]

    result.Recalculate()                                             # [Ticket.cs:656] — see Section 4
    return result
```

### Ticket Number Generation (deferred to first Save)

```pseudo
function TicketService.UpdateTicketNumber(ticket, numerator):       # [TicketService.cs:238]
    if ticket.TicketNumber == null:
        ticket.TicketNumber = _settingService.GetNextString(numerator.Id)
                                                                     # [SettingService.cs:84]
        # SettingDao.GetNextString atomically increments Numerator.Number
        # with optimistic-concurrency retry on DbUpdateConcurrencyException
                                                                     # [SettingDao.cs:22]
        # Returns Number.ToString(NumberFormat) e.g. "0001"
                                                                     # [Numerator.cs:12]
        # Update the sale AccountTransaction description to include ticket number
        saleTxn = ticket.TransactionDocument.AccountTransactions
            .FirstOrDefault(a => a.AccountTransactionTypeId
                == ticket.TicketType.SaleTransactionType.Id)
        if saleTxn != null:
            saleTxn.UpdateDescription("{name} [#{ticketNumber}]")   # [AccountTransaction.cs]
```

### WorkPeriod linking

**IMPORTANT:** WorkPeriod is **NOT** a foreign key. The link is implicit via `Ticket.Date` falling within `[WorkPeriod.StartDate, WorkPeriod.EndDate]`. Reports filter on this date range. The "current work period" is held in memory by `IApplicationState.CurrentWorkPeriod`.

### Department linking

Set at `TicketBuilder.Build()` time: `ticket.DepartmentId = _department.Id`. The Department carries `WarehouseId`, `TicketTypeId`, `ScreenMenuId`, `PriceTag`, `TicketCreationMethod` — these are read at runtime via `_applicationState.CurrentDepartment`.

### Table linking

There is **no `Table` entity** in SambaPOS V3. Tables are `Entity` rows whose `EntityType.Name == "Tables"` (or similar). Linking happens via `Ticket.UpdateEntity(...)`:

```pseudo
function Ticket.UpdateEntity(entity):                                # [Ticket.cs:620]
    existing = TicketEntities.FirstOrDefault(te => te.EntityTypeId == entity.EntityTypeId)
    if existing != null:
        if entity.Id == 0:
            TicketEntities.Remove(existing)        # unlink
        else:
            existing.EntityId = entity.Id
            existing.EntityName = entity.Name
            existing.EntityCustomData = entity.CustomData
            existing.AccountId = entity.AccountId
            existing.AccountTypeId = entity.EntityType.AccountTypeId
    elif entity.Id > 0:
        TicketEntities.Add(new TicketEntity {                       # [TicketEntity.cs:10]
            EntityTypeId: entity.EntityTypeId,
            EntityId: entity.Id,
            AccountId: entity.AccountId,
            AccountTypeId: entity.EntityType.AccountTypeId,
            EntityName: entity.Name,
            EntityCustomData: entity.CustomData,
        })
```

---

## 3. AddItem Flow

**Source:** User taps product button → `MenuItemSelectorViewModel.OnMenuItemCommandExecute` → `PosViewModel.OnMenuItemSelected` → `TicketOrdersViewModel.AddOrder` → `TicketService.AddOrder` → `Ticket.AddOrder` → `OrderBuilder.Build` → `TicketService.RecalculateTicket`.

```pseudo
# USER taps a product button in MenuItemSelectorView
function MenuItemSelectorViewModel.OnMenuItemCommandExecute(screenMenuItem):  # [MenuItemSelectorViewModel.cs:259]
    selectedMultiplier = parseNumeric(NumeratorValue) ?? 1
    quantity = selectedMultiplier > 1
        ? selectedMultiplier
        : (screenMenuItem.Quantity > 1 ? screenMenuItem.Quantity : 1)
    data = new ScreenMenuItemData {
        ScreenMenuItem: screenMenuItem,
        Quantity: quantity,
    }
    data.PublishEvent("ScreenMenuItemDataSelected")

function PosViewModel.OnMenuItemSelected(event):                    # [PosViewModel.cs:274]
    if SelectedTicket == null:
        OpenTicket(0)
        if _lastSelectedEntity != null:
            _ticketService.UpdateEntity(SelectedTicket, _lastSelectedEntity)
    _ticketOrdersViewModel.AddOrder(data)
    DisplaySingleTicket()

function TicketOrdersViewModel.AddOrder(data):                      # [TicketOrdersViewModel.cs:130]
    ClearSelectedOrders()
    order = _ticketService.AddOrder(SelectedTicket,
        data.ScreenMenuItem.MenuItemId,
        data.Quantity,
        data.ScreenMenuItem.ItemPortion,
        "")                                                          # [TicketService.cs:618]
    if order != null:
        # Apply screen-menu-item-defined tags / states / automation commands
        UpdateOrderTags(SelectedTicket, order, data.ScreenMenuItem.OrderTags)   # [TicketOrdersViewModel.cs:151]
        UpdateOrderStates(SelectedTicket, order, data.ScreenMenuItem.OrderStates)  # [TicketOrdersViewModel.cs:180]
        ExecuteAutomationCommand(SelectedTicket, order,
            data.ScreenMenuItem.AutomationCommand,
            data.ScreenMenuItem.AutomationCommandValue)              # [TicketOrdersViewModel.cs:196]
        UpdateOrderColor(order)
        if data.ScreenMenuItem.AutoSelect:
            order.ToggleSelection()

function TicketService.AddOrder(ticket, menuItemId, quantity, portionName, orderState):  # [TicketService.cs:618]
    # ---- Permission check ----
    if ticket.IsLocked && !user.HasPermission("AddItemsToLockedTickets"): return null
    if ticket.IsClosed: return null   # CanSubmit == !IsClosed

    # ---- Lookup menu item + portion + price tag + timer + tax templates ----
    menuItem   = _cacheService.GetMenuItem(x => x.Id == menuItemId)
    portion    = _cacheService.GetMenuItemPortion(menuItemId, portionName)   # [CacheService.cs:92]
                                                              # returns first portion if name not found
    priceTag   = _applicationState.CurrentDepartment.PriceTag
    timer      = _applicationState.GetProductTimer(menuItemId)
    taxTemps   = _applicationState.GetTaxTemplates(menuItemId).ToList()

    # ---- Build the Order via fluent builder ----
    order = ticket.AddOrder(
        _applicationState.CurrentTicketType.SaleTransactionType,
        _applicationState.CurrentDepartment.Model,
        _applicationState.CurrentLoggedInUser.Name,
        menuItem, taxTemps, portion, priceTag, timer)               # [Ticket.cs:214]

    # ---- Apply quantity (handle portion multiplier for qty > 9) ----
    order.Quantity = quantity > 9
        ? round(quantity / portion.Multiplier, 3)
        : quantity
    order.ResetSelectedQuantity()                                    # [Order.cs:339]

    # ---- Apply default order state from screen menu item ----
    SetOrderState(order, orderState)                                 # [TicketService.cs:643]

    # ---- Recalculate ticket ----
    RecalculateTicket(ticket)                                        # [TicketService.cs:330]

    # ---- Fire automation event ----
    _applicationState.NotifyEvent("OrderAdded", {
        Ticket, Order, MenuItemName, PortionName, Quantity, Price: order.GetPrice()
    })

    return order

function Ticket.AddOrder(template, department, userName, menuItem, taxTemplates, portion, priceTag, timer):
                                                                    # [Ticket.cs:214]
    UnLock()                                                        # [Ticket.cs:77]  re-opens if !IsClosed
    order = OrderBuilder.Create()
        .WithDepartment(department)
        .ForMenuItem(menuItem)              # also picks first portion if none
        .WithUserName(userName)
        .WithTaxTemplates(taxTemplates)
        .WithPortion(portion)
        .WithPriceTag(priceTag)
        .WithAccountTransactionType(template)
        .WithProductTimer(timer)
        .Build()                                                    # [OrderBuilder.cs:48]

    # Add order to collection + ensure AccountTransactions exist
    AddOrder(order, taxTemplates, template, userName)               # [Ticket.cs:232]
        # 1. TransactionDocument.AddSingletonTransaction(template.Id, template, GetTicketAccounts())
        #    → creates the SALE AccountTransaction once per ticket
        #    [AccountTransactionDocument.cs:41]
        # 2. foreach taxTemplate in taxTemplates:
        #        TransactionDocument.AddSingletonTransaction(
        #            taxTemplate.AccountTransactionType.Id,
        #            taxTemplate.AccountTransactionType,
        #            GetTicketAccounts())
        #    → creates one TAX AccountTransaction per tax template
        # 3. Orders.Add(order)
        # 4. LastModifiedUserName = userName

    return order

function OrderBuilder.Build():                                      # [OrderBuilder.cs:48]
    order = new Order()
    order.UpdateMenuItem(_userName, _menuItem, _taxTemplates, _portion, _priceTag, _quantity)
                                                                    # [Order.cs:133]
    order.DepartmentId = _department.Id
    order.WarehouseId  = _department.WarehouseId
    order.AccountTransactionTypeId = _accountTransactionType.Id
    order.UpdateProductTimer(_productTimer)                         # [Order.cs:403]
    order.CalculatePrice = true  # default
    return order

function Order.UpdateMenuItem(userName, menuItem, taxTemplates, portion, priceTag, quantity):
                                                                    # [Order.cs:133]
    MenuItemId   = menuItem.Id
    MenuItemName = menuItem.Name
    UpdatePortion(portion, priceTag, taxTemplates)                  # [Order.cs:146]
    Quantity     = quantity
    SelectedQuantity = quantity
    PortionCount = menuItem.Portions.Count
    CreatingUserName = userName
    CreatedDateTime = DateTime.Now

function Order.UpdatePortion(portion, priceTag, taxTemplates):      # [Order.cs:146]
    PortionName = portion.Name
    UpdateTaxTemplates(taxTemplates)                                # [Order.cs:360]
        # TaxValues.Clear()
        # foreach template in taxTemplates:
        #     TaxValues.Add(new TaxValue(template))   [TaxValue.cs:15]
        #         TaxRate = template.Rate
        #         Rounding = template.Rounding
        #         TaxTemplateName = template.Name
        #         TaxTempleteAccountTransactionTypeId = template.AccountTransactionType.Id
        # Taxes = JSON serialize TaxValues (with [DataMember] short names)
    # ---- PRICE LOOKUP ----
    if priceTag != null and priceTag != "":
        price = portion.Prices.SingleOrDefault(p => p.PriceTag == priceTag)
        if price != null and price.Price > 0:
            UpdatePrice(price.Price, price.PriceTag)                # [Order.cs:354]
            return
        # else fall through to base price
    UpdatePrice(portion.Price, "")   # base price (default MenuItemPrice)
```

### Portion selection (post-add)

User picks portion via long-press / context menu → `TicketViewModel` calls:
```pseudo
_ticketService.UpdateOrderPrice(order, portionName, priceTag)       # [TicketService.cs:597]
    order.UpdatePortion(portion, priceTag, null)                    # [Order.cs:146]
```

### Modifier (OrderTag) addition

```pseudo
function TicketService.TagOrders(ticket, orders, orderTagGroup, orderTag, tagNote):  # [TicketService.cs:423]
    foreach order in orders:
        if orderTagGroup.MaxSelectedItems == 1:
            # Remove existing tags in the same group
            existing = order.OrderTagValues.Where(otv => otv.OrderTagGroupId == orderTagGroup.Id).ToList()
            existing.ForEach(otv => order.OrderTagValues.Remove(otv))
        order.ToggleOrderTag(orderTagGroup, orderTag, userId, tagNote)  # [Order.cs:232]
            # if tag absent: create OrderTagValue {Price: orderTag.Price, Quantity: 1, TaxFree: group.TaxFree,
            #                                       AddTagPriceToOrderPrice: group.AddTagPriceToOrderPrice, ...}
            # if tag present:
            #     if MaxSelectedItems == 1: remove tag
            #     else: tag.Quantity++ (until MaxQuantity if > 0)
    RecalculateTicket(ticket)
```

### Quantity change

Direct mutation:
```pseudo
# PosViewModel / TicketViewModel:
order.Quantity += delta   # or order.Quantity = newValue
order.ResetSelectedQuantity()
RefreshSelectedOrders()
RecalculateTicket(ticket)
```

For locked orders, only `SelectedQuantity` is mutated (used for partial-payment selection).

---

## 4. CalculateTotals Algorithm (THE MASTER ALGORITHM)

**Source:** `Ticket.GetSum()` at `Ticket.cs:308` and `Ticket.Recalculate()` at `Ticket.cs:656`. Every code path that mutates `Orders`, `Calculations`, or `Payments` ends with a call to `TicketService.RecalculateTicket` (`TicketService.cs:330`) which calls `Ticket.Recalculate()`.

### 4.1 Order of operations (FINAL ANSWER)

```
1. Sum ticket items           →  plainSum    = Σ order.GetTotal()              [Ticket.cs:413]
2. Apply pre-tax discounts    →  preTaxSvc   = CalculateServices(!IncludeTax)  [Ticket.cs:311]
                                (Calculations sorted by Order; DecreaseAmount makes negative)
3. Apply tax                  →  tax         = CalculateTax(plainSum, preTaxSvc) [Ticket.cs:348]
                                If TaxIncluded: tax already inside price (extracted, not added)
                                If !TaxIncluded: tax added on top
                                Rounding: per-line via TaxValue.Rounding (MidpointRounding.AwayFromZero)
                                Then rounded to 2 dp at ticket level (MidpointRounding.ToEven — banker's!)
4. Apply post-tax services    →  postTaxSvc  = CalculateServices(IncludeTax)   [Ticket.cs:314]
                                (applied to plainSum + preTaxSvc + tax)
5. Round                      →  decimal.Round(…, 2) at every step
                                Also: AccountTransaction.Amount rounded with MidpointRounding.AwayFromZero
                                                              [AccountTransaction.cs:203]
6. Set TotalAmount            →  TotalAmount = plainSum + preTaxSvc + tax + postTaxSvc
                                                              [Ticket.cs:688]
                                RemainingAmount = Round(GetSum() - GetPaymentAmount() + GetChangeAmount(), 2)
                                                              [Ticket.cs:436]
```

### 4.2 `calculateTicketTotals(ticket)` — full pseudocode

```pseudo
function calculateTicketTotals(ticket):
    # ====================================================================
    # STEP 1: Sum ticket items (plainSum)
    # ====================================================================
    # Source: Ticket.GetPlainSum()  [Ticket.cs:413]
    plainSum = 0
    for order in ticket.Orders:
        if order.CalculatePrice:
            plainSum += order.GetTotal()                            # [Order.cs:507]
            #   GetTotal() = CalculatePrice ? GetValue() : 0
            #   GetValue() = GetPrice() * Quantity
            # Source: Order.GetPrice()  [Order.cs:466]
            #   = Price + Σ(OrderTagValues.Price * OrderTagValues.Quantity)
            #   + (ProductTimerValue.GetPrice(...) if timer present)

    # ====================================================================
    # STEP 2: Apply pre-tax discounts/services
    # ====================================================================
    # Source: Ticket.CalculateServices(calculations, sum)  [Ticket.cs:354]
    # Iterates Calculations WHERE IncludeTax == false, ORDERED BY calc.Order (SortOrder)
    preTaxServices = 0
    currentSum = plainSum
    for calc in ticket.Calculations.Where(c => c.IncludeTax == false).OrderBy(c => c.Order):
        sumValue = calc.UsePlainSum
            ? ticket.Orders
                .Where(o => o.DecreaseInventory || o.IncreaseInventory)
                .Sum(o => o.GetVisibleValue())                     # [Order.cs:497]
            : plainSum

        # Source: Calculation.Update(sumValue, currentSum, decimals)  [Calculation.cs:22]
        calcAmount = computeCalculationAmount(calc, sumValue, currentSum)
        calcAmount = roundBankers(calcAmount, DECIMALS)             # banker's rounding
        if calc.DecreaseAmount and calcAmount > 0:
            calcAmount = -calcAmount
        calc.CalculationAmount = calcAmount

        preTaxServices += calcAmount
        currentSum     += calcAmount

        # Update the singleton AccountTransaction for this calculation
        # Source: Calculation.UpdateCalculationTransaction  [Calculation.cs:57]
        ticket.TransactionDocument.UpdateSingletonTransactionAmount(
            calc.AccountTransactionTypeId, calc.Name,
            abs(calcAmount), ticket.ExchangeRate)

        # Auto-remove zero-amount calcs (except type 5 = scripted)
        if calc.Amount == 0 and calc.CalculationType != 5:
            ticket.Calculations.Remove(calc)

    preTaxServices = roundBankers(preTaxServices, DECIMALS)         # banker's

    # ====================================================================
    # STEP 3: Apply tax
    # ====================================================================
    # Source: Ticket.CalculateTax(plainSum, preTaxServices)  [Ticket.cs:348]
    if ticket.TaxIncluded:
        # Tax is already embedded in Price; we don't add it again here.
        # (Per-line tax extraction happens below in reports.)
        tax = 0
    else:
        tax = 0
        for order in ticket.Orders:
            if order.CalculatePrice:
                # Source: Order.GetTotalTaxAmount(taxIncluded, plainSum, preTaxServices)  [Order.cs:378]
                # = Σ TaxValues.GetTaxAmount(...) * order.Quantity
                taxablePrice = order.GetTaxablePrice()              # [Order.cs:475]
                #   = Price + Σ(OrderTagValues.Where(!TaxFree).Price * OrderTagValues.Quantity)
                #   + (ProductTimerValue.GetPrice(...) if timer)
                totalRate = Σ order.TaxValues.Sum(t => t.TaxRate)   # e.g. 8+5=13 for compound
                for tv in order.TaxValues:
                    price = taxablePrice
                    if preTaxServices != 0:
                        # Proportionally allocate pre-tax services to this order's price
                        price += (price * preTaxServices) / plainSum
                    # Source: TaxValue.GetTax(taxIncluded, price, totalRate)  [TaxValue.cs:41]
                    if tv.TaxRate > 0:
                        taxAmount = (price * tv.TaxRate) / 100
                    else:
                        taxAmount = 0
                    # NOTE: TaxValue.Rounding only applies when TaxIncluded=true
                    # (for TaxIncluded=false, no per-line rounding — full precision kept)
                    tax += taxAmount * order.Quantity
        tax = roundBankers(tax, DECIMALS)                           # banker's (NOT AwayFromZero)

    # ====================================================================
    # STEP 4: Apply post-tax services (IncludeTax=true)
    # ====================================================================
    # Applied to (plainSum + preTaxServices + tax)
    newBase = plainSum + preTaxServices + tax
    postTaxServices = 0
    currentSum = newBase
    for calc in ticket.Calculations.Where(c => c.IncludeTax == true).OrderBy(c => c.Order):
        sumValue = calc.UsePlainSum
            ? ticket.Orders
                .Where(o => o.DecreaseInventory || o.IncreaseInventory)
                .Sum(o => o.GetVisibleValue())
            : newBase
        calcAmount = computeCalculationAmount(calc, sumValue, currentSum)
        calcAmount = roundBankers(calcAmount, DECIMALS)
        if calc.DecreaseAmount and calcAmount > 0:
            calcAmount = -calcAmount
        calc.CalculationAmount = calcAmount
        postTaxServices += calcAmount
        currentSum      += calcAmount
        ticket.TransactionDocument.UpdateSingletonTransactionAmount(
            calc.AccountTransactionTypeId, calc.Name,
            abs(calcAmount), ticket.ExchangeRate)
        if calc.Amount == 0 and calc.CalculationType != 5:
            ticket.Calculations.Remove(calc)
    postTaxServices = roundBankers(postTaxServices, DECIMALS)

    # ====================================================================
    # STEP 5: Round (already done at each step above)
    # ====================================================================
    # AccountTransaction.Amount is rounded with MidpointRounding.AwayFromZero
    # Source: AccountTransaction.cs:203

    # ====================================================================
    # STEP 6: Set TotalAmount and RemainingAmount
    # ====================================================================
    # Source: Ticket.Recalculate()  [Ticket.cs:688]
    ticket.TotalAmount = plainSum + preTaxServices + tax + postTaxServices

    # Source: Ticket.GetRemainingAmount()  [Ticket.cs:436]
    paymentAmount    = Σ ticket.Payments.Sum(p => p.Amount)
    changePaymentAmt = Σ ticket.ChangePayments.Sum(c => c.Amount)
    ticket.RemainingAmount = roundBankers(
        ticket.TotalAmount - paymentAmount + changePaymentAmt, DECIMALS)

    # ====================================================================
    # ALSO: Update AccountTransaction amounts for sale + tax
    # ====================================================================
    # Source: Ticket.Recalculate()  [Ticket.cs:660-684]

    # 1. SALE AccountTransaction (one per order group by AccountTransactionTypeId)
    for orderGroup in ticket.Orders.GroupBy(o => o.AccountTransactionTypeId):
        transaction = ticket.TransactionDocument.AccountTransactions
            .SingleOrDefault(t => t.AccountTransactionTypeId == orderGroup.Key)
        if transaction != null:
            # amount = sum of tax-excluded order values
            amount = Σ orderGroup.Sum(o => GetTaxExcludedSum(o))   # [Ticket.cs:328]
                # If TaxIncluded:
                #   GetTaxExcludedSum = o.GetTotal() - o.GetTotalTaxAmount(true, plainSum, preTaxServices)
                # If !TaxIncluded:
                #   GetTaxExcludedSum = o.GetTotal()  (tax not in price)
            transaction.UpdateAccounts(ticket.GetTicketAccounts()) # [AccountTransaction.cs]
            transaction.UpdateAmount(amount, ticket.ExchangeRate)   # [AccountTransaction.cs:193]

    # 2. TAX AccountTransactions (one per TaxTemplate.AccountTransactionType.Id)
    for taxId in ticket.GetTaxIds():                                # [Ticket.cs:648]
        transaction = ticket.TransactionDocument.AccountTransactions
            .Single(t => t.AccountTransactionTypeId == taxId)
        transaction.UpdateAccounts(ticket.GetTicketAccounts())
        # Source: Ticket.GetTaxTotal(taxId, preTaxServices, plainSum)  [Ticket.cs:691]
        # NOTE: This uses MidpointRounding.AwayFromZero (different from CalculateTax!)
        taxAmountForTemplate = Σ ticket.Orders.Sum(o =>
            o.GetTotalTaxAmount(ticket.TaxIncluded, plainSum, preTaxServices, taxId))
        taxAmountForTemplate = roundAway(taxAmountForTemplate, 2)   # AWAY FROM ZERO (schoolbook)
        transaction.UpdateAmount(taxAmountForTemplate, ticket.ExchangeRate)

    return {
        plainSum,
        preTaxServices,
        tax,
        postTaxServices,
        totalAmount:     ticket.TotalAmount,
        remainingAmount: ticket.RemainingAmount,
        paymentAmount,
        changePaymentAmt,
    }
```

### 4.3 `computeCalculationAmount(calc, sum, currentSum)` — THE 5 calculation types

```pseudo
# Source: Calculation.Update(sum, currentSum, decimals)  [Calculation.cs:22]
function computeCalculationAmount(calc, sum, currentSum):
    switch calc.CalculationType:
        case 0:
            # PERCENTAGE OF PLAIN SUM
            # Example: 10% discount on ticket total
            return calc.Amount > 0 ? (sum * calc.Amount) / 100 : 0

        case 1:
            # PERCENTAGE OF RUNNING SUM (compounded — sees previous calc's effect)
            # Example: 10% service charge applied AFTER a discount was already subtracted
            return calc.Amount > 0 ? (currentSum * calc.Amount) / 100 : 0

        case 3:
            # TARGET AMOUNT (final total should be exactly `Amount`)
            # Example: "Round to $50" by setting target
            if calc.Amount == currentSum:
                calc.Amount = 0
                return 0
            if currentSum > 0 and calc.DecreaseAmount and calc.Amount > currentSum:
                # Discount cannot exceed the current sum — zero it out
                calc.Amount = 0
                return 0
            if currentSum > 0 and (not calc.DecreaseAmount) and calc.Amount < currentSum:
                # Surcharge cannot be less than current sum — zero it out
                calc.Amount = 0
                return 0
            return calc.Amount - currentSum

        case 4:
            # ROUNDING (to nearest multiple of `Amount`)
            # Example: round to nearest 0.05 (nickel rounding for cash)
            if calc.Amount > 0:
                # Round to nearest multiple (AwayFromZero for the .5 case)
                result = (roundAway(currentSum / calc.Amount, 0) * calc.Amount) - currentSum
            else:
                # Amount < 0: always round DOWN (truncate)
                result = (trunc(currentSum / calc.Amount) * calc.Amount) - currentSum
            if calc.DecreaseAmount and result > 0: result = 0
            if (not calc.DecreaseAmount) and result < 0: result = 0
            return result

        case 2:
            # Unused — falls through to default
        case 5:
            # SCRIPTED — Amount is pre-computed by ExpressionService
            # before RecalculateTicket() is called.
            # Source: TicketService.cs:333-334
            #   calc.Amount = _expressionService.EvalCommand(
            #       "Calculation", "_" + calc.Name, {Ticket = ticket}, 0m)
        default:
            # FIXED AMOUNT (manual)
            return calc.Amount
```

### 4.4 `TaxValue.GetTax(...)` — THE tax formula

```pseudo
# Source: TaxValue.cs:41-65
function TaxValue.GetTax(taxIncluded, price, totalRate):
    if taxIncluded and totalRate > 0:
        # Tax is INCLUDED in the price — extract it
        # totalRate = sum of ALL applicable tax rates on this order
        # (needed because the price includes all taxes, must distribute proportionally)
        if Rounding > 0:
            # Per-line rounding with MidpointRounding.AwayFromZero
            return roundAway((price * TaxRate) / (100 + totalRate), Rounding)
        else:
            # No per-line rounding — full precision kept
            return (price * TaxRate) / (100 + totalRate)
    elif TaxRate > 0:
        # Tax ADDED ON TOP of the price
        # (no per-line rounding — CalculationType=4 rounding happens at ticket level)
        return (price * TaxRate) / 100
    else:
        return 0

function TaxValue.GetTaxAmount(taxIncluded, price, totalRate, plainSum, preTaxServices):
    # Source: TaxValue.cs:59-65
    if preTaxServices != 0:
        # Proportionally allocate pre-tax services to this order's taxable price
        price += (price * preTaxServices) / plainSum
    return GetTax(taxIncluded, price, totalRate)
```

### 4.5 `TicketService.RecalculateTicket(ticket)` — the wrapper

```pseudo
# Source: TicketService.cs:330
function TicketService.RecalculateTicket(ticket):
    previousTotal = ticket.TotalAmount

    # Refresh scripted (type 5) calculations first
    ticket.Calculations
        .Where(c => c.CalculationType == 5)
        .ToList()
        .ForEach(c => c.Amount = _expressionService.EvalCommand(
            "Calculation", "_" + c.Name, {Ticket: ticket}, 0m))

    ticket.Recalculate()    # [Ticket.cs:656] — calls GetSum, CalculateServices, CalculateTax, etc.

    if previousTotal != ticket.TotalAmount:
        _applicationState.NotifyEvent("TicketTotalChanged", {
            Ticket,
            PreviousTotal:    previousTotal,
            TicketTotal:      ticket.GetSum(),
            DiscountTotal:    ticket.GetPreTaxServicesTotal(),
            PaymentTotal:     ticket.GetPaymentAmount(),
            RemainingAmount:  ticket.GetRemainingAmount(),
        })
```

---

## 5. Payment Flow

**Source:** `PaymentEditorViewModel.cs:97` → `PaymentEditor.cs:58` → `TicketService.cs:199` → `Ticket.cs:251`.

```pseudo
# USER opens payment screen (typically by clicking "Pay" button which fires
# the "DisplayPaymentScreen" automation action OR PosViewModel navigates).

function PaymentEditorViewModel.Prepare(ticket):                   # [PaymentEditorViewModel.cs:170]
    _paymentEditor.SelectedTicket = ticket
    _orderSelectorViewModel.UpdateTicket(ticket)      # for partial payments
    _numberPadViewModel.ResetValues()
    _numberPadViewModel.LastTenderedAmount = PaymentDueAmount
    _commandButtonsViewModel.Update()                 # refresh payment type buttons
    _foreignCurrencyButtonsViewModel.UpdateCurrencyButtons()

# USER taps a PaymentType button.
function PaymentEditorViewModel.OnMakePayment(paymentType):        # [PaymentEditorViewModel.cs:97]
    if !CanMakePayment(paymentType): return
    SubmitPayment(paymentType)

function CanMakePayment(paymentType):                              # [PaymentEditorViewModel.cs:68]
    if SelectedTicket.IsClosed: return false
    if tenderedValue == 0: return false
    if SelectedTicket.GetRemainingAmount() == 0: return false
    if AccountMode and tendered > paymentDue: return false    # need an account attached
    if paymentType.Account == null and !CanAcceptAccountTxnType(paymentType): return false
    return true

function SubmitPayment(paymentType):                              # [PaymentEditorViewModel.cs:97]
    paymentDue = _tenderedValueViewModel.GetPaymentDueValue()
    tendered   = _tenderedValueViewModel.GetTenderedValue()

    if abs(paymentDue - SelectedTicket.GetRemainingAmount()) <= 0.01:
        paymentDue = SelectedTicket.GetRemainingAmount()
    if tendered == 0 or abs(paymentDue - tendered) <= 0.01:
        tendered = paymentDue

    if tendered <= paymentDue:
        # Exact or partial payment — no change needed
        SubmitPaymentAmount(paymentType, null, paymentDue, tendered)
        return

    # tendered > paymentDue — change needed
    changeTemplates = GetChangePaymentTypes(paymentType)            # [PaymentEditorViewModel.cs:163]
        # = _applicationState.GetChangePaymentTypes()
        #     .Where(c => c.AccountTransactionType.TargetAccountTypeId
        #                 == paymentType.AccountTransactionType.SourceAccountTypeId)
    if changeTemplates.Count < 2:
        SubmitPaymentAmount(paymentType, changeTemplates.SingleOrDefault(),
                            paymentDue, tendered)
    else:
        # Show modal: user picks which change payment type
        _changeTemplatesViewModel.Display(changeTemplates, tendered, paymentDue,
                                           paymentType, _selectChangePaymentTypeCommand)
        # On selection → OnSelectChangePaymentType → SubmitPaymentAmount(...)

function SubmitPaymentAmount(paymentType, changeTemplate, paymentDue, tendered):
                                                                  # [PaymentEditorViewModel.cs:131]
    returningAmount = tendered - paymentDue    # change to give back
    paidAmount = (changeTemplate == null)
        ? tendered - returningAmount
        : tendered
    paymentAmount = paymentDue > paidAmount
        ? paymentDue - paidAmount
        : _paymentEditor.GetRemainingAmount()

    _orderSelectorViewModel.UpdateSelectedTicketPaidItems()    # for line-item payments
    _paymentEditor.UpdateTicketPayment(paymentType, changeTemplate,
                                        paymentDue, paidAmount, tendered)   # [PaymentEditor.cs:58]
    _tenderedValueViewModel.UpdatePaymentAmount(paymentAmount)

    if returningAmount == 0 and GetRemainingAmount() == 0:
        OnClosePaymentScreen("")                               # [PaymentEditorViewModel.cs:91]
    else:
        if returningAmount > 0:
            _returningAmountViewModel.PublishEvent("Activate")
        if paymentDue <= paidAmount:
            _orderSelectorViewModel.PersistSelectedItems()
        _numberPadViewModel.ResetValues()

function PaymentEditor.UpdateTicketPayment(paymentType, changeTemplate,
                                            paymentDue, paidAmount, tendered):
                                                                  # [PaymentEditor.cs:58]
    paymentAccount = paymentType.Account
        ?? _ticketService.GetAccountForPayment(ticket, paymentType)  # [TicketService.cs:230]
        # = first TicketEntity whose EntityType.AccountTypeId matches
        #   paymentType.AccountTransactionType.TargetAccountTypeId

    if paymentDue > ticket.GetRemainingAmount() and paidAmount > ticket.GetRemainingAmount():
        # ---- Account-mode: split between ticket balance and account balance ----
        activeAccount = _accountBalances.GetActiveAccount()
        if activeAccount != null:
            ticketAmount  = ticket.GetRemainingAmount()
            accountAmount = paidAmount - ticketAmount
            accountBalance = getAccountBalance(activeAccount.Id)
            if accountAmount > accountBalance:
                accountAmount = accountBalance
            if ticketAmount > 0:
                _ticketService.AddPayment(ticket, paymentType, paymentAccount,
                                          ticketAmount, tendered - accountAmount)
            if accountAmount > 0:
                _ticketService.AddAccountTransaction(ticket, activeAccount, paymentAccount,
                                                     accountAmount, ticket.ExchangeRate)
        _accountBalances.Refresh()
    else:
        # ---- Normal payment ----
        _ticketService.AddPayment(ticket, paymentType, paymentAccount, paidAmount, tendered)
        if paidAmount > paymentDue and changeTemplate != null:
            _ticketService.AddChangePayment(ticket, changeTemplate, changeTemplate.Account,
                                             paidAmount - paymentDue)   # [TicketService.cs:218]

function TicketService.AddPayment(ticket, paymentType, account, amount, tendered):
                                                                  # [TicketService.cs:199]
    if account == null: return
    remainingAmount = ticket.GetRemainingAmount()
    changeAmount = tendered > remainingAmount ? tendered - remainingAmount : 0

    # Source: Ticket.AddPayment  [Ticket.cs:251]
    exchangeRate = GetExchangeRate(account)    # 1 if no foreign currency
    userId = _applicationState.CurrentLoggedInUser.Id

    # Create AccountTransaction (double-entry)
    # Source: AccountTransactionDocument.AddNewTransaction  [AccountTransactionDocument.cs:33]
    transaction = new AccountTransaction {
        Name = paymentType.AccountTransactionType.Name,
        AccountTransactionTypeId = paymentType.AccountTransactionType.Id,
        SourceAccountTypeId = paymentType.AccountTransactionType.SourceAccountTypeId,
        TargetAccountTypeId = paymentType.AccountTransactionType.TargetAccountTypeId,
        SourceTransactionValue = new AccountTransactionValue {
            AccountId: paymentType.AccountTransactionType.DefaultSourceAccountId,
            AccountTypeId: paymentType.AccountTransactionType.SourceAccountTypeId,
        },
        TargetTransactionValue = new AccountTransactionValue {
            AccountId: paymentType.AccountTransactionType.DefaultTargetAccountId,
            AccountTypeId: paymentType.AccountTransactionType.TargetAccountTypeId,
        },
    }
    transaction.UpdateAccounts(ticket.GetTicketAccounts(account))   # override defaults with ticket entities
    transaction.UpdateAmount(amount, exchangeRate)                  # [AccountTransaction.cs:193]
        # if amount < 0 and CanReverse(): transaction.Reverse()      [AccountTransaction.cs:177]
        #   swaps SourceTransactionValue <-> TargetTransactionValue
        #   sets IsReversed = true
        # transaction.Amount = abs(amount)
        # transaction.Amount = roundAway(amount, 2)  # AWAY FROM ZERO
        # SourceTransactionValue: Debit=0, Credit=amount
        # TargetTransactionValue: Credit=0, Debit=amount
    transaction.UpdateDescription(transaction.Name + " [" + account.Name + "]")

    payment = new Payment {
        AccountTransaction: transaction,
        Amount: amount,
        Name: account.Name,
        PaymentTypeId: paymentType.Id,
        UserId: userId,
        Date: DateTime.Now,
    }
    ticket.Payments.Add(payment)
    ticket.TransactionDocument.AccountTransactions.Add(transaction)
    ticket.LastPaymentDate = DateTime.Now
    ticket.RemainingAmount = ticket.GetRemainingAmount()

    # Fire automation event
    # Source: TicketService.cs:205-215
    _applicationState.NotifyEvent("PaymentProcessed", {
        Ticket,
        PaymentTypeName: paymentType.Name,
        TenderedAmount: tendered,
        ProcessedAmount: tendered - changeAmount,
        ChangeAmount: changeAmount,
        SelectedQuantity: ticket.PaidItems.Sum(p => p.Quantity),
        RemainingAmount: ticket.GetRemainingAmount(),
    })

function TicketService.AddChangePayment(ticket, changePaymentType, account, amount):
                                                                  # [TicketService.cs:218]
    # Mirrors AddPayment but creates a ChangePayment row + ChangePaymentType.AccountTransactionType
    exchangeRate = GetExchangeRate(account)
    userId = _applicationState.CurrentLoggedInUser.Id

    transaction = new AccountTransaction { ... }     # same pattern as AddPayment
    transaction.UpdateAccounts(ticket.GetTicketAccounts(account))
    transaction.UpdateAmount(amount, exchangeRate)
    transaction.UpdateDescription(transaction.Name + " [" + account.Name + "]")

    changePayment = new ChangePayment {
        AccountTransaction: transaction,
        Amount: amount,
        Name: account.Name,
        ChangePaymentTypeId: changePaymentType.Id,
        UserId: userId,
    }
    ticket.ChangePayments.Add(changePayment)
    ticket.TransactionDocument.AccountTransactions.Add(transaction)
```

### 5.1 Change calculation

```pseudo
changeAmount = tenderedAmount > remainingAmount
    ? tenderedAmount - remainingAmount
    : 0
# Source: TicketService.cs:203
```

### 5.2 Table release

**No explicit "release table" call.** The Entity (table) is considered free when no open ticket references it:

```pseudo
# Source: TicketServiceBase.cs:45
function GetOpenTicketIds(entityId):
    return _ticketDao.GetOpenTickets()
        .Where(t => t.TicketEntities.Any(te => te.EntityId == entityId))
        .Select(t => t.Id)
        .ToList()
```

Once `Ticket.IsClosed = true`, the table is automatically released by the next call to `GetOpenTickets(entityId)`.

---

## 6. Refund / Void / Split Logic

### 6.1 Void Ticket Item

```pseudo
function voidTicketItem(ticket, order):
    # Two cases: unsaved order (Id == 0) vs saved order (Id > 0)
    # Source: TicketViewModel.OnCancelItemCommand  [TicketViewModel.cs:540]
    # Source: TicketService.CancelSelectedOrders   [TicketService.cs:609]
    # Source: Ticket.CancelOrders                  [Ticket.cs:473]

    if order.Id == 0:
        # ---- Case A: Unsaved order — physically remove ----
        notifyEvent("OrderCancelled", {
            Ticket: ticket, Order: order,
            MenuItemName: order.MenuItemName, Quantity: order.Quantity
        })

        ticket.UnLock()                                # [Ticket.cs:77]
        ticket.RemoveOrder(order)                      # [Ticket.cs:269]
            # ticket.Orders.Remove(order)
            # txnId = order.AccountTransactionTypeId
            # if no other Order in ticket.Orders uses txnId:
            #     foreach at in TransactionDocument.AccountTransactions
            #              .Where(a => a.AccountTransactionTypeId == txnId):
            #         TransactionDocument.AccountTransactions.Remove(at)
        recalculateTicket(ticket)
    else:
        # ---- Case B: Saved order — flag as Cancelled, do NOT remove ----
        # SambaPOS keeps saved orders for audit.

        # Option B1: Set OrderState "Status=Cancelled"
        # Source: TicketService.UpdateOrderStates  [TicketService.cs:526]
        order.SetStateValue(
            groupName: "Status",
            groupOrder: 99,
            state: "Cancelled",
            stateOrder: 99,
            stateValue: "",
            userId: currentLoggedInUser.Id
        )   # Source: Order.SetStateValue  [Order.cs:276]
            # sv = OrderStateValues.SingleOrDefault(s => s.StateName == "Status")
            # if sv == null: OrderStateValues.Add(new {StateName:"Status", State:"Cancelled"})
            # else: sv.State = "Cancelled"
            # sv.LastUpdateTime = DateTime.Now
            # OrderStates = JSON serialize OrderStateValues (short DataMember names)

        notifyEvent("OrderStateUpdated", {
            Ticket, Order, StateName: "Status", State: "Cancelled", PreviousState: null
        })

        # Option B2 (alternative): set CalculatePrice = false
        # This makes GetTotal() return 0, excluding it from plainSum.
        # order.CalculatePrice = false

        recalculateTicket(ticket)

function canCancelSelectedOrders(ticket, selectedOrders):
    # Source: Ticket.CanCancelSelectedOrders  [Ticket.cs:487]
    if selectedOrders.length == 0: return false
    if not selectedOrders.All(o => not o.Locked): return false
    if selectedOrders.Any(o => o.Id > 0): return false  # saved orders can't be removed
    if selectedOrders.Any(o => not ticket.Orders.Contains(o)): return false
    return true
```

### 6.2 Void Ticket

```pseudo
function voidTicket(ticket):
    # NO single VoidTicket method. Pattern:
    # 1. Re-open the ticket
    ticket.UnLock()    # [Ticket.cs:77]
    # 2. Reverse all payments
    for payment in ticket.Payments:
        payment.AccountTransaction.Reverse()         # [AccountTransaction.cs:177]
            # swaps SourceTransactionValue <-> TargetTransactionValue
            # sets IsReversed = true
            # debits/credits flip
    # 3. Optionally set ticket state "Status=Refunded"
    ticket.SetStateValue("Status", 0, "Refunded", 0, "", userId)
    # 4. Persist
    TicketService.CloseTicket(ticket)                # [TicketService.cs:139]
```

In practice, this is exposed via a custom automation rule (no built-in UI button).

### 6.3 Split Ticket

**Implemented as MoveOrders to targetTicketId=0.** No separate `SplitTicket` method.

```pseudo
function splitTicket(ticket, itemsToMove):
    # itemsToMove: list of { order, selectedQuantity }
    # Source: TicketService.MoveOrders  [TicketService.cs:302]
    # Source: PosViewModel.OnTicketEventReceived(MoveSelectedOrders)  [PosViewModel.cs:178]

    # ---- Step 1: Extract selected orders (handles partial-quantity splits) ----
    # Source: Ticket.ExtractSelectedOrders  [Ticket.cs:705]
    ordersToMove = []
    for item in itemsToMove:
        order = item.order
        if item.selectedQuantity > 0 and item.selectedQuantity < order.Quantity:
            # Partial quantity — clone the order
            # Source: Ticket.FixOrder  [Ticket.cs:734]
            clonedOrder = cloneOrder(ticket, order)  # [Ticket.cs:532]
                # = ObjectCloner.Clone(order)
                # clonedOrder.CreatedDateTime = DateTime.Now
                # clonedOrder.Quantity = 0
                # clonedOrder.ResetSelectedQuantity()
                # ticket.Orders.Add(clonedOrder)
            clonedOrder.Id = 0
            clonedOrder.Quantity = item.selectedQuantity
            clonedOrder.ResetSelectedQuantity()
            order.Quantity -= item.selectedQuantity
            order.ResetSelectedQuantity()
            ordersToMove.append(clonedOrder)
        else:
            ordersToMove.append(order)

    # ---- Step 2: Move orders ----
    return moveOrders(ticket, ordersToMove, targetTicketId = 0)

function moveOrders(sourceTicket, selectedOrders, targetTicketId):
    # Source: TicketService.MoveOrders  [TicketService.cs:302]
    notifyEvent("TicketMoving", {Ticket: sourceTicket})
    for order in selectedOrders:
        notifyEvent("OrderMoving", {
            Ticket: sourceTicket, Order: order,
            MenuItemName: order.MenuItemName, Quantity: order.Quantity
        })

    # Clone orders (deep copy)
    clonedOrders = selectedOrders.map(o => ObjectCloner.Clone2(o))

    # Remove from source
    # Source: Ticket.RemoveOrders  [Ticket.cs:748]
    for order in selectedOrders:
        sourceTicket.RemoveOrder(order)   # [Ticket.cs:269]

    # Save source ticket (closes it with fewer orders)
    closeTicket(sourceTicket)             # [TicketService.cs:139]

    # Open (or create) target ticket
    targetTicket = openTicket(targetTicketId)   # [TicketService.cs:111]
        # if targetTicketId == 0: CreateTicket() — new ticket
        # else: _ticketDao.OpenTicket(targetTicketId)

    # Add cloned orders to target
    for clonedOrder in clonedOrders:
        clonedOrder.TicketId = 0
        targetTicket.Orders.Add(clonedOrder)
        notifyEvent("OrderMoved", {
            Ticket: targetTicket, Order: clonedOrder,
            MenuItemName: clonedOrder.MenuItemName, Quantity: clonedOrder.Quantity,
            OldTicketNumber: sourceTicket.TicketNumber,
        })

    # Refresh AccountTransactions on target
    # Source: TicketService.RefreshAccountTransactions  [TicketService.cs:509]
    refreshAccountTransactions(targetTicket)
        # foreach orderGroup in targetTicket.Orders.GroupBy(o => o.AccountTransactionTypeId):
        #     if TransactionDocument has no AccountTransaction with that Id:
        #         transaction = TransactionDocument.AddNewTransaction(template, accounts)
        #         transaction.Reversable = false
        # foreach taxId in targetTicket.GetTaxIds():
        #     TransactionDocument.AddSingletonTransaction(taxId, taxTemplate, accounts)

    targetTicket.LastOrderDate = DateTime.Now
    notifyEvent("TicketMoved", {Ticket: targetTicket, OldTicketNumber: sourceTicket.TicketNumber})

    # Save target ticket
    result = closeTicket(targetTicket)   # [TicketService.cs:139]
        # assigns TicketNumber if new
        # calls MergeOrdersAndUpdateOrderNumbers if orders have OrderNumber == 0
        # calls LockTicket
        # _ticketDao.Save(targetTicket)

    return result.TicketId
```

### 6.4 Refund

Handled by the same `AddPayment` flow with a negative amount or a specialized `PaymentType` whose `AccountTransactionType` is reversed:

```pseudo
function refundPayment(ticket, paymentType, amount):
    # Option A: Reverse an existing payment
    originalPayment = findPaymentToRefund(ticket)
    originalPayment.AccountTransaction.Reverse()         # [AccountTransaction.cs:177]
    ticket.RemovePayment(originalPayment)                 # [Ticket.cs:280]
        # Payments.Remove(originalPayment)
        # TransactionDocument.AccountTransactions.Remove(originalPayment.AccountTransaction)
    recalculateTicket(ticket)

    # Option B: Add a "Refund" payment type (negative direction)
    addPayment(ticket, refundPaymentType, account, -amount, -amount)
        # Ticket.AddPayment calls transaction.UpdateAmount(-amount, ...)
        # which triggers Auto-Reverse if amount < 0 and CanReverse()
        # [AccountTransaction.cs:195]
```

### 6.5 Merge Tickets

```pseudo
# Source: TicketService.MergeTickets  [TicketService.cs:254]
function mergeTickets(ticketIds):
    sourceTickets = ticketIds.map(id => openTicket(id))
    newTicket = createTicket()
    for source in sourceTickets:
        # Clone Orders, Payments, ChangePayments, Tags, Entities, Logs
        for order in source.Orders:
            cloned = ObjectCloner.Clone2(order)
            cloned.TicketId = 0
            newTicket.Orders.Add(cloned)
        # ... same for Payments, ChangePayments, Calculations, TicketEntities, TicketTags, ...
        # Close source (effectively deleting its data after merge)
        closeTicket(source)
    result = closeTicket(newTicket)
    return result.TicketId
```

---

## 7. CloseTicket Flow

**Source:** `PosViewModel.cs:456` → `TicketService.cs:139` → `Ticket.cs:522` (LockTicket) → `Ticket.cs:79` (Close).

```pseudo
function closeTicket(ticket):
    # Source: PosViewModel.CloseTicket  [PosViewModel.cs:456]
    # Source: TicketService.CloseTicket [TicketService.cs:139]

    # ---- Step 0: Pre-close validation ----
    if not ticket.CanCloseTicket():    # [Ticket.cs:758]
        # CanCloseTicket returns true if:
        #   GetRemainingAmount() == 0
        #   OR TicketEntities.Count > 0
        #   OR Orders.Count == 0
        if not ticket.IsTaggedWithDefinedTags(getTicketTagGroupNames()):
            return

    # Check for print errors (zero-priced items, missing forced tags)
    # Source: PosViewModel.GetPrintError  [PosViewModel.cs:505]
    if ticket.Orders.Any(o => o.GetValue() == 0 and o.CalculatePrice):
        return error("Can't complete operation when there is zero priced product")
    if not ticket.IsClosed and ticket.Orders.Count > 0:
        for tagGroup in getTicketTagGroups().Where(t => t.ForceValue):
            if not isTaggedWith(ticket, tagGroup.Name):
                return error("Tag {tagGroup.Name} can't be empty")

    # ---- Step 1: Concurrency check ----
    # Source: TicketDao.CheckConcurrency  [TicketDao.cs:35]
    # Source: TicketConcurrencyValidator  [TicketDao.cs:146]
    result = checkConcurrency(ticket)
        # Compares:
        #   - TicketEntities count and IDs match loaded ticket
        #   - IsClosed matches loaded ticket
        #   - LastPaymentDate matches
        #   - GetSum() matches when RemainingAmount == 0
    if result.ErrorMessage != "":
        return result    # ticket was modified by another terminal

    canSubmit = not result.changed and ticket.CanSubmit   # CanSubmit = !IsClosed

    if canSubmit:
        # ---- Step 2: Recalculate ticket ----
        recalculateTicket(ticket)    # [TicketService.cs:330] — see Section 4

        # ---- Step 3: Fire BeforeTicketClosing event ----
        notifyEvent("BeforeTicketClosing", {
            Ticket, TicketId: ticket.Id,
            RemainingAmount: ticket.RemainingAmount,
            TotalAmount: ticket.TotalAmount,
        })

        if ticket.Orders.Count > 0:
            ticketType = getTicketTypeById(ticket.TicketTypeId)

            # ---- Step 4: Assign OrderNumber to new orders ----
            # Source: TicketService.cs:154-158
            if ticket.Orders.Any(o => o.OrderNumber == 0):
                # Atomically get next OrderNumber from Numerator (with optimistic-concurrency retry)
                # Source: SettingService.GetNextNumber  [SettingService.cs:79]
                # Source: SettingDao.GetNextNumber     [SettingDao.cs:40]
                number = getNextNumber(ticketType.OrderNumerator.Id)
                    # numerator.Number++ (atomic)
                    # workspace.CommitChanges()
                    # return numerator.Number

                # Merge duplicate unlocked orders + assign OrderNumber
                # Source: Ticket.MergeOrdersAndUpdateOrderNumbers  [Ticket.cs:498]
                ticket.MergeOrdersAndUpdateOrderNumbers(number)
                    # LastOrderDate = DateTime.Now
                    # newOrders = ticket.Orders.Where(o => not o.Locked and o.Id == 0)
                    # mergedOrders = OrderMerger.Merge(newOrders)    [OrderMerger.cs:30]
                    #   groups by MenuItemId, PortionName, Price, CalculatePrice,
                    #   IncreaseInventory, DecreaseInventory, OrderStates
                    #   sums Quantity
                    # remove non-merged new orders
                    # foreach order in ticket.Orders.Where(o => o.OrderNumber == 0):
                    #     order.OrderNumber = number

            # ---- Step 5: Assign TicketNumber if new ----
            # Source: TicketService.cs:160-164
            if ticket.Id == 0:
                updateTicketNumber(ticket, ticketType.TicketNumerator)   # [TicketService.cs:238]
                # Persist new ticket
                # Source: TicketDao.Save  [TicketDao.cs:30]
                _ticketDao.Save(ticket)

            # ---- Step 6: Fire TicketClosing event ----
            # This event typically triggers automation rules that:
            #   - ExecutePrintJob (print kitchen / receipt)
            #   - MarkTicketAsClosed (set IsClosed=true)
            #   - UpdateTicketState (Status=Closed)
            notifyEvent("TicketClosing", {
                Ticket, TicketId: ticket.Id,
                RemainingAmount: ticket.RemainingAmount,
                TotalAmount: ticket.TotalAmount,
            })

            # ---- Step 7: Lock ticket ----
            # Source: Ticket.LockTicket  [Ticket.cs:522]
            ticket.LockTicket()
                # foreach order in ticket.Orders.Where(o => not o.Locked):
                #     order.Locked = true
                # if ticket._shouldLock: ticket.IsLocked = true
                # ticket._shouldLock = false

        # ---- Step 8: Clean up zero-amount account transactions (if closed) ----
        # Source: Ticket.RemoveZeroAmountAccountTransactions  [Ticket.cs:816]
        ticket.RemoveZeroAmountAccountTransactions()
            # if not ticket.IsClosed: return   # no-op unless closed
            # ticket.TransactionDocument.AccountTransactions
            #     .Where(a => a.Amount == 0)
            #     .ToList()
            #     .ForEach(a => ticket.TransactionDocument.AccountTransactions.Remove(a))

        # ---- Step 9: Save ticket ----
        # Source: TicketService.cs:174-175
        if ticket.Id > 0:
            _ticketDao.Save(ticket)

    # ---- Step 10: Notify EntityUpdated for each TicketEntity ----
    # Source: TicketService.cs:180-193
    if ticket.Id > 0:
        for ticketEntity in ticket.TicketEntities:
            entityType = getEntityTypeById(ticketEntity.EntityTypeId)
            openCount = getOpenTicketIds(ticketEntity.EntityId).Count()
            notifyEvent("EntityUpdated", {
                EntityTypeId: ticketEntity.EntityTypeId,
                EntityId: ticketEntity.EntityId,
                EntityTypeName: entityType.Name,
                OpenTicketCount: openCount,
            })
            # ^ This is what "releases the table" — when OpenTicketCount == 0,
            #   the table is free.

    # ---- Step 11: Mark as Closed (typically via automation) ----
    # NOTE: CloseTicket itself does NOT set IsClosed = true!
    # That is done by the MarkTicketAsClosed automation action:
    # Source: MarkTicketAsClosed.cs:15  ticket.Close()
    # Source: Ticket.Close()           [Ticket.cs:79]
    #   if RemainingAmount == 0 and not HasActiveTimers():
    #       IsClosed = true
    #       PaidItems.Clear()

    result.TicketId = ticket.Id
    return result
```

---

## 8. applyDiscount(ticket, discount)

In SambaPOS V3, "discount" is just a `Calculation` with `DecreaseAmount=true`. There is no separate discount entity.

```pseudo
function applyDiscount(ticket, discount):
    # discount = {
    #   calculationTypeId, name, calculationMethod (0-5), amount,
    #   includeTax (false for pre-tax discount), decreaseAmount (true),
    #   usePlainSum, sortOrder, accountTransactionTypeId, toggleCalculation
    # }
    # Source: Ticket.AddCalculation(calculationType, amount)  [Ticket.cs:379]

    # Find existing Calculation with same CalculationTypeId OR same AccountTransactionTypeId
    existing = ticket.Calculations.SingleOrDefault(
        c => c.CalculationTypeId == discount.calculationTypeId)
    if existing == null:
        existing = ticket.Calculations.SingleOrDefault(
            c => c.AccountTransactionTypeId == discount.accountTransactionTypeId)

    if existing == null:
        # Create new Calculation
        # Source: Ticket.cs:385-396
        calc = new Calculation {
            Amount: discount.amount,
            Name: discount.name,
            CalculationType: discount.calculationMethod,    # 0=%, 1=% running, 3=target, 4=round, 5=script
            CalculationTypeId: discount.calculationTypeId,
            IncludeTax: discount.includeTax,                # false for pre-tax discount
            DecreaseAmount: discount.decreaseAmount,        # true for discount
            UsePlainSum: discount.usePlainSum,
            Order: discount.sortOrder,
            AccountTransactionTypeId: discount.accountTransactionTypeId,
        }
        ticket.Calculations.Add(calc)
        # Add singleton AccountTransaction for this calculation
        # Source: AccountTransactionDocument.AddSingletonTransaction  [AccountTransactionDocument.cs:41]
        ticket.TransactionDocument.AddSingletonTransaction(
            calc.AccountTransactionTypeId,
            discount.accountTransactionType,
            ticket.GetTicketAccounts())
    elif discount.toggleCalculation and existing.Amount == discount.amount:
        # Toggle off
        # Source: Ticket.cs:400-403
        existing.Amount = 0
    else:
        # Update amount on existing
        existing.Amount = discount.amount
        existing.Name = discount.name

    # If amount == 0 and not a scripted calc, remove it
    # Source: Ticket.cs:406-410
    if existing.Amount == 0 and existing.CalculationType != 5:
        ticket.Calculations.Remove(existing)
        existing.UpdateCalculationTransaction(
            ticket.TransactionDocument, 0, ticket.ExchangeRate)   # [Calculation.cs:57]

    # Recalculate the whole ticket
    recalculateTicket(ticket)    # invokes Ticket.Recalculate() and notifies TicketTotalChanged

    # If RemainingAmount goes negative (over-discount), auto-remove all button-header discounts
    # Source: PaymentEditor.UpdateCalculations()  [PaymentEditor.cs:89-107]
    if ticket.GetRemainingAmount() < 0:
        for cSelector in calculationSelectors.Where(s => s.ButtonHeader != ""):
            for ctemplate in cSelector.CalculationTypes:
                while ticket.Calculations.Any(c => c.CalculationTypeId == ctemplate.Id):
                    ticket.AddCalculation(ctemplate, 0)   # forces removal
        recalculateTicket(ticket)
```

---

## 9. applyTax(ticket, taxTemplate)

Taxes are **always** defined per-MenuItem via `TaxTemplate` (referenced from `MenuItem` → `TaxTemplateMap` → `TaxTemplate`). There is no `applyTax(ticket, taxTemplate)` operation — taxes are applied at order-add time and recomputed during `RecalculateTicket`.

```pseudo
function applyTax(ticket, taxTemplate):
    # TaxTemplate = {
    #   id, name, rate (decimal, e.g. 8.0 for 8%),
    #   rounding (int, 0 = no per-line rounding),
    #   accountTransactionType (the Tax Payable AccountTransactionType)
    # }
    # Source: TaxTemplate.cs:7

    # Tax is applied per-Order, not per-Ticket.
    # Each Order has TaxValues populated at AddOrder time:
    # Source: Order.UpdateTaxTemplates(taxTemplates)  [Order.cs:360]
    #   TaxValues.Clear()
    #   foreach template in taxTemplates:
    #       TaxValues.Add(new TaxValue(template))   # [TaxValue.cs:15]
    #           TaxRate = template.Rate
    #           Rounding = template.Rounding
    #           TaxTemplateName = template.Name
    #           TaxTempleteAccountTransactionTypeId = template.AccountTransactionType.Id
    #   Taxes = JSON serialize TaxValues (short DataMember names)

    # If applying taxTemplate to existing orders (e.g. after menu change):
    for order in ticket.Orders:
        if not order.TaxValues.Any(tv => tv.TaxTemplateId == taxTemplate.id):
            order.TaxValues.Add(new TaxValue(taxTemplate))
            order.Taxes = JSON serialize order.TaxValues   # invalidate cache

        # Ensure singleton AccountTransaction exists for this tax
        # Source: Ticket.AddOrder()  [Ticket.cs:240-243]
        ticket.TransactionDocument.AddSingletonTransaction(
            taxTemplate.AccountTransactionType.Id,
            taxTemplate.AccountTransactionType,
            ticket.GetTicketAccounts())

    # Recalculate — Ticket.Recalculate() will update the Tax AccountTransaction amounts
    # Source: Ticket.Recalculate()  [Ticket.cs:673-684]
    recalculateTicket(ticket)
```

---

## 10. OrderMerger Logic (deduplication of identical orders)

```pseudo
# Source: OrderMerger.cs:8-28
function OrderMerger.NewMerge(orders):
    result = []
    source = orders.ToList()

    # Items with Quantity > 1 are NEVER merged (ban all of same MenuItemId)
    bannedMenuItems = source.Where(x => x.Quantity > 1).Select(x => x.MenuItemId).Distinct()
    result.AddRange(source.Where(x => bannedMenuItems.Contains(x.MenuItemId)))
    result.ForEach(x => source.Remove(x))

    while source.Any():
        order1 = source.First()
        source.Remove(order1)
        matches = source.Where(x => CanMergeOrders(order1, x)).ToList()
        matches.ForEach(x => source.Remove(x))
        order1.Quantity += matches.Sum(x => x.Quantity)
        result.Add(order1)

    return result

function CanMergeOrders(order1, order2):
    # Source: OrderMerger.cs:65-77
    if order1.Quantity != order2.Quantity: return false
    if order1.Price != order2.Price: return false
    if order1.MenuItemId != order2.MenuItemId: return false
    if order1.PortionName != order2.PortionName: return false
    if order1.CalculatePrice != order2.CalculatePrice: return false
    if order1.IncreaseInventory != order2.IncreaseInventory: return false
    if order1.DecreaseInventory != order2.DecreaseInventory: return false
    if order1.OrderTagValues.Count > 0 or order2.OrderTagValues.Count > 0: return false
    if not OrderStatesEqual(order1, order2): return false
    return true
```

---

## 11. ProductTimer (time-based pricing)

```pseudo
# Source: ProductTimerValue.cs:30-57
function ProductTimerValue.GetPrice(unitPrice):
    if unitPrice == 0: return 0
    return roundBankers((unitPrice / PriceDuration) * GetTime(), DECIMALS)

function ProductTimerValue.GetTime():
    time = GetTimePeriod()
    if time < MinTime:
        time = MinTime
    elif TimeRounding > 0 and TimeRounding != time:
        # Always round UP to next multiple of TimeRounding
        time = (Math.Truncate(time / TimeRounding) + 1) * TimeRounding
    return time

function ProductTimerValue.GetTimePeriod():
    s = Start
    e = (End != Start) ? End : DateTime.Now
    ts = new TimeSpan(e.Ticks - s.Ticks)
    switch PriceType:
        case 2: return Convert.ToDecimal(ts.TotalDays)     # days
        case 1: return Convert.ToDecimal(ts.TotalHours)    # hours
        default: return Convert.ToDecimal(ts.TotalMinutes) # minutes (default)
```

---

## 12. AccountTransaction (double-entry with auto-reversal)

```pseudo
# Source: AccountTransaction.cs:193-215
function AccountTransaction.UpdateAmount(amount, exchangeRate, accounts = null):
    if amount < 0 and CanReverse():
        Reverse()                                  # [AccountTransaction.cs:177]
            # tmp = SourceTransactionValue
            # SourceTransactionValue = TargetTransactionValue
            # TargetTransactionValue = tmp
            # IsReversed = true
    elif IsReversed and amount >= 0:
        Reverse()
        IsReversed = false

    Amount = abs(amount)
    # CRITICAL: Uses MidpointRounding.AwayFromZero (schoolbook rounding)
    Amount = roundAway(Amount, 2)                  # [AccountTransaction.cs:203]
    ExchangeRate = exchangeRate

    if accounts != null:
        sourceAccount = accounts.FirstOrDefault(x => x.AccountId == SourceTransactionValue.AccountId)
        if sourceAccount != null:
            SourceTransactionValue.UpdateExchange(sourceAccount.ExchangeRate)
        targetAccount = accounts.FirstOrDefault(x => x.AccountId == TargetTransactionValue.AccountId)
        if targetAccount != null:
            TargetTransactionValue.UpdateExchange(targetAccount.ExchangeRate)

# Source: AccountTransactionValue.cs:22-25
function AccountTransactionValue.UpdateExchange(exchangeRate):
    Exchange = exchangeRate == 0
        ? 0
        : roundBankers((Debit - Credit) / exchangeRate, 2)   # banker's rounding
```

---

## 13. Print Flow (ESC/POS for thermal printers)

### 13.1 Printer type detection

```pseudo
# Source: PrintJobFactory.cs:7
function PrintJobFactory.CreatePrintJob(printer, printerService):
    switch printer.PrinterType:
        case 0: return new SlipPrinterJob(printer, printerService)    # ESC/POS via LinePrinter
        case 1: return new TextPrinterJob(printer, printerService)    # XPS via FlowDocument
        case 2: return new HtmlPrinterJob(printer, printerService)    # HTML → XPS
        case 3: return new PortPrinterJob(printer, printerService)    # Raw bytes to LPT/COM
        case 4: return new DemoPrinterJob(printer, printerService)    # On-screen preview
        case 5: return new WindowsPrinterJob(printer, printerService) # XPS via FlowDocument
        case 6: return new CustomPrinterJob(printer, printerService)  # ICustomPrinter delegate
        case 7: return new RawPrinterJob(printer, printerService)     # Raw ANSI text via winspool
```

### 13.2 ESC/POS commands emitted by `LinePrinter`

```pseudo
# Source: Samba.Services/Implementations/PrinterModule/Tools/LinePrinter.cs

# All commands prefixed with ESC (0x1B) or GS (0x1D)
function LinePrinter.EnableLeft():     writeBytes([0x1B, 0x61, 0x00])           # ESC a 0
function LinePrinter.EnableCenter():   writeBytes([0x1B, 0x61, 0x01])           # ESC a 1
function LinePrinter.EnableRight():    writeBytes([0x1B, 0x61, 0x02])           # ESC a 2
function LinePrinter.EnableBold():     writeBytes([0x1B, 0x47, 0x01])           # ESC G 1
function LinePrinter.DisableBold():    writeBytes([0x1B, 0x47, 0x00])           # ESC G 0
function LinePrinter.Cut():            writeBytes([0x1B, 0x64, 0x01,
                                                  0x1D, 0x56, 0x42, 0x00])     # ESC d 1, GS V 66 0
function LinePrinter.Beep():           writeBytes([0x1B, 0x42, 0x03, 0x05])     # ESC B <times> <duration>
function LinePrinter.OpenCashDrawer(): writeBytes([0x1B, 0x70, 0x00, 0x19, 0xFA])  # ESC p 0 25 250

function LinePrinter.WriteLine(line, h, w, align):
    # h = horizontal scale (0-7), w = vertical scale (0-7)
    if align == "center": EnableCenter()
    elif align == "right": EnableRight()
    else: EnableLeft()
    writeBytes([0x1D, 0x21, h + w * 16])    # GS ! (h + w*16) — set font size
    writeString(line + "\n")                # 0x0A = line feed

function LinePrinter.SelectTurkishCodePage():
    writeBytes([0x1B, 0x1D, 0x74, 0x0C])    # ESC GS t 12 (Turkish code page 857)
```

### 13.3 Print template format (XML-like tags in the template text)

```
<L00>Ticket: {TICKET NUMBER}
<L00>Date: {DATE} {TIME}
<L00>Customer: {ENTITY NAME:Customer}
<F>
<J00>Item|Qty|Price
{ORDERS}
<F>
<J00>Subtotal|{PLAIN TOTAL}
<J00>Tax|{TAX TOTAL}
<J00>Total|{TOTAL AMOUNT}
<F>
{PAYMENTS}
<J00>Remaining|{REMAINING AMOUNT}
<F>
<C00>Thank you!
<cut>
<drawer>
<beep>
```

Tags (interpreted by `FormattedDocument.cs:26`):

| Tag | Formatter | Purpose |
|-----|-----------|---------|
| `<l` | LeftAlignFormatter | Left-aligned text |
| `<r` | RightAlignFormatter | Right-aligned text |
| `<c` | CenterAlignFormatter | Centered text |
| `<f>` | HorizontalRuleFormatter | Horizontal rule (─────) |
| `<t` | TitleFormatter | Boxed title |
| `<bx` | BoxFormatter | Boxed text |
| `<j` or `<p` | JustifyAlignFormatter | Multi-column justified |
| (none) | GenericFormatter | Plain line |
| `<eb>` | (parsed inline) | Enable bold |
| `<db>` | (parsed inline) | Disable bold |
| `<ec>` | (parsed inline) | Enable center |
| `<el>` | (parsed inline) | Enable left |
| `<er>` | (parsed inline) | Enable right |
| `<bmp>` | PrintBitmap(path) | Print bitmap image |
| `<qr>` | PrintQrCode(data, h, w) | Print QR code |
| `<bar>` | PrintBarCode(data, h, w) | Print barcode |
| `<cut>` | Cut() | Cut paper |
| `<beep>` | Beep() | Beep buzzer |
| `<drawer>` | OpenCashDrawer() | Open cash drawer |
| `<xct>` | ExecCommand(args) | Custom raw command |

### 13.4 Print job execution chain

```
1. Trigger:
   a. User taps PrintJobButton on POS screen → fires automation action "ExecutePrintJob"
      with PrintJobName parameter.
   b. Automation rule on event (TicketClosing, PaymentProcessed, OrderAdded, etc.)
      → action "ExecutePrintJob".
   c. Direct call: _printerService.PrintTicket(ticket, printJob, orderSelector, priority)
                                                              [PrinterService.cs:62]
   d. Direct call: _printerService.ExecutePrintJob(printJob, highPriority)
                                                              [PrinterService.cs:96]

2. ExecutePrintJob action processor                              [ExecutePrintJob.cs:32]
   - ticket = actionData["Ticket"]
   - pjName = actionData["PrintJobName"]
   - j = _cacheService.GetPrintJobByName(pjName)
   - copies = actionData["Copies"] (default 1)
   - printTicket = actionData["PrintTicket"] (default true)
   - priority = actionData["HighPriority"]
   - if ticket != null && printTicket:
       - build orderSelector expression from OrderTagName/OrderTagValue/OrderStateName/OrderState/OrderStateValue
       - _ticketService.UpdateTicketNumber(ticket, _applicationState.CurrentTicketType.TicketNumerator)
       - for i in 0..copies: _printerService.PrintTicket(ticket, j, expression.Compile(), priority)
   - else:
       - for i in 0..copies: _printerService.ExecutePrintJob(j, priority)

3. PrinterService.PrintTicket(ticket, printJob, orderSelector, highPriority)
                                                              [PrinterService.cs:62]
   - TicketPrinter.For(ticket)
       .WithPrinterService(this)
       .WithLogService(_logService)
       .WithTaskBuilder(_ticketPrintTaskBuilder)
       .WithPrintJob(printJob)
       .WithOrderSelector(orderSelector)
       .IsHighPriority(highPriority)
       .Print()                                              [TicketPrinter.cs:66]

4. TicketPrinter.Print()                                       [TicketPrinter.cs:66]
   - ticket = highPriority ? _ticket : ObjectCloner.Clone2(_ticket)
   - AsyncPrintTask.Exec(highPriority, () => InternalPrint(ticket, printJob, orderSelector), _logService)
     # queued on background thread unless highPriority

5. TicketPrinter.InternalPrint(ticket, printJob, orderSelector) [TicketPrinter.cs:72]
   - tasks = _ticketPrintTaskBuilder.GetPrintTasksForTicket(ticket, printJob, orderSelector)
                                                              [TicketPrintTaskBuilder.cs:197]
   - foreach task in tasks.Where(t => t.Printer != null && t.Lines != null):
       PrintJobFactory.CreatePrintJob(task.Printer, _printerService).DoPrint(task.Lines)
                                                              [PrintJobFactory.cs:7]

6. TicketPrintTaskBuilder.GetPrintTasksForTicket(ticket, printJob, orderSelector)
                                                              [TicketPrintTaskBuilder.cs:197]
   - orders = GetOrders(printJob, ticket, orderSelector)       [TicketPrintTaskBuilder.cs:39]
       switch (printJob.WhatToPrint):
         case LastLinesByPrinterLineCount: GetLastOrders(ticket, printJob, orderSelector)
         case LastPaidOrders: GetLastPaidOrders(ticket)
         case OrdersByQuanity / SeparatedByQuantity: SeparateOrders(ticket, orderSelector)
         default: ticket.Orders.Where(orderSelector).OrderBy(Id)
   - return GetPrintTasks(printJob, ticket, orders)            [TicketPrintTaskBuilder.cs:110]
       - if single PrinterMap and no filter:
           return [GetPrintTask(ticket, orders, printJob.PrinterMaps[0])]
       - else: group orders by PrinterMap (filtered by MenuItemGroupCode / MenuItemId)
         foreach group: GetPrintTask(ticket, groupOrders, map)
              - printer = PrinterById(map.PrinterId)
              - template = PrinterTemplateById(map.PrinterTemplateId)
              - if ShouldSkipPrint(printer, orders, template): return null
              - ticketLines = _ticketFormatter.GetFormattedTicket(ticket, orders, template)
                                                              [TicketFormatter.cs:29]
              - return TicketPrintTask { Lines = ticketLines, Printer = printer }

7. TicketFormatter.GetFormattedTicket(ticket, orders, printerTemplate) [TicketFormatter.cs:29]
   - dataObject = { Ticket = ObjectCloner.Clone2(ticket) }
   - orders = printerTemplate.MergeLines ? MergeLines(orders) : orders
   - ticket.Orders.Clear(); orders.ForEach(ticket.Orders.Add)
   - content = _ticketValueChanger.GetValue(printerTemplate, ticket)
       # processes {TICKET.TAGS}, {ORDERS}, {DISCOUNTS}, {PAYMENTS}, etc.
   - content = UpdateExpressions(content, dataObject)
       # executes {CALL:...} expressions
       # replaces {SETTING:...} values
   - return content.Split(['\r','\n'], RemoveEmptyEntries).ToArray()

8. AbstractPrintJob.DoPrint(lines) dispatches by PrinterType (see Section 13.1):
   - SlipPrinterJob.DoPrint(lines)                            [SlipPrinterJob.cs:16]
       - printer = new LinePrinter(ShareName, CharsPerLine, CodePage)
       - printer.StartDocument()                              [LinePrinter.cs:166]
       - formatters = new FormattedDocument(lines, CharsPerLine).GetFormatters()
                                                              [FormattedDocument.cs:8]
       - foreach formatter in formatters: SendToPrinter(printer, formatter)
           - if line doesn't start with "<": printer.WriteLine(data, h, w, Left)
           - else switch on Tag.TagName:
               "eb" → EnableBold, "db" → DisableBold
               "ec" → EnableCenter, "el" → EnableLeft, "er" → EnableRight
               "bmp" → PrintBitmap(path)
               "qr" → PrintQrCode(data, h, w)
               "bar" → PrintBarCode(data, h, w)
               "cut" → Cut()
               "beep" → Beep()
               "drawer" → OpenCashDrawer()
               "b" → Beep(times=h, duration=w)
               "xct" → ExecCommand(args)
       - if formatters.Count > 1: printer.Cut()
       - printer.EndDocument()
```

---

## 14. Web-Clone Implementation Notes (CRITICAL)

### 14.1 Rounding-mode inconsistency to PRESERVE

SambaPOS V3 uses **two different rounding modes** depending on the code path:

| Code path | Mode | Source |
|-----------|------|--------|
| `Ticket.CalculateTax` | `decimal.Round(value, 2)` (banker's / `MidpointRounding.ToEven`) | `Ticket.cs:350` |
| `Ticket.CalculateServices` | `decimal.Round(value, 2)` (banker's) | `Ticket.cs:376` |
| `Ticket.GetTaxTotal` | `decimal.Round(value, 2, MidpointRounding.AwayFromZero)` (schoolbook) | `Ticket.cs:694, 700` |
| `AccountTransaction.UpdateAmount` | `Decimal.Round(Amount, 2, MidpointRounding.AwayFromZero)` | `AccountTransaction.cs:203` |
| `TaxValue.GetTax` (when `Rounding > 0`) | `decimal.Round(..., Rounding, MidpointRounding.AwayFromZero)` | `TaxValue.cs:47` |
| `Calculation.Update` type 4 (rounding) | `decimal.Round(currentSum / Amount, MidpointRounding.AwayFromZero)` | `Calculation.cs:45` |
| `ProductTimerValue.GetPrice` | `decimal.Round(..., LocalSettings.Decimals)` (banker's) | `ProductTimerValue.cs:32` |

**Web clone MUST preserve this inconsistency** for byte-perfect monetary parity. JavaScript `Math.round` rounds half-up (toward +∞ for `.5`), which matches `AwayFromZero` for positives but NOT for negatives.

```javascript
// Use decimal.js with explicit rounding modes:
import Decimal from 'decimal.js';
Decimal.set({ precision: 28 });

const roundBankers = (v, d = 2) => new Decimal(v).toDecimalPlaces(d, Decimal.ROUND_HALF_EVEN).toNumber();
const roundAway    = (v, d = 2) => new Decimal(v).toDecimalPlaces(d, Decimal.ROUND_HALF_UP).toNumber();
```

### 14.2 `LocalSettings.Decimals = 2` is hardcoded

`Samba.Infrastructure/Settings/LocalSettings.cs:78`. Expose as config but **default to 2** for parity.

### 14.3 JSON-serialized fields with short DataMember names

`Ticket.TicketTags`, `Ticket.TicketStates`, `Ticket.TicketLogs`, `Order.Taxes`, `Order.OrderTags`, `Order.OrderStates`, `Task.CustomData`, `Entity.CustomData`, `EntityStateValue.EntityStates`, `AccountScreen.AutomationCommandMapData`, `AppRule.RuleConstraints`, `AppAction.Parameter`, `Widget.Properties`, `ScreenMenuItem.OrderTags/OrderStates/AutomationCommand` are all JSON strings persisted in DB columns. The DataContract serializer uses **short `[DataMember(Name="XX")]` names** (e.g. `"TN"`, `"TV"`, `"TR"`, `"RN"`) for compactness.

**Web clone must replicate the exact JSON wire format** if reading/writing existing `.sdf` files; otherwise can use full property names with a migration adapter.

### 14.4 No formal state machine

Do NOT model the Ticket lifecycle as a strict FSM. `(IsClosed, IsLocked)` plus the JSON `TicketStates` is what the code actually uses. Order states are even looser.

### 14.5 Splitting = MoveOrders to targetTicketId=0

There is no separate `SplitTicket` endpoint. The UI flow is `ExtractSelectedOrders` (handles partial-quantity cloning) → `MoveOrders`.

### 14.6 Closing is two-phase

1. `CloseTicket` saves and locks.
2. `MarkTicketAsClosed` (automation action) actually flips `IsClosed=true`.

The port should preserve this separation OR unify it with a clear documented behavior. Recommended: **preserve the two-phase close** for behavioral parity (the user spec requires "logic-perfect" replication).

### 14.7 PrintJob execution is async

`AsyncPrintTask.Exec(highPriority, action, logService)` queues the print job. High-priority jobs (e.g. kitchen receipts on `OrderAdded`) run immediately; low-priority jobs are queued. **Web clone should use a similar priority queue** (e.g. `p-queue` with concurrency 1 + priority field).

### 14.8 `AccountTransactionDocument` is the double-entry ledger

Every monetary operation (sale, tax, discount, payment, change, refund) creates or updates an `AccountTransaction` inside the ticket's `TransactionDocument`. The port must replicate this — it is the audit trail and the source of truth for balances:

```pseudo
# Source: AccountDao.GetAccountBalance
function GetAccountBalance(accountId):
    # = SUM(Debit - Credit) over all AccountTransactionValues with AccountId == accountId
    return db.AccountTransactionValues
        .Where(v => v.AccountId == accountId)
        .Sum(v => v.Debit - v.Credit)
```

### 14.9 `Order.CalculatePrice = false` is how Gift orders are excluded

Rather than being removed, Gift orders are kept in the ticket but excluded from totals via this flag. The port should support this flag on every order.

### 14.10 Concurrency

`TicketConcurrencyValidator` (`TicketDao.cs:146`) compares the in-memory ticket against the DB-loaded version on every `CloseTicket`. If `LastPaymentDate` differs (another terminal paid), the operation is rejected with `"TicketPaidLastChangesNotSaved"`.

**Web clone:** Implement optimistic concurrency using a `version` column (or `last_updated_at` timestamp) and `UPDATE ... WHERE version = $1 RETURNING *`.

---

## 15. Smoke Test Inputs (for VALIDATION_LOG.md)

Use these inputs to verify the port produces byte-identical totals to the original.

### Test 1: Simple ticket, tax included, no discount

```yaml
Setup:
  TicketType.TaxIncluded: true
  MenuItem: Burger, portion "Normal", price 5.00
  TaxTemplate: VAT 10% (Rounding=0), AccountTransactionType=SaleTax
Test:
  - Create ticket
  - Add 2x Burger
Expected:
  plainSum: 10.00
  preTaxServices: 0
  tax: 0           # TaxIncluded=true → no tax added on top
  postTaxServices: 0
  TotalAmount: 10.00
  RemainingAmount: 10.00
  # Tax AccountTransaction.Amount (extracted for reporting):
  #   per order: (5.00 * 10) / (100 + 10) = 0.454545... → 0.45 (Rounding=0, so no per-line rounding)
  #   × 2 orders = 0.909090... → round to 2 (AwayFromZero): 0.91
```

### Test 2: Simple ticket, tax excluded, no discount

```yaml
Setup:
  TicketType.TaxIncluded: false
  MenuItem: Burger, portion "Normal", price 5.00
  TaxTemplate: VAT 10% (Rounding=0)
Test:
  - Create ticket
  - Add 2x Burger
Expected:
  plainSum: 10.00
  preTaxServices: 0
  tax: 1.00        # 10% on top: 10 * 10 / 100 = 1.00
  postTaxServices: 0
  TotalAmount: 11.00
  RemainingAmount: 11.00
```

### Test 3: Discount before tax (10% off, tax excluded)

```yaml
Setup:
  TicketType.TaxIncluded: false
  MenuItem: Burger, price 5.00
  TaxTemplate: VAT 10%
  CalculationType: Discount (CalculationMethod=0, DecreaseAmount=true, IncludeTax=false, Amount=10)
Test:
  - Create ticket
  - Add 2x Burger
  - Apply 10% discount
Expected:
  plainSum: 10.00
  preTaxServices: -1.00        # 10% of 10.00 = 1.00, decreased → -1.00
  tax: 0.90                    # 10% on (10 - 1) = 0.90
  postTaxServices: 0
  TotalAmount: 9.90
```

### Test 4: Service charge after tax (10% service, tax included)

```yaml
Setup:
  TicketType.TaxIncluded: true
  MenuItem: Burger, price 5.00 (includes 10% VAT)
  TaxTemplate: VAT 10% (Rounding=0)
  CalculationType: Service Charge (CalculationMethod=0, DecreaseAmount=false, IncludeTax=true, Amount=10)
Test:
  - Create ticket
  - Add 2x Burger
  - Apply 10% service charge
Expected:
  plainSum: 10.00
  preTaxServices: 0
  tax: 0     # TaxIncluded → no tax added
  postTaxServices: 1.00   # 10% of 10.00 = 1.00 (applied after tax, but tax was 0)
  TotalAmount: 11.00
  # Per-line extracted tax (for reporting): 0.454545... × 2 = 0.909090... → 0.91
```

### Test 5: Rounding (nickel rounding, type 4, Amount=0.05)

```yaml
Setup:
  TicketType.TaxIncluded: true
  MenuItem: Coffee, price 1.43 (includes tax)
  CalculationType: Round (CalculationMethod=4, DecreaseAmount=true, IncludeTax=true, Amount=0.05)
Test:
  - Create ticket
  - Add 1x Coffee (plainSum=1.43)
  - Apply rounding
Expected:
  plainSum: 1.43
  # currentSum after pre-tax + tax = 1.43 (no pre-tax, no tax added)
  # Round to nearest 0.05: round(1.43 / 0.05) * 0.05 = round(28.6) * 0.05 = 29 * 0.05 = 1.45
  # CalculationAmount = 1.45 - 1.43 = 0.02
  # DecreaseAmount=true, but result is positive → set to 0... wait, no:
  # Actually: DecreaseAmount=true → if result > 0, set to 0... NO!
  # Re-reading Calculation.cs:48:
  #   if (DecreaseAmount && CalculationAmount > 0) CalculationAmount = 0
  # So for DecreaseAmount=true with a positive rounding result, the calc is zeroed out.
  # This means the ticket total stays at 1.43.
  # For round-DOWN (Amount<0): trunc(1.43 / -0.05) * -0.05 = trunc(-28.6) * -0.05 = -28 * -0.05 = 1.40
  # CalculationAmount = 1.40 - 1.43 = -0.03
  # DecreaseAmount=true → -0.03 is already negative, so no zero-out.
  # Total: 1.43 - 0.03 = 1.40
```

(Use these as starting points — additional tests should cover: foreign currency exchange, partial payments, split tickets, void orders, gift orders, multiple tax templates per item, order tag with TaxFree, order tag with AddTagPriceToOrderPrice, product timer pricing.)

---

**End of BUSINESS_RULES_ENGINE.md** — source for `/samba-web-clone/analysis/BUSINESS_RULES_ENGINE.md`.
