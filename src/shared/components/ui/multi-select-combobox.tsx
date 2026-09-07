import { Check, ChevronsUpDown, X } from 'lucide-react'
import { useState } from 'react'
import { cn } from '@/lib/utils'
import { Badge } from '@/shared/components/ui/badge'
import { Button } from '@/shared/components/ui/button'
import {
  Command,
  CommandEmpty,
  CommandGroup,
  CommandInput,
  CommandItem,
  CommandList,
} from '@/shared/components/ui/command'
import {
  Popover,
  PopoverContent,
  PopoverTrigger,
} from '@/shared/components/ui/popover'

export interface MultiSelectComboboxOption {
  value: string
  label: string
}

export interface MultiSelectComboboxProps {
  values: string[]
  onValuesChange: (values: string[]) => void
  options: MultiSelectComboboxOption[]
  placeholder?: string
  searchPlaceholder?: string
  emptyMessage?: string
  disabled?: boolean
  className?: string
  ariaLabel?: string
}

export function MultiSelectCombobox({
  values,
  onValuesChange,
  options,
  placeholder = '選択してください',
  searchPlaceholder = '検索...',
  emptyMessage = '見つかりませんでした',
  disabled = false,
  className,
  ariaLabel,
}: MultiSelectComboboxProps) {
  const [open, setOpen] = useState(false)

  const selectedOptions = options.filter((o) => values.includes(o.value))

  const toggleValue = (value: string) => {
    if (values.includes(value)) {
      onValuesChange(values.filter((v) => v !== value))
    } else {
      onValuesChange([...values, value])
    }
  }

  const removeValue = (value: string) => {
    onValuesChange(values.filter((v) => v !== value))
  }

  return (
    <div className={cn('space-y-1.5', className)}>
      <Popover open={open} onOpenChange={setOpen}>
        <PopoverTrigger asChild>
          <Button
            variant="outline"
            role="combobox"
            aria-expanded={open}
            aria-label={ariaLabel}
            disabled={disabled}
            className={cn(
              'flex h-9 w-full items-center justify-between whitespace-nowrap rounded-md border border-input bg-transparent px-3 py-2 text-sm shadow-sm ring-offset-background focus:outline-none focus:ring-1 focus:ring-ring disabled:cursor-not-allowed disabled:opacity-50 font-normal',
              selectedOptions.length === 0 && 'text-muted-foreground',
            )}
          >
            <span className="truncate">
              {selectedOptions.length > 0
                ? `${selectedOptions.length}件選択中`
                : placeholder}
            </span>
            <ChevronsUpDown className="ml-2 h-4 w-4 shrink-0 opacity-50" />
          </Button>
        </PopoverTrigger>
        <PopoverContent
          className="p-0"
          style={{ width: 'var(--radix-popover-trigger-width)' }}
          align="start"
        >
          <Command>
            <CommandInput placeholder={searchPlaceholder} />
            <CommandList>
              <CommandEmpty>{emptyMessage}</CommandEmpty>
              <CommandGroup>
                {options.map((option) => {
                  const checked = values.includes(option.value)
                  return (
                    <CommandItem
                      key={option.value}
                      value={option.label}
                      data-checked={checked ? 'true' : 'false'}
                      onSelect={() => toggleValue(option.value)}
                    >
                      <Check
                        className={cn(
                          'mr-2 h-4 w-4',
                          checked ? 'opacity-100' : 'opacity-0',
                        )}
                      />
                      {option.label}
                    </CommandItem>
                  )
                })}
              </CommandGroup>
            </CommandList>
          </Command>
        </PopoverContent>
      </Popover>
      {selectedOptions.length > 0 && (
        <div className="flex flex-wrap gap-1">
          {selectedOptions.map((option) => (
            <Badge
              key={option.value}
              data-testid="chip"
              variant="secondary"
              className="cursor-pointer gap-1"
              onClick={() => removeValue(option.value)}
            >
              {option.label}
              <X className="h-3 w-3" />
            </Badge>
          ))}
        </div>
      )}
    </div>
  )
}
