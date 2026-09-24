export interface Printer {
  id: string;
  shop_id: string;
  name: string;
  type: 'mono' | 'color';
  status: 'online' | 'offline' | 'out-of-paper' | 'low-ink';
  system_name?: string;
  created_at?: string;
}

export interface ShopService {
  id: string;
  shop_id: string;
  name: string;
  description?: string;
  category: 'print' | 'binding' | 'finishing' | 'paper' | 'custom' | string;
  price: number | string;
  unit: 'page' | 'doc' | 'copy' | string;
  enabled: boolean;
  is_default: boolean;
  created_at?: string;
}

export interface Shop {
  id: string;
  name: string;
  location: string;
  address?: string;
  latitude?: number | string;
  longitude?: number | string;
  owner_name?: string;
  owner_phone?: string;
  owner_email?: string;
  opening_time?: string;
  closing_time?: string;
  working_days?: string;
  upi_id?: string;
  price_per_bw: number | string;
  price_per_color: number | string;
  spiral_price?: number | string;
  staple_price?: number | string;
  double_sided_discount?: number | string;
  custom_rates?: Record<string, any>;
  printers: Printer[];
  services?: ShopService[];
  nowServingToken?: string | null;
  totalWaiting?: number;
}

export interface PrintSettings {
  copies: number;
  color: boolean;
  duplex: boolean;
  paperSize: 'A4' | 'A3' | 'Letter';
}

export interface UploadedDocument {
  id: string;
  fileName: string;
  fileUrl: string;
  fileSize: number;
  pageCount: number;
  mimeType?: string;
  copies: number;
  color: boolean;
  duplex: boolean;
  pagesPerSheet: 1 | 2 | 4 | 6 | 9;
  paperSize?: 'A4' | 'A3' | 'Letter';
  combineImages?: boolean;
}

export interface User {
  id: string;
  phone: string;
  name: string;
}

export interface PrintJob {
  id: string;
  user_id: string;
  shop_id: string;
  printer_id?: string;
  file_url: string;
  file_name: string;
  file_size: number;
  page_count: number;
  settings: PrintSettings;
  status: 'created' | 'payment_pending' | 'waiting' | 'printing' | 'ready' | 'picked_up' | 'failed' | 'cancelled';
  token_number?: number;
  token_code?: string;
  price: number;
  razorpay_order_id?: string;
  razorpay_payment_id?: string;
  pickup_code?: string;
  error_message?: string;
  created_at: string;
  completed_at?: string;
  picked_up_at?: string;
  user_name?: string;
  user_phone?: string;
}

export interface QueueSnapshot {
  nowServingToken: string | null;
  totalWaiting: number;
  activeJobs: PrintJob[];
}
