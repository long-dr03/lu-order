export const SHORTAGE_CAUSES = [
  "Lỗi vải",
  "Kỹ thuật may",
  "Cắt thiếu",
  "Hỏng khi QC / sửa hàng",
  "Khách đổi hoặc hủy",
  "Chờ xe / chờ giao",
  "Khác",
] as const;
export type ShortageCause = (typeof SHORTAGE_CAUSES)[number];

/** Where the not-yet-delivered pieces of one colour–size currently are. */
export function shortageBreakdown(v: {
  quantity: number;
  cut_qty: number;
  sewn_qty: number;
  qc_inspected_qty?: number;
  qc_passed_qty: number;
  defect_qty?: number;
  reworked_qty?: number;
  reinspected_qty?: number;
  repassed_qty?: number;
  packed_qty: number;
  delivered_qty: number;
}) {
  const cut = Math.min(v.quantity, v.cut_qty);
  const sewn = Math.min(cut, v.sewn_qty);
  const inspected = Math.min(sewn, v.qc_inspected_qty || 0);
  const repair =
    (v.defect_qty || 0) +
    (v.reinspected_qty || 0) -
    (v.repassed_qty || 0) -
    (v.reworked_qty || 0);
  const recheck = (v.reworked_qty || 0) - (v.reinspected_qty || 0);
  return [
    { label: "Chưa cắt", quantity: v.quantity - cut },
    { label: "Đã cắt, chưa may", quantity: cut - sewn },
    { label: "Đã may, chưa QC", quantity: sewn - inspected },
    { label: "QC lỗi, chờ sửa", quantity: Math.max(0, repair) },
    { label: "Đã sửa, chờ QC lại", quantity: Math.max(0, recheck) },
    {
      label: "QC đạt, chưa đóng gói",
      quantity: v.qc_passed_qty - v.packed_qty,
    },
    {
      label: "Đã đóng gói, chưa giao",
      quantity: v.packed_qty - v.delivered_qty,
    },
  ].filter((r) => r.quantity > 0);
}
