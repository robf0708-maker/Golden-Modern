import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";

// API helper
async function fetchAPI(endpoint: string, options?: RequestInit) {
  const res = await fetch(`/api${endpoint}`, {
    ...options,
    headers: {
      "Content-Type": "application/json",
      ...options?.headers,
    },
    credentials: "include",
  });

  if (!res.ok) {
    const error = await res.json();
    throw new Error(error.error || "API Error");
  }

  return res.json();
}

// ============ AUTH ============

export function useAuth() {
  return useQuery({
    queryKey: ["/auth/me"],
    queryFn: () => fetchAPI("/auth/me").catch(() => null),
    retry: false,
  });
}

export function useLogin() {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: (data: { email: string; password: string }) =>
      fetchAPI("/auth/login", {
        method: "POST",
        body: JSON.stringify(data),
      }),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["/auth/me"] });
    },
  });
}

export function useSignup() {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: (data: { barbershopName: string; name: string; email: string; password: string }) =>
      fetchAPI("/auth/signup", {
        method: "POST",
        body: JSON.stringify(data),
      }),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["/auth/me"] });
    },
  });
}

export function useLogout() {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: () =>
      fetchAPI("/auth/logout", {
        method: "POST",
      }),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["/auth/me"] });
    },
  });
}

// ============ BARBERS ============

export function useBarbers() {
  return useQuery({
    queryKey: ["/barbers"],
    queryFn: () => fetchAPI("/barbers"),
  });
}

export function useCreateBarber() {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: (data: any) =>
      fetchAPI("/barbers", {
        method: "POST",
        body: JSON.stringify(data),
      }),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["/barbers"] });
    },
  });
}

export function useUpdateBarber() {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: ({ id, ...data }: any) =>
      fetchAPI(`/barbers/${id}`, {
        method: "PATCH",
        body: JSON.stringify(data),
      }),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["/barbers"] });
    },
  });
}

export function useDeleteBarber() {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: (id: string) =>
      fetchAPI(`/barbers/${id}`, {
        method: "DELETE",
      }),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["/barbers"] });
    },
  });
}

// ============ CLIENTS ============

export function useClients() {
  return useQuery({
    queryKey: ["/clients"],
    queryFn: () => fetchAPI("/clients"),
  });
}

export function useCreateClient() {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: (data: any) =>
      fetchAPI("/clients", {
        method: "POST",
        body: JSON.stringify(data),
      }),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["/clients"] });
    },
  });
}

export function useUpdateClient() {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: ({ id, ...data }: any) =>
      fetchAPI(`/clients/${id}`, {
        method: "PATCH",
        body: JSON.stringify(data),
      }),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["/clients"] });
    },
  });
}

export function useDeleteClient() {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: (id: string) =>
      fetchAPI(`/clients/${id}`, {
        method: "DELETE",
      }),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["/clients"] });
    },
  });
}

export function useClientHistory(clientId: string | null) {
  return useQuery({
    queryKey: ["/clients", clientId, "history"],
    queryFn: () => fetchAPI(`/clients/${clientId}/history`),
    enabled: !!clientId,
  });
}

// ============ SERVICES ============

export function useServices() {
  return useQuery({
    queryKey: ["/services"],
    queryFn: () => fetchAPI("/services"),
  });
}

export function useCreateService() {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: (data: any) =>
      fetchAPI("/services", {
        method: "POST",
        body: JSON.stringify(data),
      }),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["/services"] });
    },
  });
}

export function useUpdateService() {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: ({ id, ...data }: any) =>
      fetchAPI(`/services/${id}`, {
        method: "PATCH",
        body: JSON.stringify(data),
      }),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["/services"] });
    },
  });
}

export function useDeleteService() {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: (id: string) =>
      fetchAPI(`/services/${id}`, {
        method: "DELETE",
      }),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["/services"] });
    },
  });
}

// ============ PRODUCTS ============

export function useProducts() {
  return useQuery({
    queryKey: ["/products"],
    queryFn: () => fetchAPI("/products"),
  });
}

export function useCreateProduct() {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: (data: any) =>
      fetchAPI("/products", {
        method: "POST",
        body: JSON.stringify(data),
      }),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["/products"] });
    },
  });
}

export function useUpdateProduct() {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: ({ id, ...data }: any) =>
      fetchAPI(`/products/${id}`, {
        method: "PATCH",
        body: JSON.stringify(data),
      }),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["/products"] });
    },
  });
}

export function useDeleteProduct() {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: (id: string) =>
      fetchAPI(`/products/${id}`, {
        method: "DELETE",
      }),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["/products"] });
    },
  });
}

// ============ PACKAGES ============

export function usePackages() {
  return useQuery({
    queryKey: ["/packages"],
    queryFn: () => fetchAPI("/packages"),
  });
}

export function useCreatePackage() {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: (data: any) =>
      fetchAPI("/packages", {
        method: "POST",
        body: JSON.stringify(data),
      }),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["/packages"] });
    },
  });
}

export function useUpdatePackage() {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: ({ id, ...data }: any) =>
      fetchAPI(`/packages/${id}`, {
        method: "PATCH",
        body: JSON.stringify(data),
      }),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["/packages"] });
    },
  });
}

export function useDeletePackage() {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: (id: string) =>
      fetchAPI(`/packages/${id}`, {
        method: "DELETE",
      }),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["/packages"] });
    },
  });
}

// ============ APPOINTMENTS ============

export function useAppointments(startDate: string, endDate: string) {
  return useQuery({
    queryKey: ["/appointments", startDate, endDate],
    queryFn: () => fetchAPI(`/appointments?startDate=${startDate}&endDate=${endDate}`),
    refetchOnWindowFocus: true,
    refetchInterval: 30000,
    staleTime: 0,
  });
}

export function useCreateAppointment() {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: (data: any) =>
      fetchAPI("/appointments", {
        method: "POST",
        body: JSON.stringify(data),
      }),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["/appointments"] });
    },
  });
}

export function useUpdateAppointment() {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: ({ id, ...data }: any) =>
      fetchAPI(`/appointments/${id}`, {
        method: "PATCH",
        body: JSON.stringify(data),
      }),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["/appointments"] });
    },
  });
}

export function useDeleteAppointment() {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: (id: number) =>
      fetchAPI(`/appointments/${id}`, {
        method: "DELETE",
      }),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["/appointments"] });
    },
  });
}

// ============ COMANDAS ============

export function useComandas(status?: string) {
  return useQuery({
    queryKey: ["/comandas", status],
    queryFn: () => fetchAPI(`/comandas${status ? `?status=${status}` : ""}`),
  });
}

export function useOpenComandas() {
  return useQuery({
    queryKey: ["/comandas", "open"],
    queryFn: () => fetchAPI(`/comandas?status=open`),
  });
}

export function useClientOpenComanda(clientId: string | null) {
  return useQuery({
    queryKey: ["/comandas/client", clientId, "open"],
    queryFn: () => clientId ? fetchAPI(`/comandas/client/${clientId}/open`) : null,
    enabled: !!clientId,
  });
}

export function useAddComandaItem() {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: ({ comandaId, ...data }: { comandaId: string; [key: string]: any }) =>
      fetchAPI(`/comandas/${comandaId}/items`, {
        method: "POST",
        body: JSON.stringify(data),
      }),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["/comandas"] });
      queryClient.invalidateQueries({ predicate: (query) => 
        Array.isArray(query.queryKey) && query.queryKey[0] === "/comandas/client"
      });
    },
  });
}

export function useCreateComanda() {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: (data: any) =>
      fetchAPI("/comandas", {
        method: "POST",
        body: JSON.stringify(data),
      }),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["/comandas"] });
      queryClient.invalidateQueries({ queryKey: ["/cash-register/current"] });
      queryClient.invalidateQueries({ queryKey: ["/cash-register/transactions"] });
      // Invalidar todas as variantes de comissões (com diferentes parâmetros de data/barbeiro)
      queryClient.invalidateQueries({ predicate: (query) => 
        Array.isArray(query.queryKey) && query.queryKey[0] === "/commissions"
      });
      queryClient.invalidateQueries({ queryKey: ["/dashboard/stats"] });
      queryClient.invalidateQueries({ queryKey: ["/products"] }); // Atualizar estoque
      queryClient.invalidateQueries({ predicate: (query) => 
        Array.isArray(query.queryKey) && query.queryKey[0] === "/barber-purchases"
      });
    },
  });
}

export function useUpdateComanda() {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: ({ id, ...data }: any) =>
      fetchAPI(`/comandas/${id}`, {
        method: "PATCH",
        body: JSON.stringify(data),
      }),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["/comandas"] });
      queryClient.invalidateQueries({ queryKey: ["/cash-register/current"] });
      queryClient.invalidateQueries({ queryKey: ["/cash-register/transactions"] });
      queryClient.invalidateQueries({ predicate: (query) => 
        Array.isArray(query.queryKey) && query.queryKey[0] === "/commissions"
      });
      queryClient.invalidateQueries({ queryKey: ["/dashboard/stats"] });
      queryClient.invalidateQueries({ queryKey: ["/products"] });
      queryClient.invalidateQueries({ predicate: (query) => 
        Array.isArray(query.queryKey) && query.queryKey[0] === "/barber-purchases"
      });
    },
  });
}

export function useRefundComanda() {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: (comandaId: string) =>
      fetchAPI(`/comandas/${comandaId}/refund`, {
        method: "POST",
      }),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["/comandas"] });
      queryClient.invalidateQueries({ queryKey: ["/cash-register/current"] });
      queryClient.invalidateQueries({ queryKey: ["/cash-register/transactions"] });
      queryClient.invalidateQueries({ queryKey: ["/cash-register/history"] });
      queryClient.invalidateQueries({ predicate: (query) => 
        Array.isArray(query.queryKey) && query.queryKey[0] === "/commissions"
      });
      queryClient.invalidateQueries({ queryKey: ["/dashboard/stats"] });
      queryClient.invalidateQueries({ queryKey: ["/products"] });
      queryClient.invalidateQueries({ predicate: (query) => 
        Array.isArray(query.queryKey) && query.queryKey[0] === "/barber-purchases"
      });
    },
  });
}

export function useRefundNotifications() {
  return useQuery({
    queryKey: ["/refund-notifications"],
    queryFn: () => fetchAPI("/refund-notifications"),
  });
}

export function useMarkRefundNotificationRead() {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: (id: string) =>
      fetchAPI(`/refund-notifications/${id}/read`, {
        method: "PATCH",
      }),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["/refund-notifications"] });
    },
  });
}

// ============ CASH REGISTER ============

export function useCurrentCashRegister() {
  return useQuery({
    queryKey: ["/cash-register/current"],
    queryFn: () => fetchAPI("/cash-register/current"),
  });
}

export function useCashRegisterHistory() {
  return useQuery({
    queryKey: ["/cash-register/history"],
    queryFn: () => fetchAPI("/cash-register/history"),
  });
}

export function useOpenComandasCheck() {
  return useQuery({
    queryKey: ["/cash-register/open-comandas-check"],
    queryFn: () => fetchAPI("/cash-register/open-comandas-check"),
  });
}

export function useOpenCashRegister() {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: (data: any) =>
      fetchAPI("/cash-register", {
        method: "POST",
        body: JSON.stringify(data),
      }),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["/cash-register/current"] });
    },
  });
}

export function useCloseCashRegister() {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: ({ id, ...data }: any) =>
      fetchAPI(`/cash-register/${id}`, {
        method: "PATCH",
        body: JSON.stringify(data),
      }),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["/cash-register/current"] });
      queryClient.invalidateQueries({ queryKey: ["/cash-register/history"] });
    },
  });
}

export function useCashTransactions(cashRegisterId: string) {
  return useQuery({
    queryKey: ["/cash-register/transactions", cashRegisterId],
    queryFn: () => fetchAPI(`/cash-register/${cashRegisterId}/transactions`),
    enabled: !!cashRegisterId,
  });
}

export function useCreateCashTransaction() {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: ({ cashRegisterId, ...data }: any) =>
      fetchAPI(`/cash-register/${cashRegisterId}/transactions`, {
        method: "POST",
        body: JSON.stringify(data),
      }),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["/cash-register/transactions"] });
      queryClient.invalidateQueries({ queryKey: ["/cash-register/current"] });
    },
  });
}

export function useCommissions(startDate?: string, endDate?: string, barberId?: string) {
  const params = new URLSearchParams();
  if (startDate) params.append("startDate", startDate);
  if (endDate) params.append("endDate", endDate);
  if (barberId) params.append("barberId", barberId);

  return useQuery({
    queryKey: ["/commissions", startDate, endDate, barberId],
    queryFn: () => fetchAPI(`/commissions?${params.toString()}`),
    refetchInterval: 30000,
  });
}

export function usePayCommission() {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: (id: number) =>
      fetchAPI(`/commissions/${id}/pay`, {
        method: "PATCH",
      }),
    onSuccess: () => {
      queryClient.invalidateQueries({ predicate: (query) => 
        Array.isArray(query.queryKey) && query.queryKey[0] === "/commissions"
      });
    },
  });
}

export function useCloseCommissions() {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: (data: {
      barberId: string;
      startDate: string;
      endDate: string;
      commissionIds: string[];
      totalCommissions: number;
      totalDeductions: number;
      netAmount: number;
    }) =>
      fetchAPI("/commissions/close", {
        method: "POST",
        body: JSON.stringify(data),
      }),
    onSuccess: () => {
      queryClient.invalidateQueries({ predicate: (query) => 
        Array.isArray(query.queryKey) && query.queryKey[0] === "/commissions"
      });
      queryClient.invalidateQueries({ predicate: (query) => 
        Array.isArray(query.queryKey) && query.queryKey[0] === "/commission-payments"
      });
      queryClient.invalidateQueries({ queryKey: ["/cash-register/current"] });
    },
  });
}

export function useCommissionPayments(barberId?: string) {
  const params = new URLSearchParams();
  if (barberId) params.append("barberId", barberId);

  return useQuery({
    queryKey: ["/commission-payments", barberId],
    queryFn: () => fetchAPI(`/commission-payments?${params.toString()}`),
    refetchInterval: 30000,
  });
}

export function useBarberPurchases(startDate?: string, endDate?: string, barberId?: string) {
  const params = new URLSearchParams();
  if (startDate) params.append("startDate", startDate);
  if (endDate) params.append("endDate", endDate);
  if (barberId) params.append("barberId", barberId);

  return useQuery({
    queryKey: ["/barber-purchases", startDate, endDate, barberId],
    queryFn: () => fetchAPI(`/barber-purchases?${params.toString()}`),
    refetchInterval: 30000,
  });
}

export function useDashboardStats() {
  return useQuery({
    queryKey: ["/dashboard/stats"],
    queryFn: () => fetchAPI("/dashboard/stats"),
  });
}

export function useClientPackages(clientId?: string) {
  return useQuery({
    queryKey: ["/client-packages", clientId],
    queryFn: () => fetchAPI(clientId ? `/client-packages?clientId=${clientId}` : "/client-packages"),
  });
}

export function useCreateClientPackage() {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: (data: { clientId: string; packageId: string }) =>
      fetchAPI("/client-packages", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(data),
      }),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["/client-packages"] });
      queryClient.invalidateQueries({ queryKey: ["/packages/alerts"] });
    },
  });
}

export function useClientPackageUse() {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: (id: string) =>
      fetchAPI(`/client-packages/${id}/use`, {
        method: "PATCH",
      }),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["/client-packages"] });
      queryClient.invalidateQueries({ queryKey: ["/packages/alerts"] });
    },
  });
}

export function usePackageAlerts() {
  return useQuery({
    queryKey: ["/packages/alerts"],
    queryFn: () => fetchAPI("/packages/alerts"),
  });
}

// ============ FIXED EXPENSES (Despesas Fixas) ============

export function useFixedExpenses() {
  return useQuery({
    queryKey: ["/fixed-expenses"],
    queryFn: () => fetchAPI("/fixed-expenses"),
  });
}

export function useCreateFixedExpense() {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: (data: any) =>
      fetchAPI("/fixed-expenses", {
        method: "POST",
        body: JSON.stringify(data),
      }),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["/fixed-expenses"] });
      queryClient.invalidateQueries({ queryKey: ["/reports/dre"] });
    },
  });
}

export function useUpdateFixedExpense() {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: ({ id, ...data }: any) =>
      fetchAPI(`/fixed-expenses/${id}`, {
        method: "PUT",
        body: JSON.stringify(data),
      }),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["/fixed-expenses"] });
      queryClient.invalidateQueries({ queryKey: ["/reports/dre"] });
    },
  });
}

export function useDeleteFixedExpense() {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: (id: string) =>
      fetchAPI(`/fixed-expenses/${id}`, {
        method: "DELETE",
      }),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["/fixed-expenses"] });
      queryClient.invalidateQueries({ queryKey: ["/reports/dre"] });
    },
  });
}

// ============ DRE REPORT ============

export function useDREReport(startDate?: string, endDate?: string) {
  const params = new URLSearchParams();
  if (startDate) params.append("startDate", startDate);
  if (endDate) params.append("endDate", endDate);
  
  return useQuery({
    queryKey: ["/reports/dre", startDate, endDate],
    queryFn: () => fetchAPI(`/reports/dre?${params.toString()}`),
  });
}
