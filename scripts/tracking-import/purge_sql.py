"""SQL that removes orders (and everything recorded on them) matching a condition on orders.id.
Usage: python3 purge_sql.py "<SQL condition on o.id>" out.sql"""
import sys
cond, out = sys.argv[1], sys.argv[2]
open(out, 'w').write(f"""BEGIN;
SET CONSTRAINTS ALL DEFERRED;
CREATE TEMP TABLE _gone ON COMMIT DROP AS SELECT o.id FROM orders o WHERE {cond};
SELECT 'removing: ' || COALESCE(string_agg(id, ', ' ORDER BY id), '(none)') FROM _gone;
DELETE FROM production_adjustments WHERE log_id IN (SELECT id FROM production_logs WHERE order_id IN (SELECT id FROM _gone));
DELETE FROM shipment_items WHERE shipment_id IN (SELECT id FROM shipments WHERE order_id IN (SELECT id FROM _gone));
DO $$
DECLARE t text;
BEGIN
  FOR t IN SELECT table_name FROM information_schema.columns WHERE table_schema='public' AND column_name='order_id' AND table_name<>'orders' LOOP
    EXECUTE format('DELETE FROM %I WHERE order_id IN (SELECT id FROM _gone)', t);
  END LOOP;
END $$;
DELETE FROM orders WHERE id IN (SELECT id FROM _gone);
-- Pictures nothing points at any more (the same rule the app applies when it tidies up).
DELETE FROM product_images p WHERE NOT EXISTS (SELECT 1 FROM orders WHERE image_url='/api/product-images/' || p.id) AND NOT EXISTS (SELECT 1 FROM order_photos WHERE image_url='/api/product-images/' || p.id) AND NOT EXISTS (SELECT 1 FROM preparation_checks WHERE photos LIKE '%/api/product-images/' || p.id || '%') AND NOT EXISTS (SELECT 1 FROM operation_records WHERE image_url='/api/product-images/' || p.id);
COMMIT;
SELECT 'orders left: ' || count(*) FROM orders;
""")
