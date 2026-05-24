"use client";

import * as React from "react";
import {
  AsYouType,
  getCountries,
  getCountryCallingCode,
  parsePhoneNumberFromString,
  type CountryCode,
} from "libphonenumber-js";

import { Input } from "@/components/ui/input";
import {
  SearchableSelect,
  type SearchableSelectItem,
} from "@/components/ui/searchable-select";
import { cn } from "@/lib/utils";

const DEFAULT_COUNTRY: CountryCode = "US";

const countryNameFormatter =
  typeof Intl !== "undefined" && "DisplayNames" in Intl
    ? new Intl.DisplayNames(["en"], { type: "region" })
    : null;

const phoneCountries = getCountries();

function countryLabel(country: CountryCode) {
  return countryNameFormatter?.of(country) ?? country;
}

function sortPhoneCountryItems(
  a: SearchableSelectItem,
  b: SearchableSelectItem,
) {
  if (a.value === DEFAULT_COUNTRY) return -1;
  if (b.value === DEFAULT_COUNTRY) return 1;
  return (a.keywords ?? a.label).localeCompare(b.keywords ?? b.label);
}

const phoneCountryItems: readonly SearchableSelectItem[] = phoneCountries
  .map((country) => {
    const callingCode = getCountryCallingCode(country);
    const name = countryLabel(country);

    return {
      value: country,
      label: `${country} +${callingCode}`,
      keywords: `${name} ${country} +${callingCode}`,
    };
  })
  .sort(sortPhoneCountryItems);

function isPhoneCountry(value: string): value is CountryCode {
  return phoneCountries.includes(value as CountryCode);
}

function countryForCallingCode(
  callingCode: string | undefined,
  fallbackCountry: CountryCode,
) {
  if (!callingCode) return fallbackCountry;
  if (getCountryCallingCode(fallbackCountry) === callingCode) {
    return fallbackCountry;
  }

  return (
    phoneCountries.find((country) => getCountryCallingCode(country) === callingCode) ??
    fallbackCountry
  );
}

function inferCountryFromValue(
  value: string | null | undefined,
  fallbackCountry: CountryCode,
) {
  const trimmed = value?.trim();
  if (!trimmed) return fallbackCountry;

  const parsed = parsePhoneNumberFromString(trimmed, fallbackCountry);
  if (parsed?.country) return parsed.country;

  const formatter = new AsYouType(
    trimmed.startsWith("+") ? undefined : fallbackCountry,
  );
  formatter.input(trimmed);

  return countryForCallingCode(
    parsed?.countryCallingCode ?? formatter.getCallingCode(),
    fallbackCountry,
  );
}

function formatForDisplay(
  value: string | null | undefined,
  country: CountryCode,
) {
  const trimmed = value?.trim();
  if (!trimmed) return "";

  const parsed = parsePhoneNumberFromString(trimmed, country);
  const nationalNumber = parsed?.nationalNumber;
  if (nationalNumber) {
    return new AsYouType(country).input(nationalNumber);
  }

  if (trimmed.startsWith("+")) {
    const digits = trimmed.replace(/\D/g, "");
    const callingCode = getCountryCallingCode(country);
    if (digits.startsWith(callingCode)) {
      return new AsYouType(country).input(digits.slice(callingCode.length));
    }
  }

  return new AsYouType(country).input(trimmed);
}

function formatForStorage(input: string, country: CountryCode) {
  const trimmed = input.trim();
  if (!trimmed) return "";

  const parsed = parsePhoneNumberFromString(trimmed, country);
  if (parsed?.nationalNumber) {
    return parsed.formatInternational();
  }

  const formatter = new AsYouType(
    trimmed.startsWith("+") ? undefined : country,
  );
  formatter.input(trimmed);
  const number = formatter.getNumber();
  if (number?.nationalNumber) {
    return number.formatInternational();
  }

  const digits = trimmed.replace(/\D/g, "");
  return digits ? `+${getCountryCallingCode(country)} ${digits}` : "";
}

type PhoneNumberInputProps = Omit<
  React.ComponentProps<typeof Input>,
  "value" | "onChange" | "type"
> & {
  value?: string | null;
  onChange: (value: string) => void;
  defaultCountry?: CountryCode;
};

export function PhoneNumberInput({
  className,
  defaultCountry = DEFAULT_COUNTRY,
  id,
  value,
  onChange,
  onBlur,
  disabled,
  "aria-invalid": ariaInvalid,
  ...props
}: PhoneNumberInputProps) {
  const [country, setCountry] = React.useState<CountryCode>(() =>
    inferCountryFromValue(value, defaultCountry),
  );

  React.useEffect(() => {
    if (!value?.trim()) return;
    const nextCountry = inferCountryFromValue(value, country);
    if (nextCountry !== country) setCountry(nextCountry);
  }, [country, value]);

  const displayValue = React.useMemo(
    () => formatForDisplay(value, country),
    [country, value],
  );
  const invalid = ariaInvalid === true || ariaInvalid === "true";

  function handleCountryChange(nextValue: string) {
    if (!isPhoneCountry(nextValue)) return;

    const nextCountry = nextValue;
    setCountry(nextCountry);

    if (displayValue.trim()) {
      onChange(formatForStorage(displayValue, nextCountry));
    }
  }

  function handleInputChange(event: React.ChangeEvent<HTMLInputElement>) {
    const nextInput = event.target.value;
    const nextValue = formatForStorage(nextInput, country);
    const nextCountry = inferCountryFromValue(nextValue, country);

    if (nextCountry !== country) setCountry(nextCountry);
    onChange(nextValue);
  }

  return (
    <div
      className={cn(
        "grid w-full min-w-0 grid-cols-[minmax(6.5rem,8rem)_1fr] gap-2",
        className,
      )}
    >
      <SearchableSelect
        value={country}
        onValueChange={handleCountryChange}
        items={phoneCountryItems}
        disabled={disabled}
        aria-invalid={invalid}
        className="min-w-0"
        placeholder="Code"
        emptyMessage="No country codes found."
      />
      <Input
        {...props}
        id={id}
        type="tel"
        inputMode="tel"
        autoComplete={props.autoComplete ?? "tel-national"}
        value={displayValue}
        disabled={disabled}
        aria-invalid={invalid}
        onBlur={onBlur}
        onChange={handleInputChange}
      />
    </div>
  );
}
