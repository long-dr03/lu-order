"""Turns the raw workbook blocks into orders the system can hold.
Usage: python3 -I normalize.py work_dir  -> work_dir/orders.json (+ a printed review table)"""
import sys, json, re, os, datetime, hashlib

work = sys.argv[1]
raw = json.load(open(os.path.join(work, 'raw.json')))
ORDER = ['XS', 'S', 'M', 'L', 'XL', 'Free size']
PREFIX = {'GLAMDOLL': 'GLAM', 'MAEL': 'MAEL', 'JUBIN': 'JUBI', 'SISSY': 'SISS', 'BEL': 'BEL'}
# Blocks the sheet leaves unnamed or names only by colour; named here from the product picture.
NAMES = {
    ('GLAMDOLL', 39): 'Đầm ren bí 6 tầng đợt 1', ('GLAMDOLL', 46): 'Đầm ren bí 6 tầng đợt 2',
    ('GLAMDOLL', 141): 'Set áo + chân váy · ÁO', ('GLAMDOLL', 149): 'Set áo + chân váy · CHÂN VÁY',
    ('SISSY', 3): 'Set corset hoa nhí · ÁO', ('SISSY', 8): 'Set corset hoa nhí · QUẦN',
    ('SISSY', 13): 'Set trễ vai hoa · ÁO', ('SISSY', 19): 'Set trễ vai hoa · QUẦN',
    ('MAEL', 50): 'Đầm Tiffany bèo tầng HỒNG', ('MAEL', 56): 'Đầm Tiffany bèo tầng NUDE',
    ('MAEL', 62): 'Áo cúp kim sa HỒNG', ('MAEL', 68): 'Áo cúp kim sa ĐEN',
    ('MAEL', 74): 'Set áo váy · Áo ĐEN', ('MAEL', 89): 'Set áo váy · Áo ĐỎ', ('MAEL', 95): 'Set áo váy · Áo TRẮNG', ('MAEL', 101): 'Set áo váy · Váy ĐEN',
    ('MAEL', 113): 'Đầm dạ hội lụa xếp ly HỒNG', ('MAEL', 119): 'Đầm dạ hội lụa xếp ly NUDE',
    ('MAEL', 127): 'Áo choàng voan bồng HỒNG', ('MAEL', 136): 'Áo choàng voan bồng TRẮNG',
    ('MAEL', 157): 'Đầm Zorya lưới xòe ĐEN', ('MAEL', 163): 'Đầm ren Kim Anna ĐỎ',
    ('MAEL', 169): 'Đầm Margot tay bồng NÂU', ('MAEL', 175): 'Đầm Margot tay bồng TRẮNG', ('MAEL', 181): 'Đầm Margot tay bồng ĐỎ',
    ('MAEL', 214): 'Áo lông vũ Iwona TRẮNG', ('MAEL', 219): 'Đầm ren đuôi cá Jullyx TRẮNG', ('MAEL', 226): 'Đầm ren đuôi cá Jullyx ĐEN',
    ('MAEL', 232): 'Áo corset lông vũ TRẮNG', ('MAEL', 238): 'Áo corset lông vũ ĐEN', ('MAEL', 244): 'Đầm Jessica đính hoa NUDE',
    ('MAEL', 280): 'Đầm Natasha bèo tầng TRẮNG', ('MAEL', 286): 'Đầm Natasha bèo tầng NÂU',
}
COLORS = [('TRẮNG', r'TRẮNG|TRĂNG'), ('ĐEN', r'ĐEN'), ('HỒNG', r'HỒNG'), ('ĐỎ', r'ĐỎ'), ('NUDE', r'NUDE'), ('NÂU', r'NÂU'), ('VÀNG', r'VÀNG'), ('XANH', r'XANH')]

def day(s, delta=0):
    return (datetime.date.fromisoformat(s) + datetime.timedelta(days=delta)).isoformat()

def ship_date(text, fallback):
    if text and re.fullmatch(r'\d{4}-\d{2}-\d{2}', text):
        return text
    m = re.search(r'(\d{1,2})/(\d{1,2})/(\d{4})', text or '')
    return f'{m[3]}-{int(m[2]):02d}-{int(m[1]):02d}' if m else fallback

orders, counters, review = [], {}, []
image_of, prev_image, prev_date = {}, {}, {}
# A picture anchored on a block's last row belongs to the next block; a block without one shares the previous picture.
for i, b in enumerate(raw):
    imgs = list(b['images'])
    if len(imgs) > 1:
        nxt = raw[i + 1] if i + 1 < len(raw) and raw[i + 1]['sheet'] == b['sheet'] else None
        if nxt and not nxt['images']:
            nxt['images'] = [imgs.pop()]
    b['images'] = imgs
k_open = 0
for b in raw:
    sheet = b['sheet']
    notes = [n.replace('\n', ' — ') for n in b['notes']]
    no_size = any(s['size'] == 'NO SIZE' for s in b['sizes']) or any(n.strip().upper() == 'NO SIZE' for n in notes)
    notes = [n for n in notes if n.strip().upper() != 'NO SIZE']
    ordered, cut = {}, {}
    for s in b['sizes']:
        size = 'Free size' if no_size else s['size']
        if isinstance(s['ordered'], (int, float)):
            ordered[size] = ordered.get(size, 0) + int(s['ordered'])
        if isinstance(s['cut'], (int, float)):
            cut[size] = cut.get(size, 0) + int(s['cut'])
    ships, last = [], None
    for s in b['ships']:
        d = ship_date(s['date'], last)
        if not d:
            continue
        last = d
        qty = {}
        for size, q in s['qty'].items():
            size = 'Free size' if no_size else size
            qty[size] = qty.get(size, 0) + q
        ships.append({'date': d, 'items': qty})
    ships.sort(key=lambda s: s['date'])
    delivered = {}
    for s in ships:
        for size, q in s['items'].items():
            delivered[size] = delivered.get(size, 0) + q
    if not sum(ordered.values()) and not delivered:
        continue
    adjustments = []
    raw_ordered = dict(ordered)
    done_note = any('HOÀN THÀNH' in n.upper() for n in notes)
    sizes = [z for z in ORDER if ordered.get(z) or delivered.get(z)]
    for z in sizes:
        o, d = ordered.get(z, 0), delivered.get(z, 0)
        if d > o:
            adjustments.append(f'{z}: đặt {o} → {d} (đã giao {d})')
            ordered[z] = d
    if done_note:
        for z in sizes:
            o, d = ordered.get(z, 0), delivered.get(z, 0)
            if o > d:
                adjustments.append(f'{z}: đặt {o} → {d} (đóng đơn khi giao {d})')
                ordered[z] = d
        sizes = [z for z in sizes if ordered.get(z)]
    completed = all(delivered.get(z, 0) >= ordered[z] for z in sizes) and bool(delivered)
    # Dates: the sheet often has no received date, or one later than the first delivery.
    first = ships[0]['date'] if ships else None
    date = b['date'] if b['date'] and re.fullmatch(r'\d{4}-\d{2}-\d{2}', b['date']) else None
    if first and (not date or date > first):
        if date:
            adjustments.append(f'ngày nhận {date} sau lần giao đầu {first} → lùi 14 ngày trước lần giao đầu')
        date = day(first, -14)
    if not date:
        date = prev_date.get(sheet, '2026-05-01')
    prev_date[sheet] = date
    variants = []
    started = bool(delivered) or bool(cut)
    for z in sizes:
        o, d = ordered[z], delivered.get(z, 0)
        if completed:
            c = o
        elif started:
            c = min(max(cut.get(z, o), d), o * 110 // 100)
        else:
            c = 0
        variants.append({'size': z, 'ordered': o, 'cut': c, 'sewn': d, 'qc': d, 'packed': d, 'delivered': d})
    if completed:
        stage, deadline = 'hoan_thanh', ships[-1]['date']
    else:
        stage = 'may' if started else 'nhan_don'
        deadline = day('2026-10-26', 7 * (k_open % 6))
        k_open += 1
    name = NAMES.get((sheet, b['row'])) or re.sub(r'\s+', ' ', b['name'].replace('\n', ' ')).strip()
    name = name.replace('TRĂNG', 'TRẮNG')
    code = re.search(r'\b([A-Z]?\d{4}[A-Z]\d{2}[A-Z]{2})\b', name)
    base = re.sub(r'\s*(ĐỢT|đợt)\s*\d+', '', name)
    product_code = code[1] if code else 'SP-' + hashlib.sha1(f'{sheet}|{base}'.encode()).hexdigest()[:8].upper()
    # The colour is the last colour word in the name: "... TRẮNG PHỐI LƯỚI HOA XANH" is the XANH one.
    found = [(m.start(), c) for c, pattern in COLORS for m in re.finditer(rf'(?<![\w])(?:{pattern})(?![\w])', name.upper())]
    color = max(found)[1] if found else 'Theo mẫu'
    key = (PREFIX[sheet], date[2:4] + date[5:7])
    counters[key] = counters.get(key, 0) + 1
    oid = f'{key[0]}{key[1]}{counters[key]:02d}'
    if b['images']:
        prev_image[sheet] = b['images'][0]
    note = '; '.join(notes)
    if adjustments:
        note = (note + ' · ' if note else '') + 'Chuẩn hóa từ file theo dõi: ' + ', '.join(adjustments)
    orders.append({'id': oid, 'customer': sheet, 'product_name': name, 'product_code': product_code, 'color': color,
                   'order_date': date, 'deadline': max(deadline, date), 'stage': stage, 'completed': completed, 'notes': note,
                   'variants': variants, 'shipments': ships, 'image': b['images'][0] if b['images'] else prev_image.get(sheet),
                   'source': {'sheet': sheet, 'row': b['row'], 'ordered': raw_ordered, 'date': b['date']}})
    o = orders[-1]
    review.append(f"{oid:11} {name[:40]:40} {color:8} {date} →{o['deadline']} {stage:10} đặt {sum(raw_ordered.values()):>3}→{sum(v['ordered'] for v in variants):>3} cắt {sum(v['cut'] for v in variants):>3} giao {sum(delivered.values()):>3} đợt {len(ships):>2} ảnh {o['image'] or '-'}")
json.dump(orders, open(os.path.join(work, 'orders.json'), 'w'), ensure_ascii=False, indent=1)
print('\n'.join(review))
print(len(orders), 'orders;', sum(o['completed'] for o in orders), 'completed;', sum(len(o['shipments']) for o in orders), 'shipments;', len({o['image'] for o in orders if o['image']}), 'images; ids unique:', len({o['id'] for o in orders}) == len(orders))
