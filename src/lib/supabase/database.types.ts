type Json = string | number | boolean | null | Json[] | { [key: string]: Json | undefined };

type Table<Row, RequiredInsert extends keyof Row> = {
  Row: Row;
  Insert: Partial<Row> & Pick<Row, RequiredInsert>;
  Update: Partial<Row>;
  Relationships: [];
};

export type Database = {
  public: {
    Tables: {
      professores: Table<{
        id: string;
        nome_completo: string;
        nome_instituicao: string | null;
        preferencias: Json;
        criado_em: string;
        atualizado_em: string;
      }, "id">;
      materias: Table<{
        id: string;
        professor_id: string;
        nome: string;
        ano_letivo: number;
        criado_em: string;
        atualizado_em: string;
      }, "professor_id" | "nome">;
      ementas: Table<{
        id: string;
        professor_id: string;
        materia_id: string;
        titulo: string;
        periodo: string | null;
        ano_letivo: number;
        caminho_arquivo: string | null;
        nome_arquivo: string | null;
        tipo_mime: string | null;
        tamanho_arquivo_bytes: number | null;
        texto_extraido: string | null;
        situacao_extracao: Database["public"]["Enums"]["situacao_extracao"];
        erro_extracao: string | null;
        enviado_em: string | null;
        criado_em: string;
        atualizado_em: string;
      }, "professor_id" | "materia_id" | "titulo">;
      topicos_ementa: Table<{
        id: string;
        professor_id: string;
        ementa_id: string;
        materia_id: string;
        ordem: number;
        titulo: string;
        descricao: string | null;
        habilidades: Json;
        situacao: Database["public"]["Enums"]["situacao_topico"];
        situacao_atualizada_em: string;
        criado_em: string;
        atualizado_em: string;
      }, "professor_id" | "ementa_id" | "materia_id" | "ordem" | "titulo">;
      pre_promptos: Table<{
        id: string;
        professor_id: string;
        materia_id: string | null;
        nome: string;
        descricao: string | null;
        nome_escola: string | null;
        nome_professor: string | null;
        instrucoes_fixas: string | null;
        colunas_layout: number;
        layout_compacto: boolean;
        familia_fonte: string;
        tamanho_fonte: number;
        tipos_artefato: Database["public"]["Enums"]["tipo_artefato"][];
        ativo: boolean;
        criado_em: string;
        atualizado_em: string;
      }, "professor_id" | "nome">;
      artefatos: Table<{
        id: string;
        professor_id: string;
        materia_id: string;
        ementa_id: string | null;
        pre_prompto_id: string | null;
        tipo: Database["public"]["Enums"]["tipo_artefato"];
        situacao: Database["public"]["Enums"]["situacao_artefato"];
        titulo: string;
        conteudo: Json;
        texto_formatado: string | null;
        gabarito: Json | null;
        rubrica: Json | null;
        snapshot_pre_prompto: Json;
        versao: string | null;
        modelo_geracao: string | null;
        metadados_geracao: Json;
        gerado_em: string | null;
        criado_em: string;
        atualizado_em: string;
      }, "professor_id" | "materia_id" | "tipo" | "titulo">;
      artefatos_topicos: Table<{
        professor_id: string;
        artefato_id: string;
        topico_id: string;
        materia_id: string;
        criado_em: string;
      }, "professor_id" | "artefato_id" | "topico_id" | "materia_id">;
      correcoes: Table<{
        id: string;
        professor_id: string;
        artefato_id: string;
        identificacao_aluno: string | null;
        texto_resposta: string | null;
        caminho_resposta: string | null;
        nota: number | null;
        nota_maxima: number | null;
        devolutiva: string | null;
        resultados_rubrica: Json;
        situacao: Database["public"]["Enums"]["situacao_correcao"];
        modelo_correcao: string | null;
        criado_em: string;
        atualizado_em: string;
      }, "professor_id" | "artefato_id">;
    };
    Views: Record<string, never>;
    Functions: Record<string, never>;
    Enums: {
      tipo_artefato: "roteiro_aula" | "atividade" | "prova";
      situacao_artefato: "rascunho" | "gerado" | "editado" | "arquivado";
      situacao_topico: "pendente" | "planejado" | "praticado" | "avaliado";
      situacao_extracao: "pendente" | "processando" | "concluido" | "falhou";
      situacao_correcao: "pendente" | "concluido" | "falhou";
    };
    CompositeTypes: Record<string, never>;
  };
};
