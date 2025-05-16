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
      winners: {
        Row: {
          id: number
          token_id: string
          winner_address: string
          amount: string
          url: string | null
          display_name: string | null
          farcaster_username: string | null
          basename: string | null
          usd_value: number | null
          is_v1_auction: boolean | null
          ens_name: string | null
          pfp_url: string | null
          created_at: string | null
        }
        Insert: {
          id?: number
          token_id: string
          winner_address: string
          amount: string
          url?: string | null
          display_name?: string | null
          farcaster_username?: string | null
          basename?: string | null
          usd_value?: number | null
          is_v1_auction?: boolean | null
          ens_name?: string | null
          pfp_url?: string | null
          created_at?: string | null
        }
        Update: {
          id?: number
          token_id?: string
          winner_address?: string
          amount?: string
          url?: string | null
          display_name?: string | null
          farcaster_username?: string | null
          basename?: string | null
          usd_value?: number | null
          is_v1_auction?: boolean | null
          ens_name?: string | null
          pfp_url?: string | null
          created_at?: string | null
        }
      }
      link_visit_claims: {
        Row: {
          id: number
          fid: number
          eth_address: string
          auction_id: number
          winning_url: string
          link_visited_at: string | null
          claimed_at: string | null
          shared_at: string | null
          amount: number
          tx_hash: string | null
          success: boolean | null
          username: string | null
        }
        Insert: {
          id?: number
          fid: number
          eth_address: string
          auction_id: number
          winning_url: string
          link_visited_at?: string | null
          claimed_at?: string | null
          shared_at?: string | null
          amount?: number
          tx_hash?: string | null
          success?: boolean | null
          username?: string | null
        }
        Update: {
          id?: number
          fid?: number
          eth_address?: string
          auction_id?: number
          winning_url?: string
          link_visited_at?: string | null
          claimed_at?: string | null
          shared_at?: string | null
          amount?: number
          tx_hash?: string | null
          success?: boolean | null
          username?: string | null
        }
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