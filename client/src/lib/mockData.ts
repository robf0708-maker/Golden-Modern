import { format, addHours, startOfToday, subDays } from "date-fns";

export const mockBarbers = [
  { id: 1, name: "Lucas Silva", avatar: "https://i.pravatar.cc/150?u=1", role: "Master Barber" },
  { id: 2, name: "Pedro Santos", avatar: "https://i.pravatar.cc/150?u=2", role: "Barber" },
  { id: 3, name: "João Costa", avatar: "https://i.pravatar.cc/150?u=3", role: "Barber" },
];

export const mockServices = [
  { id: 1, name: "Corte Cabelo", price: 50.00, duration: 30, category: "Cabelo" },
  { id: 2, name: "Barba", price: 35.00, duration: 30, category: "Barba" },
  { id: 3, name: "Corte + Barba", price: 80.00, duration: 60, category: "Combo" },
  { id: 4, name: "Sobrancelha", price: 15.00, duration: 15, category: "Face" },
  { id: 5, name: "Pezinho", price: 10.00, duration: 15, category: "Cabelo" },
  { id: 6, name: "Hidratação", price: 40.00, duration: 30, category: "Tratamento" },
];

export const mockProducts = [
  { id: 1, name: "Pomada Matte", price: 35.00, stock: 12, category: "Estilização" },
  { id: 2, name: "Shampoo 3 em 1", price: 45.00, stock: 8, category: "Limpeza" },
  { id: 3, name: "Óleo para Barba", price: 30.00, stock: 15, category: "Barba" },
  { id: 4, name: "Gel Fixador", price: 25.00, stock: 20, category: "Estilização" },
];

export const mockClients = [
  { id: 1, name: "Carlos Oliveira", phone: "(11) 99999-1234", lastVisit: subDays(new Date(), 5), totalSpent: 450.00, status: "active" },
  { id: 2, name: "Rafael Souza", phone: "(11) 98888-5678", lastVisit: subDays(new Date(), 45), totalSpent: 120.00, status: "inactive" },
  { id: 3, name: "Bruno Lima", phone: "(11) 97777-9012", lastVisit: subDays(new Date(), 2), totalSpent: 890.00, status: "recurrent" },
  { id: 4, name: "Daniel Ferreira", phone: "(11) 96666-3456", lastVisit: subDays(new Date(), 120), totalSpent: 50.00, status: "lost" },
];

export const mockAppointments = [
  {
    id: 1,
    barberId: 1,
    clientId: 3,
    serviceId: 3,
    date: addHours(startOfToday(), 10), // Today 10:00
    status: "confirmed",
  },
  {
    id: 2,
    barberId: 2,
    clientId: 1,
    serviceId: 1,
    date: addHours(startOfToday(), 14), // Today 14:00
    status: "pending",
  },
];

export const mockKPIs = {
  todayAppointments: 12,
  todayRevenue: 850.00,
  activeClients: 145,
  pendingCommissions: 320.00,
};
