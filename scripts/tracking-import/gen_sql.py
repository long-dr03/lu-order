"""Builds the SQL that loads the normalized orders (with pictures and deliveries) into a LUUTA database.
Usage: python3 gen_sql.py work_dir out.sql"""
import sys, json, os, io, base64, uuid, datetime
from PIL import Image

work, out = sys.argv[1], sys.argv[2]
orders = json.load(open(os.path.join(work, 'orders.json')))
STAGES = [('nhan_don', 'Nhận đơn'), ('kiem_npl', 'Kiểm NPL/Vải'), ('kiem_rap', 'Kiểm rập'), ('cat', 'Cắt'), ('may', 'May'), ('qc', 'QC'), ('sua_hang', 'Sửa hàng'), ('qc_lai', 'QC lại'), ('dong_goi', 'Đóng gói'), ('giao_hang', 'Giao hàng'), ('hoan_thanh', 'Hoàn thành')]
NS = uuid.UUID('6f1f6c1e-6f0a-4c62-9d5b-2f0f6a5d2610')
def q(v):
    return 'NULL' if v is None else "'" + str(v).replace("'", "''") + "'"
def uid(*parts):
    return str(uuid.uuid5(NS, '|'.join(map(str, parts))))
ADMIN = "(SELECT admin FROM _import_ctx)"
COURIER = "(SELECT courier FROM _import_ctx)"
sql = ['BEGIN;', 'SET LOCAL statement_timeout = 0;',
       "CREATE TEMP TABLE _import_ctx ON COMMIT DROP AS SELECT (SELECT id FROM accounts WHERE username='admin') admin, (SELECT d.employee_id FROM employee_departments d JOIN employees e ON e.id=d.employee_id WHERE d.department_id='delivery' AND e.active=1 ORDER BY (e.name='THY') DESC, d.employee_id LIMIT 1) courier;",
       "DO $$ BEGIN IF (SELECT admin IS NULL OR courier IS NULL FROM _import_ctx) THEN RAISE EXCEPTION 'need an admin account and an active delivery worker'; END IF; IF EXISTS (SELECT 1 FROM orders WHERE id = ANY(ARRAY[" + ','.join(q(o['id']) for o in orders) + "])) THEN RAISE EXCEPTION 'these orders are already imported'; END IF; END $$;"]
images, total = {}, 0
for name in sorted({o['image'] for o in orders if o['image']}):
    im = Image.open(os.path.join(work, 'img', name)).convert('RGB')
    im.thumbnail((1100, 1100))
    buf = io.BytesIO()
    im.save(buf, 'JPEG', quality=82, optimize=True)
    images[name] = uid('image', name)
    total += buf.tell()
    sql.append(f"INSERT INTO product_images(id,owner_id,data,created_at) VALUES ({q(images[name])},{ADMIN},decode('{base64.b64encode(buf.getvalue()).decode()}','base64'),{int(datetime.datetime(2026,10,12,17,0).timestamp()*1000)});")
for n, o in enumerate(orders):
    idx = [k for k, _ in STAGES].index(o['stage'])
    url = f"/api/product-images/{images[o['image']]}" if o['image'] else None
    total_qty = sum(v['ordered'] for v in o['variants'])
    created = f"{o['order_date']} 08:{n // 60:02d}:{n % 60:02d}"
    last = o['shipments'][-1]['date'] if o['shipments'] else o['order_date']
    sql.append(f"INSERT INTO orders(id,customer,product_code,product_name,image_url,total_quantity,order_date,deadline,priority,assigned_to,current_stage,progress,status,notes,created_at,version) VALUES ({q(o['id'])},{q(o['customer'])},{q(o['product_code'])},{q(o['product_name'])},{q(url)},{total_qty},{q(o['order_date'])},{q(o['deadline'])},'normal','Bộ phận Quản lý',{q(o['stage'])},{round(idx / 10 * 100)},{q('completed' if o['completed'] else 'on_track')},{q(o['notes'] or None)},{q(created)},1);")
    if url:
        sql.append(f"INSERT INTO order_photos(order_id,image_url,color,position) VALUES ({q(o['id'])},{q(url)},'',0);")
    for v in o['variants']:
        sql.append(f"INSERT INTO order_variants(order_id,color,size,quantity,cut_qty,sewn_qty,qc_inspected_qty,qc_passed_qty,packed_qty,delivered_qty) VALUES ({q(o['id'])},{q(o['color'])},{q(v['size'])},{v['ordered']},{v['cut']},{v['sewn']},{v['qc']},{v['qc']},{v['packed']},{v['delivered']});")
    # Plausible milestones the sheet does not record: cutting done a few days after the order
    # (and before the first delivery), sewing handed out the same day.
    first = o['shipments'][0]['date'] if o['shipments'] else None
    cut_done = (datetime.date.fromisoformat(o['order_date']) + datetime.timedelta(days=5)).isoformat()
    if first and cut_done >= first:
        cut_done = max(o['order_date'], (datetime.date.fromisoformat(first) - datetime.timedelta(days=1)).isoformat())
    for k, (key, label) in enumerate(STAGES):
        status = 'completed' if k < idx or o['completed'] else 'in_progress' if k == idx else 'pending'
        if status == 'pending':
            started = done = None
        else:
            started = f"{o['order_date']} 08:00:00" if k <= 3 else f"{cut_done} 16:00:00" if k == 4 else f"{first or cut_done} 08:00:00" if k < 10 else f"{last} 17:00:00"
            done = None if status != 'completed' else f"{o['order_date']} 08:00:00" if k < 3 else f"{cut_done} 16:00:00" if k == 3 else f"{last} 17:00:00"
        sql.append(f"INSERT INTO order_stages(order_id,stage_key,stage_name,status,assignee,received_qty,completed_qty,remaining_qty,started_at,completed_at) VALUES ({q(o['id'])},{q(key)},{q(label)},{q(status)},'Bộ phận Quản lý',{total_qty},0,{total_qty},{q(started)},{q(done)});")
    for s in o['shipments']:
        sid = uid('shipment', o['id'], s['date'], json.dumps(s['items'], sort_keys=True))
        code = f"GH-{s['date'].replace('-', '')}-{sid[:8].upper()}"
        at = f"{s['date']}T17:00:00+07:00"
        sql.append(f"INSERT INTO shipments(id,code,order_id,worker_id,delivered_at,packages,notes,actor_id,created_at) VALUES ({q(sid)},{q(code)},{q(o['id'])},{COURIER},{q(at)},0,'Nhập từ file theo dõi đơn hàng',{ADMIN},{q(at)});")
        for size, qty in s['items'].items():
            sql.append(f"INSERT INTO shipment_items(id,shipment_id,color,size,quantity) VALUES ({q(uid('item', sid, size))},{q(sid)},{q(o['color'])},{q(size)},{qty});")
            sql.append(f"INSERT INTO operation_records(order_id,action,color,size,quantity,packages,operation_date,operation_time,worker_id,notes,actor_id,department_id,shipment_id,created_at) VALUES ({q(o['id'])},'deliver',{q(o['color'])},{q(size)},{qty},0,{q(s['date'])},'17:00',{COURIER},'Nhập từ file theo dõi đơn hàng',{ADMIN},'delivery',{q(sid)},{q(s['date'] + ' 17:00:00')});")
sql.append(f"INSERT INTO audit_logs(user_name,action,details,actor_id) VALUES ('Quản trị viên','Nhập dữ liệu từ file theo dõi','{len(orders)} đơn, {sum(len(o['shipments']) for o in orders)} đợt giao từ file THEO DÕI VÀ KIỂM SOÁT ĐƠN HÀNG.xlsx',{ADMIN});")
# The numbers must add up before anything is kept.
sql.append("DO $$ BEGIN IF EXISTS (SELECT 1 FROM order_variants v WHERE v.delivered_qty <> COALESCE((SELECT SUM(i.quantity) FROM shipment_items i JOIN shipments s ON s.id=i.shipment_id WHERE s.order_id=v.order_id AND i.color=v.color AND i.size=v.size),0) AND v.order_id = ANY(ARRAY[" + ','.join(q(o['id']) for o in orders) + "])) THEN RAISE EXCEPTION 'delivered quantities do not match the shipments'; END IF; IF EXISTS (SELECT 1 FROM order_variants WHERE delivered_qty>packed_qty OR packed_qty>qc_passed_qty OR qc_passed_qty>sewn_qty OR sewn_qty>cut_qty OR sewn_qty>quantity OR cut_qty>quantity*110/100) THEN RAISE EXCEPTION 'stage quantities out of order'; END IF; END $$;")
sql.append('COMMIT;')
open(out, 'w').write('\n'.join(sql) + '\n')
print(len(orders), 'orders', len(images), 'images', total // 1024, 'KB of jpeg;', os.path.getsize(out) // 1024, 'KB of SQL')
