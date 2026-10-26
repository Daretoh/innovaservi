-- Fecha de vencimiento del contrato del trabajador (se copia de Buk a mano).
-- Vacío = contrato indefinido o trabajador spot. Inicio y Alertas avisan 30 días antes.
alter table public.trabajadores add column if not exists contrato_vence date;
