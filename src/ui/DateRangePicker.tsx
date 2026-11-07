import { useEffect, useRef, useState, type KeyboardEvent } from 'react';
import { addDays, fullDateLabel, monthGrid, monthLabel, nextRange, type DateRange } from '../data/dateFilter';

const WEEKDAYS = ['Su', 'Mo', 'Tu', 'We', 'Th', 'Fr', 'Sa'];
/** The arrow keys, as days to move. */
const KEY_STEPS: Record<string, number> = { ArrowLeft: -1, ArrowRight: 1, ArrowUp: -7, ArrowDown: 7 };

interface DateRangePickerProps {
  range: DateRange;
  today: string;
  onChange: (range: DateRange) => void;
  onDone: () => void;
}

function monthOf(date: string): { year: number; month: number } {
  return { year: Number(date.slice(0, 4)), month: Number(date.slice(5, 7)) };
}

/** A calendar in the site's style. A native date picker's popup can't be styled. */
export function DateRangePicker({ range, today, onChange, onDone }: DateRangePickerProps) {
  const [focused, setFocused] = useState(range.from ?? today);
  const [shown, setShown] = useState(() => monthOf(range.from ?? today));
  const grid = useRef<HTMLTableElement>(null);
  const moveFocus = useRef(true);

  const { year, month } = shown;
  const atFirstMonth = `${year}-${String(month).padStart(2, '0')}` <= today.slice(0, 7);

  useEffect(() => {
    if (!moveFocus.current) return;
    moveFocus.current = false;
    grid.current?.querySelector<HTMLButtonElement>(`[data-date="${focused}"]`)?.focus();
  }, [focused, shown]);

  const changeMonth = (step: number) => {
    const total = year * 12 + (month - 1) + step;
    setShown({ year: Math.floor(total / 12), month: (total % 12) + 1 });
  };

  const goTo = (date: string) => {
    const target = date < today ? today : date;
    moveFocus.current = true;
    setFocused(target);
    setShown(monthOf(target));
  };

  const onGridKeyDown = (event: KeyboardEvent<HTMLTableElement>) => {
    const step = KEY_STEPS[event.key];
    if (step === undefined) return;
    event.preventDefault();
    goTo(addDays(focused, step));
  };

  const { from, to } = range;
  const isEnd = (date: string) => date === from || date === to;
  const inRange = (date: string) => Boolean(from && to && date > from && date < to);
  // The focusable day has to be in the month on screen, or Tab couldn't reach the calendar.
  const tabStop = monthOf(focused).month === month && monthOf(focused).year === year
    ? focused
    : monthGrid(year, month).flat().find((date) => date !== null && date >= today);

  return (
    <div
      id="date-range"
      role="group"
      aria-label="Choose dates"
      onKeyDown={(event) => {
        if (event.key === 'Escape') onDone();
      }}
    >
      <div className="calendar-header">
        <button type="button" aria-label="Previous month" disabled={atFirstMonth} onClick={() => changeMonth(-1)}>
          ‹
        </button>
        <strong aria-live="polite">{monthLabel(year, month)}</strong>
        <button type="button" aria-label="Next month" onClick={() => changeMonth(1)}>
          ›
        </button>
      </div>
      <table ref={grid} role="grid" className="calendar" aria-label={monthLabel(year, month)} onKeyDown={onGridKeyDown}>
        <thead>
          <tr>
            {WEEKDAYS.map((day) => (
              <th key={day} scope="col">
                {day}
              </th>
            ))}
          </tr>
        </thead>
        <tbody>
          {monthGrid(year, month).map((week, row) => (
            <tr key={row}>
              {week.map((date, column) => (
                <td key={column} role={date ? 'gridcell' : undefined} aria-selected={date ? isEnd(date) || inRange(date) : undefined}>
                  {date && (
                    <button
                      type="button"
                      data-date={date}
                      className={[
                        isEnd(date) ? 'is-end' : '',
                        inRange(date) ? 'is-between' : '',
                        date === today ? 'is-today' : '',
                      ].join(' ')}
                      aria-label={fullDateLabel(date)}
                      disabled={date < today}
                      tabIndex={date === tabStop ? 0 : -1}
                      onFocus={() => setFocused(date)}
                      onClick={() => onChange(nextRange(range, date))}
                    >
                      {Number(date.slice(8))}
                    </button>
                  )}
                </td>
              ))}
            </tr>
          ))}
        </tbody>
      </table>
      <p className="calendar-hint" role="status">
        {!from ? 'Pick a start date' : !to ? 'Pick an end date, or finish for all shows from then on' : 'Pick a date to start over'}
      </p>
      <button type="button" className="calendar-done" onClick={onDone}>
        Done
      </button>
    </div>
  );
}
