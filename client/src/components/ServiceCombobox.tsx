"use client"

import * as React from "react"
import { Check, ChevronsUpDown, Search } from "lucide-react"
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

interface Service {
  id: string;
  name: string;
  price: string;
  active?: boolean;
}

interface ServiceComboboxProps {
  services: Service[];
  value: string;
  onValueChange: (value: string) => void;
  placeholder?: string;
  "data-testid"?: string;
}

export function ServiceCombobox({
  services,
  value,
  onValueChange,
  placeholder = "Selecione o serviço",
  "data-testid": testId,
}: ServiceComboboxProps) {
  const [open, setOpen] = React.useState(false)

  const activeServices = services.filter((s) => s.active !== false)
  const selectedService = activeServices.find((s) => s.id === value || s.id.toString() === value)

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
          {selectedService
            ? `${selectedService.name} - R$ ${parseFloat(selectedService.price).toFixed(2)}`
            : placeholder}
          <ChevronsUpDown className="ml-2 h-4 w-4 shrink-0 opacity-50" />
        </Button>
      </PopoverTrigger>
      <PopoverContent className="w-full p-0" align="start">
        <Command>
          <CommandInput placeholder="Buscar serviço..." />
          <CommandList>
            <CommandEmpty>Nenhum serviço encontrado.</CommandEmpty>
            <CommandGroup>
              {activeServices.map((service) => (
                <CommandItem
                  key={service.id}
                  value={`${service.name} ${service.price}`}
                  onSelect={() => {
                    onValueChange(service.id.toString())
                    setOpen(false)
                  }}
                >
                  <Check
                    className={cn(
                      "mr-2 h-4 w-4",
                      value === service.id || value === service.id.toString()
                        ? "opacity-100"
                        : "opacity-0"
                    )}
                  />
                  {service.name} - R$ {parseFloat(service.price).toFixed(2)}
                </CommandItem>
              ))}
            </CommandGroup>
          </CommandList>
        </Command>
      </PopoverContent>
    </Popover>
  )
}
