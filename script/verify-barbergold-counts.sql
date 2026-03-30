-- Contagens pós-restore (BarberGold / Golden-Modern)
SELECT 'barbershops' AS t, count(*)::int AS n FROM barbershops
UNION ALL SELECT 'users', count(*)::int FROM users
UNION ALL SELECT 'barbers', count(*)::int FROM barbers
UNION ALL SELECT 'clients', count(*)::int FROM clients
UNION ALL SELECT 'services', count(*)::int FROM services
UNION ALL SELECT 'appointments', count(*)::int FROM appointments
UNION ALL SELECT 'comandas', count(*)::int FROM comandas
UNION ALL SELECT 'comanda_items', count(*)::int FROM comanda_items;
