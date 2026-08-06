export interface CSVRow {
  'PO Number': string;
  'Platform': string;
  'City': string;
  'Product': string;
  'PO Qty': string;
  'Tonnage': string;
  'Box Count': string;
  'MRP': string;
  'PO Value with Tax': string;
  'Invoice No': string;
  'DN amount': string;
  'Final Settlement': string;
  'Payment Overdue Alert': string;
  'Entity': string;
  'Transporter': string;
  'FacilityName': string;
  'Appointment Date(MM-DD-YYYY)': string;
  'Appointment ID': string;
  'PO Released Date(MM-DD-YYYY)': string;
  'DATE(MM-DD-YYYY)': string;
  'Expiry Date(MM-DD-YYYY)': string;
  'Actual Delivery Date(MM-DD-YYYY)': string;
  'Status': string;
  'RTO Reason': string;
  'RTO Tonnage (MT)': string;
  'RTO Value at Risk': string;
  'Delivered QTY': string;
  'Rejected Qty': string;
  'Dispatch Tonnage': string;
  'Transport Charge': string;
  'Unit Cost': string;
  'Remarks': string;
  'Invoice Value': string;
  'PO Aging': string;
  [key: string]: string;
}

export interface PO {
  poNumber: string;
  platform: string;
  city: string;
  product: string;
  poQty: number;
  tonnage: number;
  boxCount: number;
  mrp: number;
  poValueWithTax: number;
  invoiceNo: string;
  dnAmount: number;
  finalSettlement: number;
  paymentOverdueAlert: string;
  entity: string;
  transporter: string;
  facilityName: string;
  appointmentDate: Date | null;
  appointmentId: string;
  poReleasedDate: Date | null;
  date: Date | null;
  expiryDate: Date | null;
  actualDeliveryDate: Date | null;
  status: string;
  rtoReason: string;
  rtoTonnage: number;
  rtoValueAtRisk: number;
  deliveredQty: number;
  rejectedQty: number;
  dispatchTonnage: number;
  transportCharge: number;
  unitCost: number;
  remarks: string;
  invoiceValue: number;
  poAging: string;
}

export interface Metrics {
  totalOrders: number;
  totalTonnage: number;
  totalBoxes: number;
  totalValue: number;
  deliveredOrders: number;
  rtoOrders: number;
  deliveredTonnage: number;
  statusCounts: Record<string, number>;
  cities: number;
  avgFillRate: number;
}

export interface CityData {
  city: string;
  orders: number;
  tonnage: number;
  delivered: number;
  deliveredTonnage: number;
  value: number;
  poValues: Record<string, number>;
}

export interface StatusData {
  name: string;
  value: number;
}

export interface RecentOrder {
  'PO Number': string;
  City: string;
  Platform: string;
  Product: string;
  'PO Qty': string;
  Tonnage: string;
  'PO Value with Tax': string;
  'PO Released Date(MM-DD-YYYY)': string;
  'Appointment Date(MM-DD-YYYY)': string;
  'Appointment ID': string;
  Status: string;
}

export interface PlatformPerformance {
  platform: string;
  orders: number;
  delivered: number;
  rto: number;
  tonnage: number;
  value: number;
}

export interface MonthData {
  key: string;
  label: string;
  orders: number;
  tonnage: number;
  boxes: number;
  value: number;
  delivered: number;
  rto: number;
  cities: number;
  platforms: Array<{ name: string; orders: number }>;
  platformValues: Record<string, number>;
  platformLabel: string;
  deliveryRate: number | null;
}

export interface OpenMetrics {
  orders: number;
  value: number;
  tonnage: number;
  boxes: number;
  fillRate: number | null;
}

export interface PeriodDeltas {
  orders: number | null;
  value: number | null;
  tonnage: number | null;
  boxes: number | null;
  fillRate: number | null;
}

export interface Insight {
  type: 'good' | 'warn' | 'danger';
  text: string;
}

export interface DrillFilter {
  city: string | null;
  status: string | null;
}

export interface SearchResult {
  orders: number;
  tonnage: number;
  value: number;
  delivered: number;
}

export interface TransporterData {
  carrier: string;
  totalPO: number;
  delivered: number;
  rto: number;
  inTransit: number;
  tonnage: number;
  totalValue: number;
  transportCharge: number;
  costPerKg: number;
}

export interface RTOMetrics {
  totalRTO: number;
  rtoRate: number;
  tonnageLost: number;
  valueLost: number;
}

export interface CityRTO {
  city: string;
  rto: number;
  tonnage: number;
  value: number;
}

export interface PlatformRTO {
  platform: string;
  rto: number;
  tonnage: number;
  value: number;
  reasons: Record<string, number>;
}

export interface RTOReason {
  reason: string;
  count: number;
  tonnage: number;
  value: number;
}

export interface FinanceMetrics {
  totalPOValue: number;
  avgOrderValue: number;
  totalDN: number;
  totalFS: number;
  pendingSettlement: number;
  overdueCount: number;
  overduePOs: string[];
  invoiceCount: number;
  totalOrders: number;
  entityWise: EntityFinance[];
}

export interface EntityFinance {
  entity: string;
  orders: number;
  invoices: number;
  poValue: number;
  dn: number;
  fs: number;
  overdueCount: number;
}

export interface PerformanceAnalysis {
  pocMap: Record<string, { platform: string; count: number; aging: Record<string, number> }>;
  transportData: TransportData[];
  leadData: LeadTimeData[];
  fillData: FillRateData[];
  rtoData: RTOReason[];
  cityFillData: CityFillData[];
  overallBooking: number | null;
  overallDelivery: number | null;
  overallFillRate: number | null;
  overallCostPerKG: number | null;
}

export interface TransportData {
  transporter: string;
  charge: number;
  tonnage: number;
  value: number;
  count: number;
  costPerKG: number;
  costPct: number;
}

export interface LeadTimeData {
  platform: string;
  avgBooking: number | '—';
  avgDelivery: number | '—';
  avgTotal: number | '—';
  samples: number;
}

export interface FillRateData {
  product: string;
  avgFinal: number;
  gap: number;
  samples: number;
  tonnage: number;
}

export interface CityFillData {
  city: string;
  avgFinal: number | null;
  samples: number;
}

export interface WoWCityData {
  city: string;
  currOrders: number;
  prevOrders: number;
  currValue: number;
  prevValue: number;
  currTonnage: number;
  prevTonnage: number;
}

export type TabName = 
  | 'dashboard' 
  | 'orders' 
  | 'inventory' 
  | 'logistics' 
  | 'dispatch' 
  | 'reports' 
  | 'rto' 
  | 'finance' 
  | 'performance' 
  | 'settings';

export interface TabProps {
  data: CSVRow[];
  uniqueData?: CSVRow[];
  metrics?: Metrics;
  cityData?: CityData[];
  statusData?: StatusData[];
  recentOrders?: RecentOrder[];
  platformFilter?: string;
  onOpenPO?: (row: CSVRow) => void;
}

export interface UserContextValue {
  userEmail: string;
  setUserEmail: (email: string) => void;
}

export interface DataTableColumn<T> {
  key: string;
  label: string;
  accessor: (row: T) => unknown;
  render?: (row: T, index: number) => React.ReactNode;
  align?: 'left' | 'right' | 'center';
  filterable?: boolean;
}

export interface StatCardProps {
  label: string;
  icon: string;
  color?: string;
  value: string | number;
  valueColor?: string;
  change?: string | React.ReactNode;
  changeColor?: string;
  delta?: number | null;
  deltaTitle?: string;
  tooltip?: React.ReactNode;
  tooltipStyle?: React.CSSProperties;
  style?: React.CSSProperties;
}