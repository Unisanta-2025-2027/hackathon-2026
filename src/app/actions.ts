"use server";

import { revalidatePath } from "next/cache";
import { createSupabaseServerClient } from "@/lib/supabase/server";

export type ActionResult<T = undefined> =
  | { data: T; error: null }
  | { data: null; error: string };

export type SubjectRecord = { id: string; nome: string; ano_letivo: number };
export type ClassRecord = {
  id: string;
  materia_id: string;
  nome: string;
  turno: string | null;
  semestre: number | null;
  ano_letivo: number;
};
export type SyllabusRecord = {
  id: string;
  materia_id: string;
  titulo: string;
  nome_arquivo: string | null;
  criado_em: string;
};
export type TopicRecord = {
  id: string;
  ementa_id: string;
  materia_id: string;
  titulo: string;
  descricao: string | null;
  situacao: "pendente" | "planejado" | "praticado" | "avaliado";
  roteiro: "Feito" | "Pendente" | "Não iniciado";
  atividade: "Feito" | "Pendente" | "Não iniciado";
  prova: "Feito" | "Pendente" | "Não iniciado";
};
export type TemplateRecord = {
  id: string;
  nome: string;
  descricao: string | null;
  ativo: boolean;
  tipos_artefato: ("roteiro_aula" | "atividade" | "prova")[];
};
export type AppData = {
  professor: { id: string; nome_completo: string };
  materias: SubjectRecord[];
  turmas: ClassRecord[];
  ementas: SyllabusRecord[];
  topicos: TopicRecord[];
  prePromptos: TemplateRecord[];
  provas: { id: string; titulo: string }[];
};

function errorMessage(error: { message: string }) {
  return error.message;
}

function isNonEmptyString(value: unknown): value is string {
  return typeof value === "string" && value.trim().length > 0;
}

export async function carregarDados(): Promise<ActionResult<AppData | null>> {
  const supabase = await createSupabaseServerClient();
  const { data: { user }, error: authError } = await supabase.auth.getUser();
  if (authError) return { data: null, error: errorMessage(authError) };
  if (!user) return { data: null, error: null };

  const [
    profileResult,
    subjectsResult,
    classesResult,
    syllabiResult,
    topicsResult,
    templatesResult,
    artifactsResult,
    linksResult,
  ] = await Promise.all([
    supabase.from("professores").select("id,nome_completo").eq("id", user.id).single(),
    supabase.from("materias").select("id,nome,ano_letivo").order("nome"),
    supabase.from("turmas").select("id,materia_id,nome,turno,semestre,ano_letivo").order("nome"),
    supabase.from("ementas").select("id,materia_id,titulo,nome_arquivo,criado_em").order("criado_em", { ascending: false }),
    supabase.from("topicos_ementa").select("id,ementa_id,materia_id,titulo,descricao,situacao,ordem").order("ordem"),
    supabase.from("pre_promptos").select("id,nome,descricao,ativo,tipos_artefato").order("criado_em"),
    supabase.from("artefatos").select("id,titulo,tipo,situacao"),
    supabase.from("artefatos_topicos").select("artefato_id,topico_id"),
  ]);

  const firstError = [
    profileResult.error,
    subjectsResult.error,
    classesResult.error,
    syllabiResult.error,
    topicsResult.error,
    templatesResult.error,
    artifactsResult.error,
    linksResult.error,
  ].find(Boolean);
  if (firstError) return { data: null, error: errorMessage(firstError) };
  if (!profileResult.data) return { data: null, error: "Não foi possível carregar o perfil do professor." };

  const artifactById = new Map(
    (artifactsResult.data ?? []).map((artifact) => [artifact.id, artifact]),
  );
  const progressByTopic = new Map<string, Partial<Record<"roteiro" | "atividade" | "prova", "Feito" | "Pendente">>>();

  for (const link of linksResult.data ?? []) {
    const artifact = artifactById.get(link.artefato_id);
    if (!artifact) continue;
    const key: "roteiro" | "atividade" | "prova" =
      artifact.tipo === "roteiro_aula"
        ? "roteiro"
        : artifact.tipo === "atividade"
          ? "atividade"
          : "prova";
    const progress = progressByTopic.get(link.topico_id) ?? {};
    progress[key] = artifact.situacao === "rascunho" ? "Pendente" : "Feito";
    progressByTopic.set(link.topico_id, progress);
  }

  return {
    data: {
      professor: profileResult.data,
      materias: subjectsResult.data ?? [],
      turmas: classesResult.data ?? [],
      ementas: syllabiResult.data ?? [],
      topicos: (topicsResult.data ?? []).map((topic) => {
        const progress = progressByTopic.get(topic.id);
        return {
          id: topic.id,
          ementa_id: topic.ementa_id,
          materia_id: topic.materia_id,
          titulo: topic.titulo,
          descricao: topic.descricao,
          situacao: topic.situacao,
          roteiro: progress?.roteiro ?? "Não iniciado",
          atividade: progress?.atividade ?? "Não iniciado",
          prova: progress?.prova ?? "Não iniciado",
        };
      }),
      prePromptos: templatesResult.data ?? [],
      provas: (artifactsResult.data ?? [])
        .filter((artifact) => artifact.tipo === "prova")
        .map(({ id, titulo }) => ({ id, titulo })),
    },
    error: null,
  };
}

export async function entrar(formData: FormData): Promise<ActionResult> {
  const email = formData.get("email");
  const password = formData.get("password");
  if (!isNonEmptyString(email) || !isNonEmptyString(password)) {
    return { data: null, error: "Informe o e-mail e a senha." };
  }

  const supabase = await createSupabaseServerClient();
  const { error } = await supabase.auth.signInWithPassword({
    email: email.trim(),
    password,
  });
  if (error) return { data: null, error: errorMessage(error) };

  revalidatePath("/", "layout");
  return { data: undefined, error: null };
}

export async function cadastrar(formData: FormData): Promise<ActionResult<{ confirmationRequired: boolean }>> {
  const email = formData.get("email");
  const password = formData.get("password");
  const name = formData.get("nome");
  if (!isNonEmptyString(email) || !isNonEmptyString(password) || !isNonEmptyString(name)) {
    return { data: null, error: "Preencha nome, e-mail e senha." };
  }
  if (password.length < 8) return { data: null, error: "A senha deve ter pelo menos 8 caracteres." };

  const supabase = await createSupabaseServerClient();
  const { data, error } = await supabase.auth.signUp({
    email: email.trim(),
    password,
    options: { data: { nome_completo: name.trim() } },
  });
  if (error) return { data: null, error: errorMessage(error) };

  if (data.session) revalidatePath("/", "layout");
  return { data: { confirmationRequired: !data.session }, error: null };
}

export async function sair(): Promise<ActionResult> {
  const supabase = await createSupabaseServerClient();
  const { error } = await supabase.auth.signOut();
  if (error) return { data: null, error: errorMessage(error) };
  revalidatePath("/", "layout");
  return { data: undefined, error: null };
}

async function usuarioAutenticado() {
  const supabase = await createSupabaseServerClient();
  const { data: { user }, error } = await supabase.auth.getUser();
  if (error) throw new Error(error.message);
  if (!user) throw new Error("Sua sessão expirou. Entre novamente para continuar.");
  return { supabase, user };
}

export async function criarMateria(input: { nome: string; anoLetivo: number }): Promise<ActionResult<SubjectRecord>> {
  if (!isNonEmptyString(input?.nome) || !Number.isInteger(input.anoLetivo) || input.anoLetivo < 2000 || input.anoLetivo > 2200) {
    return { data: null, error: "Informe o nome da matéria e um ano letivo válido." };
  }
  const { supabase, user } = await usuarioAutenticado();
  const { data, error } = await supabase
    .from("materias")
    .insert({ professor_id: user.id, nome: input.nome.trim(), ano_letivo: input.anoLetivo })
    .select("id,nome,ano_letivo")
    .single();
  if (error) return { data: null, error: errorMessage(error) };
  revalidatePath("/");
  return { data, error: null };
}

export async function criarTurma(input: {
  materiaId: string;
  nome: string;
  semestre: number | null;
  turno: string | null;
}): Promise<ActionResult<ClassRecord>> {
  if (!isNonEmptyString(input?.materiaId) || !isNonEmptyString(input?.nome)) {
    return { data: null, error: "Selecione a matéria e informe o nome da turma." };
  }
  if (input.semestre !== null && (!Number.isInteger(input.semestre) || input.semestre < 1 || input.semestre > 12)) {
    return { data: null, error: "O semestre deve estar entre 1 e 12." };
  }
  const { supabase, user } = await usuarioAutenticado();
  const { data, error } = await supabase
    .from("turmas")
    .insert({
      professor_id: user.id,
      materia_id: input.materiaId,
      nome: input.nome.trim(),
      semestre: input.semestre,
      turno: input.turno?.trim() || null,
    })
    .select("id,materia_id,nome,turno,semestre,ano_letivo")
    .single();
  if (error) return { data: null, error: errorMessage(error) };
  revalidatePath("/");
  return { data, error: null };
}

const maxUploadBytes = 25 * 1024 * 1024;
const allowedSourceTypes = new Set([
  "application/pdf",
  "application/msword",
  "application/vnd.openxmlformats-officedocument.wordprocessingml.document",
  "text/plain",
]);

export async function enviarEmenta(formData: FormData): Promise<ActionResult<SyllabusRecord>> {
  const file = formData.get("arquivo");
  const subjectId = formData.get("materiaId");
  const titleValue = formData.get("titulo");
  const periodValue = formData.get("periodo");
  const academicYearValue = Number(formData.get("anoLetivo"));
  if (!(file instanceof File) || file.size === 0 || !isNonEmptyString(subjectId)) {
    return { data: null, error: "Selecione uma matéria e um documento válido." };
  }
  const extension = file.name.split(".").pop()?.toLowerCase();
  const extensionTypes: Record<string, string> = {
    pdf: "application/pdf",
    doc: "application/msword",
    docx: "application/vnd.openxmlformats-officedocument.wordprocessingml.document",
    txt: "text/plain",
  };
  const mimeType = extensionTypes[extension ?? ""];
  if (!mimeType || !allowedSourceTypes.has(mimeType)) {
    return { data: null, error: "Envie um arquivo PDF, DOC, DOCX ou TXT." };
  }
  if (file.size > maxUploadBytes) return { data: null, error: "O arquivo deve ter no máximo 25 MB." };
  if (!Number.isInteger(academicYearValue) || academicYearValue < 2000 || academicYearValue > 2200) {
    return { data: null, error: "Informe um ano letivo válido." };
  }

  const { supabase, user } = await usuarioAutenticado();
  const storagePath = `${user.id}/${crypto.randomUUID()}.${extension}`;
  const { error: uploadError } = await supabase.storage
    .from("documentos-base")
    .upload(storagePath, file, { contentType: mimeType, upsert: false });
  if (uploadError) return { data: null, error: errorMessage(uploadError) };

  const { data, error } = await supabase
    .from("ementas")
    .insert({
      professor_id: user.id,
      materia_id: subjectId,
      titulo: isNonEmptyString(titleValue) ? titleValue.trim() : file.name,
      periodo: isNonEmptyString(periodValue) ? periodValue.trim() : null,
      ano_letivo: academicYearValue,
      caminho_arquivo: storagePath,
      nome_arquivo: file.name,
      tipo_mime: mimeType,
      tamanho_arquivo_bytes: file.size,
      enviado_em: new Date().toISOString(),
    })
    .select("id,materia_id,titulo,nome_arquivo,criado_em")
    .single();
  if (error) {
    const { error: cleanupError } = await supabase.storage.from("documentos-base").remove([storagePath]);
    if (cleanupError) {
      return { data: null, error: `${error.message} O upload temporário também não pôde ser removido: ${cleanupError.message}` };
    }
    return { data: null, error: errorMessage(error) };
  }
  revalidatePath("/");
  return { data, error: null };
}

export async function criarTopico(input: {
  ementaId: string;
  titulo: string;
  descricao: string;
}): Promise<ActionResult> {
  if (!isNonEmptyString(input?.ementaId) || !isNonEmptyString(input?.titulo)) {
    return { data: null, error: "Selecione uma ementa e informe o tópico." };
  }
  const { supabase, user } = await usuarioAutenticado();
  const { data: ementa, error: syllabusError } = await supabase
    .from("ementas")
    .select("id,materia_id")
    .eq("id", input.ementaId)
    .eq("professor_id", user.id)
    .single();
  if (syllabusError) return { data: null, error: errorMessage(syllabusError) };

  const { data: lastTopic, error: orderError } = await supabase
    .from("topicos_ementa")
    .select("ordem")
    .eq("ementa_id", ementa.id)
    .order("ordem", { ascending: false })
    .limit(1)
    .maybeSingle();
  if (orderError) return { data: null, error: errorMessage(orderError) };

  const { error } = await supabase.from("topicos_ementa").insert({
    professor_id: user.id,
    ementa_id: ementa.id,
    materia_id: ementa.materia_id,
    ordem: (lastTopic?.ordem ?? 0) + 1,
    titulo: input.titulo.trim(),
    descricao: input.descricao.trim() || null,
  });
  if (error) return { data: null, error: errorMessage(error) };
  revalidatePath("/");
  return { data: undefined, error: null };
}

export async function atualizarSituacaoTopico(input: {
  topicoId: string;
  situacao: "pendente" | "planejado" | "praticado" | "avaliado";
}): Promise<ActionResult> {
  if (!isNonEmptyString(input?.topicoId) || !["pendente", "planejado", "praticado", "avaliado"].includes(input.situacao)) {
    return { data: null, error: "Selecione um status válido para o tópico." };
  }
  const { supabase, user } = await usuarioAutenticado();
  const { error } = await supabase
    .from("topicos_ementa")
    .update({ situacao: input.situacao })
    .eq("id", input.topicoId)
    .eq("professor_id", user.id);
  if (error) return { data: null, error: errorMessage(error) };
  revalidatePath("/");
  return { data: undefined, error: null };
}

export async function criarPrePrompto(input: { nome: string }): Promise<ActionResult<TemplateRecord>> {
  if (!isNonEmptyString(input?.nome) || input.nome.trim().length > 120) {
    return { data: null, error: "Informe um nome de até 120 caracteres para o pré-prompto." };
  }
  const { supabase, user } = await usuarioAutenticado();
  const { data, error } = await supabase
    .from("pre_promptos")
    .insert({
      professor_id: user.id,
      nome: input.nome.trim(),
      tipos_artefato: ["roteiro_aula", "atividade", "prova"],
    })
    .select("id,nome,descricao,ativo,tipos_artefato")
    .single();
  if (error) return { data: null, error: errorMessage(error) };
  revalidatePath("/");
  return { data, error: null };
}

export async function alterarPrePrompto(input: { id: string; ativo: boolean }): Promise<ActionResult> {
  if (!isNonEmptyString(input?.id) || typeof input.ativo !== "boolean") {
    return { data: null, error: "O pré-prompto selecionado é inválido." };
  }
  const { supabase, user } = await usuarioAutenticado();
  const { error } = await supabase
    .from("pre_promptos")
    .update({ ativo: input.ativo })
    .eq("id", input.id)
    .eq("professor_id", user.id);
  if (error) return { data: null, error: errorMessage(error) };
  revalidatePath("/");
  return { data: undefined, error: null };
}

export async function criarArtefato(input: {
  materiaId: string;
  turmaId: string | null;
  ementaId: string;
  topicoId: string;
  prePromptoId: string | null;
  snapshotPrePrompto: Record<string, string>;
  tipo: "roteiro_aula" | "atividade" | "prova";
  titulo: string;
  conteudo: Record<string, string>;
}): Promise<ActionResult> {
  if (
    !isNonEmptyString(input?.materiaId) ||
    !isNonEmptyString(input.ementaId) ||
    !isNonEmptyString(input.topicoId) ||
    !isNonEmptyString(input.titulo) ||
    !["roteiro_aula", "atividade", "prova"].includes(input.tipo)
  ) {
    return { data: null, error: "Complete os dados do material antes de salvar." };
  }
  const { supabase, user } = await usuarioAutenticado();
  const { data: artifact, error: artifactError } = await supabase
    .from("artefatos")
    .insert({
      professor_id: user.id,
      materia_id: input.materiaId,
      turma_id: input.turmaId,
      ementa_id: input.ementaId,
      pre_prompto_id: input.prePromptoId,
      tipo: input.tipo,
      situacao: "rascunho",
      titulo: input.titulo.trim(),
      conteudo: input.conteudo,
      texto_formatado: Object.values(input.conteudo).join("\n\n"),
      snapshot_pre_prompto: input.snapshotPrePrompto,
    })
    .select("id")
    .single();
  if (artifactError) return { data: null, error: errorMessage(artifactError) };

  const { error: linkError } = await supabase.from("artefatos_topicos").insert({
    professor_id: user.id,
    artefato_id: artifact.id,
    topico_id: input.topicoId,
    materia_id: input.materiaId,
  });
  if (linkError) {
    const { error: cleanupError } = await supabase
      .from("artefatos")
      .delete()
      .eq("id", artifact.id)
      .eq("professor_id", user.id);
    if (cleanupError) {
      return { data: null, error: `${linkError.message} O artefato criado também não pôde ser removido: ${cleanupError.message}` };
    }
    return { data: null, error: errorMessage(linkError) };
  }
  revalidatePath("/");
  return { data: undefined, error: null };
}

const allowedResponseTypes = new Set([
  ...allowedSourceTypes,
  "image/jpeg",
  "image/png",
]);

export async function criarCorrecao(formData: FormData): Promise<ActionResult> {
  const artifactId = formData.get("artefatoId");
  const studentLabel = formData.get("identificacaoAluno");
  const responseText = formData.get("textoResposta");
  const file = formData.get("arquivo");
  if (!isNonEmptyString(artifactId)) return { data: null, error: "Selecione a prova que deseja corrigir." };
  const response = isNonEmptyString(responseText) ? responseText.trim() : null;
  const hasFile = file instanceof File && file.size > 0;
  if (!response && !hasFile) return { data: null, error: "Informe as respostas ou envie um arquivo." };

  const { supabase, user } = await usuarioAutenticado();
  let storagePath: string | null = null;
  if (hasFile && file instanceof File) {
    if (file.size > maxUploadBytes) return { data: null, error: "O arquivo deve ter no máximo 25 MB." };
    if (!allowedResponseTypes.has(file.type)) {
      return { data: null, error: "Envie um PDF, DOC, DOCX, TXT, JPG ou PNG." };
    }
    const extension = file.name.split(".").pop()?.toLowerCase() || "bin";
    storagePath = `${user.id}/${crypto.randomUUID()}.${extension}`;
    const { error: uploadError } = await supabase.storage
      .from("respostas-avaliacao")
      .upload(storagePath, file, { contentType: file.type, upsert: false });
    if (uploadError) return { data: null, error: errorMessage(uploadError) };
  }

  const { error } = await supabase.from("correcoes").insert({
    professor_id: user.id,
    artefato_id: artifactId,
    identificacao_aluno: isNonEmptyString(studentLabel) ? studentLabel.trim() : null,
    texto_resposta: response,
    caminho_resposta: storagePath,
  });
  if (error) {
    if (storagePath) {
      const { error: cleanupError } = await supabase.storage.from("respostas-avaliacao").remove([storagePath]);
      if (cleanupError) {
        return { data: null, error: `${error.message} O arquivo temporário também não pôde ser removido: ${cleanupError.message}` };
      }
    }
    return { data: null, error: errorMessage(error) };
  }
  revalidatePath("/");
  return { data: undefined, error: null };
}
