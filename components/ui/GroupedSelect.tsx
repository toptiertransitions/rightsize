import { cn } from "@/lib/utils";
import { SelectHTMLAttributes, forwardRef } from "react";

export interface GroupedSelectProps extends SelectHTMLAttributes<HTMLSelectElement> {
  label?: string;
  error?: string;
  hint?: string;
  placeholder?: string;
  groups: Array<{ group: string; options: Array<{ value: string; label: string }> }>;
}

export const GroupedSelect = forwardRef<HTMLSelectElement, GroupedSelectProps>(
  ({ className, label, error, hint, placeholder = "— select —", groups, id, ...props }, ref) => {
    const selectId = id || label?.toLowerCase().replace(/\s+/g, "-");

    return (
      <div className="w-full">
        {label && (
          <label htmlFor={selectId} className="block text-sm font-medium text-gray-700 mb-1.5">
            {label}
          </label>
        )}
        <select
          ref={ref}
          id={selectId}
          className={cn(
            "w-full h-12 px-4 rounded-xl border bg-white text-gray-900 appearance-none",
            "focus:outline-none focus:ring-2 focus:ring-forest-500 focus:border-transparent",
            "transition-colors duration-200 cursor-pointer",
            "bg-[url(\"data:image/svg+xml,%3Csvg xmlns='http://www.w3.org/2000/svg' fill='none' viewBox='0 0 20 20'%3E%3Cpath stroke='%236B7280' stroke-linecap='round' stroke-linejoin='round' stroke-width='1.5' d='m6 8 4 4 4-4'/%3E%3C/svg%3E\")] bg-no-repeat bg-[right_12px_center] bg-[length:20px]",
            error
              ? "border-red-400 focus:ring-red-400"
              : "border-gray-300 hover:border-gray-400",
            className
          )}
          {...props}
        >
          <option value="">{placeholder}</option>
          {groups.map(({ group, options }) => (
            <optgroup key={group} label={group}>
              {options.map(opt => (
                <option key={opt.value} value={opt.value}>
                  {opt.label}
                </option>
              ))}
            </optgroup>
          ))}
        </select>
        {error && <p className="mt-1.5 text-sm text-red-600">{error}</p>}
        {hint && !error && <p className="mt-1.5 text-sm text-gray-500">{hint}</p>}
      </div>
    );
  }
);

GroupedSelect.displayName = "GroupedSelect";
