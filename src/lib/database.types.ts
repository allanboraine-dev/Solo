export type Json =
  | string
  | number
  | boolean
  | null
  | { [key: string]: Json | undefined }
  | Json[]

export interface Database {
  public: {
    Tables: {
      profiles: {
        Row: {
          id: string
          full_name: string
          phone: string | null
          user_type: 'driver' | 'rider' | 'corp_admin'
          created_at: string | null
        }
        Insert: {
          id: string
          full_name: string
          phone?: string | null
          user_type: 'driver' | 'rider' | 'corp_admin'
          created_at?: string | null
        }
        Update: {
          id?: string
          full_name?: string
          phone?: string | null
          user_type?: 'driver' | 'rider' | 'corp_admin'
          created_at?: string | null
        }
        Relationships: []
      }
      driver_profiles: {
        Row: {
          id: string
          vehicle_model: string | null
          license_plate: string | null
          prdp_number: string | null
          is_verified: boolean | null
          is_online: boolean | null
          current_lat: number | null
          current_lng: number | null
          subscription_status: 'active' | 'trial' | 'expired' | null
          subscription_expires_at: string | null
          created_at: string | null
          updated_at: string | null
        }
        Insert: {
          id: string
          vehicle_model?: string | null
          license_plate?: string | null
          prdp_number?: string | null
          is_verified?: boolean | null
          is_online?: boolean | null
          current_lat?: number | null
          current_lng?: number | null
          subscription_status?: 'active' | 'trial' | 'expired' | null
          subscription_expires_at?: string | null
          created_at?: string | null
          updated_at?: string | null
        }
        Update: {
          id?: string
          vehicle_model?: string | null
          license_plate?: string | null
          prdp_number?: string | null
          is_verified?: boolean | null
          is_online?: boolean | null
          current_lat?: number | null
          current_lng?: number | null
          subscription_status?: 'active' | 'trial' | 'expired' | null
          subscription_expires_at?: string | null
          created_at?: string | null
          updated_at?: string | null
        }
        Relationships: []
      }
      corporate_accounts: {
        Row: {
          id: string
          company_name: string
          contact_email: string
          wallet_balance: number | null
          management_fee_rate: number | null
          created_at: string | null
        }
        Insert: {
          id?: string
          company_name: string
          contact_email: string
          wallet_balance?: number | null
          management_fee_rate?: number | null
          created_at?: string | null
        }
        Update: {
          id?: string
          company_name?: string
          contact_email?: string
          wallet_balance?: number | null
          management_fee_rate?: number | null
          created_at?: string | null
        }
        Relationships: []
      }
      trips: {
        Row: {
          id: string
          rider_id: string
          driver_id: string | null
          corp_account_id: string | null
          pickup_location: string
          pickup_lat: number
          pickup_lng: number
          dropoff_location: string
          dropoff_lat: number
          dropoff_lng: number
          fare_amount: number
          status: 'requested' | 'accepted' | 'in_progress' | 'completed' | 'cancelled' | null
          trip_type: 'standard' | 'corporate' | null
          created_at: string | null
          updated_at: string | null
        }
        Insert: {
          id?: string
          rider_id: string
          driver_id?: string | null
          corp_account_id?: string | null
          pickup_location: string
          pickup_lat: number
          pickup_lng: number
          dropoff_location: string
          dropoff_lat: number
          dropoff_lng: number
          fare_amount: number
          status?: 'requested' | 'accepted' | 'in_progress' | 'completed' | 'cancelled' | null
          trip_type?: 'standard' | 'corporate' | null
          created_at?: string | null
          updated_at?: string | null
        }
        Update: {
          id?: string
          rider_id?: string
          driver_id?: string | null
          corp_account_id?: string | null
          pickup_location?: string
          pickup_lat?: number
          pickup_lng?: number
          dropoff_location?: string
          dropoff_lat?: number
          dropoff_lng?: number
          fare_amount?: number
          status?: 'requested' | 'accepted' | 'in_progress' | 'completed' | 'cancelled' | null
          trip_type?: 'standard' | 'corporate' | null
          created_at?: string | null
          updated_at?: string | null
        }
        Relationships: []
      }
    }
    Views: { [_ in never]: never }
    Functions: { [_ in never]: never }
  }
}
