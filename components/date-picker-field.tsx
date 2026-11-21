import { CalendarBlankIcon } from "@phosphor-icons/react/dist/ssr";
import { useId, useState } from "react";
import { Button } from "@/components/ui/button";
import { Calendar } from "@/components/ui/calendar";
import { Field, FieldLabel } from "@/components/ui/field";
import { Popover, PopoverContent, PopoverTrigger } from "@/components/ui/popover";
import { utcDay } from "@/lib/catalog";

const dateLabel = new Intl.DateTimeFormat("en-US", { dateStyle: "medium", timeZone: "UTC" });

function calendarDate(day: string) {
  // The calendar uses local Date objects to represent the UTC date's year, month and day.
  return new Date(`${day}T12:00:00`);
}

export function DatePickerField({
  label,
  value,
  min,
  disabled,
  onChange,
}: {
  label: string;
  value: string;
  min: string;
  disabled: boolean;
  onChange: (day: string) => void;
}) {
  const id = useId();
  const [open, setOpen] = useState(false);
  const selected = value ? calendarDate(value) : undefined;
  const earliest = calendarDate(min);

  return (
    <Field data-disabled={disabled}>
      <FieldLabel id={`${id}-label`} htmlFor={id}>
        {label}
      </FieldLabel>
      <Popover open={open} onOpenChange={setOpen}>
        <PopoverTrigger asChild>
          <Button
            id={id}
            type="button"
            variant="outline"
            size="touch"
            disabled={disabled}
            aria-labelledby={`${id}-label ${id}-value`}
          >
            <CalendarBlankIcon data-icon="inline-start" aria-hidden />
            <span id={`${id}-value`}>
              {value ? dateLabel.format(Date.parse(value)) : "Pick a date"}
            </span>
          </Button>
        </PopoverTrigger>
        <PopoverContent variant="calendar" align="start" aria-label={`${label} calendar`}>
          <Calendar
            // oxlint-disable-next-line jsx-a11y/no-autofocus -- The user opened the calendar explicitly.
            autoFocus
            mode="single"
            required
            today={calendarDate(utcDay())}
            selected={selected}
            defaultMonth={selected ?? earliest}
            startMonth={earliest}
            disabled={{ before: earliest }}
            onSelect={(day) => {
              onChange(utcDay(Date.UTC(day.getFullYear(), day.getMonth(), day.getDate())));
              setOpen(false);
            }}
          />
        </PopoverContent>
      </Popover>
    </Field>
  );
}
