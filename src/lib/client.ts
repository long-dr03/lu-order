import type { SessionInfo } from "./permissions";
import type { Order, Line, Employee, ProductionLog } from "./types";
export interface DashboardData {
  orders: Order[];
  lines?: Line[];
  departments: { id: string; name: string }[];
  employees: Employee[];
  nextCode: string;
  stats: {
    orders: {
      totalRunning: number;
      atRisk: number;
      delayed: number;
      completed: number;
      waitingQc: number;
      waitingDelivery: number;
    };
    production: { monthlyQty: number; monthlyPay: number | null };
    employeesCount: number;
  };
}
export interface ViewLog extends Omit<
  ProductionLog,
  "unit_price" | "total_pay"
> {
  unit_price: number | null;
  total_pay: number | null;
}
export interface PayrollData {
  month: string;
  isLocked: boolean;
  lockedBy?: string;
  lockedAt?: string;
  logs: ProductionLog[];
  defects?: {
    employee_id: string;
    employee_name: string;
    stage: string;
    quantity: number;
    value: number;
    penalty: number;
  }[];
  defect_penalty_percent?: number;
  summary: {
    employee_id: string;
    employee_name: string;
    line_id: number | null;
    department_id?: string | null;
    total_qty: number;
    total_salary: number;
    total_entries: number;
  }[];
}
export type Api = <T>(
  path: string,
  input?: unknown,
  method?: string,
  key?: string,
) => Promise<T>;
export class ApiError extends Error {
  constructor(
    public status: number,
    message: string,
  ) {
    super(message);
  }
}
// Preserve a failed request key in memory so a network retry cannot duplicate a write.
const requestKeys = new Map<string, string>();
export function apiFor(
  session: SessionInfo | null,
  onUnauthorized: () => void,
): Api {
  return async <T>(
    path: string,
    input?: unknown,
    method = "POST",
    key?: string,
  ) => {
    const signature = `${session?.user.id || "public"}|${path}|${method}|${JSON.stringify(input)}`;
    const requestKey = key || requestKeys.get(signature) || crypto.randomUUID();
    if (input !== undefined) requestKeys.set(signature, requestKey);
    const response = await fetch(path, {
      method: input === undefined ? "GET" : method,
      cache: "no-store",
      headers:
        input === undefined
          ? undefined
          : {
              "Content-Type": "application/json",
              "x-csrf-token": session?.csrf || "",
              "idempotency-key": requestKey,
            },
      body: input === undefined ? undefined : JSON.stringify(input),
    });
    const json = await response.json();
    if (response.status < 500) requestKeys.delete(signature);
    if (!response.ok) {
      if (response.status === 401 && session) onUnauthorized();
      throw new ApiError(
        response.status,
        json.error || "Không thể xử lý yêu cầu.",
      );
    }
    return json.data as T;
  };
}
export const money = (value: number) => value.toLocaleString("vi-VN") + " đ";
export const day = () =>
  new Intl.DateTimeFormat("en-CA", {
    timeZone: "Asia/Ho_Chi_Minh",
    year: "numeric",
    month: "2-digit",
    day: "2-digit",
  }).format(new Date());
export const message = (error: unknown) =>
  error instanceof Error ? error.message : "Không thể xử lý yêu cầu.";
