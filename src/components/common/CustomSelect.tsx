import { useEffect, useLayoutEffect, useRef, useState, RefObject } from 'react';
import { createPortal } from 'react-dom';
import { CalendarDays, Check, ChevronDown, ChevronLeft, ChevronRight } from 'lucide-react';

export type CustomSelectOption = { label: string; value: string };

type CustomSelectProps = {
  value: string;
  options: CustomSelectOption[];
  onChange: (value: string) => void;
  ariaLabel?: string;
  tone?: 'dark' | 'light';
  triggerClassName?: string;
};

type MenuPosition = { top: number; left: number; width: number; maxHeight: number };

function useDismiss(open: boolean, close: () => void, refs: RefObject<HTMLElement | null>[]) {
  useEffect(() => {
    if (!open) return;
    const onPointer = (event: PointerEvent) => {
      if (!refs.some((ref) => ref.current?.contains(event.target as Node))) close();
    };
    const onKey = (event: KeyboardEvent) => { if (event.key === 'Escape') close(); };
    document.addEventListener('pointerdown', onPointer);
    document.addEventListener('keydown', onKey);
    return () => {
      document.removeEventListener('pointerdown', onPointer);
      document.removeEventListener('keydown', onKey);
    };
  }, [open, close, refs]);
}

function useFloatingPosition(open: boolean, anchor: RefObject<HTMLElement | null>, menu: RefObject<HTMLElement | null>, preferredWidth?: number) {
  const [position, setPosition] = useState<MenuPosition | null>(null);
  useLayoutEffect(() => {
    if (!open || !anchor.current) return;
    const update = () => {
      const rect = anchor.current!.getBoundingClientRect();
      const width = Math.min(preferredWidth ?? Math.max(rect.width, 220), window.innerWidth - 24);
      const left = Math.min(Math.max(12, rect.left), window.innerWidth - width - 12);
      const availableBelow = window.innerHeight - rect.bottom - 12;
      const availableAbove = rect.top - 12;
      const maxHeight = Math.max(160, Math.min(320, Math.max(availableBelow, availableAbove)));
      const placeAbove = availableBelow < 220 && availableAbove > availableBelow;
      setPosition({ left, width, maxHeight, top: placeAbove ? Math.max(12, rect.top - Math.min(menu.current?.offsetHeight || 280, maxHeight) - 8) : rect.bottom + 8 });
    };
    update();
    window.addEventListener('resize', update);
    window.addEventListener('scroll', update, true);
    return () => {
      window.removeEventListener('resize', update);
      window.removeEventListener('scroll', update, true);
    };
  }, [open, anchor, menu]);
  return position;
}

export function CustomSelect({ value, options, onChange, ariaLabel = 'Select an option', tone = 'light', triggerClassName = '' }: CustomSelectProps) {
  const [open, setOpen] = useState(false);
  const anchorRef = useRef<HTMLButtonElement>(null);
  const menuRef = useRef<HTMLDivElement>(null);
  const close = () => setOpen(false);
  useDismiss(open, close, [anchorRef, menuRef]);
  const position = useFloatingPosition(open, anchorRef, menuRef);
  const selected = options.find((option) => option.value === value);
  const dark = tone === 'dark';
  return <>
    <button ref={anchorRef} type="button" aria-label={ariaLabel} aria-haspopup="listbox" aria-expanded={open} onClick={() => setOpen((current) => !current)} className={`flex w-full items-center justify-between gap-2 text-left outline-none transition ${dark ? 'text-white' : 'text-[#1A2E24]'} ${triggerClassName}`}>
      <span className="truncate">{selected?.label ?? options[0]?.label ?? 'Select'}</span>
      <ChevronDown className={`h-4 w-4 shrink-0 transition-transform ${open ? 'rotate-180' : ''}`} />
    </button>
    {open && position && createPortal(<div ref={menuRef} role="listbox" aria-label={ariaLabel} style={{ position: 'fixed', top: position.top, left: position.left, width: position.width, maxHeight: position.maxHeight }} className="z-[10000] overflow-y-auto rounded-xl border border-slate-200 bg-white p-1.5 text-[#1A2E24] shadow-[0_18px_50px_rgba(0,0,0,0.22)]">
      {options.map((option) => <button key={option.value} type="button" role="option" aria-selected={value === option.value} onClick={() => { onChange(option.value); close(); }} className={`flex w-full items-center justify-between rounded-lg px-3 py-2.5 text-left text-sm transition hover:bg-emerald-50 ${value === option.value ? 'bg-emerald-50 font-semibold text-emerald-900' : ''}`}>
        <span>{option.label}</span>{value === option.value && <Check className="h-4 w-4" />}
      </button>)}
    </div>, document.body)}
  </>;
}

type ClickableDatePickerProps = { value: string; onChange: (value: string) => void; min?: string; className?: string; showIcon?: boolean };
const dateKey = (date: Date) => `${date.getFullYear()}-${String(date.getMonth() + 1).padStart(2, '0')}-${String(date.getDate()).padStart(2, '0')}`;
const parseDate = (key: string) => {
  const [year, month, day] = key.split('-').map(Number);
  return key && year && month && day ? new Date(year, month - 1, day) : new Date();
};
const fullDate = (date: Date) => new Intl.DateTimeFormat('en-GB', { weekday: 'short', day: 'numeric', month: 'short', year: 'numeric', timeZone: 'Asia/Dhaka' }).format(date);

export function ClickableDatePicker({ value, onChange, min, className = '', showIcon = true }: ClickableDatePickerProps) {
  const [open, setOpen] = useState(false);
  const selectedDate = parseDate(value);
  const [viewMonth, setViewMonth] = useState(() => new Date(selectedDate.getFullYear(), selectedDate.getMonth(), 1));
  const anchorRef = useRef<HTMLButtonElement>(null);
  const menuRef = useRef<HTMLDivElement>(null);
  const close = () => setOpen(false);
  useDismiss(open, close, [anchorRef, menuRef]);
  const position = useFloatingPosition(open, anchorRef, menuRef, 320);
  useEffect(() => { if (open) setViewMonth(new Date(selectedDate.getFullYear(), selectedDate.getMonth(), 1)); }, [open, value]);
  const monthStart = new Date(viewMonth.getFullYear(), viewMonth.getMonth(), 1);
  const mondayOffset = (monthStart.getDay() + 6) % 7;
  const days = Array.from({ length: 42 }, (_, index) => new Date(viewMonth.getFullYear(), viewMonth.getMonth(), index - mondayOffset + 1));
  const todayKey = dateKey(new Date());
  const minimumKey = min || todayKey;
  return <>
    <button ref={anchorRef} type="button" aria-label={`Choose date, ${fullDate(selectedDate)}`} aria-haspopup="dialog" aria-expanded={open} onClick={() => setOpen((current) => !current)} className={`flex w-full items-center gap-2 text-left outline-none transition ${className}`}>
      {showIcon && <CalendarDays className="h-4 w-4 shrink-0" />}
      <span className="min-w-0 flex-1 truncate">{fullDate(selectedDate)}</span>
      <ChevronDown className={`h-4 w-4 shrink-0 transition-transform ${open ? 'rotate-180' : ''}`} />
    </button>
    {open && position && createPortal(<div ref={menuRef} role="dialog" aria-label="Choose a date" style={{ position: 'fixed', top: position.top, left: position.left, width: position.width, maxHeight: position.maxHeight }} className="z-[10000] overflow-auto rounded-2xl border border-slate-200 bg-white p-4 text-[#1A2E24] shadow-[0_20px_60px_rgba(0,0,0,0.25)]">
      <div className="mb-3 flex items-center justify-between">
        <button type="button" aria-label="Previous month" onClick={() => setViewMonth(new Date(viewMonth.getFullYear(), viewMonth.getMonth() - 1, 1))} className="rounded-lg p-2 hover:bg-slate-100"><ChevronLeft className="h-4 w-4" /></button>
        <strong className="text-sm">{new Intl.DateTimeFormat('en', { month: 'long', year: 'numeric' }).format(viewMonth)}</strong>
        <button type="button" aria-label="Next month" onClick={() => setViewMonth(new Date(viewMonth.getFullYear(), viewMonth.getMonth() + 1, 1))} className="rounded-lg p-2 hover:bg-slate-100"><ChevronRight className="h-4 w-4" /></button>
      </div>
      <div className="grid grid-cols-7 text-center text-[11px] font-semibold text-slate-500">{'MTWTFSS'.split('').map((day, index) => <span key={index} className="py-1">{day}</span>)}</div>
      <div className="grid grid-cols-7 gap-y-1">{days.map((day) => {
        const key = dateKey(day);
        const inMonth = day.getMonth() === viewMonth.getMonth();
        const isSelected = key === value;
        const disabled = key < minimumKey;
        return <button key={key} type="button" disabled={disabled} aria-pressed={isSelected} onClick={() => { onChange(key); close(); }} className={`mx-auto grid h-9 w-9 place-items-center rounded-full text-sm transition disabled:cursor-not-allowed disabled:text-slate-300 ${isSelected ? 'bg-emerald-700 font-bold text-white' : inMonth ? 'text-slate-700 hover:bg-emerald-50' : 'text-slate-300 hover:bg-slate-50'} ${key === todayKey && !isSelected ? 'ring-1 ring-emerald-600' : ''}`}>{day.getDate()}</button>;
      })}</div>
    </div>, document.body)}
  </>;
}
