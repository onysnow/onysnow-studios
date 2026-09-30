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
    PostgrestVersion: "14.5"
  }
  public: {
    Tables: {
      admin_users: {
        Row: {
          created_at: string
          granted_by: string | null
          updated_at: string
          user_id: string
        }
        Insert: {
          created_at?: string
          granted_by?: string | null
          updated_at?: string
          user_id: string
        }
        Update: {
          created_at?: string
          granted_by?: string | null
          updated_at?: string
          user_id?: string
        }
        Relationships: []
      }
      categories: {
        Row: {
          cover_photo_id: string | null
          created_at: string
          description: string
          id: string
          name: string
          published: boolean
          slug: string
          sort_order: number
          updated_at: string
        }
        Insert: {
          cover_photo_id?: string | null
          created_at?: string
          description?: string
          id?: string
          name: string
          published?: boolean
          slug: string
          sort_order?: number
          updated_at?: string
        }
        Update: {
          cover_photo_id?: string | null
          created_at?: string
          description?: string
          id?: string
          name?: string
          published?: boolean
          slug?: string
          sort_order?: number
          updated_at?: string
        }
        Relationships: [
          {
            foreignKeyName: "categories_cover_photo_fkey"
            columns: ["cover_photo_id"]
            isOneToOne: false
            referencedRelation: "photos"
            referencedColumns: ["id"]
          },
        ]
      }
      inquiries: {
        Row: {
          created_at: string
          email: string
          id: string
          kind: string
          message: string
          name: string
          status: string
          updated_at: string
        }
        Insert: {
          created_at?: string
          email: string
          id?: string
          kind?: string
          message: string
          name: string
          status?: string
          updated_at?: string
        }
        Update: {
          created_at?: string
          email?: string
          id?: string
          kind?: string
          message?: string
          name?: string
          status?: string
          updated_at?: string
        }
        Relationships: []
      }
      page_content: {
        Row: {
          created_at: string
          format: string
          id: string
          page_slug: string
          published: boolean
          section_key: string
          sort_order: number
          updated_at: string
          value: string
        }
        Insert: {
          created_at?: string
          format?: string
          id?: string
          page_slug: string
          published?: boolean
          section_key: string
          sort_order?: number
          updated_at?: string
          value?: string
        }
        Update: {
          created_at?: string
          format?: string
          id?: string
          page_slug?: string
          published?: boolean
          section_key?: string
          sort_order?: number
          updated_at?: string
          value?: string
        }
        Relationships: []
      }
      photos: {
        Row: {
          alt: string
          blur_data_url: string
          category_id: string | null
          created_at: string
          featured: boolean
          height: number
          id: string
          published: boolean
          sort_order: number
          sources: Json
          storage_path: string
          title: string
          updated_at: string
          width: number
        }
        Insert: {
          alt?: string
          blur_data_url?: string
          category_id?: string | null
          created_at?: string
          featured?: boolean
          height?: number
          id?: string
          published?: boolean
          sort_order?: number
          sources?: Json
          storage_path: string
          title?: string
          updated_at?: string
          width?: number
        }
        Update: {
          alt?: string
          blur_data_url?: string
          category_id?: string | null
          created_at?: string
          featured?: boolean
          height?: number
          id?: string
          published?: boolean
          sort_order?: number
          sources?: Json
          storage_path?: string
          title?: string
          updated_at?: string
          width?: number
        }
        Relationships: [
          {
            foreignKeyName: "photos_category_id_fkey"
            columns: ["category_id"]
            isOneToOne: false
            referencedRelation: "categories"
            referencedColumns: ["id"]
          },
        ]
      }
      posts: {
        Row: {
          blocks: Json
          cover_photo_id: string | null
          created_at: string
          excerpt: string
          id: string
          published: boolean
          published_at: string | null
          reading_minutes: number
          slug: string
          sort_order: number
          title: string
          updated_at: string
        }
        Insert: {
          blocks?: Json
          cover_photo_id?: string | null
          created_at?: string
          excerpt?: string
          id?: string
          published?: boolean
          published_at?: string | null
          reading_minutes?: number
          slug: string
          sort_order?: number
          title: string
          updated_at?: string
        }
        Update: {
          blocks?: Json
          cover_photo_id?: string | null
          created_at?: string
          excerpt?: string
          id?: string
          published?: boolean
          published_at?: string | null
          reading_minutes?: number
          slug?: string
          sort_order?: number
          title?: string
          updated_at?: string
        }
        Relationships: [
          {
            foreignKeyName: "posts_cover_photo_id_fkey"
            columns: ["cover_photo_id"]
            isOneToOne: false
            referencedRelation: "photos"
            referencedColumns: ["id"]
          },
        ]
      }
      profiles: {
        Row: {
          created_at: string
          display_name: string | null
          email: string | null
          id: string
          updated_at: string
        }
        Insert: {
          created_at?: string
          display_name?: string | null
          email?: string | null
          id: string
          updated_at?: string
        }
        Update: {
          created_at?: string
          display_name?: string | null
          email?: string | null
          id?: string
          updated_at?: string
        }
        Relationships: []
      }
      rate_limit_rules: {
        Row: {
          bucket: string
          max_hits: number
          message: string
          window_secs: number
        }
        Insert: {
          bucket: string
          max_hits: number
          message?: string
          window_secs: number
        }
        Update: {
          bucket?: string
          max_hits?: number
          message?: string
          window_secs?: number
        }
        Relationships: []
      }
      services: {
        Row: {
          created_at: string
          id: string
          included: string[]
          name: string
          price_display: string
          published: boolean
          slug: string
          sort_order: number
          summary: string
          turnaround: string
          updated_at: string
        }
        Insert: {
          created_at?: string
          id?: string
          included?: string[]
          name: string
          price_display?: string
          published?: boolean
          slug: string
          sort_order?: number
          summary?: string
          turnaround?: string
          updated_at?: string
        }
        Update: {
          created_at?: string
          id?: string
          included?: string[]
          name?: string
          price_display?: string
          published?: boolean
          slug?: string
          sort_order?: number
          summary?: string
          turnaround?: string
          updated_at?: string
        }
        Relationships: []
      }
      site_settings: {
        Row: {
          created_at: string
          key: string
          kind: string
          label: string
          sort_order: number
          updated_at: string
          value: string
        }
        Insert: {
          created_at?: string
          key: string
          kind?: string
          label?: string
          sort_order?: number
          updated_at?: string
          value?: string
        }
        Update: {
          created_at?: string
          key?: string
          kind?: string
          label?: string
          sort_order?: number
          updated_at?: string
          value?: string
        }
        Relationships: []
      }
      subscribers: {
        Row: {
          created_at: string
          email: string
          id: string
          source: string
        }
        Insert: {
          created_at?: string
          email: string
          id?: string
          source?: string
        }
        Update: {
          created_at?: string
          email?: string
          id?: string
          source?: string
        }
        Relationships: []
      }
      testimonials: {
        Row: {
          author: string
          context: string
          created_at: string
          id: string
          published: boolean
          quote: string
          sort_order: number
          updated_at: string
        }
        Insert: {
          author?: string
          context?: string
          created_at?: string
          id?: string
          published?: boolean
          quote: string
          sort_order?: number
          updated_at?: string
        }
        Update: {
          author?: string
          context?: string
          created_at?: string
          id?: string
          published?: boolean
          quote?: string
          sort_order?: number
          updated_at?: string
        }
        Relationships: []
      }
      write_throttle: {
        Row: {
          actor: string
          bucket: string
          hits: number
          window_start: string
        }
        Insert: {
          actor: string
          bucket: string
          hits?: number
          window_start: string
        }
        Update: {
          actor?: string
          bucket?: string
          hits?: number
          window_start?: string
        }
        Relationships: []
      }
    }
    Views: {
      [_ in never]: never
    }
    Functions: {
      bootstrap_current_user: { Args: never; Returns: Json }
      is_admin: { Args: { _user_id: string }; Returns: boolean }
      request_actor: { Args: { fallback: string }; Returns: string }
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
  public: {
    Enums: {},
  },
} as const
