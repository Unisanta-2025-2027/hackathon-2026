alter table public.pre_promptos
  add column materia_id uuid;

alter table public.pre_promptos
  add constraint pre_promptos_materia_professor_fk
  foreign key (materia_id, professor_id)
  references public.materias (id, professor_id)
  on delete cascade;

create index pre_promptos_materia_professor_idx
  on public.pre_promptos (materia_id, professor_id)
  where materia_id is not null;
