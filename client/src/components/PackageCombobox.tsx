"use client"

import * as React from "react"
import { Check, ChevronsUpDown, Package } from "lucide-react"
import { cn } from "@/lib/utils"
import { Button } from "@/components/ui/button"
import {
  Command,
  CommandEmpty,
  CommandGroup,
  CommandInput,
  CommandItem,
  CommandList,
} from "@/components/ui/command"
import {
  Popover,
  PopoverContent,
  PopoverTrigger,
} from "@/components/ui/popover"

interface PackageItem {
  id: string;
  name: string;
  price: string;
  recurringInterval?: string | null;
  active?: boolean;
}

interface PackageComboboxProps {
  packages: PackageItem[];
  value: string;
  onValueChange: (value: string) => void;
  placeholder?: string;
  "data-testid"?: string;
}

export function PackageCombobox({
  packages,
  value,
  onValueChange,
  placeholder = "Selecione o plano",
  "data-testid": testId,
}: PackageComboboxProps) {
  const [open, setOpen] = React.useState(false)

  const selectedPackage = packages.find((p) => p.id === value || p.id.toString() === value)

  const getIntervalLabel = (interval: string | null | undefined) => {
    switch (interval) {
      case "weekly": return "semana";
      case "biweekly": return "quinzena";
      case "monthly": return "mês";
      default: return "";
    }
  }

  return (
    <Popover open={open} onOpenChange={setOpen}>
      <PopoverTrigger asChild>
        <Button
          variant="outline"
          role="combobox"
          aria-expanded={open}
          className="w-full justify-between font-normal bg-transparent border-input"
          data-testid={testId}
        >
          {selectedPackage ? (
            <span className="flex items-center gap-2 truncate">
              <Package className="h-4 w-4 shrink-0 text-muted-foreground" />
              <span className="truncate">{selectedPackage.name}</span>
              <span className="text-muted-foreground text-xs truncate">
                - R$ {parseFloat(selectedPackage.price).toFixed(2)}
                {selectedPackage.recurringInterval && `/${getIntervalLabel(selectedPackage.recurringInterval)}`}
              </span>
            </span>
          ) : (
            <span className="text-muted-foreground">{placeholder}</span>
          )}
          <ChevronsUpDown className="ml-2 h-4 w-4 shrink-0 opacity-50" />
        </Button>
      </PopoverTrigger>
      <PopoverContent className="w-full p-0" align="start">
        <Command>
          <CommandInput placeholder="Digite para buscar..." />
          <CommandList>
            <CommandEmpty>Nenhum plano encontrado.</CommandEmpty>
            <CommandGroup>
              {packages.map((pkg) => (
                <CommandItem
                  key={pkg.id}
                  value={`${pkg.name} ${pkg.price}`}
                  onSelect={() => {
                    onValueChange(pkg.id.toString())
                    setOpen(false)
                  }}
                >
                  <Check
                    className={cn(
                      "mr-2 h-4 w-4",
                      value === pkg.id || value === pkg.id.toString()
                        ? "opacity-100"
                        : "opacity-0"
                    )}
                  />
                  <div className="flex flex-col">
                    <span>{pkg.name}</span>
                    <span className="text-xs text-muted-foreground">
                      R$ {parseFloat(pkg.price).toFixed(2)}
                      {pkg.recurringInterval && `/${getIntervalLabel(pkg.recurringInterval)}`}
                    </span>
                  </div>
                </CommandItem>
              ))}
            </CommandGroup>
          </CommandList>
        </Command>
      </PopoverContent>
    </Popover>
  )
}
