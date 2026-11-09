-- Removes only the commerce tables added for the native portal.
-- Keeps LoginThrottle, SiteSetting, and any calu_* tables.
-- Disabling RLS on LoginThrottle restores the previous unprotected state
-- of that table. It does not recreate grants that were not recorded.

DROP TABLE IF EXISTS "TicketMessage";
DROP TABLE IF EXISTS "SupportTicket";
DROP TABLE IF EXISTS "CommerceEvent";
DROP TABLE IF EXISTS "CustomerService";
DROP TABLE IF EXISTS "ManualPayment";
DROP TABLE IF EXISTS "InvoiceLine";
DROP TABLE IF EXISTS "CustomerInvoice";
DROP TABLE IF EXISTS "OrderLine";
DROP TABLE IF EXISTS "CustomerOrder";
DROP TABLE IF EXISTS "verification";
DROP TABLE IF EXISTS "account";
DROP TABLE IF EXISTS "session";
DROP TABLE IF EXISTS "user";

DO $$
BEGIN
  IF EXISTS (
    SELECT 1 FROM information_schema.tables
    WHERE table_schema = 'public' AND table_name = 'LoginThrottle'
  ) THEN
    EXECUTE 'ALTER TABLE "LoginThrottle" DISABLE ROW LEVEL SECURITY';
  END IF;
END $$;
