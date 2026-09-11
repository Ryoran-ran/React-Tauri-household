export type Direction = "income" | "expense";
export type ExpenseKind = "normal" | "special" | "transfer";
export interface Category {
  id: number;
  name: string;
}
export interface Entry {
  status: "draft" | "confirmed";
  presetId: number | null;
  scheduledDate: string | null;
  id: number;
  date: string;
  amount: number;
  direction: Direction;
  categoryId: number | null;
  memo: string;
  expenseKind: ExpenseKind | null;
  paymentMethodId: number | null;
}
export type EntryInput = Omit<Entry, "id" | "presetId" | "scheduledDate"> & {
  id: number | null;
};
export interface Snapshot {
  holidayInfo: HolidayInfo;
  draftThrough: string;
  entries: Entry[];
  categories: Category[];
  paymentMethods: PaymentMethod[];
  presets: Preset[];
  schedules: ScheduleStatus[];
}

export interface HolidayInfo {
  fetchedAt: string | null;
  firstYear: number | null;
  lastYear: number | null;
  count: number;
}
export interface HolidayCalendar {
  info: HolidayInfo;
  holidays: { date: string; name: string }[];
}
export interface Summary {
  income: number;
  normal: number;
  special: number;
  transfer: number;
  living: number;
  cash: number;
  count: number;
}
export interface Filters {
  status?: "draft" | "confirmed" | "";
  from: string;
  to: string;
  direction: Direction | "";
  category: string;
  expenseKind: ExpenseKind | "";
  search: string;
  paymentMethod?: string;
}

export interface PaymentMethod {
  id: number;
  name: string;
  isDefault: boolean;
}
export type PresetMode = "quick" | "recurring";
export type Frequency = "weekly" | "monthly" | "yearly";
export type WeekendAdjustment = "none" | "previous" | "next";
export interface Preset
  extends Omit<Entry, "date" | "status" | "presetId" | "scheduledDate"> {
  name: string;
  mode: PresetMode;
  weekendAdjustment: WeekendAdjustment;
  frequency: Frequency | null;
  startDate: string | null;
  endDate: string | null;
  active: boolean;
}
export type PresetInput = Omit<Preset, "id"> & { id: number | null };
export interface ScheduleStatus {
  presetId: number;
  dueDate: string | null;
  nextDate: string | null;
  dueCount: number;
}
export interface Occurrence {
  presetId: number;
  scheduledDate: string;
}
