import { invoke, isTauri } from "@tauri-apps/api/core";
import type {
  Category,
  Entry,
  EntryInput,
  Snapshot,
  PaymentMethod,
  Preset,
  PresetInput,
  Occurrence,
  HolidayCalendar,
  HolidayInfo,
} from "./types";

export const desktopAvailable = () => isTauri();
export const api = {
  holidays: () => invoke<HolidayCalendar>("load_holidays"),
  refreshHolidays: () => invoke<HolidayInfo>("refresh_holidays"),
  load: () => invoke<Snapshot>("load_data"),
  path: () => invoke<string>("data_path"),
  saveEntry: (input: EntryInput) => invoke<Entry>("save_entry", { input }),
  deleteEntry: (id: number) => invoke<void>("delete_entry", { id }),
  saveCategory: (id: number | null, name: string) =>
    invoke<Category>("save_category", { id, name }),
  deleteCategory: (id: number) => invoke<void>("delete_category", { id }),
  reorderCategories: (ids: number[]) =>
    invoke<void>("reorder_categories", { ids }),
  reorderPaymentMethods: (ids: number[]) =>
    invoke<void>("reorder_payment_methods", { ids }),
  savePaymentMethod: (id: number | null, name: string, isDefault: boolean) =>
    invoke<PaymentMethod>("save_payment_method", { id, name, isDefault }),
  deletePaymentMethod: (id: number) =>
    invoke<void>("delete_payment_method", { id }),
  savePreset: (preset: PresetInput) =>
    invoke<Preset>("save_preset", { preset }),
  deletePreset: (id: number) => invoke<void>("delete_preset", { id }),
  recordOccurrence: (occurrence: Occurrence, input: EntryInput) =>
    invoke<Entry>("record_occurrence", { ...occurrence, input }),
  skipOccurrence: (occurrence: Occurrence) =>
    invoke<void>("skip_occurrence", { ...occurrence }),
};
