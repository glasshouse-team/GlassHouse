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
  public: {
    Tables: {
      anchors: {
        Row: {
          created_at: string
          id: string
          kind: string
          look_at: Json | null
          name: string
          position: Json
          room: string | null
          source: string
          world_id: string
        }
        Insert: {
          created_at?: string
          id?: string
          kind: string
          look_at?: Json | null
          name: string
          position: Json
          room?: string | null
          source?: string
          world_id: string
        }
        Update: {
          created_at?: string
          id?: string
          kind?: string
          look_at?: Json | null
          name?: string
          position?: Json
          room?: string | null
          source?: string
          world_id?: string
        }
        Relationships: [
          {
            foreignKeyName: "anchors_world_id_fkey"
            columns: ["world_id"]
            isOneToOne: false
            referencedRelation: "worlds"
            referencedColumns: ["id"]
          },
        ]
      }
      availability: {
        Row: {
          date: string
          is_blocked: boolean
          listing_id: string
          price_override_cents: number | null
        }
        Insert: {
          date: string
          is_blocked?: boolean
          listing_id: string
          price_override_cents?: number | null
        }
        Update: {
          date?: string
          is_blocked?: boolean
          listing_id?: string
          price_override_cents?: number | null
        }
        Relationships: [
          {
            foreignKeyName: "availability_listing_id_fkey"
            columns: ["listing_id"]
            isOneToOne: false
            referencedRelation: "listings"
            referencedColumns: ["id"]
          },
        ]
      }
      captures: {
        Row: {
          created_at: string
          duration_s: number | null
          gap_id: string | null
          heading_track: Json
          id: string
          kind: string
          listing_id: string
          prepared_url: string | null
          quality_flags: Json
          raw_url: string | null
          room_markers: Json
          size_bytes: number | null
          status: string
          transcript: string | null
        }
        Insert: {
          created_at?: string
          duration_s?: number | null
          gap_id?: string | null
          heading_track?: Json
          id?: string
          kind: string
          listing_id: string
          prepared_url?: string | null
          quality_flags?: Json
          raw_url?: string | null
          room_markers?: Json
          size_bytes?: number | null
          status?: string
          transcript?: string | null
        }
        Update: {
          created_at?: string
          duration_s?: number | null
          gap_id?: string | null
          heading_track?: Json
          id?: string
          kind?: string
          listing_id?: string
          prepared_url?: string | null
          quality_flags?: Json
          raw_url?: string | null
          room_markers?: Json
          size_bytes?: number | null
          status?: string
          transcript?: string | null
        }
        Relationships: [
          {
            foreignKeyName: "captures_gap_fk"
            columns: ["gap_id"]
            isOneToOne: false
            referencedRelation: "gaps"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "captures_listing_id_fkey"
            columns: ["listing_id"]
            isOneToOne: false
            referencedRelation: "listings"
            referencedColumns: ["id"]
          },
        ]
      }
      checkins: {
        Row: {
          capture_id: string | null
          created_at: string
          id: string
          report: Json | null
          reservation_id: string
          status: string
        }
        Insert: {
          capture_id?: string | null
          created_at?: string
          id?: string
          report?: Json | null
          reservation_id: string
          status?: string
        }
        Update: {
          capture_id?: string | null
          created_at?: string
          id?: string
          report?: Json | null
          reservation_id?: string
          status?: string
        }
        Relationships: [
          {
            foreignKeyName: "checkins_capture_id_fkey"
            columns: ["capture_id"]
            isOneToOne: false
            referencedRelation: "captures"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "checkins_reservation_id_fkey"
            columns: ["reservation_id"]
            isOneToOne: false
            referencedRelation: "reservations"
            referencedColumns: ["id"]
          },
        ]
      }
      conversations: {
        Row: {
          created_at: string
          guest_id: string | null
          id: string
          kind: string
          listing_id: string
        }
        Insert: {
          created_at?: string
          guest_id?: string | null
          id?: string
          kind: string
          listing_id: string
        }
        Update: {
          created_at?: string
          guest_id?: string | null
          id?: string
          kind?: string
          listing_id?: string
        }
        Relationships: [
          {
            foreignKeyName: "conversations_guest_id_fkey"
            columns: ["guest_id"]
            isOneToOne: false
            referencedRelation: "profiles"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "conversations_listing_id_fkey"
            columns: ["listing_id"]
            isOneToOne: false
            referencedRelation: "listings"
            referencedColumns: ["id"]
          },
        ]
      }
      deal_messages: {
        Row: {
          actor: string
          amount_cents: number | null
          body: string
          created_at: string
          deal_id: string
          id: string
          terms: Json
          type: string
        }
        Insert: {
          actor: string
          amount_cents?: number | null
          body?: string
          created_at?: string
          deal_id: string
          id?: string
          terms?: Json
          type: string
        }
        Update: {
          actor?: string
          amount_cents?: number | null
          body?: string
          created_at?: string
          deal_id?: string
          id?: string
          terms?: Json
          type?: string
        }
        Relationships: [
          {
            foreignKeyName: "deal_messages_deal_id_fkey"
            columns: ["deal_id"]
            isOneToOne: false
            referencedRelation: "deals"
            referencedColumns: ["id"]
          },
        ]
      }
      deal_secrets: {
        Row: {
          deal_id: string
          guest_max_cents: number
          guest_target_cents: number | null
        }
        Insert: {
          deal_id: string
          guest_max_cents: number
          guest_target_cents?: number | null
        }
        Update: {
          deal_id?: string
          guest_max_cents?: number
          guest_target_cents?: number | null
        }
        Relationships: [
          {
            foreignKeyName: "deal_secrets_deal_id_fkey"
            columns: ["deal_id"]
            isOneToOne: true
            referencedRelation: "deals"
            referencedColumns: ["id"]
          },
        ]
      }
      deals: {
        Row: {
          check_in: string
          check_out: string
          created_at: string
          current_offer_cents: number | null
          final_terms: Json
          final_total_cents: number | null
          guest_id: string
          guests: number
          id: string
          list_total_cents: number
          listing_id: string
          rounds: number
          status: string
          updated_at: string
        }
        Insert: {
          check_in: string
          check_out: string
          created_at?: string
          current_offer_cents?: number | null
          final_terms?: Json
          final_total_cents?: number | null
          guest_id: string
          guests: number
          id?: string
          list_total_cents: number
          listing_id: string
          rounds?: number
          status?: string
          updated_at?: string
        }
        Update: {
          check_in?: string
          check_out?: string
          created_at?: string
          current_offer_cents?: number | null
          final_terms?: Json
          final_total_cents?: number | null
          guest_id?: string
          guests?: number
          id?: string
          list_total_cents?: number
          listing_id?: string
          rounds?: number
          status?: string
          updated_at?: string
        }
        Relationships: [
          {
            foreignKeyName: "deals_guest_id_fkey"
            columns: ["guest_id"]
            isOneToOne: false
            referencedRelation: "profiles"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "deals_listing_id_fkey"
            columns: ["listing_id"]
            isOneToOne: false
            referencedRelation: "listings"
            referencedColumns: ["id"]
          },
        ]
      }
      events: {
        Row: {
          action: string
          actor_name: string
          actor_type: string
          agent: string | null
          created_at: string
          deal_id: string | null
          id: number
          listing_id: string | null
          payload: Json
          summary: string
        }
        Insert: {
          action: string
          actor_name: string
          actor_type: string
          agent?: string | null
          created_at?: string
          deal_id?: string | null
          id?: never
          listing_id?: string | null
          payload?: Json
          summary: string
        }
        Update: {
          action?: string
          actor_name?: string
          actor_type?: string
          agent?: string | null
          created_at?: string
          deal_id?: string | null
          id?: never
          listing_id?: string | null
          payload?: Json
          summary?: string
        }
        Relationships: [
          {
            foreignKeyName: "events_deal_id_fkey"
            columns: ["deal_id"]
            isOneToOne: false
            referencedRelation: "deals"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "events_listing_id_fkey"
            columns: ["listing_id"]
            isOneToOne: false
            referencedRelation: "listings"
            referencedColumns: ["id"]
          },
        ]
      }
      floor_plans: {
        Row: {
          created_at: string
          doors: Json
          id: string
          rooms: Json
          scale_source: string | null
          status: string
          svg_url: string | null
          total_area_m2: number | null
          version: string
          walls: Json
          world_id: string
        }
        Insert: {
          created_at?: string
          doors?: Json
          id?: string
          rooms?: Json
          scale_source?: string | null
          status?: string
          svg_url?: string | null
          total_area_m2?: number | null
          version?: string
          walls?: Json
          world_id: string
        }
        Update: {
          created_at?: string
          doors?: Json
          id?: string
          rooms?: Json
          scale_source?: string | null
          status?: string
          svg_url?: string | null
          total_area_m2?: number | null
          version?: string
          walls?: Json
          world_id?: string
        }
        Relationships: [
          {
            foreignKeyName: "floor_plans_world_id_fkey"
            columns: ["world_id"]
            isOneToOne: false
            referencedRelation: "worlds"
            referencedColumns: ["id"]
          },
        ]
      }
      gaps: {
        Row: {
          created_at: string
          description: string
          filled_by_capture: string | null
          id: string
          issue: string
          position: Json | null
          radius_m: number
          room: string | null
          screenshot_url: string | null
          severity: number
          status: string
          view_dir: Json | null
          world_id: string
        }
        Insert: {
          created_at?: string
          description: string
          filled_by_capture?: string | null
          id?: string
          issue: string
          position?: Json | null
          radius_m?: number
          room?: string | null
          screenshot_url?: string | null
          severity: number
          status?: string
          view_dir?: Json | null
          world_id: string
        }
        Update: {
          created_at?: string
          description?: string
          filled_by_capture?: string | null
          id?: string
          issue?: string
          position?: Json | null
          radius_m?: number
          room?: string | null
          screenshot_url?: string | null
          severity?: number
          status?: string
          view_dir?: Json | null
          world_id?: string
        }
        Relationships: [
          {
            foreignKeyName: "gaps_filled_by_capture_fkey"
            columns: ["filled_by_capture"]
            isOneToOne: false
            referencedRelation: "captures"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "gaps_world_id_fkey"
            columns: ["world_id"]
            isOneToOne: false
            referencedRelation: "worlds"
            referencedColumns: ["id"]
          },
        ]
      }
      host_policies: {
        Row: {
          allowed_terms: Json
          auto_accept_total_cents: number | null
          floor_nightly_cents: number
          gap_night_pct: number
          listing_id: string
          long_stay_rules: Json
          max_discount_pct: number
          max_rounds: number
          negotiable: boolean
          updated_at: string
        }
        Insert: {
          allowed_terms?: Json
          auto_accept_total_cents?: number | null
          floor_nightly_cents: number
          gap_night_pct?: number
          listing_id: string
          long_stay_rules?: Json
          max_discount_pct?: number
          max_rounds?: number
          negotiable?: boolean
          updated_at?: string
        }
        Update: {
          allowed_terms?: Json
          auto_accept_total_cents?: number | null
          floor_nightly_cents?: number
          gap_night_pct?: number
          listing_id?: string
          long_stay_rules?: Json
          max_discount_pct?: number
          max_rounds?: number
          negotiable?: boolean
          updated_at?: string
        }
        Relationships: [
          {
            foreignKeyName: "host_policies_listing_id_fkey"
            columns: ["listing_id"]
            isOneToOne: true
            referencedRelation: "listings"
            referencedColumns: ["id"]
          },
        ]
      }
      listing_facts: {
        Row: {
          contradictions: Json
          created_at: string
          facts: Json
          listing_id: string
          missing_photos: Json
          model: string | null
        }
        Insert: {
          contradictions?: Json
          created_at?: string
          facts?: Json
          listing_id: string
          missing_photos?: Json
          model?: string | null
        }
        Update: {
          contradictions?: Json
          created_at?: string
          facts?: Json
          listing_id?: string
          missing_photos?: Json
          model?: string | null
        }
        Relationships: [
          {
            foreignKeyName: "listing_facts_listing_id_fkey"
            columns: ["listing_id"]
            isOneToOne: true
            referencedRelation: "listings"
            referencedColumns: ["id"]
          },
        ]
      }
      listing_photos: {
        Row: {
          created_at: string
          id: string
          listing_id: string
          room_label: string | null
          sort: number
          source: string
          url: string
        }
        Insert: {
          created_at?: string
          id?: string
          listing_id: string
          room_label?: string | null
          sort?: number
          source?: string
          url: string
        }
        Update: {
          created_at?: string
          id?: string
          listing_id?: string
          room_label?: string | null
          sort?: number
          source?: string
          url?: string
        }
        Relationships: [
          {
            foreignKeyName: "listing_photos_listing_id_fkey"
            columns: ["listing_id"]
            isOneToOne: false
            referencedRelation: "listings"
            referencedColumns: ["id"]
          },
        ]
      }
      listings: {
        Row: {
          amenities: Json
          base_price_cents: number
          baths: number
          bedrooms: number
          beds: number
          city: string
          cleaning_fee_cents: number
          created_at: string
          currency: string
          description: string
          host_id: string
          house_manual: string
          house_rules: Json
          id: string
          lat: number | null
          lng: number | null
          max_guests: number
          neighborhood: string | null
          property_type: string
          published_world_id: string | null
          rating: number | null
          review_count: number
          slug: string
          status: string
          title: string
          updated_at: string
          weekend_price_cents: number | null
        }
        Insert: {
          amenities?: Json
          base_price_cents: number
          baths?: number
          bedrooms?: number
          beds?: number
          city: string
          cleaning_fee_cents?: number
          created_at?: string
          currency?: string
          description?: string
          host_id: string
          house_manual?: string
          house_rules?: Json
          id?: string
          lat?: number | null
          lng?: number | null
          max_guests: number
          neighborhood?: string | null
          property_type?: string
          published_world_id?: string | null
          rating?: number | null
          review_count?: number
          slug: string
          status?: string
          title: string
          updated_at?: string
          weekend_price_cents?: number | null
        }
        Update: {
          amenities?: Json
          base_price_cents?: number
          baths?: number
          bedrooms?: number
          beds?: number
          city?: string
          cleaning_fee_cents?: number
          created_at?: string
          currency?: string
          description?: string
          host_id?: string
          house_manual?: string
          house_rules?: Json
          id?: string
          lat?: number | null
          lng?: number | null
          max_guests?: number
          neighborhood?: string | null
          property_type?: string
          published_world_id?: string | null
          rating?: number | null
          review_count?: number
          slug?: string
          status?: string
          title?: string
          updated_at?: string
          weekend_price_cents?: number | null
        }
        Relationships: [
          {
            foreignKeyName: "listings_host_id_fkey"
            columns: ["host_id"]
            isOneToOne: false
            referencedRelation: "profiles"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "listings_published_world_fk"
            columns: ["published_world_id"]
            isOneToOne: false
            referencedRelation: "worlds"
            referencedColumns: ["id"]
          },
        ]
      }
      messages: {
        Row: {
          actor: string
          answered_by: string | null
          body: string
          conversation_id: string
          created_at: string
          id: string
          needs_host: boolean
          sources: Json
        }
        Insert: {
          actor: string
          answered_by?: string | null
          body: string
          conversation_id: string
          created_at?: string
          id?: string
          needs_host?: boolean
          sources?: Json
        }
        Update: {
          actor?: string
          answered_by?: string | null
          body?: string
          conversation_id?: string
          created_at?: string
          id?: string
          needs_host?: boolean
          sources?: Json
        }
        Relationships: [
          {
            foreignKeyName: "messages_conversation_id_fkey"
            columns: ["conversation_id"]
            isOneToOne: false
            referencedRelation: "conversations"
            referencedColumns: ["id"]
          },
        ]
      }
      profiles: {
        Row: {
          avatar_url: string | null
          created_at: string
          id: string
          name: string
          role: string
        }
        Insert: {
          avatar_url?: string | null
          created_at?: string
          id?: string
          name: string
          role: string
        }
        Update: {
          avatar_url?: string | null
          created_at?: string
          id?: string
          name?: string
          role?: string
        }
        Relationships: []
      }
      reservations: {
        Row: {
          check_in: string
          check_out: string
          cleaning_cents: number
          created_at: string
          deal_id: string | null
          discount_cents: number
          guest_id: string
          guests: number
          id: string
          listing_id: string
          nightly_total_cents: number
          service_fee_cents: number
          status: string
          terms: Json
          total_cents: number
        }
        Insert: {
          check_in: string
          check_out: string
          cleaning_cents: number
          created_at?: string
          deal_id?: string | null
          discount_cents?: number
          guest_id: string
          guests: number
          id?: string
          listing_id: string
          nightly_total_cents: number
          service_fee_cents: number
          status?: string
          terms?: Json
          total_cents: number
        }
        Update: {
          check_in?: string
          check_out?: string
          cleaning_cents?: number
          created_at?: string
          deal_id?: string | null
          discount_cents?: number
          guest_id?: string
          guests?: number
          id?: string
          listing_id?: string
          nightly_total_cents?: number
          service_fee_cents?: number
          status?: string
          terms?: Json
          total_cents?: number
        }
        Relationships: [
          {
            foreignKeyName: "reservations_deal_id_fkey"
            columns: ["deal_id"]
            isOneToOne: false
            referencedRelation: "deals"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "reservations_guest_id_fkey"
            columns: ["guest_id"]
            isOneToOne: false
            referencedRelation: "profiles"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "reservations_listing_id_fkey"
            columns: ["listing_id"]
            isOneToOne: false
            referencedRelation: "listings"
            referencedColumns: ["id"]
          },
        ]
      }
      review_claims: {
        Row: {
          anchor_id: string | null
          claim: string
          id: string
          review_id: string
          room: string | null
          sentiment: string
        }
        Insert: {
          anchor_id?: string | null
          claim: string
          id?: string
          review_id: string
          room?: string | null
          sentiment: string
        }
        Update: {
          anchor_id?: string | null
          claim?: string
          id?: string
          review_id?: string
          room?: string | null
          sentiment?: string
        }
        Relationships: [
          {
            foreignKeyName: "review_claims_anchor_id_fkey"
            columns: ["anchor_id"]
            isOneToOne: false
            referencedRelation: "anchors"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "review_claims_review_id_fkey"
            columns: ["review_id"]
            isOneToOne: false
            referencedRelation: "reviews"
            referencedColumns: ["id"]
          },
        ]
      }
      reviews: {
        Row: {
          author_name: string | null
          body: string
          created_at: string
          guest_id: string | null
          id: string
          listing_id: string
          rating: number
          sub_ratings: Json
        }
        Insert: {
          author_name?: string | null
          body: string
          created_at?: string
          guest_id?: string | null
          id?: string
          listing_id: string
          rating: number
          sub_ratings?: Json
        }
        Update: {
          author_name?: string | null
          body?: string
          created_at?: string
          guest_id?: string | null
          id?: string
          listing_id?: string
          rating?: number
          sub_ratings?: Json
        }
        Relationships: [
          {
            foreignKeyName: "reviews_guest_id_fkey"
            columns: ["guest_id"]
            isOneToOne: false
            referencedRelation: "profiles"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "reviews_listing_id_fkey"
            columns: ["listing_id"]
            isOneToOne: false
            referencedRelation: "listings"
            referencedColumns: ["id"]
          },
        ]
      }
      trip_briefs: {
        Row: {
          body: string
          created_at: string
          guest_id: string | null
          id: string
          parsed: Json | null
          results: Json | null
        }
        Insert: {
          body: string
          created_at?: string
          guest_id?: string | null
          id?: string
          parsed?: Json | null
          results?: Json | null
        }
        Update: {
          body?: string
          created_at?: string
          guest_id?: string | null
          id?: string
          parsed?: Json | null
          results?: Json | null
        }
        Relationships: [
          {
            foreignKeyName: "trip_briefs_guest_id_fkey"
            columns: ["guest_id"]
            isOneToOne: false
            referencedRelation: "profiles"
            referencedColumns: ["id"]
          },
        ]
      }
      worlds: {
        Row: {
          caption: string | null
          collider_mesh_url: string | null
          cost_credits: number | null
          coverage_score: number | null
          created_at: string
          error: string | null
          ground_plane_offset: number | null
          hq_mesh_url: string | null
          id: string
          input_capture_ids: string[]
          input_kind: string | null
          listing_id: string
          marble_world_id: string | null
          metric_scale_factor: number | null
          model: string | null
          operation_id: string | null
          pano_url: string | null
          published_at: string | null
          ready_at: string | null
          spz_hq_url: string | null
          spz_url: string | null
          status: string
          thumbnail_url: string | null
          version: number
        }
        Insert: {
          caption?: string | null
          collider_mesh_url?: string | null
          cost_credits?: number | null
          coverage_score?: number | null
          created_at?: string
          error?: string | null
          ground_plane_offset?: number | null
          hq_mesh_url?: string | null
          id?: string
          input_capture_ids?: string[]
          input_kind?: string | null
          listing_id: string
          marble_world_id?: string | null
          metric_scale_factor?: number | null
          model?: string | null
          operation_id?: string | null
          pano_url?: string | null
          published_at?: string | null
          ready_at?: string | null
          spz_hq_url?: string | null
          spz_url?: string | null
          status?: string
          thumbnail_url?: string | null
          version: number
        }
        Update: {
          caption?: string | null
          collider_mesh_url?: string | null
          cost_credits?: number | null
          coverage_score?: number | null
          created_at?: string
          error?: string | null
          ground_plane_offset?: number | null
          hq_mesh_url?: string | null
          id?: string
          input_capture_ids?: string[]
          input_kind?: string | null
          listing_id?: string
          marble_world_id?: string | null
          metric_scale_factor?: number | null
          model?: string | null
          operation_id?: string | null
          pano_url?: string | null
          published_at?: string | null
          ready_at?: string | null
          spz_hq_url?: string | null
          spz_url?: string | null
          status?: string
          thumbnail_url?: string | null
          version?: number
        }
        Relationships: [
          {
            foreignKeyName: "worlds_listing_id_fkey"
            columns: ["listing_id"]
            isOneToOne: false
            referencedRelation: "listings"
            referencedColumns: ["id"]
          },
        ]
      }
    }
    Views: {
      [_ in never]: never
    }
    Functions: {
      [_ in never]: never
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
