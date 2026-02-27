"use client"

import * as React from "react"
import { Check, ChevronsUpDown, User } from "lucide-react"
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

interface Client {
  id: string;
  name: string;
  phone?: string;
}

interface ClientComboboxProps {
  clients: Client[];
  value: string;
  onValueChange: (value: string) => void;
  placeholder?: string;
  "data-testid"?: string;
}

export function ClientCombobox({
  clients,
  value,
  onValueChange,
  placeholder = "Selecione o cliente",
  "data-testid": testId,
}: ClientComboboxProps) {
  const [open, setOpen] = React.useState(false)

  const selectedClient = clients.find((c) => c.id === value || c.id.toString() === value)

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
          {selectedClient ? (
            <span className="flex items-center gap-2 truncate">
              <User className="h-4 w-4 shrink-0 text-muted-foreground" />
              <span className="truncate">{selectedClient.name}</span>
              {selectedClient.phone && (
                <span className="text-muted-foreground text-xs truncate">- {selectedClient.phone}</span>
              )}
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
            <CommandEmpty>Nenhum cliente encontrado.</CommandEmpty>
            <CommandGroup>
              {clients.map((client) => (
                <CommandItem
                  key={client.id}
                  value={`${client.name} ${client.phone || ""}`}
                  onSelect={() => {
                    onValueChange(client.id.toString())
                    setOpen(false)
                  }}
                >
                  <Check
                    className={cn(
                      "mr-2 h-4 w-4",
                      value === client.id || value === client.id.toString()
                        ? "opacity-100"
                        : "opacity-0"
                    )}
                  />
                  <div className="flex flex-col">
                    <span>{client.name}</span>
                    {client.phone && (
                      <span className="text-xs text-muted-foreground">{client.phone}</span>
                    )}
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
