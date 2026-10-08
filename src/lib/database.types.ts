export type Json =
  | string
  | number
  | boolean
  | null
  | { [key: string]: Json | undefined }
  | Json[]

export type Database = {
  // Allows to automatically instantiate createClient with right options
  // instead of createClient<Database, { PostgrestVersion: 'XX' }>(URL, KEY)
  __InternalSupabase: {
    PostgrestVersion: "14.18"
  }
  graphql_public: {
    Tables: {
      [_ in never]: never
    }
    Views: {
      [_ in never]: never
    }
    Functions: {
      graphql: {
        Args: {
          extensions?: Json
          operationName?: string
          query?: string
          variables?: Json
        }
        Returns: Json
      }
    }
    Enums: {
      [_ in never]: never
    }
    CompositeTypes: {
      [_ in never]: never
    }
  }
  public: {
    Tables: {
      chat_traces: {
        Row: {
          client_hash: string | null
          conversation_id: string | null
          created_at: string
          duration_ms: number
          endpoint: string
          error_code: string | null
          first_byte_ms: number | null
          id: string
          language: string | null
          message: string | null
          meta: Json
          mode: string | null
          recommendation_ids: string[]
          reply: string | null
          search: Json | null
          status: number
          steps: Json
          unknown_titles: string[]
          user_id: string | null
        }
        Insert: {
          client_hash?: string | null
          conversation_id?: string | null
          created_at?: string
          duration_ms: number
          endpoint: string
          error_code?: string | null
          first_byte_ms?: number | null
          id: string
          language?: string | null
          message?: string | null
          meta?: Json
          mode?: string | null
          recommendation_ids?: string[]
          reply?: string | null
          search?: Json | null
          status: number
          steps?: Json
          unknown_titles?: string[]
          user_id?: string | null
        }
        Update: {
          client_hash?: string | null
          conversation_id?: string | null
          created_at?: string
          duration_ms?: number
          endpoint?: string
          error_code?: string | null
          first_byte_ms?: number | null
          id?: string
          language?: string | null
          message?: string | null
          meta?: Json
          mode?: string | null
          recommendation_ids?: string[]
          reply?: string | null
          search?: Json | null
          status?: number
          steps?: Json
          unknown_titles?: string[]
          user_id?: string | null
        }
        Relationships: [
          {
            foreignKeyName: "chat_traces_conversation_id_fkey"
            columns: ["conversation_id"]
            isOneToOne: false
            referencedRelation: "conversations"
            referencedColumns: ["id"]
          },
        ]
      }
      content: {
        Row: {
          autumn_score: number | null
          backdrop_path: string | null
          collection_id: number | null
          created_at: string
          director: string | null
          embedding: unknown
          genres: string[] | null
          id: string
          keywords: string[] | null
          original_language: string | null
          popularity: number | null
          poster_path: string | null
          runtime: number | null
          seasons: number | null
          status: string | null
          synopsis: string | null
          synopsis_en: string | null
          title: string
          title_en: string | null
          tmdb_id: number
          top_cast: string[]
          type: string
          vote_average: number | null
          vote_count: number | null
          year: number | null
        }
        Insert: {
          autumn_score?: number | null
          backdrop_path?: string | null
          collection_id?: number | null
          created_at?: string
          director?: string | null
          embedding?: unknown
          genres?: string[] | null
          id?: string
          keywords?: string[] | null
          original_language?: string | null
          popularity?: number | null
          poster_path?: string | null
          runtime?: number | null
          seasons?: number | null
          status?: string | null
          synopsis?: string | null
          synopsis_en?: string | null
          title: string
          title_en?: string | null
          tmdb_id: number
          top_cast?: string[]
          type: string
          vote_average?: number | null
          vote_count?: number | null
          year?: number | null
        }
        Update: {
          autumn_score?: number | null
          backdrop_path?: string | null
          collection_id?: number | null
          created_at?: string
          director?: string | null
          embedding?: unknown
          genres?: string[] | null
          id?: string
          keywords?: string[] | null
          original_language?: string | null
          popularity?: number | null
          poster_path?: string | null
          runtime?: number | null
          seasons?: number | null
          status?: string | null
          synopsis?: string | null
          synopsis_en?: string | null
          title?: string
          title_en?: string | null
          tmdb_id?: number
          top_cast?: string[]
          type?: string
          vote_average?: number | null
          vote_count?: number | null
          year?: number | null
        }
        Relationships: []
      }
      content_similar: {
        Row: {
          content_id: string
          rank: number
          similar_id: string
          similarity: number
        }
        Insert: {
          content_id: string
          rank: number
          similar_id: string
          similarity: number
        }
        Update: {
          content_id?: string
          rank?: number
          similar_id?: string
          similarity?: number
        }
        Relationships: [
          {
            foreignKeyName: "content_similar_content_id_fkey"
            columns: ["content_id"]
            isOneToOne: false
            referencedRelation: "content"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "content_similar_similar_id_fkey"
            columns: ["similar_id"]
            isOneToOne: false
            referencedRelation: "content"
            referencedColumns: ["id"]
          },
        ]
      }
      daily_games: {
        Row: {
          content_id: string
          created_at: string
          day: string
          game: string
          number: number
          poster_path: string
          title_en: string
          title_es: string
        }
        Insert: {
          content_id: string
          created_at?: string
          day: string
          game: string
          number: number
          poster_path: string
          title_en: string
          title_es: string
        }
        Update: {
          content_id?: string
          created_at?: string
          day?: string
          game?: string
          number?: number
          poster_path?: string
          title_en?: string
          title_es?: string
        }
        Relationships: [
          {
            foreignKeyName: "daily_games_content_id_fkey"
            columns: ["content_id"]
            isOneToOne: false
            referencedRelation: "content"
            referencedColumns: ["id"]
          },
        ]
      }
      conversations: {
        Row: {
          created_at: string
          id: string
          messages: Json
          mode: string
          specialty: string | null
          updated_at: string
          user_id: string
        }
        Insert: {
          created_at?: string
          id?: string
          messages?: Json
          mode: string
          specialty?: string | null
          updated_at?: string
          user_id: string
        }
        Update: {
          created_at?: string
          id?: string
          messages?: Json
          mode?: string
          specialty?: string | null
          updated_at?: string
          user_id?: string
        }
        Relationships: []
      }
      llm_calls: {
        Row: {
          cache_hit_tokens: number | null
          cache_miss_tokens: number | null
          cost_usd: number
          created_at: string
          duration_ms: number
          error: string | null
          finish_reason: string | null
          first_token_ms: number | null
          id: string
          input_tokens: number | null
          model: string
          output_tokens: number | null
          prompt_version: string | null
          provider: string
          purpose: string
          started_ms: number
          status: string
          tool_args: Json | null
          tool_name: string | null
          trace_id: string
        }
        Insert: {
          cache_hit_tokens?: number | null
          cache_miss_tokens?: number | null
          cost_usd?: number
          created_at?: string
          duration_ms: number
          error?: string | null
          finish_reason?: string | null
          first_token_ms?: number | null
          id?: string
          input_tokens?: number | null
          model: string
          output_tokens?: number | null
          prompt_version?: string | null
          provider: string
          purpose: string
          started_ms: number
          status: string
          tool_args?: Json | null
          tool_name?: string | null
          trace_id: string
        }
        Update: {
          cache_hit_tokens?: number | null
          cache_miss_tokens?: number | null
          cost_usd?: number
          created_at?: string
          duration_ms?: number
          error?: string | null
          finish_reason?: string | null
          first_token_ms?: number | null
          id?: string
          input_tokens?: number | null
          model?: string
          output_tokens?: number | null
          prompt_version?: string | null
          provider?: string
          purpose?: string
          started_ms?: number
          status?: string
          tool_args?: Json | null
          tool_name?: string | null
          trace_id?: string
        }
        Relationships: [
          {
            foreignKeyName: "llm_calls_trace_id_fkey"
            columns: ["trace_id"]
            isOneToOne: false
            referencedRelation: "chat_traces"
            referencedColumns: ["id"]
          },
        ]
      }
      platforms_cache: {
        Row: {
          by_region: Json
          content_id: string
          fetched_at: string
        }
        Insert: {
          by_region: Json
          content_id: string
          fetched_at?: string
        }
        Update: {
          by_region?: Json
          content_id?: string
          fetched_at?: string
        }
        Relationships: [
          {
            foreignKeyName: "platforms_cache_content_id_fkey"
            columns: ["content_id"]
            isOneToOne: true
            referencedRelation: "content"
            referencedColumns: ["id"]
          },
        ]
      }
      profiles: {
        Row: {
          created_at: string
          id: string
          username: string | null
        }
        Insert: {
          created_at?: string
          id: string
          username?: string | null
        }
        Update: {
          created_at?: string
          id?: string
          username?: string | null
        }
        Relationships: []
      }
      rate_limits: {
        Row: {
          expires_at: string
          hits: number
          key: string
          window_seconds: number
          window_start: string
        }
        Insert: {
          expires_at: string
          hits?: number
          key: string
          window_seconds: number
          window_start: string
        }
        Update: {
          expires_at?: string
          hits?: number
          key?: string
          window_seconds?: number
          window_start?: string
        }
        Relationships: []
      }
      request_daily: {
        Row: {
          day: string
          endpoint: string
          requests: number
          signed_in: boolean
          status: number
        }
        Insert: {
          day: string
          endpoint: string
          requests?: number
          signed_in: boolean
          status: number
        }
        Update: {
          day?: string
          endpoint?: string
          requests?: number
          signed_in?: boolean
          status?: number
        }
        Relationships: []
      }
      usage_daily: {
        Row: {
          cache_hit_tokens: number
          calls: number
          cost_usd: number
          day: string
          errors: number
          input_tokens: number
          model: string
          output_tokens: number
          provider: string
          purpose: string
        }
        Insert: {
          cache_hit_tokens?: number
          calls?: number
          cost_usd?: number
          day: string
          errors?: number
          input_tokens?: number
          model: string
          output_tokens?: number
          provider: string
          purpose: string
        }
        Update: {
          cache_hit_tokens?: number
          calls?: number
          cost_usd?: number
          day?: string
          errors?: number
          input_tokens?: number
          model?: string
          output_tokens?: number
          provider?: string
          purpose?: string
        }
        Relationships: []
      }
      users_favorites: {
        Row: {
          content_id: string
          created_at: string
          id: string
          user_id: string
        }
        Insert: {
          content_id: string
          created_at?: string
          id?: string
          user_id: string
        }
        Update: {
          content_id?: string
          created_at?: string
          id?: string
          user_id?: string
        }
        Relationships: [
          {
            foreignKeyName: "users_favorites_content_id_fkey"
            columns: ["content_id"]
            isOneToOne: false
            referencedRelation: "content"
            referencedColumns: ["id"]
          },
        ]
      }
    }
    Views: {
      [_ in never]: never
    }
    Functions: {
      append_conversation_messages: {
        Args: { p_id: string; p_messages: Json }
        Returns: boolean
      }
      content_genres: {
        Args: { p_type?: string }
        Returns: {
          genre: string
          titles: number
        }[]
      }
      explore_content: {
        Args: {
          p_genre?: string
          p_limit?: number
          p_offset?: number
          p_query?: string
          p_sort?: string
          p_type?: string
        }
        Returns: {
          autumn_score: number
          id: string
          poster_path: string
          title: string
          title_en: string
          total_count: number
          type: string
          year: number
        }[]
      }
      fold_search_text: { Args: { p_text: string }; Returns: string }
      hit_rate_limit: {
        Args: { p_key: string; p_limits: number[]; p_window_seconds: number[] }
        Returns: number
      }
      is_username_available: { Args: { p_username: string }; Returns: boolean }
      prune_traces: { Args: never; Returns: undefined }
      record_trace: {
        Args: { p_calls: Json; p_trace: Json }
        Returns: undefined
      }
      search_content: {
        Args: {
          content_type?: string
          genres_any?: string[]
          genres_none?: string[]
          languages?: string[]
          match_count?: number
          max_runtime?: number
          max_votes?: number
          min_autumn?: number
          min_score?: number
          min_votes?: number
          person?: string
          query_embedding: string
          year_from?: number
          year_to?: number
        }
        Returns: {
          autumn_score: number
          director: string
          genres: string[]
          id: string
          original_language: string
          poster_path: string
          runtime: number
          similarity: number
          synopsis: string
          synopsis_en: string
          title: string
          title_en: string
          tmdb_id: number
          top_cast: string[]
          type: string
          vote_average: number
          vote_count: number
          year: number
        }[]
      }
    }
    Enums: {
      [_ in never]: never
    }
    CompositeTypes: {
      [_ in never]: never
    }
  }
}

type DatabaseWithoutInternals = Omit<Database, "__InternalSupabase">

type DefaultSchema = DatabaseWithoutInternals[Extract<keyof Database, "public">]

export type Tables<
  DefaultSchemaTableNameOrOptions extends
    | keyof (DefaultSchema["Tables"] & DefaultSchema["Views"])
    | { schema: keyof DatabaseWithoutInternals },
  TableName extends (DefaultSchemaTableNameOrOptions extends {
    schema: keyof DatabaseWithoutInternals
  }
    ? keyof (DatabaseWithoutInternals[DefaultSchemaTableNameOrOptions["schema"]]["Tables"] &
        DatabaseWithoutInternals[DefaultSchemaTableNameOrOptions["schema"]]["Views"])
    : never) = never,
> = DefaultSchemaTableNameOrOptions extends {
  schema: keyof DatabaseWithoutInternals
}
  ? (DatabaseWithoutInternals[DefaultSchemaTableNameOrOptions["schema"]]["Tables"] &
      DatabaseWithoutInternals[DefaultSchemaTableNameOrOptions["schema"]]["Views"])[TableName] extends {
      Row: infer R
    }
    ? R
    : never
  : DefaultSchemaTableNameOrOptions extends keyof (DefaultSchema["Tables"] &
        DefaultSchema["Views"])
    ? (DefaultSchema["Tables"] &
        DefaultSchema["Views"])[DefaultSchemaTableNameOrOptions] extends {
        Row: infer R
      }
      ? R
      : never
    : never

export type TablesInsert<
  DefaultSchemaTableNameOrOptions extends
    | keyof DefaultSchema["Tables"]
    | { schema: keyof DatabaseWithoutInternals },
  TableName extends (DefaultSchemaTableNameOrOptions extends {
    schema: keyof DatabaseWithoutInternals
  }
    ? keyof DatabaseWithoutInternals[DefaultSchemaTableNameOrOptions["schema"]]["Tables"]
    : never) = never,
> = DefaultSchemaTableNameOrOptions extends {
  schema: keyof DatabaseWithoutInternals
}
  ? DatabaseWithoutInternals[DefaultSchemaTableNameOrOptions["schema"]]["Tables"][TableName] extends {
      Insert: infer I
    }
    ? I
    : never
  : DefaultSchemaTableNameOrOptions extends keyof DefaultSchema["Tables"]
    ? DefaultSchema["Tables"][DefaultSchemaTableNameOrOptions] extends {
        Insert: infer I
      }
      ? I
      : never
    : never

export type TablesUpdate<
  DefaultSchemaTableNameOrOptions extends
    | keyof DefaultSchema["Tables"]
    | { schema: keyof DatabaseWithoutInternals },
  TableName extends (DefaultSchemaTableNameOrOptions extends {
    schema: keyof DatabaseWithoutInternals
  }
    ? keyof DatabaseWithoutInternals[DefaultSchemaTableNameOrOptions["schema"]]["Tables"]
    : never) = never,
> = DefaultSchemaTableNameOrOptions extends {
  schema: keyof DatabaseWithoutInternals
}
  ? DatabaseWithoutInternals[DefaultSchemaTableNameOrOptions["schema"]]["Tables"][TableName] extends {
      Update: infer U
    }
    ? U
    : never
  : DefaultSchemaTableNameOrOptions extends keyof DefaultSchema["Tables"]
    ? DefaultSchema["Tables"][DefaultSchemaTableNameOrOptions] extends {
        Update: infer U
      }
      ? U
      : never
    : never

export type Enums<
  DefaultSchemaEnumNameOrOptions extends
    | keyof DefaultSchema["Enums"]
    | { schema: keyof DatabaseWithoutInternals },
  EnumName extends (DefaultSchemaEnumNameOrOptions extends {
    schema: keyof DatabaseWithoutInternals
  }
    ? keyof DatabaseWithoutInternals[DefaultSchemaEnumNameOrOptions["schema"]]["Enums"]
    : never) = never,
> = DefaultSchemaEnumNameOrOptions extends {
  schema: keyof DatabaseWithoutInternals
}
  ? DatabaseWithoutInternals[DefaultSchemaEnumNameOrOptions["schema"]]["Enums"][EnumName]
  : DefaultSchemaEnumNameOrOptions extends keyof DefaultSchema["Enums"]
    ? DefaultSchema["Enums"][DefaultSchemaEnumNameOrOptions]
    : never

export type CompositeTypes<
  PublicCompositeTypeNameOrOptions extends
    | keyof DefaultSchema["CompositeTypes"]
    | { schema: keyof DatabaseWithoutInternals },
  CompositeTypeName extends (PublicCompositeTypeNameOrOptions extends {
    schema: keyof DatabaseWithoutInternals
  }
    ? keyof DatabaseWithoutInternals[PublicCompositeTypeNameOrOptions["schema"]]["CompositeTypes"]
    : never) = never,
> = PublicCompositeTypeNameOrOptions extends {
  schema: keyof DatabaseWithoutInternals
}
  ? DatabaseWithoutInternals[PublicCompositeTypeNameOrOptions["schema"]]["CompositeTypes"][CompositeTypeName]
  : PublicCompositeTypeNameOrOptions extends keyof DefaultSchema["CompositeTypes"]
    ? DefaultSchema["CompositeTypes"][PublicCompositeTypeNameOrOptions]
    : never

export const Constants = {
  graphql_public: {
    Enums: {},
  },
  public: {
    Enums: {},
  },
} as const
