export type OrderView = "list" | "board";
export function createViewPreference(
  storage: () => Pick<Storage, "getItem" | "setItem">,
) {
  let fallback: OrderView = "list";
  let memoryOnly = false;
  return {
    read(): OrderView {
      if (memoryOnly) return fallback;
      try {
        return storage().getItem("luuta-orders-view") === "board"
          ? "board"
          : "list";
      } catch {
        return fallback;
      }
    },
    save(view: OrderView) {
      fallback = view;
      try {
        storage().setItem("luuta-orders-view", view);
        memoryOnly = false;
      } catch {
        memoryOnly = true;
      }
    },
  };
}
