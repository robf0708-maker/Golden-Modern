/**
 * Extrai o faturamento bruto por canal (dinheiro/PIX/cartões) de uma comanda,
 * espelhando a lógica do relatório DRE em routes.ts — sem taxas.
 */
export function getComandaGrossBreakdown(comanda: {
  total?: string | null;
  paymentMethod?: string | null;
  paymentDetails?: unknown;
}): { cash: number; pix: number; credit: number; debit: number } {
  let cash = 0;
  let pix = 0;
  let credit = 0;
  let debit = 0;
  const total = parseFloat(comanda.total || "0");

  if (comanda.paymentMethod === "split" && comanda.paymentDetails) {
    const details = comanda.paymentDetails as { split?: Array<{ method?: string; amount?: string | number }> };
    if (details.split) {
      for (const split of details.split) {
        const amount = parseFloat(String(split.amount || 0));
        if (split.method === "cash") cash += amount;
        else if (split.method === "pix") pix += amount;
        else if (split.method === "credit" || split.method === "card") credit += amount;
        else if (split.method === "debit") debit += amount;
      }
    }
    return { cash, pix, credit, debit };
  }

  switch (comanda.paymentMethod) {
    case "cash":
      cash += total;
      break;
    case "pix":
      pix += total;
      break;
    case "credit":
    case "card":
      credit += total;
      break;
    case "debit":
      debit += total;
      break;
    case "package_use":
      break;
    default:
      cash += total;
      break;
  }
  return { cash, pix, credit, debit };
}

export function sumGrossFromBreakdown(b: { cash: number; pix: number; credit: number; debit: number }): number {
  return b.cash + b.pix + b.credit + b.debit;
}
