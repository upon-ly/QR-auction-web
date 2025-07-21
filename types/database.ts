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
          twitter_username: string | null
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
          twitter_username?: string | null
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
          twitter_username?: string | null
          basename?: string | null
          usd_value?: number | null
          is_v1_auction?: boolean | null
          ens_name?: string | null
          pfp_url?: string | null
          created_at?: string | null
        }
      }
      auction_image_overrides: {
        Row: {
          id: number
          auction_id: number
          image_url: string
          is_video: boolean
          created_at: string
          updated_at: string
        }
        Insert: {
          id?: number
          auction_id: number
          image_url: string
          is_video?: boolean
          created_at?: string
          updated_at?: string
        }
        Update: {
          id?: number
          auction_id?: number
          image_url?: string
          is_video?: boolean
          created_at?: string
          updated_at?: string
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
      likes_recasts_claims: {
        Row: {
          id: number
          fid: number
          eth_address: string
          option_type: 'likes' | 'both' | 'recasts'
          amount: number
          tx_hash: string | null
          success: boolean | null
          username: string | null
          signer_uuid: string | null
          created_at: string
          updated_at: string
        }
        Insert: {
          id?: number
          fid: number
          eth_address: string
          option_type: 'likes' | 'both' | 'recasts'
          amount: number
          tx_hash?: string | null
          success?: boolean | null
          username?: string | null
          signer_uuid?: string | null
          created_at?: string
          updated_at?: string
        }
        Update: {
          id?: number
          fid?: number
          eth_address?: string
          option_type?: 'likes' | 'both' | 'recasts'
          amount?: number
          tx_hash?: string | null
          success?: boolean | null
          username?: string | null
          signer_uuid?: string | null
          created_at?: string
          updated_at?: string
        }
      }
      neynar_signers_updated: {
        Row: {
          id: number
          fid: number
          signer_uuid: string
          public_key: string | null
          status: string
          permissions: string[]
          signer_approval_url: string | null
          username: string | null
          approved_at: string | null
          created_at: string
          updated_at: string
        }
        Insert: {
          id?: number
          fid: number
          signer_uuid: string
          public_key?: string | null
          status?: string
          permissions?: string[]
          signer_approval_url?: string | null
          username?: string | null
          approved_at?: string | null
          created_at?: string
          updated_at?: string
        }
        Update: {
          id?: number
          fid?: number
          signer_uuid?: string
          public_key?: string | null
          status?: string
          permissions?: string[]
          signer_approval_url?: string | null
          username?: string | null
          approved_at?: string | null
          created_at?: string
          updated_at?: string
        }
      }
      likes_recasts_claim_failures: {
        Row: {
          id: number
          fid: number
          eth_address: string
          username: string | null
          option_type: string | null
          error_message: string
          error_code: string | null
          tx_hash: string | null
          request_data: Json | null
          gas_price: string | null
          gas_limit: number | null
          network_status: string | null
          retry_count: number
          created_at: string
          updated_at: string
        }
        Insert: {
          id?: number
          fid: number
          eth_address: string
          username?: string | null
          option_type?: string | null
          error_message: string
          error_code?: string | null
          tx_hash?: string | null
          request_data?: Json | null
          gas_price?: string | null
          gas_limit?: number | null
          network_status?: string | null
          retry_count?: number
          created_at?: string
          updated_at?: string
        }
        Update: {
          id?: number
          fid?: number
          eth_address?: string
          username?: string | null
          option_type?: string | null
          error_message?: string
          error_code?: string | null
          tx_hash?: string | null
          request_data?: Json | null
          gas_price?: string | null
          gas_limit?: number | null
          network_status?: string | null
          retry_count?: number
          created_at?: string
          updated_at?: string
        }
      }
      auto_engagement_logs: {
        Row: {
          id: number
          cast_hash: string
          cast_url: string | null
          total_signers: number
          successful: number
          failed: number
          errors: string[] | null
          processed_at: string
        }
        Insert: {
          id?: number
          cast_hash: string
          cast_url?: string | null
          total_signers: number
          successful: number
          failed: number
          errors?: string[] | null
          processed_at?: string
        }
        Update: {
          id?: number
          cast_hash?: string
          cast_url?: string | null
          total_signers?: number
          successful?: number
          failed?: number
          errors?: string[] | null
          processed_at?: string
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