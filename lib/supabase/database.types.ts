/**
 * Tipos de la base de datos.
 *
 * Se mantienen a mano y en paralelo con `supabase/migrations/`. Cuando tengas el
 * proyecto en marcha, regenéralos con la fuente de verdad real:
 *
 *   pnpm db:types      # supabase gen types typescript --local
 *
 * Nota sobre `Insert`/`Update`: los campos con DEFAULT en SQL son opcionales al
 * insertar, y las columnas generadas (`id`, `search_tsv`) no aparecen porque no
 * se pueden escribir.
 */

export type Json = string | number | boolean | null | { [key: string]: Json | undefined } | Json[];

/** Un tratamiento ofrecido por la clínica. */
export interface Service {
  name: string;
  duration_minutes: number;
  description?: string;
}

/** Un tramo de atención, en hora local de la clínica. */
export interface HourRange {
  start: string; // "09:00"
  end: string; // "14:00"
}

export type WeekdayKey = 'mon' | 'tue' | 'wed' | 'thu' | 'fri' | 'sat' | 'sun';
export type BusinessHours = Partial<Record<WeekdayKey, HourRange[]>>;

export interface ClinicInfo {
  payment_methods?: string;
  policies?: string;
  faq?: string;
  parking?: string;
  [key: string]: string | undefined;
}

/** Un turno de la conversación tal como lo entrega Vapi. */
export interface TranscriptMessage {
  role: 'assistant' | 'user' | 'system' | 'tool' | 'bot';
  message: string;
  secondsFromStart?: number;
}

export type AppointmentStatus = 'scheduled' | 'cancelled' | 'completed' | 'no_show';
export type AppointmentSource = 'voice' | 'manual' | 'google';
export type CallStatus = 'queued' | 'ringing' | 'in-progress' | 'forwarding' | 'ended';
export type ProfileRole = 'owner' | 'staff';

export interface Database {
  public: {
    Tables: {
      clinics: {
        Row: {
          id: number;
          slug: string;
          name: string;
          timezone: string;
          phone_e164: string | null;
          address: string | null;
          vapi_assistant_id: string | null;
          vapi_phone_number_id: string | null;
          created_at: string;
          updated_at: string;
        };
        Insert: {
          slug: string;
          name: string;
          timezone?: string;
          phone_e164?: string | null;
          address?: string | null;
          vapi_assistant_id?: string | null;
          vapi_phone_number_id?: string | null;
        };
        Update: Partial<Database['public']['Tables']['clinics']['Insert']>;
        Relationships: [];
      };

      profiles: {
        Row: {
          id: string;
          clinic_id: number;
          role: ProfileRole;
          full_name: string | null;
          email: string | null;
          created_at: string;
        };
        Insert: {
          id: string;
          clinic_id: number;
          role?: ProfileRole;
          full_name?: string | null;
          email?: string | null;
        };
        Update: Partial<Omit<Database['public']['Tables']['profiles']['Insert'], 'id'>>;
        Relationships: [];
      };

      agent_configs: {
        Row: {
          id: number;
          clinic_id: number;
          first_message: string;
          tone: string;
          system_prompt_extra: string | null;
          handoff_message: string;
          clinic_info: ClinicInfo;
          services: Service[];
          business_hours: BusinessHours;
          closed_dates: string[];
          voice_provider: string;
          voice_id: string;
          language: string;
          model_provider: string;
          model_name: string;
          slot_minutes: number;
          min_lead_minutes: number;
          max_advance_days: number;
          hipaa_enabled: boolean;
          published_at: string | null;
          published_hash: string | null;
          last_publish_error: string | null;
          created_at: string;
          updated_at: string;
        };
        Insert: {
          clinic_id: number;
          first_message?: string;
          tone?: string;
          system_prompt_extra?: string | null;
          handoff_message?: string;
          clinic_info?: ClinicInfo;
          services?: Service[];
          business_hours?: BusinessHours;
          closed_dates?: string[];
          voice_provider?: string;
          voice_id?: string;
          language?: string;
          model_provider?: string;
          model_name?: string;
          slot_minutes?: number;
          min_lead_minutes?: number;
          max_advance_days?: number;
          hipaa_enabled?: boolean;
          published_at?: string | null;
          published_hash?: string | null;
          last_publish_error?: string | null;
        };
        Update: Partial<Database['public']['Tables']['agent_configs']['Insert']>;
        Relationships: [];
      };

      google_credentials: {
        Row: {
          id: number;
          clinic_id: number;
          google_email: string | null;
          calendar_id: string;
          access_token_enc: string | null;
          refresh_token_enc: string;
          access_token_expires_at: string | null;
          scopes: string[];
          revoked_at: string | null;
          created_at: string;
          updated_at: string;
        };
        Insert: {
          clinic_id: number;
          google_email?: string | null;
          calendar_id?: string;
          access_token_enc?: string | null;
          refresh_token_enc: string;
          access_token_expires_at?: string | null;
          scopes?: string[];
          revoked_at?: string | null;
        };
        Update: Partial<Database['public']['Tables']['google_credentials']['Insert']>;
        Relationships: [];
      };

      calls: {
        Row: {
          id: number;
          clinic_id: number;
          vapi_call_id: string;
          vapi_assistant_id: string | null;
          customer_number: string | null;
          direction: string;
          status: CallStatus;
          ended_reason: string | null;
          started_at: string | null;
          ended_at: string | null;
          duration_seconds: number | null;
          cost: number | null;
          recording_url: string | null;
          summary: string | null;
          created_at: string;
        };
        Insert: {
          clinic_id: number;
          vapi_call_id: string;
          vapi_assistant_id?: string | null;
          customer_number?: string | null;
          direction?: string;
          status?: CallStatus;
          ended_reason?: string | null;
          started_at?: string | null;
          ended_at?: string | null;
          duration_seconds?: number | null;
          cost?: number | null;
          recording_url?: string | null;
          summary?: string | null;
        };
        Update: Partial<Database['public']['Tables']['calls']['Insert']>;
        Relationships: [];
      };

      transcripts: {
        Row: {
          id: number;
          call_id: number;
          clinic_id: number;
          full_text: string | null;
          messages: TranscriptMessage[];
          created_at: string;
        };
        Insert: {
          call_id: number;
          clinic_id: number;
          full_text?: string | null;
          messages?: TranscriptMessage[];
        };
        Update: Partial<Database['public']['Tables']['transcripts']['Insert']>;
        Relationships: [];
      };

      appointments: {
        Row: {
          id: number;
          clinic_id: number;
          call_id: number | null;
          reference_code: string;
          patient_name: string;
          patient_phone: string | null;
          patient_email: string | null;
          is_new_patient: boolean;
          treatment: string;
          service_duration_minutes: number;
          starts_at: string;
          ends_at: string;
          status: AppointmentStatus;
          source: AppointmentSource;
          google_event_id: string | null;
          google_calendar_id: string | null;
          tool_call_id: string | null;
          cancel_tool_call_id: string | null;
          notes: string | null;
          created_at: string;
          updated_at: string;
        };
        Insert: {
          clinic_id: number;
          call_id?: number | null;
          reference_code: string;
          patient_name: string;
          patient_phone?: string | null;
          patient_email?: string | null;
          is_new_patient?: boolean;
          treatment: string;
          service_duration_minutes: number;
          starts_at: string;
          ends_at: string;
          status?: AppointmentStatus;
          source?: AppointmentSource;
          google_event_id?: string | null;
          google_calendar_id?: string | null;
          tool_call_id?: string | null;
          cancel_tool_call_id?: string | null;
          notes?: string | null;
        };
        Update: Partial<Database['public']['Tables']['appointments']['Insert']>;
        Relationships: [];
      };
    };
    Views: Record<never, never>;
    Functions: Record<never, never>;
    Enums: Record<never, never>;
    CompositeTypes: Record<never, never>;
  };
}

export type Clinic = Database['public']['Tables']['clinics']['Row'];
export type Profile = Database['public']['Tables']['profiles']['Row'];
export type AgentConfig = Database['public']['Tables']['agent_configs']['Row'];
export type GoogleCredentials = Database['public']['Tables']['google_credentials']['Row'];
export type Call = Database['public']['Tables']['calls']['Row'];
export type Transcript = Database['public']['Tables']['transcripts']['Row'];
export type Appointment = Database['public']['Tables']['appointments']['Row'];
