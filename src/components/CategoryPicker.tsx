import { useId, useRef, useState } from 'react';
import { Check, Plus } from 'lucide-react';

export function CategoryPicker({
  value,
  categories,
  onChange,
}: {
  value: string;
  categories: string[];
  onChange: (value: string) => void;
}) {
  const inputId = useId();
  const input = useRef<HTMLInputElement>(null);
  const [open, setOpen] = useState(false);
  const [active, setActive] = useState(-1);
  // Keep a typed category stable while autosave adds it to the inventory's suggestions.
  const [suggestions, setSuggestions] = useState(categories);
  const query = value.trim();
  const matches = suggestions.filter((category) =>
    category.toLowerCase().includes(query.toLowerCase()),
  );
  const isNew =
    !!query && !suggestions.some((category) => category.toLowerCase() === query.toLowerCase());
  const options = [...matches, ...(isNew ? [query] : [])];
  function choose(category: string) {
    onChange(category);
    input.current?.focus();
    setOpen(false);
    setActive(-1);
  }
  return (
    <div
      className="field category-picker"
      onBlur={(event) => {
        if (!event.currentTarget.contains(event.relatedTarget)) setOpen(false);
      }}
    >
      <label htmlFor={inputId}>Category</label>
      <input
        ref={input}
        id={inputId}
        role="combobox"
        aria-autocomplete="list"
        aria-expanded={open}
        aria-controls={`${inputId}-options`}
        aria-activedescendant={open && active >= 0 ? `${inputId}-option-${active}` : undefined}
        value={value}
        placeholder="Choose or add a category"
        maxLength={180}
        autoComplete="off"
        onFocus={() => {
          setSuggestions(categories);
          setOpen(true);
          setActive(-1);
        }}
        onClick={() => setOpen(true)}
        onChange={(event) => {
          onChange(event.target.value);
          setOpen(true);
          setActive(-1);
        }}
        onKeyDown={(event) => {
          if (event.key === 'Escape') {
            event.preventDefault();
            setOpen(false);
          }
          if (event.key === 'ArrowDown' || event.key === 'ArrowUp') {
            event.preventDefault();
            setOpen(true);
            setActive((index) =>
              options.length
                ? index < 0
                  ? event.key === 'ArrowDown'
                    ? 0
                    : options.length - 1
                  : (index + (event.key === 'ArrowDown' ? 1 : -1) + options.length) % options.length
                : -1,
            );
          }
          if (event.key === 'Enter' && open && options.length) {
            event.preventDefault();
            choose(options[active >= 0 ? active : isNew ? options.length - 1 : 0]);
          }
        }}
      />
      {open && (
        <div
          className="category-suggestions"
          id={`${inputId}-options`}
          role="listbox"
          aria-label="Categories"
        >
          {options.map((category, index) => (
            <button
              key={category}
              type="button"
              tabIndex={-1}
              id={`${inputId}-option-${index}`}
              role="option"
              aria-selected={
                category.toLowerCase() === value.toLowerCase() &&
                !(isNew && index === options.length - 1)
              }
              className={`category-pill ${active === index ? 'is-active' : ''} ${isNew && index === options.length - 1 ? 'new-category' : ''}`}
              onMouseDown={(event) => event.preventDefault()}
              onClick={() => choose(category)}
            >
              {isNew && index === options.length - 1 ? (
                <>
                  <Plus size={17} />
                  Add “{category}”
                </>
              ) : (
                <>
                  {category}
                  {category.toLowerCase() === value.toLowerCase() && <Check size={16} />}
                </>
              )}
            </button>
          ))}
        </div>
      )}
    </div>
  );
}
