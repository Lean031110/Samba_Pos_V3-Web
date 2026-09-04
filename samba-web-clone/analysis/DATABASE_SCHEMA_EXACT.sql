-- =====================================================================
-- SambaPOS V3 — EXACT PHYSICAL DATABASE SCHEMA
-- =====================================================================
-- Source : Forensic analysis of Samba.Domain + Samba.Persistance +
--          Samba.Persistance.DBMigration (24 FluentMigrator migrations)
-- Engine : Microsoft SQL Server Compact 4.0 (.sdf)  [default]
--          OR full Microsoft SQL Server                [optional]
-- EF     : Entity Framework 4.4 Code-First (NO EDMX)
-- Migr.  : FluentMigrator (Lib/FluentMigrator.dll) — 24 migrations
-- Conventions:
--   * int Id columns are IDENTITY(1,1) PRIMARY KEY (EF Code-First default).
--   * Strings are nvarchar(max) NULL unless annotated [StringLength(n)]
--     → becomes nvarchar(n) NULL. (SQL CE stores nvarchar(max) as ntext.)
--   * Value-type columns (int, bit, decimal, datetime, double) are NOT NULL.
--   * Money: decimal(16,2). Quantity: decimal(16,3). Default decimal: decimal(18,2).
--   * Numerator.LastUpdateTime is a rowversion / binary(8) concurrency token.
--   * EF cascade delete is ON for all required (non-nullable) FKs.
--   * EF auto-creates an index on every FK column.
--   * JSON-serialized fields are stored as nvarchar(max) strings.
--   * No stored procedures, no views, no triggers.
--
-- PORTABILITY NOTE FOR WEB CLONE
-- ------------------------------
-- The web clone will use SQLite (better-sqlite3) or PostgreSQL.
-- Type mapping:
--   nvarchar(max)    → TEXT        (SQLite)  /  TEXT        (Postgres)
--   nvarchar(N)      → TEXT        (SQLite)  /  VARCHAR(N)  (Postgres)
--   int              → INTEGER     (SQLite)  /  INTEGER     (Postgres)
--   bit              → INTEGER     (SQLite)  /  BOOLEAN     (Postgres)
--   decimal(16,2)    → NUMERIC(16,2)         /  NUMERIC(16,2)
--   datetime         → TEXT (ISO8601)        /  TIMESTAMP
--   binary(8)        → BLOB                  /  BYTEA
--
-- SQLite PRAGMAs to apply on every connection:
--   PRAGMA journal_mode = WAL;
--   PRAGMA foreign_keys = ON;
--   PRAGMA busy_timeout = 5000;
--   PRAGMA synchronous = NORMAL;
-- =====================================================================

-- =====================================================================
-- SECTION 1 — VERSION TRACKING TABLE (created by Initializer.Create)
-- =====================================================================

CREATE TABLE VersionInfo (
    Version bigint NOT NULL
);
-- On a fresh DB, 24 rows are inserted: VALUES (1), (2), ... (24).

-- =====================================================================
-- SECTION 2 — USERS, ROLES, PERMISSIONS
-- =====================================================================

CREATE TABLE Users (
    Id          INTEGER PRIMARY KEY AUTOINCREMENT,
    Name        TEXT,
    PinCode     TEXT,
    UserRole_Id INTEGER          -- EF nav FK to UserRoles(Id); NULL allowed
);
CREATE INDEX IX_Users_UserRole_Id ON Users(UserRole_Id);

CREATE TABLE UserRoles (
    Id           INTEGER PRIMARY KEY AUTOINCREMENT,
    Name         TEXT,
    IsAdmin      INTEGER NOT NULL DEFAULT 0,
    DepartmentId INTEGER NOT NULL DEFAULT 0
);

CREATE TABLE Permissions (
    Id         INTEGER PRIMARY KEY AUTOINCREMENT,
    Name       TEXT,
    Value      INTEGER NOT NULL DEFAULT 0,    -- 0=Enabled, 1=Disabled, 2=Invisible
    UserRoleId INTEGER NOT NULL,
    FOREIGN KEY (UserRoleId) REFERENCES UserRoles(Id) ON DELETE CASCADE
);
CREATE INDEX IX_Permissions_UserRoleId ON Permissions(UserRoleId);

-- =====================================================================
-- SECTION 3 — TERMINALS, DEPARTMENTS, TICKET TYPES
-- =====================================================================

CREATE TABLE Terminals (
    Id                   INTEGER PRIMARY KEY AUTOINCREMENT,
    Name                 TEXT,
    IsDefault            INTEGER NOT NULL DEFAULT 0,
    AutoLogout           INTEGER NOT NULL DEFAULT 0,
    ReportPrinterId      INTEGER NOT NULL DEFAULT 0,    -- added v8 (no FK)
    TransactionPrinterId INTEGER NOT NULL DEFAULT 0     -- added v8 (no FK)
);

CREATE TABLE Departments (
    Id                   INTEGER PRIMARY KEY AUTOINCREMENT,
    Name                 TEXT,
    SortOrder            INTEGER NOT NULL DEFAULT 0,
    PriceTag             TEXT,                          -- [StringLength(10)]
    WarehouseId          INTEGER NOT NULL DEFAULT 0,
    TicketTypeId         INTEGER NOT NULL DEFAULT 0,
    ScreenMenuId         INTEGER NOT NULL DEFAULT 0,    -- added v19
    TicketCreationMethod INTEGER NOT NULL DEFAULT 0
);

CREATE TABLE TicketTypes (
    Id                       INTEGER PRIMARY KEY AUTOINCREMENT,
    Name                     TEXT,
    SortOrder                INTEGER NOT NULL DEFAULT 0,    -- added v3
    ScreenMenuId             INTEGER NOT NULL DEFAULT 0,
    TaxIncluded              INTEGER NOT NULL DEFAULT 1,
    TicketNumerator_Id       INTEGER,    -- EF nav FK to Numerators(Id)
    OrderNumerator_Id        INTEGER,    -- EF nav FK to Numerators(Id)
    SaleTransactionType_Id   INTEGER     -- EF nav FK to AccountTransactionTypes(Id)
);
CREATE INDEX IX_TicketTypes_TicketNumerator_Id     ON TicketTypes(TicketNumerator_Id);
CREATE INDEX IX_TicketTypes_OrderNumerator_Id      ON TicketTypes(OrderNumerator_Id);
CREATE INDEX IX_TicketTypes_SaleTransactionType_Id ON TicketTypes(SaleTransactionType_Id);

-- =====================================================================
-- SECTION 4 — TICKETS, ORDERS, TAGS, CALCULATIONS, PAYMENTS
-- =====================================================================

CREATE TABLE Tickets (
    Id                    INTEGER PRIMARY KEY AUTOINCREMENT,
    Name                  TEXT,
    LastUpdateTime        TEXT NOT NULL,                 -- datetime
    TicketNumber          TEXT,
    Date                  TEXT NOT NULL,
    LastOrderDate         TEXT NOT NULL,
    LastPaymentDate       TEXT NOT NULL,
    IsClosed              INTEGER NOT NULL DEFAULT 0,
    IsLocked              INTEGER NOT NULL DEFAULT 0,
    RemainingAmount       NUMERIC(16,2) NOT NULL DEFAULT 0,
    TotalAmount           NUMERIC(16,2) NOT NULL DEFAULT 0,
    DepartmentId          INTEGER NOT NULL DEFAULT 0,
    TicketTypeId          INTEGER NOT NULL DEFAULT 0,
    Note                  TEXT,
    LastModifiedUserName  TEXT,                          -- [StringLength(128)] added v11
    TicketTags            TEXT,    -- JSON: List<TicketTagValue>
    TicketStates          TEXT,    -- JSON: List<TicketStateValue>
    TicketLogs            TEXT,    -- JSON: List<TicketLogValue> (added v18)
    ExchangeRate          NUMERIC(18,2) NOT NULL DEFAULT 1,
    TaxIncluded           INTEGER NOT NULL DEFAULT 1,
    TransactionDocument_Id INTEGER    -- EF nav FK to AccountTransactionDocuments(Id)
);
CREATE INDEX IX_Tickets_TransactionDocument_Id ON Tickets(TransactionDocument_Id);
CREATE INDEX IX_Tickets_LastPaymentDate         ON Tickets(LastPaymentDate);  -- manual

CREATE TABLE TicketEntities (
    Id                INTEGER PRIMARY KEY AUTOINCREMENT,
    EntityTypeId      INTEGER NOT NULL DEFAULT 0,
    EntityId          INTEGER NOT NULL DEFAULT 0,
    AccountId         INTEGER NOT NULL DEFAULT 0,
    AccountTypeId     INTEGER NOT NULL DEFAULT 0,    -- added v3
    EntityName        TEXT,
    EntityCustomData  TEXT,    -- JSON
    Ticket_Id         INTEGER     -- EF nav FK to Tickets(Id)
);
CREATE INDEX IX_TicketEntities_Ticket_Id ON TicketEntities(Ticket_Id);

CREATE TABLE Orders (
    Id                       INTEGER NOT NULL,
    TicketId                 INTEGER NOT NULL,
    WarehouseId              INTEGER NOT NULL DEFAULT 0,
    DepartmentId             INTEGER NOT NULL DEFAULT 0,
    MenuItemId               INTEGER NOT NULL DEFAULT 0,
    MenuItemName             TEXT,
    PortionName              TEXT,
    Price                    NUMERIC(16,2) NOT NULL DEFAULT 0,
    Quantity                 NUMERIC(16,3) NOT NULL DEFAULT 0,
    PortionCount             INTEGER NOT NULL DEFAULT 0,
    Locked                   INTEGER NOT NULL DEFAULT 0,
    CalculatePrice           INTEGER NOT NULL DEFAULT 1,
    DecreaseInventory        INTEGER NOT NULL DEFAULT 0,
    IncreaseInventory        INTEGER NOT NULL DEFAULT 0,
    OrderNumber              INTEGER NOT NULL DEFAULT 0,
    CreatingUserName         TEXT,
    CreatedDateTime          TEXT NOT NULL,
    AccountTransactionTypeId INTEGER NOT NULL DEFAULT 0,
    ProductTimerValueId      INTEGER,    -- EF nav FK to ProductTimerValues(Id)
    PriceTag                 TEXT,
    Tag                      TEXT,
    Taxes                    TEXT,    -- JSON: List<TaxValue>
    OrderTags                TEXT,    -- JSON: List<OrderTagValue>
    OrderStates              TEXT,    -- JSON: List<OrderStateValue>
    PRIMARY KEY (Id, TicketId),
    FOREIGN KEY (TicketId) REFERENCES Tickets(Id) ON DELETE CASCADE
);
CREATE INDEX IX_Orders_TicketId            ON Orders(TicketId);
CREATE INDEX IX_Orders_ProductTimerValueId ON Orders(ProductTimerValueId);

CREATE TABLE OrderTagGroups (
    Id                       INTEGER PRIMARY KEY AUTOINCREMENT,
    Name                     TEXT,
    SortOrder                INTEGER NOT NULL DEFAULT 0,
    ColumnCount              INTEGER NOT NULL DEFAULT 0,
    ButtonHeight             INTEGER NOT NULL DEFAULT 0,
    FontSize                 INTEGER NOT NULL DEFAULT 0,    -- added v14
    ButtonColor              TEXT,                          -- [StringLength(128)] v14, recreated v16 as nullable
    MaxSelectedItems         INTEGER NOT NULL DEFAULT 0,
    MinSelectedItems         INTEGER NOT NULL DEFAULT 0,
    AddTagPriceToOrderPrice  INTEGER NOT NULL DEFAULT 0,
    FreeTagging              INTEGER NOT NULL DEFAULT 0,
    SaveFreeTags             INTEGER NOT NULL DEFAULT 0,
    GroupTag                 TEXT,
    TaxFree                  INTEGER NOT NULL DEFAULT 0,    -- added v4
    Hidden                   INTEGER NOT NULL DEFAULT 0     -- added v12
);

CREATE TABLE OrderTags (
    Id              INTEGER PRIMARY KEY AUTOINCREMENT,
    Name            TEXT,
    SortOrder       INTEGER NOT NULL DEFAULT 0,
    OrderTagGroupId INTEGER NOT NULL DEFAULT 0,
    Price           NUMERIC(16,2) NOT NULL DEFAULT 0,
    MenuItemId      INTEGER NOT NULL DEFAULT 0,
    MaxQuantity     INTEGER NOT NULL DEFAULT 1,
    FOREIGN KEY (OrderTagGroupId) REFERENCES OrderTagGroups(Id) ON DELETE CASCADE
);
CREATE INDEX IX_OrderTags_OrderTagGroupId ON OrderTags(OrderTagGroupId);

CREATE TABLE OrderTagMaps (
    Id                INTEGER PRIMARY KEY AUTOINCREMENT,
    TerminalId        INTEGER NOT NULL DEFAULT 0,
    DepartmentId      INTEGER NOT NULL DEFAULT 0,
    UserRoleId        INTEGER NOT NULL DEFAULT 0,
    TicketTypeId      INTEGER NOT NULL DEFAULT 0,
    OrderTagGroupId   INTEGER NOT NULL DEFAULT 0,
    MenuItemGroupCode TEXT,
    MenuItemId        INTEGER NOT NULL DEFAULT 0,
    FOREIGN KEY (OrderTagGroupId) REFERENCES OrderTagGroups(Id) ON DELETE CASCADE
);
CREATE INDEX IX_OrderTagMaps_OrderTagGroupId ON OrderTagMaps(OrderTagGroupId);

CREATE TABLE Calculations (
    Id                       INTEGER NOT NULL,
    Name                     TEXT,
    [Order]                  INTEGER NOT NULL DEFAULT 0,
    CalculationTypeId        INTEGER NOT NULL DEFAULT 0,
    TicketId                 INTEGER NOT NULL,
    AccountTransactionTypeId INTEGER NOT NULL DEFAULT 0,
    CalculationType          INTEGER NOT NULL DEFAULT 0,    -- 0,1,2,3,4,5
    IncludeTax               INTEGER NOT NULL DEFAULT 0,
    DecreaseAmount           INTEGER NOT NULL DEFAULT 0,
    UsePlainSum              INTEGER NOT NULL DEFAULT 0,    -- added v2
    Amount                   NUMERIC(16,2) NOT NULL DEFAULT 0,
    CalculationAmount        NUMERIC(16,2) NOT NULL DEFAULT 0,
    PRIMARY KEY (Id, TicketId),
    FOREIGN KEY (TicketId) REFERENCES Tickets(Id) ON DELETE CASCADE
);
CREATE INDEX IX_Calculations_TicketId ON Calculations(TicketId);

CREATE TABLE CalculationTypes (
    Id                       INTEGER PRIMARY KEY AUTOINCREMENT,
    Name                     TEXT,
    SortOrder                INTEGER NOT NULL DEFAULT 0,
    CalculationMethod        INTEGER NOT NULL DEFAULT 0,
    Amount                   NUMERIC(16,2) NOT NULL DEFAULT 0,
    MaxAmount                NUMERIC(16,2) NOT NULL DEFAULT 0,
    IncludeTax               INTEGER NOT NULL DEFAULT 0,
    DecreaseAmount           INTEGER NOT NULL DEFAULT 0,
    UsePlainSum              INTEGER NOT NULL DEFAULT 0,    -- added v2
    ToggleCalculation        INTEGER NOT NULL DEFAULT 0,    -- added v13
    AccountTransactionType_Id INTEGER    -- EF nav FK
);
CREATE INDEX IX_CalculationTypes_AccountTransactionType_Id
    ON CalculationTypes(AccountTransactionType_Id);

CREATE TABLE CalculationSelectors (
    Id           INTEGER PRIMARY KEY AUTOINCREMENT,
    Name         TEXT,
    ButtonHeader TEXT,
    ButtonColor  TEXT,
    FontSize     INTEGER NOT NULL DEFAULT 0,    -- added v5
    SortOrder    INTEGER NOT NULL DEFAULT 0
);

CREATE TABLE CalculationSelectorMaps (
    Id                   INTEGER PRIMARY KEY AUTOINCREMENT,
    TerminalId           INTEGER NOT NULL DEFAULT 0,
    DepartmentId         INTEGER NOT NULL DEFAULT 0,
    UserRoleId           INTEGER NOT NULL DEFAULT 0,
    TicketTypeId         INTEGER NOT NULL DEFAULT 0,
    CalculationSelectorId INTEGER NOT NULL DEFAULT 0,
    FOREIGN KEY (CalculationSelectorId) REFERENCES CalculationSelectors(Id) ON DELETE CASCADE
);
CREATE INDEX IX_CalculationSelectorMaps_CalculationSelectorId
    ON CalculationSelectorMaps(CalculationSelectorId);

-- M:N join table — EF-generated by HasMany(x=>x.CalculationTypes).WithMany()
CREATE TABLE CalculationSelectorCalculationTypes (
    CalculationSelector_Id INTEGER NOT NULL,
    CalculationType_Id     INTEGER NOT NULL,
    PRIMARY KEY (CalculationSelector_Id, CalculationType_Id),
    FOREIGN KEY (CalculationSelector_Id)
        REFERENCES CalculationSelectors(Id) ON DELETE CASCADE,
    FOREIGN KEY (CalculationType_Id)
        REFERENCES CalculationTypes(Id) ON DELETE CASCADE
);

CREATE TABLE PaidItems (
    Id       INTEGER NOT NULL,
    [Key]    TEXT,
    Quantity NUMERIC(16,3) NOT NULL DEFAULT 0,
    TicketId INTEGER NOT NULL,
    PRIMARY KEY (Id, TicketId),
    FOREIGN KEY (TicketId) REFERENCES Tickets(Id) ON DELETE CASCADE
);
CREATE INDEX IX_PaidItems_TicketId ON PaidItems(TicketId);

CREATE TABLE Payments (
    Id                   INTEGER NOT NULL,
    PaymentTypeId        INTEGER NOT NULL DEFAULT 0,
    TicketId             INTEGER NOT NULL,
    Name                 TEXT,
    Date                 TEXT NOT NULL,
    AccountTransactionId INTEGER NOT NULL DEFAULT 0,
    Amount               NUMERIC(16,2) NOT NULL DEFAULT 0,
    UserId               INTEGER NOT NULL DEFAULT 0,    -- added v5
    PRIMARY KEY (Id, TicketId),
    FOREIGN KEY (TicketId) REFERENCES Tickets(Id) ON DELETE CASCADE
);
CREATE INDEX IX_Payments_TicketId             ON Payments(TicketId);
CREATE INDEX IX_Payments_AccountTransactionId ON Payments(AccountTransactionId);

CREATE TABLE PaymentTypes (
    Id                          INTEGER PRIMARY KEY AUTOINCREMENT,
    Name                        TEXT,
    SortOrder                   INTEGER NOT NULL DEFAULT 0,
    ButtonColor                 TEXT,
    FontSize                    INTEGER NOT NULL DEFAULT 40,    -- added v5 (default 40)
    AccountTransactionType_Id   INTEGER,    -- EF nav FK
    Account_Id                  INTEGER     -- EF nav FK to Accounts(Id)
);
CREATE INDEX IX_PaymentTypes_AccountTransactionType_Id
    ON PaymentTypes(AccountTransactionType_Id);
CREATE INDEX IX_PaymentTypes_Account_Id ON PaymentTypes(Account_Id);

CREATE TABLE PaymentTypeMaps (
    Id            INTEGER PRIMARY KEY AUTOINCREMENT,
    TerminalId    INTEGER NOT NULL DEFAULT 0,
    DepartmentId  INTEGER NOT NULL DEFAULT 0,
    UserRoleId    INTEGER NOT NULL DEFAULT 0,
    TicketTypeId  INTEGER NOT NULL DEFAULT 0,
    PaymentTypeId INTEGER NOT NULL DEFAULT 0,
    FOREIGN KEY (PaymentTypeId) REFERENCES PaymentTypes(Id) ON DELETE CASCADE
);
CREATE INDEX IX_PaymentTypeMaps_PaymentTypeId ON PaymentTypeMaps(PaymentTypeId);
-- NOTE: PaymentTypeMaps.DisplayAtPaymentScreen / DisplayUnderTicket were dropped in v18.

CREATE TABLE ChangePayments (
    Id                     INTEGER NOT NULL,
    ChangePaymentTypeId    INTEGER NOT NULL DEFAULT 0,
    TicketId               INTEGER NOT NULL,
    Name                   TEXT,
    Date                   TEXT NOT NULL,
    AccountTransactionId   INTEGER NOT NULL DEFAULT 0,
    Amount                 NUMERIC(16,2) NOT NULL DEFAULT 0,
    UserId                 INTEGER NOT NULL DEFAULT 0,    -- added v5
    PRIMARY KEY (Id, TicketId),
    FOREIGN KEY (TicketId) REFERENCES Tickets(Id) ON DELETE CASCADE
);
CREATE INDEX IX_ChangePayments_TicketId           ON ChangePayments(TicketId);
CREATE INDEX IX_ChangePayments_AccountTransactionId
    ON ChangePayments(AccountTransactionId);

CREATE TABLE ChangePaymentTypes (
    Id                          INTEGER PRIMARY KEY AUTOINCREMENT,
    Name                        TEXT,
    SortOrder                   INTEGER NOT NULL DEFAULT 0,
    AccountTransactionType_Id   INTEGER,    -- EF nav FK
    Account_Id                  INTEGER     -- EF nav FK
);
CREATE INDEX IX_ChangePaymentTypes_AccountTransactionType_Id
    ON ChangePaymentTypes(AccountTransactionType_Id);
CREATE INDEX IX_ChangePaymentTypes_Account_Id ON ChangePaymentTypes(Account_Id);

CREATE TABLE ChangePaymentTypeMaps (
    Id                  INTEGER PRIMARY KEY AUTOINCREMENT,
    TerminalId          INTEGER NOT NULL DEFAULT 0,
    DepartmentId        INTEGER NOT NULL DEFAULT 0,
    UserRoleId          INTEGER NOT NULL DEFAULT 0,
    TicketTypeId        INTEGER NOT NULL DEFAULT 0,
    ChangePaymentTypeId INTEGER NOT NULL DEFAULT 0,
    FOREIGN KEY (ChangePaymentTypeId)
        REFERENCES ChangePaymentTypes(Id) ON DELETE CASCADE
);
CREATE INDEX IX_ChangePaymentTypeMaps_ChangePaymentTypeId
    ON ChangePaymentTypeMaps(ChangePaymentTypeId);

-- =====================================================================
-- SECTION 5 — PRODUCT TIMERS
-- =====================================================================

CREATE TABLE ProductTimers (
    Id            INTEGER PRIMARY KEY AUTOINCREMENT,
    Name          TEXT,
    PriceType     INTEGER NOT NULL DEFAULT 0,    -- 0=minute, 1=hour, 2=day
    PriceDuration NUMERIC(16,2) NOT NULL DEFAULT 1,
    MinTime       NUMERIC(16,2) NOT NULL DEFAULT 0,
    TimeRounding  NUMERIC(16,2) NOT NULL DEFAULT 0,
    StartTime     INTEGER NOT NULL DEFAULT 0    -- added v6
);

CREATE TABLE ProductTimerMaps (
    Id                INTEGER PRIMARY KEY AUTOINCREMENT,
    TerminalId        INTEGER NOT NULL DEFAULT 0,
    DepartmentId      INTEGER NOT NULL DEFAULT 0,
    UserRoleId        INTEGER NOT NULL DEFAULT 0,
    TicketTypeId      INTEGER NOT NULL DEFAULT 0,
    ProductTimerId    INTEGER NOT NULL DEFAULT 0,
    MenuItemGroupCode TEXT,
    MenuItemId        INTEGER NOT NULL DEFAULT 0,
    FOREIGN KEY (ProductTimerId) REFERENCES ProductTimers(Id) ON DELETE CASCADE
);
CREATE INDEX IX_ProductTimerMaps_ProductTimerId ON ProductTimerMaps(ProductTimerId);

CREATE TABLE ProductTimerValues (
    Id             INTEGER PRIMARY KEY AUTOINCREMENT,
    ProductTimerId INTEGER NOT NULL DEFAULT 0,
    PriceType      INTEGER NOT NULL DEFAULT 0,
    PriceDuration  NUMERIC(16,2) NOT NULL DEFAULT 1,
    MinTime        NUMERIC(16,2) NOT NULL DEFAULT 0,
    TimeRounding   NUMERIC(16,2) NOT NULL DEFAULT 0,
    Start          TEXT NOT NULL,    -- datetime
    [End]          TEXT NOT NULL     -- datetime
);

-- =====================================================================
-- SECTION 6 — MENU ITEMS, PORTIONS, PRICES, SCREEN MENUS
-- =====================================================================

CREATE TABLE MenuItems (
    Id        INTEGER PRIMARY KEY AUTOINCREMENT,
    Name      TEXT,
    GroupCode TEXT,
    Barcode   TEXT,
    Tag       TEXT
);

CREATE TABLE MenuItemPortions (
    Id         INTEGER PRIMARY KEY AUTOINCREMENT,
    Name       TEXT,
    MenuItemId INTEGER NOT NULL DEFAULT 0,
    Multiplier INTEGER NOT NULL DEFAULT 1,
    FOREIGN KEY (MenuItemId) REFERENCES MenuItems(Id) ON DELETE CASCADE
);
CREATE INDEX IX_MenuItemPortions_MenuItemId ON MenuItemPortions(MenuItemId);

CREATE TABLE MenuItemPrices (
    Id                INTEGER NOT NULL,
    MenuItemPortionId INTEGER NOT NULL,
    PriceTag          TEXT,    -- [StringLength(10)]
    Price             NUMERIC(16,2) NOT NULL DEFAULT 0,
    PRIMARY KEY (Id, MenuItemPortionId),
    FOREIGN KEY (MenuItemPortionId)
        REFERENCES MenuItemPortions(Id) ON DELETE CASCADE
);
CREATE INDEX IX_MenuItemPrices_MenuItemPortionId ON MenuItemPrices(MenuItemPortionId);

CREATE TABLE MenuItemPriceDefinitions (
    Id       INTEGER PRIMARY KEY AUTOINCREMENT,
    Name     TEXT,
    PriceTag TEXT    -- [StringLength(10)]
);

CREATE TABLE ScreenMenus (
    Id                      INTEGER PRIMARY KEY AUTOINCREMENT,
    Name                    TEXT,
    CategoryColumnCount     INTEGER NOT NULL DEFAULT 1,    -- added v19
    CategoryColumnWidthRate INTEGER NOT NULL DEFAULT 25    -- added v19
);

CREATE TABLE ScreenMenuCategories (
    Id                    INTEGER PRIMARY KEY AUTOINCREMENT,
    Name                  TEXT,
    SortOrder             INTEGER NOT NULL DEFAULT 0,
    ScreenMenuId          INTEGER NOT NULL DEFAULT 0,
    MostUsedItemsCategory INTEGER NOT NULL DEFAULT 0,
    ColumnCount           INTEGER NOT NULL DEFAULT 0,
    MenuItemButtonHeight  INTEGER NOT NULL DEFAULT 0,
    MenuItemButtonColor   TEXT,
    MenuItemFontSize      REAL NOT NULL DEFAULT 0,
    WrapText              INTEGER NOT NULL DEFAULT 0,
    PageCount             INTEGER NOT NULL DEFAULT 0,
    MainButtonHeight      INTEGER NOT NULL DEFAULT 0,
    MainButtonColor       TEXT,
    MainFontSize          REAL NOT NULL DEFAULT 0,
    SubButtonHeight       INTEGER NOT NULL DEFAULT 0,
    SubButtonRows         INTEGER NOT NULL DEFAULT 1,    -- added v19
    SubButtonColorDef     TEXT,                          -- added v19
    NumeratorType         INTEGER NOT NULL DEFAULT 0,
    NumeratorValues       TEXT,
    AlphaButtonValues     TEXT,
    ImagePath             TEXT,
    MaxItems              INTEGER NOT NULL DEFAULT 0,
    FOREIGN KEY (ScreenMenuId) REFERENCES ScreenMenus(Id) ON DELETE CASCADE
);
CREATE INDEX IX_ScreenMenuCategories_ScreenMenuId
    ON ScreenMenuCategories(ScreenMenuId);

CREATE TABLE ScreenMenuItems (
    Id                     INTEGER PRIMARY KEY AUTOINCREMENT,
    Name                   TEXT,
    ScreenMenuCategoryId   INTEGER NOT NULL DEFAULT 0,
    MenuItemId             INTEGER NOT NULL DEFAULT 0,
    SortOrder              INTEGER NOT NULL DEFAULT 0,
    AutoSelect             INTEGER NOT NULL DEFAULT 0,
    ButtonColor            TEXT,
    Quantity               INTEGER NOT NULL DEFAULT 0,
    ImagePath              TEXT,
    FontSize               REAL NOT NULL DEFAULT 0,
    SubMenuTag             TEXT,
    ItemPortion            TEXT,
    OrderTags              TEXT,    -- [StringLength(128)] added v12
    OrderStates            TEXT,    -- [StringLength(128)] added v12
    AutomationCommand      TEXT,    -- [StringLength(128)] added v12
    AutomationCommandValue TEXT,    -- [StringLength(128)] added v12
    FOREIGN KEY (ScreenMenuCategoryId)
        REFERENCES ScreenMenuCategories(Id) ON DELETE CASCADE
);
CREATE INDEX IX_ScreenMenuItems_ScreenMenuCategoryId
    ON ScreenMenuItems(ScreenMenuCategoryId);

CREATE TABLE MenuAssignments (
    Id           INTEGER PRIMARY KEY AUTOINCREMENT,
    TicketTypeId INTEGER NOT NULL DEFAULT 0,
    TerminalName TEXT,    -- [StringLength(128)]
    TerminalId   INTEGER NOT NULL DEFAULT 0,
    MenuId       INTEGER NOT NULL DEFAULT 0,
    SortOrder    INTEGER NOT NULL DEFAULT 0,
    FOREIGN KEY (TicketTypeId) REFERENCES TicketTypes(Id) ON DELETE CASCADE
);
CREATE INDEX IX_MenuAssignments_TicketTypeId ON MenuAssignments(TicketTypeId);

-- =====================================================================
-- SECTION 7 — TAX TEMPLATES
-- =====================================================================

CREATE TABLE TaxTemplates (
    Id                          INTEGER PRIMARY KEY AUTOINCREMENT,
    Name                        TEXT,
    SortOrder                   INTEGER NOT NULL DEFAULT 0,
    Rate                        NUMERIC(16,2) NOT NULL DEFAULT 0,
    Rounding                    INTEGER NOT NULL DEFAULT 0,    -- added v7
    AccountTransactionType_Id   INTEGER    -- EF nav FK
);
CREATE INDEX IX_TaxTemplates_AccountTransactionType_Id
    ON TaxTemplates(AccountTransactionType_Id);

CREATE TABLE TaxTemplateMaps (
    Id                INTEGER PRIMARY KEY AUTOINCREMENT,
    TerminalId        INTEGER NOT NULL DEFAULT 0,
    DepartmentId      INTEGER NOT NULL DEFAULT 0,
    UserRoleId        INTEGER NOT NULL DEFAULT 0,
    TicketTypeId      INTEGER NOT NULL DEFAULT 0,
    TaxTemplateId     INTEGER NOT NULL DEFAULT 0,
    MenuItemGroupCode TEXT,
    MenuItemId        INTEGER NOT NULL DEFAULT 0,
    FOREIGN KEY (TaxTemplateId) REFERENCES TaxTemplates(Id) ON DELETE CASCADE
);
CREATE INDEX IX_TaxTemplateMaps_TaxTemplateId ON TaxTemplateMaps(TaxTemplateId);

-- =====================================================================
-- SECTION 8 — ACCOUNTS (DOUBLE-ENTRY LEDGER)
-- =====================================================================

CREATE TABLE AccountTypes (
    Id                INTEGER PRIMARY KEY AUTOINCREMENT,
    Name              TEXT,
    DefaultFilterType INTEGER NOT NULL DEFAULT 0,
    WorkingRule       INTEGER NOT NULL DEFAULT 0,
    SortOrder         INTEGER NOT NULL DEFAULT 0,
    Tags              TEXT
);

CREATE TABLE Accounts (
    Id                INTEGER PRIMARY KEY AUTOINCREMENT,
    Name              TEXT,
    AccountTypeId     INTEGER NOT NULL DEFAULT 0,
    ForeignCurrencyId INTEGER NOT NULL DEFAULT 0,
    FOREIGN KEY (AccountTypeId) REFERENCES AccountTypes(Id) ON DELETE CASCADE
);
CREATE INDEX IX_Accounts_AccountTypeId ON Accounts(AccountTypeId);

CREATE TABLE AccountScreens (
    Id                       INTEGER PRIMARY KEY AUTOINCREMENT,
    Name                     TEXT,
    Filter                   INTEGER NOT NULL DEFAULT 0,
    DisplayAsTree            INTEGER NOT NULL DEFAULT 0,    -- added v8
    SortOrder                INTEGER NOT NULL DEFAULT 0,    -- added v11
    AutomationCommandMapData TEXT                            -- added v18 (JSON)
);

CREATE TABLE AccountScreenValues (
    Id                      INTEGER NOT NULL,
    AccountScreenId         INTEGER NOT NULL,
    AccountTypeId           INTEGER NOT NULL DEFAULT 0,
    AccountTypeName         TEXT,
    DisplayDetails          INTEGER NOT NULL DEFAULT 0,
    HideZeroBalanceAccounts INTEGER NOT NULL DEFAULT 0,    -- added v8
    SortOrder               INTEGER NOT NULL DEFAULT 0,
    PRIMARY KEY (Id, AccountScreenId),
    FOREIGN KEY (AccountScreenId) REFERENCES AccountScreens(Id) ON DELETE CASCADE
);
CREATE INDEX IX_AccountScreenValues_AccountScreenId
    ON AccountScreenValues(AccountScreenId);

CREATE TABLE AccountTransactionTypes (
    Id                     INTEGER PRIMARY KEY AUTOINCREMENT,
    Name                   TEXT,
    SortOrder              INTEGER NOT NULL DEFAULT 0,
    SourceAccountTypeId    INTEGER NOT NULL DEFAULT 0,
    TargetAccountTypeId    INTEGER NOT NULL DEFAULT 0,
    DefaultSourceAccountId INTEGER NOT NULL DEFAULT 0,
    DefaultTargetAccountId INTEGER NOT NULL DEFAULT 0,
    ForeignCurrencyId      INTEGER NOT NULL DEFAULT 0    -- added v23
);

CREATE TABLE AccountTransactionDocuments (
    Id           INTEGER PRIMARY KEY AUTOINCREMENT,
    Name         TEXT,
    Date         TEXT NOT NULL,
    DocumentTypeId INTEGER NOT NULL DEFAULT 0    -- added v8
);

CREATE TABLE AccountTransactions (
    Id                            INTEGER NOT NULL,
    Name                          TEXT,
    Amount                        NUMERIC(16,2) NOT NULL DEFAULT 0,
    ExchangeRate                  NUMERIC(16,2) NOT NULL DEFAULT 1,
    AccountTransactionDocumentId  INTEGER NOT NULL,
    AccountTransactionTypeId      INTEGER NOT NULL DEFAULT 0,
    SourceAccountTypeId           INTEGER NOT NULL DEFAULT 0,
    TargetAccountTypeId           INTEGER NOT NULL DEFAULT 0,
    IsReversed                    INTEGER NOT NULL DEFAULT 0,
    Reversable                    INTEGER NOT NULL DEFAULT 1,
    PRIMARY KEY (Id, AccountTransactionDocumentId),
    FOREIGN KEY (AccountTransactionDocumentId)
        REFERENCES AccountTransactionDocuments(Id) ON DELETE CASCADE
);
CREATE INDEX IX_AccountTransactions_AccountTransactionDocumentId
    ON AccountTransactions(AccountTransactionDocumentId);

CREATE TABLE AccountTransactionValues (
    Id                           INTEGER NOT NULL,
    Name                         TEXT,
    AccountTypeId                INTEGER NOT NULL DEFAULT 0,
    AccountId                    INTEGER NOT NULL DEFAULT 0,
    Date                         TEXT NOT NULL,
    Debit                        NUMERIC(16,2) NOT NULL DEFAULT 0,
    Credit                       NUMERIC(16,2) NOT NULL DEFAULT 0,
    Exchange                     NUMERIC(16,2) NOT NULL DEFAULT 0,
    AccountTransactionId         INTEGER NOT NULL,
    AccountTransactionDocumentId INTEGER NOT NULL,
    PRIMARY KEY (Id, AccountTransactionId, AccountTransactionDocumentId),
    FOREIGN KEY (AccountTransactionId, AccountTransactionDocumentId)
        REFERENCES AccountTransactions(Id, AccountTransactionDocumentId) ON DELETE CASCADE
);

CREATE TABLE AccountTransactionDocumentTypes (
    Id                  INTEGER PRIMARY KEY AUTOINCREMENT,
    Name                TEXT,
    ButtonHeader        TEXT,
    ButtonColor         TEXT,    -- default 'Gainsboro'
    MasterAccountTypeId INTEGER NOT NULL DEFAULT 0,
    DefaultAmount       TEXT,
    DescriptionTemplate TEXT,
    ExchangeTemplate    TEXT,
    BatchCreateDocuments INTEGER NOT NULL DEFAULT 0,
    Filter              INTEGER NOT NULL DEFAULT 0,
    SortOrder           INTEGER NOT NULL DEFAULT 0,
    PrinterTemplateId   INTEGER NOT NULL DEFAULT 0    -- added v8
);

CREATE TABLE AccountTransactionDocumentTypeMaps (
    Id                                  INTEGER PRIMARY KEY AUTOINCREMENT,
    TerminalId                          INTEGER NOT NULL DEFAULT 0,
    DepartmentId                        INTEGER NOT NULL DEFAULT 0,
    UserRoleId                          INTEGER NOT NULL DEFAULT 0,
    TicketTypeId                        INTEGER NOT NULL DEFAULT 0,
    AccountTransactionDocumentTypeId    INTEGER NOT NULL DEFAULT 0,
    FOREIGN KEY (AccountTransactionDocumentTypeId)
        REFERENCES AccountTransactionDocumentTypes(Id) ON DELETE CASCADE
);
CREATE INDEX IX_ATDTM_AccountTransactionDocumentTypeId
    ON AccountTransactionDocumentTypeMaps(AccountTransactionDocumentTypeId);

CREATE TABLE AccountTransactionDocumentAccountMaps (
    Id                                  INTEGER PRIMARY KEY AUTOINCREMENT,
    AccountTransactionDocumentTypeId    INTEGER NOT NULL DEFAULT 0,
    AccountId                           INTEGER NOT NULL DEFAULT 0,
    AccountName                         TEXT,
    MappedAccountId                     INTEGER NOT NULL DEFAULT 0,
    MappedAccountName                   TEXT,
    FOREIGN KEY (AccountTransactionDocumentTypeId)
        REFERENCES AccountTransactionDocumentTypes(Id) ON DELETE CASCADE
);

-- M:N join table for AccountTransactionDocumentType.TransactionTypes
CREATE TABLE AccountTransactionDocumentTypeAccountTransactionTypes (
    AccountTransactionDocumentType_Id INTEGER NOT NULL,
    AccountTransactionType_Id         INTEGER NOT NULL,
    PRIMARY KEY (AccountTransactionDocumentType_Id, AccountTransactionType_Id),
    FOREIGN KEY (AccountTransactionDocumentType_Id)
        REFERENCES AccountTransactionDocumentTypes(Id) ON DELETE CASCADE,
    FOREIGN KEY (AccountTransactionType_Id)
        REFERENCES AccountTransactionTypes(Id) ON DELETE CASCADE
);

-- =====================================================================
-- SECTION 9 — ENTITIES (Tables, Customers, generic)
-- =====================================================================

CREATE TABLE EntityTypes (
    Id                        INTEGER PRIMARY KEY AUTOINCREMENT,
    Name                      TEXT,
    SortOrder                 INTEGER NOT NULL DEFAULT 0,
    EntityName                TEXT,
    AccountTypeId             INTEGER NOT NULL DEFAULT 0,
    WarehouseTypeId           INTEGER NOT NULL DEFAULT 0,
    AccountNameTemplate       TEXT,
    PrimaryFieldName          TEXT,    -- [StringLength(128)] added v9
    PrimaryFieldFormat        TEXT,    -- [StringLength(128)] added v9
    DisplayFormat             TEXT,    -- [StringLength(128)] added v24
    AccountBalanceDisplayFormat TEXT    -- [StringLength(128)] added v11
);

CREATE TABLE Entities (
    Id            INTEGER PRIMARY KEY AUTOINCREMENT,
    Name          TEXT,
    EntityTypeId  INTEGER NOT NULL DEFAULT 0,
    LastUpdateTime TEXT NOT NULL,
    SearchString  TEXT,
    CustomData    TEXT,    -- JSON
    AccountId     INTEGER NOT NULL DEFAULT 0,
    WarehouseId   INTEGER NOT NULL DEFAULT 0,
    FOREIGN KEY (EntityTypeId) REFERENCES EntityTypes(Id) ON DELETE CASCADE
);
CREATE INDEX IX_Entities_EntityTypeId ON Entities(EntityTypeId);

CREATE TABLE EntityCustomFields (
    Id            INTEGER PRIMARY KEY AUTOINCREMENT,
    Name          TEXT,
    FieldType     INTEGER NOT NULL DEFAULT 0,    -- 0=String,1=WideString,2=Number,3=Query,4=Date
    EditingFormat TEXT,
    ValueSource   TEXT,
    Hidden        INTEGER NOT NULL DEFAULT 0,
    EntityType_Id INTEGER    -- EF nav FK to EntityTypes(Id)
);
CREATE INDEX IX_EntityCustomFields_EntityType_Id ON EntityCustomFields(EntityType_Id);

CREATE TABLE EntityScreens (
    Id                        INTEGER PRIMARY KEY AUTOINCREMENT,
    Name                      TEXT,
    TicketTypeId              INTEGER NOT NULL DEFAULT 0,
    EntityTypeId              INTEGER NOT NULL DEFAULT 0,
    SortOrder                 INTEGER NOT NULL DEFAULT 0,
    DisplayMode               INTEGER NOT NULL DEFAULT 0,
    BackgroundColor           TEXT,
    BackgroundImage           TEXT,
    FontSize                  INTEGER NOT NULL DEFAULT 50,
    PageCount                 INTEGER NOT NULL DEFAULT 0,
    RowCount                  INTEGER NOT NULL DEFAULT 0,
    ColumnCount               INTEGER NOT NULL DEFAULT 0,
    ButtonHeight              INTEGER NOT NULL DEFAULT 0,
    DisplayState              TEXT,
    StateFilter               TEXT,
    AskTicketType             INTEGER NOT NULL DEFAULT 0,    -- added v3
    SearchValueReplacePattern TEXT    -- [StringLength(256)] added v22
);

CREATE TABLE EntityScreenItems (
    Id             INTEGER NOT NULL,
    Name           TEXT,
    EntityScreenId INTEGER NOT NULL,
    EntityId       INTEGER NOT NULL DEFAULT 0,
    EntityState    TEXT,
    SortOrder      INTEGER NOT NULL DEFAULT 0,
    LastUpdateTime TEXT NOT NULL,
    PRIMARY KEY (Id, EntityScreenId),
    FOREIGN KEY (EntityScreenId) REFERENCES EntityScreens(Id) ON DELETE CASCADE
);
CREATE INDEX IX_EntityScreenItems_EntityScreenId ON EntityScreenItems(EntityScreenId);
CREATE INDEX IX_EntityScreenItems_EntityId       ON EntityScreenItems(EntityId);

CREATE TABLE EntityScreenMaps (
    Id             INTEGER PRIMARY KEY AUTOINCREMENT,
    TerminalId     INTEGER NOT NULL DEFAULT 0,
    DepartmentId   INTEGER NOT NULL DEFAULT 0,
    UserRoleId     INTEGER NOT NULL DEFAULT 0,
    TicketTypeId   INTEGER NOT NULL DEFAULT 0,
    EntityScreenId INTEGER NOT NULL DEFAULT 0,
    FOREIGN KEY (EntityScreenId) REFERENCES EntityScreens(Id) ON DELETE CASCADE
);
CREATE INDEX IX_EntityScreenMaps_EntityScreenId ON EntityScreenMaps(EntityScreenId);

CREATE TABLE EntityStateValues (
    Id           INTEGER PRIMARY KEY AUTOINCREMENT,
    EntityId     INTEGER NOT NULL DEFAULT 0,
    EntityStates TEXT    -- JSON
);
CREATE UNIQUE INDEX IX_EntityStateValue_EntityId ON EntityStateValues(EntityId);

CREATE TABLE EntityTypeAssignments (
    Id                      INTEGER NOT NULL,
    EntityTypeId            INTEGER NOT NULL DEFAULT 0,
    EntityTypeName          TEXT,
    AskBeforeCreatingTicket INTEGER NOT NULL DEFAULT 0,
    State                   TEXT,
    CopyToNewTickets        INTEGER NOT NULL DEFAULT 1,    -- added v10
    SortOrder               INTEGER NOT NULL DEFAULT 0,
    TicketTypeId            INTEGER NOT NULL DEFAULT 0,    -- v13 (was TicketType_Id)
    PRIMARY KEY (Id, TicketTypeId),
    FOREIGN KEY (TicketTypeId) REFERENCES TicketTypes(Id) ON DELETE CASCADE
);
CREATE INDEX IX_EntityTypeAssignments_TicketTypeId
    ON EntityTypeAssignments(TicketTypeId);

CREATE TABLE Widgets (
    Id                 INTEGER PRIMARY KEY AUTOINCREMENT,
    Name               TEXT,    -- [StringLength(128)] added v10
    EntityScreenId     INTEGER NOT NULL DEFAULT 0,
    XLocation          INTEGER NOT NULL DEFAULT 0,
    YLocation          INTEGER NOT NULL DEFAULT 0,
    Height             INTEGER NOT NULL DEFAULT 0,
    Width              INTEGER NOT NULL DEFAULT 0,
    CornerRadius       INTEGER NOT NULL DEFAULT 0,
    Angle              REAL NOT NULL DEFAULT 0,
    Scale              REAL NOT NULL DEFAULT 1,
    Properties         TEXT,    -- JSON
    CreatorName        TEXT,
    AutoRefresh        INTEGER NOT NULL DEFAULT 0,
    AutoRefreshInterval INTEGER NOT NULL DEFAULT 0,
    FOREIGN KEY (EntityScreenId) REFERENCES EntityScreens(Id) ON DELETE CASCADE
);
CREATE INDEX IX_Widgets_EntityScreenId ON Widgets(EntityScreenId);

CREATE TABLE States (
    Id                   INTEGER PRIMARY KEY AUTOINCREMENT,
    Name                 TEXT,
    GroupName            TEXT,
    StateType            INTEGER NOT NULL DEFAULT 0,    -- 0=Entity, 1=Ticket, 2=Order
    Color                TEXT,
    ShowOnEndOfDayReport INTEGER NOT NULL DEFAULT 0,    -- added v22
    ShowOnProductReport  INTEGER NOT NULL DEFAULT 0,    -- added v22
    ShowOnTicket         INTEGER NOT NULL DEFAULT 0     -- added v22
);

-- =====================================================================
-- SECTION 10 — PRINTERS, PRINT JOBS, PRINTER TEMPLATES
-- =====================================================================

CREATE TABLE Printers (
    Id                INTEGER PRIMARY KEY AUTOINCREMENT,
    Name              TEXT,
    ShareName         TEXT,
    PrinterType       INTEGER NOT NULL DEFAULT 0,
    -- 0=Slip(ESC/POS), 1=Text(XPS), 2=Html, 3=Port, 4=Demo, 5=Windows, 6=Custom, 7=Raw
    CodePage          INTEGER NOT NULL DEFAULT 857,
    CharsPerLine      INTEGER NOT NULL DEFAULT 42,
    PageHeight        INTEGER NOT NULL DEFAULT 0,
    CustomPrinterName TEXT,    -- [StringLength(128)] added v12
    CustomPrinterData TEXT     -- added v12
);

CREATE TABLE PrinterTemplates (
    Id         INTEGER PRIMARY KEY AUTOINCREMENT,
    Name       TEXT,
    Template   TEXT,    -- nvarchar(max); the actual template text
    MergeLines INTEGER NOT NULL DEFAULT 0
);

CREATE TABLE PrinterMaps (
    Id                INTEGER PRIMARY KEY AUTOINCREMENT,
    PrintJobId        INTEGER NOT NULL DEFAULT 0,
    MenuItemGroupCode TEXT,
    MenuItemId        INTEGER NOT NULL DEFAULT 0,
    PrinterId         INTEGER NOT NULL DEFAULT 0,
    PrinterTemplateId INTEGER NOT NULL DEFAULT 0,
    FOREIGN KEY (PrintJobId) REFERENCES PrintJobs(Id) ON DELETE CASCADE
    -- PrinterId / PrinterTemplateId are NOT cascade-deleted (deliberate)
);
CREATE INDEX IX_PrinterMaps_PrintJobId        ON PrinterMaps(PrintJobId);
CREATE INDEX IX_PrinterMaps_PrinterId         ON PrinterMaps(PrinterId);
CREATE INDEX IX_PrinterMaps_PrinterTemplateId ON PrinterMaps(PrinterTemplateId);

CREATE TABLE PrintJobs (
    Id               INTEGER PRIMARY KEY AUTOINCREMENT,
    Name             TEXT,
    WhatToPrint      INTEGER NOT NULL DEFAULT 0,
    -- 0=Everything, 1=LastLinesByPrinterLineCount, 2=LastPaidOrders,
    -- 3=OrdersByQuanity, 4=SeparatedByQuantity
    UseForPaidTickets INTEGER NOT NULL DEFAULT 0,
    ExcludeTax       INTEGER NOT NULL DEFAULT 0
);

-- =====================================================================
-- SECTION 11 — NUMERATORS, WORK PERIODS, SETTINGS, CURRENCIES, TRIGGERS
-- =====================================================================

CREATE TABLE Numerators (
    Id             INTEGER PRIMARY KEY AUTOINCREMENT,
    Name           TEXT,
    LastUpdateTime BLOB,    -- rowversion / binary(8) concurrency token
    Number         INTEGER NOT NULL DEFAULT 0,
    NumberFormat   TEXT     -- default "#"
);

CREATE TABLE WorkPeriods (
    Id                INTEGER PRIMARY KEY AUTOINCREMENT,
    Name              TEXT,
    StartDate         TEXT NOT NULL,
    EndDate           TEXT NOT NULL,
    StartDescription  TEXT,
    EndDescription    TEXT
);

CREATE TABLE ProgramSettings (
    Id    INTEGER PRIMARY KEY AUTOINCREMENT,
    Name  TEXT,
    Value TEXT    -- [StringLength(250)]
);

CREATE TABLE ForeignCurrencies (
    Id             INTEGER PRIMARY KEY AUTOINCREMENT,
    Name           TEXT,
    CurrencySymbol TEXT,
    ExchangeRate   NUMERIC(18,2) NOT NULL DEFAULT 1,
    Rounding       NUMERIC(18,2) NOT NULL DEFAULT 0
);

CREATE TABLE Triggers (
    Id          INTEGER PRIMARY KEY AUTOINCREMENT,
    Name        TEXT,
    Expression  TEXT,
    LastTrigger TEXT NOT NULL
);

-- =====================================================================
-- SECTION 12 — AUTOMATION (Rules, Actions, Commands, Scripts)
-- =====================================================================

CREATE TABLE AppActions (
    Id         INTEGER PRIMARY KEY AUTOINCREMENT,
    Name       TEXT,
    ActionType TEXT,
    Parameter  TEXT,    -- nvarchar(max); JSON parameter object
    SortOrder  INTEGER NOT NULL DEFAULT 0
);

CREATE TABLE AppRules (
    Id               INTEGER PRIMARY KEY AUTOINCREMENT,
    Name             TEXT,
    EventName        TEXT,
    EventConstraints TEXT,    -- nvarchar(max); JSON list of RuleConstraintValue
    CustomConstraint TEXT,
    RuleConstraints  TEXT,    -- nvarchar(max); added v19 (JSON)
    ConstraintMatch  INTEGER NOT NULL DEFAULT 0,    -- added v19
    SortOrder        INTEGER NOT NULL DEFAULT 0
);

CREATE TABLE ActionContainers (
    Id               INTEGER PRIMARY KEY AUTOINCREMENT,
    Name             TEXT,
    AppActionId      INTEGER NOT NULL DEFAULT 0,
    AppRuleId        INTEGER NOT NULL DEFAULT 0,
    ParameterValues  TEXT,    -- nvarchar(max); formatted "key=value#key=value"
    CustomConstraint TEXT,
    SortOrder        INTEGER NOT NULL DEFAULT 0,
    FOREIGN KEY (AppRuleId)  REFERENCES AppRules(Id)   ON DELETE CASCADE,
    FOREIGN KEY (AppActionId) REFERENCES AppActions(Id)
);
CREATE INDEX IX_ActionContainers_AppRuleId  ON ActionContainers(AppRuleId);
CREATE INDEX IX_ActionContainers_AppActionId ON ActionContainers(AppActionId);

CREATE TABLE AppRuleMaps (
    Id           INTEGER PRIMARY KEY AUTOINCREMENT,
    TerminalId   INTEGER NOT NULL DEFAULT 0,
    DepartmentId INTEGER NOT NULL DEFAULT 0,
    UserRoleId   INTEGER NOT NULL DEFAULT 0,
    TicketTypeId INTEGER NOT NULL DEFAULT 0,
    AppRuleId    INTEGER NOT NULL DEFAULT 0,
    FOREIGN KEY (AppRuleId) REFERENCES AppRules(Id) ON DELETE CASCADE
);
CREATE INDEX IX_AppRuleMaps_AppRuleId ON AppRuleMaps(AppRuleId);

CREATE TABLE AutomationCommands (
    Id           INTEGER PRIMARY KEY AUTOINCREMENT,
    Name         TEXT,
    ButtonHeader TEXT,
    Color        TEXT,
    FontSize     INTEGER NOT NULL DEFAULT 30,    -- added v5
    Values       TEXT,
    ToggleValues INTEGER NOT NULL DEFAULT 0,
    SortOrder    INTEGER NOT NULL DEFAULT 0
);

CREATE TABLE AutomationCommandMaps (
    Id                       INTEGER PRIMARY KEY AUTOINCREMENT,
    TerminalId               INTEGER NOT NULL DEFAULT 0,
    DepartmentId             INTEGER NOT NULL DEFAULT 0,
    UserRoleId               INTEGER NOT NULL DEFAULT 0,
    TicketTypeId             INTEGER NOT NULL DEFAULT 0,
    AutomationCommandId      INTEGER NOT NULL DEFAULT 0,
    DisplayOnTicket          INTEGER NOT NULL DEFAULT 1,
    DisplayOnPayment         INTEGER NOT NULL DEFAULT 0,
    DisplayOnOrders          INTEGER NOT NULL DEFAULT 0,
    DisplayOnTicketList      INTEGER NOT NULL DEFAULT 0,    -- added v10
    DisplayUnderTicket       INTEGER NOT NULL DEFAULT 0,    -- added v14
    DisplayUnderTicket2      INTEGER NOT NULL DEFAULT 0,    -- added v20
    DisplayOnCommandSelector INTEGER NOT NULL DEFAULT 0,    -- added v20
    EnabledStates            TEXT,    -- default '*'
    VisibleStates            TEXT,    -- default '*'
    FOREIGN KEY (AutomationCommandId)
        REFERENCES AutomationCommands(Id) ON DELETE CASCADE
);
CREATE INDEX IX_AutomationCommandMaps_AutomationCommandId
    ON AutomationCommandMaps(AutomationCommandId);

CREATE TABLE Scripts (
    Id          INTEGER PRIMARY KEY AUTOINCREMENT,
    Name        TEXT,
    HandlerName TEXT,
    Code        TEXT    -- nvarchar(max); FluentScript code
);

-- =====================================================================
-- SECTION 13 — INVENTORY (WAREHOUSES, RECIPES, CONSUMPTION)
-- =====================================================================

CREATE TABLE WarehouseTypes (
    Id   INTEGER PRIMARY KEY AUTOINCREMENT,
    Name TEXT
);

CREATE TABLE Warehouses (
    Id              INTEGER PRIMARY KEY AUTOINCREMENT,
    Name            TEXT,
    WarehouseTypeId INTEGER NOT NULL DEFAULT 0,
    SortOrder       INTEGER NOT NULL DEFAULT 0,
    FOREIGN KEY (WarehouseTypeId) REFERENCES WarehouseTypes(Id) ON DELETE CASCADE
);
CREATE INDEX IX_Warehouses_WarehouseTypeId ON Warehouses(WarehouseTypeId);

CREATE TABLE InventoryItems (
    Id                       INTEGER PRIMARY KEY AUTOINCREMENT,
    Name                     TEXT,
    GroupCode                TEXT,
    BaseUnit                 TEXT,
    TransactionUnit          TEXT,
    TransactionUnitMultiplier INTEGER NOT NULL DEFAULT 1,
    Warehouse                TEXT    -- [StringLength(128)] added v17
);

CREATE TABLE Recipes (
    Id        INTEGER PRIMARY KEY AUTOINCREMENT,
    Name      TEXT,
    FixedCost NUMERIC(16,2) NOT NULL DEFAULT 0,
    Portion_Id INTEGER    -- EF nav FK to MenuItemPortions(Id)
);
CREATE INDEX IX_Recipes_Portion_Id ON Recipes(Portion_Id);

CREATE TABLE RecipeItems (
    Id              INTEGER PRIMARY KEY AUTOINCREMENT,
    Quantity        NUMERIC(16,3) NOT NULL DEFAULT 0,
    RecipeId        INTEGER NOT NULL DEFAULT 0,
    InventoryItem_Id INTEGER,    -- EF nav FK to InventoryItems(Id)
    FOREIGN KEY (RecipeId) REFERENCES Recipes(Id) ON DELETE CASCADE
);
CREATE INDEX IX_RecipeItems_RecipeId        ON RecipeItems(RecipeId);
CREATE INDEX IX_RecipeItems_InventoryItem_Id ON RecipeItems(InventoryItem_Id);

CREATE TABLE InventoryTransactionTypes (
    Id                       INTEGER PRIMARY KEY AUTOINCREMENT,
    Name                     TEXT,
    SourceWarehouseTypeId    INTEGER NOT NULL DEFAULT 0,
    TargetWarehouseTypeId    INTEGER NOT NULL DEFAULT 0,
    DefaultSourceWarehouseId INTEGER NOT NULL DEFAULT 0,
    DefaultTargetWarehouseId INTEGER NOT NULL DEFAULT 0,
    SortOrder                INTEGER NOT NULL DEFAULT 0
);

CREATE TABLE InventoryTransactionDocumentTypes (
    Id                          INTEGER PRIMARY KEY AUTOINCREMENT,
    Name                        TEXT,
    SourceEntityTypeId          INTEGER NOT NULL DEFAULT 0,
    TargetEntityTypeId          INTEGER NOT NULL DEFAULT 0,
    DefaultSourceEntityId       INTEGER NOT NULL DEFAULT 0,
    DefaultTargetEntityId       INTEGER NOT NULL DEFAULT 0,
    SortOrder                   INTEGER NOT NULL DEFAULT 0,
    AccountTransactionType_Id   INTEGER,    -- EF nav FK
    InventoryTransactionType_Id INTEGER     -- EF nav FK
);

CREATE TABLE InventoryTransactionsDocuments (
    Id   INTEGER PRIMARY KEY AUTOINCREMENT,
    Name TEXT,
    Date TEXT NOT NULL
);

CREATE TABLE InventoryTransactions (
    Id                              INTEGER PRIMARY KEY AUTOINCREMENT,
    InventoryTransactionDocumentId  INTEGER NOT NULL DEFAULT 0,
    InventoryTransactionTypeId      INTEGER NOT NULL DEFAULT 0,
    SourceWarehouseId               INTEGER NOT NULL DEFAULT 0,
    TargetWarehouseId               INTEGER NOT NULL DEFAULT 0,
    Date                            TEXT NOT NULL,
    Unit                            TEXT,
    Multiplier                      INTEGER NOT NULL DEFAULT 1,
    Quantity                        NUMERIC(16,3) NOT NULL DEFAULT 0,
    Price                           NUMERIC(16,2) NOT NULL DEFAULT 0,
    InventoryItem_Id                INTEGER,    -- EF nav FK to InventoryItems(Id)
    FOREIGN KEY (InventoryTransactionDocumentId)
        REFERENCES InventoryTransactionsDocuments(Id) ON DELETE CASCADE
);
CREATE INDEX IX_InventoryTransactions_DocumentId ON InventoryTransactions(InventoryTransactionDocumentId);
CREATE INDEX IX_InventoryTransactions_InventoryItem_Id
    ON InventoryTransactions(InventoryItem_Id);

CREATE TABLE PeriodicConsumptions (
    Id             INTEGER PRIMARY KEY AUTOINCREMENT,
    Name           TEXT,
    WorkPeriodId   INTEGER NOT NULL DEFAULT 0,
    StartDate      TEXT NOT NULL,
    EndDate        TEXT NOT NULL,
    LastUpdateTime TEXT NOT NULL
);

CREATE TABLE WarehouseConsumptions (
    Id                    INTEGER NOT NULL,
    PeriodicConsumptionId INTEGER NOT NULL,
    WarehouseId           INTEGER NOT NULL DEFAULT 0,
    PRIMARY KEY (Id, PeriodicConsumptionId),
    FOREIGN KEY (PeriodicConsumptionId)
        REFERENCES PeriodicConsumptions(Id) ON DELETE CASCADE
);

CREATE TABLE PeriodicConsumptionItems (
    Id                     INTEGER NOT NULL,
    PeriodicConsumptionId  INTEGER NOT NULL,
    WarehouseConsumptionId INTEGER NOT NULL,
    InventoryItemId        INTEGER NOT NULL DEFAULT 0,
    InventoryItemName      TEXT,
    UnitName               TEXT,
    UnitMultiplier         NUMERIC(16,2) NOT NULL DEFAULT 1,
    InStock                NUMERIC(16,3) NOT NULL DEFAULT 0,
    Added                  NUMERIC(16,3) NOT NULL DEFAULT 0,    -- added v4 (was Purchase)
    Removed                NUMERIC(16,3) NOT NULL DEFAULT 0,    -- added v4
    Consumption            NUMERIC(16,3) NOT NULL DEFAULT 0,
    PhysicalInventory      NUMERIC(16,3),                       -- nullable
    Cost                   NUMERIC(16,2) NOT NULL DEFAULT 0,
    PRIMARY KEY (Id, WarehouseConsumptionId, PeriodicConsumptionId),
    FOREIGN KEY (PeriodicConsumptionId, WarehouseConsumptionId)
        REFERENCES WarehouseConsumptions(PeriodicConsumptionId, Id) ON DELETE CASCADE
);

CREATE TABLE CostItems (
    Id                     INTEGER NOT NULL,
    Name                   TEXT,
    PeriodicConsumptionId  INTEGER NOT NULL,
    WarehouseConsumptionId INTEGER NOT NULL,
    MenuItemId             INTEGER NOT NULL DEFAULT 0,
    PortionId              INTEGER NOT NULL DEFAULT 0,
    PortionName            TEXT,
    Quantity               NUMERIC(16,3) NOT NULL DEFAULT 0,
    CostPrediction         NUMERIC(16,2) NOT NULL DEFAULT 0,
    Cost                   NUMERIC(16,2) NOT NULL DEFAULT 0,
    PRIMARY KEY (Id, WarehouseConsumptionId, PeriodicConsumptionId),
    FOREIGN KEY (PeriodicConsumptionId, WarehouseConsumptionId)
        REFERENCES WarehouseConsumptions(PeriodicConsumptionId, Id) ON DELETE CASCADE
);

-- =====================================================================
-- SECTION 14 — TASKS, TICKET TAGS
-- =====================================================================

CREATE TABLE TaskTypes (
    Id   INTEGER PRIMARY KEY AUTOINCREMENT,
    Name TEXT
);

CREATE TABLE Tasks (
    Id             INTEGER PRIMARY KEY AUTOINCREMENT,
    Name           TEXT,
    TaskTypeId     INTEGER NOT NULL DEFAULT 0,
    Content        TEXT,
    StartDate      TEXT NOT NULL,
    EndDate        TEXT NOT NULL,
    CustomData     TEXT,    -- nvarchar(max); added v21 (JSON)
    Completed      INTEGER NOT NULL DEFAULT 0,
    LastUpdateTime TEXT NOT NULL,
    FOREIGN KEY (TaskTypeId) REFERENCES TaskTypes(Id) ON DELETE CASCADE
);
CREATE INDEX IX_Tasks_TaskTypeId ON Tasks(TaskTypeId);

CREATE TABLE TaskTokens (
    Id              INTEGER NOT NULL,
    TaskId          INTEGER NOT NULL,
    Caption         TEXT,
    Value           TEXT,
    Type            INTEGER NOT NULL DEFAULT 0,
    ReferenceTypeId INTEGER NOT NULL DEFAULT 0,
    ReferenceId     INTEGER NOT NULL DEFAULT 0,
    PRIMARY KEY (Id, TaskId),
    FOREIGN KEY (TaskId) REFERENCES Tasks(Id) ON DELETE CASCADE
);
CREATE INDEX IX_TaskTokens_TaskId ON TaskTokens(TaskId);

CREATE TABLE TaskCustomFields (
    Id            INTEGER NOT NULL,
    Name          TEXT,    -- [StringLength(128)]
    TaskTypeId    INTEGER NOT NULL DEFAULT 0,
    FieldType     INTEGER NOT NULL DEFAULT 0,
    EditingFormat TEXT,    -- [StringLength(128)]
    DisplayFormat TEXT,    -- [StringLength(128)]
    PRIMARY KEY (Id, TaskTypeId),
    FOREIGN KEY (TaskTypeId) REFERENCES TaskTypes(Id) ON DELETE CASCADE
);
CREATE INDEX IX_TaskCustomFields_TaskTypeId ON TaskCustomFields(TaskTypeId);

CREATE TABLE TicketTagGroups (
    Id                           INTEGER PRIMARY KEY AUTOINCREMENT,
    Name                         TEXT,
    SortOrder                    INTEGER NOT NULL DEFAULT 0,
    FreeTagging                  INTEGER NOT NULL DEFAULT 0,
    SaveFreeTags                 INTEGER NOT NULL DEFAULT 0,
    ButtonColorWhenTagSelected   TEXT,
    ButtonColorWhenNoTagSelected TEXT,
    ForceValue                   INTEGER NOT NULL DEFAULT 0,
    AskBeforeCreatingTicket      INTEGER NOT NULL DEFAULT 0,
    DataType                     INTEGER NOT NULL DEFAULT 0    -- 0=Alpha, 1=Integer, 2=Decimal
);

CREATE TABLE TicketTags (
    Id                INTEGER PRIMARY KEY AUTOINCREMENT,
    Name              TEXT,
    TicketTagGroupId  INTEGER NOT NULL DEFAULT 0,
    SortOrder         INTEGER NOT NULL DEFAULT 0,    -- added v12
    FOREIGN KEY (TicketTagGroupId)
        REFERENCES TicketTagGroups(Id) ON DELETE CASCADE
);
CREATE INDEX IX_TicketTags_TicketTagGroupId ON TicketTags(TicketTagGroupId);

CREATE TABLE TicketTagMaps (
    Id                INTEGER PRIMARY KEY AUTOINCREMENT,
    TerminalId        INTEGER NOT NULL DEFAULT 0,
    DepartmentId      INTEGER NOT NULL DEFAULT 0,
    UserRoleId        INTEGER NOT NULL DEFAULT 0,
    TicketTypeId      INTEGER NOT NULL DEFAULT 0,
    TicketTagGroupId  INTEGER NOT NULL DEFAULT 0,
    FOREIGN KEY (TicketTagGroupId)
        REFERENCES TicketTagGroups(Id) ON DELETE CASCADE
);
CREATE INDEX IX_TicketTagMaps_TicketTagGroupId ON TicketTagMaps(TicketTagGroupId);

-- =====================================================================
-- SECTION 15 — VERSIONINFO SEED (24 rows)
-- =====================================================================
INSERT INTO VersionInfo (Version) VALUES (1);
INSERT INTO VersionInfo (Version) VALUES (2);
INSERT INTO VersionInfo (Version) VALUES (3);
INSERT INTO VersionInfo (Version) VALUES (4);
INSERT INTO VersionInfo (Version) VALUES (5);
INSERT INTO VersionInfo (Version) VALUES (6);
INSERT INTO VersionInfo (Version) VALUES (7);
INSERT INTO VersionInfo (Version) VALUES (8);
INSERT INTO VersionInfo (Version) VALUES (9);
INSERT INTO VersionInfo (Version) VALUES (10);
INSERT INTO VersionInfo (Version) VALUES (11);
INSERT INTO VersionInfo (Version) VALUES (12);
INSERT INTO VersionInfo (Version) VALUES (13);
INSERT INTO VersionInfo (Version) VALUES (14);
INSERT INTO VersionInfo (Version) VALUES (15);
INSERT INTO VersionInfo (Version) VALUES (16);
INSERT INTO VersionInfo (Version) VALUES (17);
INSERT INTO VersionInfo (Version) VALUES (18);
INSERT INTO VersionInfo (Version) VALUES (19);
INSERT INTO VersionInfo (Version) VALUES (20);
INSERT INTO VersionInfo (Version) VALUES (21);
INSERT INTO VersionInfo (Version) VALUES (22);
INSERT INTO VersionInfo (Version) VALUES (23);
INSERT INTO VersionInfo (Version) VALUES (24);

-- =====================================================================
-- SECTION 16 — BUSINESS DATA SEED (executed by DataCreationService
--              on first launch when Users table is empty)
-- =====================================================================

-- AccountTypes (5)
INSERT INTO AccountTypes (Id, Name, DefaultFilterType, WorkingRule, SortOrder, Tags) VALUES
  (1, 'Sales Accounts',      0, 0, 10, NULL),
  (2, 'Receivable Accounts', 0, 0, 20, NULL),
  (3, 'Payment Accounts',    0, 0, 30, NULL),
  (4, 'Discount Accounts',   0, 0, 40, NULL),
  (5, 'Customer Accounts',   0, 0, 50, NULL);

-- Accounts (7)
INSERT INTO Accounts (Id, Name, AccountTypeId, ForeignCurrencyId) VALUES
  (1, 'Sales',         1, 0),
  (2, 'Receivables',   2, 0),
  (3, 'Cash',          3, 0),
  (4, 'Credit Card',   3, 0),
  (5, 'Voucher',       3, 0),
  (6, 'Discount',      4, 0),
  (7, 'Rounding',      4, 0);

-- AccountTransactionTypes (7)
INSERT INTO AccountTransactionTypes
  (Id, Name, SortOrder, SourceAccountTypeId, TargetAccountTypeId,
   DefaultSourceAccountId, DefaultTargetAccountId, ForeignCurrencyId)
VALUES
  (1, 'Discount Transaction',        10, 2, 4, 2, 6, 0),
  (2, 'Rounding Transaction',        20, 2, 4, 2, 7, 0),
  (3, 'Sale Transaction',            30, 1, 2, 1, 2, 0),
  (4, 'Payment Transaction',         40, 2, 3, 2, 3, 0),
  (5, 'Customer Account Transaction',50, 2, 5, 2, 0, 0),
  (6, 'Customer Cash Payment',       60, 5, 3, 0, 3, 0),
  (7, 'Customer Credit Card Payment',70, 5, 3, 0, 4, 0);

-- Numerators (2)
INSERT INTO Numerators (Id, Name, Number, NumberFormat) VALUES
  (1, 'Ticket Numerator', 0, '#'),
  (2, 'Order Numerator',  0, '#');

-- WarehouseType + Warehouse
INSERT INTO WarehouseTypes (Id, Name) VALUES (1, 'Warehouses');
INSERT INTO Warehouses (Id, Name, WarehouseTypeId, SortOrder) VALUES (1, 'Local Warehouse', 1, 10);

-- CalculationTypes (2)
INSERT INTO CalculationTypes
  (Id, Name, SortOrder, CalculationMethod, Amount, MaxAmount, IncludeTax,
   DecreaseAmount, UsePlainSum, ToggleCalculation, AccountTransactionType_Id)
VALUES
  (1, 'Discount', 10, 0, 0, 0, 0, 1, 0, 0, 1),
  (2, 'Round',    20, 2, 0, 0, 1, 1, 0, 0, 2);

-- CalculationSelectors (2)
INSERT INTO CalculationSelectors (Id, Name, ButtonHeader, ButtonColor, FontSize, SortOrder)
VALUES (1, 'Discount', '%',     'Gainsboro', 30, 10),
       (2, 'Round',    'Round', 'Gainsboro', 30, 20);
-- M:N: Discount → CalculationType 1 ; Round → CalculationType 2
INSERT INTO CalculationSelectorCalculationTypes (CalculationSelector_Id, CalculationType_Id) VALUES (1, 1);
INSERT INTO CalculationSelectorCalculationTypes (CalculationSelector_Id, CalculationType_Id) VALUES (2, 2);

-- PaymentTypes (4)
INSERT INTO PaymentTypes (Id, Name, SortOrder, ButtonColor, FontSize,
                          AccountTransactionType_Id, Account_Id)
VALUES
  (1, 'Cash',            10, 'Gainsboro', 40, 4, 3),
  (2, 'Credit Card',     20, 'Gainsboro', 40, 4, 4),
  (3, 'Voucher',         30, 'Gainsboro', 40, 4, 5),
  (4, 'Customer Account',40, 'Gainsboro', 40, 5, NULL);

-- UserRoles + Users (admin / 1234)
INSERT INTO UserRoles (Id, Name, IsAdmin, DepartmentId) VALUES (1, 'Admin', 1, 1);
INSERT INTO Users (Id, Name, PinCode, UserRole_Id)       VALUES (1, 'Administrator', '1234', 1);

-- TicketType (1)
INSERT INTO TicketTypes (Id, Name, SortOrder, ScreenMenuId, TaxIncluded,
                         TicketNumerator_Id, OrderNumerator_Id, SaleTransactionType_Id)
VALUES (1, 'Ticket', 10, 1, 1, 1, 2, 3);

-- Department (1)
INSERT INTO Departments (Id, Name, SortOrder, PriceTag, WarehouseId, TicketTypeId,
                         ScreenMenuId, TicketCreationMethod)
VALUES (1, 'Restaurant', 10, NULL, 1, 1, 1, 0);

-- ScreenMenu (1)
INSERT INTO ScreenMenus (Id, Name, CategoryColumnCount, CategoryColumnWidthRate)
VALUES (1, 'Menu', 1, 25);

-- InventoryTransactionType (1)
INSERT INTO InventoryTransactionTypes
  (Id, Name, SourceWarehouseTypeId, TargetWarehouseTypeId,
   DefaultSourceWarehouseId, DefaultTargetWarehouseId, SortOrder)
VALUES (1, 'Purchase', 0, 1, 0, 1, 10);

-- InventoryTransactionDocumentType (1)
INSERT INTO InventoryTransactionDocumentTypes
  (Id, Name, SourceEntityTypeId, TargetEntityTypeId,
   DefaultSourceEntityId, DefaultTargetEntityId, SortOrder,
   AccountTransactionType_Id, InventoryTransactionType_Id)
VALUES (1, 'Purchase Transaction', 0, 0, 0, 0, 10, NULL, 1);

-- Printers (3)
INSERT INTO Printers (Id, Name, ShareName, PrinterType, CodePage, CharsPerLine, PageHeight)
VALUES
  (1, 'Ticket Printer',  'Ticket Printer',  0, 857, 42, 0),
  (2, 'Kitchen Printer', 'Kitchen Printer', 0, 857, 42, 0),
  (3, 'Invoice Printer', 'Invoice Printer', 0, 857, 42, 0);

-- PrinterTemplates (3) — actual template text loaded from
-- DataCreationService.GetDefaultTicketPrintTemplate() etc.
INSERT INTO PrinterTemplates (Id, Name, Template, MergeLines) VALUES
  (1, 'Ticket Template',           '[LOADED FROM DataCreationService.GetDefaultTicketPrintTemplate]',           0),
  (2, 'Kitchen Order Template',    '[LOADED FROM DataCreationService.GetDefaultKitchenPrintTemplate]',          1),
  (3, 'Customer Receipt Template', '[LOADED FROM DataCreationService.GetDefaultCustomerReceiptTemplate]',       0);

-- PrintJobs (2)
INSERT INTO PrintJobs (Id, Name, WhatToPrint, UseForPaidTickets, ExcludeTax) VALUES
  (1, 'Print Bill',                     0, 0, 0),
  (2, 'Print Orders to Kitchen Printer',0, 0, 0);

-- PrinterMaps (2)
INSERT INTO PrinterMaps (Id, PrintJobId, MenuItemGroupCode, MenuItemId, PrinterId, PrinterTemplateId) VALUES
  (1, 1, NULL, 0, 1, 1),
  (2, 2, NULL, 0, 2, 2);

-- Terminal (1)
INSERT INTO Terminals (Id, Name, IsDefault, AutoLogout, ReportPrinterId, TransactionPrinterId)
VALUES (1, 'Server', 1, 0, 1, 1);

-- AccountScreens + AccountScreenValues
INSERT INTO AccountScreens (Id, Name, Filter, DisplayAsTree, SortOrder, AutomationCommandMapData)
VALUES (1, 'General', 0, 0, 10, NULL);
INSERT INTO AccountScreenValues (Id, AccountScreenId, AccountTypeId, AccountTypeName, DisplayDetails, HideZeroBalanceAccounts, SortOrder) VALUES
  (1, 1, 1, 'Sales Accounts',      1, 0, 10),
  (2, 1, 2, 'Receivable Accounts', 1, 0, 20),
  (3, 1, 4, 'Discount Accounts',   1, 0, 30),
  (4, 1, 3, 'Payment Accounts',    1, 0, 40);

-- EntityTypes (2: Customers + Tables)
INSERT INTO EntityTypes
  (Id, Name, SortOrder, EntityName, AccountTypeId, WarehouseTypeId,
   AccountNameTemplate, PrimaryFieldName, PrimaryFieldFormat, DisplayFormat, AccountBalanceDisplayFormat)
VALUES
  (1, 'Customers', 10, 'Customer', 5, 0, '[Name]-[Phone]', 'Name', NULL, NULL, NULL),
  (2, 'Tables',    20, 'Table',    0, 0, NULL,             'Name', NULL, NULL, NULL);
INSERT INTO EntityCustomFields (Id, Name, FieldType, EditingFormat, ValueSource, Hidden, EntityType_Id)
VALUES (1, 'Phone', 0, '(###) ### ####', NULL, 0, 1);

-- AccountTransactionDocumentTypes (2)
INSERT INTO AccountTransactionDocumentTypes
  (Id, Name, ButtonHeader, ButtonColor, MasterAccountTypeId, DefaultAmount,
   DescriptionTemplate, ExchangeTemplate, BatchCreateDocuments, Filter, SortOrder, PrinterTemplateId)
VALUES
  (1, 'Customer Cash',       'Cash',       'Gainsboro', 5, '[Balance]',
     'Cash Payment',        NULL, 0, 0, 10, 3),
  (2, 'Customer Credit Card','Credit Card','Gainsboro', 5, '[Balance]',
     'Credit Card Payment', NULL, 0, 0, 20, 3);

-- M:N join for ATD ↔ ATT (Customer Cash → ATT 6 ; Customer Credit Card → ATT 7)
INSERT INTO AccountTransactionDocumentTypeAccountTransactionTypes
  (AccountTransactionDocumentType_Id, AccountTransactionType_Id) VALUES (1, 6);
INSERT INTO AccountTransactionDocumentTypeAccountTransactionTypes
  (AccountTransactionDocumentType_Id, AccountTransactionType_Id) VALUES (2, 7);

-- =====================================================================
-- END OF SCHEMA — 96 tables, 1 version-tracking table, 60+ indexes.
-- All seed data above is the minimum required for the web clone to
-- behave identically to a freshly-installed SambaPOS V3.
-- =====================================================================

-- =====================================================================
-- APPENDIX A — MERMAID ER DIAGRAM (high-level; full diagram is large)
-- =====================================================================
--
-- ```mermaid
-- erDiagram
--   Users                       ||--o{ UserRoles                       : "UserRole_Id"
--   UserRoles                   ||--o{ Permissions                      : "UserRoleId"
--   UserRoles                   ||--o{ Departments                      : "DepartmentId"
--   Terminals                   ||--o{ Terminal-maps (no FK after v8)   : ""
--   Departments                 }o--|| TicketTypes                      : "TicketTypeId"
--   Departments                 }o--|| Warehouses                       : "WarehouseId"
--   Departments                 }o--|| ScreenMenus                      : "ScreenMenuId"
--   TicketTypes                 ||--o{ EntityTypeAssignments            : "TicketTypeId"
--   TicketTypes                 ||--o{ MenuAssignments                  : "TicketTypeId"
--   TicketTypes                 }o--|| Numerators                       : "TicketNumerator_Id"
--   TicketTypes                 }o--|| Numerators                       : "OrderNumerator_Id"
--   TicketTypes                 }o--|| AccountTransactionTypes          : "SaleTransactionType_Id"
--   TicketTypes                 }o--|| ScreenMenus                      : "ScreenMenuId"
--   Tickets                     ||--o{ Orders                           : "TicketId"
--   Tickets                     ||--o{ Payments                         : "TicketId"
--   Tickets                     ||--o{ ChangePayments                   : "TicketId"
--   Tickets                     ||--o{ Calculations                     : "TicketId"
--   Tickets                     ||--o{ PaidItems                        : "TicketId"
--   Tickets                     ||--o{ TicketEntities                   : "Ticket_Id"
--   Tickets                     }o--|| AccountTransactionDocuments      : "TransactionDocument_Id"
--   Tickets                     }o--|| TicketTypes                      : "TicketTypeId"
--   Tickets                     }o--|| Departments                      : "DepartmentId"
--   Orders                      }o--|| ProductTimerValues               : "ProductTimerValueId"
--   Calculations                }o--|| CalculationTypes                 : "CalculationTypeId"
--   CalculationTypes            }o--|| AccountTransactionTypes          : "AccountTransactionType_Id"
--   CalculationSelectors        ||--o{ CalculationSelectorMaps          : "CalculationSelectorId"
--   CalculationSelectors        }o--o{ CalculationTypes                 : "M:N"
--   PaymentTypes                ||--o{ PaymentTypeMaps                  : "PaymentTypeId"
--   PaymentTypes                }o--|| AccountTransactionTypes          : "AccountTransactionType_Id"
--   PaymentTypes                }o--|| Accounts                         : "Account_Id"
--   ChangePaymentTypes          ||--o{ ChangePaymentTypeMaps            : "ChangePaymentTypeId"
--   ChangePaymentTypes          }o--|| AccountTransactionTypes          : "AccountTransactionType_Id"
--   ChangePaymentTypes          }o--|| Accounts                         : "Account_Id"
--   MenuItems                   ||--o{ MenuItemPortions                 : "MenuItemId"
--   MenuItemPortions            ||--o{ MenuItemPrices                   : "MenuItemPortionId"
--   MenuItemPortions            ||--o{ Recipes                          : "Portion_Id"
--   ScreenMenus                 ||--o{ ScreenMenuCategories             : "ScreenMenuId"
--   ScreenMenuCategories        ||--o{ ScreenMenuItems                  : "ScreenMenuCategoryId"
--   OrderTagGroups              ||--o{ OrderTags                        : "OrderTagGroupId"
--   OrderTagGroups              ||--o{ OrderTagMaps                     : "OrderTagGroupId"
--   TicketTagGroups             ||--o{ TicketTags                       : "TicketTagGroupId"
--   TicketTagGroups             ||--o{ TicketTagMaps                    : "TicketTagGroupId"
--   TaxTemplates                ||--o{ TaxTemplateMaps                  : "TaxTemplateId"
--   TaxTemplates                }o--|| AccountTransactionTypes          : "AccountTransactionType_Id"
--   ProductTimers               ||--o{ ProductTimerMaps                 : "ProductTimerId"
--   PrintJobs                   ||--o{ PrinterMaps                      : "PrintJobId"
--   Printers                    ||--o{ PrinterMaps                      : "PrinterId"
--   PrinterTemplates            ||--o{ PrinterMaps                      : "PrinterTemplateId"
--   Accounts                    }o--|| AccountTypes                     : "AccountTypeId"
--   AccountScreens              ||--o{ AccountScreenValues              : "AccountScreenId"
--   AccountTransactionDocuments ||--o{ AccountTransactions              : "AccountTransactionDocumentId"
--   AccountTransactions         ||--o{ AccountTransactionValues         : "Id+DocumentId"
--   AccountTransactionDocumentTypes ||--o{ AccountTransactionDocumentTypeMaps : "DocumentTypeId"
--   AccountTransactionDocumentTypes ||--o{ AccountTransactionDocumentAccountMaps : "DocumentTypeId"
--   AccountTransactionDocumentTypes }o--o{ AccountTransactionTypes           : "M:N TransactionTypes"
--   AccountTransactionDocumentTypes }o--|| PrinterTemplates                  : "PrinterTemplateId"
--   Entities                    }o--|| EntityTypes                      : "EntityTypeId"
--   EntityTypes                 ||--o{ EntityCustomFields               : "EntityType_Id"
--   EntityScreens               ||--o{ EntityScreenItems                : "EntityScreenId"
--   EntityScreens               ||--o{ EntityScreenMaps                 : "EntityScreenId"
--   EntityScreens               ||--o{ Widgets                          : "EntityScreenId"
--   EntityStateValues           }o--|| Entities                         : "EntityId"
--   EntityScreenItems           }o--|| Entities                         : "EntityId"
--   AppRules                    ||--o{ ActionContainers                 : "AppRuleId"
--   AppActions                  ||--o{ ActionContainers                 : "AppActionId"
--   AppRules                    ||--o{ AppRuleMaps                      : "AppRuleId"
--   AutomationCommands          ||--o{ AutomationCommandMaps            : "AutomationCommandId"
--   WarehouseTypes              ||--o{ Warehouses                       : "WarehouseTypeId"
--   Recipes                     ||--o{ RecipeItems                      : "RecipeId"
--   RecipeItems                 }o--|| InventoryItems                   : "InventoryItem_Id"
--   InventoryTransactionsDocuments ||--o{ InventoryTransactions          : "DocumentId"
--   InventoryTransactions       }o--|| InventoryItems                   : "InventoryItem_Id"
--   InventoryTransactionDocumentTypes }o--|| AccountTransactionTypes     : "AccountTransactionType_Id"
--   InventoryTransactionDocumentTypes }o--|| InventoryTransactionTypes   : "InventoryTransactionType_Id"
--   PeriodicConsumptions        ||--o{ WarehouseConsumptions            : "PeriodicConsumptionId"
--   WarehouseConsumptions       ||--o{ PeriodicConsumptionItems         : "PeriodicConsumptionId+WarehouseConsumptionId"
--   WarehouseConsumptions       ||--o{ CostItems                        : "PeriodicConsumptionId+WarehouseConsumptionId"
--   PeriodicConsumptions        }o--|| WorkPeriods                      : "WorkPeriodId"
--   TaskTypes                   ||--o{ Tasks                            : "TaskTypeId"
--   TaskTypes                   ||--o{ TaskCustomFields                 : "TaskTypeId"
--   Tasks                       ||--o{ TaskTokens                       : "TaskId"
-- ```
--
-- =====================================================================
-- END OF FILE
-- =====================================================================
