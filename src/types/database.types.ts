/**
 * Tipos del schema de Supabase.
 *
 * Regenerar tras cada migración con el MCP de Supabase (`generate_typescript_types`)
 * o con `supabase gen types typescript --project-id gfutgfmiwzgjtcrinqwo`.
 *
 * Los alias `Tables<'x'>` / `TablesInsert<'x'>` del final son propios, más simples que
 * los genéricos que emite el generador pero equivalentes en la práctica.
 */

export type Json = string | number | boolean | null | { [key: string]: Json | undefined } | Json[];

export type Database = {
  public: {
    Tables: {
      background_traces: {
        Row: {
          at: string;
          detail: string | null;
          id: string;
          stage: string;
          uploaded_at: string;
          user_id: string;
        };
        Insert: {
          at: string;
          detail?: string | null;
          id?: string;
          stage: string;
          uploaded_at?: string;
          user_id: string;
        };
        // Sin política de update a propósito (migración 0019): una migaja que
        // se puede editar no sirve como evidencia.
        Update: Record<string, never>;
        Relationships: [];
      };
      content_reports: {
        Row: {
          conversation_id: string | null;
          created_at: string;
          detail: string | null;
          id: string;
          message_body: string | null;
          message_id: string | null;
          reason: string;
          reported_user_id: string | null;
          reporter_id: string | null;
          reviewed_at: string | null;
          status: string;
        };
        Insert: never;
        Update: never;
        Relationships: [];
      };
      connections: {
        Row: {
          blocked_by: string | null;
          created_at: string;
          id: string;
          requested_by: string;
          responded_at: string | null;
          status: string;
          updated_at: string;
          user_a: string;
          user_b: string;
        };
        Insert: {
          created_at?: string;
          id?: string;
          requested_by: string;
          responded_at?: string | null;
          status?: string;
          updated_at?: string;
          user_a: string;
          user_b: string;
        };
        Update: {
          responded_at?: string | null;
          status?: string;
        };
        Relationships: [];
      };
      conversation_members: {
        Row: {
          conversation_id: string;
          joined_at: string;
          last_read_at: string | null;
          user_id: string;
        };
        Insert: {
          conversation_id: string;
          joined_at?: string;
          last_read_at?: string | null;
          user_id: string;
        };
        Update: { last_read_at?: string | null };
        Relationships: [];
      };
      conversations: {
        Row: {
          created_at: string;
          created_by: string;
          direct_key: string | null;
          id: string;
          kind: string;
          last_message_at: string | null;
          title: string | null;
        };
        Insert: {
          created_at?: string;
          created_by: string;
          direct_key?: string | null;
          id?: string;
          kind: string;
          last_message_at?: string | null;
          title?: string | null;
        };
        Update: { last_message_at?: string | null; title?: string | null };
        Relationships: [];
      };
      drills: {
        Row: {
          cancelled_at: string | null;
          completed_at: string | null;
          id: string;
          mode: string;
          reported_status: string | null;
          started_at: string;
          user_id: string;
        };
        Insert: {
          cancelled_at?: string | null;
          completed_at?: string | null;
          id?: string;
          mode: string;
          reported_status?: string | null;
          started_at?: string;
          user_id: string;
        };
        Update: {
          cancelled_at?: string | null;
          completed_at?: string | null;
          reported_status?: string | null;
        };
        Relationships: [];
      };
      ingest_runs: {
        Row: {
          error: string | null;
          events_found: number;
          id: number;
          ok: boolean;
          ran_at: string;
          source: string;
        };
        Insert: {
          error?: string | null;
          events_found?: number;
          ok: boolean;
          ran_at?: string;
          source: string;
        };
        Update: { error?: string | null; events_found?: number; ok?: boolean };
        Relationships: [];
      };
      invitations: {
        Row: {
          accepted_at: string | null;
          accepted_by: string | null;
          code: string;
          created_at: string;
          expires_at: string;
          id: string;
          invitee_label: string | null;
          invitee_phone_hash: string | null;
          inviter_id: string;
          status: string;
        };
        Insert: {
          accepted_at?: string | null;
          accepted_by?: string | null;
          code: string;
          created_at?: string;
          expires_at?: string;
          id?: string;
          invitee_label?: string | null;
          invitee_phone_hash?: string | null;
          inviter_id: string;
          status?: string;
        };
        Update: { status?: string };
        Relationships: [];
      };
      messages: {
        Row: {
          body: string;
          client_id: string;
          conversation_id: string;
          created_at: string;
          id: string;
          is_drill: boolean;
          kind: string;
          sender_id: string;
        };
        Insert: {
          body: string;
          client_id: string;
          conversation_id: string;
          created_at?: string;
          id?: string;
          is_drill?: boolean;
          kind?: string;
          sender_id: string;
        };
        Update: never;
        Relationships: [];
      };
      notification_preferences: {
        Row: {
          connection_accepted: boolean;
          connection_request: boolean;
          contact_message: boolean;
          contact_needs_help: boolean;
          contact_not_responding: boolean;
          quake_national: boolean;
          quake_worldwide: boolean;
          updated_at: string;
          user_id: string;
        };
        Insert: {
          connection_accepted?: boolean;
          connection_request?: boolean;
          contact_message?: boolean;
          contact_needs_help?: boolean;
          contact_not_responding?: boolean;
          quake_national?: boolean;
          quake_worldwide?: boolean;
          user_id: string;
        };
        Update: {
          connection_accepted?: boolean;
          connection_request?: boolean;
          contact_message?: boolean;
          contact_needs_help?: boolean;
          contact_not_responding?: boolean;
          quake_national?: boolean;
          quake_worldwide?: boolean;
        };
        Relationships: [];
      };
      profiles: {
        Row: {
          action_plan: string | null;
          action_plan_updated_at: string | null;
          avatar_url: string | null;
          created_at: string;
          display_name: string;
          id: string;
          updated_at: string;
        };
        Insert: {
          action_plan?: string | null;
          action_plan_updated_at?: string | null;
          avatar_url?: string | null;
          display_name?: string;
          id: string;
        };
        Update: {
          action_plan?: string | null;
          action_plan_updated_at?: string | null;
          avatar_url?: string | null;
          display_name?: string;
        };
        Relationships: [];
      };
      push_tokens: {
        Row: {
          created_at: string;
          device_name: string | null;
          id: string;
          platform: string;
          token: string;
          updated_at: string;
          user_id: string;
        };
        Insert: {
          device_name?: string | null;
          id?: string;
          platform: string;
          token: string;
          user_id: string;
        };
        Update: { device_name?: string | null; platform?: string; token?: string };
        Relationships: [];
      };
      quake_events: {
        Row: {
          canonical_id: string | null;
          country_code: string | null;
          depth_km: number | null;
          id: string;
          ingested_at: string;
          intensity_mmi: string | null;
          latitude: number;
          longitude: number;
          magnitude: number;
          occurred_at: string;
          place: string | null;
          raw: Json | null;
          region: string | null;
          source: string;
          source_event_id: string;
        };
        Insert: {
          country_code?: string | null;
          depth_km?: number | null;
          intensity_mmi?: string | null;
          latitude: number;
          longitude: number;
          magnitude: number;
          occurred_at: string;
          place?: string | null;
          raw?: Json | null;
          region?: string | null;
          source: string;
          source_event_id: string;
        };
        Update: never;
        Relationships: [];
      };
      tips: {
        Row: {
          body: string;
          created_at: string;
          id: string;
          is_active: boolean;
          long_body: string | null;
          phase: string;
          sort_order: number;
          source_name: string;
          source_url: string;
          title: string;
        };
        Insert: {
          body: string;
          long_body?: string | null;
          phase: string;
          sort_order?: number;
          source_name: string;
          source_url: string;
          title: string;
        };
        Update: { is_active?: boolean };
        Relationships: [];
      };
      user_settings: {
        Row: {
          alert_countrywide_magnitude: number;
          alert_min_magnitude: number;
          alert_radius_km: number;
          alert_worldwide_enabled: boolean;
          country_code: string;
          created_at: string;
          drills_completed: number;
          is_premium: boolean;
          location_permission_level: string;
          onboarding_completed_at: string | null;
          phone_e164: string | null;
          phone_hash: string | null;
          updated_at: string;
          user_id: string;
        };
        Insert: { user_id: string };
        Update: {
          alert_countrywide_magnitude?: number;
          alert_min_magnitude?: number;
          alert_radius_km?: number;
          alert_worldwide_enabled?: boolean;
          country_code?: string;
          location_permission_level?: string;
          onboarding_completed_at?: string | null;
          phone_e164?: string | null;
          phone_hash?: string | null;
        };
        Relationships: [];
      };
      user_status: {
        Row: {
          is_drill: boolean;
          latitude: number | null;
          location_accuracy_m: number | null;
          location_at: string | null;
          longitude: number | null;
          message: string | null;
          quake_event_id: string | null;
          reported_at: string | null;
          status: string;
          updated_at: string;
          user_id: string;
        };
        Insert: {
          is_drill?: boolean;
          latitude?: number | null;
          location_accuracy_m?: number | null;
          location_at?: string | null;
          longitude?: number | null;
          message?: string | null;
          quake_event_id?: string | null;
          reported_at?: string | null;
          status?: string;
          user_id: string;
        };
        Update: {
          is_drill?: boolean;
          latitude?: number | null;
          location_accuracy_m?: number | null;
          location_at?: string | null;
          longitude?: number | null;
          message?: string | null;
          quake_event_id?: string | null;
          reported_at?: string | null;
          status?: string;
        };
        Relationships: [];
      };
    };
    Views: Record<never, never>;
    Functions: {
      complete_drill: {
        Args: { drill_id: string; status_reported?: string | null };
        Returns: Database['public']['Tables']['drills']['Row'];
      };
      create_group_conversation: {
        Args: { group_title: string; member_ids: string[] };
        Returns: Database['public']['Tables']['conversations']['Row'];
      };
      create_invitation: {
        Args: { label?: string | null; phone_hash?: string | null };
        Returns: Database['public']['Tables']['invitations']['Row'];
      };
      delete_my_account: {
        Args: { password_attempt?: string | null };
        Returns: undefined;
      };
      distance_km: {
        Args: { lat1: number; lat2: number; lon1: number; lon2: number };
        Returns: number;
      };
      get_active_alert: {
        Args: Record<never, never>;
        Returns: Database['public']['Tables']['quake_events']['Row'][];
      };
      get_quake_feed: {
        Args: { scope: string };
        Returns: Database['public']['Tables']['quake_events']['Row'][];
      };
      get_circle: {
        Args: Record<never, never>;
        Returns: {
          action_plan: string | null;
          action_plan_updated_at: string | null;
          avatar_url: string | null;
          connection_created_at: string;
          connection_id: string;
          connection_status: string;
          display_name: string;
          is_drill: boolean | null;
          latitude: number | null;
          location_accuracy_m: number | null;
          location_at: string | null;
          longitude: number | null;
          quake_event_id: string | null;
          reported_at: string | null;
          requested_by: string;
          responded_at: string | null;
          status: string | null;
          status_message: string | null;
          status_updated_at: string | null;
          user_id: string;
        }[];
      };
      get_or_create_direct_conversation: {
        Args: { other_user_id: string };
        Returns: Database['public']['Tables']['conversations']['Row'];
      };
      redeem_invitation: {
        Args: { invite_code: string };
        Returns: Database['public']['Tables']['connections']['Row'];
      };
      report_status: {
        Args: {
          accuracy_m?: number | null;
          drill?: boolean;
          lat?: number | null;
          lng?: number | null;
          located_at?: string | null;
          new_message?: string | null;
          new_status: string;
          quake_id?: string | null;
          reported?: string | null;
        };
        Returns: Database['public']['Tables']['user_status']['Row'];
      };
      request_connection: {
        Args: { target_user_id: string };
        Returns: Database['public']['Tables']['connections']['Row'];
      };
      block_connection: {
        Args: { other_user_id: string };
        Returns: undefined;
      };
      unblock_connection: {
        Args: { other_user_id: string };
        Returns: undefined;
      };
      get_blocked: {
        Args: Record<string, never>;
        Returns: {
          blocked_at: string | null;
          display_name: string;
          user_id: string;
        }[];
      };
      submit_report: {
        Args: {
          conversation_id?: string | null;
          detail?: string | null;
          message_id?: string | null;
          reason: string;
          reported_user_id: string;
        };
        Returns: undefined;
      };
      respond_to_connection: {
        Args: { accept: boolean; connection_id: string };
        Returns: Database['public']['Tables']['connections']['Row'];
      };
      start_drill: {
        Args: { drill_mode: string };
        Returns: Database['public']['Tables']['drills']['Row'];
      };
    };
    Enums: Record<never, never>;
    CompositeTypes: Record<never, never>;
  };
};

type PublicSchema = Database['public'];

export type Tables<T extends keyof PublicSchema['Tables']> = PublicSchema['Tables'][T]['Row'];
export type TablesInsert<T extends keyof PublicSchema['Tables']> =
  PublicSchema['Tables'][T]['Insert'];
export type TablesUpdate<T extends keyof PublicSchema['Tables']> =
  PublicSchema['Tables'][T]['Update'];
export type FnArgs<T extends keyof PublicSchema['Functions']> = PublicSchema['Functions'][T]['Args'];
export type FnReturns<T extends keyof PublicSchema['Functions']> =
  PublicSchema['Functions'][T]['Returns'];
