export type Json =
  | string
  | number
  | boolean
  | null
  | { [key: string]: Json | undefined }
  | Json[]

export type UserType = 'driver' | 'rider' | 'corp_admin' | 'fleet_owner' | 'admin'
export type SubscriptionStatus = 'trial' | 'active' | 'past_due' | 'expired' | 'cancelled'
export type TripStatus = 'requested' | 'accepted' | 'arrived' | 'in_progress' | 'payment_pending' | 'completed' | 'cancelled'
export type DocumentType = 'license_front' | 'license_back' | 'prdp' | 'roadworthy' | 'vehicle_photo'
export type DocumentStatus = 'pending' | 'approved' | 'rejected'
export type PaymentMethod = 'cash' | 'card' | 'in_app'
export type PaymentStatus = 'pending' | 'paid' | 'failed'

export interface Database {
  public: {
    Tables: {
      profiles: {
        Row: {
          id: string
          full_name: string
          phone: string | null
          avatar_url: string | null
          user_type: UserType
          created_at: string
          updated_at: string
        }
        Insert: {
          id: string
          full_name: string
          phone?: string | null
          avatar_url?: string | null
          user_type?: UserType
          created_at?: string
          updated_at?: string
        }
        Update: {
          id?: string
          full_name?: string
          phone?: string | null
          avatar_url?: string | null
          user_type?: UserType
          created_at?: string
          updated_at?: string
        }
        Relationships: []
      }
      driver_profiles: {
        Row: {
          id: string
          vehicle_make: string | null
          vehicle_model: string | null
          vehicle_year: number | null
          vehicle_color: string | null
          license_plate: string | null
          prdp_number: string | null
          is_verified: boolean
          is_online: boolean
          current_lat: number | null
          current_lng: number | null
          subscription_status: SubscriptionStatus
          subscription_plan: string | null
          subscription_expires_at: string | null
          trial_started_at: string | null
          rating_avg: number
          rating_count: number
          verification_notes: string | null
          created_at: string
          updated_at: string
        }
        Insert: {
          id: string
          vehicle_make?: string | null
          vehicle_model?: string | null
          vehicle_year?: number | null
          vehicle_color?: string | null
          license_plate?: string | null
          prdp_number?: string | null
          is_verified?: boolean
          is_online?: boolean
          current_lat?: number | null
          current_lng?: number | null
          subscription_status?: SubscriptionStatus
          subscription_plan?: string | null
          subscription_expires_at?: string | null
          trial_started_at?: string | null
          rating_avg?: number
          rating_count?: number
          verification_notes?: string | null
          created_at?: string
          updated_at?: string
        }
        Update: {
          id?: string
          vehicle_make?: string | null
          vehicle_model?: string | null
          vehicle_year?: number | null
          vehicle_color?: string | null
          license_plate?: string | null
          prdp_number?: string | null
          is_verified?: boolean
          is_online?: boolean
          current_lat?: number | null
          current_lng?: number | null
          subscription_status?: SubscriptionStatus
          subscription_plan?: string | null
          subscription_expires_at?: string | null
          trial_started_at?: string | null
          rating_avg?: number
          rating_count?: number
          verification_notes?: string | null
          created_at?: string
          updated_at?: string
        }
        Relationships: [
          {
            foreignKeyName: "driver_profiles_id_fkey"
            columns: ["id"]
            referencedRelation: "profiles"
            referencedColumns: ["id"]
          }
        ]
      }
      driver_documents: {
        Row: {
          id: string
          driver_id: string
          doc_type: DocumentType
          file_path: string
          status: DocumentStatus
          rejection_reason: string | null
          reviewed_by: string | null
          reviewed_at: string | null
          created_at: string
          updated_at: string
        }
        Insert: {
          id?: string
          driver_id: string
          doc_type: DocumentType
          file_path: string
          status?: DocumentStatus
          rejection_reason?: string | null
          reviewed_by?: string | null
          reviewed_at?: string | null
          created_at?: string
          updated_at?: string
        }
        Update: {
          id?: string
          driver_id?: string
          doc_type?: DocumentType
          file_path?: string
          status?: DocumentStatus
          rejection_reason?: string | null
          reviewed_by?: string | null
          reviewed_at?: string | null
          created_at?: string
          updated_at?: string
        }
        Relationships: [
          {
            foreignKeyName: "driver_documents_driver_id_fkey"
            columns: ["driver_id"]
            referencedRelation: "driver_profiles"
            referencedColumns: ["id"]
          }
        ]
      }
      trips: {
        Row: {
          id: string
          rider_id: string
          driver_id: string | null
          pickup_location: string
          pickup_lat: number
          pickup_lng: number
          dropoff_location: string
          dropoff_lat: number
          dropoff_lng: number
          fare_amount: number
          status: TripStatus
          verification_pin: string
          scheduled_time: string | null
          payment_method: PaymentMethod
          payment_status: PaymentStatus
          cancelled_by: string | null
          cancellation_reason: string | null
          completed_at: string | null
          created_at: string
          updated_at: string
        }
        Insert: {
          id?: string
          rider_id: string
          driver_id?: string | null
          pickup_location: string
          pickup_lat: number
          pickup_lng: number
          dropoff_location: string
          dropoff_lat: number
          dropoff_lng: number
          fare_amount: number
          status?: TripStatus
          verification_pin?: string
          scheduled_time?: string | null
          payment_method?: PaymentMethod
          payment_status?: PaymentStatus
          cancelled_by?: string | null
          cancellation_reason?: string | null
          completed_at?: string | null
          created_at?: string
          updated_at?: string
        }
        Update: {
          id?: string
          rider_id?: string
          driver_id?: string | null
          pickup_location?: string
          pickup_lat?: number
          pickup_lng?: number
          dropoff_location?: string
          dropoff_lat?: number
          dropoff_lng?: number
          fare_amount?: number
          status?: TripStatus
          verification_pin?: string
          scheduled_time?: string | null
          payment_method?: PaymentMethod
          payment_status?: PaymentStatus
          cancelled_by?: string | null
          cancellation_reason?: string | null
          completed_at?: string | null
          created_at?: string
          updated_at?: string
        }
        Relationships: [
          {
            foreignKeyName: "trips_rider_id_fkey"
            columns: ["rider_id"]
            referencedRelation: "profiles"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "trips_driver_id_fkey"
            columns: ["driver_id"]
            referencedRelation: "driver_profiles"
            referencedColumns: ["id"]
          }
        ]
      }
      trip_messages: {
        Row: {
          id: string
          trip_id: string
          sender_id: string
          sender_role: 'rider' | 'driver'
          content: string
          read_at: string | null
          created_at: string
        }
        Insert: {
          id?: string
          trip_id: string
          sender_id: string
          sender_role: 'rider' | 'driver'
          content: string
          read_at?: string | null
          created_at?: string
        }
        Update: {
          id?: string
          trip_id?: string
          sender_id?: string
          sender_role?: 'rider' | 'driver'
          content?: string
          read_at?: string | null
          created_at?: string
        }
        Relationships: [
          {
            foreignKeyName: "trip_messages_trip_id_fkey"
            columns: ["trip_id"]
            referencedRelation: "trips"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "trip_messages_sender_id_fkey"
            columns: ["sender_id"]
            referencedRelation: "profiles"
            referencedColumns: ["id"]
          }
        ]
      }
      trip_ratings: {
        Row: {
          id: string
          trip_id: string
          driver_id: string
          rider_id: string
          stars: number
          tags: string[]
          comment: string | null
          created_at: string
        }
        Insert: {
          id?: string
          trip_id: string
          driver_id: string
          rider_id: string
          stars: number
          tags?: string[]
          comment?: string | null
          created_at?: string
        }
        Update: {
          id?: string
          trip_id?: string
          driver_id?: string
          rider_id?: string
          stars?: number
          tags?: string[]
          comment?: string | null
          created_at?: string
        }
        Relationships: [
          {
            foreignKeyName: "trip_ratings_trip_id_fkey"
            columns: ["trip_id"]
            referencedRelation: "trips"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "trip_ratings_driver_id_fkey"
            columns: ["driver_id"]
            referencedRelation: "driver_profiles"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "trip_ratings_rider_id_fkey"
            columns: ["rider_id"]
            referencedRelation: "profiles"
            referencedColumns: ["id"]
          }
        ]
      }
    }
    Views: { [_ in never]: never }
    Functions: {
      accept_trip: {
        Args: { p_trip_id: string }
        Returns: Json
      }
      start_trip: {
        Args: { p_trip_id: string; p_pin: string }
        Returns: Json
      }
      complete_trip: {
        Args: { p_trip_id: string; p_payment_method?: string }
        Returns: Json
      }
      get_nearby_drivers: {
        Args: { p_lat: number; p_lng: number; p_radius_meters?: number }
        Returns: {
          id: string
          full_name: string
          vehicle_make: string | null
          vehicle_model: string | null
          license_plate: string | null
          current_lat: number
          current_lng: number
          rating_avg: number
          rating_count: number
          distance_km: number
        }[]
      }
      get_nearby_requested_trips: {
        Args: { p_lat: number; p_lng: number; p_radius_meters?: number }
        Returns: {
          id: string
          rider_id: string
          rider_name: string
          pickup_location: string
          pickup_lat: number
          pickup_lng: number
          dropoff_location: string
          dropoff_lat: number
          dropoff_lng: number
          fare_amount: number
          status: string
          scheduled_time: string | null
          distance_km: number
          created_at: string
        }[]
      }
    }
  }
}
