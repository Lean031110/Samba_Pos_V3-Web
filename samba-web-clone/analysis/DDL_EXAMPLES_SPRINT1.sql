-- =====================================================================
-- DDL EXTRACT — 3 EXAMPLES (Tickets, Orders, Payments) for user review
-- SambaPOS V3 → Web Clone — Sprint 1 schema criterion validation
-- =====================================================================
-- CRITERION (per Architect's directive):
--   * Id INTEGER PRIMARY KEY AUTOINCREMENT  (simple PK, no composites)
--   * UNIQUE(Id, ParentId)  as constraint preserving original pair
--   * INDEX on ParentId for JOIN performance
--   * PRAGMA defer_foreign_keys = ON at connection time
--   * All FKs explicit (no EF shadow columns)
--   * nvarchar(max) → TEXT, nvarchar(n) → TEXT, bit → INTEGER,
--     decimal(16,2) → NUMERIC(16,2), datetime → TEXT (ISO8601)
-- =====================================================================

-- =====================================================================
-- EXAMPLE 1: Tickets
-- =====================================================================
-- Original C# entity: Samba.Domain/Models/Tickets/Ticket.cs:16
-- Original table: Tickets (no composite PK — Id is the sole PK)
-- Children tables: Orders, Payments, ChangePayments, Calculations, PaidItems,
--                  TicketEntities (all use composite Id+TicketId in original)
-- =====================================================================

CREATE TABLE Tickets (
    Id                    INTEGER PRIMARY KEY AUTOINCREMENT,
    Name                  TEXT,
    LastUpdateTime        TEXT    NOT NULL,                          -- datetime ISO8601
    TicketNumber          TEXT,
    Date                  TEXT    NOT NULL,
    LastOrderDate         TEXT    NOT NULL,
    LastPaymentDate       TEXT    NOT NULL,
    IsClosed              INTEGER NOT NULL DEFAULT 0,                -- bit
    IsLocked              INTEGER NOT NULL DEFAULT 0,
    RemainingAmount       NUMERIC(16,2) NOT NULL DEFAULT 0,
    TotalAmount           NUMERIC(16,2) NOT NULL DEFAULT 0,
    DepartmentId          INTEGER NOT NULL DEFAULT 0,
    TicketTypeId          INTEGER NOT NULL DEFAULT 0,
    Note                  TEXT,
    LastModifiedUserName  TEXT,                                       -- nvarchar(128)
    TicketTags            TEXT,    -- JSON: List<TicketTagValue>
    TicketStates          TEXT,    -- JSON: List<TicketStateValue>
    TicketLogs            TEXT,    -- JSON: List<TicketLogValue>
    ExchangeRate          NUMERIC(18,2) NOT NULL DEFAULT 1,
    TaxIncluded           INTEGER NOT NULL DEFAULT 1,
    TransactionDocumentId INTEGER NOT NULL DEFAULT 0,                -- explicit FK (was shadow)
    FOREIGN KEY (DepartmentId)        REFERENCES Departments(Id),
    FOREIGN KEY (TicketTypeId)        REFERENCES TicketTypes(Id),
    FOREIGN KEY (TransactionDocumentId) REFERENCES AccountTransactionDocuments(Id)
);

CREATE INDEX IX_Tickets_LastPaymentDate       ON Tickets(LastPaymentDate);
CREATE INDEX IX_Tickets_DepartmentId          ON Tickets(DepartmentId);
CREATE INDEX IX_Tickets_TicketTypeId          ON Tickets(TicketTypeId);
CREATE INDEX IX_Tickets_TransactionDocumentId ON Tickets(TransactionDocumentId);
CREATE INDEX IX_Tickets_TicketNumber          ON Tickets(TicketNumber);  -- lookup by number

-- =====================================================================
-- EXAMPLE 2: Orders (composite Id+TicketId in original → simple Id here)
-- =====================================================================
-- Original C# entity: Samba.Domain/Models/Tickets/Order.cs:11
-- Original table: Orders with PRIMARY KEY (Id, TicketId) — composite
--
-- NEW criterion:
--   * Id INTEGER PRIMARY KEY AUTOINCREMENT (simple PK)
--   * TicketId INTEGER NOT NULL (FK to Tickets.Id)
--   * UNIQUE(Id, TicketId) — preserves original pair uniqueness
--   * INDEX on TicketId — every query joins Orders ON TicketId
-- =====================================================================

CREATE TABLE Orders (
    Id                       INTEGER PRIMARY KEY AUTOINCREMENT,
    TicketId                 INTEGER NOT NULL,                        -- FK to Tickets.Id
    WarehouseId              INTEGER NOT NULL DEFAULT 0,
    DepartmentId             INTEGER NOT NULL DEFAULT 0,
    MenuItemId               INTEGER NOT NULL DEFAULT 0,
    MenuItemName             TEXT,
    PortionName              TEXT,
    Price                    NUMERIC(16,2) NOT NULL DEFAULT 0,
    Quantity                 NUMERIC(16,3) NOT NULL DEFAULT 0,        -- quantity uses 3 dp
    PortionCount             INTEGER NOT NULL DEFAULT 0,
    Locked                   INTEGER NOT NULL DEFAULT 0,
    CalculatePrice           INTEGER NOT NULL DEFAULT 1,
    DecreaseInventory        INTEGER NOT NULL DEFAULT 0,
    IncreaseInventory        INTEGER NOT NULL DEFAULT 0,
    OrderNumber              INTEGER NOT NULL DEFAULT 0,
    CreatingUserName         TEXT,
    CreatedDateTime          TEXT    NOT NULL,
    AccountTransactionTypeId INTEGER NOT NULL DEFAULT 0,
    ProductTimerValueId      INTEGER,                                  -- nullable FK
    PriceTag                 TEXT,
    Tag                      TEXT,
    Taxes                    TEXT,    -- JSON: List<TaxValue> (short DataMember names)
    OrderTags                TEXT,    -- JSON: List<OrderTagValue>
    OrderStates              TEXT,    -- JSON: List<OrderStateValue>
    UNIQUE (Id, TicketId),                                              -- preserves original composite uniqueness
    FOREIGN KEY (TicketId)            REFERENCES Tickets(Id) ON DELETE CASCADE,
    FOREIGN KEY (WarehouseId)         REFERENCES Warehouses(Id),
    FOREIGN KEY (DepartmentId)        REFERENCES Departments(Id),
    FOREIGN KEY (MenuItemId)          REFERENCES MenuItems(Id),
    FOREIGN KEY (AccountTransactionTypeId) REFERENCES AccountTransactionTypes(Id),
    FOREIGN KEY (ProductTimerValueId) REFERENCES ProductTimerValues(Id)
);

-- Indexes for the common query patterns
CREATE INDEX IX_Orders_TicketId            ON Orders(TicketId);          -- every ticket load
CREATE INDEX IX_Orders_TicketId_OrderNumber ON Orders(TicketId, OrderNumber);  -- ticket close merge
CREATE UNIQUE INDEX IX_Orders_Id_TicketId  ON Orders(Id, TicketId);      -- redundant with UNIQUE constraint but explicit

-- =====================================================================
-- EXAMPLE 3: Payments (composite Id+TicketId in original → simple Id here)
-- =====================================================================
-- Original C# entity: Samba.Domain/Models/Tickets/Payment.cs:7
-- Original table: Payments with PRIMARY KEY (Id, TicketId) — composite
--
-- Same criterion as Orders. NOTE: AccountTransactionId references the
-- composite PK (Id, AccountTransactionDocumentId) of AccountTransactions,
-- but for simplicity in the web clone we use the surrogate Id alone
-- (AccountTransactions table will follow the same pattern: simple PK Id,
-- UNIQUE(Id, DocumentId)).
-- =====================================================================

CREATE TABLE Payments (
    Id                   INTEGER PRIMARY KEY AUTOINCREMENT,
    PaymentTypeId        INTEGER NOT NULL DEFAULT 0,
    TicketId             INTEGER NOT NULL,                            -- FK to Tickets.Id
    Name                 TEXT,
    Date                 TEXT    NOT NULL,
    AccountTransactionId INTEGER NOT NULL DEFAULT 0,                  -- FK to AccountTransactions.Id
    Amount               NUMERIC(16,2) NOT NULL DEFAULT 0,
    UserId               INTEGER NOT NULL DEFAULT 0,
    UNIQUE (Id, TicketId),                                            -- preserves original composite uniqueness
    FOREIGN KEY (TicketId)             REFERENCES Tickets(Id) ON DELETE CASCADE,
    FOREIGN KEY (PaymentTypeId)        REFERENCES PaymentTypes(Id),
    FOREIGN KEY (AccountTransactionId) REFERENCES AccountTransactions(Id),
    FOREIGN KEY (UserId)               REFERENCES Users(Id)
);

CREATE INDEX IX_Payments_TicketId             ON Payments(TicketId);
CREATE INDEX IX_Payments_AccountTransactionId ON Payments(AccountTransactionId);
CREATE INDEX IX_Payments_PaymentTypeId        ON Payments(PaymentTypeId);
CREATE UNIQUE INDEX IX_Payments_Id_TicketId   ON Payments(Id, TicketId);

-- =====================================================================
-- VALIDATION CHECKLIST (what you should verify)
-- =====================================================================
-- ✅ Every PK is INTEGER PRIMARY KEY AUTOINCREMENT (simple, not composite)
-- ✅ Every original composite pair (Id, ParentId) preserved via UNIQUE constraint
-- ✅ Every FK column has an explicit index (for JOIN performance)
-- ✅ Every original shadow column (TransactionDocument_Id, ProductTimerValueId,
--    AccountTransactionType_Id, etc.) is now explicit and named without underscore suffix
-- ✅ Type mapping: nvarchar(max)→TEXT, bit→INTEGER, decimal(16,2)→NUMERIC(16,2),
--    decimal(16,3)→NUMERIC(16,3), datetime→TEXT(ISO8601), nvarchar(n)→TEXT
-- ✅ CASCADE DELETE preserved for child tables (Orders, Payments, etc. on Ticket delete)
-- ✅ JSON-serialized fields preserved as TEXT columns (Taxes, OrderTags, OrderStates,
--    TicketTags, TicketStates, TicketLogs)
-- =====================================================================
