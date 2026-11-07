import { useEffect, useRef, useState, type KeyboardEvent } from 'react';

export interface DropdownItem {
  value: string;
  label: string;
}

export interface DropdownGroup {
  /** Omit for a group with no heading. */
  heading?: string;
  items: DropdownItem[];
}

interface DropdownProps {
  id: string;
  label: string;
  /** Text on the button. */
  buttonText: string;
  value: string;
  groups: DropdownGroup[];
  /** Highlights the button when this filter is on. */
  active: boolean;
  onChange: (value: string) => void;
}

/** A dropdown in the site's style. Native selects can't have their open list styled. */
export function Dropdown({ id, label, buttonText, value, groups, active, onChange }: DropdownProps) {
  const [open, setOpen] = useState(false);
  const [highlighted, setHighlighted] = useState(0);
  const button = useRef<HTMLButtonElement>(null);
  const list = useRef<HTMLUListElement>(null);
  const items = groups.flatMap((group) => group.items);

  const optionId = (index: number) => `${id}-option-${index}`;

  const openList = () => {
    setHighlighted(Math.max(items.findIndex((item) => item.value === value), 0));
    setOpen(true);
  };

  const close = () => {
    setOpen(false);
    button.current?.focus();
  };

  const choose = (item: DropdownItem) => {
    onChange(item.value);
    close();
  };

  useEffect(() => {
    if (!open) return;
    list.current?.focus();
  }, [open]);

  useEffect(() => {
    if (open) document.getElementById(optionId(highlighted))?.scrollIntoView({ block: 'nearest' });
    // optionId only depends on id.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [open, highlighted, id]);

  const onListKeyDown = (event: KeyboardEvent<HTMLUListElement>) => {
    if (event.key === 'ArrowDown') setHighlighted((highlighted + 1) % items.length);
    else if (event.key === 'ArrowUp') setHighlighted((highlighted - 1 + items.length) % items.length);
    else if (event.key === 'Home') setHighlighted(0);
    else if (event.key === 'End') setHighlighted(items.length - 1);
    else if (event.key === 'Escape' || event.key === 'Tab') close();
    else if (event.key === 'Enter' || event.key === ' ') {
      const item = items[highlighted];
      if (item) choose(item);
    } else return;
    event.preventDefault();
  };

  let position = -1;

  return (
    <>
      <button
        ref={button}
        id={id}
        type="button"
        className={`dropdown-button${active ? ' is-active' : ''}`}
        aria-label={`${label}: ${buttonText}`}
        aria-haspopup="listbox"
        aria-expanded={open}
        onClick={() => (open ? close() : openList())}
      >
        <span>{buttonText}</span>
        <span aria-hidden="true">▾</span>
      </button>
      {open && (
        <ul
          ref={list}
          role="listbox"
          aria-label={label}
          aria-activedescendant={optionId(highlighted)}
          tabIndex={-1}
          onKeyDown={onListKeyDown}
          onBlur={() => setOpen(false)}
        >
          {groups.map((group, groupIndex) => (
            <li key={group.heading ?? groupIndex} role="presentation">
              {group.heading && <div className="dropdown-group">{group.heading}</div>}
              <ul role="group" aria-label={group.heading} className="dropdown-items">
                {group.items.map((item) => {
                  position++;
                  const index = position;
                  return (
                    <li
                      key={item.value}
                      id={optionId(index)}
                      role="option"
                      aria-selected={index === highlighted}
                      // Runs before the list's blur closes it.
                      onMouseDown={(event) => {
                        event.preventDefault();
                        choose(item);
                      }}
                      onMouseEnter={() => setHighlighted(index)}
                    >
                      {item.label}
                    </li>
                  );
                })}
              </ul>
            </li>
          ))}
        </ul>
      )}
    </>
  );
}
