"use server";

import { revalidatePath } from "next/cache";
import { createSupabaseServerClient } from "@/lib/supabase/server";
import { gerarConteudoPedagogico } from "@/lib/ai/generate";
import type { TipoMaterial } from "@/lib/ai/prompts";
import mammoth from "mammoth";

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
  nome_escola: string | null;
  nome_professor: string | null;
  instrucoes_fixas: string | null;
  colunas_layout: number;
  layout_compacto: boolean;
  familia_fonte: string;
  tamanho_fonte: number;
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
    supabase.from("pre_promptos").select("id,nome,descricao,ativo,tipos_artefato,nome_escola,nome_professor,instrucoes_fixas,colunas_layout,layout_compacto,familia_fonte,tamanho_fonte").order("criado_em"),
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
    .select("id,nome,descricao,ativo,tipos_artefato,nome_escola,nome_professor,instrucoes_fixas,colunas_layout,layout_compacto,familia_fonte,tamanho_fonte")
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

export type MaterialGerado = {
  id: string;
  titulo: string;
  tipo: TipoMaterial;
  conteudo: Record<string, unknown>;
};

function textoDoMaterial(value: unknown, heading = ""): string {
  if (Array.isArray(value)) {
    return value.map((item, index) => textoDoMaterial(item, `${heading}${heading ? " " : ""}${index + 1}`)).join("\n\n");
  }
  if (value && typeof value === "object") {
    return Object.entries(value as Record<string, unknown>)
      .map(([key, item]) => textoDoMaterial(item, key.replaceAll(/([A-Z])/g, " $1")))
      .join("\n\n");
  }
  const content = typeof value === "string" ? value : value == null ? "" : String(value);
  return heading ? `${heading.charAt(0).toUpperCase()}${heading.slice(1)}\n${content}` : content;
}

export async function gerarMaterialComIA(input: {
  materiaId: string;
  turmaId: string | null;
  topicoId: string;
  prePromptoId: string | null;
  tipo: TipoMaterial;
}): Promise<ActionResult<MaterialGerado>> {
  if (
    !isNonEmptyString(input?.materiaId) ||
    !isNonEmptyString(input.topicoId) ||
    !["roteiro_aula", "atividade", "prova"].includes(input.tipo)
  ) {
    return { data: null, error: "Selecione a matéria, o tópico e o tipo de material." };
  }
  const { supabase, user } = await usuarioAutenticado();

  const { data: topic, error: topicError } = await supabase
    .from("topicos_ementa")
    .select("id,materia_id,ementa_id,titulo,descricao,habilidades")
    .eq("id", input.topicoId)
    .eq("materia_id", input.materiaId)
    .eq("professor_id", user.id)
    .single();
  if (topicError) return { data: null, error: errorMessage(topicError) };

  const [subjectResult, syllabusResult, profileResult] = await Promise.all([
    supabase.from("materias").select("id,nome,ano_letivo").eq("id", topic.materia_id).eq("professor_id", user.id).single(),
    supabase.from("ementas").select("id,titulo,texto_extraido,periodo,caminho_arquivo,tipo_mime,nome_arquivo").eq("id", topic.ementa_id).eq("professor_id", user.id).single(),
    supabase.from("professores").select("nome_completo,nome_instituicao").eq("id", user.id).single(),
  ]);
  const contextError = subjectResult.error ?? syllabusResult.error ?? profileResult.error;
  if (contextError) return { data: null, error: errorMessage(contextError) };
  if (!subjectResult.data || !syllabusResult.data || !profileResult.data) {
    return { data: null, error: "Não foi possível montar o contexto completo para a geração." };
  }
  const subject = subjectResult.data;
  const syllabus = syllabusResult.data;
  const profile = profileResult.data;

  let trechoDocumento = syllabus.texto_extraido?.slice(0, 16000) ?? "";
  let documentoPdf: { mimeType: "application/pdf"; data: string } | undefined;
  if (!trechoDocumento && syllabus.caminho_arquivo) {
    const { data: sourceFile, error } = await supabase.storage
      .from("documentos-base")
      .download(syllabus.caminho_arquivo);
    if (error) return { data: null, error: `Não foi possível ler o documento-base: ${error.message}` };
    if (sourceFile.size > 20 * 1024 * 1024) {
      return { data: null, error: "Para usar o documento como contexto da IA, o arquivo deve ter no máximo 20 MB." };
    }

    const sourceBytes = Buffer.from(await sourceFile.arrayBuffer());
    if (syllabus.tipo_mime === "application/pdf") {
      if (sourceBytes.subarray(0, 5).toString("ascii") !== "%PDF-") {
        return { data: null, error: "O arquivo armazenado não parece ser um PDF válido." };
      }
      documentoPdf = { mimeType: "application/pdf", data: sourceBytes.toString("base64") };
    } else if (syllabus.tipo_mime === "text/plain") {
      trechoDocumento = new TextDecoder().decode(sourceBytes).slice(0, 16000);
    } else if (syllabus.tipo_mime === "application/vnd.openxmlformats-officedocument.wordprocessingml.document") {
      try {
        const extracted = await mammoth.extractRawText({ buffer: sourceBytes });
        trechoDocumento = extracted.value.slice(0, 16000);
      } catch {
        return { data: null, error: "Não foi possível extrair o texto do DOCX. Verifique se o arquivo está íntegro." };
      }
      if (!trechoDocumento.trim()) {
        return { data: null, error: "O DOCX não contém texto legível para usar como referência da IA." };
      }
    } else if (syllabus.tipo_mime === "application/msword") {
      return { data: null, error: "Para usar o documento na geração por IA, salve o arquivo DOC como DOCX ou PDF." };
    }
  }

  let classroomName = "";
  if (input.turmaId) {
    const { data: classroom, error } = await supabase
      .from("turmas")
      .select("id,nome,semestre,ano_letivo,turno")
      .eq("id", input.turmaId)
      .eq("materia_id", topic.materia_id)
      .eq("professor_id", user.id)
      .single();
    if (error) return { data: null, error: errorMessage(error) };
    classroomName = [classroom.nome, classroom.semestre ? `${classroom.semestre}º semestre` : null, classroom.turno, classroom.ano_letivo]
      .filter(Boolean)
      .join(" · ");
  }

  let preset: {
    id: string;
    nome: string;
    descricao: string | null;
    nome_escola: string | null;
    nome_professor: string | null;
    instrucoes_fixas: string | null;
    colunas_layout: number;
    layout_compacto: boolean;
    familia_fonte: string;
    tamanho_fonte: number;
  } | null = null;
  if (input.prePromptoId) {
    const { data, error } = await supabase
      .from("pre_promptos")
      .select("id,nome,descricao,nome_escola,nome_professor,instrucoes_fixas,colunas_layout,layout_compacto,familia_fonte,tamanho_fonte,ativo,tipos_artefato")
      .eq("id", input.prePromptoId)
      .eq("professor_id", user.id)
      .single();
    if (error) return { data: null, error: errorMessage(error) };
    if (!data.ativo || !data.tipos_artefato.includes(input.tipo)) {
      return { data: null, error: "O pré-prompto escolhido está inativo ou não se aplica a este material." };
    }
    preset = data;
  }

  let resultado: Awaited<ReturnType<typeof gerarConteudoPedagogico>>;
  try {
    resultado = await gerarConteudoPedagogico(input.tipo, {
      professor: preset?.nome_professor || profile.nome_completo,
      instituicao: preset?.nome_escola || profile.nome_instituicao || "",
      materia: `${subject.nome} (${subject.ano_letivo})`,
      turma: classroomName,
      topico: topic.titulo,
      descricaoTopico: topic.descricao ?? "",
      habilidades: Array.isArray(topic.habilidades)
        ? topic.habilidades.filter((item): item is string => typeof item === "string")
        : [],
      ementa: [syllabus.titulo, syllabus.periodo].filter(Boolean).join(" · "),
      trechoDocumento,
      documentoPdfAnexado: Boolean(documentoPdf),
      instrucoesProfessor: preset?.instrucoes_fixas ?? "",
      layout: preset
        ? `${preset.colunas_layout} coluna(s), ${preset.layout_compacto ? "compacto" : "padrão"}, fonte ${preset.familia_fonte} ${preset.tamanho_fonte}pt`
        : "padrão legível, adequado para impressão escolar",
    }, documentoPdf);
  } catch (error) {
    if (error instanceof Error && error.message === "IA_KEY_MISSING") {
      return { data: null, error: "A IA ainda não foi configurada. Adicione GEMINI_API_KEY às variáveis de ambiente do servidor e reinicie o app." };
    }
    if (error instanceof Error && error.message === "IA_AUTH_FAILED") {
      return { data: null, error: "O Gemini recusou a chave de API. Confira GEMINI_API_KEY no ambiente do servidor e reinicie o app." };
    }
    if (error instanceof Error && error.message === "IA_QUOTA_EXCEEDED") {
      return { data: null, error: "A cota do Gemini foi excedida ou o faturamento não está habilitado. Confira o uso e os limites no Google AI Studio." };
    }
    if (error instanceof Error && error.message === "IA_MODEL_NOT_FOUND") {
      return { data: null, error: "Nenhum dos modelos de geração configurados foi encontrado na API de interações do Gemini. Confira GEMINI_MODEL no ambiente do servidor." };
    }
    if (error instanceof Error && error.message === "IA_BAD_REQUEST") {
      return { data: null, error: "O Gemini rejeitou a solicitação. Verifique se o modelo aceita JSON estruturado e PDFs, e se o documento não é grande demais." };
    }
    if (error instanceof Error && error.message === "IA_PROVIDER_UNAVAILABLE") {
      return { data: null, error: "Os modelos Gemini estão temporariamente indisponíveis. O sistema tentou o modelo principal e uma alternativa; aguarde um instante e tente novamente." };
    }
    if (error instanceof Error && error.message === "IA_CONNECTION_FAILED") {
      return { data: null, error: "Não foi possível conectar ao Gemini. Verifique a conexão do servidor e tente novamente." };
    }
    if (error instanceof Error && error.message === "IA_EMPTY_RESPONSE") {
      return { data: null, error: "O Gemini não gerou conteúdo para esta solicitação. Revise o tópico ou documento-base e tente novamente." };
    }
    if (error instanceof Error && error.message === "IA_INVALID_JSON") {
      return { data: null, error: "A IA retornou uma resposta fora do formato esperado. Tente gerar novamente." };
    }
    if (error instanceof Error && error.message.startsWith("IA_INVALID_CONTENT:")) {
      return { data: null, error: `A resposta não passou pela validação pedagógica: ${error.message.slice("IA_INVALID_CONTENT:".length)}` };
    }
    throw error;
  }

  const conteudo = resultado.conteudo;
  const titulo = typeof conteudo.titulo === "string" ? conteudo.titulo : "Material didático";
  const { data: artifact, error: artifactError } = await supabase
    .from("artefatos")
    .insert({
      professor_id: user.id,
      materia_id: input.materiaId,
      turma_id: input.turmaId,
      ementa_id: topic.ementa_id,
      pre_prompto_id: preset?.id ?? null,
      tipo: input.tipo,
      situacao: "gerado",
      titulo,
      conteudo,
      texto_formatado: textoDoMaterial(conteudo),
      gabarito: conteudo.gabaritoComentado ?? null,
      rubrica: conteudo.rubrica ?? null,
      snapshot_pre_prompto: preset
        ? {
            nome: preset.nome,
            descricao: preset.descricao,
            nome_escola: preset.nome_escola,
            nome_professor: preset.nome_professor,
            instrucoes_fixas: preset.instrucoes_fixas,
            colunas_layout: preset.colunas_layout,
            layout_compacto: preset.layout_compacto,
            familia_fonte: preset.familia_fonte,
            tamanho_fonte: preset.tamanho_fonte,
          }
        : {},
      versao: null,
      modelo_geracao: resultado.modelo,
      metadados_geracao: { provedor: "Google Gemini", ...resultado.uso },
      gerado_em: new Date().toISOString(),
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
  return { data: { id: artifact.id, titulo, tipo: input.tipo, conteudo }, error: null };
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
